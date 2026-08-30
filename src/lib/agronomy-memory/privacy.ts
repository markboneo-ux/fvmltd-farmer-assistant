/**
 * Accurate storage / learning explanation. Never claim we store nothing,
 * and never claim the model retrains itself from one chat.
 */

export const FARMER_PRIVACY_ANSWER =
  "Crop conversations can be saved securely when that is appropriate. Saved crop details help improve your later recommendations. Anonymized crop-case patterns can also improve regional guidance for Caribbean farmers. I do not retrain myself from a single conversation. How personal data is handled follows this app’s privacy settings and your consent.";

export function isPrivacyOrLearningQuestion(text: string): boolean {
  const q = text.toLowerCase();
  const asks =
    /\b(do you|does (this|the)|will you|can you|are you|how do you|what happens to)\b/.test(
      q,
    );
  if (!asks) return false;

  return (
    /\b(store|stored|storing|save|saved|saving|remember|learn|learning|retrain|privacy|personal data|my (data|information|conversations?))\b/.test(
      q,
    ) || /\bnever store\b/.test(q)
  );
}

export function mentionsFalseNoStoreClaim(text: string): boolean {
  return /i don['’]t store personal data or learn from individual conversations/i.test(
    text,
  );
}
