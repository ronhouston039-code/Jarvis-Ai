import { JarvisFocus } from "./JarvisFocus";
import { FocusAudioMeter } from "./focus-audio";
import { isGreetingRequest } from "../jarvis/greeting";
import {
  JarvisSpeechPlayer,
  spokenVersion,
  type VoiceSpeed,
} from "./jarvis-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, listDeepSpaceAgentModels } from "deepspace";
import {
  ArrowUp,
  Mic,
  Square,
  Volume2,
  Plus,
  MessageSquare,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button, Textarea } from "./ui";
import { useStreamingChat } from "./ChatPanel.stream";
import { authenticatedFetch } from "../jarvis/client";
import { JarvisHud } from "./JarvisHud";

type Message = {
  chatId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal?: boolean }
        >;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type SpeechWindow = Window & {
  webkitSpeechRecognition?: new () => Recognition;
  SpeechRecognition?: new () => Recognition;
};
const models = listDeepSpaceAgentModels("application");
const model = (models.find((m) => m.id === "gpt-6-luna") ?? models[0])?.id;
export function JarvisChat({ userId }: { userId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusMode = searchParams.get("mode") === "focus";
  const focusRef = useRef(focusMode);
  const meter = useRef<FocusAudioMeter | null>(null);
  if (!meter.current) meter.current = new FocusAudioMeter();
  const [transcript, setTranscript] = useState("");
  const [spokenCaption, setSpokenCaption] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [capabilities, setCapabilities] = useState<{
    llmMode: "groq" | "deepspace";
    fishVoice: boolean;
    serverTranscription: boolean;
  } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try {
      return sessionStorage.getItem(`jarvis-voice-feedback:${userId}`) === "on";
    } catch {
      return false;
    }
  });
  const speaker = useRef<JarvisSpeechPlayer | null>(null);
  if (!speaker.current)
    speaker.current = new JarvisSpeechPlayer(
      setSpeaking,
      setVoiceError,
      (audio) => {
        if (focusRef.current) meter.current?.attachSpeech(audio);
      },
    );
  const pendingSpeech = useRef<{
    previousIds: Set<string>;
    started: boolean;
  } | null>(null);
  const speech = useRef<Recognition | null>(null);
  useEffect(() => {
    let active = true;
    void authenticatedFetch("/api/jarvis/capabilities")
      .then(async (response) => {
        if (response.ok && active) {
          const data = (await response.json()) as NonNullable<
            typeof capabilities
          >;
          setCapabilities(data);
          try {
            if (
              data.fishVoice &&
              sessionStorage.getItem(`jarvis-voice-feedback:${userId}`) === null
            ) {
              sessionStorage.setItem(`jarvis-voice-feedback:${userId}`, "on");
              setVoiceEnabled(true);
            }
          } catch {
            /* Explicit voice activation remains available. */
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);
  const playGreeting = useCallback(async () => {
    pendingSpeech.current = null;
    let speed: VoiceSpeed = "normal";
    try {
      sessionStorage.setItem(`jarvis-greeted:${userId}`, "yes");
      const saved = sessionStorage.getItem(`jarvis-voice-speed:${userId}`);
      if (saved === "slow" || saved === "fast") speed = saved;
    } catch {
      /* Playback still works without storage. */
    }
    setSpokenCaption("Playing your saved greeting.");
    await speaker.current?.greet(speed);
  }, [userId]);
  useEffect(() => {
    if (!voiceEnabled || !capabilities?.fishVoice) return;
    try {
      if (sessionStorage.getItem(`jarvis-greeted:${userId}`)) return;
    } catch {
      return;
    }
    const begin = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-greeting-skip], input, textarea")
      )
        return;
      window.removeEventListener("pointerdown", begin);
      window.removeEventListener("keydown", begin);
      void playGreeting();
    };
    window.addEventListener("pointerdown", begin);
    window.addEventListener("keydown", begin);
    return () => {
      window.removeEventListener("pointerdown", begin);
      window.removeEventListener("keydown", begin);
    };
  }, [voiceEnabled, capabilities?.fishVoice, userId, playGreeting]);
  function speak(text: string) {
    setSpokenCaption(spokenVersion(text));
    let speed: VoiceSpeed = "normal";
    try {
      const saved = sessionStorage.getItem(`jarvis-voice-speed:${userId}`);
      if (saved === "slow" || saved === "fast") speed = saved;
    } catch {
      /* Default speed is available without session storage. */
    }
    void speaker.current?.speak(text, speed);
  }
  const bottom = useRef<HTMLDivElement>(null);
  const where = useMemo(
    () => ({ chatId: chatId ?? "__none__", userId }),
    [chatId, userId],
  );
  const { records } = useQuery<Message>("ai-messages", {
    where,
    orderBy: "createdAt",
    orderDir: "asc",
  });
  const { records: chats } = useQuery<{ title: string; userId: string }>(
    "ai-chats",
    { where: { userId }, orderBy: "createdAt", orderDir: "desc" },
  );
  const { records: reminders } = useQuery<{
    title: string;
    dueAt: string;
    status: string;
  }>("reminders", {
    where: { userId, status: "scheduled" },
    orderBy: "dueAt",
    orderDir: "asc",
    limit: 3,
  });
  const { send, stop, isLoading, error, inFlight } = useStreamingChat({
    chatId,
    modelId: model,
    onChatCreated: setChatId,
  });
  const ids = new Set(records.map((r) => r.recordId));
  const messages = [
    ...records.map((r) => ({ id: r.recordId, ...r.data })),
    ...inFlight.filter(
      (r) =>
        r.forChatId === chatId &&
        !ids.has(r.id) &&
        (!r.serverId || !ids.has(r.serverId)),
    ),
  ];
  useEffect(() => {
    const pending = pendingSpeech.current;
    if (!pending || !(voiceEnabled || focusMode)) return;
    try {
      if (sessionStorage.getItem(`jarvis-voice-feedback:${userId}`) === "off") {
        pendingSpeech.current = null;
        return;
      }
    } catch {
      /* Device speech remains available without session storage. */
    }
    if (isLoading) {
      pending.started = true;
      return;
    }
    if (!pending.started) return;
    if (error) {
      pendingSpeech.current = null;
      return;
    }
    const reply = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          message.content &&
          !pending.previousIds.has(message.id),
      );
    if (reply) {
      pendingSpeech.current = null;
      speak(reply.content);
    }
  }, [isLoading, error, records, inFlight, voiceEnabled, focusMode]);
  function toggleVoice() {
    if (voiceEnabled) {
      pendingSpeech.current = null;
      speaker.current?.stop();
      setSpeaking(false);
      try {
        sessionStorage.setItem(`jarvis-voice-feedback:${userId}`, "off");
      } catch {
        /* Voice still stops without session storage. */
      }
      setVoiceEnabled(false);
    } else {
      try {
        sessionStorage.setItem(`jarvis-voice-feedback:${userId}`, "on");
      } catch {
        /* Playback still works without session storage. */
      }
      setVoiceEnabled(true);
      if (capabilities?.fishVoice) void playGreeting();
      else speak("Voice enabled. I’m ready.");
    }
  }
  function stopResponse() {
    pendingSpeech.current = null;
    speaker.current?.stop();
    setSpeaking(false);
    stop();
  }
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [records, inFlight]);
  useEffect(() => {
    const end = () => {
      speech.current?.stop();
      meter.current?.stopMicrophone();
      setListening(false);
      speaker.current?.stop();
    };
    document.addEventListener("visibilitychange", end);
    return () => {
      end();
      speaker.current?.stop();
      meter.current?.close();
      document.removeEventListener("visibilitychange", end);
    };
  }, []);
  async function dictate() {
    if (listening) {
      speech.current?.stop();
      meter.current?.stopMicrophone();
      setListening(false);
      return;
    }
    pendingSpeech.current = null;
    if (isLoading) stop();
    speaker.current?.stop();
    setSpeaking(false);
    const Constructor =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) {
      setVoiceError(
        "Voice dictation is unavailable in this browser. Use the keyboard instead.",
      );
      return;
    }
    const recognition = new Constructor();
    speech.current = recognition;
    recognition.lang = navigator.language;
    recognition.continuous = false;
    recognition.interimResults = focusRef.current;
    recognition.onresult = (event) => {
      if (speech.current !== recognition) return;
      const results = Array.from(event.results);
      const text = results.map((result) => result[0].transcript).join(" ");
      const final = results.every((result) => result.isFinal !== false);
      setTranscript(text);
      if (!final) return;
      if (isGreetingRequest(text)) {
        recognition.stop();
        meter.current?.stopMicrophone();
        void playGreeting();
      } else if (focusRef.current) {
        recognition.stop();
        meter.current?.stopMicrophone();
        sendLatest.current(text);
      } else setDraft(text);
    };
    recognition.onend = () => {
      if (speech.current !== recognition) return;
      setListening(false);
      meter.current?.stopMicrophone();
    };
    recognition.onerror = (event) => {
      if (speech.current !== recognition) return;
      setListening(false);
      meter.current?.stopMicrophone();
      setVoiceError(
        event.error === "not-allowed"
          ? "Microphone permission was denied. Enable it in browser settings or use the keyboard."
          : "Voice input stopped. Please try again or type your message.",
      );
    };
    setVoiceError("");
    setTranscript("");
    // Flag permission setup immediately so a second tap can cancel it.
    setListening(true);
    try {
      if (focusRef.current && !(await meter.current?.startMicrophone())) {
        setListening(false);
        return;
      }
      if (speech.current !== recognition || (focusMode && !focusRef.current)) {
        meter.current?.stopMicrophone();
        setListening(false);
        return;
      }
      recognition.start();
    } catch {
      meter.current?.stopMicrophone();
      setListening(false);
      setVoiceError(
        "Could not start your microphone. Check permission and try again, or use the keyboard.",
      );
    }
  }
  function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;
    speech.current?.stop();
    meter.current?.stopMicrophone();
    speaker.current?.stop();
    setListening(false);
    if (isGreetingRequest(text)) {
      setDraft("");
      void playGreeting();
      return;
    }
    setTranscript(text.trim());
    setShowChat(true);
    pendingSpeech.current =
      voiceEnabled || focusRef.current
        ? {
            previousIds: new Set(messages.map((message) => message.id)),
            started: false,
          }
        : null;
    void send(text.trim());
    setDraft("");
  }
  const sendLatest = useRef(sendMessage);
  useEffect(() => {
    sendLatest.current = sendMessage;
  });
  function submit() {
    sendMessage(draft);
  }
  const enableFocusAudio = useCallback(async () => {
    try {
      await meter.current?.enable();
      if (focusRef.current)
        meter.current?.attachSpeech(speaker.current?.currentAudio() ?? null);
    } catch {
      setVoiceError(
        "Audio visualization is unavailable in this browser. Voice and keyboard controls remain available.",
      );
    }
  }, []);
  const exitFocus = useCallback(() => {
    focusRef.current = false;
    pendingSpeech.current = null;
    speech.current?.stop();
    speaker.current?.stop();
    meter.current?.close();
    setListening(false);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("mode");
      return next;
    });
  }, [setSearchParams]);
  function enterFocus() {
    focusRef.current = true;
    speech.current?.stop();
    setListening(false);
    setVoiceEnabled(true);
    try {
      sessionStorage.setItem(`jarvis-voice-feedback:${userId}`, "on");
    } catch {
      /* Session still works without storage. */
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("mode", "focus");
      return next;
    });
    void enableFocusAudio();
  }
  useEffect(() => {
    focusRef.current = focusMode;
    if (!focusMode) {
      meter.current?.stopMicrophone();
      return;
    }
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = oldOverflow;
      speech.current?.stop();
      speech.current = null;
      speaker.current?.stop();
      pendingSpeech.current = null;
      meter.current?.close();
      setListening(false);
    };
  }, [focusMode]);
  if (focusMode) {
    const state = speaking
      ? "speaking"
      : listening
        ? "listening"
        : isLoading
          ? "thinking"
          : "idle";
    const lastReply = [...messages]
      .reverse()
      .find((message) => message.role === "assistant")?.content;
    return (
      <JarvisFocus
        state={state}
        meter={meter.current}
        caption={
          speaking
            ? spokenCaption
            : listening
              ? transcript
              : isLoading
                ? lastReply || "Working on your request…"
                : lastReply || transcript
        }
        draft={draft}
        error={
          voiceError ||
          (error ? "Could not complete your request. Please try again." : "")
        }
        onDraft={setDraft}
        onSend={submit}
        onMic={() => void dictate()}
        onExit={exitFocus}
        onStop={stopResponse}
        onKeyboard={() => {
          speech.current?.stop();
          meter.current?.stopMicrophone();
          setListening(false);
          void enableFocusAudio();
        }}
      />
    );
  }
  return (
    <JarvisHud
      speaking={speaking}
      listening={listening}
      busy={isLoading}
      onVoice={() => void dictate()}
      onFocus={enterFocus}
      provider={capabilities?.llmMode === "groq" ? "GROQ" : "DEEPSPACE"}
      showChat={showChat}
      onHome={() => setShowChat(false)}
      onChat={() => setShowChat(true)}
      onPrompt={(prompt) => {
        setDraft(prompt);
      }}
      history={
        <div className="conversation-rail">
          <div className="rail-title">YOUR SPACE</div>
          <Button
            variant="outline"
            onClick={() => {
              stopResponse();
              setChatId(null);
              setShowChat(false);
            }}
          >
            <Plus size={16} /> New conversation
          </Button>
          <p className="rail-label">RECENT CONVERSATIONS</p>
          {chats.map((c) => (
            <button
              key={c.recordId}
              onClick={() => {
                stopResponse();
                setChatId(c.recordId);
                setShowChat(true);
              }}
              className={`history-item ${chatId === c.recordId ? "selected" : ""}`}
            >
              <MessageSquare size={15} />
              <span>{c.data.title || "Conversation"}</span>
            </button>
          ))}
          {!chats.length && (
            <p className="muted text-sm">
              Your conversations will appear here.
            </p>
          )}
          <div className="rail-note">
            <span className="status-dot" /> Private to your account
            <br />
            <small>Built to listen. Ready to help.</small>
          </div>
        </div>
      }
      upcoming={
        <>
          {reminders.length ? (
            reminders.map((r) => (
              <div className="hud-reminder" key={r.recordId}>
                <span>{r.data.title}</span>
                <small>
                  {new Date(r.data.dueAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
            ))
          ) : (
            <p className="hud-empty">
              No scheduled reminders.
              <br />
              <Link to="/personal">Add your first reminder →</Link>
            </p>
          )}
        </>
      }
      conversation={
        <div className="message-list" aria-live="polite">
          {messages.map((m) => (
            <article key={m.id} className={`message ${m.role}`}>
              <div className="message-label">
                {m.role === "user" ? "YOU" : "JARVIS"}
              </div>
              <div className="message-content">
                <ReactMarkdown>
                  {m.content || "Working on your request…"}
                </ReactMarkdown>
              </div>
              {m.role === "assistant" && m.content && (
                <button
                  className="read-aloud"
                  aria-label="Read response aloud"
                  disabled={speaking}
                  onClick={() => void speak(m.content)}
                >
                  <Volume2 size={15} /> Listen
                </button>
              )}
            </article>
          ))}
          {!messages.length && (
            <div className="hud-chat-empty">
              <MessageSquare size={28} />
              <h2>Conversation channel open.</h2>
              <p>Send a message below to begin.</p>
            </div>
          )}
          <div ref={bottom} />
        </div>
      }
      composer={
        <div className="composer-area">
          {(error || voiceError) && (
            <p role="alert" className="chat-error">
              {error instanceof Error
                ? "JARVIS could not complete that response. Please try again."
                : error || voiceError}
            </p>
          )}
          <div className="composer">
            <Textarea
              aria-label="Message JARVIS"
              placeholder={
                listening
                  ? "Listening…"
                  : "Tap the mic or type to talk to JARVIS…"
              }
              value={draft}
              maxLength={16000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="composer-actions">
              <button
                data-greeting-skip
                className={`mic-button ${listening ? "recording" : ""}`}
                aria-label={listening ? "Stop listening" : "Start voice input"}
                onClick={dictate}
              >
                <Mic size={21} />
              </button>
              {isLoading ? (
                <button
                  className="send-button"
                  aria-label="Stop response"
                  onClick={stopResponse}
                >
                  <Square size={17} />
                </button>
              ) : (
                <button
                  className="send-button"
                  aria-label="Send message"
                  disabled={!draft.trim()}
                  onClick={submit}
                >
                  <ArrowUp size={21} />
                </button>
              )}
            </div>
          </div>
          <div className="connection-actions">
            <button
              className="read-aloud"
              data-greeting-skip
              aria-pressed={voiceEnabled}
              onClick={toggleVoice}
            >
              <Volume2 size={16} />{" "}
              {voiceEnabled ? "Voice on · turn off" : "Voice off · turn on"}
            </button>
            {speaking && <p role="status">Jarvis is speaking…</p>}
            {speaking && (
              <button
                className="read-aloud"
                onClick={() => {
                  speaker.current?.stop();
                  setSpeaking(false);
                }}
              >
                Stop speaking
              </button>
            )}
          </div>
          <p className="muted text-sm">
            {voiceEnabled
              ? "New replies will be spoken. Keep JARVIS open and your media volume up."
              : "Turn voice on to hear replies automatically, or tap Listen beneath a reply."}
          </p>

          <p className="composer-footnote">
            {listening
              ? "Listening once. Your transcript appears here before you send."
              : "Tap the mic to talk · Shift + Enter for a new line"}
            <span>Powered by DeepSpace</span>
          </p>
        </div>
      }
    />
  );
}
