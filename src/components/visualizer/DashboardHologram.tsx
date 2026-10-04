import { useEffect, useId, useRef } from "react";
import type { FocusState } from "../FocusOrb";
import type { FocusAudioMeter } from "../focus-audio";
import { NeuralPlexus } from "./NeuralPlexus";
import "./dashboard-hologram.css";

const ticks = Array.from({ length: 120 }, (_, index) => index * 3);
const sparks = Array.from({ length: 50 }, (_, index) => {
  const angle = index * 2.39996323;
  const radius = 190 + ((index * 29) % 53);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    radius: index % 9 === 0 ? 2.4 : 0.8,
    opacity: 0.2 + ((index * 7) % 8) / 10,
  };
});

/** Decorative dashboard frame; speech and microphone ownership stay in the shared meter. */
export function DashboardHologram({
  state,
  meter,
}: {
  state: FocusState;
  meter: FocusAudioMeter;
}) {
  const root = useRef<HTMLDivElement>(null);
  const currentState = useRef(state);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    currentState.current = state;
  }, [state]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let energy = 0;
    let bass = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      if (document.hidden) return;
      const bands = meter.bands(currentState.current);
      energy += (bands.level - energy) * 0.16;
      bass += (bands.bass - bass) * 0.16;
      element.style.setProperty("--hologram-energy", energy.toFixed(3));
      element.style.setProperty("--hologram-bass", bass.toFixed(3));
      element.style.setProperty(
        "--hologram-pulse",
        (1 + (reducedMotion.matches ? 0 : bass * 0.04)).toFixed(3),
      );
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [meter]);

  return (
    <div
      ref={root}
      className="dashboard-hologram"
      data-state={state}
      aria-hidden="true"
    >
      <div className="dashboard-hologram__halo" />
      <div className="dashboard-hologram__sphere">
        <svg
          className="dashboard-hologram__rings"
          viewBox="-240 -240 480 480"
          fill="none"
          focusable="false"
        >
          <defs>
            <filter
              id={`${id}-ring-glow`}
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feGaussianBlur stdDeviation="2.1" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id={`${id}-ring-wash`}>
              <stop offset="0" stopColor="#00d2ff" stopOpacity="0" />
              <stop offset="0.65" stopColor="#008aff" stopOpacity="0.02" />
              <stop offset="0.86" stopColor="#00bfff" stopOpacity="0.09" />
              <stop offset="1" stopColor="#00d2ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle r="225" fill={`url(#${id}-ring-wash)`} />
          <g className="dashboard-hologram__sparks" fill="#5ceaff">
            {sparks.map((spark, index) => (
              <circle
                key={index}
                cx={spark.x}
                cy={spark.y}
                r={spark.radius}
                opacity={spark.opacity}
                filter={spark.radius > 2 ? `url(#${id}-ring-glow)` : undefined}
              />
            ))}
          </g>
          <g stroke="#008ee8" strokeWidth="0.65" opacity="0.46">
            <circle r="205" />
            <circle r="197" />
            <circle r="181" />
            <circle r="152" />
            <circle r="121" />
            <circle r="94" />
          </g>
          <g className="dashboard-hologram__ticks" stroke="#14cbff">
            {ticks.map((angle, index) => (
              <path
                key={angle}
                d={index % 10 === 0 ? "M 0 -215 V -200" : "M 0 -213 V -207"}
                transform={`rotate(${angle})`}
                strokeWidth={index % 10 === 0 ? 1.2 : 0.7}
                opacity={index % 10 === 0 ? 0.85 : 0.35}
              />
            ))}
          </g>
          <g
            className="dashboard-hologram__outer-spin"
            filter={`url(#${id}-ring-glow)`}
          >
            <circle
              r="190"
              stroke="#00bfff"
              strokeWidth="6"
              strokeDasharray="61 6 19 15 4 44"
              opacity="0.78"
            />
            <circle
              r="175"
              stroke="#008cff"
              strokeWidth="2"
              strokeDasharray="3 9"
              opacity="0.7"
            />
          </g>
          <g
            className="dashboard-hologram__inner-spin"
            filter={`url(#${id}-ring-glow)`}
          >
            <circle
              r="161"
              stroke="#0ee2ff"
              strokeWidth="3"
              strokeDasharray="120 35 8 64 53 30"
              opacity="0.8"
            />
            <circle
              r="135"
              stroke="#00a9ff"
              strokeWidth="4"
              strokeDasharray="28 5 7 12 40 21"
              opacity="0.64"
            />
          </g>
          <g
            className="dashboard-hologram__meridians"
            stroke="#00b9ff"
            strokeWidth="0.6"
            opacity="0.32"
          >
            <path d="M -151 0 H 151 M 0 -151 V 151" />
            <circle r="145" strokeDasharray="1 7" />
            <circle r="108" strokeDasharray="2 7" />
            <path d="M -101 -101 L 101 101 M -101 101 L 101 -101" />
          </g>
        </svg>
        <div className="dashboard-hologram__plexus">
          <NeuralPlexus state={state} meter={meter} />
        </div>
        <svg
          className="dashboard-hologram__orbits"
          viewBox="-240 -240 480 480"
          fill="none"
          focusable="false"
        >
          <g filter={`url(#${id}-ring-glow)`}>
            <ellipse
              rx="224"
              ry="42"
              transform="rotate(-19)"
              stroke="#67eaff"
              strokeWidth="1.1"
              opacity="0.85"
            />
            <ellipse
              rx="196"
              ry="56"
              transform="rotate(29)"
              stroke="#008dff"
              strokeWidth="0.9"
              opacity="0.55"
            />
            <circle cx="-212" cy="73" r="3.2" fill="#d6ffff" />
            <circle cx="210" cy="-72" r="2.9" fill="#b7f9ff" />
            <circle cx="166" cy="92" r="2" fill="#00d2ff" />
          </g>
        </svg>
      </div>
      <svg
        className="dashboard-hologram__globe"
        viewBox="0 0 240 170"
        fill="none"
        focusable="false"
      >
        <defs>
          <radialGradient id={`${id}-planet`} cx="40%" cy="30%" r="75%">
            <stop offset="0" stopColor="#0070b5" stopOpacity="0.85" />
            <stop offset="0.6" stopColor="#00245c" stopOpacity="0.97" />
            <stop offset="1" stopColor="#003797" stopOpacity="0.95" />
          </radialGradient>
          <radialGradient id={`${id}-planet-halo`}>
            <stop offset="0.5" stopColor="#00bfff" stopOpacity="0.18" />
            <stop offset="0.7" stopColor="#0077fe" stopOpacity="0.06" />
            <stop offset="1" stopColor="#0077fe" stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={`${id}-beam`}
            x1="120"
            y1="85"
            x2="120"
            y2="155"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#a9f9ff" stopOpacity="0" />
            <stop offset="0.8" stopColor="#00d2ff" stopOpacity="0.65" />
            <stop offset="1" stopColor="#00aaff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}-planet-clip`}>
            <circle cx="120" cy="67" r="58" />
          </clipPath>
        </defs>
        <ellipse
          cx="120"
          cy="140"
          rx="108"
          ry="22"
          stroke="#008ec3"
          strokeWidth="0.6"
          opacity="0.35"
        />
        <ellipse
          cx="120"
          cy="140"
          rx="94"
          ry="18"
          stroke="#00c9ff"
          opacity="0.68"
        />
        <ellipse
          cx="120"
          cy="140"
          rx="79"
          ry="13"
          stroke="#0077fe"
          strokeWidth="3"
          strokeDasharray="78 17 26 19"
          opacity="0.55"
        />
        <ellipse
          cx="120"
          cy="140"
          rx="63"
          ry="10"
          stroke="#14e3ff"
          strokeWidth="1.4"
          opacity="0.85"
        />
        <ellipse
          cx="120"
          cy="140"
          rx="44"
          ry="6"
          stroke="#00bfff"
          opacity="0.75"
        />
        <rect x="110" y="84" width="20" height="69" fill={`url(#${id}-beam)`} />
        <circle cx="120" cy="67" r="82" fill={`url(#${id}-planet-halo)`} />
        <g className="dashboard-hologram__planet">
          <circle
            cx="120"
            cy="67"
            r="58"
            fill={`url(#${id}-planet)`}
            stroke="#38ddff"
            strokeWidth="1.1"
          />
          <g clipPath={`url(#${id}-planet-clip)`}>
            <g stroke="#0bbcff" strokeWidth="0.55" opacity="0.45">
              <ellipse cx="120" cy="67" rx="58" ry="18" />
              <ellipse cx="120" cy="45" rx="53" ry="13" />
              <ellipse cx="120" cy="90" rx="53" ry="13" />
              <ellipse cx="120" cy="67" rx="20" ry="58" />
              <ellipse cx="120" cy="67" rx="43" ry="58" />
              <path d="M 62 67 H 178 M 120 9 V 125" />
            </g>
            <g
              fill="#048bb3"
              fillOpacity="0.4"
              stroke="#42e9ff"
              strokeWidth="1"
              strokeLinejoin="round"
            >
              <path d="M 75 27 L 87 21 L 97 23 L 106 18 L 113 23 L 107 31 L 109 39 L 102 43 L 97 51 L 87 49 L 85 56 L 91 62 L 87 68 L 80 62 L 77 52 L 69 46 L 69 36 Z" />
              <path d="M 99 14 L 110 10 L 119 15 L 114 23 L 106 23 Z" />
              <path d="M 88 67 L 98 66 L 106 75 L 111 77 L 109 88 L 103 98 L 100 111 L 95 119 L 91 108 L 93 96 L 88 88 L 85 78 Z" />
              <path d="M 126 30 L 134 25 L 144 28 L 145 35 L 137 40 L 130 36 L 126 43 L 121 40 Z" />
              <path d="M 129 44 L 141 42 L 148 48 L 148 57 L 154 65 L 149 76 L 144 86 L 136 88 L 131 78 L 126 68 L 124 55 Z" />
              <path d="M 148 23 L 156 26 L 161 22 L 170 27 L 179 38 L 175 48 L 165 47 L 161 56 L 151 50 L 147 42 L 140 36 Z" />
              <path d="M 165 84 L 175 80 L 183 86 L 183 96 L 172 99 L 163 93 Z" />
              <path d="M 155 83 L 157 89 L 154 96 L 151 91 Z" />
            </g>
          </g>
          <circle
            cx="120"
            cy="67"
            r="59"
            stroke="#00e5ff"
            strokeWidth="0.9"
            opacity="0.35"
          />
          <ellipse
            cx="116"
            cy="65"
            rx="68"
            ry="13"
            transform="rotate(-14 116 65)"
            stroke="#00bfff"
            strokeWidth="0.8"
            opacity="0.7"
          />
        </g>
        <ellipse
          cx="120"
          cy="138"
          rx="22"
          ry="4"
          fill="#00d2ff"
          fillOpacity="0.45"
        />
        <path
          d="M 12 142 H 26 M 213 138 H 227 M 31 151 H 38 M 195 154 H 205"
          stroke="#32e3ff"
          strokeWidth="1.2"
          opacity="0.7"
        />
      </svg>
    </div>
  );
}
