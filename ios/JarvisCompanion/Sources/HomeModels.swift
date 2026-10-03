import Foundation
import HomeKit

enum HomeServiceKind: String, CaseIterable {
    case light = "00000043-0000-1000-8000-0026BB765291"
    case `switch` = "00000049-0000-1000-8000-0026BB765291"
    case fan = "00000040-0000-1000-8000-0026BB765291"
    case fanV2 = "000000B7-0000-1000-8000-0026BB765291"
    case thermostat = "0000004A-0000-1000-8000-0026BB765291"
    var label: String {
        switch self {
        case .light: return "Light"
        case .switch: return "Switch"
        case .fan, .fanV2: return "Fan"
        case .thermostat: return "Thermostat"

        }
    }

}

enum CharacteristicID {
    static let power = "00000025-0000-1000-8000-0026BB765291"
    static let active = "000000B0-0000-1000-8000-0026BB765291"
    static let brightness = "00000008-0000-1000-8000-0026BB765291"
    static let currentTemperature = "00000011-0000-1000-8000-0026BB765291"
    static let targetTemperature = "00000035-0000-1000-8000-0026BB765291"

}

enum LocalHomeAction: Equatable {
    case readStatus
    case readSceneStatus
    case power(Bool)
    case brightness(Int)
    case temperature(Double)
    case runScene
    var auditType: String {
        switch self {
        case .readStatus, .readSceneStatus: return "read_status"
        case .power(let on): return on ? "power_on" : "power_off"
        case .brightness: return "brightness"
        case .temperature: return "thermostat_temperature"
        case .runScene: return "scene"

        }
    }
    var needsConfirmation: Bool {
        self == .runScene
    }
    var description: String {
        switch self {
        case .readStatus, .readSceneStatus: return "Read status"
        case .power(let on): return on ? "Turn on" : "Turn off"
        case .brightness(let value): return "Set brightness to \(value)%"
        case .temperature(let value): return "Set temperature to \(value.formatted())°C"
        case .runScene: return "Run scene"

        }
    }
}

struct HomeSelection: Identifiable { let id: UUID; let name: String; let rooms: [String] }
struct LocalService: Identifiable { let id: UUID; let name: String; let kind: HomeServiceKind; let writable: Set<String> }
struct LocalAccessory: Identifiable {
    let id: UUID; let homeID: UUID; let name: String; let room: String; let online: Bool; let services: [LocalService]
    var securitySensitive = false
    var inherentlySensitive: Bool { securitySensitive || name.range(of: "security|alarm|camera|privacy|door|garage|lock", options: [.regularExpression, .caseInsensitive]) != nil }
}
struct LocalScene: Identifiable { let id: UUID; let homeID: UUID; let name: String }
struct TemperatureApproval: Codable { let lower: Double; let upper: Double
    func permits(_ value: Double) -> Bool { value.isFinite && lower.isFinite && upper.isFinite && lower <= upper && (lower...upper).contains(value) }
}
struct PendingHomeAction: Identifiable { let id = UUID(); let accessoryID: UUID; let serviceID: UUID?; let action: LocalHomeAction; let name: String; let expiresAt = Date().addingTimeInterval(60) }

enum HomeControlError: LocalizedError {
    case permission, notApproved, unavailable, unsupported, invalidValue, expired
    var errorDescription: String? {
        switch self {
        case .permission: return "Apple Home access is denied or revoked. Check HomeKit permission in Settings."
        case .notApproved: return "This accessory, scene, or temperature range has not been approved."
        case .unavailable: return "The accessory is offline or no longer available."
        case .unsupported: return "This action is not supported by this HomeKit service."
        case .invalidValue: return "This value is outside the approved or supported range."
        case .expired: return "The confirmation expired. Request the action again."
        }
    }
}

@MainActor protocol HomeKitProvider: AnyObject {
    var connected: Bool { get }
    var busy: Bool { get }
    var pending: PendingHomeAction? { get }
    var accessories: [LocalAccessory] { get }
    var scenes: [LocalScene] { get }
    var approvedAccessories: Set<UUID> { get }
    var approvedScenes: Set<UUID> { get }
    func connect()
    func disconnect()
    func request(_ action: LocalHomeAction, accessoryID: UUID, serviceID: UUID?)
    func approveAccessory(_ id: UUID, allowed: Bool)
    func approveScene(_ id: UUID, allowed: Bool)
}
struct LocalActionBinding: Codable, Identifiable {
    let id: UUID // Random application action ID, never a HomeKit identifier.
    let accessoryID: UUID
    let serviceID: UUID?
    let deviceName: String
    let actionType: String
    let label: String
    var action: LocalHomeAction? {
        switch actionType { case "power_on": return .power(true); case "power_off": return .power(false); case "read_status": return .readStatus; case "scene": return .runScene; default: return nil }
    }
}

struct AccessorySafety {
    static let prohibitedServices:Set<String> = ["00000045-0000-1000-8000-0026BB765291", "00000041-0000-1000-8000-0026BB765291", "0000007E-0000-1000-8000-0026BB765291", "00000110-0000-1000-8000-0026BB765291", "00000111-0000-1000-8000-0026BB765291", "00000121-0000-1000-8000-0026BB765291", "00000044-0000-1000-8000-0026BB765291"]
    static func sensitive(serviceTypes:[String],name:String) -> Bool {
        serviceTypes.contains { prohibitedServices.contains($0.uppercased()) } || name.range(of:"security|alarm|camera|privacy|door|garage|lock",options:[.regularExpression,.caseInsensitive]) != nil
    }
}
