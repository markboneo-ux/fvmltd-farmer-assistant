import "server-only";

import { getMissingSupabaseEnv } from "@/lib/supabase/env";
import type { AgronomyCaseRecord } from "./types";
import {
  appendCaseMessage,
  recordCaseOutcome,
  recordCaseReview,
  upsertAgronomyCase,
} from "./store";

function canUseSupabase(): boolean {
  return getMissingSupabaseEnv({ requireServiceRole: true }).length === 0;
}

async function tryAdmin() {
  if (!canUseSupabase()) return null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return createAdminClient();
  } catch (error) {
    console.error("[agronomy-memory] supabase client unavailable", error);
    return null;
  }
}

function toRow(record: AgronomyCaseRecord) {
  return {
    id: record.id,
    farmer_id: record.farmerId,
    session_id: record.sessionId,
    country: record.country,
    district: record.district,
    farm: record.farm,
    crop: record.crop,
    variety: record.variety,
    plant_age: record.plantAge,
    production_system: record.productionSystem,
    farmer_scale: record.farmerScale,
    area_planted: record.areaPlanted,
    problem_reported: record.problemReported,
    symptoms: record.symptoms,
    field_distribution: record.fieldDistribution,
    photo_count: record.photoCount,
    soil_or_medium: record.soilOrMedium,
    irrigation: record.irrigation,
    drainage: record.drainage,
    fertilizer_history: record.fertilizerHistory,
    crop_protection_history: record.cropProtectionHistory,
    weather_conditions: record.weatherConditions,
    suspected_causes: record.suspectedCauses,
    confidence: record.confidence,
    actions_recommended: record.actionsRecommended,
    actions_actually_taken: record.actionsActuallyTaken,
    follow_up_result: record.followUpResult,
    crop_outcome: record.cropOutcome,
    confirmed_diagnosis: record.confirmedDiagnosis,
    yield_impact: record.yieldImpact,
    follow_up_due_at: record.followUpDueAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export async function persistAgronomyCase(
  input: Parameters<typeof upsertAgronomyCase>[0],
): Promise<AgronomyCaseRecord> {
  const record = upsertAgronomyCase(input);
  const admin = await tryAdmin();
  if (!admin) return record;

  const { error } = await admin.from("agronomy_cases").upsert(toRow(record));
  if (error) {
    console.error("[agronomy-memory] case upsert failed", error.message);
  }
  return record;
}

export async function persistCaseMessage(input: {
  caseId: string;
  role: "user" | "assistant";
  content: string;
}) {
  const row = appendCaseMessage(input);
  const admin = await tryAdmin();
  if (!admin) return row;

  const { error } = await admin.from("agronomy_case_messages").insert({
    id: row.id,
    case_id: row.caseId,
    role: row.role,
    content: row.content,
    created_at: row.createdAt,
  });
  if (error) {
    console.error("[agronomy-memory] message insert failed", error.message);
  }
  return row;
}

export async function persistCaseOutcome(
  input: Parameters<typeof recordCaseOutcome>[0],
) {
  const row = recordCaseOutcome(input);
  const admin = await tryAdmin();
  if (!admin) return row;

  const { error } = await admin.from("agronomy_case_outcomes").insert({
    id: row.id,
    case_id: row.caseId,
    crop_outcome: row.cropOutcome,
    actions_taken: row.actionsTaken,
    days_after_recommendation: row.daysAfterRecommendation,
    created_at: row.createdAt,
  });
  if (error) {
    console.error("[agronomy-memory] outcome insert failed", error.message);
  }
  return row;
}

export async function persistCaseReview(
  input: Parameters<typeof recordCaseReview>[0],
) {
  const row = recordCaseReview(input);
  const admin = await tryAdmin();
  if (!admin) return row;

  const { error } = await admin.from("agronomy_case_reviews").insert({
    id: row.id,
    case_id: row.caseId,
    staff_profile_id: row.staffProfileId,
    verdict: row.verdict,
    confirmed_diagnosis: row.confirmedDiagnosis,
    recommended_correction: row.recommendedCorrection,
    requires_lab_confirmation: row.requiresLabConfirmation,
    created_at: row.createdAt,
  });
  if (error) {
    console.error("[agronomy-memory] review insert failed", error.message);
  }
  return row;
}
