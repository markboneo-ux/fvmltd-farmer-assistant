"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { AppShell } from "@/components/AppShell";
import { CasePhotoUploader } from "@/components/CasePhotoUploader";
import { labelForAnswer, promptForStep } from "@/lib/crop-check/steps";
import {
  CROP_CHECK_CROPS,
  CROP_CHECK_DRAINAGE_OPTIONS,
  IRRIGATION_FREQUENCY_OPTIONS,
  SYMPTOM_LOCATION_OPTIONS,
  type CropCaseRecord,
  type CropCheckCrop,
  type GuidedQuestionStep,
  type PreCaseStep,
} from "@/lib/crop-check/types";
import type { AssessmentRecord } from "@/lib/assessment/types";
import { PHOTO_SLOTS, type PhotoSlotKey } from "@/lib/crop-check/photos";
import type { CropCycleRecord } from "@/lib/crop-cycles/types";
import {
  GROWING_ENVIRONMENT_OPTIONS,
  type GrowingEnvironment,
} from "@/lib/crop-cycles/types";
import type { FarmRecord } from "@/lib/farms/types";
import { useRegisteredFarmer } from "@/lib/farmers/useRegisteredFarmer";

type ChatMessage = {
  id: string;
  role: "assistant" | "farmer";
  text: string;
};

type CreateCycleDraft = {
  farmId: string;
  variety: string;
  plantingDate: string;
  areaPlanted: string;
  growingEnvironment: GrowingEnvironment | "";
};

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CropCheckChat() {
  const farmer = useRegisteredFarmer();
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<PreCaseStep | GuidedQuestionStep>("select_crop");
  const [crop, setCrop] = useState<CropCheckCrop | null>(null);
  const [cycles, setCycles] = useState<CropCycleRecord[]>([]);
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [cropCase, setCropCase] = useState<CropCaseRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: messageId(),
      role: "assistant",
      text: "Let’s start a guided crop check. Which crop needs attention today — Tomato, Pepper, or Cucumber?",
    },
  ]);
  const [textValue, setTextValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateCycleDraft>({
    farmId: "",
    variety: "",
    plantingDate: "",
    areaPlanted: "",
    growingEnvironment: "",
  });

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, step, error]);

  function pushAssistant(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: messageId(), role: "assistant", text },
    ]);
  }

  function pushFarmer(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: messageId(), role: "farmer", text },
    ]);
  }

  async function loadCyclesForCrop(selected: CropCheckCrop) {
    if (!farmer?.id) return [];
    const response = await fetch(
      `/api/crop-cycles?farmerId=${farmer.id}&status=active&crop=${encodeURIComponent(selected)}`,
    );
    const payload = (await response.json()) as {
      cropCycles?: CropCycleRecord[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load crop cycles.");
    }
    return payload.cropCycles ?? [];
  }

  async function loadFarms() {
    if (!farmer?.id) return [];
    const response = await fetch(`/api/farms?farmerId=${farmer.id}`);
    const payload = (await response.json()) as {
      farms?: FarmRecord[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load farms.");
    }
    return payload.farms ?? [];
  }

  async function startCase(cycleId: string, selectedCrop: CropCheckCrop) {
    if (!farmer?.id) throw new Error("Register before starting a crop check.");
    const response = await fetch("/api/crop-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        farmerId: farmer.id,
        cropCycleId: cycleId,
        cropName: selectedCrop,
      }),
    });
    const payload = (await response.json()) as {
      cropCase?: CropCaseRecord;
      error?: string;
    };
    if (!response.ok || !payload.cropCase) {
      throw new Error(payload.error ?? "Could not start crop check.");
    }
    return payload.cropCase;
  }

  async function handleSelectCrop(selected: CropCheckCrop) {
    if (!farmer?.id || busy) return;
    setBusy(true);
    setError(null);
    pushFarmer(selected);
    setCrop(selected);

    try {
      const list = await loadCyclesForCrop(selected);
      setCycles(list);
      setStep("select_cycle");
      if (list.length === 0) {
        pushAssistant(
          `I don’t see an active ${selected} crop cycle yet. Create one now, or add a farm first if you haven’t.`,
        );
      } else {
        pushAssistant(
          `Choose an existing ${selected} crop cycle, or create a new one.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectCycle(cycle: CropCycleRecord) {
    if (!farmer?.id || !crop || busy) return;
    setBusy(true);
    setError(null);
    pushFarmer(
      `${cycle.cropName}${cycle.variety ? ` · ${cycle.variety}` : ""} · ${cycle.farmName}`,
    );

    try {
      const created = await startCase(cycle.id, crop);
      setCropCase(created);
      setStep("problem_description");
      pushAssistant(promptForStep("problem_description", crop).assistantText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start case.");
    } finally {
      setBusy(false);
    }
  }

  async function beginCreateCycle() {
    if (!farmer?.id || !crop || busy) return;
    setBusy(true);
    setError(null);
    pushFarmer("Create a new crop cycle");

    try {
      const list = await loadFarms();
      setFarms(list);
      if (list.length === 0) {
        pushAssistant(
          "You need a farm before creating a crop cycle. Add a farm, then come back to continue this check.",
        );
        setStep("select_cycle");
      } else {
        setCreateDraft((prev) => ({
          ...prev,
          farmId: list[0]?.id ?? "",
        }));
        setStep("create_cycle_farm");
        pushAssistant("Which farm is this crop cycle on?");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load farms.");
    } finally {
      setBusy(false);
    }
  }

  function handleSelectFarm(farm: FarmRecord) {
    if (busy) return;
    pushFarmer(`${farm.name} · ${farm.district}`);
    setCreateDraft((prev) => ({ ...prev, farmId: farm.id }));
    setStep("create_cycle_details");
    pushAssistant(
      `Enter variety (optional), planting date, area planted in hectares, and growing place for this ${crop} cycle.`,
    );
  }

  async function handleCreateCycleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!farmer?.id || !crop || busy) return;

    if (!createDraft.farmId) {
      setError("Select a farm.");
      return;
    }
    if (!createDraft.plantingDate) {
      setError("Enter the planting date.");
      return;
    }
    if (!createDraft.areaPlanted) {
      setError("Enter the area planted.");
      return;
    }
    if (!createDraft.growingEnvironment) {
      setError("Choose open field, shade house, or greenhouse.");
      return;
    }

    setBusy(true);
    setError(null);
    pushFarmer(
      [
        createDraft.variety ? `Variety ${createDraft.variety}` : "No variety",
        `Planted ${createDraft.plantingDate}`,
        `${createDraft.areaPlanted} ha`,
        createDraft.growingEnvironment.replaceAll("_", " "),
      ].join(" · "),
    );

    try {
      const cycleResponse = await fetch("/api/crop-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmerId: farmer.id,
          farmId: createDraft.farmId,
          crop,
          variety: createDraft.variety,
          plantingDate: createDraft.plantingDate,
          areaPlanted: createDraft.areaPlanted,
          areaUnit: "hectares",
          plantCount: "",
          growingEnvironment: createDraft.growingEnvironment,
          previousCrop: "",
          currentStage: "vegetative",
        }),
      });
      const cyclePayload = (await cycleResponse.json()) as {
        cropCycle?: CropCycleRecord;
        error?: string;
        errors?: Record<string, string>;
      };
      if (!cycleResponse.ok || !cyclePayload.cropCycle) {
        throw new Error(
          cyclePayload.errors?.form ??
            cyclePayload.error ??
            "Could not create crop cycle.",
        );
      }

      const created = await startCase(cyclePayload.cropCycle.id, crop);
      setCropCase(created);
      setCycles((prev) => [cyclePayload.cropCycle!, ...prev]);
      setStep("problem_description");
      pushAssistant(promptForStep("problem_description", crop).assistantText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create cycle.");
    } finally {
      setBusy(false);
    }
  }

  function handlePhotosCompleted(result: {
    missingSlots: PhotoSlotKey[];
    assessment: AssessmentRecord | null;
    assessmentError: string | null;
  }) {
    setStep("completed");
    setCropCase((prev) =>
      prev
        ? {
            ...prev,
            status: "open",
            guidedStep: "completed",
            completedAt: new Date().toISOString(),
          }
        : prev,
    );

    if (result.missingSlots.length > 0) {
      const labels = result.missingSlots
        .map(
          (key) => PHOTO_SLOTS.find((slot) => slot.key === key)?.label ?? key,
        )
        .join(", ");
      pushAssistant(
        `Crop check saved. These required photographs are still missing or were skipped: ${labels}.`,
      );
    }

    if (result.assessment) {
      pushAssistant(
        "A preliminary AI assessment is ready. Opening your results now. This is not a final diagnosis — no pesticide rates or invented products are allowed.",
      );
      router.push(`/results?caseId=${cropCase?.id ?? ""}`);
      return;
    }

    if (result.assessmentError) {
      pushAssistant(
        `Crop check saved, but the preliminary assessment could not run yet: ${result.assessmentError}. You can retry from the results screen.`,
      );
    } else {
      pushAssistant(promptForStep("completed", crop ?? "crop").assistantText);
    }

    if (cropCase?.id) {
      router.push(`/results?caseId=${cropCase.id}`);
    }
  }

  async function submitGuidedAnswer(answer: string | boolean | number) {
    if (!farmer?.id || !cropCase || !crop || busy) return;
    if (
      step === "select_crop" ||
      step === "select_cycle" ||
      step === "create_cycle_farm" ||
      step === "create_cycle_details" ||
      step === "photos" ||
      step === "completed"
    ) {
      return;
    }

    const guidedStep = step as GuidedQuestionStep;
    setBusy(true);
    setError(null);
    pushFarmer(labelForAnswer(guidedStep, answer));

    try {
      const response = await fetch(`/api/crop-cases/${cropCase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmerId: farmer.id,
          step: guidedStep,
          answer,
        }),
      });
      const payload = (await response.json()) as {
        cropCase?: CropCaseRecord;
        nextStep?: GuidedQuestionStep;
        error?: string;
      };
      if (!response.ok || !payload.cropCase || !payload.nextStep) {
        throw new Error(payload.error ?? "Could not save your answer.");
      }

      setCropCase(payload.cropCase);
      setStep(payload.nextStep);
      setTextValue("");
      pushAssistant(promptForStep(payload.nextStep, crop).assistantText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answer.");
    } finally {
      setBusy(false);
    }
  }

  function handleTextSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!textValue.trim()) {
      setError("Please enter a response.");
      return;
    }
    const value =
      step === "percent_affected" ? Number(textValue) : textValue.trim();
    void submitGuidedAnswer(value);
  }

  if (!farmer) {
    return (
      <AppShell bare>
        <div className="flex min-h-dvh flex-col px-4 pt-4">
          <header className="mb-5">
            <Link href="/dashboard" className="text-sm font-medium text-leaf">
              ← Back
            </Link>
            <h1 className="font-display mt-3 text-2xl font-semibold text-ink">
              Crop check
            </h1>
          </header>
          <div className="space-y-4 rounded-2xl bg-surface px-4 py-5 ring-1 ring-line">
            <p className="text-sm text-ink">
              Register as a farmer before starting a guided crop check.
            </p>
            <Button href="/register">Register as a farmer</Button>
          </div>
          <div className="-mx-4 mt-auto">
            <BottomNav active="/crop-check" />
          </div>
        </div>
      </AppShell>
    );
  }

  const guidedPrompt =
    step !== "select_crop" &&
    step !== "select_cycle" &&
    step !== "create_cycle_farm" &&
    step !== "create_cycle_details" &&
    step !== "photos"
      ? promptForStep(step, crop ?? "crop")
      : null;

  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col px-4 pt-4">
        <header className="mb-3 shrink-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-sm font-medium text-leaf"
            >
              <span aria-hidden>←</span>
              Back
            </Link>
            <span className="rounded-md bg-canopy/10 px-2 py-1 text-[11px] font-semibold text-canopy">
              {cropCase
                ? cropCase.status === "draft"
                  ? "Draft saved"
                  : "Check complete"
                : "Guided check"}
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Crop check
          </h1>
          <p className="mt-1 text-sm text-muted">
            Tomato, Pepper, and Cucumber — one question at a time. No AI diagnosis
            yet.
          </p>
        </header>

        <div
          ref={scrollerRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto pb-3"
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
        </div>

        {error ? (
          <p className="mb-2 text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="shrink-0 space-y-3 pb-2">
          {step === "select_crop" ? (
            <div className="grid grid-cols-3 gap-2">
              {CROP_CHECK_CROPS.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSelectCrop(option)}
                  className="min-h-12 rounded-xl bg-surface text-sm font-semibold text-ink ring-1 ring-line transition hover:bg-sky/50 disabled:opacity-60"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          {step === "select_cycle" ? (
            <div className="space-y-2">
              {cycles.map((cycle) => (
                <button
                  key={cycle.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSelectCycle(cycle)}
                  className="flex min-h-12 w-full flex-col items-start justify-center rounded-xl bg-surface px-3 py-2 text-left ring-1 ring-line transition hover:bg-sky/50 disabled:opacity-60"
                >
                  <span className="text-sm font-semibold text-ink">
                    {cycle.cropName}
                    {cycle.variety ? ` · ${cycle.variety}` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {cycle.farmName}
                    {cycle.plantingDate ? ` · planted ${cycle.plantingDate}` : ""}
                  </span>
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => void beginCreateCycle()}
                className="min-h-12 w-full rounded-xl bg-canopy text-sm font-semibold text-white disabled:opacity-60"
              >
                Create a new crop cycle
              </button>
              <Button href="/farms/new" variant="secondary">
                Add a farm first
              </Button>
            </div>
          ) : null}

          {step === "create_cycle_farm" ? (
            <div className="space-y-2">
              {farms.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleSelectFarm(farm)}
                  className="flex min-h-12 w-full flex-col items-start justify-center rounded-xl bg-surface px-3 py-2 text-left ring-1 ring-line transition hover:bg-sky/50"
                >
                  <span className="text-sm font-semibold text-ink">{farm.name}</span>
                  <span className="text-xs text-muted">
                    {farm.district}, {farm.country}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {step === "create_cycle_details" ? (
            <form className="space-y-2" onSubmit={handleCreateCycleSubmit}>
              <input
                type="text"
                value={createDraft.variety}
                onChange={(event) =>
                  setCreateDraft((prev) => ({
                    ...prev,
                    variety: event.target.value,
                  }))
                }
                placeholder="Variety (optional)"
                disabled={busy}
                className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none ring-canopy/30 focus:ring-2"
              />
              <input
                type="date"
                value={createDraft.plantingDate}
                onChange={(event) =>
                  setCreateDraft((prev) => ({
                    ...prev,
                    plantingDate: event.target.value,
                  }))
                }
                required
                disabled={busy}
                className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none ring-canopy/30 focus:ring-2"
              />
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={createDraft.areaPlanted}
                onChange={(event) =>
                  setCreateDraft((prev) => ({
                    ...prev,
                    areaPlanted: event.target.value,
                  }))
                }
                placeholder="Area planted (hectares)"
                required
                disabled={busy}
                className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none ring-canopy/30 focus:ring-2"
              />
              <div className="grid grid-cols-1 gap-2">
                {GROWING_ENVIRONMENT_OPTIONS.map((option) => {
                  const selected =
                    createDraft.growingEnvironment === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setCreateDraft((prev) => ({
                          ...prev,
                          growingEnvironment: option.value,
                        }))
                      }
                      className={`min-h-11 rounded-xl px-3 text-left text-sm font-semibold ring-1 ${
                        selected
                          ? "bg-canopy text-white ring-canopy"
                          : "bg-surface text-ink ring-line"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save cycle and continue"}
              </Button>
            </form>
          ) : null}

          {guidedPrompt?.inputKind === "choice" && step === "symptom_location" ? (
            <div className="grid grid-cols-2 gap-2">
              {SYMPTOM_LOCATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitGuidedAnswer(option.value)}
                  className="min-h-12 rounded-xl bg-surface px-2 text-sm font-semibold text-ink ring-1 ring-line hover:bg-sky/50 disabled:opacity-60"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          {guidedPrompt?.inputKind === "choice" &&
          step === "irrigation_frequency" ? (
            <div className="grid grid-cols-2 gap-2">
              {IRRIGATION_FREQUENCY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitGuidedAnswer(option.value)}
                  className="min-h-12 rounded-xl bg-surface px-2 text-sm font-semibold text-ink ring-1 ring-line hover:bg-sky/50 disabled:opacity-60"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          {guidedPrompt?.inputKind === "choice" &&
          step === "drainage_condition" ? (
            <div className="grid grid-cols-1 gap-2">
              {CROP_CHECK_DRAINAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitGuidedAnswer(option.value)}
                  className="min-h-12 rounded-xl bg-surface px-3 text-left text-sm font-semibold text-ink ring-1 ring-line hover:bg-sky/50 disabled:opacity-60"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}

          {guidedPrompt?.inputKind === "boolean" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitGuidedAnswer(true)}
                className="min-h-12 rounded-xl bg-canopy text-sm font-semibold text-white disabled:opacity-60"
              >
                Yes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitGuidedAnswer(false)}
                className="min-h-12 rounded-xl bg-surface text-sm font-semibold text-ink ring-1 ring-line disabled:opacity-60"
              >
                No
              </button>
            </div>
          ) : null}

          {guidedPrompt &&
          (guidedPrompt.inputKind === "textarea" ||
            guidedPrompt.inputKind === "text" ||
            guidedPrompt.inputKind === "date" ||
            guidedPrompt.inputKind === "number") ? (
            <form className="flex gap-2" onSubmit={handleTextSubmit}>
              {guidedPrompt.inputKind === "textarea" ? (
                <textarea
                  value={textValue}
                  onChange={(event) => setTextValue(event.target.value)}
                  rows={3}
                  disabled={busy}
                  placeholder="Type your answer…"
                  className="min-h-20 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none ring-canopy/30 focus:ring-2"
                />
              ) : (
                <input
                  type={
                    guidedPrompt.inputKind === "date"
                      ? "date"
                      : guidedPrompt.inputKind === "number"
                        ? "number"
                        : "text"
                  }
                  inputMode={
                    guidedPrompt.inputKind === "number" ? "decimal" : undefined
                  }
                  min={guidedPrompt.inputKind === "number" ? 0 : undefined}
                  max={guidedPrompt.inputKind === "number" ? 100 : undefined}
                  step={guidedPrompt.inputKind === "number" ? "1" : undefined}
                  value={textValue}
                  onChange={(event) => setTextValue(event.target.value)}
                  disabled={busy}
                  placeholder={
                    guidedPrompt.inputKind === "number"
                      ? "e.g. 25"
                      : "Type your answer…"
                  }
                  className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none ring-canopy/30 focus:ring-2"
                />
              )}
              <button
                type="submit"
                disabled={busy}
                className="min-h-12 self-end rounded-xl bg-leaf px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Send
              </button>
            </form>
          ) : null}

          {step === "photos" && cropCase && farmer ? (
            <CasePhotoUploader
              caseId={cropCase.id}
              farmerId={farmer.id}
              onCompleted={handlePhotosCompleted}
            />
          ) : null}

          {step === "completed" ? (
            <div className="grid grid-cols-1 gap-2">
              <Button href="/dashboard">Back to dashboard</Button>
              <Button
                href={`/upload?caseId=${cropCase?.id ?? ""}`}
                variant="secondary"
              >
                Review photographs
              </Button>
            </div>
          ) : null}
        </div>

        <div className="-mx-4 mt-2">
          <BottomNav active="/crop-check" />
        </div>
      </div>
    </AppShell>
  );
}
