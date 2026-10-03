import Foundation
import HomeKit
import Combine

@MainActor final class HomeKitStore: NSObject, ObservableObject, HMHomeManagerDelegate, HomeKitProvider {
    @Published private(set) var homes: [HomeSelection] = []
    @Published private(set) var accessories: [LocalAccessory] = []
    @Published private(set) var scenes: [LocalScene] = []
    @Published private(set) var connected = false
    @Published private(set) var busy = false
    @Published private(set) var status = "Apple Home is disconnected."
    @Published private(set) var values: [UUID: [String: String]] = [:]
    @Published private(set) var updatedAt: [UUID: Date] = [:]
    @Published var pending: PendingHomeAction?
    @Published private(set) var approvedAccessories: Set<UUID> = []
    @Published private(set) var approvedScenes: Set<UUID> = []
    @Published private(set) var sensitiveAccessories: Set<UUID> = []
    @Published private(set) var temperatures: [UUID: TemperatureApproval] = [:]
    private var manager: HMHomeManager?
    private let audit: SanitizedAuditClient
    private let defaults: UserDefaults
    private var generation = 0
    init(audit: SanitizedAuditClient, defaults: UserDefaults = .standard) {
        self.audit = audit; self.defaults = defaults
        super.init()
        approvedAccessories = Set((defaults.stringArray(forKey: "home.approvedAccessories") ?? []).compactMap(UUID.init(uuidString:)))
        approvedScenes = Set((defaults.stringArray(forKey: "home.approvedScenes") ?? []).compactMap(UUID.init(uuidString:)))
        sensitiveAccessories = Set((defaults.stringArray(forKey: "home.sensitiveAccessories") ?? []).compactMap(UUID.init(uuidString:)))
        if let data = defaults.data(forKey: "home.temperatureApprovals"), let saved = try? JSONDecoder().decode([String: TemperatureApproval].self, from: data) {
            temperatures = Dictionary(uniqueKeysWithValues: saved.compactMap { key, value in UUID(uuidString: key).map { ($0, value) } })
        }
    }
    func connect() {
        guard manager == nil else { refresh(); return }
        status = "Requesting Apple Home permission…"
        // Creating the manager is deliberately delayed until the user taps Connect Apple Home.
        let next = HMHomeManager(); manager = next; next.delegate = self
        refresh()
    }
    func disconnect() {
        generation += 1; pending = nil; manager?.delegate = nil; manager = nil
        connected = false; homes = []; accessories = []; scenes = []; values = [:]; updatedAt = [:]
        approvedAccessories = []; approvedScenes = []; sensitiveAccessories = []; temperatures = [:]
        saveApprovals(); status = "Apple Home disconnected. Future control is disabled. An already-sent action cannot be recalled."
    }
    func refresh() {
        guard let manager else { return }
        let authorization = manager.authorizationStatus
        guard authorization.contains(.authorized) else {
            connected = false; pending = nil; homes = []; accessories = []; scenes = []; values = [:]; updatedAt = [:]
            if authorization.contains(.determined) || authorization.contains(.restricted) {
                generation += 1; status = "Apple Home access is denied, restricted, or revoked. Check HomeKit permission in Settings."
            } else { status = "Waiting for Apple Home authorization…" }
            return
        }
        let previouslyConnected=connected
        connected = true
        homes = manager.homes.map { HomeSelection(id: $0.uniqueIdentifier, name: $0.name, rooms: $0.rooms.map(\.name)) }
        accessories = manager.homes.flatMap { home in home.accessories.map { accessory in
            LocalAccessory(id: accessory.uniqueIdentifier, homeID: home.uniqueIdentifier, name: accessory.name, room: accessory.room?.name ?? "Unassigned", online: accessory.isReachable,
                services: accessory.services.compactMap { service in
                    guard let kind = HomeServiceKind(rawValue: service.serviceType.uppercased()) else { return nil }
                    return LocalService(id: service.uniqueIdentifier, name: service.name, kind: kind, writable: Set(service.characteristics.filter { $0.properties.contains(HMCharacteristicPropertyWritable) }.map { $0.characteristicType.uppercased() }))
                }, securitySensitive: AccessorySafety.sensitive(serviceTypes: accessory.services.map(\.serviceType), name: accessory.name))
        } }
        scenes = manager.homes.flatMap { home in home.actionSets.filter(sceneIsSafe).map { LocalScene(id: $0.uniqueIdentifier, homeID: home.uniqueIdentifier, name: $0.name) } }
        if !previouslyConnected {status = homes.isEmpty ? "Authorized. No Apple Homes are available on this device." : "Apple Home connected. Choose the accessories and scenes JARVIS may control."}
    }
    nonisolated func homeManagerDidUpdateHomes(_ manager: HMHomeManager) { Task { @MainActor [weak self] in self?.refresh() } }
    nonisolated func homeManager(_ manager: HMHomeManager, didUpdate status: HMHomeManagerAuthorizationStatus) { Task { @MainActor [weak self] in self?.refresh() } }
    private func sceneIsSafe(_ scene: HMActionSet) -> Bool {
        guard !scene.actions.isEmpty else { return false }
        return scene.actions.allSatisfy { action in
            guard let write = action as? HMCharacteristicWriteAction<NSNumber>,
                  let service = write.characteristic.service,
                  let kind = HomeServiceKind(rawValue: service.serviceType.uppercased()),
                  let accessory = service.accessory,
                  !AccessorySafety.sensitive(serviceTypes: accessory.services.map(\.serviceType),name: accessory.name),
                  !sensitiveAccessories.contains(accessory.uniqueIdentifier),
                  !accessory.name.lowercased().contains("security"),
                  !accessory.name.lowercased().contains("alarm"),
                  !accessory.name.lowercased().contains("camera"),
                  !accessory.name.lowercased().contains("garage"),
                  !accessory.name.lowercased().contains("door"),
                  !accessory.name.lowercased().contains("privacy"),
                  !accessory.name.lowercased().contains("lock") else { return false }
            // Scenes may not bypass thermostat ranges or access unsupported services.
            let type = write.characteristic.characteristicType.uppercased()
            let value = write.targetValue.doubleValue
            guard value.isFinite else { return false }
            return kind != .thermostat && (type == CharacteristicID.brightness ? (0...100).contains(value) : [CharacteristicID.power, CharacteristicID.active].contains(type) && [0.0, 1.0].contains(value))
        }
    }
    func approveAccessory(_ id: UUID, allowed: Bool) {
        if allowed, let accessory = accessories.first(where: {$0.id == id}), !accessory.inherentlySensitive, !sensitiveAccessories.contains(id) { approvedAccessories.insert(id) } else { approvedAccessories.remove(id); temperatures.removeValue(forKey: id); if pending?.accessoryID == id { pending = nil } }
        saveApprovals()
    }
    func approveScene(_ id: UUID, allowed: Bool) {
        if allowed { approvedScenes.insert(id) } else { approvedScenes.remove(id); if pending?.accessoryID == id { pending = nil } }
        saveApprovals()
    }
    func markSensitive(_ id: UUID, enabled: Bool) { if enabled { sensitiveAccessories.insert(id); approvedAccessories.remove(id); temperatures.removeValue(forKey:id); pending=nil } else { sensitiveAccessories.remove(id) }; saveApprovals() }
    func approveTemperature(_ id: UUID, lower: Double, upper: Double) {
        guard approvedAccessories.contains(id), lower.isFinite, upper.isFinite, lower >= 5, upper <= 35, lower < upper else { status = "Approve the accessory and a valid Celsius range between 5 and 35 first."; return }
        temperatures[id] = TemperatureApproval(lower: lower, upper: upper); saveApprovals(); status = "Thermostat range approved locally."
    }
    private func saveApprovals() {
        defaults.set(approvedAccessories.map(\.uuidString), forKey: "home.approvedAccessories")
        defaults.set(approvedScenes.map(\.uuidString), forKey: "home.approvedScenes")
        defaults.set(sensitiveAccessories.map(\.uuidString), forKey: "home.sensitiveAccessories")
        let saved = Dictionary(uniqueKeysWithValues: temperatures.map { ($0.key.uuidString, $0.value) })
        if let data = try? JSONEncoder().encode(saved) { defaults.set(data, forKey: "home.temperatureApprovals") }
    }
    func request(_ action: LocalHomeAction, accessoryID: UUID, serviceID: UUID? = nil) {
        guard !busy else { return }
        do {
            let name = try validate(action, accessoryID: accessoryID, serviceID: serviceID)
            let accessory = accessories.first { $0.id == accessoryID }
            if action.needsConfirmation || (action != .readStatus && (accessory?.inherentlySensitive == true || sensitiveAccessories.contains(accessoryID))) {
                pending = PendingHomeAction(accessoryID: accessoryID, serviceID: serviceID, action: action, name: name)
            } else { perform(action, accessoryID: accessoryID, serviceID: serviceID, name: name) }
        } catch { status = friendly(error) }
    }
    func confirm(_ nonce: UUID) {
        guard let approval = pending, approval.id == nonce else { return }
        pending = nil
        guard approval.expiresAt > Date() else { status = HomeControlError.expired.localizedDescription; return }
        do { _ = try validate(approval.action, accessoryID: approval.accessoryID, serviceID: approval.serviceID); perform(approval.action, accessoryID: approval.accessoryID, serviceID: approval.serviceID, name: approval.name) }
        catch { status = friendly(error) }
    }
    private func validate(_ action: LocalHomeAction, accessoryID: UUID, serviceID: UUID?) throws -> String {
        guard connected, let manager, manager.authorizationStatus.contains(.authorized) else { throw HomeControlError.permission }
        try LocalActionPolicy(approvedAccessories: approvedAccessories, approvedScenes: approvedScenes, temperatureRanges: temperatures).validate(action,id:accessoryID)
        if action == .runScene || action == .readSceneStatus {
            guard approvedScenes.contains(accessoryID), let scene = scenes.first(where: { $0.id == accessoryID }), manager.homes.contains(where: { $0.actionSets.contains(where: { $0.uniqueIdentifier == scene.id && sceneIsSafe($0) }) }) else { throw HomeControlError.notApproved }
            return scene.name
        }
        guard approvedAccessories.contains(accessoryID), let accessory = accessories.first(where: { $0.id == accessoryID }) else { throw HomeControlError.notApproved }
        guard !accessory.inherentlySensitive, !sensitiveAccessories.contains(accessoryID) else { throw HomeControlError.unsupported }
        guard accessory.online else { throw HomeControlError.unavailable }
        if action != .readStatus { guard let serviceID, accessory.services.contains(where: { $0.id == serviceID }) else { throw HomeControlError.unsupported } }
        return accessory.name
    }
    private func target(_ accessoryID: UUID, _ serviceID: UUID) throws -> HMService {
        guard let accessory = manager?.homes.flatMap(\.accessories).first(where: { $0.uniqueIdentifier == accessoryID }), let service = accessory.services.first(where: { $0.uniqueIdentifier == serviceID }) else { throw HomeControlError.unavailable }
        return service
    }
    private func characteristic(_ service: HMService, _ type: String) throws -> HMCharacteristic {
        guard let value = service.characteristics.first(where: { $0.characteristicType.uppercased() == type && $0.properties.contains(HMCharacteristicPropertyWritable) }) else { throw HomeControlError.unsupported }
        return value
    }
    private func write(_ value: NSNumber, characteristic: HMCharacteristic) async throws {
        if let minimum = characteristic.metadata?.minimumValue, value.doubleValue < minimum.doubleValue { throw HomeControlError.invalidValue }
        if let maximum = characteristic.metadata?.maximumValue, value.doubleValue > maximum.doubleValue { throw HomeControlError.invalidValue }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            characteristic.writeValue(value) { error in if let error { continuation.resume(throwing: error) } else { continuation.resume() } }
        }
    }
    private func read(_ characteristic: HMCharacteristic) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            characteristic.readValue { error in if let error { continuation.resume(throwing: error) } else { continuation.resume() } }
        }
    }
    private func readStatus(_ accessoryID: UUID) async throws {
        let allowed: [String: String] = [CharacteristicID.power: "Power", CharacteristicID.active: "Active", CharacteristicID.brightness: "Brightness (%)", CharacteristicID.currentTemperature: "Current temperature (°C)", CharacteristicID.targetTemperature: "Target temperature (°C)"]
        guard let accessory = manager?.homes.flatMap(\.accessories).first(where: { $0.uniqueIdentifier == accessoryID }) else { throw HomeControlError.unavailable }
        var result: [String: String] = [:]
        for characteristic in accessory.services.flatMap(\.characteristics) where allowed[characteristic.characteristicType.uppercased()] != nil && characteristic.properties.contains(HMCharacteristicPropertyReadable) {
            guard manager?.authorizationStatus.contains(.authorized) == true, approvedAccessories.contains(accessoryID) else { throw HomeControlError.permission }
            try await read(characteristic)
            if let number = characteristic.value as? NSNumber { result[allowed[characteristic.characteristicType.uppercased()]!] = number.stringValue }
        }
        guard connected, approvedAccessories.contains(accessoryID), manager?.authorizationStatus.contains(.authorized) == true else {throw HomeControlError.permission}
        values[accessoryID] = result; updatedAt[accessoryID] = Date()
    }
    private func perform(_ action: LocalHomeAction, accessoryID: UUID, serviceID: UUID?, name: String) {
        busy = true; let session = generation
        Task { @MainActor in
            do {
                _ = try validate(action, accessoryID: accessoryID, serviceID: serviceID)
                if action == .runScene || action == .readSceneStatus {
                    guard let home = manager?.homes.first(where: { $0.actionSets.contains(where: { $0.uniqueIdentifier == accessoryID }) }), let scene = home.actionSets.first(where: { $0.uniqueIdentifier == accessoryID }) else { throw HomeControlError.unavailable }
                    if action == .readSceneStatus {values[accessoryID] = ["Scene executing": scene.isExecuting ? "Yes" : "No"];updatedAt[accessoryID]=Date()}
                    else {try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in home.executeActionSet(scene) { error in if let error { continuation.resume(throwing: error) } else { continuation.resume() } } }}
                } else if action == .readStatus { try await readStatus(accessoryID) }
                else {
                    guard let serviceID else { throw HomeControlError.unsupported }
                    let service = try target(accessoryID, serviceID)
                    guard let kind = HomeServiceKind(rawValue: service.serviceType.uppercased()) else { throw HomeControlError.unsupported }
                    let item: HMCharacteristic; let value: NSNumber
                    switch action {
                    case .power(let on):
                        guard [.light, .switch, .fan, .fanV2].contains(kind) else { throw HomeControlError.unsupported }
                        item = try characteristic(service, kind == .fanV2 ? CharacteristicID.active : CharacteristicID.power); value = NSNumber(value: on)
                    case .brightness(let percent):
                        guard kind == .light, (0...100).contains(percent) else { throw HomeControlError.invalidValue }
                        item = try characteristic(service, CharacteristicID.brightness); value = NSNumber(value: percent)
                    case .temperature(let celsius):
                        guard kind == .thermostat, let range = temperatures[accessoryID], range.permits(celsius) else { throw HomeControlError.notApproved }
                        item = try characteristic(service, CharacteristicID.targetTemperature); value = NSNumber(value: celsius)
                    default: throw HomeControlError.unsupported
                    }
                    guard generation == session else { throw HomeControlError.permission }
                    try await write(value, characteristic: item)
                }
                var message = (action == .readStatus || action == .readSceneStatus) ? "Status read locally." : "Apple Home accepted the action; physical state is not yet verified."
                if case .power(let on) = action, let serviceID {
                    let service = try target(accessoryID, serviceID)
                    if let characteristic = service.characteristics.first(where: { [CharacteristicID.power, CharacteristicID.active].contains($0.characteristicType.uppercased()) && $0.properties.contains(HMCharacteristicPropertyReadable) }) {
                        do { try await read(characteristic); if (characteristic.value as? NSNumber)?.boolValue == on { message = on ? "Verified on by Apple Home readback." : "Verified off by Apple Home readback." } } catch { /* Successful write with unavailable readback remains unverified. */ }
                    }
                }
                audit.record(deviceName: name, actionType: action.auditType, state: "completed", message: message)
                if generation == session { status = message }
            } catch {
                audit.record(deviceName: name, actionType: action.auditType, state: "failed", message: "Apple Home could not confirm this action. Check the accessory before trying again.")
                if generation == session { status = friendly(error) }
            }
            busy = false
        }
    }
    private func friendly(_ error: Error) -> String { (error as? HomeControlError)?.localizedDescription ?? "Apple Home could not confirm this action. Check the accessory before trying again." }
}
