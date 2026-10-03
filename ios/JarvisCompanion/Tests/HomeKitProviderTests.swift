import XCTest
@testable import JarvisCompanion

@MainActor private final class MockHomeKitProvider:HomeKitProvider {
    var connected=false
    var approved:Set<UUID>=[]
    var selectedScenes:Set<UUID>=[]
    var busy=false
    var pending:PendingHomeAction?
    var accessories:[LocalAccessory]=[]
    var approvedAccessories:Set<UUID> {approved}
    var approvedScenes:Set<UUID> {selectedScenes}
    var scenes:[LocalScene]=[]
    var completed:[LocalHomeAction]=[]
    var error:Error?
    var range:[UUID:TemperatureApproval]=[:]
    func connect(){connected=true}
    func disconnect(){connected=false;approved=[];selectedScenes=[]}
    func approveAccessory(_ id:UUID,allowed:Bool){if allowed {approved.insert(id)} else {approved.remove(id)}}
    func approveScene(_ id:UUID,allowed:Bool){if allowed {selectedScenes.insert(id)} else {selectedScenes.remove(id)}}
    func request(_ action:LocalHomeAction,accessoryID:UUID,serviceID:UUID?=nil){
        do {guard connected else {throw HomeControlError.permission};try LocalActionPolicy(approvedAccessories:approved,approvedScenes:selectedScenes,temperatureRanges:range).validate(action,id:accessoryID);completed.append(action)} catch {self.error=error}
    }
}
final class HomeKitProviderTests:XCTestCase {
    func testSecurityServicesAndNamesAreExcluded() {
        XCTAssertTrue(AccessorySafety.sensitive(serviceTypes:["00000045-0000-1000-8000-0026BB765291"],name:"Entrance"))
        XCTAssertTrue(AccessorySafety.sensitive(serviceTypes:[],name:"Camera privacy switch"))
        XCTAssertFalse(AccessorySafety.sensitive(serviceTypes:[HomeServiceKind.light.rawValue],name:"Living Room Lamp"))
    }
    @MainActor func testOnlyLocalApprovalsExecuteAndDisconnectRevokes() {
        let provider=MockHomeKitProvider(),approved=UUID(),other=UUID()
        provider.connect();provider.approveAccessory(approved,allowed:true)
        provider.request(.power(true),accessoryID:other);XCTAssertTrue(provider.completed.isEmpty)
        provider.request(.power(true),accessoryID:approved);XCTAssertEqual(provider.completed,[.power(true)])
        provider.disconnect();provider.request(.power(false),accessoryID:approved);XCTAssertEqual(provider.completed.count,1)
    }
    @MainActor func testThermostatAndBrightnessBounds() {
        let provider=MockHomeKitProvider(),id=UUID();provider.connect();provider.approveAccessory(id,allowed:true)
        provider.range[id]=TemperatureApproval(lower:18,upper:24)
        for invalid in [4.0,25.0,Double.nan,Double.infinity] {provider.request(.temperature(invalid),accessoryID:id)}
        provider.request(.brightness(101),accessoryID:id);XCTAssertTrue(provider.completed.isEmpty)
        provider.request(.temperature(21),accessoryID:id);XCTAssertEqual(provider.completed,[.temperature(21)])
    }
    @MainActor func testSceneApprovalAndOpaqueActionID() {
        let provider=MockHomeKitProvider(),scene=UUID();provider.connect();provider.request(.runScene,accessoryID:scene);XCTAssertTrue(provider.completed.isEmpty)
        provider.approveScene(scene,allowed:true);provider.request(.runScene,accessoryID:scene);XCTAssertEqual(provider.completed,[.runScene]);XCTAssertTrue(LocalHomeAction.runScene.needsConfirmation)
        let binding=LocalActionBinding(id:UUID(),accessoryID:scene,serviceID:nil,deviceName:"Evening",actionType:"scene",label:"Run scene")
        XCTAssertNotEqual(binding.id,binding.accessoryID)
        XCTAssertNil(LocalActionBinding(id:UUID(),accessoryID:scene,serviceID:nil,deviceName:"Unknown",actionType:"unlock",label:"Unsupported").action)
    }
}
