import { mapAssessmentRow, ASSESSMENT_SELECT } from "@/lib/assessment/map";
import type { UrgencyLevel } from "@/lib/assessment/types";
import type { StaffAssessmentView } from "./types";

export const STAFF_ASSESSMENT_SELECT = `${ASSESSMENT_SELECT}, staff_status, approved_by_staff_id, approved_at, staff_case_summary, staff_likely_causes, staff_immediate_actions, staff_missing_information, staff_urgency_level, staff_edit_notes`;

type StaffAssessmentRow = Parameters<typeof mapAssessmentRow>[0] & {
  staff_status?: string | null;
  approved_at?: string | null;
  staff_case_summary?: string | null;
  staff_likely_causes?: unknown;
  staff_immediate_actions?: unknown;
  staff_missing_information?: unknown;
  staff_urgency_level?: string | null;
  staff_edit_notes?: string | null;
};

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((item): item is string => typeof item === "string");
  return items;
}

function asUrgency(value: string | null | undefined): UrgencyLevel | null {
  if (
    value === "low" ||
    value === "moderate" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }
  return null;
}

export function mapStaffAssessmentRow(
  row: StaffAssessmentRow,
): StaffAssessmentView {
  const base = mapAssessmentRow(row);
  const staffStatus =
    row.staff_status === "approved" ||
    row.staff_status === "edited" ||
    row.staff_status === "rejected"
      ? row.staff_status
      : "pending";

  const staffLikelyCauses = asStringArray(row.staff_likely_causes);
  const staffImmediateActions = asStringArray(row.staff_immediate_actions);
  const staffMissingInformation = asStringArray(row.staff_missing_information);
  const staffUrgencyLevel = asUrgency(row.staff_urgency_level);

  const staffCaseSummary = row.staff_case_summary?.trim() || null;

  return {
    ...base,
    staffStatus,
    staffCaseSummary,
    staffLikelyCauses,
    staffImmediateActions,
    staffMissingInformation,
    staffUrgencyLevel,
    staffEditNotes: row.staff_edit_notes ?? null,
    approvedAt: row.approved_at ?? null,
    effectiveSummary: staffCaseSummary ?? base.caseSummary,
    effectiveLikelyCauses: staffLikelyCauses ?? base.likelyCauses,
    effectiveImmediateActions:
      staffImmediateActions ?? base.immediateSafeActions,
    effectiveMissingInformation:
      staffMissingInformation ?? base.missingInformation,
    effectiveUrgencyLevel: staffUrgencyLevel ?? base.urgencyLevel,
  };
}
