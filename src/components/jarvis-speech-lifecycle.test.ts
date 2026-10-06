import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { JarvisSpeechPlayer } from "./jarvis-speech";
const request = vi.hoisted(() => vi.fn());
vi.mock("../jarvis/client", () => ({ authenticatedFetch: request }));
class Utterance {
    lang = "";
    volume = 1;
    rate = 1;
    pitch = 1;
    voice: SpeechSynthesisVoice | null = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: {
        error: string;
    }) => void) | null = null;
    constructor(public text: string) { }
}
const players: JarvisSpeechPlayer[] = [];
beforeEach(() => { vi.useFakeTimers(); request.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => { }); });
afterEach(() => { players.splice(0).forEach(p => p.dispose()); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup() {
    const utterances: Utterance[] = [];
    const document = Object.assign(new EventTarget(), { hidden: false });
    const synthesis = Object.assign(new EventTarget(), {
        getVoices: () => [{ lang: "en-US" }],
        cancel: vi.fn(), resume: vi.fn(),
        speak: vi.fn((utterance: Utterance) => utterances.push(utterance)),
    });
    const window = Object.assign(new EventTarget(), { speechSynthesis: synthesis });
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", document);
    vi.stubGlobal("navigator", { userAgent: "iPhone Safari", platform: "iPhone", maxTouchPoints: 1, userActivation: { isActive: true } });
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    const state = vi.fn(), notice = vi.fn(), provider = vi.fn();
    const player = new JarvisSpeechPlayer(state, notice, undefined, undefined, () => { }, provider);
    players.push(player);
    player.primeFromGesture();
    return { player, state, notice, provider, document, window, utterances };
}
function pendingRequest() {
    let finish!: (response: Response) => void;
    request.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    return (response: Response) => finish(response);
}
const failure = () => Response.json({ provider: "fish_audio", category: "credits-required", providerStatus: 402 }, { status: 402 });
test.each(["stop", "visibilitychange", "pagehide"])("%s aborts in-flight audio without reporting an outage, later real errors remain visible", async (event) => {
    const f = setup();
    const finish = pendingRequest();
    const pending = f.player.speak("Old reply.");
    const signal = request.mock.calls[0][2] as AbortSignal;
    if (event === "stop")
        f.player.stop();
    else if (event === "pagehide")
        f.window.dispatchEvent(new Event(event));
    else {
        f.document.hidden = true;
        f.document.dispatchEvent(new Event(event));
    }
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(event === "stop" ? "stop" : "background");
    finish(failure());
    await pending;
    expect(f.provider).not.toHaveBeenCalledWith(expect.objectContaining({ category: "credits-required" }));
    expect(f.notice).not.toHaveBeenCalledWith(expect.stringContaining("Fish Audio unavailable"));
    expect(console.warn).not.toHaveBeenCalled();
    expect(f.state).not.toHaveBeenCalledWith(true);
    expect(f.utterances.filter(u => u.volume > 0)).toHaveLength(0);
    f.document.hidden = false;
    f.document.dispatchEvent(new Event("visibilitychange"));
    f.player.primeFromGesture();
    request.mockResolvedValueOnce(failure());
    await f.player.speak("New reply.");
    expect(f.provider).toHaveBeenLastCalledWith({ category: "credits-required", providerStatus: 402 });
    expect(f.notice).toHaveBeenLastCalledWith("Fish Audio unavailable — using device voice.");
    expect(f.state).not.toHaveBeenCalledWith(true);
    const audible = f.utterances.at(-1)!;
    audible.onstart?.();
    expect(f.state).toHaveBeenLastCalledWith(true);
    audible.onend?.();
    expect(f.state).toHaveBeenLastCalledWith(false);
});
test("replacement aborts the previous request and queues only the newest fallback", async () => {
    const f = setup();
    const finish = pendingRequest();
    const old = f.player.speak("Old reply.");
    const oldSignal = request.mock.calls[0][2] as AbortSignal;
    request.mockResolvedValueOnce(failure());
    await f.player.speak("New reply.");
    finish(failure());
    await old;
    expect(oldSignal.reason).toBe("replacement");
    expect(f.utterances.filter(u => u.volume > 0).map(u => u.text)).toEqual(["New reply."]);
    expect(f.provider.mock.calls.filter(([value]) => value)).toHaveLength(1);
    f.player.stop();
    expect(vi.getTimerCount()).toBe(0);
});
test("Test Device Voice starts in the tap path without requesting Fish Audio", () => {
    const f = setup();
    const phases = vi.fn();
    f.player.testDeviceVoice(phases);
    expect(request).not.toHaveBeenCalled();
    const audible = f.utterances.at(-1)!;
    expect(audible.text).toBe("Device voice is working.");
    expect(phases).not.toHaveBeenCalledWith("started");
    audible.onstart?.();
    expect(phases).toHaveBeenLastCalledWith("started");
    f.player.stop();
    audible.onend?.();
    expect(phases).not.toHaveBeenCalledWith("completed");
    expect(vi.getTimerCount()).toBe(0);
});

test("Stop/background prevent automatic health speech until a new turn is actually prepared", async () => {
    const f = setup();
    request.mockResolvedValueOnce(failure());
    await f.player.speak("Ready.");
    const utterance = f.utterances.at(-1)!;
    utterance.onstart?.(); utterance.onend?.();
    expect(f.player.canSpeakAutomatically()).toBe(true);
    f.player.stop();
    expect(f.player.canSpeakAutomatically()).toBe(false);
    f.player.primeFromGesture();
    expect(f.player.canSpeakAutomatically()).toBe(false);
    f.document.hidden = true;
    f.document.dispatchEvent(new Event("visibilitychange"));
    f.document.hidden = false;
    expect(f.player.canSpeakAutomatically()).toBe(false);
});
