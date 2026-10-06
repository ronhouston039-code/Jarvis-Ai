# JARVIS CHECKPOINT

Updated: 2026-10-05 (America/New_York). Active instruction: Gmail cleanup and
roadmap promotion, then **Phase 8 — Home HUD redesign** only after cleanup
validation. The old Gmail OAuth phase is cancelled. Active ordering is in
JARVIS_ROADMAP.md. Earlier STOP notes are historical and have been superseded
only within the user's new cleanup/Phase 8 scope. Do not repair the saved-location
baseline, alter action-history semantics, discard old work, or publish.

## Inventory baseline (historical)

- React 19 / TypeScript / Vite; Hono on Cloudflare Workers; DeepSpace 0.34.
  DeepSpace owns source/deployment. `wrangler.toml` retains the existing app ID,
  routes and Durable Object bindings. No deployment configuration was changed.
- Home: `src/pages/(app)/home.tsx` mounts the account-keyed `JarvisChat`.
  Existing DashboardLayout, hologram/globe and visual-state projection remain.
- Settings: `src/pages/(app)/(protected)/settings.tsx` composes current preference,
  proactive, voice, briefing and account controls. No Settings redesign exists.
- Persistence: private DeepSpace records for preferences, memories, conversations,
  reminders, notifications and saved connections. Voice preferences use existing
  user-scoped session storage; Shortcut activity uses bounded user-scoped local
  storage. Do not replace these stores or introduce competing state machines.
- Voice: `JarvisSpeechPlayer`, `DeviceSpeechController`, `FocusAudioMeter` and
  existing Talk/Wake/VAD handlers in `JarvisChat`. Device audio unlock, a muted
  primer, voice loading, fresh utterances, browser event handling and Settings
  Test Device Voice have unfinished local changes. Fish TTS remains server-side
  behind authenticated owner-only `/api/tts` and `/api/jarvis/voice/speak`.
- Actions: existing TV/Vamp review sheets, exact saved Shortcut resolution,
  cancellation, dispatch and separate user/provider evidence remain in place.
- Weather/location: existing Open-Meteo/OpenWeather requests, saved city selection,
  explicit one-time rounded GPS, and an Apple Maps link. No real MapLibre map,
  continuous location watcher, Tavily integration or Gmail OAuth exists.
- Smart home: existing Home Assistant/Roku adapters and separate native iOS
  HomeKit companion/audit route. Actual configuration and device execution have
  not been reverified in this phase; no connected/online claim is made.

## Unfinished workspace changes

Modified tracked files:

```text
README.md
src/components/FishVoiceSettings.tsx
src/components/JarvisChat.tsx
src/components/jarvis-speech.test.ts
src/components/jarvis-speech.ts
src/jarvis/contracts.ts
src/jarvis/routes.ts
src/schemas/personal.ts
tests/collab.spec.ts
```

Existing untracked files:

```text
src/components/device-speech.test.ts
src/components/device-speech.ts
src/jarvis/fish-audio.test.ts
src/jarvis/fish-audio.ts
tests/device-voice.spec.ts
```

Voice work: **partial, not browser/device verified or published**. Existing tests
cover gesture preparation, late voices, event-driven speech, timeout, cancellation
and safe Fish classifications. Review still needed against latest requested
safeguards: current no-start timeout is four seconds, voice selection can fall
back to a non-English voice, and client cancellation lacks the requested explicit
reason field. These observations were documented, not repaired during inventory.

Preference/weather work: **partial**. Contracts/schema introduce temperature
units and partial preference patches. `/api/weather` calls an unfinished helper
and passes arguments not yet supported by `weather.ts`. UI/provider work was not
completed. Preserve these changes; do not silently finish or discard them.

Confirmed compiler/build blockers in `src/jarvis/routes.ts`:

- Line 10: imports `savedTemperatureUnit` from `./weather`, but
  `src/jarvis/weather.ts` does not export it (`TS2305`, build `MISSING_EXPORT`).
- Line 140: parsed coordinates have no `temperatureUnit` (`TS2339`).
- Line 151: `weatherSnapshot` expects 2–4 arguments but receives 5 (`TS2554`).

## Baseline validation — current workspace

| Command | Result |
| --- | --- |
| `npm run test:unit` | 222 passed; 0 failed; 0 skipped; 0 timed out; 24 test files passed. |
| `npm run type-check` | Failed, exit 2; the three diagnostics above. |
| `npm run lint` | Passed, exit 0. |
| `WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs npm run build` | Failed, exit 1; missing `savedTemperatureUnit` export. |
| Browser tests | Not executed for this baseline; no passing count claimed. |
| Recognized credential-pattern scan | No matching credentials found in inspected source/tests/config/docs; not a complete security certification. |

Prior runner evidence (not a current browser pass): Playwright **1.63.0**;
matching Chromium/headless-shell **1243** and FFmpeg **1011** are installed.
DeepSpace's browser-cache initialization previously stalled. Its subsequent
dev server attempt failed before tests with:
`EROFS: read-only file system, open '/home/agent/.config/.wrangler/registry/jarvis-voice-7f42'`.
The wrapper reported `tests_failed`, exit 1. No feature assertion ran in that
attempt. No runner/config source files were changed. Temporary cache/config
paths were attempted; a final retry was interrupted before results.

Browser setup uses `tests/playwright.config.ts`, strict port 5188 when requested,
readiness `/api/auth/ok`, 60-second server-start timeout and 30-second test timeout.
Do not increase timeouts or skip tests to hide failed initialization. Auth and
record storage need the DeepSpace network; speech/media/Fish boundaries are
mocked and the documented local AI fixture avoids paid completion calls.

## Safety and configuration inventory

- `.gitignore` excludes `.env*` (except blank `.env.example`), `.dev.vars*`,
  `.deepspace`, build output and test artifacts. No credentials were printed.
- Fish, Groq and Home Assistant provider secrets are consumed by server code.
  The optional owner-only MusicKit configuration endpoint returns a developer
  token for the browser SDK; assess this explicit token boundary during the
  later security review rather than claiming all token paths are server-only.
- `FISH_AUDIO_API_KEY` was confirmed present by a names/masked-only production
  lookup on 2026-10-04. The new Phase 0 lookup was interrupted, so current
  production presence was not reconfirmed. `TAVILY_API_KEY` and future Google
  OAuth secret presence are **unconfirmed**; no values were accessed.
- No real Fish health request ran here. Current account access, reference
  availability, API billing and audible playback remain unverified. Mocked 402
  tests are not evidence of a real billing failure.
- No features repaired, no stored user values changed, no unfinished work
  discarded, and no commit, merge, deploy, publish or production secret change.

## Historical Phase 0 approval gate

Review this Phase 0 checkpoint and authorize the next phase. Before Phase 1
browser verification, explicitly decide how to handle the unfinished
preference/weather compiler blockers while preserving their work. Do not repair
or discard them without an approved scope. Then finish only the existing Safari
voice safeguards, run focused voice/unit/browser checks plus type/lint/build,
and report physical iPhone gaps. Do not begin health, Settings redesign, weather,
search, maps or Gmail, and do not publish without explicit deployment approval.


## Phase 1 implementation and validation — 2026-10-05

Current state: automated Phase 1 checks passed; physical iPhone verification
remains. No commit, deployment, publication or production setting/secret change.
Do not begin Phase 2 without user approval.

Files changed in this phase (separate from the preserved Phase 0 dirty baseline):

```text
src/components/device-speech.ts
src/components/device-speech.test.ts
src/components/jarvis-speech.ts
src/components/jarvis-speech-lifecycle.test.ts (new focused tests)
src/components/focus-audio.ts
src/components/JarvisChat.tsx
src/jarvis/routes.ts
tests/device-voice.spec.ts
JARVIS_CHECKPOINT.md
```

Reused the existing speech controller/player, audio meter, gesture handlers,
Settings Test Device Voice, Fish server request helper/routes, Talk/Wake session
state and original TV/Music review handlers. No new service/state system.

- Compile repair: removed only the incomplete temperature lookup/import and
  unsupported fifth argument from `/api/weather`, restoring its existing call.
  No helper was invented and no weather feature was implemented. The unfinished
  preference contracts/schema remain preserved for a later approved phase.
- Device speech: 2-second onstart watchdog; rate constrained to 0.95–1; valid
  English voice selection or Safari default; fresh utterance; bounded late-voice
  discovery; no queued replacement; detached callbacks and cleared timers.
- Cancellation intent is set before abort/cancel (stop, replacement, background,
  dispose, gesture preparation). In-flight requests, playback and old callbacks
  cannot report an outage or start stale speech. Later real errors still report.
- Typed submit prepares audio synchronously. The shared meter calls resume even
  if a freshly created context already reports running. Background cleanup does
  not run unnecessarily on return to visibility; it never restarts speech.
- Fish Audio remains server-side, owner-authenticated, sanitized and bounded.
  Existing failure categories remain separate from device onstart/onend events.
  No real provider health request ran: current live failure category is unknown.
  Mocked HTTP402 is test evidence only, not a billing diagnosis.

Final commands and results:

```sh
npm run test:unit -- src/components/device-speech.test.ts src/components/jarvis-speech.test.ts src/components/jarvis-speech-lifecycle.test.ts src/components/focus-audio.test.ts src/jarvis/fish-audio.test.ts
npm run type-check
npm run lint
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs npm run build
```

Unit: **58 passed, 0 failed, 0 skipped, 0 timed out; 5 files passed**.
Type check, lint, production build and `git diff --check`: passed, exit 0.
Recognized client credential/key-name scan: 35 client files; 0 flagged.
Build reports existing >500 kB chunk warnings; no build error.

Exact browser command (temporary local environment paths, no runner source edits):

```sh
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config PLAYWRIGHT_BROWSERS_PATH=/tmp/jarvis-playwright WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs WRANGLER_SEND_METRICS=false JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm_config_cache=/tmp/jarvis-npm-cache npm_config_offline=true node_modules/.bin/deepspace test run e2e --port 5188 --grep 'device voice|voice activation speaks|Listen requests server Fish|Fish MP3 playback|wake mode requires|ambient transcripts|continuous voice interrupts|continuous voice starts|iPhone TV actions require confirmation|iPhone Vamp quick action' --json
```

Browser: Playwright 1.63.0 / Chromium 1243, **16 passed, 0 failed, 0 skipped,
0 timed out**, 1.4 minutes; wrapper exit 0. The runner started the strict-port
server, passed `/api/auth/ok` readiness, launched Chromium and finished normally.
No tests weakened/skipped. An earlier run had 13 passed / 1 failed because the
meter skipped resume for a running context; the real audio path was corrected
and the full targeted suite rerun successfully. Previous read-only cache/registry
stall was resolved with temporary writable cache/config locations and permission
for local CLI credential refresh; no production secret writes or runner edits.
The existing managed development proxy adapter was reused (installed dependency
only); external AI and speech boundaries were mocked, not app auth/storage.

Exact physical iPhone Safari checks still required on this changed build:

1. Direct Settings Test Device Voice tap: hear “Device voice is working.”;
   Started only when audible speech starts, Completed only at its end.
2. Enable Speak Replies, type and send a message: hear one reply; fallback label
   stays visible when Fish fails; no primer/greeting is audibly fabricated.
3. Start/stop Talk Mode repeatedly; interrupt by tapping mic and by speaking;
   hear no stale, overlapping or duplicate reply.
4. Enable Wake JARVIS with consent, say the wake phrase then a request; confirm
   one audible reply and correct return to listening.
5. Stop during preparation and playback: no delayed speech or false outage.
6. Background/lock Safari during preparation and playback; return: remain silent
   and not Speaking until a fresh tap starts a new utterance.
7. Check device speaker/Bluetooth output. If blocked or browser error occurs,
   show the exact device-voice instruction while text remains visible.
8. If Fish is available, verify actual MP3 playback, Stop/mic interruption and
   background cleanup; live account access/voice validity are not yet verified.

These local changes are not live. Physical checks need an approved secure
preview/test build; do not mistake the old live release for this revision.
Next task: user review plus physical iPhone validation; await explicit approval
before later phases, commits or deployment.

### Phase 1 follow-up: truthful AudioContext rejection

Changed `src/components/focus-audio.ts`, `src/components/focus-audio.test.ts`,
`src/components/JarvisChat.tsx`, `tests/device-voice.spec.ts`, and this checkpoint.
The existing unconditional synchronous resume call remains. Resume rejection is
now wrapped as sanitized `AudioPreparationError` (blocked for NotAllowedError,
browser-error otherwise). Talk Mode no longer swallows that error and starts
recognition; it clears the attempted session and displays the sanitized message.
No background auto-resume, provider outage or raw diagnostic was added; device
speech remains independent and available through Test Device Voice.

Same focused unit command above: **61 passed**, 0 failed/skipped/timed out.
`npm run type-check`, `npm run lint`, and the same production build command:
passed, exit 0. `git diff --check`: passed.
Same browser environment and runner command above, with this focused grep:
`--grep 'device voice|wake mode requires|continuous voice starts|continuous voice interrupts'`.
Result: **11 passed**, 0 failed/skipped/timed out; 48.7s, exit 0. New browser test
verifies blocked resume makes no microphone/recognition/TTS request and ends Talk
Mode. Physical Safari tests listed above still remain. Nothing committed or
published; Phase 1 only.

## Phase 2 — Truthful system health (current)

Phase 1 approved; Phase 2 authorized. No later phase, commit, deployment, or
production configuration change. All pre-existing unfinished edits retained.

Implemented one account-scoped typed controller and shared React provider for
Home, Settings, explicit system-status replies, spoken transition warnings, and
bounded local activity. Public messages come from allow-listed reasons, never raw
provider responses. Cloud and saved-location weather checks reuse existing routes;
Smart Home and authorized MusicKit reuse existing observations. TV/music Shortcut
configuration alone remains unverified. Required enabled services must pass actual
checks before the green full-operation label appears. Unknown/checking cannot
produce an initial warning. Stop/background/pagehide/replacement cannot create an
outage. Unchanged warnings are session-deduplicated, with one optional recovery
announcement. User/account change isolates status, history, and warning markers.

Voice output is online only after actual playback/device onstart. Audible device
fallback can satisfy voice output while retaining its Fish fallback reason; this
does not verify Fish Audio. The saved fully-operational greeting is preserved but
only played when required health is verified; otherwise the same controller's
truthful status goes through existing speech. Existing SpeechPlayer, device
controller, gesture preparation, cancellation paths, private records, settings,
Home Assistant hook, TV/Music reviews, and historical activity are reused.

New files:
- `src/components/system-health.ts`
- `src/components/SystemHealthProvider.tsx`
- `src/components/SystemStatus.tsx`
- `src/components/system-health.test.ts`
- `tests/system-health.spec.ts`

Existing files changed in this phase (including already-uncommitted files):
- `src/components/JarvisChat.tsx`
- `src/components/JarvisHud.tsx`
- `src/components/WeatherConnect.tsx` (shared summary fetch only)
- `src/components/FishVoiceSettings.tsx`
- `src/components/jarvis-speech.ts`
- `src/components/device-speech.ts`
- `src/components/jarvis-speech-lifecycle.test.ts`
- `src/components/dashboard/NowPlaying.tsx`
- `src/components/dashboard/useHomeDashboard.ts`
- `src/pages/(app)/_layout.tsx`
- `src/pages/(app)/(protected)/settings.tsx` (status card only)
- `src/pages/(app)/(protected)/personal.tsx` (health activity only)
- `tests/focus.spec.ts`
- `tests/voice-turns.spec.ts`
- `JARVIS_CHECKPOINT.md`

Intentionally omitted: map provider is absent and disabled, not offline. Exact
combined map/weather outage wording is unit-tested against model observations,
not falsely demonstrated as a working map integration. No weather-default/unit
features, Settings redesign, new integrations, or later roadmap work. No real
Fish account/credits/voice validity check performed; browser speech/provider
boundaries use mocks. Existing unfinished preference edits remain unfinished.

Exact focused commands:

```sh
npm run test:unit -- src/components/system-health.test.ts src/components/device-speech.test.ts src/components/jarvis-speech-lifecycle.test.ts src/components/focus-audio.test.ts src/components/jarvis-speech.test.ts src/jarvis/fish-audio.test.ts src/components/dashboard/home-dashboard.test.ts
npm run type-check
npm run lint
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs npm run build
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config PLAYWRIGHT_BROWSERS_PATH=/tmp/jarvis-playwright WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs WRANGLER_SEND_METRICS=false JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm_config_cache=/tmp/jarvis-npm-cache npm_config_offline=true node_modules/.bin/deepspace test run e2e --port 5188 --grep 'system health|device voice|voice activation speaks|Listen requests server Fish|Fish MP3 playback|wake mode requires|ambient transcripts|continuous voice interrupts|continuous voice starts|iPhone TV actions require confirmation|iPhone Vamp quick action' --json
```

Units: **82 passed, 0 failed/skipped/timed out**, 7 files, exit 0. Type check,
lint, production build: exit 0. Existing large-chunk build warning remains.
Client-artifact scan: 22 JS/HTML files, 0 recognized Fish/Groq credential patterns
or `FISH_AUDIO_API_KEY` names found; targeted scan, not a complete security audit.

Earlier browser attempts remain recorded: first 15 passed/5 failed (one 30s
timeout); corrected auth-boundary remount, health navigation selector, and voice
mock boundaries that previously let saved-location live outages interrupt voice
tests. One discovery attempt failed on a fixture syntax error before assertions;
corrected. Next run 19 passed/2 failed (one 30s timeout); remaining incorrect
Settings selector and live-weather Focus boundary fixed. Existing assertions
retained; no tests skipped, deleted, or marked passed falsely.

Final browser result: **21 passed, 0 failed/skipped/timed out**, 1.8 minutes,
exit 0, Playwright 1.63 / Chromium 1243. Strict-port server readiness and browser
launch succeeded; runner exited normally. Four new health browser checks plus
17 retained voice/review regression checks passed. Automated Phase 2 gate passed;
physical iPhone validation remains. No deployment gate authorized.
After runner exit, localhost:5188 returned no listener (curl exit 7, HTTP 000),
confirming the test server was cleaned up. `git diff --check` passed.

Physical iPhone Safari tests still required on an approved test build:
1. Home and Settings show the same real status, with no full-operation claim
   during checking or before voice actually starts; absent map stays disabled.
2. With Speak Replies enabled and prepared by a tap, induce one real required
   outage: one spoken warning, no repeated warning while unchanged; one recovery.
3. Stop or background during checks/speech: no outage activity caused by the
   cancellation, no delayed speech on return until a fresh user gesture.
4. Test Device Voice, typed reply, repeated Talk Mode, Wake JARVIS, and microphone
   interruption remain audible and have truthful start/end states.
5. TV and Play Vamp review Cancel launches nothing; approved dispatch stays
   dispatched/user-reported unless an independent provider verifies the outcome.

Next gate: user Phase 2 review and physical
iPhone validation. Wait for approval before Phase 3. Nothing committed or live.

## Phase 3 — Settings redesign and confirmed defect fixes

Settings reuses existing preference records, session voice keys, speech player,
health provider, proactive preferences, and Connections/dashboard handlers.
Grouped dark navy/cyan cards provide ten sections, single-column mobile layout,
desktop section navigation, safe-area spacing, and visible keyboard focus.
No Home redesign or later phase. No separate Settings store or new integration.
Sample briefings and preview-only wake controls are omitted from Settings.

Phase 3 files changed:
- `src/pages/(app)/(protected)/settings.tsx`: grouped layout and existing-route links.
- `src/components/JarvisPreferences.tsx`: hydrate existing saved preferences and
  require confirmed save success; preserves unrelated preference fields.
- `src/components/VoiceActivation.tsx`: real Speak Replies control and shared
  health update; stable authenticated ID reads the existing session key on reload.
- `src/components/FishVoiceSettings.tsx`: same stable authenticated ID for the
  existing voice-speed key; speech/test/cancellation handlers unchanged.
- `src/components/jarvis-settings.css`: scoped responsive visual styling; under
  Reduce Motion, all Settings descendants and before/after pseudo-elements use
  transition:none, animation:none, scroll-behavior:auto with explicit priority.
  Checked position/color, native semantics and focus outlines stay intact.
- `tests/settings.spec.ts`: four Settings tests added during initial Phase 3;
  unchanged during the two-failure fix.
- `JARVIS_CHECKPOINT.md`: phase report only.

Initial Phase 3 focused units: 82 passed / 0 failed/skipped/timed out. Initial
browser run: 17 passed / 2 failed / 0 skipped/timed out. The two failing tests:
1. `Settings redesign preserves stored preferences, proactive policy, and session
   voice values`, tests/settings.spec.ts:31: expected checked, got unchecked after
   reload (5-second assertion wait, not runner timedOut). VoiceActivation.tsx:6–15
   initialized from an unavailable profile ID once and never reread the account
   key when the profile loaded. Voice speed shared this profile-readiness defect.
2. `Settings redesign desktop navigation and reduced motion retain keyboard
   focus`, tests/settings.spec.ts:86: expected 0s, got 0.15s. The toggle input's
   pseudo-element rule (CSS line 45) outranked the old generic media override.

Both reproduced before editing: 0 passed / 2 failed / 0 skipped/timed out. Neither
showed a flaky pass. After minimal fixes, the same two tests passed 2/0/0/0;
then all four Settings browser tests passed 4/0/0/0. Tests/expectations were not
weakened, rewritten, removed, skipped or relaxed. Playwright 1.63 / Chromium1243.

Exact browser command run twice (before and after fixes):
```sh
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config PLAYWRIGHT_BROWSERS_PATH=/tmp/jarvis-playwright WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs WRANGLER_SEND_METRICS=false JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm_config_cache=/tmp/jarvis-npm-cache npm_config_offline=true node_modules/.bin/deepspace test run e2e --port 5188 --grep 'Settings redesign preserves stored preferences|Settings redesign desktop navigation' --json
```
Exact full Settings browser command:
```sh
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config PLAYWRIGHT_BROWSERS_PATH=/tmp/jarvis-playwright WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs WRANGLER_SEND_METRICS=false JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm_config_cache=/tmp/jarvis-npm-cache npm_config_offline=true node_modules/.bin/deepspace test run e2e --port 5188 --grep 'Settings redesign' --json
npm run type-check
npm run lint
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs npm run build
```
Type check, lint, and production build all passed, exit 0 (not test suites, so
test counts are not applicable). Existing large-chunk build warning remains.
No further feature/style changes after verification. Existing voice lifecycle,
Wake/Talk and system-health checks passed in the initial Phase 3 browser run;
they were not rerun during this narrowly scoped defect fix.

Functional: saved timezone/response/proactive preferences, session Speak Replies
and speed, existing voice-test handlers, existing Connections and Talk/Wake/Focus
navigation, shared real health. Omitted: unimplemented map controls, Gmail, local
wake sensitivity, sound-effect controls, language/tone/name editors, and unwired
weather-unit controls. Proactive delivery remains inactive; only policy is saved.

Physical iPhone Safari still requires verification of safe-area/portrait and
landscape layout, session toggle/speed after reload, Test Device Voice audible
start/end, keyboard focus with external keyboard, and device Reduce Motion.
Automated Settings verification is complete; await user review/approval. Phase 4
not begun. No commits, deployments, publications or production-secret changes.

## Phase 4 — locally complete, not deployed

Reused authenticated weather routes, existing Open-Meteo/OpenWeather adapters,
private saved-city/preferences records, Settings save controls, shared system
health, and the existing voice/session/cancellation controller. No dependencies,
production secrets, deployment configuration, commits or publications changed.

Functional: Goldsboro, North Carolina default; saved city and Fahrenheit/Celsius
preferences; explicit named cities and unit overrides; explicit one-time current
location request with denied/unavailable GPS fallback to Goldsboro; real provider
metrics only; source/update time; sanitized unavailable/ambiguous-city responses;
weather cancellation and shared health updates. Preference changes refresh weather
after the existing Save preferences action. Removing a saved city restores the
Goldsboro default rather than claiming the weather provider is disconnected.

New modules: weather intent parser/formatter and focused tests only. No alternate
settings store, voice controller or health model was introduced.

### Exact Phase 4 files changed

- `src/jarvis/connections.ts`: abortable existing current-weather request.
- `src/jarvis/weather.ts`: shared default/city/unit resolution and metric validation.
- `src/jarvis/routes.ts`: existing authenticated weather route supports these inputs.
- `src/jarvis/connection-routes.ts`: existing connection route reuses weather resolution.
- `src/ai/tools.ts`: structured weather tool and weather-specific prompt guidance.
- `src/components/weather-intent.ts`: new simple weather intent parser and factual formatter.
- `src/components/weather-intent.test.ts`: new focused parser/formatter tests.
- `src/components/JarvisChat.tsx`: simple weather text/voice request, explicit GPS, cancellation.
- `src/components/JarvisHud.tsx`: preserve full weather/source text separately from short speech.
- `src/components/SystemHealthProvider.tsx`: default weather and preference-driven refresh.
- `src/components/WeatherConnect.tsx`: reuse shared weather, guard missing forecast, retain location removal during outages.
- `src/components/JarvisPreferences.tsx`: reuse persisted temperature-unit preference.
- `src/pages/(app)/(protected)/settings.tsx`: default city and source/location controls.
- `src/components/JarvisConnections.tsx`: display actual temperature unit.
- `src/jarvis/weather.test.ts`: resolver/validation/provider failure/cancellation tests.
- `tests/weather.spec.ts`: five focused weather browser checks.
- `tests/settings.spec.ts`: updated renamed default-city row selector; assertions retained.
- `tests/collab.spec.ts`: restore explicit-location test precondition on the dedicated account and wait for ready controls; privacy assertions retained.
- `JARVIS_CHECKPOINT.md`: phase scope, results and safe resume record.

### Exact final validation commands and results

```sh
npm run test:unit -- src/jarvis/weather.test.ts src/components/weather-intent.test.ts src/jarvis/connections.test.ts src/jarvis/contracts.test.ts src/components/system-health.test.ts
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config PLAYWRIGHT_BROWSERS_PATH=/tmp/jarvis-playwright WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs WRANGLER_SEND_METRICS=false JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm_config_cache=/tmp/jarvis-npm-cache npm_config_offline=true node_modules/.bin/deepspace test run e2e --port 5188 --grep 'Phase 4|Settings redesign|system health|weather permissions are explicit' --json
npm run type-check
npm run lint
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs npm run build
git diff --check
```

- Units: 37 passed, 0 failed, 0 skipped, 0 timed out; five files; exit 0.
- Browsers: 14 passed, 0 failed, 0 skipped, 0 timed out; exit 0. Includes five weather, four Settings, four shared-health and one existing GPS privacy check.
- Type check, lint, production build and diff check: passed, exit 0. Build retains a large-client-chunk warning.
- Earlier failed attempts exposed a reused mock response body, truncated source text, and persisted test-city/query-readiness assumptions. Fixed before the final run. Two earlier location-test attempts hit their 30-second test timeout. No assertions were weakened or tests skipped.

### Limits and required physical iPhone checks

External weather boundaries were mocked in automated tests. Real production
provider availability and optional OpenWeather credentials were not verified.
No hourly/evening data, weather alert scheduling, GPS history, continuous tracking,
reverse geocoding, map, search or Gmail functionality was added. Simple local
weather replies follow existing local-command behavior and are not persisted in
LLM chat history; compound requests retain the structured agent/tool path.

On iPhone Safari, verify:
1. Default Goldsboro Fahrenheit weather, source and update time; explicit other city and Celsius.
2. Save Celsius, reload, then explicitly request Fahrenheit; verify persisted city selection/removal.
3. Explicit current-location allow and deny paths; no permission prompt for default weather and no GPS autosave.
4. Audible short weather reply via Fish Audio or device fallback; full written metrics remain accessible.
5. Stop, microphone interruption and background/return during weather requests produce no late speech or false outage.
6. Real provider unavailability and recovery display truthfully.

Next exact task: await user review/approval. Do not begin Phase 5 or deploy.

## Phase 5 — local report, no publication

### Reused and implemented

Reused verified JARVIS bearer authentication, app membership, user-bound record
execution, the private preferences schema/patch route, confirmation-room rate
limiter, existing Settings grouping, streaming-chat submit/voice turn handlers,
voice unlock/Fish/device-fallback lifecycle, Stop/background/interrupt handling,
Home activity feed and the existing conversation panel. No additional voice
controller, settings store or health model was created. TV/Music review and
cancel flows remain intact.

New production modules: server Tavily provider, server search routes, shared
search contracts/normalization, public-query intent helper, WebSearchSettings,
and WebSearchResults. Four focused test files were added. No dependencies added.

- Authenticated member-only POST `/api/jarvis/search`: strict query input,
  caller-private preference enforcement, fixed HTTPS Tavily destination,
  server-only Authorization header, 10 requests/user/minute, 10-second timeout,
  no retries, cancellation, sanitized failure responses. Existing global action
  rate/body-size limits also apply.
- Authenticated GET `/api/jarvis/search/config`: configuration presence boolean
  only, never a key. Configuration is not a provider-verified connected state.
- Real provider answer or explicitly labelled excerpt, 2–4 actual safe public
  sources, titles/domains, supplied publication dates only, retrieval time. No
  synthetic citations/dates. External text is rendered as data and never used
  to execute tools or override instructions.
- Text and spoken public research questions share the endpoint. Sources appear
  in the existing conversation panel with 44px link targets. Focus captions
  reflect actual search processing/results; source review is available after
  exiting Focus.
- Settings Live web search uses the existing account-private preference record;
  enabled only with server configuration and saved permission. No fake Connected
  badge. Denied authentication or record permissions cannot enable a request.
- Success creates one bounded current-session Home activity entry:
  `Web search completed: [query]`. Cancelled/failed work does not create one.
- Stop, replacement, explicit microphone interruption, voice disable, pagehide,
  hidden tab and unmount abort pending work. Intentional server cancellation
  returns `cancelled` (499), not a provider outage. No auto-resume.

Exact user messages:
- `Searching the web...`
- `Live web search is turned off.`
- `Live web search is not connected yet.`
- `Live web search is temporarily unavailable.`
- `Search cancelled.`

### Exact files changed in Phase 5

1. `.env.example`: blank TAVILY_API_KEY name only.
2. `worker.ts`: optional server binding type.
3. `src/jarvis/routes.ts`: register search after existing protection middleware.
4. `src/jarvis/contracts.ts`: optional liveWebSearch preference patch.
5. `src/schemas/personal.ts`: existing private preferences field/permission.
6. `src/jarvis/search-contracts.ts`: new validation, messages, safe citations and normalization.
7. `src/jarvis/search.ts`: new bounded server-only Tavily request.
8. `src/jarvis/search-routes.ts`: new authenticated/configuration/search handlers.
9. `src/jarvis/search.test.ts`: new provider/timeout/citation/secret-boundary tests.
10. `src/jarvis/search-routes.test.ts`: new auth/preference/rate/error/cancellation tests.
11. `src/components/search-intent.ts`: new bounded public-query routing helper.
12. `src/components/search-intent.test.ts`: new routing/privacy exclusions tests.
13. `src/components/WebSearchSettings.tsx`: new control using existing persistence.
14. `src/components/WebSearchResults.tsx`: new safe source/answer display.
15. `src/components/JarvisChat.tsx`: existing text/voice handlers, processing gates, cancellation and source integration.
16. `src/components/JarvisHud.tsx`: reuse existing activity feed for successful searches.
17. `src/pages/(app)/(protected)/settings.tsx`: mount search control in existing Privacy section.
18. `tests/search.spec.ts`: six focused browser tests including spoken and iPhone-sized paths.
19. `README.md`: routes, credentials setup by name only, limits, validation and remaining device checks.
20. `JARVIS_CHECKPOINT.md`: scope, exact results and resume instructions.

Earlier unfinished workspace changes were retained. No other phase work begun.

### Exact final validation

```sh
npm run test:unit -- src/jarvis/search.test.ts src/jarvis/search-routes.test.ts src/components/search-intent.test.ts src/jarvis/contracts.test.ts
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config PLAYWRIGHT_BROWSERS_PATH=/tmp/jarvis-playwright WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs WRANGLER_SEND_METRICS=false JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm_config_cache=/tmp/jarvis-npm-cache npm_config_offline=true node_modules/.bin/deepspace test run e2e --port 5188 --grep 'Phase 5|Settings redesign|device voice|wake mode requires|continuous voice starts|iPhone TV actions require|iPhone Vamp quick action' --json
npm run type-check
npm run lint
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs npm run build
git diff --check
```

| Final check | Result |
| --- | --- |
| Units, 4 files | 26 passed; 0 failed; 0 skipped; 0 timed out; exit 0 |
| Chromium browser tests | 21 passed; 0 failed; 0 skipped; 0 timed out; exit 0 |
| Type check | Passed, exit 0 |
| Lint | Passed, exit 0 |
| Production build | Passed, exit 0; existing large-chunk warning retained |
| Diff whitespace check | Passed, exit 0 |
| Client build scan | 0 files matched Tavily secret name, server Tavily fetch URL, or recognized credential-value patterns |

Browser breakdown: six new search checks; four existing Settings checks; seven
existing device-voice checks; continuous Talk, Wake consent/lifecycle, TV
review/cancel and Vamp review/cancel (one each). External Tavily responses are
mocked; browser runner was not weakened or skipped.

Earlier failures, resolved: the new spoken fixture expected capitalized `Who`
for a lowercase transcript. Corrected its strict expected query case; source
assertions remained intact. Hono's typed JSON helper rejected nonstandard 499;
used standard Response.json for cancellation without casting or weakening the
check. No failing check remains.

Scan command (prints counts only, not matched text or secret values):

```sh
python - <<'SCAN'
from pathlib import Path
import re
files = [p for p in Path('dist/client').rglob('*') if p.is_file()]
patterns = {
    'server-secret-name': r'TAVILY_API_KEY',
    'server-provider-fetch': r'https://api\.tavily\.com/search',
    'credential-pattern': r'(?:tvly-(?:dev|prod)-|sk-fish-|gsk_)[A-Za-z0-9_-]{15,}',
}
for label, pattern in patterns.items():
    print(label, sum(bool(re.search(pattern, p.read_text(errors='ignore'))) for p in files))
SCAN
```

This is a focused artifact check, not a complete security certification. No
credential-bearing MCP URL was used. No production credential values were read,
returned, logged or installed. No production account/provider access is claimed
verified. No deployment configuration or live settings were changed.

### Intentionally omitted / verification limits

No Gmail, maps, private-account search, purchases or device execution was added.
Existing Wikipedia/BBC tools remain on their original paths and are not labelled
as Tavily. Public query routing is a bounded helper, not an all-language intent
classifier; compound agent requests retain their existing path.

Search activity is bounded to the current mounted chat session. No new persistent
search-history store, raw result retention or LLM-history persistence for local
search replies was introduced. Server configuration presence, Tavily account
validity/credits and real live results have not been production-verified. Optional
search remains unavailable if its server secret is absent.

Physical iPhone tests still required after an approved build is available:
1. Type a factual/current question: read the direct answer, tap each source and
   verify title/domain/date; test in portrait at device text zoom.
2. Speak a research request in Talk Mode and Wake JARVIS; hear the short reply
   via real Fish/device fallback, exit Focus and read the same sources.
3. Stop or interrupt a pending search, then background/return or lock/unlock
   Safari: no delayed speech, no replay and no false success/outage activity.
4. Toggle search Off, reload, ask a question and verify exact disabled status;
   restore On when configuration exists.
5. With approved server configuration, verify a real Tavily request; unavailable
   key/account/network must produce truthful unavailable/not-connected status.
6. Recheck reviewed TV/Vamp Cancel and approved iOS handoff on the device.

Ready for local Phase 5 review. Next task: await explicit approval; do not begin
Phase 6, commit, publish, deploy or change production secrets.


## Phase 7 local checkpoint

Reused: TV/Play Vamp controllers and dialogs, private saved Shortcut records,
account-scoped activity storage, manual-result evidence, fresh MusicKit matching,
Home Assistant provider/ledger and exact expiring tokens, existing auth/schema
validation, and Modal focus/keyboard handling. No new settings/state service,
provider, dependency, or production configuration was introduced.

Changed in Phase 7:
- src/components/JarvisConnections.tsx: review saved controls; Play Vamp uses its
  existing controller; other handoffs validate the unchanged saved record and
  run synchronously on confirmation, with truthful timestamped dispatch status.
- src/jarvis/home-assistant.ts: require confirmation for every mutation and
  advertise those actions as requiring confirmation; status remains read-only.
- src/jarvis/home-assistant-ledger.ts: issue exact-action tokens for ordinary
  mutations as well as security-sensitive mutations.
- src/jarvis/home-assistant.test.ts: explicit approval for approved provider
  operations; new no-mutation-before-review/cancel/replay test.
- tests/connection-shortcuts.spec.ts (new): Connections review/cancel/exact
  configured dispatch; existing Play Vamp history/status reuse.
- tests/helpers/vamp-connection.ts: identify saved review buttons instead of
  direct links; preserve exact saved-name assertion and cleanup.
- tests/collab.spec.ts: adapt only the Shortcut control assertion to a review
  button; existing persistence and cross-user assertions are retained.
- README.md and JARVIS_CHECKPOINT.md: document review requirements and results.

Validation commands:
```bash
npm run test:unit -- src/components/devices src/components/apple-music.test.ts src/jarvis/connections.test.ts src/jarvis/home-assistant.test.ts src/jarvis/roku.test.ts
npm run type-check
npm run lint
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs WRANGLER_SEND_METRICS=false npm run build
```
Units: 121 passed, 0 failed/skipped/timed out. Type check, lint and production build passed (exit 0). Client credential-pattern scan: zero matches.
Initial full focused browser run: 12 passed, 2 failed, 0 skipped/timed out.
Targeted rerun after correcting an ambiguous new-test status selector: 1 passed,
1 failed, 0 skipped/timed out. Browser environment: Playwright 1.63 / Chromium,
existing DeepSpace runner, port 5188, /tmp/jarvis-playwright binaries.

Reproduced blocker: tests/collab.spec.ts:460, test “location and shortcut
connections persist privately and reject cross-user edits”. A newly saved
“Private place …” is expected after reload; actual is “Goldsboro health test”.
Failure precedes Shortcut assertions. Existing location save queries one record
without enabled filtering, while Connections displays an enabled-only record.
Old test-account records appear inconsistent; no weather/location behavior or
fixture records were changed to suppress this failure. No test was skipped or
assertion removed. Next exact task is to review this location/record baseline
before authorizing a repair outside Phase 7. Do not proceed to Phase 8.

Physical checks remaining: Safari review/Cancel for TV and saved Music/device
controls; approved native handoff and return; separate Confirm Playing / Not
Playing and TV user reports; real MusicKit playlist evidence when configured;
actual Home Assistant read/review/Cancel/approve if a bridge is configured.
Native HomeKit, MusicKit production authorization, Home Assistant provisioning,
and physical device completion are not claimed active or verified.
Phase 6 live public tile HTTP 403 remains a separate known limitation.
Nothing committed, deployed, published, or changed in production secrets.

Browser invocation used for the complete focused set:
```bash
XDG_CONFIG_HOME=/tmp/jarvis-xdg-config PLAYWRIGHT_BROWSERS_PATH=/tmp/jarvis-playwright WRANGLER_LOG_PATH=/tmp/jarvis-wrangler-logs WRANGLER_SEND_METRICS=false JARVIS_DEV_PROXY=1 JARVIS_TEST_AI=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm_config_cache=/tmp/jarvis-npm-cache npm_config_offline=true node_modules/.bin/deepspace test run e2e --port 5188 --grep 'iPhone (TV|Talk TV|Vamp|Play Vamp)|TV shortcut handoff|Phase 7|location and shortcut connections persist|Home Assistant shows' --json
```
Targeted reproduction used the same command with
`--grep 'location and shortcut connections persist|Phase 7 saved device'`.

Final complete focused browser rerun: **13 passed, 1 failed, 0 skipped, 0 timed out**, exit 1. Only the saved-location assertion above failed; TV, Vamp, fresh MusicKit verification, globe dispatch, Connections review, and Home Assistant confirmation browser checks passed. Phase 7 is **not ready for approval** until the reproduced baseline failure is resolved.

### Phase 7 confirmation-invariant follow-up

No production behavior changed in this follow-up. Updated
`src/jarvis/home-assistant.test.ts` to reject expired approvals without provider
POSTs; updated `tests/connection-shortcuts.spec.ts` to exercise repeated confirm
clicks and removal of a saved connection during review. Existing tests already
cover simultaneous server approvals, configuration changes, cancellation and
replay. Configured display names and launch names remain unchanged.

Focused unit command above: **122 passed, 0 failed/skipped/timed out**.
Browser invocation above with `--grep 'Phase 7'`: **3 passed, 0 failed/skipped/
timed out**, exit 0. Type check and lint passed; production build from the prior
Phase 7 run remains applicable because only tests/documentation changed.
The complete browser gate's known saved-location failure remains unresolved.
No old approval was retried against real hardware. No commit/deploy/publication.
Legacy Shortcut audit outcome `requested` represents an unverified sent command
and displays as dispatched; it is not a separate persisted pre-review request
event. Cancellation adds no dispatch event. Do not describe the current audit
schema as six separately persisted lifecycle categories.


## FINAL CHECKPOINT — Phase 7 stopped (2026-10-05 UTC)

This checkpoint is the final edit. No code, tests, assertions, weather behavior,
saved-location logic, action-history semantics, or later-phase functionality
was changed during checkpoint preparation. No test reruns, live-account data
queries, fixture cleanup, provider actions, or configuration changes were made.
Nothing committed, deployed, or published. Do not make further edits without a
new, explicit user instruction.

### Saved-location failure: exact evidence and uncertainty

- Exact title: `location and shortcut connections persist privately and reject cross-user edits`.
- Test declaration: `tests/collab.spec.ts:445`.
- Failing assertion: `tests/collab.spec.ts:460` (statement spans lines 460–462).

```ts
await expect(a.page.getByRole("textbox", { name: "Place name" })).toHaveValue(
  label,
);
```

Latest complete failing run:
- Expected: `Private place 1791229001050`.
- Actual: `Goldsboro health test`.
- Locator: `getByRole('textbox', { name: 'Place name' })`.
- Assertion deadline: 5000 ms. This is an assertion failure, NOT a runner/test
  timeout; the 30-second test deadline was not reached.
- Overall focused browser command exited 1: 13 passed, 1 failed, 0 skipped,
  0 timed out. The failure precedes the test's Shortcut and cross-user assertions.

Relevant values, with evidence provenance:

| Value | Observed/requested | Evidence/limits |
|---|---|---|
| Location label requested by failing test | `Private place 1791229001050` | Test input and retained Playwright expected-value output |
| Latitude/longitude entered | `40.7`, `-74` | Test source lines 453–454; no captured POST body to independently confirm server receipt |
| Form label displayed after reload | `Goldsboro health test` | Retained Playwright actual-value output; the input initially reads empty, then repeatedly reads this label |
| Prior system-health fixture location | label `Goldsboro health test`, latitude `35.38`, longitude `-77.99` | `tests/system-health.spec.ts` saveLocation fixture; these are source fixture values, not a fresh read of stored rows |
| Actual persisted location row(s), enabled flags, record IDs and order | Unknown | No stored-row dump retained and no new account/database queries performed for this checkpoint |
| Account timezone, response style, temperature preference or persisted default-city setting | Unknown for the failing account | No preference snapshot retained; no proof these preferences caused the mismatch |
| Weather/map runtime location, coordinates or provider request | Not captured for the failing assertion | The assertion is the Connections form, not a weather or map result; do not infer a provider received either location |

Source-level observation only: Connections subscribes to `locations` with
`where: { enabled: 1 }, limit: 1` (`src/components/JarvisConnections.tsx`). The
save route queries `locations` with `where: { userId: auth.userId }, limit: 1`
and no enabled filter, then updates the returned record
(`src/jarvis/connection-routes.ts`). Existing saved records could therefore
produce differing selections. This is a hypothesis, not proven database evidence.

Isolation/reproduction:
- Reproduced in the initial 14-test run, the targeted two-test run, and the final
  14-test run with different newly generated labels and the same actual label.
- Targeted command used the existing environment prefix and:
  `node_modules/.bin/deepspace test run e2e --port 5188 --grep 'location and shortcut connections persist|Phase 7 saved device' --json`.
  Results: 1 passed, 1 failed, 0 skipped/timed out.
- The location test failed first in that two-test run, before the other test.
  This reproduces outside the broader suite but is NOT sole-test isolation or
  clean-account isolation. Neither was run. Persistent test-account data was
  not reset. Do not claim a sole-test or clean-account reproduction.

Console/network/artifact evidence:
- Retained command output reports the expected/actual values and repeated input
  values above. No correlated application JavaScript exception was captured.
  Generic Vite/proxy/NO_COLOR warnings and RecordRoom socket-close notices do
  not establish causation.
- The test saw `Saved.` before reload. It did not capture the save response
  status/body or POST body for this failure; `Saved.` is UI evidence only.
  No relevant network trace or stored preference snapshot is available.
- Original failure artifact was reported at
  `.deepspace/test-results/collab-location-and-shortc-85d89-and-reject-cross-user-edits/error-context.md`.
  It contained the assertion output and DOM snapshot showing the old label.
  That file is no longer present: subsequent successful runner output replaced
  the test-results directory. Do not claim it is currently downloadable.
- Current `.deepspace/playwright-results.json` describes only the later three
  passing confirmation tests (start 2026-10-05T19:39:09.592Z); current
  `.deepspace/test-results` contains `.last-run.json` only.
- No screenshot or Playwright trace was captured for the failed test. Existing
  screenshots from other phases are unrelated and are not evidence here.

Classification: **UNKNOWN**. Possible test isolation/persistent-record issue
or product record-selection defect. Repetition argues against a one-off flake,
but timing, clean-data behavior, and whether this is a regression are unproven.
Do not classify as a confirmed product regression, confirmed isolation issue,
or confirmed timing issue. Do not fix it under this checkpoint instruction.

### Current action-history schema and field meanings

TV browser-local history (`src/components/devices/useTVShortcuts.ts`):
- Key: `jarvis-tv-shortcuts:${encodeURIComponent(userId)}`; bounded to 20 entries.
- Entry: `{ id, device: "KY TV", action: "on" | "off", outcome:
  "requested" | "user-confirmed", timestamp, message }`.
- `outcome: "requested"` is written AFTER reviewed native handoff and displays
  `KY TV power command dispatched · Turn on/off`. It does not record a separate
  pre-confirmation request. Display status says `Action Dispatched · On/Off
  unverified`. No TV device/provider verification is available from this handoff.
- `user-confirmed` is the user's observed result, never provider readback.
  Display status explicitly says `not device verified`.

Play Vamp browser-local history (`src/components/devices/useVampShortcut.ts`):
- Key: `jarvis-vamp-shortcut:${encodeURIComponent(userId)}`; bounded to 20 entries.
- Entry: `{ id, message, timestamp, outcome, source, verified: false, requestId? }`.
- Outcomes: `requested`, `user-confirmed-playing`, `user-reported-not-playing`,
  `musickit-verified`.
- Sources: `shortcut-request`, `user-report`, `musickit`.
- `requested` means reviewed handoff DISPATCHED and unverified, with message
  `Apple Music request dispatched: Play Vamp`. `requestId` links later evidence
  to the dispatch. Review opening alone is not persisted as this event.
- User reports are separate positive/negative evidence; Not Playing is not
  automatically a provider error and never triggers another dispatch.
- `musickit-verified` is a historical matching SDK observation, persisted once
  per request. Stored `verified` stays false because reading local history must
  never prove CURRENT playback. Live verification requires a fresh, authorized,
  user-scoped playlist-matching observation after dispatch; it expires separately.

Home Assistant server audit (`src/jarvis/home-assistant-ledger.ts`):
- Existing SQL audit row: `{ id, user_id, collection: "home_assistant",
  record_id: JSON.stringify(action), created_at, status }`.
- `status` is JSON `{ status: result.status, durationMs }`; changing commands
  return `accepted` after provider acceptance, not physical completion.
- Failure status is `failed_or_unknown`; known failure and uncertain execution
  are not separated in that existing field.
- Cancellation removes the approval and returns transient `cancelled`; it does
  not insert a dispatch or cancellation audit row. Read-only status can record
  `completed`, meaning status retrieval, not a device-changing action completed.
- Other saved Connections Shortcut controls show timestamped dispatch/error text
  but do not create a new persistent generic action-history stream.

| Lifecycle meaning | Separately persisted today? |
|---|---|
| Requested, before review approval | No; pending review is ephemeral UI state |
| Dispatched | Yes for TV/Vamp, under legacy `requested`; Home Assistant acceptance is server-audited separately |
| User-confirmed | Yes, separate TV/Vamp outcomes; positive and negative music reports are distinct |
| Provider-verified | Vamp stores a separate historical MusicKit observation; no persisted TV provider verification or proof of current playback |
| Cancelled | No separate TV/Vamp/Home Assistant history event; cancellation remains distinct transient behavior and produces no dispatch event |
| Error | No TV/Vamp error history outcome; Home Assistant persists `failed_or_unknown`, which includes uncertain execution |

Merged/absent meanings:
- Legacy word `requested` and actual dispatch meaning are merged; it must not be
  described as separately persisted Requested AND Dispatched events.
- Home Assistant error and uncertain execution are merged as `failed_or_unknown`.
- Pre-review Requested, Cancelled, and generic Shortcut Error are absent from
  those persisted histories; absence is not success and must not be backfilled
  with invented events. User reports and provider observations are not merged.

### Backward-compatible migration PROPOSAL ONLY — NOT IMPLEMENTED

1. Add a versioned event envelope alongside existing fields/readers, with
   `schemaVersion: 2`, event ID, user-scoped request ID, occurrence time,
   sanitized reviewed target/action snapshot, evidence source, and a canonical
   event type: `requested | dispatched | user-confirmed | provider-verified |
   cancelled | error`. Keep explicit positive/negative user-report detail.
   Preserve existing identity isolation, history bounds and exact target binding.
2. Normalize legacy TV/Vamp `requested` to canonical `dispatched` on read,
   retaining original outcome/source. Do not fabricate a pre-review Requested
   event, old cancellations, errors, or provider proof. Map TV user-confirmed
   and Vamp positive/negative reports to canonical user-confirmed with detail.
   Map MusicKit history to historical provider-observation evidence; never treat
   migrated local storage as authenticated proof of current playback.
3. Preserve Home Assistant `accepted` as acceptance evidence and
   `failed_or_unknown` as error/uncertain evidence with an explicit uncertainty
   qualifier. Do not silently reinterpret accepted as completed or verified.
4. Only after separate approval, append truthful new lifecycle events at actual
   transitions: review requested, approved dispatch, explicit user report,
   independent provider observation, cancellation, or genuine error. Cancel
   must still issue no provider action, native launch or dispatch event. A
   cancellation audit event, if approved, must be distinct from dispatch.
5. Keep old readers/writers compatible during rollout. Use idempotent event IDs
   and request links, preserve history, test mixed versions and repeated loading,
   keep unknown legacy fields safe, and test stale/duplicate approvals. Never
   modify saved display/launch names as part of migration. Current state must
   still derive from fresh evidence, not historical audit entries.

### Final confirmation-invariant validation (previously executed)

| Check | Passed | Failed | Skipped | Timed out |
|---|---:|---:|---:|---:|
| Focused unit tests | 122 | 0 | 0 | 0 |
| Three focused Phase 7 browser tests | 3 | 0 | 0 | 0 |

- Type check: passed, exit 0.
- Lint: passed, exit 0.
- Prior Phase 7 production build: passed, exit 0. Not rerun for this checkpoint.
- These passing counts apply ONLY to the confirmation-invariant follow-up.
  They do not erase the earlier complete browser result: 13 passed, 1 failed,
  0 skipped, 0 timed out. Full Phase 7 approval gate remains blocked.
- Confirmation follow-up files changed: `src/jarvis/home-assistant.test.ts`,
  `tests/connection-shortcuts.spec.ts`, and `JARVIS_CHECKPOINT.md` only.
  No production files changed in that follow-up. Earlier Phase 7 implementation
  changes remain in the dirty workspace; they were not discarded or hidden.
- This checkpoint-only turn changed `JARVIS_CHECKPOINT.md` only. No tests or
  assertions were edited, skipped, deleted, weakened, or rerun in this turn.
- Exact commands and the full browser environment prefix are recorded above.
  The latest browser subset used `--grep 'Phase 7'` and returned exit 0.
- Nothing committed, deployed, published, or changed in production secrets.
- Physical iPhone validation remains outstanding; native Shortcut execution,
  real MusicKit account playback, and Home Assistant device completion are not
  claimed verified. No later phase is authorized by this checkpoint.

**STOP HERE. No edits after writing this checkpoint.**


## Gmail cleanup inventory and active roadmap replacement

The user reported five changed files from an interrupted Gmail Phase 8 run.
No five Gmail-modified files can be identified in this workspace. Inspection
of all src/tests plus worker/config/docs found no Gmail provider, component,
OAuth route, token store, Google client secret configuration, or registration.
Inspected likely integration files: worker.ts, .env.example,
src/jarvis/confirmation-room.ts, src/jarvis/routes.ts,
src/components/JarvisConnections.tsx. Their unfinished changes belong to earlier
phases; none was reverted. The only worker/.env additions are the prior Tavily
server secret name. Existing Gmail mentions in the public-search exclusion,
Settings test asserting Gmail is absent, and historical checkpoint notes were
retained because deleting them would change earlier safety/tests/history.

Interrupted Phase 8 work consisted of reading Google integration documentation
and starting a read-only catalog command; no source edit is evidenced. No
production OAuth/token configuration was changed. Functional cleanup is thus
zero source changes, not a claimed revert of five invented files.

JARVIS_ROADMAP.md removes Gmail from the active plan, promotes Home HUD redesign
(former Phase 9) to Phase 8, Privacy/Security/Backup to Phase 9, and Final Validation
and Release to Phase 10. Historical checkpoint content remains intact.
Cleanup validation passed: npm run test:unit (287 passed, 0 failed/skipped/timed out);
browser grep Settings redesign|device voice|Phase 7 (14 passed, 0 failed/skipped/
timed out); npm run type-check, npm run lint, and npm run build each exit 0.
No application source changed during cleanup. Known saved-location and live-map-
provider limitations remain. New Phase 8 Home HUD is now authorized and active.
