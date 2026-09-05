import type {
  CaseActionRecord,
  CaseAssessmentRecord,
  CaseFollowupRecord,
  CaseMessageRecord,
  CaseObservationRecord,
  CaseOutcomeRecord,
  CasePhotoRecord,
  CropCaseRecord,
} from "./types";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function cropCaseToRow(record: CropCaseRecord): Record<string, unknown> {
  return {
    id: record.id,
    user_id: record.userId,
    anonymous_session_id: record.anonymousSessionId,
    access_state: record.accessState,
    country: record.country,
    district: record.district,
    farm: record.farm,
    crop: record.crop,
    variety: record.variety,
    plant_age: record.plantAge,
    production_system: record.productionSystem,
    home_or_commercial: record.homeOrCommercial,
    user_level: record.userLevel,
    area: record.area,
    farmer_problem_text: record.farmerProblemText,
    problem_category: record.problemCategory,
    symptoms: record.symptoms,
    field_distribution: record.fieldDistribution,
    soil_or_medium: record.soilOrMedium,
    irrigation: record.irrigation,
    drainage: record.drainage,
    fertilizer_history: record.fertilizerHistory,
    chemical_history: record.chemicalHistory,
    recent_weather: record.recentWeather,
    weather_risk: record.weatherRisk,
    possible_causes: record.possibleCauses,
    confidence: record.confidence,
    severity: record.severity,
    recommended_actions: record.recommendedActions,
    products_requested: record.productsRequested,
    verified_products_shown: record.verifiedProductsShown,
    human_escalation: record.humanEscalation,
    agronomist_reviewed: record.agronomistReviewed,
    diagnosis_confirmed: record.diagnosisConfirmed,
    diagnosis_incorrect: record.diagnosisIncorrect,
    needs_review: record.needsReview,
    include_in_trend_learning: record.includeInTrendLearning,
    case_status: record.caseStatus,
    conversation_intent: record.conversationIntent,
    question_category: record.questionCategory,
    calculation_type: record.calculationType,
    case_type: record.caseType,
    knowledge_state: record.knowledgeState,
    business_metadata: record.businessMetadata,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function rowToCropCase(row: Record<string, unknown>): CropCaseRecord {
  return {
    id: asString(row.id),
    userId: asNullableString(row.user_id),
    anonymousSessionId: asNullableString(row.anonymous_session_id),
    accessState: (asString(row.access_state) || "guest") as CropCaseRecord["accessState"],
    country: asNullableString(row.country),
    district: asNullableString(row.district),
    farm: asNullableString(row.farm),
    crop: asNullableString(row.crop),
    variety: asNullableString(row.variety),
    plantAge: asNullableString(row.plant_age),
    productionSystem: asNullableString(row.production_system),
    homeOrCommercial: (asString(row.home_or_commercial) ||
      "unknown") as CropCaseRecord["homeOrCommercial"],
    userLevel: (asNullableString(row.user_level) as CropCaseRecord["userLevel"]) ?? null,
    area: asNullableString(row.area),
    farmerProblemText: asString(row.farmer_problem_text),
    problemCategory: asNullableString(row.problem_category),
    symptoms: asStringArray(row.symptoms),
    fieldDistribution: asNullableString(row.field_distribution),
    soilOrMedium: asNullableString(row.soil_or_medium),
    irrigation: asNullableString(row.irrigation),
    drainage: asNullableString(row.drainage),
    fertilizerHistory: asNullableString(row.fertilizer_history),
    chemicalHistory: asNullableString(row.chemical_history),
    recentWeather: asNullableString(row.recent_weather),
    weatherRisk: asNullableString(row.weather_risk),
    possibleCauses: asStringArray(row.possible_causes),
    confidence: (asString(row.confidence) || "unknown") as CropCaseRecord["confidence"],
    severity: (asString(row.severity) || "unknown") as CropCaseRecord["severity"],
    recommendedActions: asStringArray(row.recommended_actions),
    productsRequested: asBoolean(row.products_requested),
    verifiedProductsShown: asStringArray(row.verified_products_shown),
    humanEscalation: asBoolean(row.human_escalation),
    agronomistReviewed: asBoolean(row.agronomist_reviewed),
    diagnosisConfirmed: asBoolean(row.diagnosis_confirmed),
    diagnosisIncorrect: asBoolean(row.diagnosis_incorrect),
    needsReview: asBoolean(row.needs_review),
    includeInTrendLearning:
      row.include_in_trend_learning == null
        ? true
        : asBoolean(row.include_in_trend_learning, true),
    caseStatus: (asString(row.case_status) || "open") as CropCaseRecord["caseStatus"],
    conversationIntent:
      (asNullableString(row.conversation_intent) as CropCaseRecord["conversationIntent"]) ??
      null,
    questionCategory:
      (asNullableString(row.question_category) as CropCaseRecord["questionCategory"]) ??
      null,
    calculationType: asNullableString(row.calculation_type),
    caseType: (asNullableString(row.case_type) as CropCaseRecord["caseType"]) ?? null,
    knowledgeState:
      (asNullableString(row.knowledge_state) as CropCaseRecord["knowledgeState"]) ?? "raw",
    businessMetadata:
      row.business_metadata && typeof row.business_metadata === "object"
        ? (row.business_metadata as Record<string, unknown>)
        : null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export function messageToRow(record: CaseMessageRecord): Record<string, unknown> {
  return {
    id: record.id,
    case_id: record.caseId,
    role: record.role,
    content: record.content,
    has_images: record.hasImages,
    created_at: record.createdAt,
  };
}

export function rowToMessage(row: Record<string, unknown>): CaseMessageRecord {
  return {
    id: asString(row.id),
    caseId: asString(row.case_id),
    role: (asString(row.role) || "user") as CaseMessageRecord["role"],
    content: asString(row.content),
    hasImages: asBoolean(row.has_images),
    createdAt: asString(row.created_at),
  };
}

export function observationToRow(record: CaseObservationRecord): Record<string, unknown> {
  return {
    id: record.id,
    case_id: record.caseId,
    observed_facts: record.observedFacts,
    possible_causes: record.possibleCauses,
    confidence: record.confidence,
    next_check: record.nextCheck,
    recommended_action: record.recommendedAction,
    created_at: record.createdAt,
  };
}

export function rowToObservation(row: Record<string, unknown>): CaseObservationRecord {
  return {
    id: asString(row.id),
    caseId: asString(row.case_id),
    observedFacts: asStringArray(row.observed_facts),
    possibleCauses: asStringArray(row.possible_causes),
    confidence: (asString(row.confidence) || "unknown") as CaseObservationRecord["confidence"],
    nextCheck: asNullableString(row.next_check),
    recommendedAction: asNullableString(row.recommended_action),
    createdAt: asString(row.created_at),
  };
}

export function photoToRow(record: CasePhotoRecord): Record<string, unknown> {
  return {
    id: record.id,
    case_id: record.caseId,
    owner_user_id: record.ownerUserId,
    owner_session_id: record.ownerSessionId,
    storage_bucket: record.storageBucket,
    storage_path: record.storagePath,
    mime_type: record.mimeType,
    file_size_bytes: record.fileSizeBytes,
    created_at: record.createdAt,
  };
}

export function rowToPhoto(row: Record<string, unknown>): CasePhotoRecord {
  return {
    id: asString(row.id),
    caseId: asString(row.case_id),
    ownerUserId: asNullableString(row.owner_user_id),
    ownerSessionId: asNullableString(row.owner_session_id),
    storageBucket: asString(row.storage_bucket) || "case-photos",
    storagePath: asString(row.storage_path),
    mimeType: asString(row.mime_type),
    fileSizeBytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : 0,
    publicUrl: null,
    createdAt: asString(row.created_at),
  };
}

export function followupToRow(record: CaseFollowupRecord): Record<string, unknown> {
  return {
    id: record.id,
    case_id: record.caseId,
    user_id: record.userId,
    anonymous_session_id: record.anonymousSessionId,
    follow_up_date: record.followUpDate,
    asked_at: record.askedAt,
    outcome: record.outcome,
    action_taken: record.actionTaken,
    notes: record.notes,
    follow_up_photo_id: record.followUpPhotoId,
    new_severity: record.newSeverity,
    opted_out: record.optedOut,
    created_at: record.createdAt,
  };
}

export function rowToFollowup(row: Record<string, unknown>): CaseFollowupRecord {
  return {
    id: asString(row.id),
    caseId: asString(row.case_id),
    userId: asNullableString(row.user_id),
    anonymousSessionId: asNullableString(row.anonymous_session_id),
    followUpDate: asString(row.follow_up_date),
    askedAt: asNullableString(row.asked_at),
    outcome: (asNullableString(row.outcome) as CaseFollowupRecord["outcome"]) ?? null,
    actionTaken: asNullableString(row.action_taken),
    notes: asNullableString(row.notes),
    followUpPhotoId: asNullableString(row.follow_up_photo_id),
    newSeverity: (asNullableString(row.new_severity) as CaseFollowupRecord["newSeverity"]) ?? null,
    optedOut: asBoolean(row.opted_out),
    createdAt: asString(row.created_at),
  };
}

export function outcomeToRow(record: CaseOutcomeRecord): Record<string, unknown> {
  return {
    id: record.id,
    case_id: record.caseId,
    outcome: record.outcome,
    notes: record.notes,
    created_at: record.createdAt,
  };
}

export function rowToOutcome(row: Record<string, unknown>): CaseOutcomeRecord {
  return {
    id: asString(row.id),
    caseId: asString(row.case_id),
    outcome: asString(row.outcome) as CaseOutcomeRecord["outcome"],
    notes: asNullableString(row.notes),
    createdAt: asString(row.created_at),
  };
}

export function assessmentToRow(record: CaseAssessmentRecord): Record<string, unknown> {
  return {
    id: record.id,
    case_id: record.caseId,
    payload: record.payload,
    created_at: record.createdAt,
  };
}

export function rowToAssessment(row: Record<string, unknown>): CaseAssessmentRecord {
  return {
    id: asString(row.id),
    caseId: asString(row.case_id),
    payload: asRecord(row.payload),
    createdAt: asString(row.created_at),
  };
}

export function actionToRow(record: CaseActionRecord): Record<string, unknown> {
  return {
    id: record.id,
    case_id: record.caseId,
    action_text: record.actionText,
    created_at: record.createdAt,
  };
}

export function rowToAction(row: Record<string, unknown>): CaseActionRecord {
  return {
    id: asString(row.id),
    caseId: asString(row.case_id),
    actionText: asString(row.action_text),
    createdAt: asString(row.created_at),
  };
}
