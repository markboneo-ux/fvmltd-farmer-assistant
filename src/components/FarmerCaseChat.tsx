"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ChatAssistantMessage } from "@/components/ChatAssistantMessage";
import {
  CasePhotoAttach,
  prepareCaseImageFiles,
  type AttachedCaseImage,
  type CasePhotoAttachHandle,
} from "@/components/CasePhotoAttach";
import type { AgronomicCasePayload, CaseMode } from "@/lib/agronomy/case-schema";
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@/lib/brand";
import {
  FARMER_PHOTO_TOO_LARGE,
  FARMER_PHOTO_UPLOAD_FAILED,
  farmerFacingSendError,
} from "@/lib/chat/case-images";
import { farmerHistoryContent } from "@/lib/chat/visible-reply";

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

const STARTER_CHIPS = [
  {
    id: "diagnose",
    label: "Diagnose a crop problem",
    prompt:
      "My crop has a problem. Can you help me work out what’s going on?",
  },
  { id: "photo", label: "Send a photo", prompt: "" },
  {
    id: "product",
    label: "Ask about a product",
    prompt: "What can I use for this in Trinidad?",
  },
] as const;

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FarmerCaseChat({
  showModeToggle = false,
  showDiagnostics = false,
  showTestPrompts = false,
  defaultCountry = "Trinidad and Tobago",
  defaultDistrict = null,
  title = PRODUCT_NAME,
  subtitle = PRODUCT_SUBTITLE,
}: FarmerCaseChatProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachRef = useRef<CasePhotoAttachHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

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
  const [analyzingPhotos, setAnalyzingPhotos] = useState(false);

  const showWelcome = messages.length === 0 && !loading;

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
    setAttachMenuOpen(false);

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
          country: defaultCountry,
          district: defaultDistrict,
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
    setMessages([]);
    setError(null);
    setPreviousResponseId(null);
    setQuestionsAsked(null);
    setMode("quick_help");
    setMenuOpen(false);
    setAttachMenuOpen(false);
    inputRef.current?.focus();
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
    <div className="flex h-dvh flex-col overflow-hidden bg-sky">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandLogo className="h-9 w-auto shrink-0 sm:h-10" priority />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight text-canopy sm:text-base">
                {title}
              </p>
              {subtitle ? (
                <p className="hidden truncate text-xs text-muted md:block">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAttachMenuOpen(false);
              setMenuOpen((open) => !open);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-canopy hover:bg-sky"
            aria-expanded={menuOpen}
            aria-label="Open menu"
          >
            <span aria-hidden className="text-lg leading-none">
              ☰
            </span>
          </button>
        </div>

        {menuOpen ? (
          <div className="mx-auto mb-3 w-full max-w-3xl px-4">
            <div className="rounded-2xl bg-surface p-1.5 shadow-lg shadow-black/5 ring-1 ring-line/80">
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
          </div>
        ) : null}
      </header>

      <div
        ref={scrollerRef}
        className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {showWelcome ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-ink">
              Hi 👋
            </h1>
            <p className="mt-3 text-xl font-medium text-balance text-ink">
              What is happening with your crop?
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              You can type your problem or send me a photo.
            </p>
            <div className="mt-8 flex w-full max-w-lg flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
              {STARTER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (chip.id === "photo") {
                      setAttachMenuOpen(true);
                      return;
                    }
                    void sendQuestion(chip.prompt);
                  }}
                  className="min-h-11 rounded-full bg-surface px-4 py-2.5 text-sm font-medium text-canopy shadow-sm ring-1 ring-line/90 transition hover:ring-canopy/30 disabled:opacity-60"
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
                    className="min-h-11 rounded-full bg-surface px-4 py-2.5 text-sm font-medium text-muted ring-1 ring-line"
                  >
                    Tomatoes stunted
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void sendQuestion("Whiteflies on tomato")}
                    className="min-h-11 rounded-full bg-surface px-4 py-2.5 text-sm font-medium text-muted ring-1 ring-line"
                  >
                    Whiteflies on tomato
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-5">
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
                    className={`max-w-[88%] px-4 py-3 text-[15px] leading-relaxed sm:max-w-[80%] ${
                      isUser
                        ? "rounded-2xl rounded-br-md bg-canopy text-white"
                        : "rounded-2xl rounded-bl-md bg-surface text-ink shadow-sm"
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
                                className="h-20 w-20 rounded-xl object-cover"
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
                      <details className="mt-3 rounded-xl bg-sky px-3 py-2 text-xs text-muted">
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

            {loading ? (
              <div className="flex justify-start" aria-busy="true">
                <div className="rounded-2xl rounded-bl-md bg-surface px-4 py-3 text-sm text-muted shadow-sm">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 animate-pulse-soft rounded-full bg-accent-lime"
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
        )}
      </div>

      <div className="z-20 shrink-0 bg-sky/90 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {error ? (
            <p className="px-1 text-sm font-medium text-danger" role="alert">
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

          <form className="relative flex items-end gap-1.5" onSubmit={handleSubmit}>
            {attachMenuOpen ? (
              <div className="absolute bottom-full left-0 mb-2 w-44 overflow-hidden rounded-2xl bg-surface py-1 shadow-lg shadow-black/5 ring-1 ring-line/80">
                <button
                  type="button"
                  onClick={() => {
                    attachRef.current?.openCamera();
                    setAttachMenuOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center px-3 text-left text-sm font-medium text-ink hover:bg-sky"
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    attachRef.current?.openLibrary();
                    setAttachMenuOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center px-3 text-left text-sm font-medium text-ink hover:bg-sky"
                >
                  Choose Photo
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setAttachMenuOpen((open) => !open);
              }}
              disabled={loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-xl font-semibold text-canopy shadow-sm ring-1 ring-line/80 hover:bg-white disabled:opacity-50"
              aria-label="Add photo"
              aria-expanded={attachMenuOpen}
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
              placeholder="Ask about your crop..."
              className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border-0 bg-surface px-4 py-2.5 text-base leading-snug text-ink shadow-sm outline-none ring-1 ring-line/80 placeholder:text-muted/80 focus:ring-2 focus:ring-canopy/25 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => attachRef.current?.openCamera()}
              disabled={loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-canopy shadow-sm ring-1 ring-line/80 hover:bg-white disabled:opacity-50"
              aria-label="Take photo"
            >
              <CameraIcon />
            </button>
            <button
              type="submit"
              disabled={loading || (!draft.trim() && attachedImages.length === 0)}
              className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-canopy px-3 text-sm font-semibold text-white transition enabled:hover:bg-leaf-bright disabled:opacity-50"
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
