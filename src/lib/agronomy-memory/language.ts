const JARGON_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bpathogen pressure\b/gi, "disease risk from wet weather"],
  [/\betiological agent\b/gi, "likely cause"],
  [/\bphysiological disorder\b/gi, "plant stress that is not a pest or germ"],
  [/\bvector dynamics\b/gi, "how insects spread the problem"],
  [/\bsubstrate saturation\b/gi, "soil that stays too wet"],
  [/\bvascular pathogens?\b/gi, "diseases that move inside the stem"],
  [/\broot-zone saturation\b/gi, "soil staying wet around the roots"],
  [/\binspect for symptoms consistent with\b/gi, "look for signs of"],
  [/\bassess root-zone\b/gi, "check the soil around the roots"],
];

export function simplifyFarmerLanguage(text: string): string {
  let next = text;
  for (const [pattern, replacement] of JARGON_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next.replace(/\s{2,}/g, " ").trim();
}

export function containsHeavyJargon(text: string): boolean {
  return (
    /\b(pathogen pressure|etiological agent|physiological disorder|vector dynamics|substrate saturation)\b/i.test(
      text,
    )
  );
}

export function isSimpleLanguage(text: string): boolean {
  return !containsHeavyJargon(text);
}
