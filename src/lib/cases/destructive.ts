export type DestructiveCheck = {
  blocked: boolean;
  reasons: string[];
  farmerMessage: string | null;
  softened?: boolean;
};

const DESTRUCTIVE =
  /\b(dump|destroy|pull up|pull out|remove all|rip out|abandon (the )?(field|crop)|plough (in|under)|discard (the )?plants?)\b/i;

const PREMATURE_PLANT_REMOVAL =
  /\b(remove (the )?(affected |damaged |infected |spotted |virus[- ]affected )?plants|pull the whole field|rogue(ing)? (out )?(affected )?plants)\b/i;

function mentionsVirusPlantRemoval(text: string): boolean {
  const lower = text.toLowerCase();
  if (!/\bvirus\b/.test(lower) && !/\brogue\b/.test(lower)) return false;
  return /\b(remov(e|ing)|rogue|pull|destroy|discard).{0,50}\b(plants?|crop)\b/.test(lower);
}

const LEAF_REMOVAL =
  /\b((remove|pick off|strip)\b[\s\S]{0,50}\b(leaves?|leaf)\b|defoliat)/i;

const ALREADY_CAUTIOUS_LEAF =
  /\b(do not (strip|remove|pick off)|avoid heavy defoliation|few leaves are badly affected|removed carefully)\b/i;

const MAJOR_CORRECTION =
  /\b(heavy (fertilizer|fertiliser) correction|replant the (whole )?(field|crop)|spray (the )?(whole|entire) (field|crop))\b/i;

const VAGUE_WILT = /\bwilt(ing|ed)?\b/i;

export const SOFT_LEAF_REMOVAL =
  "If only a few leaves are badly affected, they can be removed carefully; avoid heavy defoliation until the cause is clearer.";

export function isLeafRemovalRecommendation(text: string): boolean {
  if (ALREADY_CAUTIOUS_LEAF.test(text) && !/\bremove severely affected\b/i.test(text)) {
    return false;
  }
  return LEAF_REMOVAL.test(text) && !DESTRUCTIVE.test(text);
}

export function isDestructiveRecommendation(text: string): boolean {
  return (
    DESTRUCTIVE.test(text) ||
    MAJOR_CORRECTION.test(text) ||
    PREMATURE_PLANT_REMOVAL.test(text) ||
    mentionsVirusPlantRemoval(text)
  );
}

export function softenDestructiveWording(
  text: string,
  confidence: "low" | "medium" | "high" | "unknown",
): string {
  if (!text.trim() || confidence === "high") return text;
  if (mentionsVirusPlantRemoval(text)) {
    return text.replace(
      /[^.!?]{0,80}\b(remov(e|ing)|rogue|pull|destroy|discard)\b[^.!?]{0,60}\b(plants?|crop)\b[^.!?]*[.!?]?/gi,
      (match) => {
        if (/\bdo not\b/i.test(match) || /\bavoid\b/i.test(match)) return "";
        return "";
      },
    );
  }
  if (ALREADY_CAUTIOUS_LEAF.test(text) && !/\bremove severely affected\b/i.test(text)) {
    return text;
  }
  if (!LEAF_REMOVAL.test(text)) return text;
  return text.replace(
    /\b(remove|pick off|strip)\b[^.!?]{0,70}\b(leaves?|leaf)\b[^.!?]*[.!?]?/gi,
    (match) => {
      if (/\bdo not\b/i.test(match) || /\bavoid\b/i.test(match)) return match;
      return SOFT_LEAF_REMOVAL;
    },
  );
}

export function shouldBlockDestructiveAction(options: {
  recommendation: string;
  observedFacts: string[];
  confidence: "low" | "medium" | "high" | "unknown";
  humanReviewed?: boolean;
  containmentJustified?: boolean;
}): DestructiveCheck {
  const text = [options.recommendation, ...options.observedFacts].join(" ");
  if (isLeafRemovalRecommendation(options.recommendation) && options.confidence !== "high") {
    return {
      blocked: false,
      softened: true,
      reasons: ["low_confidence_leaf_removal"],
      farmerMessage: SOFT_LEAF_REMOVAL,
    };
  }

  const destructive = isDestructiveRecommendation(options.recommendation);
  if (!destructive) {
    return { blocked: false, reasons: [], farmerMessage: null };
  }

  if (options.humanReviewed || options.containmentJustified || options.confidence === "high") {
    return { blocked: false, reasons: [], farmerMessage: null };
  }

  const wilt = VAGUE_WILT.test(text) && options.observedFacts.length < 3;
  const virus = /\bvirus\b/i.test(text);
  return {
    blocked: true,
    reasons: wilt
      ? ["vague wilt", "irreversible action"]
      : virus
        ? ["unconfirmed virus", "irreversible action"]
        : ["insufficient evidence", "irreversible action"],
    farmerMessage: wilt
      ? "Bacterial wilt is one possibility, but other problems can look similar. Before removing plants, let’s check the stem, roots and how the problem is spreading."
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
    const softened = softenDestructiveWording(action, options.confidence);
    if (softened !== action) {
      if (!kept.includes(softened)) kept.push(softened);
      continue;
    }
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
