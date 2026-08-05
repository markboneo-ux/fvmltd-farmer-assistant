"use client";

import { useEffect, useRef, useState } from "react";
import { CaseEngineResponse } from "@/components/CaseEngineResponse";
import type { AgronomicCasePayload, CaseMode } from "@/lib/agronomy/case-schema";
import { formatCaseAsPlainText } from "@/lib/agronomy/formatCaseSummary";

type HealthStatus = "checking" | "ready" | "unavailable";

type ChatRole = "user" | "assistant";

type LabMessage = {
  id: string;
  role: ChatRole;
  text: string;
  casePayload?: AgronomicCasePayload;
  model?: string;
  responseSeconds?: number;
  diagnosticCode?: string;
};

type HealthPayload = {
  ok?: boolean;
  keyConfigured?: boolean;
  model?: string;
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

function statusLabel(status: HealthStatus) {
  if (status === "checking") return "Checking AI connection";
  if (status === "ready") return "AI ready";
  return "AI unavailable";
}

export default function AiLabPage() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking");
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [configuredModel, setConfiguredModel] = useState<string>("");
  const [healthError, setHealthError] = useState<string | null>(null);

  const [mode, setMode] = useState<CaseMode>("quick_help");
  const [messages, setMessages] = useState<LabMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(
    null,
  );
  const [lastMeta, setLastMeta] = useState<{
    model: string;
    responseSeconds: number;
    diagnosticCode: string;
    requestCompleted: boolean;
    httpStatus: number;
    responseId: string | null;
    stage: string | null;
    questionsAsked: number | null;
    mode: CaseMode | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      setHealthStatus("checking");
      setHealthError(null);

      try {
        const response = await fetch("/api/ai/health", { cache: "no-store" });
        const payload = (await response.json()) as HealthPayload;

        if (cancelled) return;

        if (!response.ok || !payload.ok) {
          setHealthStatus("unavailable");
          setKeyConfigured(false);
          setHealthError("Health endpoint did not return ok.");
          return;
        }

        setKeyConfigured(Boolean(payload.keyConfigured));
        setConfiguredModel(payload.model || "");
        setHealthStatus(payload.keyConfigured ? "ready" : "unavailable");
      } catch {
        if (cancelled) return;
        setHealthStatus("unavailable");
        setKeyConfigured(null);
        setHealthError("Could not reach /api/ai/health.");
      }
    }

    void checkHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, error]);

  async function sendQuestion(question: string, modeOverride?: CaseMode) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

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

    const userMessage: LabMessage = {
      id: messageId(),
      role: "user",
      text: trimmed,
    };

    const historyForApi = [...messages, userMessage].map((item) => ({
      role: item.role,
      content: item.casePayload
        ? formatCaseAsPlainText(item.casePayload)
        : item.text,
    }));

    setMessages((prev) => [...prev, userMessage]);

    const started = nowMs();

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 55_000);

      const response = await fetch("/api/ai/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          messages: historyForApi.slice(0, -1),
          previousResponseId,
          mode: nextMode,
        }),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);

      const elapsed = secondsSince(started);
      const payload = (await response.json()) as CaseApiPayload;
      const casePayload = payload.case ?? null;
      const diagnosticCode =
        payload.diagnosticCode || "OPENAI_REQUEST_FAILED";
      const model = payload.model || configuredModel || "unknown";

      if (casePayload?.mode) {
        setMode(casePayload.mode);
      }

      setLastMeta({
        model,
        responseSeconds: Number(elapsed.toFixed(2)),
        diagnosticCode,
        requestCompleted: Boolean(payload.requestCompleted),
        httpStatus: response.status,
        responseId: payload.responseId ?? null,
        stage: casePayload?.stage ?? null,
        questionsAsked:
          typeof payload.questionsAsked === "number"
            ? payload.questionsAsked
            : null,
        mode: casePayload?.mode ?? nextMode,
      });

      if (!response.ok || !casePayload) {
        setError(payload.error || "Could not get a case response right now.");
        if (
          diagnosticCode === "OPENAI_KEY_MISSING" ||
          diagnosticCode === "OPENAI_AUTH_FAILED"
        ) {
          setHealthStatus("unavailable");
        }
        return;
      }

      if (payload.responseId) {
        setPreviousResponseId(payload.responseId);
      }

      setHealthStatus("ready");
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
        },
      ]);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setError(
        aborted
          ? "That is taking longer than expected. Please try again."
          : "Network problem — check your connection and try again.",
      );
      setLastMeta({
        model: configuredModel || "unknown",
        responseSeconds: Number(secondsSince(started).toFixed(2)),
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        requestCompleted: false,
        httpStatus: 0,
        responseId: null,
        stage: null,
        questionsAsked: null,
        mode: nextMode,
      });
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
    setMessages([]);
    setError(null);
    setLastMeta(null);
    setPreviousResponseId(null);
    setMode("quick_help");
    inputRef.current?.focus();
  }

  const latestAssistant = [...messages]
    .reverse()
    .find((item) => item.role === "assistant" && item.casePayload);

  const statusTone =
    healthStatus === "ready"
      ? "bg-ok/15 text-ok ring-ok/30"
      : healthStatus === "checking"
        ? "bg-sun/20 text-warn ring-sun/40"
        : "bg-danger/10 text-danger ring-danger/30";

  return (
    <div className="field-pattern flex min-h-dvh flex-col">
      <header className="animate-rise shrink-0 border-b border-line/70 bg-surface/90 px-4 pb-3 pt-5 backdrop-blur">
        <p className="text-[0.68rem] font-semibold tracking-[0.2em] text-canopy uppercase">
          Farmers Value Mart Ltd
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            FVM AI Laboratory
          </h1>
          <div
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold ring-1 ${statusTone}`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                healthStatus === "ready"
                  ? "bg-ok"
                  : healthStatus === "checking"
                    ? "animate-pulse-soft bg-sun"
                    : "bg-danger"
              }`}
              aria-hidden
            />
            {statusLabel(healthStatus)}
          </div>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Rapid triage for Caribbean farmers — Quick Help by default (max three
          questions), Full Crop Check optional. Endpoint{" "}
          <code className="text-canopy">/api/ai/case</code>. No registration
          required.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("quick_help")}
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
            onClick={() => setMode("full_crop_check")}
            className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ${
              mode === "full_crop_check"
                ? "bg-leaf text-white ring-leaf"
                : "bg-surface text-canopy ring-line hover:bg-sky"
            }`}
          >
            Full Crop Check
          </button>
        </div>
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
              preliminary guidance. No long missing-information questionnaire.
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
                    model={message.model}
                    responseSeconds={message.responseSeconds}
                    diagnosticCode={message.diagnosticCode}
                    quickRepliesDisabled={loading || !isLatestAssistant}
                    onQuickReply={
                      isLatestAssistant
                        ? (reply) => void sendQuestion(reply)
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
          {messages.length === 0 && !loading ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Test prompts
              </p>
              <div className="flex flex-col gap-2">
                {TEST_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={loading}
                    onClick={() => void sendQuestion(prompt, "quick_help")}
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

          {lastMeta ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                Mode:{" "}
                <span className="font-semibold text-ink">
                  {lastMeta.mode ?? mode}
                </span>
              </span>
              {lastMeta.stage ? (
                <span>
                  Stage:{" "}
                  <span className="font-semibold text-ink">{lastMeta.stage}</span>
                </span>
              ) : null}
              {typeof lastMeta.questionsAsked === "number" ? (
                <span>
                  Questions:{" "}
                  <span className="font-semibold text-ink">
                    {lastMeta.questionsAsked}
                  </span>
                </span>
              ) : null}
              <span>
                {lastMeta.responseSeconds.toFixed(2)}s · {lastMeta.diagnosticCode}
              </span>
            </div>
          ) : null}

          <form className="flex items-end gap-2" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="ai-lab-input">
              Describe the crop problem
            </label>
            <textarea
              id="ai-lab-input"
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
              disabled={loading || !draft.trim()}
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

          <details className="rounded-xl bg-sky/40 px-3 py-2 text-sm ring-1 ring-line">
            <summary className="cursor-pointer font-semibold text-canopy">
              Technical diagnostics
            </summary>
            <dl className="mt-2 space-y-1.5 text-xs text-muted">
              <div className="flex justify-between gap-3">
                <dt>Health status</dt>
                <dd className="font-medium text-ink">
                  {statusLabel(healthStatus)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>OPENAI_API_KEY configured</dt>
                <dd className="font-medium text-ink">
                  {keyConfigured === null
                    ? "unknown"
                    : keyConfigured
                      ? "true"
                      : "false"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Active mode</dt>
                <dd className="font-medium text-ink">{mode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Case endpoint</dt>
                <dd className="font-medium text-ink">/api/ai/case</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>previous_response_id</dt>
                <dd className="max-w-[60%] truncate font-medium text-ink">
                  {previousResponseId || "—"}
                </dd>
              </div>
              {healthError ? (
                <div className="flex justify-between gap-3">
                  <dt>Health note</dt>
                  <dd className="font-medium text-danger">{healthError}</dd>
                </div>
              ) : null}
              <p className="pt-1 text-[0.7rem] leading-relaxed">
                internalMissingInformation is never shown in the farmer UI. No
                database or environment changes are required for this page.
              </p>
            </dl>
          </details>
        </div>
      </div>
    </div>
  );
}
