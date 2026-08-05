"use client";

import { useEffect, useRef, useState } from "react";
import { CaseEngineResponse } from "@/components/CaseEngineResponse";
import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
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
  error?: string;
};

const SUGGESTED_TURNS = [
  "My commercial tomato field is stunted in Trinidad.",
  "It affects almost the entire field.",
  "The lower leaves are yellow and new leaves are small.",
  "The soil stays wet for two days after irrigation.",
  "The plants are six weeks old.",
  "I incorporated well-composted manure before planting.",
];

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  async function sendQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

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

    const started = performance.now();

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
        }),
        signal: controller.signal,
      });

      window.clearTimeout(timeout);

      const elapsed = (performance.now() - started) / 1000;
      const payload = (await response.json()) as CaseApiPayload;
      const casePayload = payload.case ?? null;
      const diagnosticCode =
        payload.diagnosticCode || "OPENAI_REQUEST_FAILED";
      const model = payload.model || configuredModel || "unknown";

      setLastMeta({
        model,
        responseSeconds: Number(elapsed.toFixed(2)),
        diagnosticCode,
        requestCompleted: Boolean(payload.requestCompleted),
        httpStatus: response.status,
        responseId: payload.responseId ?? null,
        stage: casePayload?.stage ?? null,
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
          text: casePayload.nextQuestion || casePayload.caseSummary,
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
        responseSeconds: Number(
          ((performance.now() - started) / 1000).toFixed(2),
        ),
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        requestCompleted: false,
        httpStatus: 0,
        responseId: null,
        stage: null,
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
    inputRef.current?.focus();
  }

  const nextSuggested =
    messages.filter((m) => m.role === "user").length < SUGGESTED_TURNS.length
      ? SUGGESTED_TURNS[messages.filter((m) => m.role === "user").length]
      : null;

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
          Agronomic Case Engine V1 — structured tomato diagnostic interview.
          Uses OpenAI Responses API via{" "}
          <code className="text-canopy">/api/ai/case</code>. No registration or
          Supabase required.
        </p>
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
              Ready for a commercial tomato case.
            </p>
            <p className="mt-1">
              Run the Trinidad stunting transcript below, one farmer turn at a
              time. The engine asks one question per reply and returns
              structured sections — not raw Markdown.
            </p>
          </div>
        ) : null}

        {messages.map((message) => {
          const isUser = message.role === "user";
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
                Case engine thinking…
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="animate-rise-late shrink-0 border-t border-line/70 bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          {nextSuggested && !loading ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                {messages.length === 0
                  ? "Acceptance transcript — next farmer turn"
                  : "Next transcript turn"}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => void sendQuestion(nextSuggested)}
                className="min-h-11 w-full rounded-xl bg-sky/70 px-3 py-2 text-left text-sm font-medium text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-60"
              >
                {nextSuggested}
              </button>
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
                Model:{" "}
                <span className="font-semibold text-ink">{lastMeta.model}</span>
              </span>
              <span>
                Response time:{" "}
                <span className="font-semibold text-ink">
                  {lastMeta.responseSeconds.toFixed(2)}s
                </span>
              </span>
              {lastMeta.stage ? (
                <span>
                  Stage:{" "}
                  <span className="font-semibold text-ink">{lastMeta.stage}</span>
                </span>
              ) : null}
              <span>
                Code:{" "}
                <span className="font-semibold text-ink">
                  {lastMeta.diagnosticCode}
                </span>
              </span>
            </div>
          ) : null}

          <form className="flex items-end gap-2" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="ai-lab-input">
              Farmer reply for the case engine
            </label>
            <textarea
              id="ai-lab-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              disabled={loading}
              placeholder="Reply as the farmer…"
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
                <dt>Configured model</dt>
                <dd className="font-medium text-ink">
                  {configuredModel || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Case endpoint</dt>
                <dd className="font-medium text-ink">/api/ai/case</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Legacy chat endpoint</dt>
                <dd className="font-medium text-ink">/api/ai/chat</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Health endpoint</dt>
                <dd className="font-medium text-ink">/api/ai/health</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>previous_response_id</dt>
                <dd className="max-w-[60%] truncate font-medium text-ink">
                  {previousResponseId || "—"}
                </dd>
              </div>
              {lastMeta ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt>Last HTTP status</dt>
                    <dd className="font-medium text-ink">
                      {lastMeta.httpStatus}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Last diagnosticCode</dt>
                    <dd className="font-medium text-ink">
                      {lastMeta.diagnosticCode}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>requestCompleted</dt>
                    <dd className="font-medium text-ink">
                      {String(lastMeta.requestCompleted)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Last response time</dt>
                    <dd className="font-medium text-ink">
                      {lastMeta.responseSeconds.toFixed(2)}s
                    </dd>
                  </div>
                </>
              ) : null}
              {healthError ? (
                <div className="flex justify-between gap-3">
                  <dt>Health note</dt>
                  <dd className="font-medium text-danger">{healthError}</dd>
                </div>
              ) : null}
              <p className="pt-1 text-[0.7rem] leading-relaxed">
                Secrets are never shown here. Auth, cookies, Farmer ID, and
                Supabase are not used by this page. Guest chat at{" "}
                <code>/api/ai/chat</code> remains unchanged.
              </p>
            </dl>
          </details>
        </div>
      </div>
    </div>
  );
}
