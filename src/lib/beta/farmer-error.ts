import { FARMER_GENERIC_ERROR, FARMER_WEB_LOOKUP_FAILED } from "./limits";

const TECHNICAL =
  /openai|api[_ ]?key|supabase|service.?role|diagnostic|model|endpoint|quota|billing|json|stack|sql|database|rls|correlation/i;

export function farmerFacingError(
  error: string | null | undefined,
  options?: { webLookupFailed?: boolean },
): string {
  if (options?.webLookupFailed) return FARMER_WEB_LOOKUP_FAILED;
  const text = (error ?? "").trim();
  if (!text) return FARMER_GENERIC_ERROR;
  if (TECHNICAL.test(text)) return FARMER_GENERIC_ERROR;
  if (text.length > 220) return FARMER_GENERIC_ERROR;
  return text;
}

export function stripDiagnostics<T extends Record<string, unknown>>(
  payload: T,
  includeDiagnostics: boolean,
): T {
  if (includeDiagnostics) return payload;
  const next = { ...payload };
  delete next.model;
  delete next.diagnosticCode;
  delete next.responseSeconds;
  delete next.internalMissingInformation;
  return next;
}
