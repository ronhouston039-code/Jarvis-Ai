/** Local visualization only. Mic analysis never connects to the speakers or uploads audio. */
export class FocusAudioMeter {
  private context?: AudioContext;
  private microphone?: MediaStream;
  private micSource?: MediaStreamAudioSourceNode;
  private micAnalyser?: AnalyserNode;
  private speechSource?: MediaElementAudioSourceNode;
  private speechAnalyser?: AnalyserNode;
  private speechElement?: HTMLAudioElement;
  private sources = new WeakMap<
    HTMLAudioElement,
    MediaElementAudioSourceNode
  >();
  private samples = new Uint8Array(128);
  private generation = 0;
  async enable(): Promise<void> {
    if (!this.context || this.context.state === "closed") {
      const Constructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Constructor) throw new Error("audio_analysis_unavailable");
      this.context = new Constructor();
      this.sources = new WeakMap();
    }
    if (this.context.state !== "running") await this.context.resume();
  }
  async startMicrophone(): Promise<boolean> {
    this.stopMicrophone();
    const generation = this.generation;
    await this.enable();
    if (generation !== this.generation) return false;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (
      generation !== this.generation ||
      !this.context ||
      this.context.state === "closed"
    ) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    this.microphone = stream;
    this.micAnalyser = this.context.createAnalyser();
    this.micAnalyser.fftSize = 256;
    this.micAnalyser.smoothingTimeConstant = 0.65;
    this.micSource = this.context.createMediaStreamSource(stream);
    this.micSource.connect(this.micAnalyser); // No destination connection: prevents microphone feedback.
    return true;
  }
  stopMicrophone() {
    this.generation++;
    this.micSource?.disconnect();
    this.micAnalyser?.disconnect();
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = undefined;
    this.micSource = undefined;
    this.micAnalyser = undefined;
  }
  attachSpeech(audio: HTMLAudioElement | null) {
    if (audio === this.speechElement) return;
    this.speechSource?.disconnect();
    this.speechAnalyser?.disconnect();
    this.speechSource = undefined;
    this.speechAnalyser = undefined;
    this.speechElement = undefined;
    if (!audio || !this.context || this.context.state !== "running") return;
    try {
      const source =
        this.sources.get(audio) ?? this.context.createMediaElementSource(audio);
      this.sources.set(audio, source);
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      analyser.connect(this.context.destination);
      this.speechSource = source;
      this.speechAnalyser = analyser;
      this.speechElement = audio;
    } catch {
      /* Leave playback available when the browser cannot attach an analyser. */
    }
  }
  level(kind: "listening" | "speaking" | "idle" | "thinking"): number {
    const analyser =
      kind === "listening"
        ? this.micAnalyser
        : kind === "speaking"
          ? this.speechAnalyser
          : undefined;
    if (!analyser || this.context?.state !== "running") return 0;
    analyser.getByteFrequencyData(this.samples);
    let energy = 0;
    for (const value of this.samples) energy += (value / 255) ** 2;
    return Math.min(1, Math.sqrt(energy / this.samples.length) * 2.6);
  }
  close() {
    this.stopMicrophone();
    this.attachSpeech(null);
    const context = this.context;
    this.context = undefined;
    this.sources = new WeakMap();
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }
}
