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
  /** A lease protects a new capture from an older asynchronous turn's cleanup. */
  microphoneRevision() {
    return this.generation;
  }
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
  stopMicrophone(expectedRevision?: number) {
    if (expectedRevision !== undefined && expectedRevision !== this.generation)
      return;
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
    let source: MediaElementAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    try {
      source =
        this.sources.get(audio) ?? this.context.createMediaElementSource(audio);
      this.sources.set(audio, source);
      analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      analyser.connect(this.context.destination);
      this.speechSource = source;
      this.speechAnalyser = analyser;
      this.speechElement = audio;
    } catch {
      // A captured media element no longer plays through its original output.
      // Bypass the failed analysis graph so speech remains audible.
      analyser?.disconnect();
      if (source) {
        source.disconnect();
        try {
          source.connect(this.context.destination);
          this.speechSource = source;
          this.speechElement = audio;
        } catch {
          /* A closed or unsupported audio context cannot restore this route. */
        }
      }
    }
  }
  bands(kind: "listening" | "speaking" | "idle" | "thinking") {
    const analyser =
      kind === "listening"
        ? this.micAnalyser
        : kind === "speaking"
          ? this.speechAnalyser
          : undefined;
    if (!analyser || this.context?.state !== "running")
      return { bass: 0, mid: 0, high: 0, level: 0, available: false };
    analyser.getByteFrequencyData(this.samples);
    const binHz = (this.context.sampleRate || 48000) / 256;
    const band = (low: number, high: number) => {
      const start = Math.max(1, Math.ceil(low / binHz));
      const end = Math.min(this.samples.length, Math.ceil(high / binHz));
      let sum = 0;
      for (let i = start; i < end; i++) sum += (this.samples[i] / 255) ** 2;
      return Math.min(1, Math.sqrt(sum / Math.max(1, end - start)) * 2.6);
    };
    let sum = 0;
    for (const sample of this.samples) sum += (sample / 255) ** 2;
    return {
      available: true,
      bass: band(20, 250),
      mid: band(250, 2000),
      high: band(2000, 9000),
      level: Math.min(1, Math.sqrt(sum / this.samples.length) * 2.6),
    };
  }
  level(kind: "listening" | "speaking" | "idle" | "thinking") {
    return this.bands(kind).level;
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
