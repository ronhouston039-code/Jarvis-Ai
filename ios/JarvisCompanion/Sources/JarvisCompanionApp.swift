import SwiftUI

@main struct JarvisCompanionApp:App {
    @StateObject private var session:CloudSession
    @StateObject private var audit:SanitizedAuditClient
    @StateObject private var home:HomeKitStore
    @StateObject private var bridge:LocalActionBridge
    init() {
        let url=URL(string:Bundle.main.object(forInfoDictionaryKey:"JarvisBackendURL") as! String)!
        let session=CloudSession(baseURL:url);let audit=SanitizedAuditClient(session:session);let home=HomeKitStore(audit:audit)
        _session=StateObject(wrappedValue:session);_audit=StateObject(wrappedValue:audit);_home=StateObject(wrappedValue:home);_bridge=StateObject(wrappedValue:LocalActionBridge(session:session,home:home))
    }
    var body:some Scene {WindowGroup {ContentView().environmentObject(session).environmentObject(audit).environmentObject(home).environmentObject(bridge)}}
}
struct ContentView:View {
    @EnvironmentObject var session:CloudSession
    @EnvironmentObject var audit:SanitizedAuditClient
    @EnvironmentObject var home:HomeKitStore
    @EnvironmentObject var bridge:LocalActionBridge
    @Environment(\.scenePhase) private var phase
    var body:some View {
        TabView {
            NavigationStack {List {
                Section("Jarvis cloud dashboard") {Link("Open chat, memory and activity log",destination:session.baseURL.appendingPathComponent("home"));Text("AI chat stays in your existing web dashboard. Apple Home controls run on this iPhone.")}
                Section("Cloud activity and chat handoff") {Text(session.status);if session.signedIn {Button("Sign out") {Task {await bridge.stop();await session.signOut()}}} else {Button("Sign in to Jarvis") {session.signIn()}};Text(audit.status);Button("Retry audit delivery") {Task {await audit.flush()}}}
                Section("Local-action handoff") {Text(bridge.status);if home.pending != nil {NavigationLink("Review pending native confirmation") {AppleHomeView()}};Button("Share approved names and actions with chat") {Task {await bridge.shareApprovedActions()}}.disabled(!home.connected || session.userID==nil);Button("Disable handoff") {Task {await bridge.stop()}}.disabled(!bridge.enabled);Text("Shares selected friendly names and random action IDs only. No rooms, HomeKit identifiers, credentials or home topology. Keep the companion open; background execution is not available.")}
            }.navigationTitle("Jarvis companion")}.tabItem {Label("Dashboard",systemImage:"sparkles")}
            NavigationStack {List {NavigationLink("Connections") {List {NavigationLink("Apple Home") {AppleHomeView()}}.navigationTitle("Connections")}}.navigationTitle("More")}.tabItem {Label("More",systemImage:"ellipsis.circle")}
        }
        .task {await session.restoreIdentity();await audit.flush()}
        .task(id:phase) {guard phase == .active else {return};while !Task.isCancelled {home.refresh();await bridge.poll();try? await Task.sleep(for:.seconds(3))}}
        .onChange(of:session.userID) {_,_ in Task {await audit.flush()}}
    }
}
