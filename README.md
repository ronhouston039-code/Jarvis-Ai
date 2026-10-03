# JARVIS on DeepSpace

An iPhone-friendly holographic dashboard and personal assistant with streamed AI conversations, tap-to-talk dictation, device spoken replies, private conversation history, explicit preference memory, persistent one-time reminders, notifications, and action-bound deletion confirmations.

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
manufacturer's supported Shortcut actions. Tapping On/Off opens the corresponding
`shortcuts://run-shortcut?name=...` URL. The iPhone controls authorization and
execution; JARVIS does not claim success or read device status. Removing a
connection clears its registered names. Locks and alarm controls are unsupported.

For **Apple Music**, make Play Music and optionally Pause Music shortcuts and
register their names. This uses the iPhone's Apple Music subscription and app;
it does not grant JARVIS direct library access. No Apple credentials are collected.

Listen uses device speech by default and makes no Fish API request. The uploaded
startup greeting remains available separately. Device speech may use the browser
or OS speech service; it is not a guarantee of offline synthesis.

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

Home Assistant runs at home and pairs/bridges supported accessories locally. Jarvis talks only to its authenticated public HTTPS API, never private IPs, HomeKit or device ports. Redirects, URL credentials, arbitrary URLs/services/entities and local domains/IPs are rejected. The owner-only Connections → Home card shows normalized selected devices, real state/time, Test connection, Disconnect/Reconnect, capabilities and exact expiring confirmations. Sensitive categories, unlock/open/disarm, all scenes, and media power off require a consumed, configuration-bound server token. Camera controls and purchases/account changes are unsupported; privacy/security switches require confirmation. HTTP acceptance is not proof of physical completion; no blind write retries occur.

Owner-scoped generic tools automatically expose approved capabilities through `list_home_devices`, `get_home_device_status`, `control_home_device`. Secrets and raw provider errors/entity IDs/private addresses never appear in normal UI. Home Assistant integration and native Apple Home are separate providers.

### Native iOS companion

See [ios/README.md](ios/README.md) and open `ios/JarvisCompanion/JarvisCompanion.xcodeproj` on a Mac. Direct Apple Home control is native-only, with local approvals and typed first-release actions. Web chat can queue explicitly shared opaque actions for the foreground companion. Authenticated sanitized audits appear in My space's activity log. A signed build on an iPhone is required to verify actual HomeKit connection; no native app has been installed or published from this workspace.

### Radar dashboard and spoken startup greeting

The Home dashboard follows the supplied cyan radar/globe layout with a live device-clock date/time, saved location, live weather where connected, upcoming reminders and client-reported local activity. System cards show actual server/network availability; they do not invent armed security, TV state, network speeds or music playback. The skyline/globe are original decorative artwork.

The original uploaded greeting audio is played by JARVIS's speech controller, with no embedded audio controls or greeting replay button. For the owner with Fish voice available, spoken feedback starts enabled unless explicitly disabled. The first eligible tap/keyboard gesture unlocks one greeting per browser-tab session; iPhone browsers require an initial gesture before audio. Enabling voice manually also greets the owner. Turning voice off is respected. Stop, microphone activation and leaving the app cancel playback and pending requests. Say or type **repeat greeting**, **repeat the greeting**, or **Jarvis, repeat greeting** to replay it locally, without an LLM request. Other voice transcripts still appear for review before sending. If the saved audio is unavailable, device speech can deliver the short greeting. Wake-word detection/background listening remain unconfigured.

### Jarvis Focus Mode

Open **Focus** in the dashboard navigation or `/home?mode=focus` for a full-screen voice-first canvas. Tap the microphone to grant permission and speak; interim transcripts appear live, and final transcripts submit through the existing chat/tool pipeline. Keyboard entry, Stop, Escape, and Exit remain available. This is foreground interaction, not background wake-word detection.

The projected particle sphere uses local Web Audio frequency analysis for microphone input and Fish Audio MP3 playback. Microphone analysis never connects to speakers or uploads audio; browser speech recognition uses the browser's normal transcription implementation, which may use its provider's service. Microphone tracks stop on cancel, exit, page hiding, or failure. Device speech-synthesis fallback cannot expose an audio buffer to Web Audio, so it uses a gentle pulse rather than a synchronized waveform. No additional secrets or graphics dependencies are required.
