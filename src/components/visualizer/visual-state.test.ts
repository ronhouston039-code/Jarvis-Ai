import { describe, expect, it } from "vitest";
import {
  ACTION_REQUEST_STATUS,
  ACTION_VISUAL_DURATION_MS,
  assistantVisualReducer,
  createAssistantVisualModel,
  resolveActivity,
  resolveVisualState,
  sampleVisualFrame,
  type AssistantVisualInputs,
  type AssistantVisualModel,
  type AssistantVisualState,
  type VisualBands,
  type VisualPhase,
} from "./visual-state";

const idle: AssistantVisualInputs = {
  speaking: false,
  listening: false,
  processing: false,
  error: "",
};
const silent: VisualBands = {
  bass: 0,
  mid: 0,
  high: 0,
  level: 0,
  available: true,
};
const unavailable = { ...silent, available: false };
const voice = {
  bass: 0.7,
  mid: 0.8,
  high: 0.3,
  level: 0.75,
  available: true,
};
const phases: VisualPhase[] = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "action-requested",
  "error-or-fallback",
];

function state(phase: VisualPhase): AssistantVisualState {
  return {
    phase,
    activity:
      phase === "action-requested" || phase === "error-or-fallback"
        ? "idle"
        : phase,
    status: phase,
    startedAt: 0,
  };
}

function source(
  model: AssistantVisualModel,
  changes: Partial<AssistantVisualInputs>,
  now: number,
) {
  return assistantVisualReducer(model, {
    type: "source",
    inputs: { ...idle, ...changes },
    now,
  });
}

describe("authoritative assistant visual projection", () => {
  it("uses speaking, listening, processing, idle priority without new voice flags", () => {
    expect(resolveActivity(idle)).toBe("idle");
    expect(resolveActivity({ ...idle, processing: true })).toBe("thinking");
    expect(
      resolveActivity({ ...idle, listening: true, processing: true }),
    ).toBe("listening");
    expect(
      resolveActivity({
        ...idle,
        speaking: true,
        listening: true,
        processing: true,
      }),
    ).toBe("speaking");
  });

  it("tracks rapid listening → thinking → speaking → listening and phase timing", () => {
    let model = createAssistantVisualModel(idle, 10);
    const transitions = [
      { inputs: { listening: true }, phase: "listening", now: 20 },
      { inputs: { processing: true }, phase: "thinking", now: 30 },
      { inputs: { speaking: true }, phase: "speaking", now: 40 },
      { inputs: { listening: true }, phase: "listening", now: 50 },
    ] as const;
    for (const transition of transitions) {
      model = source(model, transition.inputs, transition.now);
      expect(model.visualState).toMatchObject({
        phase: transition.phase,
        activity: transition.phase,
        startedAt: transition.now,
      });
    }
    const unchanged = source(model, { listening: true }, 500);
    expect(unchanged).toBe(model);
    expect(unchanged.visualState.startedAt).toBe(50);
  });

  it("projects an existing error while retaining current voice activity", () => {
    expect(
      resolveVisualState(
        { ...idle, speaking: true, error: "Voice playback unavailable." },
        42,
      ),
    ).toEqual({
      phase: "error-or-fallback",
      activity: "speaking",
      status: "Voice playback unavailable.",
      startedAt: 42,
    });
    let model = createAssistantVisualModel(
      { ...idle, listening: true, error: "Microphone unavailable." },
      100,
    );
    model = source(
      model,
      { processing: true, error: "Network unavailable." },
      200,
    );
    expect(model.visualState).toMatchObject({
      phase: "error-or-fallback",
      activity: "thinking",
      status: "Network unavailable.",
      startedAt: 100,
    });
    model = source(model, { processing: true }, 300);
    expect(model.visualState).toMatchObject({
      phase: "thinking",
      activity: "thinking",
      status: "Thinking.",
      startedAt: 300,
    });
  });

  it("expires an explicitly requested action to the latest underlying activity", () => {
    let model = createAssistantVisualModel({ ...idle, listening: true }, 0);
    model = assistantVisualReducer(model, { type: "request-action", now: 100 });
    const token = model.action!.token;
    expect(model.visualState).toMatchObject({
      phase: "action-requested",
      activity: "listening",
      status: ACTION_REQUEST_STATUS,
      startedAt: 100,
    });
    model = source(model, { processing: true }, 200);
    model = source(model, { speaking: true }, 300);
    expect(model.visualState).toMatchObject({
      phase: "action-requested",
      activity: "speaking",
      startedAt: 100,
    });
    model = assistantVisualReducer(model, {
      type: "expire-action",
      token,
      now: 100 + ACTION_VISUAL_DURATION_MS,
    });
    expect(model.visualState).toMatchObject({
      phase: "speaking",
      activity: "speaking",
      status: "Speaking.",
      startedAt: 1000,
    });
  });

  it("restores the latest error after an action and clears it from current inputs", () => {
    let model = createAssistantVisualModel(
      { ...idle, error: "Playback fallback." },
      0,
    );
    model = assistantVisualReducer(model, {
      type: "request-action",
      status: "TV command requested — awaiting confirmation.",
      now: 10,
    });
    const token = model.action!.token;
    model = source(
      model,
      { listening: true, error: "Microphone unavailable." },
      30,
    );
    expect(model.visualState.status).toBe(
      "TV command requested — awaiting confirmation.",
    );
    model = assistantVisualReducer(model, {
      type: "expire-action",
      token,
      now: 910,
    });
    expect(model.visualState).toMatchObject({
      phase: "error-or-fallback",
      activity: "listening",
      status: "Microphone unavailable.",
      startedAt: 910,
    });
    model = source(model, { listening: true }, 920);
    expect(model.visualState.phase).toBe("listening");
    expect(model.visualState.status).toBe("Listening.");
  });

  it("ignores stale expirations after rapid requests and explicit clears", () => {
    let model = createAssistantVisualModel(idle, 0);
    model = assistantVisualReducer(model, { type: "request-action", now: 10 });
    const firstToken = model.action!.token;
    model = assistantVisualReducer(model, {
      type: "request-action",
      status: "Music request dispatched — awaiting confirmation.",
      now: 20,
    });
    const secondToken = model.action!.token;
    expect(secondToken).not.toBe(firstToken);
    expect(model.visualState.startedAt).toBe(20);
    const stale = assistantVisualReducer(model, {
      type: "expire-action",
      token: firstToken,
      now: 910,
    });
    expect(stale).toBe(model);
    model = assistantVisualReducer(model, { type: "clear-action", now: 930 });
    expect(model.visualState).toMatchObject({ phase: "idle", startedAt: 930 });
    expect(
      assistantVisualReducer(model, {
        type: "expire-action",
        token: secondToken,
        now: 950,
      }),
    ).toBe(model);
    const clearAgain = assistantVisualReducer(model, {
      type: "clear-action",
      now: 1000,
    });
    expect(clearAgain.visualState.startedAt).toBe(930);
  });

  it("does not create an action phase from processing, error or source changes", () => {
    let model = createAssistantVisualModel(idle, 1);
    for (const inputs of [
      { processing: true },
      { speaking: true },
      { listening: true, error: "Fallback in use." },
      {},
    ]) {
      model = source(model, inputs, 10);
      expect(model.action).toBeNull();
      expect(model.visualState.phase).not.toBe("action-requested");
    }
  });
});

describe("deterministic visual frame sampling", () => {
  it("keeps idle sparse, listening tight and inward, and thinking rings distinct", () => {
    const idleFrame = sampleVisualFrame(state("idle"), 0.3, voice, false);
    const listening = sampleVisualFrame(state("listening"), 0.3, silent, false);
    const thinking = sampleVisualFrame(state("thinking"), 0.3, voice, false);
    expect(idleFrame.ringSpeeds[0]).toBe(0.16);
    expect(idleFrame.particleDrift).toBeLessThan(0.04);
    expect(idleFrame.nodeOpacity).toBeLessThan(listening.nodeOpacity);
    expect(idleFrame.linkOpacity).toBeLessThan(listening.linkOpacity);
    expect(listening.ringSpeeds[0]).toBe(0.1);
    expect(listening.ringScale).toBeLessThan(idleFrame.ringScale);
    expect(listening.particleDrift).toBeLessThan(0);
    expect(thinking.ringSpeeds).toEqual([0.6, -0.9, 0.4]);
    expect(thinking.waveProgress).toBe(0);
    expect(thinking.waveOpacity).toBe(0);
    expect(thinking.actionPulse).toBe(0);
    expect(
      sampleVisualFrame(state("thinking"), 0.7, silent, false).nodeOpacity,
    ).not.toBe(thinking.nodeOpacity);
  });

  it("treats available silent audio as silence, never a fallback timed pulse", () => {
    const speaking = state("speaking");
    const early = sampleVisualFrame(speaking, 0.1, silent, false);
    const late = sampleVisualFrame(speaking, 0.7, silent, false);
    expect(late).toEqual(early);
    expect(early.coreScale).toBe(1);
    expect(early.ringScale).toBe(1);
    expect(early.waveOpacity).toBe(0);
    const audible = sampleVisualFrame(speaking, 0.1, voice, false);
    expect(audible.coreScale).toBeGreaterThan(early.coreScale);
    expect(audible.ringScale).toBeGreaterThan(early.ringScale);
    expect(audible.waveOpacity).toBeGreaterThan(early.waveOpacity);
    expect(audible.waveOpacity).toBeLessThan(0.1);
  });

  it("uses real bass independently of level for speaking scale", () => {
    const baseline = sampleVisualFrame(state("speaking"), 0.2, silent, false);
    const bass = sampleVisualFrame(
      state("speaking"),
      0.2,
      { ...silent, bass: 0.8 },
      false,
    );
    expect(bass.ringScale).toBeGreaterThan(baseline.ringScale);
    expect(bass.coreScale).toBeGreaterThan(baseline.coreScale);
  });

  it("uses repeatable unavailable-audio motion only while actually speaking", () => {
    const speaking = state("speaking");
    const early = sampleVisualFrame(speaking, 0.1, unavailable, false);
    const late = sampleVisualFrame(speaking, 0.7, unavailable, false);
    expect(early).toEqual(sampleVisualFrame(speaking, 0.1, unavailable, false));
    expect(late.coreScale).not.toBe(early.coreScale);
    expect(early.coreScale).toBeGreaterThan(1);
    for (const phase of ["idle", "listening", "error-or-fallback"] as const) {
      expect(sampleVisualFrame(state(phase), 0.1, unavailable, false)).toEqual(
        sampleVisualFrame(state(phase), 0.7, unavailable, false),
      );
    }
    const staleSpeaking = { ...speaking, activity: "idle" as const };
    expect(sampleVisualFrame(staleSpeaking, 0.1, unavailable, false)).toEqual(
      sampleVisualFrame(staleSpeaking, 0.7, unavailable, false),
    );
  });

  it("keeps muted fallback speech responsive and stops its pulse with speech", () => {
    const fallbackSpeech = {
      ...state("error-or-fallback"),
      activity: "speaking" as const,
    };
    const early = sampleVisualFrame(fallbackSpeech, 0.1, unavailable, false);
    const late = sampleVisualFrame(fallbackSpeech, 0.7, unavailable, false);
    expect(late.coreScale).not.toBe(early.coreScale);
    expect(late.particleScale).not.toBe(early.particleScale);
    expect(early.waveOpacity).toBeGreaterThan(0);
    expect(early.waveOpacity).toBeLessThan(0.02);
    expect(early.coreColor).toBe("#a99b86");
    expect(early.ringSpeeds).toEqual([0.07, -0.04, 0.03]);
    expect(early.actionPulse).toBe(0);

    const availableSilence = sampleVisualFrame(
      fallbackSpeech,
      0.1,
      silent,
      false,
    );
    expect(availableSilence).toEqual(
      sampleVisualFrame(fallbackSpeech, 0.7, silent, false),
    );
    expect(availableSilence.waveOpacity).toBe(0);
    expect(availableSilence.coreScale).toBe(0.95);
    expect(
      sampleVisualFrame(fallbackSpeech, 0.1, voice, false).coreScale,
    ).toBeGreaterThan(availableSilence.coreScale);

    for (const activity of ["idle", "listening", "thinking"] as const) {
      const inactive = { ...fallbackSpeech, activity };
      const inactiveFrame = sampleVisualFrame(
        inactive,
        0.1,
        unavailable,
        false,
      );
      expect(inactiveFrame).toEqual(
        sampleVisualFrame(inactive, 0.7, unavailable, false),
      );
      expect(inactiveFrame.waveOpacity).toBe(0);
      expect(inactiveFrame.coreScale).toBe(0.95);
    }
  });

  it("shows exactly one amber action pulse and never repeats it", () => {
    const action = state("action-requested");
    expect(sampleVisualFrame(action, 0, silent, false).actionPulse).toBe(0);
    const peak = sampleVisualFrame(action, 0.45, silent, false);
    expect(peak.actionPulse).toBeCloseTo(1);
    expect(peak.coreColor).toBe("#ffbf69");
    for (const elapsed of [0.9, 1.8, 9, 90]) {
      expect(sampleVisualFrame(action, elapsed, voice, false).actionPulse).toBe(
        0,
      );
    }
    expect(
      sampleVisualFrame(
        { ...action, activity: "speaking" },
        0.45,
        unavailable,
        false,
      ),
    ).toEqual(peak);
  });

  it("freezes motion and flicker for every phase under reduced motion", () => {
    for (const phase of phases) {
      const early = sampleVisualFrame(state(phase), 0.1, silent, true);
      const later = sampleVisualFrame(state(phase), 0.45, voice, true);
      const unavailableLater = sampleVisualFrame(
        state(phase),
        0.7,
        unavailable,
        true,
      );
      expect(later).toEqual(early);
      expect(unavailableLater).toEqual(early);
      expect(early.ringSpeeds).toEqual([0, 0, 0]);
      expect(early.ringScale).toBe(1);
      expect(early.particleScale).toBe(1);
      expect(early.coreScale).toBe(1);
      expect(early.particleDrift).toBe(0);
      expect(early.waveOpacity).toBe(0);
      expect(early.waveProgress).toBe(0);
      expect(early.actionPulse).toBe(0);
    }
    expect(
      sampleVisualFrame(state("idle"), 0, silent, true).coreColor,
    ).not.toBe(
      sampleVisualFrame(state("action-requested"), 0, silent, true).coreColor,
    );
    const fallbackSpeech = {
      ...state("error-or-fallback"),
      activity: "speaking" as const,
    };
    expect(sampleVisualFrame(fallbackSpeech, 0.1, unavailable, true)).toEqual(
      sampleVisualFrame(fallbackSpeech, 0.7, voice, true),
    );
  });

  it("clamps all numeric output to finite bounded values", () => {
    const brokenBands = {
      bass: Number.POSITIVE_INFINITY,
      mid: Number.NaN,
      high: -100,
      level: 100,
      available: true,
    };
    for (const phase of phases) {
      for (const elapsed of [
        -100,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        1e308,
      ]) {
        for (const reducedMotion of [false, true]) {
          const frame = sampleVisualFrame(
            state(phase),
            elapsed,
            brokenBands,
            reducedMotion,
          );
          for (const value of Object.values(frame).flat()) {
            if (typeof value === "number")
              expect(Number.isFinite(value)).toBe(true);
          }
          for (const speed of frame.ringSpeeds)
            expect(Math.abs(speed)).toBeLessThanOrEqual(1.2);
          for (const scale of [
            frame.ringScale,
            frame.particleScale,
            frame.coreScale,
          ]) {
            expect(scale).toBeGreaterThanOrEqual(0.8);
            expect(scale).toBeLessThanOrEqual(1.25);
          }
          expect(Math.abs(frame.particleDrift)).toBeLessThanOrEqual(0.2);
          for (const opacity of [
            frame.nodeOpacity,
            frame.linkOpacity,
            frame.coreOpacity,
            frame.waveProgress,
            frame.waveOpacity,
            frame.actionPulse,
          ]) {
            expect(opacity).toBeGreaterThanOrEqual(0);
            expect(opacity).toBeLessThanOrEqual(1);
          }
          expect(frame.coreColor).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });
});
