# JARVIS on DeepSpace

An iPhone-friendly holographic dashboard and personal assistant with streamed AI conversations, foreground Talk/wake sessions, interruptible spoken replies, private conversation history, explicit preference memory, persistent one-time reminders, notifications, and action-bound deletion confirmations.

This project is the live DeepSpace adaptation. The modular Python backend in the workspace root remains separate. Live weather, BBC news and Wikipedia retrieval are available. Apple Home and Apple Music controls use user-registered, explicitly tapped iPhone Shortcuts; direct library access, calendar and email are not connected. No provider success is simulated in production. Background wake-word detection and push notifications are not implemented. Dictation availability depends on browser/device support; iPhone keyboard dictation is a fallback.

## Run

Use Node 24 and npm 11.6 or newer:

```sh
npm ci
npx deepspace auth login
npx deepspace dev start
npm run validate
npm run lint
npx deepspace test run all
```

With `LLM_MODE=groq`, the app owner’s conversations and compaction use Groq with `GROQ_API_KEY`. The default Groq model is `openai/gpt-oss-120b`; `GROQ_MODEL` is an optional server setting. Other users use native DeepSpace chat billed to their own credits; they cannot spend the owner’s Groq/Fish credentials. Groq is bounded to 6 steps, 16 executed tools, 2,048 output tokens, no automatic retry, and a 45-second turn timeout. Native chat uses DeepSpace AI credits billed to the signed-in caller. The default model is the catalog's GPT Luna when available. Keys are supplied through the encrypted app secrets store and never included in source or client bundles. In Settings, save your actual timezone before relative-date reminders. Unspecified reminder times prompt clarification.

## Architecture

- `worker.ts`: Hono assembly, security headers, Durable Object wiring.
- `src/ai/agent.ts`: one shared tool registry for web chat and local agent.
- `src/ai/chat-routes.ts`: stable SSE protocol, bounded tool loop, conversation compaction/persistence.
- `src/ai/tools.ts`: original JARVIS prompt and server-validated tools.
- `src/schemas`: canonical shared schemas; private owner-scoped collections. Raw realtime reminder/memory creation is denied; a validated internal record boundary stamps verified caller identity.
- `src/jarvis/routes.ts`: memories, reminders, preferences, capabilities, confirmations, optional voice endpoints.
- `src/jarvis/confirmation-room.ts`: five-minute, one-use user/action-bound confirmation tokens, durable quotas and deletion audit metadata.
- `src/cron.ts`: persistent minute-based reminder delivery to the user's notifications collection. Each tick processes up to 500 earliest scheduled reminders; this is an initial implementation, not a large-scale push delivery system.
- `src/components/JarvisChat.tsx`: mobile UI, normalized stream consumer, explicit device speech controls.

## Credentials

All `.env.example` values are intentionally blank. Never commit `.env`, `.dev.vars`, or keys. DeepSpace generates local runtime configuration; app credentials belong in its encrypted Secrets store. Do not hand-edit `.dev.vars`.

Owner-only server voice uses `GROQ_API_KEY` for Whisper transcription and `FISH_AUDIO_API_KEY` for Fish Audio speech. Store credentials through DeepSpace Secrets and redeploy. The Fish voice reference is `612b878b113047d9a770c069c8b4fdfe`. Listen requests server speech and falls back to the browser/device speech service if Fish fails. The uploaded greeting has a separate player. Fish HTTP 402 means API funding is required at https://fish.audio/app/developers, separate from subscription credits.

## Interface/API

Use the verified DeepSpace session's `getAuthToken()` as a Bearer token, never a client-supplied user ID:

1. `POST /api/ai/chats` with `{}` creates a conversation and returns `{chat}`.
2. `POST /api/ai/chat` with `{chatId,userMessageId,content,modelId}` returns normalized AI SDK UI-message SSE: start, text-start/delta/end, tool-input/output events, finish. `src/components/ChatPanel.stream.ts` maps it into stable app text/tool states. Private reasoning is suppressed. Chat messages are persisted in `ai-messages` and synchronized through owner-filtered RecordRoom subscriptions.
3. Query `ai-chats`, `ai-messages`, `memories`, `reminders`, `notifications`, and `preferences` through authenticated SDK `useQuery`. All personal reads remain owner-scoped, including admins.
4. `POST /api/jarvis/memories`: `{content,category}`. Only explicit memory requests are stored.
5. `POST /api/jarvis/reminders`: `{title,dueAt,timezone}` with future ISO timestamp and valid IANA timezone.
6. `POST /api/jarvis/preferences`: `{timezone,responseMode}` (`normal`, `brief`, `technical`).
7. `POST /api/jarvis/confirmations/request`: `{collection,recordId}`; collection is memories, reminders, or ai-chats. Show the returned exact action in your confirmation UI. Approval: `POST /api/jarvis/confirmations/approve` with `{token}`. Expiration, replay, or another user fails. Conversation deletion cascades its messages. Direct deletion and forged message writes are denied.
8. `GET /api/jarvis/capabilities` reflects configured integrations; unavailable services remain false.
9. Optional `POST /api/jarvis/voice/transcribe`: multipart `audio`, up to 1.8 MB, returns `{transcript}`. Optional `POST /api/jarvis/voice/speak`: `{text}`, up to 4,000 characters, returns MP3. These are restricted to the app owner, because they use owner credentials.

HTTP error codes are safe public identifiers. AI/voice requests are subject to durable per-user quotas: 30 action requests/minute and 5 voice requests/minute; 429 includes Retry-After. Tool arguments are schema-validated on the server. No shell execution or destructive model tool is exposed. Retrieved information and memories are untrusted data and cannot grant authorization. Prompt wording is a defense-in-depth measure; permissions are enforced separately.

## Extending

Add a provider adapter, a schema-validated tool in `buildTools`, availability checks, and tests. Register it once; do not duplicate reasoning logic. Tools that change consequential state must go through explicit confirmations tied to validated exact parameters. Never use privileged cron/action contexts with unverified user/resource identifiers.

## Tests and deployment

Vitest checks contracts and permission invariants. Playwright checks real auth, private memory across two users, confirmation cancellation/approval/replay/isolation, mobile layout, and conversation streaming/persistence. The external AI boundary may be fixture-backed during tests to avoid charges; auth, routes, tool execution and storage remain real. Device microphone and speech behavior need a physical iPhone check.

In a managed development container whose workerd runtime cannot use the inherited proxy, run `node scripts/managed-dev-proxy.mjs`, then run tests with `JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx deepspace test run all`. This patches only the local installed runtime adapter, routes egress through Node's trusted session proxy, and fixtures only the external OpenAI completion endpoint. It does not change app source, authentication, authorization, tools or storage, and is never enabled for deployment. Without that fixture the paid AI test explicitly skips; the rest of the suite still runs.

```sh
git add .
git commit -m "Build JARVIS personal assistant"
npx deepspace deploy --json
```

DeepSpace is the source authority. Do not add a GitHub remote without deciding to change source authority before the first release. Production secret changes take effect on the next deploy. Review `deepspace logs`, `activity`, `releases`, and `app usage` after publication. Open in iPhone Safari, sign in, and use Share → Add to Home Screen.

### Owner startup greeting and custom sample voice

The owner’s uploaded MP3 plays once after initial voice activation or the first eligible session tap. Say or type **repeat greeting** to hear it again; there is no on-screen greeting player.
Safari requires a user gesture for audio playback. The recording is served through
`GET /api/jarvis/voice/greeting`, with authentication, owner authorization and
`Cache-Control: no-store`; it is not a public asset. Replace
`src/jarvis/startup-audio.ts` to change the bundled owner greeting.

The uploaded recording has also been used to create a private Fish Audio voice.
Its returned model ID is stored as `VOICE_ID` in the encrypted DeepSpace secrets
store. Speech generation requires separate Fish API credits, even when voice
creation succeeds. Startup playback does not require Fish credits.

The assistant dashboard preserves the complete desktop HUD on iPhone, including
all side panels. The initial overview fits the complete dashboard on screen.
Tap **Zoom dashboard**, then swipe horizontally to reach its controls;
Safari pinch zoom remains enabled. Other application pages remain responsive.

### Location, Apple Home, Apple Music and live information

Open **Apps / Connections** to configure services. GPS is requested only after
**Use my iPhone location**; save explicitly. Coordinates are private to the user
and sent to Open-Meteo for weather requests. Clear saved location removes its
stored name and coordinates. A location lookup in chat can send those details
to the selected LLM, so use a general area when precise coordinates are unnecessary.

Apple Home is not a web API. In iPhone Shortcuts, create **Control My Home**
actions for your TV, lights, plugs or fans and register the exact On/Off shortcut
names in **Smart home**. If a TV cannot change power through Apple Home, use its
manufacturer's supported Shortcut actions. Tapping On/Off opens a review sheet; only confirmation opens the corresponding
`shortcuts://run-shortcut?name=...` URL. The iPhone controls authorization and
execution; JARVIS does not claim success or read device status. Removing a
connection clears its registered names. Locks and alarm controls are unsupported.

For **Apple Music**, make Play Music and optionally Pause Music shortcuts and
register their names. This uses the iPhone's Apple Music subscription and app;
it does not grant JARVIS direct library access. No Apple credentials are collected.

Listen requests server-side Fish Audio and falls back to device speech when
Fish Audio or audio playback is unavailable. The uploaded startup greeting
remains available separately. Device speech may use the browser or OS speech
service; it is not a guarantee of offline synthesis.

**Live information** offers Open-Meteo weather, BBC RSS headlines and live
Wikipedia searches with source links/timestamps. It is not a general web search.
Provider errors produce unavailable status, never invented data. Public Open-Meteo
access is for noncommercial use; commercial deployment requires its paid API plan.
New tools: `get_weather`, `get_news`, `search_online_information`, `get_location`,
`list_smart_devices`, `prepare_device_control`. Device control remains pending a
user tap. **Security** reports authenticated session, HTTPS and server reachability;
it does not monitor security devices. Games and Internet navigation were removed.

Connection routes (all require authentication and membership):

- `POST /api/jarvis/connections/location`: `{ label, latitude, longitude, enabled: 1 }`
- `POST /api/jarvis/connections/devices`: `{ name, kind, onShortcut, offShortcut, enabled: 1 }`
- `POST /api/jarvis/connections/disable`: `{ collection, recordId }`
- `GET /api/jarvis/connections/weather`
- `GET /api/jarvis/connections/news`
- `GET /api/jarvis/connections/search?q=...`

### Automatic device replies

Tap **Voice off · turn on** in the dashboard to activate speech with an audible
acknowledgement (a user gesture is required on iPhone). New completed replies are
spoken once. Loading old history or navigating Home/Chat does not replay replies.
Turn voice off or use Stop speaking to cancel. Voice activation is per mounted
session; no background speech or microphone capture is enabled. Speech errors
show a safe message; check media volume and retry Listen if Safari blocks playback.

### Direct Apple Music (MusicKit v3)

The Apple Music screen loads Apple's official script only when an authenticated
owner has configured `APPLE_MUSIC_DEVELOPER_TOKEN`. Obtain an Apple Developer
membership, enable MusicKit for a media identifier, create its key, and generate
an ES256 Apple Music developer JWT with your Team ID, Key ID and signing key.
See https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens.
Store the generated token in the DeepSpace encrypted secrets store and redeploy.
Never upload the `.p8` signing private key to the interface. MusicKit requires
its developer JWT in the browser; the owner-only no-store configuration route
exposes that public-purpose token only, and rejects expired or malformed values.

Flow: Connect Apple Music → app permission explanation → Continue with Apple
Music → Apple's authorization → Connected to Apple Music. This is MusicKit
music authorization, not Sign in with Apple identity. Apple does not provide an
Apple ID account display name. The music user token stays with MusicKit in the
browser; no server token-save endpoint or background music access is enabled.
Logout in Settings also attempts to disconnect MusicKit.

Listening context is opt-in and stays in the browser, not the LLM. Search,
Play, Pause, Previous and Next call MusicKit; availability depends on the real
queue and subscription. New playlist opens an exact-name review with 0 songs;
Cancel sends nothing, Create playlist submits exactly one library request, and
unconfirmed writes are not retried automatically. No playlist is created by the
assistant tool loop. These flows are tested with a mock MusicKit boundary;
real Apple authorization/playback require the still-missing developer token.

Focus/Workout/Relax shortcuts can instead open real Apple Music playlist share
URLs without MusicKit. Placeholder IDs are rejected; connections are private and
editable. Opening Apple's website never marks JARVIS connected or claims playback.

### Weather permission and live cards

Weather offers Use current location / Enter a city instead / Not now. GPS is
requested only on the explicit button, uses low-accuracy mode with a 10-second
timeout and up to 15-minute cache, and rounds coordinates to two decimal places.
Current-location requests are temporary and not automatically persisted. Selecting
a city explicitly saves it privately. Disconnect clears the saved weather location.

`GET /api/weather?lat=...&lon=...` requires a JARVIS bearer token, membership,
validated coordinate ranges and quota. It returns normalized Fahrenheit conditions
and forecasts. Open-Meteo is available without a credential. Optionally configure
`OPENWEATHER_API_KEY` server-side for OpenWeather current conditions, retaining
Open-Meteo forecast data. Provider failures never expose API keys or raw error bodies.
`GET /api/jarvis/connections/cities?q=...` performs bounded Open-Meteo geocoding.
Displayed temperatures, track names and connection statuses are not hardcoded demos.

Fish voice: store FISH_AUDIO_API_KEY in DeepSpace secrets (never frontend code). POST /api/tts accepts authenticated JSON {"text":"Good afternoon."}, at most 1000 characters, and returns audio/mpeg. Only the owner may spend this key; the voice rate limit is five requests per minute. Fish reference ID: 612b878b113047d9a770c069c8b4fdfe. HTTP 402 requires Fish API credits. Settings has Speak replies, Test voice, and Slow/Normal/Fast playback. Stop, microphone activation, page hiding and navigation cancel speech. Wake-word activation is not configured.

### Smart home: secure Home Assistant bridge

Cloud direct Roku ECP access is retired. `ROKU_TV_IP` is not used by deployed cloud execution; legacy Roku routes reject access with `home_assistant_bridge_required`. Never expose Roku port 8060 publicly. Control a Roku through an approved Home Assistant media entity Native Apple Home media/TV control is outside the first release.

Configure only server-side encrypted secrets: `HOME_ASSISTANT_URL` (public DNS HTTPS origin, default TLS port), `HOME_ASSISTANT_TOKEN` (long-lived token), and `HOME_ASSISTANT_ALLOWED_DEVICES` (explicit JSON allow-list). Missing optional credentials disable the card rather than breaking chat. No Home Assistant connection has been provisioned here.

Example allow-list format (entity values must match your own configured Home Assistant):

```json
[
  {
    "entity": "light.bedroom",
    "name": "Bedroom light",
    "room": "Bedroom",
    "actions": ["status", "on", "off", "brightness"]
  }
]
```

Home Assistant runs at home and pairs/bridges supported accessories locally. Jarvis talks only to its authenticated public HTTPS API, never private IPs, HomeKit or device ports. Redirects, URL credentials, arbitrary URLs/services/entities and local domains/IPs are rejected. The owner-only Connections → Home card shows normalized selected devices, real state/time, Test connection, Disconnect/Reconnect, capabilities and exact expiring confirmations. Every device-changing action requires review and a consumed, configuration-bound server token; status reads remain read-only. Sensitive categories, unlock/open/disarm, scenes, and media power off retain the same exact-action protection. Camera controls and purchases/account changes are unsupported; privacy/security switches require confirmation. HTTP acceptance is not proof of physical completion; no blind write retries occur.

Owner-scoped generic tools automatically expose approved capabilities through `list_home_devices`, `get_home_device_status`, `control_home_device`. Secrets and raw provider errors/entity IDs/private addresses never appear in normal UI. Home Assistant integration and native Apple Home are separate providers.

### Native iOS companion

See [ios/README.md](ios/README.md) and open `ios/JarvisCompanion/JarvisCompanion.xcodeproj` on a Mac. Direct Apple Home control is native-only, with local approvals and typed first-release actions. Web chat can queue explicitly shared opaque actions for the foreground companion. Authenticated sanitized audits appear in My space's activity log. A signed build on an iPhone is required to verify actual HomeKit connection; no native app has been installed or published from this workspace.

### Radar dashboard and spoken startup greeting

The Home dashboard follows the supplied cyan radar/globe layout with a live device-clock date/time, saved location, live weather where connected, upcoming reminders and client-reported local activity. System cards show actual server/network availability; they do not invent armed security, TV state, network speeds or music playback. The skyline/globe are original decorative artwork.

The original uploaded greeting audio is played by JARVIS's speech controller, with no embedded audio controls or greeting replay button. For the owner with Fish voice available, spoken feedback starts enabled unless explicitly disabled. The first eligible tap/keyboard gesture unlocks one greeting per browser-tab session; iPhone browsers require an initial gesture before audio. Enabling voice manually also greets the owner. Turning voice off is respected. Stop, microphone activation and leaving the app cancel playback and pending requests. Say or type **repeat greeting**, **repeat the greeting**, or **Jarvis, repeat greeting** to replay it locally, without an LLM request. Other voice transcripts still appear for review before sending. If the saved audio is unavailable, device speech can deliver the short greeting. Wake-word detection/background listening remain unconfigured.

### Jarvis Focus Mode

Open **Focus** in the dashboard navigation or `/home?mode=focus` for a full-screen voice-first canvas. Tap the microphone to grant permission and speak; interim transcripts appear live, and final transcripts submit through the existing chat/tool pipeline. Keyboard entry, Stop, Escape, and Exit remain available. This is foreground interaction, not background wake-word detection.

The projected particle sphere uses local Web Audio frequency analysis for microphone input and Fish Audio MP3 playback. Microphone analysis never connects to speakers or uploads audio; browser speech recognition uses the browser's normal transcription implementation, which may use its provider's service. Microphone tracks stop on cancel, exit, page hiding, or failure. Device speech-synthesis fallback cannot expose an audio buffer to Web Audio, so it uses a gentle pulse rather than a synchronized waveform. No additional secrets or graphics dependencies are required.

### 3D neural plexus and HUD captions

The dashboard and Focus Mode now share a Three.js/WebGL constellation with 220 nodes, a cyan-white sprite bloom, dynamically colored proximity links, bounded organic drift, pointer tilt and four conversation states. The audio meter exposes separate 20–250 Hz bass, 250–2,000 Hz mid and 2,000–9,000 Hz high bands. Bass expands the constellation/core; mids and highs brighten links and add jitter. Rendering uses a capped pixel ratio, frame-rate-independent motion, preallocated geometry, and stops drawing while hidden. GPU resources and animation callbacks are disposed on exit; unsupported/lost WebGL falls back to an SVG radial ring.

HUD captions show blue italic user transcripts and progressively reveal assistant words, with cyan metrics and common device names. This is a presentation animation; MP3 playback does not provide exact word timestamps. Reduced-motion settings disable caption animation and continuous particle drift/rotation. Voice replies remain limited to two sentences, and tool/backend status remains authoritative. Use **Full Screen Focus** to hide the surrounding dashboard.

### Cinematic Focus refinements

Visualizer implementation lives in `src/components/visualizer/` (`NeuralPlexus`, `HUDSubtitles`, `RadialRing`); `src/components/layout/DashboardLayout.tsx` owns the dual-view transition. The former flat component paths remain compatibility exports. The analyser uses FFT 256, with 220 nodes inside a radius of 95 and idle connections within 65 world units. Focus scales the viewport to 1.35 and fades peripheral panels over 400 ms; GPU resources are released after the transition. WebGL unavailability or loss uses an audio-reactive SVG radial ring.

Mobile now defaults to a single column. **Zoom dashboard** retains the optional desktop layout for horizontal exploration. Goldsboro, NC is offered as an editable manual weather-city choice; only a city you explicitly save becomes your account's location, and device rows never claim connectivity without provider confirmation.

**Start continuous voice session** opens Focus Mode and alternates foreground listening with speech playback. **Talk mode** provides the same turn loop within the dashboard. **Wake Jarvis** first explains microphone use and browser recognition, then accepts commands beginning with “Jarvis” or “Hey Jarvis” while the app is open. This uses browser speech recognition, which may process audio online; it is not local-only keyword detection or a background listener. Voice sessions wait through TTS preparation before rearming and end on microphone errors, page hiding, Exit, keyboard entry, explicit Stop, or a two-minute inactivity timeout. Browser recognition must be supported; some browsers may require another tap to restart recording.

A local Web Audio energy detector ends a heard turn after sustained silence and listens for sustained user speech during Fish Audio or device TTS playback. Detected speech stops output and starts the next recognition turn. Echo cancellation and adaptive thresholds reduce self-interruption; this is not speaker identification and performance depends on the microphone, room and browser. Headphones improve separation. Tapping the microphone always stops current output immediately. Microphone tracks, playback, analysers and animation callbacks are released when the session ends or account changes.

Build and checks from the app directory:

```sh
npm ci
npm run dev
npm run build
npm run validate
npm run lint
npx deepspace test run all
```

Normal browser tests use DeepSpace test accounts. To mock only the paid model boundary as in CI: `JARVIS_TEST_AI=1 npx deepspace test run all`. Local proxy environments also use `JARVIS_DEV_PROXY=1` and the environment's configured CA/proxy settings. No backend API, Home Assistant/Roku provider policy, confirmation, or audit authorization changed in this UI refinement.

### Cinematic dashboard

The dashboard uses a locally served cyan city backdrop, translucent illuminated cards, concentric orbital rings, a holographic globe, and three SVG waveforms driven by the existing local audio meter. `DashboardHologram` wraps the live particle scene only in dashboard mode; Cinematic Focus retains its uncluttered plexus. The top bar shows the current device date/time and saved location/weather, and keeps the authenticated account menu available. Connection states, reminders, activity, music availability and all action confirmations use existing live services rather than the reference image's sample data. The iPhone layout remains one column with an accessible bottom microphone; optional desktop zoom is retained.

The lower globe is a live Three.js state indicator with geographic silhouettes, orbiting rings, inward/outward particles, a glowing core and a responsive SVG fallback. A single visual-state projection of the existing voice/session and request state drives **idle**, **listening**, **thinking**, **speaking**, **action-requested** and **error-or-fallback**. Thinking indicates processing, never completion percentage. Actual analyser amplitude drives speech when available; measured silence stays still, and unavailable device-voice analysis uses a deterministic pulse only while speech is active. Approved native dispatches and streamed tool requests produce one 900ms amber pulse before returning to the current session state. Fish failures pair the muted globe with “Fish Audio unavailable — using device voice.”

The globe's single sampling loop also drives the surrounding CSS rings. It cancels RAF while hidden and resumes without a rotation jump. Reduced motion disables drift, flicker, waves and scaling while preserving state color/opacity; resources, listeners and observers are released on unmount or graphics fallback. Rapid interruption follows the live listening → thinking → speaking → listening cycle without independent animation flags.

The TV status reads the authenticated Home Assistant bridge and only selects an unambiguous approved TV. **Turn Off TV** submits the user's command through the existing tool loop; exact action confirmation remains required. Direct cloud access to private Roku ECP addresses remains disabled. Header weather refreshes from the saved location every five minutes while visible and when the app returns to the foreground.

The **Now Playing** card reads the authorized MusicKit session's actual title, artist, artwork and progress, and sends playback controls to that session. It does not authorize automatically or read listening history. Missing configuration or authorization shows a Connections link. Apple Music requires a valid developer token and the user's Apple authorization; Home Assistant requires its separately configured bridge. The assistant never treats a dashboard button tap or queued action as verified completion.

The desktop shell uses a viewport-height grid for its header, shrinking content row and pinned command bar. Left/right panels scroll internally on short displays; the microphone stays above the screen edge. Mobile keeps its single-column view and optional desktop zoom. The shell, content, right column and footer also expose `jarvis-desktop-shell`, `jarvis-main-content`, `jarvis-sidebar-right` and `jarvis-command-bar` class names.

### iPhone TV Siri Shortcuts

On iOS Safari, **KY TV** has **Turn On TV** and **Turn Off TV** controls. Create two working Apple Shortcuts with the exact names **Tv On** and **Tv Off**, and connect their actions to your TV locally. Review the corresponding JARVIS sheet, then tap **Run Tv On** or **Run Tv Off** to open `shortcuts://run-shortcut?name=Tv%20On` or `shortcuts://run-shortcut?name=Tv%20Off`. Cancel opens nothing. Simple user commands such as “Jarvis, turn off the TV” open the same review; conditions, ambiguous device names and compound tasks stay with the existing tool loop. Voice capture and playback end before the native handoff.

Safari cannot verify that a Shortcut exists, succeeded or changed the TV's power/network state. A reviewed handoff shows **Action Dispatched** with the requested On/Off state marked unverified. Recent Activity records **KY TV power command dispatched**, the action and a timestamp; it never assumes an Online/Offline state. With spoken replies enabled, JARVIS says “Sending power command to the TV now, Sir.” Opening Shortcuts may pause browser speech; the on-screen status remains available. After observing the TV, tap **Confirm TV is on/off** for a separately labeled **user-confirmed, not device verified** state. This local report cannot authorize Home Assistant or any server action. History is sanitized, limited to 20 entries and stored only in this browser under the authenticated account. It is separate from the backend HomeKit audit trail. Other browsers continue to use the connected Home Assistant provider or existing Connections shortcuts.

### Play Vamp on iPhone

Use your existing enabled Apple Shortcuts music connection with display name **Play Vamp** in Connections. Its **Play shortcut name** is the exact iPhone shortcut JARVIS uses; no second configuration is created. In iOS Safari, tap the dashboard **Play Vamp** quick action or the music card's **Review Play Vamp request** button, type “Play Vamp,” or say “Jarvis, play Vamp.” The **Play Vamp** review sheet says “This will ask your iPhone to start Vamp in Apple Music” and identifies the saved shortcut. **Send Play Request** synchronously opens `shortcuts://run-shortcut?name=<encoded saved shortcut name>` in its click handler; Cancel sends nothing. Missing, disabled, ambiguous or changed connections cannot dispatch. No Apple Music developer token is required for this local Shortcut handoff.

Recent Activity records **Apple Music request dispatched: Play Vamp** with the current local timestamp. The command shows **Playback requested — awaiting confirmation** and offers **Confirm Playing** and **Not Playing**. Confirm Playing sets **Reported playing: Vamp** and adds **User reported playback started: Vamp**; Not Playing sets **Playback not confirmed** and adds **User reported playback did not start: Vamp**. Both display **User-reported — not provider verified**. Reports never change the MusicKit player, relaunch the Shortcut, or replace the dispatch entry.

MusicKit status appears separately. Only a fresh, authorized, active browser playback observation with the exact Vamp playlist container (`pl.u-JPAZbAPTDzXod7v`) and a valid current item can show **Playing: Vamp**, source **MusicKit verified**, and add **MusicKit verified playback: Vamp**. Track titles, playlist membership, and Shortcut dispatch are not verification. Missing playlist context, a different playlist, paused playback, unavailable configuration, and revoked authorization keep the result unverified. If verification ends, the manual/request display returns and all reports remain in history; stored verification events never restore a current playing state. Repeated SDK events add at most one verification history entry per dispatch.

MusicKit web observes its own browser player; it cannot verify audio started in the native Apple Music app by an iPhone Shortcut. Native playback usually needs the manual-result controls. Spoken replies use exactly “Sending the Vamp play request now, Sir.” Browser speech can pause when iOS opens Shortcuts. Local histories are bounded, isolated to the signed-in account and retained without automatically replaying commands after reload.

### Saved music routing and live globe update

Exact changed files for this update:

```text
README.md
src/components/JarvisChat.tsx
src/components/JarvisFocus.tsx
src/components/JarvisHud.tsx
src/components/devices/VampShortcutDialog.tsx
src/components/devices/useVampShortcut.ts
src/components/devices/useVampShortcut.test.ts
src/components/devices/vamp-connection.ts
src/components/focus-audio.ts
src/components/focus-audio.test.ts
src/components/jarvis-dashboard.css
src/components/jarvis-speech.ts
src/components/visualizer/DashboardHologram.tsx
src/components/visualizer/HUDSubtitles.tsx
src/components/visualizer/HolographicGlobe.tsx
src/components/visualizer/dashboard-hologram.css
src/components/visualizer/holographic-globe.css
src/components/visualizer/useAssistantVisualState.ts
src/components/visualizer/visual-state.ts
src/components/visualizer/visual-state.test.ts
tests/globe-states.spec.ts
tests/helpers/vamp-connection.ts
tests/vamp-shortcut.spec.ts
tests/vamp-verification.spec.ts
```

Focused checks (60 unit tests; 11 music/globe browser tests):

```sh
npm run test:unit -- src/components/devices/useVampShortcut.test.ts src/components/focus-audio.test.ts src/components/visualizer/visual-state.test.ts src/components/jarvis-speech.test.ts
npm run type-check
npm run lint
npm run build
JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 npx deepspace test run e2e --grep 'Vamp|live globe' --json
```

The browser music fixtures save a real, owned Connections record with display name **Play Vamp** and a different play shortcut name, check the existing Play link, then exercise text/voice review, synchronous handoff, cancellation, manual outcomes and independent MusicKit evidence. External playback/provider boundaries are mocked; no paid APIs or native iPhone actions run in these automated tests.

Remaining iPhone-only checks: on the live Safari dashboard, type/say “Play Vamp,” verify the sheet names your existing saved shortcut, approve and observe the actual Apple Music app. Cancel must open nothing; returning to JARVIS and reporting Playing/Not Playing must stay labeled user-reported. Repeat Talk/Focus sessions and test microphone interruption, browser/device voice, Reduce Motion and background/foreground behavior on the actual phone. Browser MusicKit verification applies only to its own authorized playback, not native Shortcut playback.

### Phase 1: iPhone Safari voice output

Direct Send, Talk Mode, Wake Jarvis, microphone, voice activation and voice-test
gestures resume the existing audio context and prepare native speech before
asynchronous work. The preparation is a muted utterance, not an audible greeting
or a success signal. Device speech cancels the previous queue, waits for voices
(including `voiceschanged`), retains a fresh `en-US` utterance with an available
voice, and reports speaking only after `onstart`. `onend` reports completion;
errors and a four-second no-start timeout report failure. Rapid interruption
invalidates callbacks and voice-loading work from the previous turn.

Settings → **Test Device Voice** says **“Device voice is working.”** directly
from the tap flow and reports actual Started, Completed, Blocked or Browser
error events. Waiting is not success. A failure shows **“Device voice could not
start. Tap Test Device Voice and check your audio output.”** Check the phone's
volume and selected speaker/Bluetooth output when testing. Hiding the page or
leaving Safari cancels pending and active speech. Returning does not replay it;
tap a voice control again to unlock a new turn.

Fish Audio remains behind the authenticated, owner-only, rate-limited
`POST /api/tts` endpoint. The existing server secret is **FISH_AUDIO_API_KEY**;
it is never returned to the browser. A failed request preserves **“Fish Audio
unavailable — using device voice.”** even if the device also fails. Settings
shows a separate sanitized provider diagnostic when an upstream status exists:

| Fish status | Category | Recommended fix |
| --- | --- | --- |
| 401 | Missing or invalid key | Replace the server secret with a valid API key and redeploy. |
| 402 | Credits or plan issue | Fund Fish API billing; subscription credits are separate. |
| 403 | Permission issue | Check account/API and reference permissions. |
| 404 | Voice/model unavailable | Verify the configured reference is accessible to the account. |
| 429 | Rate/concurrency limit | Wait, then make a single new request. |
| Timeout or 5xx/network | Temporary provider failure | Check provider/network availability and retry manually. |

Missing local configuration is distinguished from an actual upstream 401. Logs
contain only fixed categories, actual upstream HTTP status when received,
duration, model/reference identifiers, and whether fallback is required. They
exclude speech text, headers, credentials, provider bodies and thrown messages.
Intentional Stop/navigation cancellation does not produce a provider-outage log.
Receiving a response is not proof that playback started. Automated tests mock
these boundaries and do not prove the account's current Fish API balance or
physical iPhone audio output.

Exact phase 1 files:

```text
README.md
src/components/FishVoiceSettings.tsx
src/components/JarvisChat.tsx
src/components/device-speech.ts
src/components/device-speech.test.ts
src/components/jarvis-speech.ts
src/components/jarvis-speech.test.ts
src/jarvis/fish-audio.ts
src/jarvis/fish-audio.test.ts
src/jarvis/routes.ts
tests/collab.spec.ts
tests/device-voice.spec.ts
```

Focused verification:

```sh
npm run test:unit -- src/components/device-speech.test.ts src/components/jarvis-speech.test.ts src/components/focus-audio.test.ts src/components/visualizer/visual-state.test.ts src/jarvis/fish-audio.test.ts
npm run type-check
npm run lint
npm run build
JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 npx deepspace test run e2e --grep 'device voice|voice activation|speech|continuous voice|wake|Focus|live globe|Vamp|TV' --json
```

The existing voice-activation fixture counts only audible utterances, emits
speech start/end events, and waits for the acknowledgement before sending the
next command. Muted audio preparation is not a completed spoken reply.

Physical iPhone checks still required: tap Test Device Voice and hear the full
phrase; verify Started then Completed, volume/Bluetooth routing, voice loading
after a fresh Safari launch, and a live Fish voice request with real playback.
Start Talk Mode/Wake Jarvis/microphone and send a message; interrupt speech and
repeat several sessions without queued replies. Background Safari or lock the
phone during pending/active speech, return with no replay, then tap to start a
new turn. Check the saved greeting and reviewed TV/Play Vamp handoff still work
when iOS switches apps. These hardware checks cannot be established by mocks.

### Phase 5 — Tavily public web research (local implementation)

`POST /api/jarvis/search` accepts `{ "query": "Who invented the telephone?" }`
using the existing JARVIS bearer authentication and app membership. It returns
`label`, a provider answer (or explicitly labelled source excerpt), 2–4 actual
public `sources` with title/domain/URL and publication date when supplied, and
`retrievedAt`. Source material is untrusted data, rendered as text; it never
executes commands or changes assistant instructions. Review sources when facts
are uncertain or disputed. No citations or dates are synthesized.

The server calls only `https://api.tavily.com/search`. Configure the production
secret **TAVILY_API_KEY** through DeepSpace secret management when deployment
is approved. `.env.example` contains its blank name only. Do not put keys in
browser code, query strings, MCP URLs, or source control. Existing credentials
and live service settings were not changed for this phase.

Settings → Privacy & Security contains the persisted **Live web search** toggle,
using the existing account-private preferences record. It appears enabled only
when server configuration is available and the saved preference permits search.
Configuration availability is not proof of provider authorization or uptime.
`GET /api/jarvis/search/config` returns only `{ "configured": boolean }` to an
authenticated app member. The search endpoint enforces the saved setting itself.
Missing key: “Live web search is not connected yet.” Disabled: “Live web search
is turned off.” Provider failure, rate limit or timeout: “Live web search is
temporarily unavailable.” Raw provider diagnostics and credentials are not
returned or logged.

Public factual/historical/current questions and explicit research requests in
text or voice use the same route. Casual chat, weather, settings, private-account
and device commands retain existing handlers. There is no private mailbox,
purchase, account or device execution in this search path. Existing Wikipedia
and BBC tools remain available on their original paths; they are not presented
as Tavily research.

Each actual successful search adds one “Web search completed: [query]” entry to
the existing Home activity feed. These new entries are bounded to the current
mounted chat session; no persistent search-history store or raw result retention
was added. Search replies, like existing local commands, are not persisted in
LLM conversation history. Compound agent requests retain the existing agent
path. No guarantee is made that every natural-language phrase routes to search.

Limits: 300-character queries, five requested results, four rendered safe source
links, ten search requests per user per minute, ten-second provider timeout,
no blind retries, no credential-bearing/local-network citations. Stop,
replacement, microphone interruption, pagehide, hidden tab and component cleanup
abort in-flight requests. Cancellation never generates an outage/success entry.

Focused validation:

```sh
npm run test:unit -- src/jarvis/search.test.ts src/jarvis/search-routes.test.ts src/components/search-intent.test.ts src/jarvis/contracts.test.ts
npm run type-check
npm run lint
npm run build
JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 npx deepspace test run e2e --grep 'Phase 5|Settings redesign|device voice|wake mode requires|continuous voice starts|iPhone TV actions require|iPhone Vamp quick action' --json
```

Automated tests mock Tavily. A valid deployed account/key, real live-source
retrieval, spoken iPhone responses and Safari background/return behavior must
still be checked after explicit deployment approval. No publication is implied
by local validation.

### Phase 7 local device validation

Connections Play for the saved **Play Vamp** music connection now reuses the
existing Play Vamp review/controller and its account-scoped dispatch history.
Other saved Shortcut controls review the exact device, action, and configured
Shortcut name before synchronous handoff. Cancel sends nothing. Changes to the
saved connection invalidate an open review. Native handoff remains unverified;
manual reports and fresh MusicKit playlist-matching observations are separate.
No new device integration or production connection was provisioned.

The focused browser validation includes TV, Play Vamp, MusicKit evidence,
Connections review, Home Assistant confirmation, and the existing multi-user
connection test. A reproducible saved-location assertion in that combined test
blocks the phase gate; see JARVIS_CHECKPOINT.md. Physical iPhone Shortcut execution
and real Home Assistant device state still require device/account verification.
