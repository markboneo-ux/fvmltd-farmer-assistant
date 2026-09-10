import "server-only";

import type { AppIdentity } from "./identity";
import {
  accessTierLabel,
  canonicalAccess,
  farmerLevelLabel,
  getUsageLimits,
  limitsForAccess,
  type AccessTier,
  type UsageSnapshot,
} from "./limits";
import { loadUsageLimitOverlay } from "./app-settings";
import { evaluateConversationGate } from "./conversation";
import { lastKnownLocationForOwner } from "./conversation";
import { casesForOwner, listFollowups } from "@/lib/cases/store";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { getEntitlement } from "./entitlements";
import { ownerKey } from "./session";
import { followUpStatusLabel } from "@/lib/cases/followups";

export type FarmerAccountView = {
  email: string | null;
  country: string | null;
  region: string | null;
  farmerLevel: string | null;
  accessTier: AccessTier;
  accessLabel: string;
  remaining: UsageSnapshot;
  used: UsageSnapshot;
  promoStatus: string;
};

export type FarmerCaseListItem = {
  id: string;
  crop: string;
  date: string;
  issueSummary: string;
  status: string;
  followUpDue: string | null;
  solved: boolean;
};

export type FarmerFollowupListItem = {
  id: string;
  caseId: string;
  crop: string;
  dueDate: string;
  status: ReturnType<typeof followUpStatusLabel>;
};

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function buildFarmerAccountView(identity: AppIdentity): Promise<FarmerAccountView> {
  const overlay = await loadUsageLimitOverlay();
  const limits = getUsageLimits(overlay);
  const gate = await evaluateConversationGate({ identity, next: "message" });
  const remaining = "remaining" in gate ? gate.remaining : limitsForAccess(identity.access, limits);
  const location = await lastKnownLocationForOwner({
    userId: identity.authUserId,
    anonymousSessionId: identity.guestSessionId,
  });

  let country = location.country;
  let region = location.district;
  let farmerLevel: string | null = null;

  const owned = await casesForOwner({
    userId: identity.authUserId,
    anonymousSessionId: identity.guestSessionId,
  });
  const latestWithLevel = [...owned]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .find((item) => item.userLevel);
  if (latestWithLevel?.userLevel) {
    farmerLevel = farmerLevelLabel(latestWithLevel.userLevel);
  }

  if (identity.farmerProfileId) {
    const admin = tryCreateAdminClient();
    if (admin.ok) {
      const { data } = await admin.client
        .from("farmer_profiles")
        .select("country, region, district, farmer_level")
        .eq("id", identity.farmerProfileId)
        .maybeSingle();
      const row = data as {
        country?: string | null;
        region?: string | null;
        district?: string | null;
        farmer_level?: string | null;
      } | null;
      country = asTrimmed(row?.country) || country;
      region = asTrimmed(row?.district) || asTrimmed(row?.region) || region;
      farmerLevel = farmerLevelLabel(row?.farmer_level) || farmerLevel;
    }
  }

  const entitlement = getEntitlement(ownerKey(identity));
  const tier = canonicalAccess(identity.access);
  const promoStatus =
    tier === "FVM_BETA" || entitlement?.source === "promo"
      ? "FVM Beta Access active"
      : "None";

  return {
    email: identity.email,
    country,
    region,
    farmerLevel,
    accessTier: tier,
    accessLabel: accessTierLabel(identity.access),
    remaining,
    used: gate.used,
    promoStatus,
  };
}

function caseStatusLabel(status: string, solved: boolean): string {
  if (solved) return "solved";
  if (status === "resolved") return "solved";
  if (status === "human_review") return "in review";
  if (status === "awaiting_followup") return "follow-up due";
  if (status === "closed") return "unresolved";
  if (status === "in_progress") return "open";
  return status.replace(/_/g, " ") || "open";
}

export async function listFarmerCases(identity: AppIdentity): Promise<FarmerCaseListItem[]> {
  const owned = await casesForOwner({
    userId: identity.authUserId,
    anonymousSessionId: identity.guestSessionId,
  });
  const items: FarmerCaseListItem[] = [];
  for (const record of owned.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const followups = await listFollowups(record.id);
    const due = followups
      .filter((row) => !row.outcome && !row.optedOut)
      .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate))[0];
    const solved =
      record.caseStatus === "resolved" ||
      followups.some((row) => row.outcome === "problem_solved");
    items.push({
      id: record.id,
      crop: record.crop || "Crop",
      date: record.createdAt,
      issueSummary:
        record.farmerProblemText.trim().slice(0, 160) ||
        record.problemCategory?.replace(/_/g, " ") ||
        "Crop case",
      status: caseStatusLabel(record.caseStatus, solved),
      followUpDue: due?.followUpDate ?? null,
      solved,
    });
  }
  return items;
}

export async function listFarmerFollowups(identity: AppIdentity): Promise<FarmerFollowupListItem[]> {
  const owned = await casesForOwner({
    userId: identity.authUserId,
    anonymousSessionId: identity.guestSessionId,
  });
  const ownedById = new Map(owned.map((item) => [item.id, item]));
  const all = await listFollowups();
  return all
    .filter((row) => ownedById.has(row.caseId))
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate))
    .map((row) => ({
      id: row.id,
      caseId: row.caseId,
      crop: ownedById.get(row.caseId)?.crop || "Crop",
      dueDate: row.followUpDate,
      status: followUpStatusLabel({
        outcome: row.outcome,
        optedOut: row.optedOut,
        followUpDate: row.followUpDate,
        askedAt: row.askedAt,
      }),
    }));
}
