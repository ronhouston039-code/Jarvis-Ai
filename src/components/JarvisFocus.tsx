import { useEffect, useState } from "react";
import { ArrowUp, Keyboard, Mic, Square, X } from "lucide-react";
import type { FocusState } from "./FocusOrb";
import type { AssistantVisualState } from "./visualizer/visual-state";
import { NeuralPlexus } from "./NeuralPlexus";
import { HudSubtitles } from "./HudSubtitles";
import type { FocusAudioMeter } from "./focus-audio";
import "./jarvis-focus.css";
type Props = {
  visualState: AssistantVisualState;
  meter: FocusAudioMeter;
  caption: string;
  userCaption: string;
  draft: string;
  error: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onMic: () => void;
  onExit: () => void;
  onStop: () => void;
  onKeyboard: () => void;
  continuous: boolean;
  onEndSession: () => void;
};
export function JarvisFocus(p: Props) {
  const state: FocusState = p.visualState.activity;
  const visualNotice =
    p.visualState.phase === state ? "" : p.visualState.status;
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") p.onExit();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [p.onExit]);
  return (
    <section className="jarvis-focus" aria-label="Jarvis Focus Mode">
      <header className="focus-header">
        <span>JARVIS</span>
        <button aria-label="Exit Focus Mode" onClick={p.onExit}>
          <X size={22} />
        </button>
      </header>
      <main className="focus-center">
        <NeuralPlexus state={state} meter={p.meter} />
        <div className="focus-captions">
          <HudSubtitles
            state={state}
            userText={p.userCaption}
            text={state === "listening" ? "" : p.caption}
            animate={state === "speaking" || state === "thinking"}
          />
          {visualNotice && (
            <p className="focus-error" role="status">
              {visualNotice}
            </p>
          )}
          {p.error && p.error !== visualNotice && (
            <p className="focus-error" role="alert">
              {p.error}
            </p>
          )}
        </div>
      </main>
      <footer className="focus-controls">
        {keyboard && (
          <form
            className="focus-keyboard"
            onSubmit={(event) => {
              event.preventDefault();
              p.onSend();
            }}
          >
            <input
              autoFocus
              aria-label="Message JARVIS in Focus Mode"
              value={p.draft}
              onChange={(event) => p.onDraft(event.target.value)}
              placeholder="Talk to Jarvis…"
            />
            <button
              aria-label="Send Focus message"
              disabled={!p.draft.trim() || state === "thinking"}
            >
              <ArrowUp size={20} />
            </button>
          </form>
        )}
        {p.continuous && (
          <button className="focus-end-session" onClick={p.onEndSession}>
            End voice session
          </button>
        )}
        <div className="focus-buttons">
          <button
            className={state === "listening" ? "focus-mic active" : "focus-mic"}
            aria-label={
              state === "listening"
                ? "Stop Focus listening"
                : "Start Focus listening"
            }
            aria-pressed={state === "listening"}
            onClick={p.onMic}
            data-greeting-skip
          >
            <Mic size={26} />
          </button>
          <button
            aria-label={
              keyboard ? "Hide Focus keyboard" : "Show Focus keyboard"
            }
            aria-pressed={keyboard}
            onClick={() => {
              p.onKeyboard();
              setKeyboard(!keyboard);
            }}
            data-greeting-skip
          >
            <Keyboard size={22} />
          </button>
          {(state === "speaking" || state === "thinking") && (
            <button
              aria-label={
                state === "speaking"
                  ? "Stop Focus speech"
                  : "Stop Focus response"
              }
              onClick={p.onStop}
            >
              <Square size={18} />
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
