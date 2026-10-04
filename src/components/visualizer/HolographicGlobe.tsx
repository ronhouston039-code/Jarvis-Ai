import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import type { FocusState } from "../FocusOrb";
import type { FocusAudioMeter } from "../focus-audio";
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

/** A small local WebGL globe; it never creates or owns an audio capture source. */
export function HolographicGlobe({
  state,
  meter,
}: {
  state: FocusState;
  meter: FocusAudioMeter;
}) {
  const host = useRef<HTMLDivElement>(null);
  const currentState = useRef(state);
  const [fallback, setFallback] = useState(false);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    currentState.current = state;
  }, [state]);
  useEffect(() => {
    const element = host.current;
    if (!element || fallback) return;
    const canvas = document.createElement("canvas");
    let context: WebGL2RenderingContext | null = null;
    let renderer: THREE.WebGLRenderer;
    try {
      context = canvas.getContext("webgl2", {
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      if (!context) {
        setFallback(true);
        return;
      }
      renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      context?.getExtension("WEBGL_lose_context")?.loseContext();
      setFallback(true);
      return;
    }
    const allocated: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(resource: T): T => {
      allocated.push(resource);
      return resource;
    };
    let frame = 0;
    let observer: ResizeObserver | undefined;
    const lost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      allocated.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
    try {
      renderer.setClearColor(0x000206, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      canvas.setAttribute("aria-hidden", "true");
      canvas.dataset.renderer = "webgl";
      canvas.className = "holographic-globe__canvas";
      element.appendChild(canvas);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
      camera.position.z = 3.05;
      const globe = new THREE.Group();
      globe.rotation.set(0.04, initialRotation, -0.12);
      scene.add(globe);
      const sphereGeometry = track(new THREE.SphereGeometry(0.998, 48, 32));
      const sphereMaterial = track(
        new THREE.MeshBasicMaterial({
          color: 0x001f54,
          transparent: true,
          opacity: 0.74,
          depthWrite: true,
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
      const gridGeometry = track(new THREE.BufferGeometry());
      gridGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(gridPositions, 3),
      );
      const gridMaterial = track(
        new THREE.LineBasicMaterial({
          color: 0x00bfff,
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      globe.add(new THREE.LineSegments(gridGeometry, gridMaterial));

      const landGeometry = track(new THREE.BufferGeometry());
      landGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(outlines, 3),
      );
      const landMaterial = track(
        new THREE.LineBasicMaterial({
          color: 0x54eaff,
          transparent: true,
          opacity: 0.94,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      globe.add(new THREE.LineSegments(landGeometry, landMaterial));

      const nodes: number[] = [];
      for (let index = 0; index < 380; index++) {
        const y = 1 - (2 * (index + 0.5)) / 380;
        const radius = Math.sqrt(1 - y * y);
        const angle = index * 2.39996323;
        nodes.push(
          Math.cos(angle) * radius * 1.009,
          y * 1.009,
          Math.sin(angle) * radius * 1.009,
        );
      }
      const nodeGeometry = track(new THREE.BufferGeometry());
      nodeGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(nodes, 3),
      );
      const nodeMaterial = track(
        new THREE.PointsMaterial({
          color: 0x93f5ff,
          size: 0.012,
          transparent: true,
          opacity: 0.64,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      globe.add(new THREE.Points(nodeGeometry, nodeMaterial));

      const resize = () => {
        const width = Math.max(1, element.clientWidth);
        const height = Math.max(1, element.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(element);
      canvas.addEventListener("webglcontextlost", lost);
      resize();
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );
      let previous = 0;
      let bass = 0;
      let level = 0;
      const animate = (time: number) => {
        frame = requestAnimationFrame(animate);
        if (document.hidden) {
          previous = time;
          return;
        }
        const delta = Math.min((time - previous) / 1000 || 1 / 60, 0.05);
        previous = time;
        const bands = meter.bands(currentState.current);
        bass += (bands.bass - bass) * 0.15;
        level += (bands.level - level) * 0.15;
        if (!reducedMotion.matches) {
          globe.rotation.y += delta * 0.16;
          globe.scale.setScalar(1 + bass * 0.025);
        } else {
          globe.scale.setScalar(1);
        }
        gridMaterial.opacity = 0.42 + level * 0.22;
        nodeMaterial.opacity = 0.64 + level * 0.25;
        canvas.dataset.rotation = globe.rotation.y.toFixed(4);
        canvas.dataset.level = level.toFixed(3);
        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(animate);
      return cleanup;
    } catch {
      cleanup();
      setFallback(true);
    }
  }, [meter, fallback]);

  return (
    <div
      className="holographic-globe"
      ref={host}
      aria-hidden="true"
      data-state={state}
    >
      {fallback && (
        <svg
          className="holographic-globe__fallback"
          viewBox="0 0 128 128"
          data-renderer="svg"
          focusable="false"
        >
          <defs>
            <radialGradient id={`${id}-globe-fill`}>
              <stop offset="0" stopColor="#002a60" stopOpacity="0.85" />
              <stop offset="1" stopColor="#001543" stopOpacity="0.9" />
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
            strokeWidth="0.9"
          />
          <g clipPath={`url(#${id}-globe-circle)`} fill="none">
            <g stroke="#00bfff" strokeWidth="0.55" opacity="0.5">
              <ellipse cx="64" cy="64" rx="17" ry="50" />
              <ellipse cx="64" cy="64" rx="36" ry="50" />
              <ellipse cx="64" cy="64" rx="50" ry="15" />
              <ellipse cx="64" cy="42" rx="45" ry="11" />
              <ellipse cx="64" cy="86" rx="45" ry="11" />
              <path d="M 14 64 H 114 M 64 14 V 114" />
            </g>
            <g stroke="#76edff" strokeWidth="1" strokeLinejoin="round">
              {fallbackPaths.map((path, index) => (
                <path key={index} d={path} />
              ))}
            </g>
          </g>
        </svg>
      )}
    </div>
  );
}
