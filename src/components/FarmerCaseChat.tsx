"use client";

import { useEffect, useRef, useState } from "react";
import { CaseEngineResponse } from "@/components/CaseEngineResponse";
import {
  CasePhotoAttach,
  filesToCaseImagePayload,
  type AttachedCaseImage,
} from "@/components/CasePhotoAttach";
import type { AgronomicCasePayload, CaseMode } from "@/lib/agronomy/case-schema";
import { formatCaseAsPlainText } from "@/lib/agronomy/formatCaseSummary";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  casePayload?: AgronomicCasePayload;
  model?: string;
  responseSeconds?: number;
  diagnosticCode?: string;
  questionsAsked?: number;
};

type CaseApiPayload = {
  case?: AgronomicCasePayload | null;
  responseId?: string | null;
  model?: string;
  diagnosticCode?: string;
  requestCompleted?: boolean;
  questionsAsked?: number;
  error?: string;
};

type FarmerCaseChatProps = {
  showModeToggle?: boolean;
  showDiagnostics?: boolean;
  showTestPrompts?: boolean;
  defaultCountry?: string;
  defaultDistrict?: string | null;
  title?: string;
  subtitle?: string;
};

const TEST_PROMPTS = [
  "Tomato whiteflies",
  "My pepper leaves have holes",
  "Cucumber plants suddenly wilting",
  "Tomatoes are stunted across the whole field",
];

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowMs() {
  return Date.now();
}

function secondsSince(startedMs: number) {
  return (nowMs() - startedMs) / 1000;
}

export function FarmerCaseChat({
  showModeToggle = true,
  showDiagnostics = false,
  showTestPrompts = true,
  defaultCountry = "Trinidad and Tobago",
  defaultDistrict = null,
  title = "Crop Quick Help",
  subtitle = "Preliminary Caribbean crop guidance after a few questions. Photo upload supported.",
}: FarmerCaseChatProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [mode, setMode] = useState<CaseMode>("quick_help");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(
    null,
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [attachedImages, setAttachedImages] = useState<AttachedCaseImage[]>([]);
  const [questionsAsked, setQuestionsAsked] = useState<number | null>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, error]);

  function clearQuickReplies() {
    setActiveQuestionId(null);
  }

  async function sendQuestion(question: string, modeOverride?: CaseMode) {
    const trimmed = question.trim();
    if ((!trimmed && attachedImages.length === 0) || loading) return;

    // Clear previous buttons immediately when an answer is selected / typed / new request begins.
    clearQuickReplies();

    const nextMode =
      /start full crop check/i.test(trimmed)
        ? "full_crop_check"
        : (modeOverride ?? mode);

    if (nextMode !== mode) {
      setMode(nextMode);
    }

    setLoading(true);
    setError(null);
    setDraft("");

    const userMessage: ChatMessage = {
      id: messageId(),
      role: "user",
      text:
        trimmed ||
        `(${attachedImages.length} photo${attachedImages.length === 1 ? "" : "s"} attached)`,
    };

    const historyForApi = [...messages, userMessage].map((item) => ({
      role: item.role,
      content: item.casePayload
        ? formatCaseAsPlainText(item.casePayload)
        : item.text,
    }));

    setMessages((prev) => [...prev, userMessage]);

    const started = nowMs();
    const imagesSnapshot = [...attachedImages];

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 55_000);
      const imagePayload = await filesToCaseImagePayload(imagesSnapshot);

      const response = await fetch("/api/ai/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed || "Please assess the uploaded crop photo(s).",
          messages: historyForApi.slice(0, -1),
          previousResponseId,
          mode: nextMode,
          profile: {
            country: defaultCountry,
            district: defaultDistrict,
          },
          images: imagePayload,
        }),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);

      const elapsed = secondsSince(started);
      const payload = (await response.json()) as CaseApiPayload;
      const casePayload = payload.case ?? null;
      const diagnosticCode =
        payload.diagnosticCode || "OPENAI_REQUEST_FAILED";
      const model = payload.model || "unknown";

      // Clear attached images after successful send attempt completes.
      for (const image of imagesSnapshot) {
        URL.revokeObjectURL(image.previewUrl);
      }
      setAttachedImages([]);

      if (casePayload?.mode) {
        setMode(casePayload.mode);
      }

      if (typeof payload.questionsAsked === "number") {
        setQuestionsAsked(payload.questionsAsked);
      }

      if (!response.ok || !casePayload) {
        clearQuickReplies();
        setError(payload.error || "Could not get a case response right now.");
        return;
      }

      if (payload.responseId) {
        setPreviousResponseId(payload.responseId);
      }

      // Bind buttons only to the new questionId from this server response.
      setActiveQuestionId(casePayload.questionId || null);

      setMessages((prev) => [
        ...prev,
        {
          id: messageId(),
          role: "assistant",
          text: casePayload.nextQuestion || casePayload.preliminaryAssessment,
          casePayload,
          model,
          responseSeconds: Number(elapsed.toFixed(2)),
          diagnosticCode,
          questionsAsked:
            typeof payload.questionsAsked === "number"
              ? payload.questionsAsked
              : undefined,
        },
      ]);
    } catch (err) {
      clearQuickReplies();
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setError(
        aborted
          ? "That is taking longer than expected. Please try again."
          : "Network problem — check your connection and try again.",
      );
    } finally {
      setLoading(false);
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

  function clearConversation() {
    clearQuickReplies();
    for (const image of attachedImages) {
      URL.revokeObjectURL(image.previewUrl);
    }
    setAttachedImages([]);
    setMessages([]);
    setError(null);
    setPreviousResponseId(null);
    setQuestionsAsked(null);
    setMode("quick_help");
    inputRef.current?.focus();
  }

  const latestAssistant = [...messages]
    .reverse()
    .find((item) => item.role === "assistant" && item.casePayload);

  return (
    <div className="field-pattern flex min-h-dvh flex-col">
      <header className="animate-rise shrink-0 border-b border-line/70 bg-surface/90 px-4 pb-3 pt-5 backdrop-blur">
        <p className="text-[0.68rem] font-semibold tracking-[0.2em] text-canopy uppercase">
          Farmers Value Mart Ltd
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{subtitle}</p>

        {showModeToggle ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                clearQuickReplies();
                setMode("quick_help");
              }}
              className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ${
                mode === "quick_help"
                  ? "bg-leaf text-white ring-leaf"
                  : "bg-surface text-canopy ring-line hover:bg-sky"
              }`}
            >
              Quick Help
            </button>
            <button
              type="button"
              onClick={() => {
                clearQuickReplies();
                setMode("full_crop_check");
              }}
              className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ${
                mode === "full_crop_check"
                  ? "bg-leaf text-white ring-leaf"
                  : "bg-surface text-canopy ring-line hover:bg-sky"
              }`}
            >
              Full Crop Check
            </button>
          </div>
        ) : null}
      </header>

      <div
        ref={scrollerRef}
        className="animate-rise-delay mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && !loading ? (
          <div className="rounded-2xl bg-surface/80 px-4 py-5 text-sm text-muted ring-1 ring-line">
            <p className="font-medium text-ink">
              Describe the problem in a short line.
            </p>
            <p className="mt-1">
              Quick Help asks at most three high-value questions, then gives
              preliminary guidance. Country defaults to {defaultCountry}.
            </p>
          </div>
        ) : null}

        {messages.map((message) => {
          const isUser = message.role === "user";
          const isLatestAssistant =
            !isUser && latestAssistant?.id === message.id;

          return (
            <div
              key={message.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[85%] ${
                  isUser
                    ? "rounded-br-md bg-canopy text-white"
                    : "rounded-bl-md bg-surface text-ink ring-1 ring-line"
                }`}
              >
                {isUser || !message.casePayload ? (
                  <p className="whitespace-pre-wrap">{message.text}</p>
                ) : (
                  <CaseEngineResponse
                    payload={message.casePayload}
                    model={showDiagnostics ? message.model : undefined}
                    responseSeconds={
                      showDiagnostics ? message.responseSeconds : undefined
                    }
                    diagnosticCode={
                      showDiagnostics ? message.diagnosticCode : undefined
                    }
                    questionsAsked={message.questionsAsked ?? questionsAsked}
                    activeQuestionId={
                      isLatestAssistant ? activeQuestionId : "__stale__"
                    }
                    forceShowSummary={message.casePayload.mode === "full_crop_check"}
                    quickRepliesDisabled={loading || !isLatestAssistant}
                    onQuickReply={
                      isLatestAssistant
                        ? (reply) => {
                            clearQuickReplies();
                            void sendQuestion(reply);
                          }
                        : undefined
                    }
                  />
                )}
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
                Quick triage…
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="animate-rise-late shrink-0 border-t border-line/70 bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          {showTestPrompts && messages.length === 0 && !loading ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Try a short prompt
              </p>
              <div className="flex flex-col gap-2">
                {TEST_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      clearQuickReplies();
                      void sendQuestion(prompt, "quick_help");
                    }}
                    className="min-h-11 rounded-xl bg-sky/70 px-3 py-2 text-left text-sm font-medium text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-60"
                  >
                    {prompt}
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

          <CasePhotoAttach
            images={attachedImages}
            onChange={setAttachedImages}
            disabled={loading}
            uploading={loading && attachedImages.length > 0}
          />

          <form className="flex items-end gap-2" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="farmer-case-input">
              Describe the crop problem
            </label>
            <textarea
              id="farmer-case-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              disabled={loading}
              placeholder={
                mode === "quick_help"
                  ? "e.g. Tomato whiteflies"
                  : "Continue the full crop check…"
              }
              className="min-h-24 flex-1 resize-none rounded-xl border border-line bg-field px-3 py-3 text-base leading-snug text-ink outline-none ring-canopy/30 placeholder:text-muted/80 focus:ring-2 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || (!draft.trim() && attachedImages.length === 0)}
              className="min-h-24 min-w-20 rounded-xl bg-leaf px-4 text-sm font-semibold text-white transition enabled:hover:bg-canopy disabled:opacity-50"
            >
              Send
            </button>
          </form>

          <button
            type="button"
            onClick={clearConversation}
            disabled={loading || (messages.length === 0 && !error)}
            className="min-h-11 w-full rounded-xl bg-surface text-sm font-semibold text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-50"
          >
            Clear conversation
          </button>
        </div>
      </div>
    </div>
  );
}
