/**
 * Correlation IDs for internal failure logs. Never shown as technical detail to farmers.
 */

export function newCorrelationId(): string {
  return `fvm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function logStageFailure(options: {
  correlationId: string;
  route: string;
  stage: string;
  externalService?: string;
  errorType: string;
  message?: string;
  table?: string | null;
}) {
  console.error("[ops] stage_failure", {
    correlationId: options.correlationId,
    route: options.route,
    stage: options.stage,
    externalService: options.externalService ?? null,
    errorType: options.errorType,
    table: options.table ?? null,
    message: (options.message || "").slice(0, 240),
  });
}
