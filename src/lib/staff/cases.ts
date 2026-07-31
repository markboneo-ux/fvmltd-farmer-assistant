import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CASE_PHOTO_SELECT, mapCasePhotoRow } from "@/lib/crop-check/photoMap";
import { CASE_PHOTO_BUCKET } from "@/lib/crop-check/photos";
import { CROP_CASE_SELECT, mapCropCaseRow } from "@/lib/crop-check/map";
import type { CropCaseRecord } from "@/lib/crop-check/types";
import { STAFF_ASSESSMENT_SELECT, mapStaffAssessmentRow } from "./assessmentMap";
import type {
  CaseMessageRecord,
  LabTestRequestRecord,
  SoilTestRecord,
  StaffCaseDetail,
  StaffCaseFilter,
  StaffQueueCase,
  StaffQueueStats,
} from "./types";

const QUEUE_CASE_SELECT = `
  id,
  crop_name,
  status,
  is_urgent,
  awaiting_farmer_reply,
  percent_affected,
  submitted_at,
  completed_at,
  farmers!inner (
    full_name,
    farmer_code,
    phone,
    village,
    region,
    country
  ),
  farms (
    village,
    district,
    region,
    country
  ),
  crop_cycles (
    variety
  ),
  ai_assessments (
    confidence_score,
    confidence,
    urgency_level,
    human_review_required,
    missing_information,
    raw_response,
    assessed_at
  )
`;

type NestedFarmer = {
  full_name: string;
  farmer_code: string;
  phone: string | null;
  village: string | null;
  region: string | null;
  country: string | null;
};

type NestedFarm = {
  village: string | null;
  district: string | null;
  region: string | null;
  country: string | null;
} | null;

type NestedCycle = { variety: string | null } | null;

type NestedAssessment = {
  confidence_score: number | string | null;
  confidence: number | string | null;
  urgency_level: string | null;
  human_review_required: boolean | null;
  missing_information: unknown;
  raw_response: unknown;
  assessed_at: string;
};

type QueueRow = {
  id: string;
  crop_name: string;
  status: string;
  is_urgent: boolean | null;
  awaiting_farmer_reply: boolean | null;
  percent_affected: number | string | null;
  submitted_at: string;
  completed_at: string | null;
  farmers: NestedFarmer | NestedFarmer[];
  farms: NestedFarm | NestedFarm[];
  crop_cycles: NestedCycle | NestedCycle[];
  ai_assessments: NestedAssessment[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function guidanceFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const mode = (raw as Record<string, unknown>).guidance_mode;
  return typeof mode === "string" ? mode : null;
}

function latestAssessment(
  assessments: NestedAssessment[] | null,
): NestedAssessment | null {
  if (!assessments?.length) return null;
  return [...assessments].sort((a, b) =>
    b.assessed_at.localeCompare(a.assessed_at),
  )[0];
}

function mapQueueRow(row: QueueRow): StaffQueueCase {
  const farmer = one(row.farmers)!;
  const farm = one(row.farms);
  const cycle = one(row.crop_cycles);
  const assessment = latestAssessment(row.ai_assessments);
  const confidence = Number(
    assessment?.confidence_score ?? assessment?.confidence ?? NaN,
  );
  const missing = asStringArray(assessment?.missing_information);
  const guidance = guidanceFromRaw(assessment?.raw_response);
  const urgency = assessment?.urgency_level ?? null;
  const humanReview = Boolean(assessment?.human_review_required);
  const isUrgent =
    Boolean(row.is_urgent) ||
    urgency === "high" ||
    urgency === "critical";

  let aiFlag = "Awaiting assessment";
  if (assessment) {
    if (humanReview || guidance === "human_review") {
      aiFlag = "Needs human review";
    } else if (guidance === "needs_more_info") {
      aiFlag = "Needs more information";
    } else {
      aiFlag = "Preliminary guidance ready";
    }
  }

  return {
    id: row.id,
    cropName: row.crop_name,
    variety: cycle?.variety ?? null,
    status: row.status as StaffQueueCase["status"],
    isUrgent,
    awaitingFarmerReply: Boolean(row.awaiting_farmer_reply),
    percentAffected:
      row.percent_affected == null ? null : Number(row.percent_affected),
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    farmerName: farmer.full_name,
    farmerCode: farmer.farmer_code,
    farmerPhone: farmer.phone,
    village: farm?.village ?? farmer.village,
    district: farm?.district ?? farm?.region ?? farmer.region,
    country: farm?.country ?? farmer.country,
    confidenceScore: Number.isFinite(confidence) ? confidence : null,
    urgencyLevel:
      urgency === "low" ||
      urgency === "moderate" ||
      urgency === "high" ||
      urgency === "critical"
        ? urgency
        : null,
    humanReviewRequired: humanReview,
    guidanceMode:
      guidance === "approved_guidance" ||
      guidance === "needs_more_info" ||
      guidance === "human_review"
        ? guidance
        : null,
    missingInformationCount: missing.length,
    aiFlag,
  };
}

function isClosedStatus(status: StaffQueueCase["status"]) {
  return status === "draft" || status === "closed" || status === "resolved";
}

function matchesFilter(item: StaffQueueCase, filter: StaffCaseFilter): boolean {
  if (isClosedStatus(item.status)) {
    return false;
  }

  switch (filter) {
    case "new":
      return item.status === "open";
    case "urgent":
      return item.isUrgent;
    case "in_review":
      return item.status === "in_review" || item.status === "awaiting_info";
    case "all":
      return true;
    default:
      return true;
  }
}

export async function listStaffQueueCases(
  client: SupabaseClient,
  filter: StaffCaseFilter = "in_review",
): Promise<{ cases: StaffQueueCase[]; stats: StaffQueueStats }> {
  const { data, error } = await client
    .from("crop_cases")
    .select(QUEUE_CASE_SELECT)
    .neq("status", "draft")
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Staff queue list failed:", error);
    throw new Error("Could not load the staff review queue.");
  }

  const all = ((data ?? []) as unknown as QueueRow[]).map(mapQueueRow);
  const active = all.filter(
    (item) => item.status !== "closed" && item.status !== "resolved",
  );

  const stats: StaffQueueStats = {
    newCount: active.filter((item) => item.status === "open").length,
    urgentCount: active.filter((item) => item.isUrgent).length,
    inReviewCount: active.filter(
      (item) => item.status === "in_review" || item.status === "awaiting_info",
    ).length,
  };

  const cases = all.filter((item) => matchesFilter(item, filter));
  return { cases, stats };
}

async function withPreviewUrls(
  client: SupabaseClient,
  rows: Parameters<typeof mapCasePhotoRow>[0][],
) {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.storage_path || row.is_skipped) {
        return mapCasePhotoRow(row, null);
      }
      const { data } = await client.storage
        .from(row.storage_bucket ?? CASE_PHOTO_BUCKET)
        .createSignedUrl(row.storage_path, 60 * 60);
      return mapCasePhotoRow(row, data?.signedUrl ?? null);
    }),
  );
}

function mapSoilRow(row: {
  id: string;
  sampled_at: string;
  lab_name: string | null;
  ph: number | string | null;
  electrical_conductivity: number | string | null;
  nitrogen: number | string | null;
  phosphorus: number | string | null;
  potassium: number | string | null;
  organic_matter_pct: number | string | null;
  moisture_pct: number | string | null;
  notes: string | null;
}): SoilTestRecord {
  const num = (value: number | string | null) =>
    value == null ? null : Number(value);
  return {
    id: row.id,
    sampledAt: row.sampled_at,
    labName: row.lab_name,
    ph: num(row.ph),
    electricalConductivity: num(row.electrical_conductivity),
    nitrogen: num(row.nitrogen),
    phosphorus: num(row.phosphorus),
    potassium: num(row.potassium),
    organicMatterPct: num(row.organic_matter_pct),
    moisturePct: num(row.moisture_pct),
    notes: row.notes,
  };
}

export async function getStaffCaseDetail(
  client: SupabaseClient,
  caseId: string,
): Promise<StaffCaseDetail | null> {
  const staffCaseSelect = `${CROP_CASE_SELECT}, is_urgent, awaiting_farmer_reply, staff_notes, closed_reason, reviewed_at, submitted_at, severity`;

  const { data: cropCase, error } = await client
    .from("crop_cases")
    .select(staffCaseSelect)
    .eq("id", caseId)
    .maybeSingle();

  if (error) {
    console.error("Staff case load failed:", error);
    throw new Error("Could not load the crop case.");
  }
  if (!cropCase) return null;

  const base = mapCropCaseRow(cropCase as Parameters<typeof mapCropCaseRow>[0]);
  const caseRecord: StaffCaseDetail["case"] = {
    ...base,
    status: cropCase.status as CropCaseRecord["status"],
    isUrgent: Boolean(cropCase.is_urgent),
    awaitingFarmerReply: Boolean(cropCase.awaiting_farmer_reply),
    staffNotes: cropCase.staff_notes ?? null,
    closedReason: cropCase.closed_reason ?? null,
    reviewedAt: cropCase.reviewed_at ?? null,
    submittedAt: cropCase.submitted_at,
    severity: cropCase.severity ?? null,
  };

  const [
    farmerRes,
    farmRes,
    cycleRes,
    photosRes,
    soilRes,
    assessmentRes,
    messagesRes,
    labRes,
  ] = await Promise.all([
    client
      .from("farmers")
      .select(
        "id, farmer_code, full_name, phone, village, region, country, farm_size, farm_size_unit, main_crops",
      )
      .eq("id", cropCase.farmer_id)
      .maybeSingle(),
    client
      .from("farms")
      .select(
        "id, name, location_description, village, district, region, country, latitude, longitude, water_source, drainage_condition, growing_system",
      )
      .eq("id", cropCase.farm_id)
      .maybeSingle(),
    cropCase.crop_cycle_id
      ? client
          .from("crop_cycles")
          .select(
            "id, crop_name, variety, planting_date, growth_stage, growing_environment, previous_crop, area_planted, area_unit",
          )
          .eq("id", cropCase.crop_cycle_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from("case_photos")
      .select(CASE_PHOTO_SELECT)
      .eq("crop_case_id", caseId)
      .order("sort_order", { ascending: true }),
    client
      .from("soil_tests")
      .select(
        "id, sampled_at, lab_name, ph, electrical_conductivity, nitrogen, phosphorus, potassium, organic_matter_pct, moisture_pct, notes",
      )
      .eq("farm_id", cropCase.farm_id)
      .order("sampled_at", { ascending: false })
      .limit(10),
    client
      .from("ai_assessments")
      .select(STAFF_ASSESSMENT_SELECT)
      .eq("crop_case_id", caseId)
      .order("assessed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("case_messages")
      .select(
        "id, author_type, staff_user_id, body, requires_reply, answered_at, created_at",
      )
      .eq("crop_case_id", caseId)
      .order("created_at", { ascending: true }),
    client
      .from("lab_test_requests")
      .select("id, request_type, status, notes, created_at, due_at")
      .eq("crop_case_id", caseId)
      .order("created_at", { ascending: false }),
  ]);

  if (!farmerRes.data) {
    throw new Error("Farmer record missing for this case.");
  }

  const photos = await withPreviewUrls(client, photosRes.data ?? []);

  const messages: CaseMessageRecord[] = (messagesRes.data ?? []).map(
    (row) => ({
      id: row.id,
      authorType: row.author_type as CaseMessageRecord["authorType"],
      staffUserId: row.staff_user_id,
      body: row.body,
      requiresReply: row.requires_reply,
      answeredAt: row.answered_at,
      createdAt: row.created_at,
    }),
  );

  const labRequests: LabTestRequestRecord[] = (labRes.data ?? []).map(
    (row) => ({
      id: row.id,
      requestType: row.request_type,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      dueAt: row.due_at,
    }),
  );

  const farm = farmRes.data;
  const cycle = cycleRes.data;

  return {
    case: caseRecord,
    farmer: {
      id: farmerRes.data.id,
      farmerCode: farmerRes.data.farmer_code,
      fullName: farmerRes.data.full_name,
      phone: farmerRes.data.phone,
      village: farmerRes.data.village,
      region: farmerRes.data.region,
      country: farmerRes.data.country,
      farmSize:
        farmerRes.data.farm_size == null
          ? null
          : Number(farmerRes.data.farm_size),
      farmSizeUnit: farmerRes.data.farm_size_unit,
      mainCrops: asStringArray(farmerRes.data.main_crops),
    },
    farm: farm
      ? {
          id: farm.id,
          name: farm.name,
          locationDescription: farm.location_description,
          village: farm.village,
          district: farm.district,
          region: farm.region,
          country: farm.country,
          latitude: farm.latitude == null ? null : Number(farm.latitude),
          longitude: farm.longitude == null ? null : Number(farm.longitude),
          waterSource: farm.water_source,
          drainageCondition: farm.drainage_condition,
          growingSystem: farm.growing_system,
        }
      : null,
    cropCycle: cycle
      ? {
          id: cycle.id,
          cropName: cycle.crop_name,
          variety: cycle.variety,
          plantingDate: cycle.planting_date,
          growthStage: cycle.growth_stage,
          growingEnvironment: cycle.growing_environment,
          previousCrop: cycle.previous_crop,
          areaPlanted:
            cycle.area_planted == null ? null : Number(cycle.area_planted),
          areaUnit: cycle.area_unit,
        }
      : null,
    photos,
    soilTests: (soilRes.data ?? []).map(mapSoilRow),
    assessment: assessmentRes.data
      ? mapStaffAssessmentRow(assessmentRes.data)
      : null,
    messages,
    labRequests,
  };
}
