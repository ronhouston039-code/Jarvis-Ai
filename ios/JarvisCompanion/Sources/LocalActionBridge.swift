import Foundation
import Combine

@MainActor final class LocalActionBridge:ObservableObject {
    @Published private(set) var enabled=false
    @Published private(set) var status="Chat handoff is off. HomeKit control remains local."
    private var bindings:[LocalActionBinding]=[]
    private let session:CloudSession
    private let home:any HomeKitProvider
    private var owner:String?
    private var polling=false
    init(session:CloudSession,home:any HomeKitProvider) {self.session=session;self.home=home}
    func shareApprovedActions() async {
        guard home.connected,let userID=session.userID else {status="Connect Apple Home and sign in before enabling handoff.";return}
        // Fixed actions only. Arbitrary model parameters never enter HomeKit.
        var proposed:[LocalActionBinding]=[]
        for accessory in home.accessories where home.approvedAccessories.contains(accessory.id) && !accessory.inherentlySensitive {
            proposed.append(.init(id:UUID(),accessoryID:accessory.id,serviceID:nil,deviceName:accessory.name,actionType:"read_status",label:"Read status"))
            for service in accessory.services where [.light,.switch,.fan,.fanV2].contains(service.kind) {
                let characteristic=service.kind == .fanV2 ? CharacteristicID.active:CharacteristicID.power
                guard service.writable.contains(characteristic) else {continue}
                for on in [true,false] {proposed.append(.init(id:UUID(),accessoryID:accessory.id,serviceID:service.id,deviceName:accessory.name,actionType:on ? "power_on":"power_off",label:on ? "Turn on":"Turn off"))}
            }
        }
        for scene in home.scenes where home.approvedScenes.contains(scene.id) {proposed.append(.init(id:UUID(),accessoryID:scene.id,serviceID:nil,deviceName:scene.name,actionType:"scene",label:"Run scene (native confirmation)"))}
        guard proposed.count<=100 else {status="Select fewer accessories for chat handoff.";return}
        let manifest:[String:Any]=["actions":proposed.map{["actionId":$0.id.uuidString,"deviceName":SanitizedAuditClient.friendly($0.deviceName,max:100),"actionType":$0.actionType,"label":$0.label]}]
        do {_ = try await session.request(path:"api/homekit/actions",body:JSONSerialization.data(withJSONObject:manifest));bindings=proposed;owner=userID;enabled=true;status="Handoff enabled while this app is open. Only these exact local actions may run."}
        catch {status="Could not register local actions. Handoff remains disabled.";enabled=false;bindings=[]}
    }
    func stop() async {
        enabled=false;bindings=[];owner=nil
        do {_ = try await session.request(path:"api/homekit/actions",body:Data("{\"actions\":[]}".utf8));status="Chat handoff disabled."}
        catch {status="Stopped locally. Cloud registration could not be cleared; outstanding requests will expire without execution."}
    }
    func poll() async {
        guard enabled,!polling,owner==session.userID,home.connected,!home.busy,home.pending==nil else {return}
        polling=true;defer{polling=false}
        do {
            let data=try await session.request(path:"api/homekit/poll",body:Data("{}".utf8))
            guard let object=try JSONSerialization.jsonObject(with:data) as? [String:Any],let request=object["request"] as? [String:String],let id=request["actionId"].flatMap(UUID.init(uuidString:)),let expiry=request["expiresAt"],let date=ISO8601DateFormatter.fractional.date(from:expiry),date>Date(),let binding=bindings.first(where:{$0.id==id}),let action=binding.action else {return}
            // HomeKitStore re-checks permission, current local selection, supported service, and confirmation policy.
            guard !Task.isCancelled, enabled, owner == session.userID, home.connected else {return}
            home.request(action,accessoryID:binding.accessoryID,serviceID:binding.serviceID)
            status="Local request received. Check Apple Home status and the activity log for the outcome."
        } catch {status="Cloud handoff unavailable. Local controls still work."}
    }
}
extension ISO8601DateFormatter {static var fractional:ISO8601DateFormatter {let formatter=ISO8601DateFormatter();formatter.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return formatter}}
