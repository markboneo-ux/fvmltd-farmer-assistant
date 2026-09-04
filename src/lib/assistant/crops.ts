/**
 * Crop mention extraction. Last explicit mention wins.
 * Never default to tomato or any other crop.
 */

export const CROP_ALIASES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "pepper", pattern: /\bhot\s+pepper(s)?\b/gi },
  { name: "pepper", pattern: /\bsweet\s+pepper(s)?\b/gi },
  { name: "sweet potato", pattern: /\bsweet\s+potatoes?\b/gi },
  { name: "pigeon pea", pattern: /\bpigeon\s+peas?\b/gi },
  { name: "string bean", pattern: /\b(bodi|bora|string\s+beans?)\b/gi },
  { name: "tomato", pattern: /\btomato(es)?\b/gi },
  { name: "pepper", pattern: /\bpeppers?\b/gi },
  { name: "cucumber", pattern: /\bcucumbers?\b/gi },
  { name: "celery", pattern: /\bcelery\b/gi },
  { name: "lettuce", pattern: /\blettuce\b/gi },
  { name: "cabbage", pattern: /\bcabbage(s)?\b/gi },
  { name: "okra", pattern: /\b(okra|ochro)s?\b/gi },
  { name: "cassava", pattern: /\bcassava\b/gi },
  { name: "banana", pattern: /\bbananas?\b/gi },
  { name: "plantain", pattern: /\bplantains?\b/gi },
  { name: "corn", pattern: /\b(corn|maize)\b/gi },
  { name: "rice", pattern: /\brice\b/gi },
  { name: "pumpkin", pattern: /\bpumpkins?\b/gi },
  { name: "melon", pattern: /\b(water\s*)?melons?\b/gi },
  { name: "eggplant", pattern: /\b(eggplant|baingan|melongene)s?\b/gi },
  { name: "callaloo", pattern: /\bcallaloo\b/gi },
  { name: "dasheen", pattern: /\bdasheen\b/gi },
  { name: "yam", pattern: /\byams?\b/gi },
  { name: "cocoa", pattern: /\bcocoa\b/gi },
  { name: "coffee", pattern: /\bcoffee\b/gi },
  { name: "citrus", pattern: /\b(citrus|orange|lime|lemon|grapefruit)s?\b/gi },
  { name: "mango", pattern: /\bmango(es)?\b/gi },
  { name: "coconut", pattern: /\bcoconuts?\b/gi },
  { name: "pineapple", pattern: /\bpineapples?\b/gi },
  { name: "papaya", pattern: /\b(papaya|pawpaw)s?\b/gi },
  { name: "beans", pattern: /\bbeans?\b/gi },
  { name: "chive", pattern: /\bchives?\b/gi },
  { name: "thyme", pattern: /\bthyme\b/gi },
];

export type CropMention = {
  name: string;
  index: number;
  length: number;
};

export function extractCropMentions(text: string): CropMention[] {
  const mentions: CropMention[] = [];
  for (const item of CROP_ALIASES) {
    const pattern = new RegExp(item.pattern.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      mentions.push({
        name: item.name,
        index: match.index,
        length: match[0].length,
      });
    }
  }

  mentions.sort((a, b) => a.index - b.index || b.length - a.length);

  const deduped: CropMention[] = [];
  for (const mention of mentions) {
    const overlaps = deduped.some((existing) => {
      const existingEnd = existing.index + existing.length;
      const mentionEnd = mention.index + mention.length;
      return mention.index < existingEnd && existing.index < mentionEnd;
    });
    if (!overlaps) deduped.push(mention);
  }
  return deduped;
}

export function extractLastCrop(text: string): string | null {
  const mentions = extractCropMentions(text);
  return mentions.at(-1)?.name ?? null;
}

export function extractCrops(text: string): string[] {
  return [...new Set(extractCropMentions(text).map((item) => item.name))];
}

export function textMentionsCrop(text: string, crop: string): boolean {
  return extractCrops(text).includes(crop.toLowerCase());
}

export const ASK_CROP_QUESTION = "What crop are you working with?";

const TOMATO_WORD = /\btomato(es)?\b/i;

export function mentionsTomato(text: string): boolean {
  return TOMATO_WORD.test(text);
}

/**
 * Remove tomato (or another unmentioned crop) from farmer-facing text
 * when that crop was not named in this conversation.
 */
export function stripUnmentionedCrop(
  text: string,
  crop: string,
  allowedCrops: string[],
): string {
  if (!crop || allowedCrops.includes(crop)) return text;
  if (crop !== "tomato") return text;
  return text
    .replace(/\btomato(?:es)?\s+/gi, "")
    .replace(/\s+tomato(?:es)?\b/gi, "")
    .replace(/\btomato(?:es)?\b/gi, "the crop")
    .replace(/\s{2,}/g, " ")
    .trim();
}
