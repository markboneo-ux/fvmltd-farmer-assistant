/**
 * Diagnostic certainty language.
 * Field tests are presumptive. "Confirmed" is reserved for lab/staff/definitive evidence.
 */

export const STREAMING_PRESUMPTIVE =
  "A milky stream from a cut stem in clean water is strong field evidence that bacterial wilt is more likely. It does not confirm bacterial wilt the way a laboratory test would.";

const CONFIRM_STREAMING =
  /\b(stream(ing)? test|bacterial streaming|ooze test|cut stem.{0,40}water).{0,80}\b(confirm|confirmed|confirms)\b/i;

const CONFIRMS_WILT =
  /\b(confirm|confirmed|confirms|confirmation of)\b.{0,40}\bbacterial wilt\b/i;

const WILT_CONFIRMED_BY_STREAM =
  /\bbacterial wilt\b.{0,60}\b(confirmed|confirm|confirms)\b.{0,40}\b(stream|ooze|cut stem)\b/i;

export function overclaimsConfirmation(text: string, options?: { labOrStaff?: boolean }): boolean {
  if (options?.labOrStaff) return false;
  const lower = text.toLowerCase();
  if (CONFIRM_STREAMING.test(text) || CONFIRMS_WILT.test(text) || WILT_CONFIRMED_BY_STREAM.test(text)) {
    return true;
  }
  if (/\b(this confirms|confirmed diagnosis|we have confirmed)\b/i.test(lower)) {
    if (/\b(lab|laboratory|agronomist|specialist|staff)\b/i.test(lower)) return false;
    return true;
  }
  return false;
}

export function sanitizeCertaintyLanguage(text: string, options?: { labOrStaff?: boolean }): string {
  if (!text || options?.labOrStaff) return text;
  let next = text;
  next = next.replace(
    /\b(this |that )?(would |will |can )?confirm(s|ed)? bacterial wilt\b/gi,
    "makes bacterial wilt much more likely",
  );
  next = next.replace(
    /\bbacterial streaming test would confirm\b/gi,
    "bacterial streaming test would make bacterial wilt much more likely — it is not laboratory confirmation",
  );
  next = next.replace(
    /\b(stream(ing)? test|cut[- ]stem test) (will |would |can )?confirm/gi,
    "$1 is strong field evidence and would make bacterial wilt much more likely; it does not confirm",
  );
  next = next.replace(
    /\bconfirmed bacterial wilt\b/gi,
    "bacterial wilt that is much more likely on field evidence",
  );
  next = next.replace(
    /\bthis confirms\b/gi,
    "this makes it much more likely",
  );
  return next.replace(/\s{2,}/g, " ").trim();
}

export function streamingLanguageAllowed(text: string): boolean {
  if (!/\bstream/.test(text.toLowerCase())) return true;
  return !overclaimsConfirmation(text);
}
