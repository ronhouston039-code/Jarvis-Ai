import { useEffect, useMemo, useRef, useState } from "react";
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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [deviceFallback, setDeviceFallback] = useState<string | null>(null);
  const playback = useRef<HTMLAudioElement | null>(null);
  const speech = useRef<Recognition | null>(null);
  useEffect(() => {
    let active = true;
    void authenticatedFetch("/api/jarvis/capabilities")
      .then(async (response) => {
        if (response.ok && active) setCapabilities(await response.json());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  function deviceSpeak(text: string) {
    if (!window.speechSynthesis) {
      setVoiceError("Spoken replies are not available in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }
  async function speak(text: string) {
    window.speechSynthesis?.cancel();
    playback.current?.pause();
    setVoiceError("");
    setDeviceFallback(null);
    setAudioUrl(null);
    if (!capabilities?.fishVoice) {
      deviceSpeak(text);
      return;
    }
    setSpeaking(true);
    try {
      const response = await authenticatedFetch("/api/jarvis/voice/speak", {
        text: text.slice(0, 4000),
      });
      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        setVoiceError(
          error.error === "speech_credits_required"
            ? "Fish Audio needs API credits before it can generate speech."
            : error.error === "speech_access_denied"
              ? "Fish Audio denied access. Check your voice account and key."
              : "The voice service is unavailable. Please try again.",
        );
        setDeviceFallback(text);
        return;
      }
      setAudioUrl(URL.createObjectURL(await response.blob()));
    } catch {
      setVoiceError("Could not reach the voice service. Please try again.");
      setDeviceFallback(text);
    } finally {
      setSpeaking(false);
    }
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
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [records, inFlight]);
  useEffect(() => {
    const end = () => speech.current?.stop();
    document.addEventListener("visibilitychange", end);
    return () => {
      end();
      window.speechSynthesis?.cancel();
      document.removeEventListener("visibilitychange", end);
    };
  }, []);
  function dictate() {
    if (listening) {
      speech.current?.stop();
      return;
    }
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
    recognition.onresult = (e) =>
      setDraft(
        Array.from(e.results)
          .map((r) => r[0].transcript)
          .join(" "),
      );
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
    speech.current?.stop();
    setShowChat(true);
    void send(draft.trim());
    setDraft("");
  }
  return (
    <JarvisHud
      listening={listening}
      busy={isLoading}
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
              stop();
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
                stop();
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
                  onClick={stop}
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
          {audioUrl && (
            <audio
              ref={playback}
              controls
              autoPlay
              src={audioUrl}
              className="hud-audio"
              aria-label="JARVIS Fish Audio reply"
            />
          )}
          {deviceFallback && (
            <button
              className="read-aloud"
              onClick={() => deviceSpeak(deviceFallback)}
            >
              <Volume2 size={15} />
              Use iPhone / device voice
            </button>
          )}
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
