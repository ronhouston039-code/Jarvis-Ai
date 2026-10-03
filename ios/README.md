# JARVIS iOS companion

This separate SwiftUI iOS 17+ project controls Apple Home **on the iPhone**. The existing https://jarvis-voice-7f42.app.space/home remains the cloud dashboard, AI chat, memory and activity-log interface. There is no HomeKit framework, private-network probing, or HomeKit credential upload in the web/cloud application.

## Build and install on a Mac

1. Open `JarvisCompanion/JarvisCompanion.xcodeproj` in Xcode 16 or newer. Choose the **JarvisCompanion** scheme.
2. Under the app target → Signing & Capabilities, choose your Apple Developer team and a unique bundle identifier. Enable automatic signing. No signing team or credentials are included in source.
3. Verify **HomeKit** is present; otherwise use **+ Capability → HomeKit**. The supplied entitlement sets `com.apple.developer.homekit = true`. Provisioning must include this entitlement. Apple Developer account/provisioning availability determines supported device installation/distribution.
4. Verify Info.plist has exactly: `NSHomeKitUsageDescription = Jarvis uses Apple Home to show and control the accessories you choose.` The app has no microphone permission or always-on listening.
5. Connect an iPhone with iOS 17+, enable Developer Mode if prompted, trust the Mac, select that phone as the run destination, then **Product → Run**. Sign in to Apple Home in the iPhone's Home app and verify your accessories work there first. Pairing is handled by Apple Home, never Jarvis.
6. In the companion: **More → Connections → Apple Home → Connect Apple Home**. The native HomeKit manager starts only after that tap. Grant HomeKit permission on the system prompt. Select a home, then explicitly enable the desired accessories and scenes.
7. Test first using one noncritical light. Read status, turn it on, inspect Apple Home, then turn it off. Approve a thermostat's safe Celsius range before changing it. Device metadata limits are checked as well.

**Connection is not verified by this repository or a successful web deployment.** This Linux workspace cannot run Xcode, sign the app, install it, or authorize a real HomeKit home. Native build/unit tests and real-device acceptance remain to be run on a Mac/iPhone. No TestFlight/App Store publication has been performed.

## Local controls and privacy

`HomeKitProvider` is independent of the LLM. `HomeKitStore` is its local HomeKit implementation. Approved accessory/scene UUIDs and thermostat ranges are stored in app-local UserDefaults, never sent in API payloads. There is no topology synchronization or iCloud container entitlement. HomeKit remains usable without cloud sign-in.

First release supports selected lights, switches, fans, brightness, thermostat state/targets within user-approved ranges, and safe approved scenes. Locks, garages, alarms, cameras, security/privacy accessories and media control are excluded. Security service types and sensitive accessory names fail closed. Mark any generically named security/privacy switch as excluded in the accessory screen; this revokes its approval and excludes scenes targeting it. Scenes containing unsupported/security operations or thermostat writes are excluded; supported scene execution always displays an exact, expiring native confirmation. Scene readback shows whether the scene is executing, not that every target accessory reached its requested state.

Disconnect clears local approvals, temperature ranges, published topology and pending confirmations. It stops future local actions and attempts to unregister cloud handoff. A HomeKit write already dispatched cannot be recalled. To revoke OS permission, use iPhone Settings → Privacy & Security → HomeKit (or the app's permission settings). Denied/restricted/revoked access prevents all actions. Device and provider errors use safe messages.

## Optional web-chat → iPhone handoff

1. Sign in to the same Jarvis cloud account using the secure native OAuth browser flow. PKCE and state are verified. Only a DeepSpace session is saved to device-only Keychain; Apple ID credentials/HomeKit authorization are never requested by Jarvis.
2. Tap **Share approved names and actions with chat**. This is explicit consent to upload selected friendly names, exact action labels and independently generated random action IDs. No HomeKit UUIDs, room/home topology, pairing data, serials or local addresses are shared.
3. Keep the companion open in the foreground. In web chat say “Turn on the living room lamp.” The assistant discovers your shared exact actions and queues the matching opaque ID. Ambiguous names require clarification. The iPhone polls, claims once, and revalidates its current local approval/permission/service before writing. Scenes require native confirmation.
4. The assistant must report **waiting**, not success, at queue time. The companion sends a sanitized activity report. For a power command it attempts characteristic readback: only verified on/off reports justify “the lamp is on/off.” A successful write with unavailable readback remains explicitly unverified. Client reports are not independent physical-state proof.

The first handoff supports fixed on/off/status and scenes. Brightness and thermostat controls are native-screen only; arbitrary model-generated parameters cannot enter HomeKit. Requests expire after 60 seconds. There is no background polling, push wakeup, automatic device retry, or offline command replay. Manifest IDs/mappings are session-local: re-share after app restart or selection changes. Use one companion per cloud account; sharing from another phone replaces the manifest and invalidates old requests. Disabling handoff clears the local mapping immediately and attempts cloud unregister; even if unregister fails, stale requests cannot execute locally.

## Sanitized audit API

Authenticated `POST /api/homekit/audit`, `Idempotency-Key: <random event UUID>`:

```json
{
  "deviceName": "Living Room Lamp",
  "actionType": "power_on",
  "state": "completed",
  "timestamp": "2026-10-03T12:00:00Z",
  "message": "Verified on by Apple Home readback."
}
```

Bearer identity and membership are verified server-side. Body limit 32 KB, strict schemas, bounded text/timestamps/actions and per-user HomeKit quota 60 requests/minute reject extra/raw metadata and common private-material patterns. Idempotency prevents duplicate reports; conflicts return 409. Native audit records are marked `native_client_reported`, isolated by user and retained for at most 90 days (cleanup on access). `GET /api/homekit/audit` returns the latest 100; authenticated `DELETE` clears that user's reports. View them in web **My space → Apple Home activity** and the chat's compact local activity panel.

Signed-in local action audits queue offline in a protected, backup-excluded file, max 100 records/7 days, bound to the verified cloud user. Unsigned actions are not later uploaded under another identity. Retry only audit delivery, never HomeKit device writes. The phone communicates audit/handoff data only to the configured HTTPS Jarvis origin.

Handoff endpoints: `GET/POST /api/homekit/actions`, `POST /api/homekit/requests` with `{ "actionId": "..." }`, `POST /api/homekit/poll` with `{}`. Cloud requests have no HomeKit parameters or execution credentials. Native auth uses registered callback `jarvis-companion://auth/callback`; when changing backend/scheme update both Info.plist and `NATIVE_AUTH_REDIRECT_URIS` on the server.

## Tests

On a Mac, choose **Product → Test** or:

```sh
xcodebuild -project JarvisCompanion/JarvisCompanion.xcodeproj \
  -scheme JarvisCompanion -destination 'platform=iOS Simulator,name=iPhone 16' test
```

Choose a simulator available in your Xcode installation. Mock-provider tests exercise the shared approval policy, denied/revoked access, safe thermostat/brightness bounds, scene selection, excluded security services and opaque action IDs. They require no real HomeKit home. Simulator unit tests do not prove actual HomeKit authorization/device support. Run the signed-device steps above for that.
