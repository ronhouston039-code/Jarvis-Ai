import { useEffect, useRef, useState } from "react";
/** Display animation only; captions do not claim word-level alignment from untimed MP3. */
export function HUDSubtitles({
  userText,
  text,
  animate,
  state,
}: {
  userText: string;
  text: string;
  animate: boolean;
  state?: "idle" | "listening" | "thinking" | "speaking";
}) {
  const [shown, setShown] = useState(0);
  const previous = useRef("");
  const wasAnimating = useRef(false);
  const words = text.match(/\S+\s*/g) ?? [];
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const continuation =
      wasAnimating.current && text.startsWith(previous.current);
    wasAnimating.current = animate;
    previous.current = text;
    if (!animate || reduced) {
      setShown(words.length);
      return;
    }
    if (!continuation) setShown(0);
    const timer = setInterval(
      () => setShown((count) => Math.min(words.length, count + 1)),
      110,
    );
    return () => clearInterval(timer);
  }, [text, animate, words.length]);
  const visible = words.slice(0, animate ? shown : words.length).join("");
  const tokens = visible.split(
    /(\b\d+(?:\.\d+)?(?:\s?°?[FC%])?\b|TCL Roku TV|Fire Stick|Living Room Lamp)/gi,
  );
  return (
    <div className="plexus-subtitles">
      {state && (
        <p className="plexus-status" role="status">
          {state === "speaking"
            ? "JARVIS IS SPEAKING…"
            : state === "listening"
              ? "LISTENING…"
              : state === "thinking"
                ? "THINKING…"
                : "READY"}
        </p>
      )}
      {userText && <p className="plexus-user">“{userText}”</p>}
      <p className="plexus-answer" aria-hidden="true">
        {tokens.map((part, i) =>
          i % 2 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
        )}
      </p>
      <span className="sr-only" aria-live="polite">
        {text}
      </span>
      {!text && !userText && (
        <p className="plexus-hint">Tap the microphone to talk to Jarvis.</p>
      )}
    </div>
  );
}
