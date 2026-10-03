import Foundation

struct LocalActionPolicy {
    let approvedAccessories:Set<UUID>
    let approvedScenes:Set<UUID>
    let temperatureRanges:[UUID:TemperatureApproval]
    func validate(_ action:LocalHomeAction,id:UUID) throws {
        if action == .runScene || action == .readSceneStatus {guard approvedScenes.contains(id) else {throw HomeControlError.notApproved};return}
        guard approvedAccessories.contains(id) else {throw HomeControlError.notApproved}
        switch action {
        case .brightness(let value):guard (0...100).contains(value) else {throw HomeControlError.invalidValue}
        case .temperature(let value):guard temperatureRanges[id]?.permits(value)==true else {throw HomeControlError.invalidValue}
        default:break
        }
    }
}
