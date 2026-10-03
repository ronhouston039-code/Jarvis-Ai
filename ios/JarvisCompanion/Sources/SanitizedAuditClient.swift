import Foundation
import Combine

struct SanitizedAudit: Codable {
    let deviceName: String
    let actionType: String
    let state: String
    let timestamp: String
    let message: String
}
@MainActor final class SanitizedAuditClient: ObservableObject {
    @Published private(set) var status="No activity shared yet."
    private let session:CloudSession
    private var queue:[QueuedAudit]=[]
    private var flushing=false
    private let file:URL
    private struct QueuedAudit:Codable {let id:UUID;let userID:String;let event:SanitizedAudit}
    init(session:CloudSession) {
        self.session=session
        let directory=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0]
        try? FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        file=directory.appendingPathComponent("sanitized-home-audits.json")
        if let data=try? Data(contentsOf:file),let saved=try? JSONDecoder().decode([QueuedAudit].self,from:data) {queue=Array(saved.suffix(100))}
    }
    static func friendly(_ value:String,max:Int)->String {
        let privatePattern="https?://\\S+|\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b|\\b[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\\b|\\b\\d{3}-\\d{2}-\\d{3}\\b|[\\x00-\\x1f]|(?:[0-9a-fA-F]{0,4}:){2,}[0-9a-fA-F]{0,4}"
        let clean=value.replacingOccurrences(of:privatePattern,with:"",options:.regularExpression).trimmingCharacters(in:.whitespacesAndNewlines)
        return String((clean.isEmpty ? "Home accessory":clean).prefix(max))
    }
    func record(deviceName:String,actionType:String,state:String,message:String) {
        // An unsigned local action is not later uploaded under an unrelated account.
        guard let userID=session.userID else {status="Completed locally. Sign in before future actions to share sanitized activity.";return}
        let event=SanitizedAudit(deviceName:Self.friendly(deviceName,max:100),actionType:actionType,state:state,timestamp:ISO8601DateFormatter().string(from:Date()),message:Self.friendly(message,max:240))
        queue.append(QueuedAudit(id:UUID(),userID:userID,event:event));queue=Array(queue.suffix(100));save()
        Task {await flush()}
    }
    private func save() {
        guard let data=try? JSONEncoder().encode(queue) else {status="Could not save the audit queue.";return}
        do {try data.write(to:file,options:[.atomic,.completeFileProtection]);var url=file;var values=URLResourceValues();values.isExcludedFromBackup=true;try url.setResourceValues(values)} catch {status="Could not securely save the audit queue."}
    }
    func flush() async {
        guard !flushing,let userID=session.userID else {return};flushing=true;defer{flushing=false}
        queue.removeAll { ISO8601DateFormatter().date(from:$0.event.timestamp).map{Date().timeIntervalSince($0)>7*86400} ?? true }
        while session.userID==userID,let entry=queue.first(where:{$0.userID==userID}) {
            do {_ = try await session.request(path:"api/homekit/audit",body:JSONEncoder().encode(entry.event),idempotencyKey:entry.id);queue.removeAll{$0.id==entry.id};save();status="Sanitized activity delivered to Jarvis."}
            catch {status="Activity queued locally. Cloud delivery failed; device actions will not be retried.";break}
        }
        save()
    }
    func clear() {queue=[];save();status="Local audit queue cleared."}
}
