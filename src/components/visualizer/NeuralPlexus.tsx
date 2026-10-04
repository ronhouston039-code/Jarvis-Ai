import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { FocusState } from "../FocusOrb";
import { RadialRing } from "./RadialRing";
import type { FocusAudioMeter } from "../focus-audio";
import "./neural-plexus.css";

/** One shared, bounded WebGL scene for the dashboard and cinematic view. */
export function NeuralPlexus({
  state,
  meter,
}: {
  state: FocusState;
  meter: FocusAudioMeter;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mode = useRef(state);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    mode.current = state;
  }, [state]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteCanvas.height = 128;
    const ctx = spriteCanvas.getContext("2d");
    if (!ctx) {
      setFallback(true);
      return;
    }
    let renderer: THREE.WebGLRenderer;
    let gl: WebGL2RenderingContext | null = null;
    try {
      const canvas = document.createElement("canvas");
      gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      if (!gl) {
        setFallback(true);
        return;
      }
      renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl,
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      setFallback(true);
      return;
    }
    const allocated: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(resource: T): T => {
      allocated.push(resource);
      return resource;
    };
    let removeListeners = () => {};
    let frame = 0;
    const cleanup = () => {
      cancelAnimationFrame(frame);
      removeListeners();
      allocated.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
    try {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000206, 0);
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.dataset.renderer = "webgl";
      container.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 1, 1000);
      camera.position.z = 300;
      const group = new THREE.Group();
      scene.add(group);
      const count = 220,
        radius = 95;
      const positions = new Float32Array(count * 3);
      const velocity = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        let x: number, y: number, z: number;
        do {
          x = Math.random() * 2 - 1;
          y = Math.random() * 2 - 1;
          z = Math.random() * 2 - 1;
        } while (x * x + y * y + z * z > 1);
        positions.set([x * radius, y * radius, z * radius], i * 3);
        velocity.set(
          [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5],
          i * 3,
        );
      }
      const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      glow.addColorStop(0, "rgba(255,255,255,1)");
      glow.addColorStop(0.08, "rgba(190,250,255,.95)");
      glow.addColorStop(0.25, "rgba(0,210,255,.7)");
      glow.addColorStop(0.55, "rgba(0,119,254,.2)");
      glow.addColorStop(1, "rgba(0,119,254,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 128, 128);
      const texture = track(new THREE.CanvasTexture(spriteCanvas));
      const pointGeo = track(new THREE.BufferGeometry());
      pointGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3).setUsage(
          THREE.DynamicDrawUsage,
        ),
      );
      const pointMat = track(
        new THREE.PointsMaterial({
          color: 0x00d2ff,
          size: 3.5,
          map: texture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      group.add(new THREE.Points(pointGeo, pointMat));
      // Every undirected pair has exactly two endpoints (six floats).
      const linePositions = new Float32Array(count * (count - 1) * 3);
      const colors = new Float32Array(linePositions.length);
      const lineGeo = track(new THREE.BufferGeometry());
      lineGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(linePositions, 3).setUsage(
          THREE.DynamicDrawUsage,
        ),
      );
      lineGeo.setAttribute(
        "color",
        new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage),
      );
      lineGeo.setDrawRange(0, 0);
      const lineMat = track(
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      lines.frustumCulled = false;
      group.add(lines);
      const coreMat = track(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const core = new THREE.Sprite(coreMat);
      core.scale.set(125, 125, 1);
      scene.add(core);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      let previous = 0,
        rotation = 0,
        bass = 0,
        treble = 0,
        level = 0;
      let tiltX = 0,
        tiltY = 0;
      const pointer = (event: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        tiltX = ((event.clientY - rect.top) / rect.height - 0.5) * 0.12;
        tiltY = ((event.clientX - rect.left) / rect.width - 0.5) * 0.12;
      };
      const resetTilt = () => {
        tiltX = tiltY = 0;
      };
      const resize = () => {
        const width = container.clientWidth,
          height = container.clientHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(1, height);
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      const lost = (event: Event) => {
        event.preventDefault();
        cancelAnimationFrame(frame);
        setFallback(true);
      };
      removeListeners = () => {
        observer.disconnect();
        container.removeEventListener("pointermove", pointer);
        container.removeEventListener("pointerleave", resetTilt);
        renderer.domElement.removeEventListener("webglcontextlost", lost);
      };
      container.addEventListener("pointermove", pointer);
      container.addEventListener("pointerleave", resetTilt);
      renderer.domElement.addEventListener("webglcontextlost", lost);
      observer.observe(container);
      resize();
      const animate = (time: number) => {
        frame = requestAnimationFrame(animate);
        if (document.hidden) {
          previous = time;
          return;
        }
        const dt = Math.min((time - previous) / 1000 || 1 / 60, 0.05);
        previous = time;
        const state = mode.current,
          bands = meter.bands(state);
        bass += (bands.bass - bass) * 0.18;
        treble += (Math.max(bands.mid, bands.high) - treble) * 0.18;
        level += (bands.level - level) * 0.18;
        const breathing = reduced.matches
          ? 0
          : (1 + Math.sin((time / 1500) * Math.PI * 2)) * 0.012;
        const scale = Math.min(1.35, 1 + bass * 0.35 + breathing);
        const contraction =
          state === "listening" ? 0.88 : state === "thinking" ? 0.78 : 1;
        group.scale.setScalar(scale * contraction);
        core.scale.setScalar(125 * (1 + bass * 0.35 + breathing));
        coreMat.opacity = Math.min(1, 0.72 + bass * 0.28 + breathing * 3);
        pointMat.size = 3.5 + treble * 2;
        lineMat.opacity = 0.15 + level * 0.28 + treble * 0.22;
        const proximity =
          state === "thinking" ? 27 : state === "listening" ? 36 : 65;
        if (!reduced.matches) {
          rotation +=
            dt *
            (state === "thinking" ? 0.65 : state === "speaking" ? 0.2 : 0.002);
          group.rotation.set(rotation * 0.35 + tiltX, rotation + tiltY, 0);
          for (let i = 0; i < count; i++) {
            const index = i * 3;
            for (let axis = 0; axis < 3; axis++) {
              const n = index + axis;
              velocity[n] +=
                Math.sin(time * 0.0007 + i * 2.4 + axis) * dt * 0.35;
              velocity[n] *= Math.exp(-dt * 0.2);
              positions[n] +=
                (velocity[n] * 5 * (1 + level * 0.8) +
                  Math.sin(time * 0.004 + i + axis) * treble * 12) *
                dt;
            }
            const x = positions[index],
              y = positions[index + 1],
              z = positions[index + 2],
              length = Math.hypot(x, y, z);
            if (length > radius) {
              for (let axis = 0; axis < 3; axis++) {
                const n = index + axis,
                  normal = positions[n] / length;
                positions[n] = normal * radius;
                velocity[n] = -velocity[n];
              }
            }
          }
        }
        let offset = 0;
        for (let i = 0; i < count; i++)
          for (let j = i + 1; j < count; j++) {
            const a = i * 3,
              b = j * 3;
            const d = Math.hypot(
              positions[a] - positions[b],
              positions[a + 1] - positions[b + 1],
              positions[a + 2] - positions[b + 2],
            );
            if (d >= proximity) continue;
            const intensity = (1 - d / proximity) * (0.55 + treble * 0.45);
            for (const p of [a, b]) {
              linePositions[offset] = positions[p];
              colors[offset++] = 0;
              linePositions[offset] = positions[p + 1];
              colors[offset++] = intensity * 0.82;
              linePositions[offset] = positions[p + 2];
              colors[offset++] = intensity;
            }
          }
        pointGeo.attributes.position.needsUpdate = true;
        lineGeo.attributes.position.needsUpdate = true;
        lineGeo.attributes.color.needsUpdate = true;
        lineGeo.setDrawRange(0, offset / 3);
        const canvas = renderer.domElement;
        canvas.dataset.state = state;
        canvas.dataset.scale = scale.toFixed(3);
        canvas.dataset.level = level.toFixed(3);
        canvas.dataset.bass = bass.toFixed(3);
        canvas.dataset.high = treble.toFixed(3);
        canvas.dataset.connections = String(offset / 6);
        canvas.dataset.nodes = String(count);
        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(animate);
      return cleanup;
    } catch {
      cleanup();
      setFallback(true);
      return;
    }
  }, [meter, fallback]);
  return fallback ? (
    <RadialRing state={state} meter={meter} />
  ) : (
    <div ref={host} className="neural-plexus" aria-label="3D neural plexus" />
  );
}
