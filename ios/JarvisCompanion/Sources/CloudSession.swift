import Foundation
import Combine
import AuthenticationServices
import CryptoKit
import Security
import UIKit

@MainActor final class CloudSession: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var signedIn = false
    @Published private(set) var userID: String?
    @Published var status = "Cloud sign-in is optional for local controls. Sign in to share sanitized activity."
    let baseURL: URL
    private var session: ASWebAuthenticationSession?
    private var sessionToken: String?
    private var accessToken: String?
    private var generation=0
    private var tokenTime = Date.distantPast
    private let keychainName = "jarvis.cloud.session"
    init(baseURL: URL) {
        precondition(baseURL.scheme == "https" && baseURL.host != nil && baseURL.user == nil)
        self.baseURL = baseURL
        super.init()
        let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrAccount as String:keychainName,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        var result: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary,&result) == errSecSuccess, let data=result as? Data { sessionToken=String(data:data,encoding:.utf8); signedIn=sessionToken != nil }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
    private func random() throws -> String {
        var bytes=[UInt8](repeating:0,count:32)
        guard SecRandomCopyBytes(kSecRandomDefault,bytes.count,&bytes)==errSecSuccess else { throw HomeControlError.unavailable }
        return Data(bytes).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
    }
    func signIn(provider: String = "google") {
        guard session == nil else { return }
        generation += 1;let loginGeneration=generation
        do {
            let verifier=try random(), state=try random()
            let challenge=Data(SHA256.hash(data:Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
            var url=URLComponents(url:baseURL.appendingPathComponent("api/auth/native-start"),resolvingAgainstBaseURL:false)!
            url.queryItems=[URLQueryItem(name:"provider",value:provider),URLQueryItem(name:"redirect_uri",value:"jarvis-companion://auth/callback"),URLQueryItem(name:"state",value:state),URLQueryItem(name:"code_challenge",value:challenge),URLQueryItem(name:"code_challenge_method",value:"S256")]
            let next=ASWebAuthenticationSession(url:url.url!,callbackURLScheme:"jarvis-companion") { [weak self] callback,error in
                Task { @MainActor in
                    guard let self, self.generation==loginGeneration else { return }; self.session=nil
                    guard error == nil, let callback, callback.scheme=="jarvis-companion",callback.host=="auth",callback.path=="/callback",let items=URLComponents(url:callback,resolvingAgainstBaseURL:false)?.queryItems,items.first(where:{$0.name=="state"})?.value==state,let code=items.first(where:{$0.name=="code"})?.value else {self.status="Sign-in cancelled or could not be verified.";return}
                    do {
                        let data=try await self.raw(path:"api/auth/native-exchange",body:["code":code,"code_verifier":verifier])
                        guard let obj=try JSONSerialization.jsonObject(with:data) as? [String:String],let refresh=obj["sessionToken"],let token=obj["accessToken"] else { throw HomeControlError.unavailable }
                        guard self.generation==loginGeneration else {return}
                        try self.save(refresh);self.userID=nil;self.accessToken=token;self.tokenTime=Date();self.signedIn=true;await self.restoreIdentity();self.status="Signed in. Local Apple Home permission is separate."
                    } catch {self.status="Cloud sign-in failed. Local controls remain available."}
                }
            }
            next.presentationContextProvider=self;next.prefersEphemeralWebBrowserSession=true;session=next
            if !next.start() {session=nil;status="Could not open secure sign-in."}
        } catch {status="Could not prepare secure sign-in."}
    }
    private func save(_ token:String) throws {
        let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrAccount as String:keychainName]
        SecItemDelete(query as CFDictionary);sessionToken=nil
        var saved=query;saved[kSecValueData as String]=Data(token.utf8);saved[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(saved as CFDictionary,nil)==errSecSuccess else {throw HomeControlError.unavailable}
        sessionToken=token
    }
    func signOut() async {
        let oldSession=sessionToken
        generation += 1;session?.cancel();session=nil
        SecItemDelete([kSecClass as String:kSecClassGenericPassword,kSecAttrAccount as String:keychainName] as CFDictionary)
        sessionToken=nil;accessToken=nil;userID=nil;signedIn=false;status="Signed out of cloud."
        if let oldSession { _ = try? await raw(path:"api/auth/native-signout",body:["sessionToken":oldSession]) }
    }
    func restoreIdentity() async {
        guard signedIn else { return }
        do {let data=try await request(path:"api/auth/native-me");let object=try JSONSerialization.jsonObject(with:data) as? [String:Any];userID=object?["userId"] as? String}
        catch {userID=nil;status="Cloud session could not be verified. Sign in again."}
    }
    private func raw(path:String,body:[String:String]) async throws -> Data {
        var request=URLRequest(url:baseURL.appendingPathComponent(path));request.httpMethod="POST";request.timeoutInterval=15;request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.httpBody=try JSONSerialization.data(withJSONObject:body)
        let (data,response)=try await URLSession.shared.data(for:request)
        guard (response as? HTTPURLResponse)?.statusCode==200 else {throw HomeControlError.unavailable};return data
    }
    func request(path:String,body:Data?=nil,idempotencyKey:UUID?=nil) async throws -> Data {
        guard let sessionToken else {throw HomeControlError.permission}
        let identityGeneration=generation
        if accessToken == nil || Date().timeIntervalSince(tokenTime)>240 {
            let data=try await raw(path:"api/auth/native-token",body:["sessionToken":sessionToken])
            guard let obj=try JSONSerialization.jsonObject(with:data) as? [String:String],let token=obj["accessToken"] else {throw HomeControlError.permission};guard identityGeneration==generation else {throw HomeControlError.permission};accessToken=token;tokenTime=Date()
        }
        guard identityGeneration==generation else {throw HomeControlError.permission}
        var request=URLRequest(url:baseURL.appendingPathComponent(path));request.httpMethod=body == nil ? "GET":"POST";request.timeoutInterval=10;request.httpBody=body
        request.setValue("Bearer \(accessToken!)",forHTTPHeaderField:"Authorization");request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        if let idempotencyKey {request.setValue(idempotencyKey.uuidString,forHTTPHeaderField:"Idempotency-Key")}
        let (data,response)=try await URLSession.shared.data(for:request)
        guard let response=response as? HTTPURLResponse,(200..<300).contains(response.statusCode) else {accessToken=nil;throw HomeControlError.unavailable}
        return data
    }
}
