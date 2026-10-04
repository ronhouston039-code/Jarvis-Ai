import { useEffect, useId, useRef } from "react";
import type { FocusState } from "../FocusOrb";
import type { FocusAudioMeter } from "../focus-audio";
import "./radial-ring.css";

/** SVG-only visual fallback: it does not create canvas, WebGL, or audio resources. */
export function RadialRing({
  state,
  meter,
}: {
  state: FocusState;
  meter: FocusAudioMeter;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const sphere = useRef<SVGGElement>(null);
  const rings = useRef<SVGGElement>(null);
  const core = useRef<SVGCircleElement>(null);
  const mode = useRef(state);
  const id = useId().replace(/:/g, "");
  const bloomId = `plexus-bloom-${id}`;
  const coreId = `plexus-core-${id}`;

  useEffect(() => {
    mode.current = state;
  }, [state]);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      level = 0,
      bass = 0,
      angle = 0,
      previous = 0;
    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min((time - previous) / 1000 || 1 / 60, 0.05);
      previous = time;
      if (document.hidden) return;
      const active = mode.current;
      const audio = meter.bands(active);
      level += (audio.level - level) * 0.18;
      bass += (audio.bass - bass) * 0.18;
      const breath = reduced.matches
        ? 0
        : (1 + Math.sin((time / 1500) * Math.PI * 2)) * 0.012;
      const scale = Math.min(1.35, 1 + bass * 0.35 + breath);
      const contraction =
        active === "thinking" ? 0.78 : active === "listening" ? 0.88 : 1;
      if (!reduced.matches) angle += dt * (active === "thinking" ? 65 : 3);
      sphere.current?.setAttribute(
        "transform",
        `translate(200 200) scale(${scale * contraction})`,
      );
      rings.current?.setAttribute("transform", `rotate(${angle})`);
      rings.current?.setAttribute("opacity", String(0.46 + level * 0.45));
      core.current?.setAttribute(
        "opacity",
        String(Math.min(1, 0.72 + bass * 0.28 + breath * 3)),
      );
      element.dataset.level = level.toFixed(3);
      element.dataset.bass = bass.toFixed(3);
      element.dataset.scale = scale.toFixed(3);
      element.dataset.state = active;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [meter]);

  return (
    <div
      className="neural-plexus plexus-radial-fallback"
      aria-label="Neural plexus fallback"
    >
      <svg
        ref={svg}
        viewBox="0 0 400 400"
        aria-hidden="true"
        data-renderer="svg"
        data-state={state}
      >
        <defs>
          <radialGradient id={bloomId}>
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.58" />
            <stop offset="0.18" stopColor="#00d2ff" stopOpacity="0.4" />
            <stop offset="0.55" stopColor="#0077fe" stopOpacity="0.16" />
            <stop offset="1" stopColor="#0077fe" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={coreId}>
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.18" stopColor="#d4faff" stopOpacity="0.92" />
            <stop offset="0.5" stopColor="#00d2ff" stopOpacity="0.54" />
            <stop offset="1" stopColor="#00d2ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={sphere} transform="translate(200 200)">
          <circle r="148" fill={`url(#${bloomId})`} />
          <g ref={rings} fill="none" stroke="#00d2ff" opacity="0.46">
            <circle r="112" strokeWidth="0.9" />
            <circle r="107" strokeWidth="2" strokeDasharray="3 15" />
            <circle r="83" strokeWidth="0.65" stroke="#0077fe" />
            <circle r="57" strokeWidth="1.4" strokeDasharray="2 10" />
            <ellipse
              rx="112"
              ry="36"
              strokeWidth="0.7"
              transform="rotate(-28)"
            />
            <ellipse
              rx="112"
              ry="36"
              strokeWidth="0.7"
              transform="rotate(28)"
            />
          </g>
          <circle ref={core} r="42" fill={`url(#${coreId})`} opacity="0.72" />
        </g>
      </svg>
    </div>
  );
}
