# JARVIS on DeepSpace

An iPhone-friendly holographic dashboard and personal assistant with streamed AI conversations, tap-to-talk dictation, device spoken replies, private conversation history, explicit preference memory, persistent one-time reminders, notifications, and action-bound deletion confirmations.

This project is the live DeepSpace adaptation. The modular Python backend in the workspace root remains separate. Weather, calendar, email, music, maps, and smart-home integrations are **not connected in this app**. No provider success is simulated in production. Background wake-word detection and push notifications are not implemented. Dictation availability depends on browser/device support; iPhone keyboard dictation is a fallback.

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

With `LLM_MODE=groq`, the app owner’s conversations and compaction use Groq with `GROQ_API_KEY`. The default Groq model is `openai/gpt-oss-120b`; `GROQ_MODEL` is an optional server setting. Other users use native DeepSpace chat billed to their own credits; they cannot spend the owner’s Groq/Fish credentials. Groq is bounded to 6 steps, 16 executed tools, 2,048 output tokens, no automatic retry, and a 45-second turn timeout. Native chat uses DeepSpace AI credits billed to the signed-in caller. The default model is the catalog's GPT Luna when available. No exposed API key from a chat transcript is used. In Settings, save your actual timezone before relative-date reminders. Unspecified reminder times prompt clarification.

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

Optional owner-only server voice uses `GROQ_API_KEY` for Whisper transcription, and `VOICE_API_KEY` plus `VOICE_ID` for Fish Audio speech. Set rotated credentials through DeepSpace's Secrets UI/store and redeploy. `VOICE_ID` is the Fish voice reference identifier, not an API key. The UI requests Fish Audio on Listen when configured for the current account; it shows an audio player. Provider failure offers an explicit device-voice fallback. Fish Audio HTTP 402 means API funding is required at https://fish.audio/app/developers, separate from subscription credits. No optional voice key is required for the shipped app.

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
