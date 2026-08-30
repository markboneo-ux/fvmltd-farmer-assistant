"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ChatAssistantMessage } from "@/components/ChatAssistantMessage";
import {
  CasePhotoAttach,
  prepareCaseImageFiles,
  type AttachedCaseImage,
  type CasePhotoAttachHandle,
} from "@/components/CasePhotoAttach";
import type { AgronomicCasePayload, CaseMode } from "@/lib/agronomy/case-schema";
import {
  FARMER_PHOTO_TOO_LARGE,
  FARMER_PHOTO_UPLOAD_FAILED,
  farmerFacingSendError,
} from "@/lib/chat/case-images";
import { farmerHistoryContent } from "@/lib/chat/visible-reply";
import { useRegisteredFarmer } from "@/lib/farmers/useRegisteredFarmer";
import type { CropOutcome } from "@/lib/agronomy-memory/types";

type ChatRole = "user" | "assistant";

type ChatImagePreview = {
  id: string;
  previewUrl: string;
  fileName: string;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  images?: ChatImagePreview[];
  casePayload?: AgronomicCasePayload;
  model?: string;
  responseSeconds?: number;
  diagnosticCode?: string;
  questionsAsked?: number;
  local?: boolean;
};

type CaseApiPayload = {
  case?: AgronomicCasePayload | null;
  responseId?: string | null;
  model?: string;
  diagnosticCode?: string;
  requestCompleted?: boolean;
  questionsAsked?: number;
  error?: string;
  caseId?: string | null;
  followUpDue?: boolean;
};

const SESSION_KEY = "fvm-agronomy-session";

function readSessionId(): string {
  if (typeof window === "undefined") return "guest-session";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

function subscribeSession(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

const FOLLOW_UP_CHIPS: Array<{ id: CropOutcome; label: string }> = [
  { id: "improved", label: "Improved" },
  { id: "unchanged", label: "About the same" },
  { id: "worse", label: "Worse" },
  { id: "solved", label: "Problem solved" },
];

type FarmerCaseChatProps = {
  showModeToggle?: boolean;
  showDiagnostics?: boolean;
  showTestPrompts?: boolean;
  defaultCountry?: string;
  defaultDistrict?: string | null;
  title?: string;
  subtitle?: string;
};

const WELCOME_TEXT =
  "Hi. Ask me anything about your crop, or send me a photo of what you’re seeing.";

const STARTER_CHIPS = [
  { id: "diagnose", label: "Diagnose a crop problem", prompt: "My crop has a problem. Can you help me work out what’s going on?" },
  { id: "photo", label: "Upload a photo", prompt: "" },
  { id: "product", label: "Ask about a product", prompt: "What can I use for this in Trinidad?" },
] as const;

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function welcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    text: WELCOME_TEXT,
    local: true,
  };
}

export function FarmerCaseChat({
  showModeToggle = false,
  showDiagnostics = false,
  showTestPrompts = false,
  defaultCountry = "Trinidad and Tobago",
  defaultDistrict = null,
  title = "Farmersvaluemart AI",
  subtitle = "Your Caribbean farming assistant",
}: FarmerCaseChatProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachRef = useRef<CasePhotoAttachHandle>(null);
  const farmer = useRegisteredFarmer();
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const sessionId = useSyncExternalStore(
    subscribeSession,
    readSessionId,
    () => "guest-session",
  );
  const [caseId, setCaseId] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [askWhatYouDid, setAskWhatYouDid] = useState(false);

  const [mode, setMode] = useState<CaseMode>("quick_help");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage()]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(
    null,
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [attachedImages, setAttachedImages] = useState<AttachedCaseImage[]>([]);
  const [questionsAsked, setQuestionsAsked] = useState<number | null>(null);
  const [analyzingPhotos, setAnalyzingPhotos] = useState(false);

  const farmerMessages = messages.filter((item) => !item.local);
  const showStarters = farmerMessages.length === 0 && !loading;

  useEffect(() => {
    if (!sessionId || sessionId === "guest-session") return;
    void fetch(`/api/ai/case/outcome?sessionId=${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          followUp?: { caseId: string } | null;
        };
        if (payload.followUp?.caseId) {
          setCaseId(payload.followUp.caseId);
          setShowFollowUp(true);
        }
      })
      .catch(() => {
        // Follow-up is optional; chat still works.
      });
  }, [sessionId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, error, attachedImages]);

  function clearQuickReplies() {
    setActiveQuestionId(null);
  }

  function resizeComposer() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function sendQuestion(question: string, modeOverride?: CaseMode) {
    const trimmed = question.trim();
    if ((!trimmed && attachedImages.length === 0) || loading) return;

    clearQuickReplies();
    setMenuOpen(false);

    const nextMode =
      /start full crop check|more detailed crop assessment/i.test(trimmed)
        ? "full_crop_check"
        : (modeOverride ?? mode);

    if (nextMode !== mode) {
      setMode(nextMode);
    }

    setLoading(true);
    setAnalyzingPhotos(attachedImages.length > 0);
    setError(null);
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const imagePreviews: ChatImagePreview[] = attachedImages.map((image) => ({
      id: image.id,
      previewUrl: image.previewUrl,
      fileName: image.fileName,
    }));

    const userMessage: ChatMessage = {
      id: messageId(),
      role: "user",
      text:
        trimmed ||
        (attachedImages.length === 1
          ? "Here’s a photo of what I’m seeing."
          : `Here are ${attachedImages.length} photos of what I’m seeing.`),
      images: imagePreviews,
    };

    const historyForApi = [...messages, userMessage]
      .filter((item) => !item.local)
      .slice(0, -1)
      .map((item) => ({
        role: item.role,
        content: item.casePayload
          ? farmerHistoryContent(item.casePayload)
          : item.text,
      }));

    setMessages((prev) => [...prev, userMessage]);

    const imagesSnapshot = [...attachedImages];
    const largestBytes = imagesSnapshot.reduce(
      (max, image) => Math.max(max, image.file.size),
      0,
    );

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 55_000);

      let preparedFiles: File[] = [];
      if (imagesSnapshot.length > 0) {
        preparedFiles = await prepareCaseImageFiles(imagesSnapshot);
      }

      const form = new FormData();
      form.append(
        "message",
        trimmed || "Please assess the uploaded crop photo(s).",
      );
      form.append("messages", JSON.stringify(historyForApi));
      form.append("previousResponseId", previousResponseId ?? "");
      form.append("mode", nextMode);
      form.append(
        "profile",
        JSON.stringify({
          country: farmer?.country || defaultCountry,
          district: farmer?.district || defaultDistrict,
          farmerId: farmer?.id ?? null,
          sessionId,
          caseId,
          farm: farmer?.fullName ? `${farmer.fullName} farm` : null,
        }),
      );
      for (const file of preparedFiles) {
        form.append("images", file, file.name);
      }

      const response = await fetch("/api/ai/case", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      window.clearTimeout(timeout);

      const elapsed = (Date.now() - Number(userMessage.id.split("-")[0])) / 1000;
      let payload: CaseApiPayload;
      try {
        payload = (await response.json()) as CaseApiPayload;
      } catch {
        setAttachedImages([]);
        if (response.status === 413) {
          setError(FARMER_PHOTO_TOO_LARGE);
        } else if (imagesSnapshot.length > 0) {
          setError(FARMER_PHOTO_UPLOAD_FAILED);
        } else {
          setError("I couldn’t send that message. Please try again.");
        }
        return;
      }

      const casePayload = payload.case ?? null;
      const diagnosticCode =
        payload.diagnosticCode || "OPENAI_REQUEST_FAILED";
      const model = payload.model || "unknown";

      setAttachedImages([]);

      if (casePayload?.mode) {
        setMode(casePayload.mode);
      }

      if (typeof payload.questionsAsked === "number") {
        setQuestionsAsked(payload.questionsAsked);
      }

      if (!response.ok || !casePayload) {
        clearQuickReplies();
        const rawError = payload.error || "";
        if (/openai_api_key|openai is not configured/i.test(rawError)) {
          setError("I couldn’t get a reply right now. Please try again shortly.");
        } else if (response.status === 413) {
          setError(rawError || FARMER_PHOTO_TOO_LARGE);
        } else if (imagesSnapshot.length > 0) {
          setError(rawError || FARMER_PHOTO_UPLOAD_FAILED);
        } else {
          setError(rawError || "I couldn’t get a reply right now.");
        }
        return;
      }

      if (payload.responseId) {
        setPreviousResponseId(payload.responseId);
      }
      if (payload.caseId) {
        setCaseId(payload.caseId);
      }
      if (payload.followUpDue) {
        setShowFollowUp(true);
      }

      setActiveQuestionId(casePayload.questionId || null);

      setMessages((prev) => [
        ...prev,
        {
          id: messageId(),
          role: "assistant",
          text: farmerHistoryContent(casePayload),
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
      console.error("[farmer-chat] send failed", err);
      setError(
        farmerFacingSendError(err, {
          hadImages: imagesSnapshot.length > 0,
          largestBytes,
        }),
      );
    } finally {
      setLoading(false);
      setAnalyzingPhotos(false);
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
    for (const message of messages) {
      for (const image of message.images ?? []) {
        URL.revokeObjectURL(image.previewUrl);
      }
    }
    setAttachedImages([]);
    setMessages([welcomeMessage()]);
    setError(null);
    setPreviousResponseId(null);
    setQuestionsAsked(null);
    setMode("quick_help");
    setMenuOpen(false);
    inputRef.current?.focus();
  }

  async function submitFollowUp(outcome: CropOutcome) {
    if (!caseId) {
      setAskWhatYouDid(true);
      return;
    }
    try {
      await fetch("/api/ai/case/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          cropOutcome: outcome,
          daysAfterRecommendation: 7,
        }),
      });
      setShowFollowUp(false);
      setAskWhatYouDid(true);
      setMessages((prev) => [
        ...prev,
        {
          id: messageId(),
          role: "user",
          text:
            FOLLOW_UP_CHIPS.find((item) => item.id === outcome)?.label ??
            outcome,
        },
        {
          id: messageId(),
          role: "assistant",
          text:
            outcome === "worse"
              ? "Thank you. What did you do, and I will help with the next check."
              : "Thank you. What did you do? That helps us learn which steps actually helped.",
          local: true,
        },
      ]);
    } catch {
      setError("I couldn’t save that follow-up. Please try again.");
    }
  }

  function startFullCropCheck() {
    setMenuOpen(false);
    setMode("full_crop_check");
    void sendQuestion(
      "I’d like a more detailed crop assessment.",
      "full_crop_check",
    );
  }

  const latestAssistant = [...messages]
    .reverse()
    .find((item) => item.role === "assistant" && item.casePayload);

  return (
    <div className="flex min-h-dvh flex-col bg-[#f6f7f6]">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-canopy">
                {title}
              </p>
              <p className="truncate text-xs text-muted">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-canopy ring-1 ring-line hover:bg-sky"
            aria-expanded={menuOpen}
            aria-label="Open menu"
          >
            <span aria-hidden className="text-lg leading-none">
              ☰
            </span>
          </button>
        </div>

        {menuOpen ? (
          <div className="mx-auto mt-3 w-full max-w-3xl rounded-2xl bg-field p-2 ring-1 ring-line">
            <button
              type="button"
              onClick={startFullCropCheck}
              disabled={loading}
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-ink hover:bg-sky disabled:opacity-50"
            >
              More detailed crop assessment
            </button>
            <button
              type="button"
              onClick={clearConversation}
              disabled={loading}
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-ink hover:bg-sky disabled:opacity-50"
            >
              New conversation
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowFollowUp(true);
              }}
              disabled={loading || !caseId}
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-ink hover:bg-sky disabled:opacity-50"
            >
              How is the crop now?
            </button>
            {showModeToggle ? (
              <button
                type="button"
                onClick={() => {
                  setMode((current) =>
                    current === "quick_help" ? "full_crop_check" : "quick_help",
                  );
                }}
                className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-ink hover:bg-sky"
              >
                Mode: {mode === "full_crop_check" ? "Full crop check" : "Chat"}
              </button>
            ) : null}
            <Link
              href="/register"
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-ink hover:bg-sky"
              onClick={() => setMenuOpen(false)}
            >
              Save a farmer profile (optional)
            </Link>
            {showDiagnostics ? (
              <p className="px-3 py-2 text-xs text-muted">
                Developer lab — diagnostics stay collapsed below replies.
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <div
        ref={scrollerRef}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
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
                className={`max-w-[88%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed sm:max-w-[80%] ${
                  isUser
                    ? "rounded-br-lg bg-canopy text-white"
                    : "rounded-bl-lg bg-surface text-ink shadow-sm ring-1 ring-line/80"
                }`}
              >
                {isUser ? (
                  <div className="space-y-2">
                    {message.images && message.images.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {message.images.map((image) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={image.id}
                            src={image.previewUrl}
                            alt={image.fileName}
                            className="h-20 w-20 rounded-xl object-cover ring-1 ring-white/30"
                          />
                        ))}
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap">{message.text}</p>
                  </div>
                ) : (
                  <ChatAssistantMessage
                    payload={message.casePayload}
                    text={message.text}
                    showQuickReplies={
                      isLatestAssistant &&
                      Boolean(activeQuestionId) &&
                      message.casePayload?.questionId === activeQuestionId
                    }
                    quickRepliesDisabled={loading || !isLatestAssistant}
                    onUploadPhoto={() => attachRef.current?.openLibrary()}
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

                {showDiagnostics && message.casePayload ? (
                  <details className="mt-3 rounded-xl bg-field/90 px-3 py-2 text-xs text-muted ring-1 ring-line">
                    <summary className="cursor-pointer font-semibold text-canopy">
                      Developer diagnostics
                    </summary>
                    <div className="mt-2 space-y-1 font-mono">
                      <p>model: {message.model || "—"}</p>
                      <p>
                        time:{" "}
                        {typeof message.responseSeconds === "number"
                          ? `${message.responseSeconds.toFixed(2)}s`
                          : "—"}
                      </p>
                      <p>code: {message.diagnosticCode || "—"}</p>
                      <p>stage: {message.casePayload.stage}</p>
                      <p>mode: {message.casePayload.mode}</p>
                      <p>
                        questionsAsked:{" "}
                        {message.questionsAsked ?? questionsAsked ?? "—"}
                      </p>
                      <p>
                        missing:{" "}
                        {message.casePayload.internalMissingInformation.join(
                          ", ",
                        ) || "—"}
                      </p>
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          );
        })}

        {showFollowUp && !loading ? (
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-line">
            <p className="text-sm font-medium text-ink">
              Did the crop improve after the steps we discussed?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FOLLOW_UP_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => void submitFollowUp(chip.id)}
                  className="min-h-10 rounded-full bg-[#f6f7f6] px-3.5 py-2 text-sm font-medium text-canopy ring-1 ring-line hover:bg-white"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {askWhatYouDid ? (
              <p className="mt-2 text-sm text-muted">What did you do?</p>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-start" aria-busy="true">
            <div className="rounded-3xl rounded-bl-lg bg-surface px-4 py-3 text-sm text-muted shadow-sm ring-1 ring-line/80">
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 animate-pulse-soft rounded-full bg-leaf"
                  aria-hidden
                />
                {analyzingPhotos
                  ? "Looking at your photo…"
                  : "Thinking…"}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-line/70 bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          {showStarters ? (
            <div className="flex flex-wrap gap-2">
              {STARTER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (chip.id === "photo") {
                      attachRef.current?.openLibrary();
                      return;
                    }
                    void sendQuestion(chip.prompt);
                  }}
                  className="min-h-10 rounded-full bg-field px-3.5 py-2 text-sm font-medium text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-60"
                >
                  {chip.label}
                </button>
              ))}
              {showTestPrompts ? (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void sendQuestion("Tomatoes stunted")}
                    className="min-h-10 rounded-full bg-field px-3.5 py-2 text-sm font-medium text-muted ring-1 ring-line"
                  >
                    Tomatoes stunted
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void sendQuestion("Whiteflies on tomato")}
                    className="min-h-10 rounded-full bg-field px-3.5 py-2 text-sm font-medium text-muted ring-1 ring-line"
                  >
                    Whiteflies on tomato
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <CasePhotoAttach
            ref={attachRef}
            images={attachedImages}
            onChange={setAttachedImages}
            disabled={loading}
            uploading={loading && attachedImages.length > 0}
          />

          {attachMenuOpen ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  attachRef.current?.openCamera();
                }}
                className="min-h-10 rounded-full bg-white px-3.5 text-sm font-medium text-canopy ring-1 ring-line"
              >
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  attachRef.current?.openLibrary();
                }}
                className="min-h-10 rounded-full bg-white px-3.5 text-sm font-medium text-canopy ring-1 ring-line"
              >
                Choose Photo
              </button>
            </div>
          ) : null}

          <form className="flex items-end gap-2" onSubmit={handleSubmit}>
            <button
              type="button"
              onClick={() => setAttachMenuOpen((open) => !open)}
              disabled={loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl font-semibold text-canopy shadow-sm ring-1 ring-line hover:bg-[#f6f7f6] disabled:opacity-50"
              aria-label="Attach photo"
            >
              +
            </button>
            <label className="sr-only" htmlFor="farmer-case-input">
              Ask about your crop
            </label>
            <textarea
              id="farmer-case-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                resizeComposer();
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading}
              placeholder="Ask about your crop…"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-white px-4 py-2.5 text-base leading-snug text-ink shadow-sm outline-none ring-canopy/25 placeholder:text-muted/80 focus:ring-2 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => attachRef.current?.openCamera()}
              disabled={loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-field text-canopy ring-1 ring-line hover:bg-sky disabled:opacity-50"
              aria-label="Take photo"
            >
              <CameraIcon />
            </button>
            <button
              type="submit"
              disabled={loading || (!draft.trim() && attachedImages.length === 0)}
              className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-leaf px-3 text-sm font-semibold text-white transition enabled:hover:bg-canopy disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.6A1.5 1.5 0 0 1 10.9 4h2.2a1.5 1.5 0 0 1 1.2.4L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}
