import { useEffect, useRef } from "react";
import type { FocusState } from "../FocusOrb";
import type { FocusAudioMeter } from "../focus-audio";
import "./audio-waveform.css";

const bars = Array.from({ length: 60 }, (_, index) => {
  const distance = Math.abs((index - 29.5) / 29.5);
  const envelope = Math.exp(-distance * distance * 5.5);
  const variation = 0.55 + (Math.sin(index * 1.43) + 1) * 0.22;
  return { x: 7.5 + index * 5, distance, envelope, variation };
});

/** Local audio decoration. The shared meter owns all audio capture and playback. */
export function AudioWaveform({
  state,
  meter,
  compact = false,
}: {
  state: FocusState;
  meter: FocusAudioMeter;
  compact?: boolean;
}) {
  const lines = useRef<Array<SVGLineElement | null>>([]);
  const currentState = useRef(state);
  useEffect(() => {
    currentState.current = state;
  }, [state]);
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    const smoothed = { bass: 0, mid: 0, high: 0, level: 0 };
    const update = (time: number) => {
      frame = requestAnimationFrame(update);
      if (document.hidden || time - previous < 32) return;
      previous = time;
      const bands = meter.bands(currentState.current);
      smoothed.bass += (bands.bass - smoothed.bass) * 0.3;
      smoothed.mid += (bands.mid - smoothed.mid) * 0.3;
      smoothed.high += (bands.high - smoothed.high) * 0.3;
      smoothed.level += (bands.level - smoothed.level) * 0.3;
      for (let index = 0; index < bars.length; index++) {
        const bar = bars[index];
        const line = lines.current[index];
        if (!line) continue;
        const frequency =
          smoothed.bass * (1 - bar.distance) +
          smoothed.mid * bar.variation +
          smoothed.high * bar.distance;
        const audio = Math.min(1, smoothed.level * 0.6 + frequency * 0.7);
        const amplitude = Math.min(
          30,
          0.9 +
            bar.envelope *
              (12 * bar.variation +
                audio * (reducedMotion.matches ? 7 : 24) * bar.variation),
        );
        line.setAttribute("y1", (32 - amplitude).toFixed(2));
        line.setAttribute("y2", (32 + amplitude).toFixed(2));
      }
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [meter]);

  return (
    <svg
      className={`audio-waveform${compact ? " audio-waveform--compact" : ""}`}
      viewBox="0 0 310 64"
      aria-hidden="true"
      focusable="false"
      data-state={state}
    >
      {bars.map((bar, index) => {
        const amplitude = Math.min(30, 0.9 + bar.envelope * 12 * bar.variation);
        return (
          <line
            key={index}
            ref={(element) => {
              lines.current[index] = element;
            }}
            x1={bar.x}
            x2={bar.x}
            y1={32 - amplitude}
            y2={32 + amplitude}
            opacity={0.2 + bar.envelope * 0.8}
          />
        );
      })}
    </svg>
  );
}
