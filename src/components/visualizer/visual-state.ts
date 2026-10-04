import type { FocusState } from "../FocusOrb";

export type VisualPhase =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "action-requested"
  | "error-or-fallback";

export interface AssistantVisualState {
  phase: VisualPhase;
  activity: FocusState;
  status: string;
  /** Milliseconds on the performance.now()/requestAnimationFrame clock. */
  startedAt: number;
}

export interface AssistantVisualInputs {
  speaking: boolean;
  listening: boolean;
  processing: boolean;
  error: string;
}

export interface VisualBands {
  bass: number;
  mid: number;
  high: number;
  level: number;
  /** An available analyser reporting zero represents actual silence. */
  available: boolean;
}

export interface VisualFrame {
  /** Signed angular velocities in radians per second. */
  ringSpeeds: [number, number, number];
  ringScale: number;
  particleScale: number;
  /** Signed field drift; negative values draw the field inward. */
  particleDrift: number;
  nodeOpacity: number;
  linkOpacity: number;
  coreColor: string;
  coreOpacity: number;
  coreScale: number;
  waveProgress: number;
  waveOpacity: number;
  /** Amplitude of one action pulse, never a completion indicator. */
  actionPulse: number;
}

export const ACTION_VISUAL_DURATION_MS = 900;
export const ACTION_REQUEST_STATUS =
  "Action requested — awaiting confirmation.";

const activityStatus: Record<FocusState, string> = {
  idle: "Ready — awaiting your next request.",
  listening: "Listening.",
  thinking: "Thinking.",
  speaking: "Speaking.",
};

function bounded(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function timestamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Project the existing voice flags; the visualizer owns no voice state. */
export function resolveActivity(
  inputs: Pick<AssistantVisualInputs, "speaking" | "listening" | "processing">,
): FocusState {
  if (inputs.speaking) return "speaking";
  if (inputs.listening) return "listening";
  if (inputs.processing) return "thinking";
  return "idle";
}

export interface VisualActionRequest {
  token: number;
  status: string;
  startedAt: number;
}

function projectVisualState(
  activity: FocusState,
  error: string,
  startedAt: number,
  action: VisualActionRequest | null,
): AssistantVisualState {
  return {
    activity,
    phase: action ? "action-requested" : error ? "error-or-fallback" : activity,
    status: action ? action.status : error || activityStatus[activity],
    startedAt: timestamp(action?.startedAt ?? startedAt),
  };
}

export function resolveVisualState(
  inputs: AssistantVisualInputs,
  startedAt: number,
  action: VisualActionRequest | null = null,
): AssistantVisualState {
  return projectVisualState(
    resolveActivity(inputs),
    inputs.error.trim(),
    startedAt,
    action,
  );
}

/** Only projected activity, errors, and transient visual requests are stored. */
export interface AssistantVisualModel {
  visualState: AssistantVisualState;
  error: string;
  action: VisualActionRequest | null;
  actionToken: number;
}

export type AssistantVisualEvent =
  | { type: "source"; inputs: AssistantVisualInputs; now: number }
  | { type: "request-action"; status?: string; now: number }
  | { type: "clear-action"; now: number }
  | { type: "expire-action"; token: number; now: number };

export function createAssistantVisualModel(
  inputs: AssistantVisualInputs,
  now: number,
): AssistantVisualModel {
  return {
    visualState: resolveVisualState(inputs, now),
    error: inputs.error.trim(),
    action: null,
    actionToken: 0,
  };
}

function updateProjection(
  previous: AssistantVisualState,
  activity: FocusState,
  error: string,
  action: VisualActionRequest | null,
  now: number,
): AssistantVisualState {
  const next = projectVisualState(activity, error, now, action);
  if (next.phase === previous.phase) next.startedAt = previous.startedAt;
  return next;
}

/** Tokens make an old timeout harmless after a newer request or clear. */
export function assistantVisualReducer(
  model: AssistantVisualModel,
  event: AssistantVisualEvent,
): AssistantVisualModel {
  if (event.type === "source") {
    const activity = resolveActivity(event.inputs);
    const error = event.inputs.error.trim();
    if (activity === model.visualState.activity && error === model.error)
      return model;
    return {
      ...model,
      error,
      visualState: updateProjection(
        model.visualState,
        activity,
        error,
        model.action,
        event.now,
      ),
    };
  }

  if (event.type === "request-action") {
    const token = model.actionToken + 1;
    const action: VisualActionRequest = {
      token,
      status: event.status?.trim() || ACTION_REQUEST_STATUS,
      startedAt: timestamp(event.now),
    };
    return {
      ...model,
      action,
      actionToken: token,
      visualState: projectVisualState(
        model.visualState.activity,
        model.error,
        action.startedAt,
        action,
      ),
    };
  }

  if (
    event.type === "expire-action" &&
    (!model.action || event.token !== model.action.token)
  )
    return model;

  return {
    ...model,
    action: null,
    actionToken: model.actionToken + 1,
    visualState: updateProjection(
      model.visualState,
      model.visualState.activity,
      model.error,
      null,
      event.now,
    ),
  };
}

/**
 * A deterministic animation sample. elapsedSeconds is time since phase entry,
 * not simulated task progress. Audio fallback is confined to actual speech.
 */
export function sampleVisualFrame(
  state: AssistantVisualState,
  elapsedSeconds: number,
  bands: VisualBands,
  reducedMotion: boolean,
): VisualFrame {
  const elapsed = bounded(elapsedSeconds, 0, 1e9);
  const level = bands.available ? bounded(bands.level, 0, 1) : 0;
  const bass = bands.available ? bounded(bands.bass, 0, 1) : 0;
  const mid = bands.available ? bounded(bands.mid, 0, 1) : 0;
  const high = bands.available ? bounded(bands.high, 0, 1) : 0;
  const canUseSpeechFallback =
    state.activity === "speaking" && !bands.available;
  const speechEnergy = canUseSpeechFallback
    ? 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2.4))
    : level;
  const speechBass = canUseSpeechFallback ? speechEnergy * 0.6 : bass;
  const speechMid = canUseSpeechFallback ? speechEnergy : mid;
  const speechHigh = canUseSpeechFallback ? speechEnergy * 0.4 : high;
  const frame: VisualFrame = {
    ringSpeeds: [0.16, -0.1, 0.08],
    ringScale: 1,
    particleScale: 1,
    particleDrift: 0.025,
    nodeOpacity: 0.42,
    linkOpacity: 0.17,
    coreColor: "#00c9e8",
    coreOpacity: 0.5,
    coreScale: 0.97,
    waveProgress: 0,
    waveOpacity: 0,
    actionPulse: 0,
  };

  switch (state.phase) {
    case "listening":
      frame.ringSpeeds = [0.1, -0.08, 0.06];
      frame.ringScale = 0.96 + bass * 0.02;
      frame.particleScale = 0.86;
      frame.particleDrift = -0.09;
      frame.nodeOpacity = 0.6 + mid * 0.14;
      frame.linkOpacity = 0.3 + level * 0.1;
      frame.coreColor = "#00d4ff";
      frame.coreOpacity = 0.7 + level * 0.16;
      frame.coreScale = 0.98 + level * 0.035;
      break;
    case "thinking": {
      const flicker =
        Math.sin(elapsed * 12) * 0.7 + Math.sin(elapsed * 19) * 0.3;
      frame.ringSpeeds = [0.6, -0.9, 0.4];
      frame.particleDrift = 0.07;
      frame.nodeOpacity = 0.73 + flicker * 0.12;
      frame.linkOpacity = 0.43 + flicker * 0.1;
      frame.coreColor = "#a3f5ff";
      frame.coreOpacity = 0.87;
      frame.coreScale = 1;
      break;
    }
    case "speaking": {
      frame.ringSpeeds = [
        0.18 + speechEnergy * 0.14,
        -0.12 - speechBass * 0.1,
        0.1 + speechHigh * 0.1,
      ];
      frame.ringScale = 1 + speechBass * 0.11 + speechEnergy * 0.055;
      frame.particleScale = 1 + speechEnergy * 0.06;
      frame.particleDrift = 0.03 + speechEnergy * 0.09;
      frame.nodeOpacity = 0.58 + speechMid * 0.26 + speechHigh * 0.06;
      frame.linkOpacity = 0.24 + speechEnergy * 0.2;
      frame.coreColor = "#8aecff";
      frame.coreOpacity = 0.65 + speechEnergy * 0.25;
      frame.coreScale = 1 + speechBass * 0.12 + speechEnergy * 0.06;
      frame.waveProgress = speechEnergy > 0.002 ? (elapsed * 0.55) % 1 : 0;
      frame.waveOpacity = speechEnergy * 0.08;
      break;
    }
    case "action-requested": {
      const duration = ACTION_VISUAL_DURATION_MS / 1000;
      const pulse =
        elapsed < duration ? Math.sin((elapsed / duration) * Math.PI) : 0;
      frame.ringSpeeds = [0.16, -0.1, 0.08];
      frame.actionPulse = pulse;
      frame.ringScale = 1 + pulse * 0.12;
      frame.particleScale = 1 + pulse * 0.08;
      frame.particleDrift = 0.03;
      frame.nodeOpacity = 0.65 + pulse * 0.12;
      frame.linkOpacity = 0.36 + pulse * 0.14;
      frame.coreColor = "#ffbf69";
      frame.coreOpacity = 0.72 + pulse * 0.2;
      frame.coreScale = 1 + pulse * 0.1;
      break;
    }
    case "error-or-fallback":
      frame.ringSpeeds = [0.07, -0.04, 0.03];
      frame.ringScale = 0.98;
      frame.particleScale = 0.98;
      frame.particleDrift = 0.012;
      frame.nodeOpacity = 0.38;
      frame.linkOpacity = 0.14;
      frame.coreColor = "#a99b86";
      frame.coreOpacity = 0.48;
      frame.coreScale = 0.95;
      if (state.activity === "speaking") {
        frame.ringScale += speechBass * 0.045 + speechEnergy * 0.025;
        frame.particleScale += speechEnergy * 0.025;
        frame.particleDrift += speechEnergy * 0.03;
        frame.nodeOpacity += speechMid * 0.1;
        frame.linkOpacity += speechEnergy * 0.08;
        frame.coreOpacity += speechEnergy * 0.15;
        frame.coreScale += speechBass * 0.045 + speechEnergy * 0.03;
        frame.waveProgress = speechEnergy > 0.002 ? (elapsed * 0.55) % 1 : 0;
        frame.waveOpacity = speechEnergy * 0.045;
      }
      break;
    case "idle":
      break;
  }

  if (reducedMotion) {
    frame.ringSpeeds = [0, 0, 0];
    frame.ringScale = 1;
    frame.particleScale = 1;
    frame.particleDrift = 0;
    frame.coreScale = 1;
    frame.waveProgress = 0;
    frame.waveOpacity = 0;
    frame.actionPulse = 0;
    const opacity: Record<VisualPhase, [number, number, number]> = {
      idle: [0.42, 0.17, 0.5],
      listening: [0.68, 0.36, 0.78],
      thinking: [0.73, 0.43, 0.87],
      speaking: [0.78, 0.4, 0.85],
      "action-requested": [0.78, 0.5, 0.86],
      "error-or-fallback": [0.38, 0.14, 0.48],
    };
    [frame.nodeOpacity, frame.linkOpacity, frame.coreOpacity] =
      opacity[state.phase];
  }

  return {
    ...frame,
    ringSpeeds: frame.ringSpeeds.map((speed) =>
      bounded(speed, -1.2, 1.2),
    ) as VisualFrame["ringSpeeds"],
    ringScale: bounded(frame.ringScale, 0.8, 1.25),
    particleScale: bounded(frame.particleScale, 0.8, 1.25),
    particleDrift: bounded(frame.particleDrift, -0.2, 0.2),
    nodeOpacity: bounded(frame.nodeOpacity, 0, 1),
    linkOpacity: bounded(frame.linkOpacity, 0, 1),
    coreOpacity: bounded(frame.coreOpacity, 0, 1),
    coreScale: bounded(frame.coreScale, 0.8, 1.25),
    waveProgress: bounded(frame.waveProgress, 0, 1),
    waveOpacity: bounded(frame.waveOpacity, 0, 1),
    actionPulse: bounded(frame.actionPulse, 0, 1),
  };
}
