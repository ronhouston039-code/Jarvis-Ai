import SwiftUI
import UIKit

struct AppleHomeView:View {
    @EnvironmentObject var home:HomeKitStore
    @EnvironmentObject var bridge:LocalActionBridge
    @State private var selectedHome:UUID?
    var body:some View {
        List {
            Section("Apple Home") {
                Text("Jarvis uses Apple Home to show and control the accessories you choose.")
                Text(home.status)
                if !home.connected {Button("Connect Apple Home") {home.connect()};Button("Open iPhone Settings") {if let url=URL(string:UIApplication.openSettingsURLString) {UIApplication.shared.open(url)}}}
                else {Button("Disconnect Apple Home",role:.destructive) {home.disconnect();Task {await bridge.stop()}};Button("Refresh homes") {home.refresh()}}
            }
            if home.connected {
                Section("Homes and rooms") {
                    ForEach(home.homes) {selection in
                        Button(selection.name) {selectedHome=selection.id}
                        if selectedHome==nil || selectedHome==selection.id {Text(selection.rooms.joined(separator:", ")).font(.caption)}
                    }
                }
                Section("Choose approved accessories") {
                    ForEach(home.accessories.filter{selectedHome==nil || $0.homeID==selectedHome}) {accessory in
                        if accessory.services.isEmpty || accessory.inherentlySensitive {VStack(alignment:.leading) {Text(accessory.name);Text("Unsupported or security-sensitive accessory. No first-release controls.").font(.caption)}}
                        else {AccessoryControls(accessory:accessory)}
                    }
                }
                Section("Choose approved scenes") {
                    ForEach(home.scenes.filter{selectedHome==nil || $0.homeID==selectedHome}) {scene in
                        Toggle(scene.name,isOn:Binding(get:{home.approvedScenes.contains(scene.id)},set:{home.approveScene(scene.id,allowed:$0)}))
                        Button("Read scene status") {home.request(.readSceneStatus,accessoryID:scene.id)}.disabled(!home.approvedScenes.contains(scene.id) || home.busy)
                        if let values=home.values[scene.id] {Text("Scene executing: \(values["Scene executing"] ?? "Unknown")")}
                        Button("Run \(scene.name)") {home.request(.runScene,accessoryID:scene.id)}.disabled(!home.approvedScenes.contains(scene.id) || home.busy)
                    }
                    Text("Only scenes containing supported, non-security power and brightness actions are listed. Every scene execution requires native confirmation. Thermostat scenes are excluded to preserve safe temperature ranges.").font(.caption)
                }
            }
        }
        .navigationTitle("Apple Home")
        .confirmationDialog(home.pending.map {"\($0.action.description) · \($0.name)?"} ?? "Confirm local action",isPresented:Binding(get:{home.pending != nil},set:{if !$0 {home.pending=nil}}),titleVisibility:.visible) {
            if let pending=home.pending {Button(pending.action.description) {home.confirm(pending.id)}}
            Button("Cancel",role:.cancel) {home.pending=nil}
        } message: {Text("This exact action runs locally on this iPhone. Confirmation expires in one minute.")}
    }
}
private struct AccessoryControls:View {
    @EnvironmentObject var home:HomeKitStore
    let accessory:LocalAccessory
    @State private var brightness=50.0
    @State private var lower=16.0
    @State private var upper=26.0
    @State private var target=21.0
    var body:some View {
        VStack(alignment:.leading,spacing:10) {
            Toggle(accessory.name,isOn:Binding(get:{home.approvedAccessories.contains(accessory.id)},set:{home.approveAccessory(accessory.id,allowed:$0)}))
            Toggle("Security/privacy accessory: exclude controls",isOn:Binding(get:{home.sensitiveAccessories.contains(accessory.id)},set:{home.markSensitive(accessory.id,enabled:$0)}))
            Text("\(accessory.room) · \(accessory.online ? "Online":"Offline")").font(.caption)
            ForEach(accessory.services) {service in
                Text("\(service.name) · \(service.kind.label)").font(.caption)
                if [.light,.switch,.fan,.fanV2].contains(service.kind),service.writable.contains(service.kind == .fanV2 ? CharacteristicID.active:CharacteristicID.power) {
                    HStack {Button("On") {home.request(.power(true),accessoryID:accessory.id,serviceID:service.id)};Button("Off") {home.request(.power(false),accessoryID:accessory.id,serviceID:service.id)}}
                }
                if service.kind == .light,service.writable.contains(CharacteristicID.brightness) {
                    Slider(value:$brightness,in:0...100,step:1);Button("Set brightness to \(Int(brightness))%") {home.request(.brightness(Int(brightness)),accessoryID:accessory.id,serviceID:service.id)}
                }
                if service.kind == .thermostat,service.writable.contains(CharacteristicID.targetTemperature) {
                    Stepper("Safe minimum: \(lower.formatted())°C",value:$lower,in:5...34,step:0.5)
                    Stepper("Safe maximum: \(upper.formatted())°C",value:$upper,in:6...35,step:0.5)
                    Button("Approve this thermostat range") {home.approveTemperature(accessory.id,lower:lower,upper:upper)}
                    if let range=home.temperatures[accessory.id] {Text("Approved: \(range.lower.formatted())–\(range.upper.formatted())°C")}
                    Stepper("Target: \(target.formatted())°C",value:$target,in:5...35,step:0.5)
                    Button("Set approved temperature") {home.request(.temperature(target),accessoryID:accessory.id,serviceID:service.id)}.disabled(home.temperatures[accessory.id]?.permits(target) != true)
                }
            }
            Button("Read status") {home.request(.readStatus,accessoryID:accessory.id)}
            if let values=home.values[accessory.id] {ForEach(values.keys.sorted(),id:\.self) {key in Text("\(key): \(values[key] ?? "Unknown")")}}
            if let date=home.updatedAt[accessory.id] {Text("Updated \(date.formatted())").font(.caption)}
        }
        // Every action is validated again, including offline and security exclusions.
    }
}
