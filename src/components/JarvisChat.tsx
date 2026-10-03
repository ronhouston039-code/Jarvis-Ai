import { isGreetingRequest } from "../jarvis/greeting";
import { JarvisSpeechPlayer, type VoiceSpeed } from "./jarvis-speech";
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
import { Link } from "react-router-dom";
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
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
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
    speaker.current = new JarvisSpeechPlayer(setSpeaking, setVoiceError);
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
    if (!pending || !voiceEnabled) return;
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
  }, [isLoading, error, records, inFlight, voiceEnabled]);
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
      speaker.current?.stop();
    };
    document.addEventListener("visibilitychange", end);
    return () => {
      end();
      speaker.current?.stop();
      document.removeEventListener("visibilitychange", end);
    };
  }, []);
  function dictate() {
    if (listening) {
      speech.current?.stop();
      return;
    }
    speaker.current?.stop();
    setSpeaking(false);
    const Constructor =
      (window as SpeechWindow).SpeechRecognition ??
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) {
      setVoiceError(
        "Voice dictation is unavailable in this browser. Use the microphone on your iPhone keyboard.",
      );
      return;
    }
    const recognition = new Constructor();
    speech.current = recognition;
    recognition.lang = navigator.language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      if (isGreetingRequest(transcript)) {
        recognition.stop();
        void playGreeting();
      } else setDraft(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (e) => {
      setListening(false);
      setVoiceError(
        e.error === "not-allowed"
          ? "Allow microphone access in Safari settings to use voice."
          : "Voice input stopped. Please try again or type your message.",
      );
    };
    setVoiceError("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      setVoiceError("Could not start your microphone. Please try again.");
    }
  }
  function submit() {
    if (!draft.trim() || isLoading) return;
    if (isGreetingRequest(draft)) {
      speech.current?.stop();
      setDraft("");
      void playGreeting();
      return;
    }
    speech.current?.stop();
    setShowChat(true);
    pendingSpeech.current = voiceEnabled
      ? {
          previousIds: new Set(messages.map((message) => message.id)),
          started: false,
        }
      : null;
    void send(draft.trim());
    setDraft("");
  }
  return (
    <JarvisHud
      speaking={speaking}
      listening={listening}
      busy={isLoading}
      onVoice={dictate}
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
