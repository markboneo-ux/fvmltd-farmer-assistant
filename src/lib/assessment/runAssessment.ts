import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { getOpenAIModel } from "@/lib/openai/env";
import { tryCreateOpenAIClient } from "@/lib/openai/client";
import { buildCaseContextForModel } from "./buildCaseContext";
import { mapAssessmentRow } from "./map";
import { parseAssessmentJson } from "./parse";
import { applySafetyRules } from "./safetyRules";
import {
  ASSESSMENT_JSON_SCHEMA,
  type AssessmentRecord,
  type PreliminaryAssessmentJson,
} from "./types";

const SYSTEM_PROMPT = `You are FVMLTD's preliminary crop assessment assistant for tropical smallholder farmers.

You produce a cautious, preliminary assessment only — not a final diagnosis.

Hard rules:
1. Never invent pesticide brand names, active ingredients with rates, or product SKUs.
2. Never provide unrestricted pesticide application rates (e.g. ml/L, kg/ha, spray schedules with chemicals).
3. Set product_recommendation_allowed to false always in this preliminary stage. Product advice requires human FVMLTD staff and an approved catalog product.
4. immediate_safe_actions may only include cultural, sanitation, monitoring, irrigation/drainage adjustments, isolation of affected plants, or waiting for staff/lab guidance — no chemical recipes.
5. Prefer human_review_required=true when photos are incomplete, confidence is modest, or symptoms could be several diseases/pests.
6. Use the photographs when present. If photos are missing, say so in missing_information.
7. Be practical for smallholder tropical farms (Tomato, Pepper, Cucumber and related crops).
8. Populate safety_signals honestly:
   - plants_dying_quickly
   - unknown_products_mixed
   - herbicide_damage_suspected
   - multiple_unsuccessful_treatments
   - severe_bacterial_or_viral_suspected
   - approved_protocol_exists (false when no FVMLTD-approved protocol clearly applies)
9. Return ONLY JSON matching the required schema.`;

export type RunAssessmentResult =
  | { ok: true; assessment: AssessmentRecord; created: boolean }
  | { ok: false; error: string; status: number };

export async function runPreliminaryAssessment(options: {
  client: SupabaseClient;
  caseId: string;
  farmerId: string;
  force?: boolean;
}): Promise<RunAssessmentResult> {
  const { client, caseId, farmerId, force = false } = options;

  if (!force) {
    const { data: existing, error: existingError } = await client.rpc(
      "get_assessment_for_farmer",
      {
        p_farmer_id: farmerId,
        p_check_id: caseId,
      },
    );

    if (existingError) {
      return {
        ok: false,
        error: existingError.message || "Could not load assessment.",
        status: 500,
      };
    }

    if (existing) {
      return {
        ok: true,
        assessment: mapAssessmentRow(existing),
        created: false,
      };
    }
  }

  const openai = tryCreateOpenAIClient();
  if (!openai.ok) {
    return { ok: false, error: openai.error, status: 503 };
  }

  let context;
  try {
    context = await buildCaseContextForModel(client, caseId, farmerId);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load case.",
      status: 404,
    };
  }

  const userContent: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Assess this crop case and return structured JSON.\n\nCase data:\n${JSON.stringify(context.textPayload, null, 2)}\n\nPhotographs attached: ${context.photos.length}. Each image is labeled by slot.`,
    },
  ];

  for (const photo of context.photos) {
    userContent.push({
      type: "text",
      text: `Photograph slot: ${photo.label} (${photo.slotKey})`,
    });
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${photo.mimeType};base64,${photo.base64}`,
      },
    });
  }

  const model = getOpenAIModel();

  let parsed: PreliminaryAssessmentJson;
  let rawContent: string;

  try {
    const completion = await openai.client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "preliminary_crop_assessment",
          strict: true,
          schema: ASSESSMENT_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    rawContent = completion.choices[0]?.message?.content ?? "";
    if (!rawContent) {
      return {
        ok: false,
        error: "OpenAI returned an empty assessment.",
        status: 502,
      };
    }

    parsed = parseAssessmentJson(JSON.parse(rawContent));
  } catch (error) {
    console.error("OpenAI assessment failed:", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "OpenAI assessment request failed.",
      status: 502,
    };
  }

  const payload = context.textPayload;
  const safety = applySafetyRules(parsed, {
    percentAffected:
      typeof payload.affected_area_percent === "number"
        ? payload.affected_area_percent
        : payload.affected_area_percent != null
          ? Number(payload.affected_area_percent)
          : null,
    problemDescription:
      typeof payload.problem_description === "string"
        ? payload.problem_description
        : null,
    fertilizerHistory:
      typeof payload.fertilizer_history === "string"
        ? payload.fertilizer_history
        : null,
    sprayHistory:
      typeof payload.spray_history === "string" ? payload.spray_history : null,
    likelyCauses: parsed.likely_causes,
    caseSummary: parsed.case_summary,
    urgencyLevel: parsed.urgency_level,
    approvedProtocolExists: parsed.safety_signals.approved_protocol_exists,
    plantsDyingQuickly: parsed.safety_signals.plants_dying_quickly,
    unknownProductsMixed: parsed.safety_signals.unknown_products_mixed,
    herbicideDamageSuspected: parsed.safety_signals.herbicide_damage_suspected,
    multipleUnsuccessfulTreatments:
      parsed.safety_signals.multiple_unsuccessful_treatments,
    severeBacterialOrViralSuspected:
      parsed.safety_signals.severe_bacterial_or_viral_suspected,
  });

  const likelyIssue = parsed.likely_causes[0] ?? "Undetermined";
  const nextStep =
    safety.guidanceMode === "human_review"
      ? "Case sent for FVMLTD human technical review. Do not use a final product recommendation yet."
      : safety.guidanceMode === "needs_more_info"
        ? "Confidence is moderate — provide missing information or additional photographs before relying on this guidance."
        : "Approved preliminary guidance may be shown. Continue monitoring and follow immediate safe actions.";

  const rawResponse = {
    ...parsed,
    missing_information: safety.missingInformation,
    immediate_safe_actions: safety.immediateSafeActions,
    human_review_required: safety.humanReviewRequired,
    product_recommendation_allowed: safety.productRecommendationAllowed,
    confidence_band: safety.confidenceBand,
    guidance_mode: safety.guidanceMode,
    human_review_reasons: safety.humanReviewReasons,
  };

  const reasonSummary =
    safety.humanReviewReasons.slice(0, 3).join(" ") ||
    "Automatic safety rules require technical review.";

  const { data: saved, error: saveError } = await client.rpc(
    "upsert_assessment_for_farmer",
    {
      p_farmer_id: farmerId,
      p_check_id: caseId,
      p_payload: {
        model_name: model,
        case_summary: parsed.case_summary,
        summary: parsed.case_summary,
        likely_causes: parsed.likely_causes,
        likely_issue: likelyIssue,
        confidence_score: parsed.confidence_score,
        confidence: parsed.confidence_score,
        missing_information: safety.missingInformation,
        immediate_safe_actions: safety.immediateSafeActions,
        human_review_required: safety.humanReviewRequired,
        laboratory_test_needed: parsed.laboratory_test_needed,
        product_recommendation_allowed: safety.productRecommendationAllowed,
        urgency_level: parsed.urgency_level,
        severity: parsed.urgency_level,
        next_step: nextStep,
        raw_response: rawResponse,
        assessed_at: new Date().toISOString(),
        review_status: "pending",
        staff_status: "pending",
        follow_up_notes: reasonSummary,
      },
    },
  );

  if (saveError || !saved) {
    console.error("Save assessment_results failed:", saveError);
    return {
      ok: false,
      error: "Assessment succeeded but could not be saved.",
      status: 500,
    };
  }

  return {
    ok: true,
    assessment: mapAssessmentRow(saved),
    created: true,
  };
}
