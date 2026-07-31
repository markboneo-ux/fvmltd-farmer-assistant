import type { AssessmentRecord, UrgencyLevel } from "@/lib/assessment/types";
import type { CasePhotoRecord } from "@/lib/crop-check/photos";
import type { CropCaseRecord } from "@/lib/crop-check/types";

export type StaffRole = "admin" | "agronomist" | "reviewer";

export type StaffUser = {
  id: string;
  authUserId: string;
  fullName: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
};

export type StaffCaseFilter = "new" | "urgent" | "in_review" | "all";

export type StaffQueueCase = {
  id: string;
  cropName: string;
  variety: string | null;
  status: CropCaseRecord["status"] | "awaiting_info";
  isUrgent: boolean;
  awaitingFarmerReply: boolean;
  percentAffected: number | null;
  submittedAt: string;
  completedAt: string | null;
  farmerName: string;
  farmerCode: string;
  farmerPhone: string | null;
  village: string | null;
  district: string | null;
  country: string | null;
  confidenceScore: number | null;
  urgencyLevel: UrgencyLevel | null;
  humanReviewRequired: boolean;
  guidanceMode: AssessmentRecord["guidanceMode"] | null;
  missingInformationCount: number;
  aiFlag: string;
};

export type StaffQueueStats = {
  newCount: number;
  urgentCount: number;
  inReviewCount: number;
};

export type SoilTestRecord = {
  id: string;
  sampledAt: string;
  labName: string | null;
  ph: number | null;
  electricalConductivity: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  organicMatterPct: number | null;
  moisturePct: number | null;
  notes: string | null;
};

export type CaseMessageRecord = {
  id: string;
  authorType: "staff" | "farmer" | "system";
  staffUserId: string | null;
  body: string;
  requiresReply: boolean;
  answeredAt: string | null;
  createdAt: string;
};

export type LabTestRequestRecord = {
  id: string;
  requestType: string;
  status: string;
  notes: string | null;
  createdAt: string;
  dueAt: string | null;
};

export type StaffAssessmentView = AssessmentRecord & {
  staffStatus: "pending" | "approved" | "edited" | "rejected";
  staffCaseSummary: string | null;
  staffLikelyCauses: string[] | null;
  staffImmediateActions: string[] | null;
  staffMissingInformation: string[] | null;
  staffUrgencyLevel: UrgencyLevel | null;
  staffEditNotes: string | null;
  approvedAt: string | null;
  /** Effective fields after staff edits (staff override when present). */
  effectiveSummary: string;
  effectiveLikelyCauses: string[];
  effectiveImmediateActions: string[];
  effectiveMissingInformation: string[];
  effectiveUrgencyLevel: UrgencyLevel;
};

export type StaffCaseDetail = {
  case: CropCaseRecord & {
    isUrgent: boolean;
    awaitingFarmerReply: boolean;
    staffNotes: string | null;
    closedReason: string | null;
    reviewedAt: string | null;
    submittedAt: string;
    severity: string | null;
  };
  farmer: {
    id: string;
    farmerCode: string;
    fullName: string;
    phone: string | null;
    village: string | null;
    region: string | null;
    country: string | null;
    farmSize: number | null;
    farmSizeUnit: string | null;
    mainCrops: string[];
  };
  farm: {
    id: string;
    name: string;
    locationDescription: string | null;
    village: string | null;
    district: string | null;
    region: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    waterSource: string | null;
    drainageCondition: string | null;
    growingSystem: string | null;
  } | null;
  cropCycle: {
    id: string;
    cropName: string;
    variety: string | null;
    plantingDate: string | null;
    growthStage: string | null;
    growingEnvironment: string | null;
    previousCrop: string | null;
    areaPlanted: number | null;
    areaUnit: string | null;
  } | null;
  photos: CasePhotoRecord[];
  soilTests: SoilTestRecord[];
  assessment: StaffAssessmentView | null;
  messages: CaseMessageRecord[];
  labRequests: LabTestRequestRecord[];
};
