/**
 * Conversation context without crop contamination across unrelated topics.
 */

import {
  ASK_CROP_QUESTION,
  extractCrops,
  extractLastCrop,
  mentionsTomato,
  stripUnmentionedCrop,
} from "./crops";
import {
  classifyFarmerIntent,
  isCalculationIntent,
  isDiagnosticIntent,
  isLikelyFollowUp,
  shouldStartNewCase,
  type ClassifiedIntent,
  type IntentCategory,
} from "./intents";
import type { KnownFarmerFacts } from "@/lib/agronomy/tomato-protocol";
import { extractKnownFacts } from "@/lib/agronomy/tomato-protocol";

export type ActiveCaseContext = {
  crop: string | null;
  variety?: string | null;
  conversationIntent?: string | null;
  farmerProblemText?: string | null;
};

export type ResolvedTurnContext = {
  classified: ClassifiedIntent;
  knownFacts: KnownFarmerFacts;
  resetHistory: boolean;
  allowedCrops: string[];
  askForCrop: boolean;
};

function userHistoryText(
  history: Array<{ role: string; content: string }>,
): string {
  return history
    .filter((item) => item.role === "user")
    .map((item) => item.content)
    .join("\n");
}

export function resolveTurnContext(options: {
  message: string;
  history?: Array<{ role: string; content: string }>;
  profile?: { country?: string | null; district?: string | null } | null;
  activeCase?: ActiveCaseContext | null;
}): ResolvedTurnContext {
  const history = options.history ?? [];
  const classified = classifyFarmerIntent(options.message);
  const prevCrop = extractLastCrop(userHistoryText(history)) ?? options.activeCase?.crop ?? null;
  const resetHistory = options.activeCase
    ? shouldStartNewCase({
        message: options.message,
        activeCrop: options.activeCase.crop,
        activeIntent: options.activeCase.conversationIntent ?? null,
      })
    : shouldStartNewCase({
        message: options.message,
        activeCrop: extractLastCrop(userHistoryText(history)),
        activeIntent: classifyFarmerIntent(userHistoryText(history) || options.message)
          .intent,
      }) &&
      history.length > 0 &&
      !isLikelyFollowUp(options.message, {
        activeCrop: prevCrop,
        hasHistory: history.length > 0,
      });

  const currentCrop = extractLastCrop(options.message);
  const historyCrop = resetHistory ? null : extractLastCrop(userHistoryText(history));
  const activeCrop = resetHistory ? null : options.activeCase?.crop ?? null;

  const carryCrop =
    !isCalculationIntent(classified.intent) &&
    classified.intent !== "cashflow" &&
    classified.intent !== "farm_business" &&
    classified.intent !== "costing" &&
    classified.intent !== "pricing";

  const crop = currentCrop ?? (carryCrop ? (historyCrop ?? activeCrop) : null);

  const factSource = resetHistory
    ? options.message
    : carryCrop
      ? `${userHistoryText(history)}\n${options.message}`
      : options.message;

  let knownFacts = extractKnownFacts(factSource, options.profile);
  knownFacts = {
    ...knownFacts,
    crop: crop?.toLowerCase() ?? null,
    rawText: options.message,
  };

  if (currentCrop && historyCrop && currentCrop !== historyCrop) {
    knownFacts = extractKnownFacts(options.message, options.profile);
  }

  if (!carryCrop) {
    knownFacts = {
      ...knownFacts,
      crop: currentCrop,
      variety: currentCrop ? knownFacts.variety : null,
      suspectedIssue: null,
      problemCategory: null,
    };
  }

  const allowedCrops = [
    ...new Set(
      [
        currentCrop,
        ...(carryCrop && !resetHistory ? extractCrops(`${userHistoryText(history)}\n${options.message}`) : extractCrops(options.message)),
      ].filter((item): item is string => Boolean(item)),
    ),
  ];

  const askForCrop =
    isDiagnosticIntent(classified.intent) &&
    !knownFacts.crop &&
    !isLikelyFollowUp(options.message, {
      activeCrop: options.activeCase?.crop ?? historyCrop,
      hasHistory: history.length > 0,
    });

  return {
    classified,
    knownFacts,
    resetHistory,
    allowedCrops,
    askForCrop,
  };
}

export function cropLockInstruction(options: {
  crop: string | null;
  allowedCrops: string[];
  askForCrop: boolean;
}): string {
  if (options.askForCrop) {
    return `CROP LOCK: The farmer has not named a crop. Do not assume tomato or any other crop. Ask naturally: "${ASK_CROP_QUESTION}"`;
  }
  if (options.crop) {
    return `CROP LOCK: Active crop is ${options.crop}. Do not mention tomato or any other crop unless the farmer named it. Allowed crops: ${options.allowedCrops.join(", ") || options.crop}.`;
  }
  return `CROP LOCK: No crop is known. Never assume tomato. Do not mention a crop name unless the farmer used it.`;
}

export function sanitizeFarmerFacingText(
  text: string,
  allowedCrops: string[],
): string {
  if (allowedCrops.includes("tomato")) return text;
  if (!mentionsTomato(text)) return text;
  return stripUnmentionedCrop(text, "tomato", allowedCrops);
}

export function intentForCase(
  classified: ClassifiedIntent,
): IntentCategory {
  return classified.intent;
}
