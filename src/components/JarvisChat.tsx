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
import ReactMarkdown from "react-markdown";
import { Button, Textarea } from "./ui";
import { useStreamingChat } from "./ChatPanel.stream";
import { JarvisOrb } from "./JarvisOrb";

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
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const speech = useRef<Recognition | null>(null);
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
    void send(draft.trim());
    setDraft("");
  }
  return (
    <div className="jarvis-workspace">
      <aside className="conversation-rail">
        <div className="rail-title">YOUR SPACE</div>
        <Button
          variant="outline"
          onClick={() => {
            stop();
            setChatId(null);
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
            }}
            className={`history-item ${chatId === c.recordId ? "selected" : ""}`}
          >
            <MessageSquare size={15} />
            <span>{c.data.title || "Conversation"}</span>
          </button>
        ))}
        {!chats.length && (
          <p className="muted text-sm">Your conversations will appear here.</p>
        )}
        <div className="rail-note">
          <span className="status-dot" /> Private to your account
          <br />
          <small>Built to listen. Ready to help.</small>
        </div>
      </aside>
      <section className="chat-stage">
        <header className="stage-heading">
          <div>
            <p className="eyebrow">PERSONAL INTELLIGENCE</p>
            <h1>At your service.</h1>
          </div>
          <span className="status-pill">
            <span className="status-dot" />
            {isLoading ? "Responding" : "Ready"}
          </span>
        </header>
        {!messages.length ? (
          <div className="welcome">
            <JarvisOrb active={listening || isLoading} />
            <h2>What’s on your mind?</h2>
            <p>Talk it through. Make a plan. Remember what matters.</p>
            <div className="suggestions">
              {[
                "What can you help me with?",
                "Help me plan my day",
                "Remember that I prefer concise answers",
              ].map((p) => (
                <button key={p} onClick={() => setDraft(p)}>
                  {p}
                  <ArrowUp size={14} />
                </button>
              ))}
            </div>
          </div>
        ) : (
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
                    onClick={() => {
                      window.speechSynthesis.cancel();
                      const utterance = new SpeechSynthesisUtterance(m.content);
                      utterance.rate = 1;
                      window.speechSynthesis.speak(utterance);
                    }}
                  >
                    <Volume2 size={15} /> Listen
                  </button>
                )}
              </article>
            ))}
            <div ref={bottom} />
          </div>
        )}
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
              placeholder={listening ? "Listening…" : "Ask JARVIS anything…"}
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
          <p className="composer-footnote">
            {listening
              ? "Listening once. Your transcript appears here before you send."
              : "Tap the mic to talk · Shift + Enter for a new line"}
            <span>Powered by DeepSpace</span>
          </p>
        </div>
      </section>
    </div>
  );
}
