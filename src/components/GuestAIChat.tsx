"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AppShell } from "@/components/AppShell";

type ChatRole = "assistant" | "farmer";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

const WELCOME_TEXT =
  "Hello — I’m the FVMLTD Farmer Assistant. Ask about your crops, leaves, pests, or watering. No signup needed.";

const SUGGESTED_QUESTIONS = [
  "Why are my tomato leaves turning yellow?",
  "What is damaging my pepper leaves?",
  "How often should I water cucumber?",
];

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type GuestAIChatProps = {
  /** When true, show a light bottom link strip instead of full app chrome. */
  showProfileLink?: boolean;
};

export function GuestAIChat({ showProfileLink = true }: GuestAIChatProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: WELCOME_TEXT },
  ]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const loading = busy || isPending;

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, error]);

  async function sendQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed) {
      setError("Please type a farming question first.");
      return;
    }
    if (busy) return;

    setBusy(true);
    setError(null);
    setDraft("");

    const farmerMessage: ChatMessage = {
      id: messageId(),
      role: "farmer",
      text: trimmed,
    };

    const historyForApi = [...messages, farmerMessage]
      .filter((item) => item.id !== "welcome")
      .map((item) => ({
        role: (item.role === "farmer" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: item.text,
      }));

    startTransition(() => {
      setMessages((prev) => [...prev, farmerMessage]);
    });

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 55_000);

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          messages: historyForApi.slice(0, -1),
        }),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);

      const payload = (await response.json()) as {
        reply?: string;
        error?: string;
        code?: string;
        source?: string;
      };

      if (!response.ok || !payload.reply) {
        const fallback =
          payload.code === "OPENAI_KEY_MISSING" ||
          payload.code === "OPENAI_KEY_FORMAT_INVALID" ||
          payload.code === "missing_api_key"
            ? "The AI assistant is not available yet. Please try again later, or contact FVMLTD support."
            : payload.error ||
              "Could not get an answer right now. Please try again.";
        setError(fallback);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: messageId(),
          role: "assistant",
          text: payload.reply!,
        },
      ]);
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      setError(
        aborted
          ? "That is taking longer than expected. Please try again."
          : "Network problem — check your connection and try again.",
      );
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void sendQuestion(draft);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion(draft);
    }
  }

  const showSuggestions =
    messages.length <= 1 && !loading && !error;

  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col">
        <header className="animate-rise shrink-0 border-b border-line/70 bg-surface/90 px-4 pb-3 pt-4 backdrop-blur">
          <p className="text-[0.68rem] font-semibold tracking-[0.2em] text-canopy uppercase">
            Farmers Value Mart Ltd
          </p>
          <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-ink">
            FVMLTD Farmer Assistant
          </h1>
          <p className="mt-1 text-sm text-muted">
            Ask a crop question — no registration required.
          </p>
        </header>

        <div
          ref={scrollerRef}
          className="animate-rise-delay flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.map((message) => {
            const isFarmer = message.role === "farmer";
            return (
              <div
                key={message.id}
                className={`flex ${isFarmer ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isFarmer
                      ? "rounded-br-md bg-canopy text-white"
                      : "rounded-bl-md bg-surface text-ink ring-1 ring-line"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </div>
              </div>
            );
          })}

          {loading ? (
            <div className="flex justify-start" aria-busy="true">
              <div className="rounded-2xl rounded-bl-md bg-surface px-3.5 py-3 text-sm text-muted ring-1 ring-line">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 animate-pulse-soft rounded-full bg-leaf"
                    aria-hidden
                  />
                  Thinking about your crop…
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="animate-rise-late shrink-0 space-y-3 border-t border-line/70 bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          {showSuggestions ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Try asking
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    disabled={loading}
                    onClick={() => void sendQuestion(question)}
                    className="min-h-11 rounded-xl bg-sky/70 px-3 py-2 text-left text-sm font-medium text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-60"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-xs font-medium text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <form className="flex items-end gap-2" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="guest-chat-input">
              Ask a farming question
            </label>
            <textarea
              id="guest-chat-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={loading}
              placeholder="Ask about your crop…"
              className="min-h-14 flex-1 resize-none rounded-xl border border-line bg-field px-3 py-3 text-base leading-snug text-ink outline-none ring-canopy/30 placeholder:text-muted/80 focus:ring-2 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !draft.trim()}
              className="min-h-14 min-w-16 rounded-xl bg-leaf px-4 text-sm font-semibold text-white transition enabled:hover:bg-canopy disabled:opacity-50"
            >
              Send
            </button>
          </form>

          <button
            type="button"
            disabled
            title="Photo analysis coming next"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface text-sm font-semibold text-muted ring-1 ring-line"
          >
            Upload photo — Coming next
          </button>

          {showProfileLink ? (
            <p className="pb-1 text-center text-xs text-muted">
              Optional:{" "}
              <Link
                href="/register"
                className="font-semibold text-canopy underline-offset-2 hover:underline"
              >
                Create a farmer profile
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
