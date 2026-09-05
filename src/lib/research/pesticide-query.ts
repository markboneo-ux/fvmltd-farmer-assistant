/**
 * Broad pesticide-list questions vs specific crop/pest/product lookups.
 */

import { extractLastCrop } from "@/lib/assistant/crops";

export type PesticideQueryKind =
  | "broad_list"
  | "full_register"
  | "by_crop"
  | "by_pest"
  | "by_ingredient"
  | "by_trade_name"
  | "product"
  | "none";

export type PesticideQuery = {
  kind: PesticideQueryKind;
  isPesticideRequest: boolean;
  wantsFullList: boolean;
  isBroadList: boolean;
  crop: string | null;
  pest: string | null;
  activeIngredient: string | null;
  tradeName: string | null;
};

const PESTICIDE_ASK =
  /\b(pesticides?|insecticides?|fungicides?|herbicides?|chemicals?|sprays?|registered|registration|approved (for|in)|pesticide register|what can i spray|trade names?)\b/i;

const BROAD_LIST =
  /\b((what is|what's|whats|give me|show me|i need) (the )?(list|lists) of|list of|lists of|pesticides? available|available pesticides?|pesticides? in|what pesticides? (are )?(available|registered|approved)|which pesticides?|official pesticide register)\b/i;

const FULL_LIST =
  /\b(full (list|register)|entire (list|register)|all (of )?(the )?(approved |registered )?pesticides?|complete (list|register)|dump (the )?list|the (full )?official (pesticide )?register)\b/i;

const PEST_HINT =
  /\b(white\s*fl(?:y|ies)|aphids?|thrips|mites?|worms?|caterpillars?|blight|leaf\s+spot|mildew|mould|mold|fungus|virus|nematodes?|leaf\s*miner|cercospora|anthracnose|rust)\b/i;

const FILTER_CROP = /\bby crop\b/i;
const FILTER_PEST = /\bby pest(\/disease)?\b/i;
const FILTER_INGREDIENT = /\bby active ingredient\b/i;
const FILTER_TRADE = /\bby trade name\b/i;

export function extractPestFromText(text: string): string | null {
  const match = text.match(PEST_HINT);
  return match?.[0]?.toLowerCase() ?? null;
}

export function classifyPesticideQuery(message: string): PesticideQuery {
  const text = message.trim();
  const isPesticideRequest = PESTICIDE_ASK.test(text);
  const crop = extractLastCrop(text);
  const pest = extractPestFromText(text);
  const activeIngredient = extractIngredientHint(text);
  const tradeName = extractTradeNameHint(text);
  const wantsFullList = FULL_LIST.test(text);
  const hasFilter =
    Boolean(crop) || Boolean(pest) || Boolean(activeIngredient) || Boolean(tradeName);

  if (!isPesticideRequest && !BROAD_LIST.test(text) && !wantsFullList) {
    return {
      kind: "none",
      isPesticideRequest: false,
      wantsFullList: false,
      isBroadList: false,
      crop,
      pest,
      activeIngredient,
      tradeName,
    };
  }

  if (FILTER_CROP.test(text) && !crop) {
    return pack("by_crop", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }
  if (FILTER_PEST.test(text) && !pest) {
    return pack("by_pest", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }
  if (FILTER_INGREDIENT.test(text) && !activeIngredient) {
    return pack("by_ingredient", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }
  if (FILTER_TRADE.test(text) && !tradeName) {
    return pack("by_trade_name", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }

  if (wantsFullList && !hasFilter) {
    return pack("full_register", {
      isPesticideRequest: true,
      wantsFullList: true,
      crop,
      pest,
      activeIngredient,
      tradeName,
      isBroadList: true,
    });
  }

  if ((BROAD_LIST.test(text) || wantsFullList) && !hasFilter) {
    return pack("broad_list", {
      isPesticideRequest: true,
      wantsFullList,
      crop,
      pest,
      activeIngredient,
      tradeName,
      isBroadList: true,
    });
  }

  if (tradeName) {
    return pack("by_trade_name", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }
  if (activeIngredient) {
    return pack("by_ingredient", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }
  if (pest) {
    return pack("by_pest", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }
  if (crop && isPesticideRequest) {
    return pack("by_crop", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }

  if (isPesticideRequest) {
    return pack("product", { isPesticideRequest: true, wantsFullList, crop, pest, activeIngredient, tradeName, isBroadList: false });
  }

  return pack("none", {
    isPesticideRequest: false,
    wantsFullList: false,
    crop,
    pest,
    activeIngredient,
    tradeName,
    isBroadList: false,
  });
}

function pack(
  kind: PesticideQueryKind,
  rest: Omit<PesticideQuery, "kind">,
): PesticideQuery {
  return { kind, ...rest };
}

export function isPesticideLookupMessage(message: string): boolean {
  const query = classifyPesticideQuery(message);
  return query.isPesticideRequest || query.isBroadList;
}

const INGREDIENT_HINT =
  /\b(imidacloprid|acetamiprid|thiamethoxam|lambda[-\s]?cyhalothrin|cypermethrin|mancozeb|chlorothalonil|copper hydroxide|glyphosate|abamectin|spinosad|azadirachtin|neem|malathion|paraquat|azoxystrobin)\b/i;

function extractIngredientHint(text: string): string | null {
  const match = text.match(INGREDIENT_HINT);
  return match?.[1]?.toLowerCase() ?? match?.[0]?.toLowerCase() ?? null;
}

function extractTradeNameHint(text: string): string | null {
  const match = text.match(
    /\b(?:brand|trade name|product)\s*[:\-]?\s*([A-Z][A-Za-z0-9-]{2,})\b/,
  );
  return match?.[1] ?? null;
}
