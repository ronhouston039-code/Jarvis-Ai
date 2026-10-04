# Neural plexus and Cinematic Focus implementation

The existing backend routes, credentials, tool permissions, provider stubs, audit isolation, confirmations and schemas are preserved. Three.js and its types were already installed and locked; this refinement adds no dependency or credential.

## Created or reorganized files

| File                                          | Purpose                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/visualizer/NeuralPlexus.tsx`  | Moved WebGL implementation; bounded 220-node scene, 65-unit idle links, 0.002 rad/s idle rotation, initialization/unmount GPU disposal. |
| `src/components/visualizer/HUDSubtitles.tsx`  | Moved captions; shared 11px state label, live user transcript, progressive spoken captions, cyan metrics.                               |
| `src/components/visualizer/neural-plexus.css` | Moved visualizer/caption styling from `src/components/neural-plexus.css`.                                                               |
| `src/components/visualizer/RadialRing.tsx`    | SVG audio-reactive fallback for absent/lost WebGL.                                                                                      |
| `src/components/visualizer/radial-ring.css`   | SVG sizing/glow styling.                                                                                                                |
| `src/components/layout/DashboardLayout.tsx`   | Mode boundary; fade peripheral UI, then release hidden scene after 400 ms.                                                              |
| `src/components/layout/dashboard-layout.css`  | Obsidian Focus, 1.35 scale, responsive single-column mobile and accessible bottom command bar.                                          |
| `docs/neural-plexus-implementation.md`        | This complete change manifest and verification instructions.                                                                            |

## Updated files

| File                                 | Change                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/NeuralPlexus.tsx`    | Compatibility export for existing imports.                                                                                                                      |
| `src/components/HudSubtitles.tsx`    | Compatibility export for existing imports.                                                                                                                      |
| `src/components/JarvisChat.tsx`      | Shared mode integration, explicitly started foreground voice session, safe cancellation of late transcripts, TTS-preparation gate, timeout and cleanup.         |
| `src/components/JarvisFocus.tsx`     | Shared status captions; End voice session button.                                                                                                               |
| `src/components/JarvisHud.tsx`       | Header Focus button, continuous-session entry, responsive default, approved friendly TV label and editable Goldsboro city shortcut.                             |
| `src/components/WeatherConnect.tsx`  | Bounded city-query prefill only; location is saved only after explicit choice.                                                                                  |
| `src/components/focus-audio.ts`      | FFT 256 analysis; preserve direct playback on partial audio-graph failure.                                                                                      |
| `src/components/focus-audio.test.ts` | Frequency-band and partial-graph recovery regressions.                                                                                                          |
| `src/components/jarvis-speech.ts`    | Optional preparation lifecycle callback; prevents microphone rearm while TTS is fetching.                                                                       |
| `tests/focus.spec.ts`                | Real microphone/MP3 analyser checks, SVG fallback, initialization-failure cleanup, continuous rearm, delayed TTS, canceled transcript rejection, mobile layout. |
| `README.md`                          | Usage, platform limits, build/test instructions.                                                                                                                |

## Run

```sh
npm ci
npm run dev
npm run build
npm run validate
npm run lint
npx deepspace test run all
```

Provision DeepSpace browser test accounts as described in README. CI may use `JARVIS_TEST_AI=1` to mock only the paid model boundary. The execution workspace uses `JARVIS_DEV_PROXY=1`, `NODE_USE_ENV_PROXY=1`, and its configured CA trust for runtime networking.

## Practical limits

Continuous mode is an explicit foreground session, not background wake-word detection. It stops on Exit, End, keyboard entry, mic errors, hiding, or two minutes without transcript activity. Browser recognition may need another user tap on some devices. MP3s have no word timestamps; caption animation is presentation rather than precise word alignment. Device speech synthesis has no WebAudio output buffer, so it retains a gentle pulse. Goldsboro is an editable suggested city, never a fabricated location or weather result.

## Verification

Passed 45 unit tests and all 39 existing/browser checks with no skipped specs. The additional initialization-failure regression also passed, bringing coverage to 40 browser checks (85 tests total). After that cleanup fix, the real microphone/exit check passed again. Type checking, ESLint and the production build passed. Desktop/mobile screenshots were inspected; the mobile microphone remains visible without horizontal overflow. Backend authentication, action-bound confirmations, private audit isolation, Fish Audio fallback, and Home Assistant/Roku policies remain covered.
