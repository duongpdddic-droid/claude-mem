import { classifyResponseDocument } from '../../../sdk/parser.js';
import { isAuthFailureObserverOutput, isQuotaLimitedObserverOutput } from '../../../sdk/output-classifier.js';

/**
 * Durable-observation-loss fix (Issue #2). Re-exports the reask prompt and the
 * retry bound shared by the generation providers' recovery path. The bounded
 * retry loop itself lives in ResponseProcessor.processAgentResponse via its
 * optional `reaskForRecovery` closure; this module is the single source of
 * truth for the policy constants so provider-specific retry wiring cannot drift.
 */
/** Max generation attempts per queued message (1 initial + 1 reask). */
export const GENERATION_RETRY_ATTEMPTS = 2;

export type RecoveryReason = ReturnType<typeof classifyResponseDocument>;

/** True when a payload is deferred (quota/auth) rather than malformed. */
export function isDeferredParserRejection(raw: string): boolean {
  return isQuotaLimitedObserverOutput(raw) || isAuthFailureObserverOutput(raw);
}

/**
 * Reask that forces strict, pure-XML output for the next generation attempt.
 */
export const REASK_PURE_XML_PROMPT =
  '[system] Your previous response was not a single valid, complete XML document, so no observations were captured ' +
  '(the queued batch is preserved). Respond again with ONLY the XML document itself — no prose, no markdown, no ' +
  'code fences — containing exactly one <observation>...</observation> block (or, if summarizing, exactly one ' +
  '<summary>...</summary> block) matching the requested schema. Nothing before or after it.';