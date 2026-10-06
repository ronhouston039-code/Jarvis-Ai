import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import type { FocusAudioMeter } from "../focus-audio";
import {
  sampleVisualFrame,
  type AssistantVisualState,
  type VisualFrame,
} from "./visual-state";
import "./holographic-globe.css";

type Coordinate = readonly [longitude: number, latitude: number];

// Hand-drawn geographic silhouettes are decorative, not navigation data.
const continents: ReadonlyArray<ReadonlyArray<Coordinate>> = [
  [
    [-168, 70],
    [-142, 70],
    [-129, 57],
    [-125, 48],
    [-124, 40],
    [-117, 33],
    [-110, 29],
    [-105, 22],
    [-97, 16],
    [-88, 19],
    [-84, 10],
    [-78, 9],
    [-83, 22],
    [-81, 26],
    [-80, 33],
    [-71, 43],
    [-60, 48],
    [-62, 58],
    [-78, 62],
    [-90, 72],
    [-115, 73],
    [-140, 69],
    [-168, 70],
  ],
  [
    [-81, 10],
    [-72, 12],
    [-61, 9],
    [-51, 4],
    [-35, -6],
    [-38, -15],
    [-48, -27],
    [-54, -36],
    [-66, -55],
    [-73, -49],
    [-74, -30],
    [-80, -8],
    [-81, 10],
  ],
  [
    [-52, 60],
    [-44, 64],
    [-21, 76],
    [-30, 83],
    [-54, 81],
    [-67, 72],
    [-52, 60],
  ],
  [
    [-10, 36],
    [-10, 43],
    [-2, 48],
    [8, 54],
    [15, 69],
    [33, 71],
    [42, 67],
    [60, 69],
    [100, 76],
    [150, 69],
    [178, 62],
    [161, 54],
    [144, 48],
    [133, 42],
    [128, 35],
    [120, 28],
    [110, 20],
    [103, 8],
    [98, 16],
    [88, 22],
    [79, 8],
    [73, 20],
    [62, 25],
    [52, 15],
    [43, 13],
    [35, 30],
    [24, 36],
    [14, 41],
    [10, 37],
    [-10, 36],
  ],
  [
    [-17, 15],
    [-13, 29],
    [-4, 36],
    [12, 37],
    [32, 31],
    [36, 21],
    [43, 12],
    [51, 11],
    [42, -2],
    [39, -16],
    [32, -29],
    [20, -35],
    [12, -19],
    [8, 0],
    [-1, 5],
    [-17, 15],
  ],
  [
    [113, -22],
    [120, -18],
    [131, -12],
    [139, -17],
    [146, -15],
    [153, -27],
    [150, -38],
    [138, -39],
    [130, -32],
    [116, -34],
    [113, -22],
  ],
  [
    [47, -13],
    [50, -18],
    [46, -26],
    [44, -21],
    [47, -13],
  ],
  [
    [130, 32],
    [135, 35],
    [142, 42],
    [146, 44],
  ],
];

function spherical(longitude: number, latitude: number, radius = 1) {
  const lon = (longitude * Math.PI) / 180;
  const lat = (latitude * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(lat) * Math.sin(lon) * radius,
    Math.sin(lat) * radius,
    Math.cos(lat) * Math.cos(lon) * radius,
  );
}

function outlineSegments(): number[] {
  const segments: number[] = [];
  for (const outline of continents) {
    for (let index = 1; index < outline.length; index++) {
      const previous = outline[index - 1];
      const next = outline[index];
      const steps = Math.max(
        2,
        Math.ceil(Math.hypot(next[0] - previous[0], next[1] - previous[1]) / 2),
      );
      for (let step = 0; step < steps; step++) {
        for (const progress of [step / steps, (step + 1) / steps]) {
          const point = spherical(
            previous[0] + (next[0] - previous[0]) * progress,
            previous[1] + (next[1] - previous[1]) * progress,
            1.008,
          );
          segments.push(point.x, point.y, point.z);
        }
      }
    }
  }
  return segments;
}

const outlines = outlineSegments();
const initialRotation = Math.PI / 3;
const fallbackPaths = continents.map((outline) => {
  let path = "";
  let visible = false;
  for (let index = 0; index < outline.length; index++) {
    const coordinate = outline[index];
    const point = spherical(coordinate[0], coordinate[1]);
    point.applyAxisAngle(new THREE.Vector3(0, 1, 0), initialRotation);
    if (point.z < 0) {
      visible = false;
      continue;
    }
    path += `${visible ? "L" : "M"}${(64 + point.x * 50).toFixed(2)} ${(64 - point.y * 50).toFixed(2)} `;
    visible = true;
  }
  return path;
});

type GlobeScene = {
  canvas: HTMLCanvasElement;
  draw: (
    frame: VisualFrame,
    delta: number,
    elapsed: number,
    reducedMotion: boolean,
  ) => void;
  rotation: () => number;
  ringRotation: () => number;
  dispose: () => void;
};

/** The scene is allocated once; state and audio only change GPU uniforms/transforms. */
function createGlobeScene(
  element: HTMLDivElement,
  onContextLost: () => void,
  neural = false,
): GlobeScene | null {
  const canvas = document.createElement("canvas");
  const allocated: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(resource: T): T => {
    allocated.push(resource);
    return resource;
  };
  let renderer: THREE.WebGLRenderer | undefined;
  let context: WebGL2RenderingContext | null = null;
  let observer: ResizeObserver | undefined;
  let disposed = false;
  const lost = (event: Event) => {
    event.preventDefault();
    onContextLost();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    canvas.removeEventListener("webglcontextlost", lost);
    allocated.forEach((resource) => resource.dispose());
    renderer?.dispose();
    if (renderer) renderer.forceContextLoss();
    else context?.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  };
  try {
    context = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    if (!context) return null;
    renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    const webgl = renderer;
    webgl.setClearColor(0x000206, 0);
    webgl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.renderer = "webgl";
    canvas.className = "holographic-globe__canvas";
    element.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
    camera.position.z = 3.65;
    const globe = new THREE.Group();
    globe.rotation.set(0.04, initialRotation, -0.12);
    scene.add(globe);
    const sphereGeometry = track(new THREE.SphereGeometry(0.998, 40, 28));
    const sphereMaterial = track(
      new THREE.MeshBasicMaterial({
        color: 0x001b43,
        transparent: true,
        opacity: neural ? 0.12 : 0.76,
        depthWrite: !neural,
      }),
    );
    globe.add(new THREE.Mesh(sphereGeometry, sphereMaterial));

    const gridPositions: number[] = [];
    const addSegment = (first: THREE.Vector3, second: THREE.Vector3) => {
      gridPositions.push(
        first.x,
        first.y,
        first.z,
        second.x,
        second.y,
        second.z,
      );
    };
    for (let latitude = -75; latitude <= 75; latitude += 15) {
      for (let longitude = -180; longitude < 180; longitude += 4) {
        addSegment(
          spherical(longitude, latitude),
          spherical(longitude + 4, latitude),
        );
      }
    }
    for (let longitude = -180; longitude < 180; longitude += 15) {
      for (let latitude = -90; latitude < 90; latitude += 4) {
        addSegment(
          spherical(longitude, latitude),
          spherical(longitude, Math.min(90, latitude + 4)),
        );
      }
    }
    const lineGeometry = (positions: number[]) => {
      const geometry = track(new THREE.BufferGeometry());
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      return geometry;
    };
    const lineMaterial = (color: number, opacity: number) =>
      track(
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
    const gridMaterial = lineMaterial(0x00bfff, 0.28);
    globe.add(
      new THREE.LineSegments(lineGeometry(gridPositions), gridMaterial),
    );
    const landMaterial = lineMaterial(0x54eaff, 0.84);
    globe.add(new THREE.LineSegments(lineGeometry(outlines), landMaterial));

    const particles = new THREE.Group();
    scene.add(particles);
    const nodes: number[] = [];
    const positions: THREE.Vector3[] = [];
    const count = neural ? 220 : 84;
    for (let index = 0; index < count; index++) {
      const y = 1 - (2 * (index + 0.5)) / count;
      const radius = Math.sqrt(1 - y * y);
      const angle = index * 2.39996323;
      const shell = neural ? 0.73 + (index % 5) * 0.016 : 1.07 + (index % 5) * 0.031;
      const point = new THREE.Vector3(
        Math.cos(angle) * radius * shell,
        y * shell,
        Math.sin(angle) * radius * shell,
      );
      positions.push(point);
      nodes.push(point.x, point.y, point.z);
    }
    const nodeGeometry = lineGeometry(nodes);
    const nodeMaterial = track(
      new THREE.PointsMaterial({
        color: 0xa9f7ff,
        size: neural ? 0.026 : 0.019,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    particles.add(new THREE.Points(nodeGeometry, nodeMaterial));
    const links: number[] = [];
    for (let index = 0; index < positions.length; index++) {
      for (let next = index + 1; next < positions.length; next++) {
        if (positions[index].distanceToSquared(positions[next]) < 0.23)
          links.push(
            ...positions[index].toArray(),
            ...positions[next].toArray(),
          );
      }
    }
    const linkMaterial = lineMaterial(0x56deff, 0.18);
    particles.add(new THREE.LineSegments(lineGeometry(links), linkMaterial));

    const ringMaterial = lineMaterial(0x48dfff, 0.38);
    const ringArcMaterial = track(
      new THREE.MeshBasicMaterial({
        color: 0x8af3ff,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const actionMaterial = track(
      new THREE.MeshBasicMaterial({
        color: 0xffbc66,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    const dotGeometry = track(new THREE.SphereGeometry(0.022, 8, 6));
    const actionGeometry = track(new THREE.SphereGeometry(0.038, 10, 8));
    const rings = [0, 1, 2].map((index) => {
      const radius = neural ? 1.02 + index * 0.16 : 1.11 + index * 0.075;
      const ring = new THREE.Group();
      ring.rotation.set(
        neural ? [0.06, -0.08, 0.1][index] : [0.77, -0.88, 0.28][index],
        neural ? [0.02, -0.04, 0.06][index] : [0.15, -0.35, 0.68][index],
        [0.1, 0.4, -0.6][index],
      );
      const orbit = new THREE.Group();
      orbit.rotation.z = index * 2.1;
      const ringPoints = Array.from({ length: 129 }, (_, step) => {
        const angle = (step / 128) * Math.PI * 2;
        return new THREE.Vector3(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0,
        );
      });
      const geometry = track(
        new THREE.BufferGeometry().setFromPoints(ringPoints),
      );
      ring.add(new THREE.Line(geometry, ringMaterial));
      const arcGeometry = track(
        new THREE.TorusGeometry(radius, 0.008, 4, 28, 0.72),
      );
      orbit.add(new THREE.Mesh(arcGeometry, ringArcMaterial));
      const head = new THREE.Mesh(dotGeometry, ringArcMaterial);
      head.position.x = radius;
      orbit.add(head);
      const pulse = new THREE.Mesh(actionGeometry, actionMaterial);
      pulse.visible = false;
      ring.add(pulse);
      ring.add(orbit);
      scene.add(ring);
      return { ring, orbit, pulse, radius };
    });

    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 64;
    const glowContext = glowCanvas.getContext("2d");
    if (!glowContext) throw new Error("globe_glow_unavailable");
    const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.12, "rgba(255,255,255,.94)");
    gradient.addColorStop(0.4, "rgba(255,255,255,.25)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, 64, 64);
    const texture = track(new THREE.CanvasTexture(glowCanvas));
    const coreMaterial = track(
      new THREE.SpriteMaterial({
        map: texture,
        color: 0x4de5ff,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    );
    const core = new THREE.Sprite(coreMaterial);
    core.position.z = 1.075;
    core.scale.set(0.48, 0.48, 1);
    scene.add(core);
    const waveGeometry = track(new THREE.TorusGeometry(0.48, 0.003, 3, 96));
    const waves = [0, 1].map(() => {
      const material = track(
        new THREE.MeshBasicMaterial({
          color: 0x4de5ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
        }),
      );
      const mesh = new THREE.Mesh(waveGeometry, material);
      mesh.position.z = 1.035;
      scene.add(mesh);
      return { mesh, material };
    });
    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      webgl.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    observer = new ResizeObserver(resize);
    observer.observe(element);
    canvas.addEventListener("webglcontextlost", lost);
    resize();
    return {
      canvas,
      rotation: () => globe.rotation.y,
      ringRotation: () => rings[0].orbit.rotation.z,
      draw: (frame, delta, elapsed, reducedMotion) => {
        if (disposed) return;
        if (!reducedMotion) {
          globe.rotation.y += delta * frame.ringSpeeds[0] * 0.25;
          particles.rotation.y += delta * frame.particleDrift;
          particles.rotation.x += delta * frame.particleDrift * 0.23;
          rings.forEach(({ orbit }, index) => {
            orbit.rotation.z += delta * frame.ringSpeeds[index];
          });
        }
        globe.scale.setScalar(frame.ringScale);
        particles.scale.setScalar(frame.particleScale);
        rings.forEach(({ ring, pulse, radius }, index) => {
          ring.scale.setScalar(frame.ringScale);
          const progress = Math.min(1, elapsed / 0.9) * 3;
          pulse.visible =
            frame.actionPulse > 0 &&
            index === Math.min(2, Math.floor(progress));
          const angle = (progress % 1) * Math.PI * 2;
          pulse.position.set(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            0,
          );
        });
        actionMaterial.opacity = frame.actionPulse;
        ringMaterial.color.set(frame.coreColor);
        ringMaterial.opacity = 0.24 + frame.linkOpacity * 0.45;
        ringArcMaterial.color.set(frame.coreColor);
        ringArcMaterial.opacity = 0.45 + frame.nodeOpacity * 0.4;
        gridMaterial.opacity = neural ? 0 : 0.2 + frame.linkOpacity * 0.2;
        landMaterial.opacity = neural ? 0 : 0.56 + frame.nodeOpacity * 0.35;
        nodeMaterial.opacity = frame.nodeOpacity;
        linkMaterial.opacity = frame.linkOpacity * (neural ? 1.8 : 0.42);
        coreMaterial.color.set(frame.coreColor);
        coreMaterial.opacity = frame.coreOpacity;
        core.scale.set(0.48 * frame.coreScale, 0.48 * frame.coreScale, 1);
        waves.forEach(({ mesh, material }, index) => {
          const progress = (frame.waveProgress + index * 0.5) % 1;
          mesh.visible = !reducedMotion && frame.waveOpacity > 0;
          mesh.scale.setScalar(0.24 + progress * 1.85);
          material.opacity = frame.waveOpacity * (1 - progress);
          material.color.set(frame.coreColor);
        });
        webgl.render(scene, camera);
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}

function diagnostic(
  element: HTMLElement | SVGSVGElement,
  key: string,
  value: string,
) {
  if (element.dataset[key] !== value) element.dataset[key] = value;
}

/** A shared live-state renderer; it never creates or owns an audio capture source. */
export function HolographicGlobe({
  visualState,
  meter,
  onFrame,
  variant = "earth",
}: {
  visualState: AssistantVisualState;
  meter: FocusAudioMeter;
  onFrame?: (frame: VisualFrame) => void;
  variant?: "earth" | "neural";
}) {
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const currentState = useRef(visualState);
  const frameCallback = useRef(onFrame);
  const [fallback, setFallback] = useState(false);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    currentState.current = visualState;
  }, [visualState]);
  useEffect(() => {
    frameCallback.current = onFrame;
  }, [onFrame]);
  useEffect(() => {
    const element = host.current;
    const fallbackSvg = svg.current;
    if (!element || !fallbackSvg) return;
    let scene: GlobeScene | null = null;
    let disposed = false;
    let animationFrame = 0;
    let previous = 0;
    let particleScale: number | undefined;
    let rotation = initialRotation;
    const ringAngles = [0, 2.1, 4.2];
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = media.matches;
    const fallbackRings = Array.from(
      fallbackSvg.querySelectorAll<SVGGElement>("[data-orbit-ring]"),
    );
    const fallbackParticles =
      fallbackSvg.querySelector<SVGGElement>("[data-particles]")!;
    const fallbackCore = fallbackSvg.querySelector<SVGGElement>("[data-core]")!;
    const fallbackWave =
      fallbackSvg.querySelector<SVGCircleElement>("[data-wave]")!;
    const fallbackAction = fallbackSvg.querySelector<SVGCircleElement>(
      "[data-action-pulse]",
    )!;
    let particleRotation = 0;
    const toFallback = () => {
      scene?.dispose();
      scene = null;
      if (!disposed) setFallback(true);
    };
    scene = createGlobeScene(element, toFallback, variant === "neural");
    if (!scene) setFallback(true);
    else setFallback(false);

    const setPaused = (paused: boolean) => {
      const value = String(paused);
      diagnostic(element, "paused", value);
      diagnostic(fallbackSvg, "paused", value);
      if (scene) diagnostic(scene.canvas, "paused", value);
    };
    const draw = (time: number, delta: number) => {
      const state = currentState.current;
      const elapsed = Math.max(0, (time - state.startedAt) / 1000);
      const bands = meter.bands(state.activity);
      const frame = sampleVisualFrame(state, elapsed, bands, reducedMotion);
      const particleTarget = reducedMotion ? 1 : frame.particleScale;
      particleScale =
        particleScale === undefined || reducedMotion
          ? particleTarget
          : particleScale +
            (particleTarget - particleScale) * (1 - Math.exp(-delta * 6));
      frame.particleScale = particleScale;
      if (scene) {
        try {
          scene.draw(frame, delta, elapsed, reducedMotion);
          rotation = scene.rotation();
          ringAngles[0] = scene.ringRotation();
        } catch {
          toFallback();
        }
      }
      if (!scene) {
        if (!reducedMotion) {
          rotation += delta * frame.ringSpeeds[0] * 0.25;
          particleRotation += delta * frame.particleDrift * 57.2958;
          ringAngles.forEach((angle, index) => {
            ringAngles[index] = angle + delta * frame.ringSpeeds[index];
          });
        }
        fallbackSvg.style.setProperty("--globe-core", frame.coreColor);
        fallbackRings.forEach((ring, index) => {
          ring.setAttribute(
            "transform",
            `translate(64 64) scale(${frame.ringScale}) rotate(${ringAngles[index] * 57.2958}) translate(-64 -64)`,
          );
          ring.setAttribute("opacity", String(0.3 + frame.nodeOpacity * 0.5));
        });
        fallbackParticles.setAttribute(
          "transform",
          `translate(64 64) scale(${frame.particleScale}) rotate(${particleRotation}) translate(-64 -64)`,
        );
        fallbackParticles.style.opacity = String(frame.nodeOpacity);
        fallbackSvg.style.setProperty(
          "--globe-link-opacity",
          String(frame.linkOpacity),
        );
        fallbackCore.setAttribute(
          "transform",
          `translate(64 64) scale(${frame.coreScale}) translate(-64 -64)`,
        );
        fallbackCore.style.opacity = String(frame.coreOpacity);
        fallbackWave.setAttribute("r", String(7 + frame.waveProgress * 36));
        fallbackWave.style.opacity = String(
          reducedMotion ? 0 : frame.waveOpacity * (1 - frame.waveProgress),
        );
        const angle = Math.min(1, elapsed / 0.9) * Math.PI * 6;
        fallbackAction.setAttribute("cx", String(64 + Math.cos(angle) * 56));
        fallbackAction.setAttribute("cy", String(64 + Math.sin(angle) * 19));
        fallbackAction.style.opacity = String(frame.actionPulse);
      }
      const audioSource = bands.available
        ? "measured"
        : state.activity === "speaking"
          ? "timed"
          : "none";
      for (const target of [element, scene?.canvas ?? fallbackSvg]) {
        diagnostic(target, "state", state.phase);
        diagnostic(target, "audioSource", audioSource);
        diagnostic(target, "rotation", rotation.toFixed(4));
        diagnostic(target, "ringRotation", ringAngles[0].toFixed(4));
        diagnostic(target, "level", bands.level.toFixed(3));
        diagnostic(target, "scale", frame.coreScale.toFixed(4));
        diagnostic(target, "particleScale", particleScale.toFixed(4));
        diagnostic(target, "opacity", frame.coreOpacity.toFixed(4));
        diagnostic(target, "coreColor", frame.coreColor);
        diagnostic(
          target,
          "flicker",
          state.phase === "thinking" && !reducedMotion ? "enabled" : "disabled",
        );
        diagnostic(target, "reducedMotion", String(reducedMotion));
      }
      frameCallback.current?.(frame);
    };
    const animate = (time: number) => {
      animationFrame = 0;
      if (disposed || document.hidden) return;
      const delta = previous ? Math.min((time - previous) / 1000, 0.05) : 0;
      previous = time;
      draw(time, delta);
      animationFrame = requestAnimationFrame(animate);
    };
    const visibility = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      previous = 0;
      setPaused(document.hidden);
      if (!document.hidden && !disposed)
        animationFrame = requestAnimationFrame(animate);
    };
    const preference = () => {
      reducedMotion = media.matches;
      // Sampling continues for live colors/audio, but transforms stop at once.
      if (!document.hidden) draw(performance.now(), 0);
    };
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", preference);
    setPaused(document.hidden);
    draw(performance.now(), 0);
    if (!document.hidden) animationFrame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", preference);
      scene?.dispose();
      scene = null;
    };
  }, [meter, variant]);

  return (
    <div
      className={`holographic-globe ${variant === "neural" ? "neural-plexus neural-core" : ""}`}
      ref={host}
      aria-hidden="true"
      data-state={visualState.phase}
    >
      <svg
        ref={svg}
        className="holographic-globe__fallback"
        viewBox="0 0 128 128"
        data-renderer="svg"
        data-active={fallback}
        focusable="false"
      >
        <defs>
          <radialGradient id={`${id}-globe-fill`}>
            <stop offset="0" stopColor="#002a60" stopOpacity="0.75" />
            <stop offset="1" stopColor="#001543" stopOpacity="0.9" />
          </radialGradient>
          <radialGradient id={`${id}-core-glow`}>
            <stop offset="0" stopColor="#e9ffff" />
            <stop
              offset="0.16"
              stopColor="var(--globe-core)"
              stopOpacity="0.95"
            />
            <stop
              offset="0.65"
              stopColor="var(--globe-core)"
              stopOpacity="0.15"
            />
            <stop offset="1" stopColor="var(--globe-core)" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}-globe-circle`}>
            <circle cx="64" cy="64" r="50" />
          </clipPath>
        </defs>
        <circle
          cx="64"
          cy="64"
          r="50"
          fill={`url(#${id}-globe-fill)`}
          stroke="#22d5ff"
          strokeWidth="0.7"
        />
        <g clipPath={`url(#${id}-globe-circle)`} fill="none">
          <g stroke="#00bfff" strokeWidth="0.55" opacity="0.35">
            <ellipse cx="64" cy="64" rx="17" ry="50" />
            <ellipse cx="64" cy="64" rx="36" ry="50" />
            <ellipse cx="64" cy="64" rx="50" ry="15" />
            <ellipse cx="64" cy="42" rx="45" ry="11" />
            <ellipse cx="64" cy="86" rx="45" ry="11" />
            <path d="M 14 64 H 114 M 64 14 V 114" />
          </g>
          <g
            stroke="#76edff"
            strokeWidth="1"
            strokeLinejoin="round"
            opacity="0.85"
          >
            {(variant === "neural" ? [] : fallbackPaths).map((path, index) => (
              <path key={index} d={path} />
            ))}
          </g>
        </g>
        <g data-particles="" fill="#a9f7ff">
          <path
            className="holographic-globe__links"
            d="M 23 42 L 38 22 L 63 11 M 97 18 L 112 35 L 121 66 M 13 70 L 21 93 L 42 113 M 75 115 L 103 106 L 116 86 M 38 22 L 47 46 L 23 42 M 103 106 L 86 88 L 75 115"
          />
          {[
            [23, 42],
            [38, 22],
            [63, 11],
            [97, 18],
            [112, 35],
            [121, 66],
            [13, 70],
            [21, 93],
            [42, 113],
            [75, 115],
            [103, 106],
            [116, 86],
            [47, 46],
            [86, 88],
          ].map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r="0.9" />
          ))}
        </g>
        {[0, 1, 2].map((index) => (
          <g
            key={index}
            data-orbit-ring=""
            fill="none"
            stroke="var(--globe-core)"
          >
            <ellipse
              cx="64"
              cy="64"
              rx={55 + index * 2}
              ry={15 + index * 9}
              strokeWidth="0.65"
              opacity="0.6"
            />
            <ellipse
              cx="64"
              cy="64"
              rx={55 + index * 2}
              ry={15 + index * 9}
              strokeWidth="1.4"
              strokeDasharray="17 400"
            />
            <circle
              cx={119 + index * 2}
              cy="64"
              r="1.25"
              fill="var(--globe-core)"
              stroke="none"
            />
          </g>
        ))}
        <circle
          data-wave=""
          cx="64"
          cy="64"
          r="7"
          fill="none"
          stroke="var(--globe-core)"
          strokeWidth="0.7"
          opacity="0"
        />
        <g data-core="">
          <circle cx="64" cy="64" r="16" fill={`url(#${id}-core-glow)`} />
          <circle cx="64" cy="64" r="2.3" fill="#e9ffff" />
        </g>
        <circle
          data-action-pulse=""
          cx="120"
          cy="64"
          r="2.1"
          fill="#ffbc66"
          opacity="0"
        />
      </svg>
    </div>
  );
}
