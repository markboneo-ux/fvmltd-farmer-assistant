/**
 * Block premature irreversible recommendations from vague symptoms.
 */

export type DestructiveCheck = {
  blocked: boolean;
  reasons: string[];
  farmerMessage: string | null;
};

const DESTRUCTIVE =
  /\b(dump|destroy|pull up|pull out|remove all|rip out|abandon (the )?(field|crop)|plough (in|under)|discard (the )?plants?)\b/i;

const MAJOR_CORRECTION =
  /\b(heavy (fertilizer|fertiliser) correction|replant the (whole )?(field|crop)|spray (the )?(whole|entire) (field|crop))\b/i;

const VAGUE_WILT = /\bwilt(ing|ed)?\b/i;

export function isDestructiveRecommendation(text: string): boolean {
  return DESTRUCTIVE.test(text) || MAJOR_CORRECTION.test(text);
}

export function shouldBlockDestructiveAction(options: {
  recommendation: string;
  observedFacts: string[];
  confidence: "low" | "medium" | "high" | "unknown";
  humanReviewed?: boolean;
  containmentJustified?: boolean;
}): DestructiveCheck {
  const text = [options.recommendation, ...options.observedFacts].join(" ");
  const destructive = isDestructiveRecommendation(options.recommendation);
  if (!destructive) {
    return { blocked: false, reasons: [], farmerMessage: null };
  }

  if (options.humanReviewed || options.containmentJustified || options.confidence === "high") {
    return { blocked: false, reasons: [], farmerMessage: null };
  }

  const wilt = VAGUE_WILT.test(text) && options.observedFacts.length < 3;
  return {
    blocked: true,
    reasons: wilt
      ? ["vague wilt", "irreversible action"]
      : ["insufficient evidence", "irreversible action"],
    farmerMessage: wilt
      ? "Bacterial wilt is one possibility, but other problems can cause similar wilting. Before removing plants, let’s check the stem, roots and how the problem is spreading."
      : "That is a big step. Let’s confirm what is going on first — check a few plants closely before removing crop or spraying the whole field.",
  };
}

export function sanitizeDestructiveActions(actions: string[], options: {
  observedFacts: string[];
  confidence: "low" | "medium" | "high" | "unknown";
  humanReviewed?: boolean;
}): { actions: string[]; blocked: boolean; farmerMessage: string | null } {
  const kept: string[] = [];
  let blocked = false;
  let farmerMessage: string | null = null;

  for (const action of actions) {
    const check = shouldBlockDestructiveAction({
      recommendation: action,
      observedFacts: options.observedFacts,
      confidence: options.confidence,
      humanReviewed: options.humanReviewed,
    });
    if (check.blocked) {
      blocked = true;
      farmerMessage = check.farmerMessage;
      continue;
    }
    kept.push(action);
  }

  return { actions: kept, blocked, farmerMessage };
}

export const BACTERIAL_WILT_CAUTION =
  "Bacterial wilt is one possibility, but other problems can cause similar wilting. Before removing plants, let’s check the stem, roots and how the problem is spreading.";
