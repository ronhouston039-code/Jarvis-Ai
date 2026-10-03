import { useEffect, useRef } from "react";
import type { FocusAudioMeter } from "./focus-audio";
export type FocusState = "idle" | "listening" | "thinking" | "speaking";
/** Perspective-projected particles form a sphere without adding a graphics runtime. */
export function FocusOrb({
  state,
  meter,
}: {
  state: FocusState;
  meter: FocusAudioMeter;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 480,
      height = 480,
      frame = 0,
      level = 0;
    const points = Array.from({ length: 850 }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / 850,
        r = Math.sqrt(1 - y * y),
        angle = i * 2.39996323;
      return { x: r * Math.cos(angle), y, z: r * Math.sin(angle) };
    });
    const resize = () => {
      const box = element.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const draw = (milliseconds: number) => {
      const time = milliseconds / 1000,
        mode = current.current;
      const energy = meter.level(mode);
      level += (energy - level) * 0.16;
      const breath = motion.matches
        ? 0
        : (1 + Math.sin((time * 2 * Math.PI) / 1.5)) * 0.01;
      const scale = Math.min(1.35, 1 + Math.max(breath, 0.35 * level));
      element.dataset.scale = scale.toFixed(3);
      element.dataset.level = level.toFixed(3);
      context.clearRect(0, 0, width, height);
      const cx = width / 2,
        cy = height / 2,
        radius = (Math.min(width, height) / 3) * scale;
      const bloom = context.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        radius * 1.65,
      );
      bloom.addColorStop(0, "rgba(255,255,255,.2)");
      bloom.addColorStop(0.22, "rgba(0,210,255,.16)");
      bloom.addColorStop(0.6, "rgba(0,119,254,.09)");
      bloom.addColorStop(1, "rgba(0,119,254,0)");
      context.fillStyle = bloom;
      context.fillRect(0, 0, width, height);
      const rotation = motion.matches
          ? 0
          : time * (mode === "thinking" ? 0.8 : 0.12),
        sin = Math.sin(rotation),
        cos = Math.cos(rotation);
      const projected = points
        .map((point, i) => {
          const x = point.x * cos - point.z * sin,
            z = point.x * sin + point.z * cos;
          const perspective = 3 / (3 - z * 0.32);
          return {
            x: cx + x * radius * perspective,
            y: cy + point.y * radius * perspective,
            z,
            i,
          };
        })
        .sort((a, b) => a.z - b.z);
      for (const point of projected) {
        const front = (point.z + 1) / 2;
        const shimmer =
          mode === "listening" && !motion.matches
            ? (1 + Math.sin(time * 9 + point.i)) * 0.16 * level
            : 0;
        context.fillStyle =
          point.z > 0.7
            ? `rgba(220,250,255,${0.32 + front * 0.5 + shimmer})`
            : `rgba(0,${Math.round(119 + front * 91)},255,${0.15 + front * 0.6 + shimmer})`;
        context.beginPath();
        context.arc(
          point.x,
          point.y,
          0.55 + front * 0.95 + level * 0.65,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      if (mode === "thinking") {
        context.save();
        context.translate(cx, cy);
        context.rotate(motion.matches ? 0 : time * 2.8);
        for (let i = 0; i < 3; i++) {
          context.rotate(Math.PI / 3);
          context.strokeStyle =
            i === 1 ? "rgba(0,210,255,.6)" : "rgba(0,119,254,.45)";
          context.lineWidth = 1;
          context.beginPath();
          context.ellipse(
            0,
            0,
            radius * 1.1,
            radius * 0.35,
            0,
            0,
            Math.PI * 1.7,
          );
          context.stroke();
        }
        context.restore();
      }
      const core = context.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        radius * 0.34,
      );
      core.addColorStop(0, `rgba(255,255,255,${0.48 + level * 0.3})`);
      core.addColorStop(0.18, "rgba(160,239,255,.3)");
      core.addColorStop(1, "rgba(0,210,255,0)");
      context.fillStyle = core;
      context.beginPath();
      context.arc(cx, cy, radius * 0.34, 0, Math.PI * 2);
      context.fill();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [meter]);
  return (
    <canvas
      ref={canvas}
      className="focus-orb"
      aria-hidden="true"
      data-state={state}
    />
  );
}
