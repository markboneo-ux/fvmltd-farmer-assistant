export type UsageNoticeLevel = "approaching" | "near" | "limit";

export type UsageNotice = {
  level: UsageNoticeLevel;
  message: string;
};

export const USAGE_NEARING_MESSAGE = "You're nearing your free usage limit.";
export const USAGE_ALMOST_MESSAGE = "You're almost at your free limit.";
export const USAGE_LIMIT_MESSAGE = "You've reached your free access limit.";
export const FVM_BETA_ACTIVATED_MESSAGE = "FVM Beta Access activated.";
export const FVM_BETA_TIER_LABEL = "FVM Beta";

export function usageRatio(used: {
  messages: number;
  cases: number;
  imageAnalyses: number;
}, caps: { messages: number; cases: number; imageAnalyses: number }): number {
  const ratios = [
    caps.messages > 0 && Number.isFinite(caps.messages)
      ? used.messages / caps.messages
      : 0,
    caps.cases > 0 && Number.isFinite(caps.cases) ? used.cases / caps.cases : 0,
    caps.imageAnalyses > 0 && Number.isFinite(caps.imageAnalyses)
      ? used.imageAnalyses / caps.imageAnalyses
      : 0,
  ];
  return Math.max(0, ...ratios);
}

export function usageNoticeFor(options: {
  access: string;
  used: { messages: number; cases: number; imageAnalyses: number };
  remaining: { messages: number; cases: number; imageAnalyses: number };
  caps: { messages: number; cases: number; imageAnalyses: number };
  limitReached?: boolean;
}): UsageNotice | null {
  if (options.access === "promo" || options.access === "paid" || options.access === "trial") {
    return null;
  }
  if (options.limitReached) {
    return { level: "limit", message: USAGE_LIMIT_MESSAGE };
  }
  const ratio = usageRatio(options.used, options.caps);
  const remainingMin = Math.min(
    options.remaining.messages,
    options.remaining.cases,
    options.remaining.imageAnalyses,
  );
  if (ratio >= 0.95 || remainingMin <= 1) {
    return { level: "near", message: USAGE_ALMOST_MESSAGE };
  }
  if (ratio >= 0.8 || remainingMin <= 3) {
    return { level: "approaching", message: USAGE_NEARING_MESSAGE };
  }
  return null;
}

export function accessTierLabel(access: string): string {
  if (access === "promo") return FVM_BETA_TIER_LABEL;
  if (access === "paid") return "Paid";
  if (access === "trial") return "Trial";
  if (access === "free_registered") return "Free account";
  return "Guest";
}
