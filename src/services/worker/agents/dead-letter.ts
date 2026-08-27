import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DATA_DIR } from '../../../shared/paths.js';

/**
 * Durable-observation-loss fix — exhausted-retry evidence. When a generation
 * turn ends malformed after every bounded attempt, we never silently drop the
 * batch. Instead we append one JSONL record that keeps the batch recoverable:
 * session/provider IDs, the raw response, and the affected message identifiers.
 *
 * A single JSONL file under the data dir is deliberately the minimal mechanism:
 * the DB's `sync_dead_letter` table is Cloud-sync-lane schema (CHECK lane IN
 * ('content','mutation'), UNIQUE lane+queue_key+entity_rev) and would be
 * semantically wrong to reuse for parse failures. The file is human/ops
 * readable and survives restarts; a future repair tool can replay from it.
 *
 * ponytail: if a replay/repair command is ever built, swap this file for a
 * dedicated DB table (schema-versioned like the rest of SessionStore).
 */
export interface DeadLetterEntry {
  sessionDbId: number;
  memorySessionId: string | null;
  contentType: 'observation' | 'summary' | 'init';
  provider: string;
  model: string | null;
  reason: 'multiple_documents' | 'truncated' | 'no_xml';
  attempts: number;
  messageIds: number[];
  messageToolNames: string[];
  raw: string;
  createdAtEpoch: number;
}

/** Injectable via env for tests; defaults to a stable file next to the DB. */
export function resolveDeadLetterPath(): string {
  return process.env.CLAUDE_MEM_DEAD_LETTER_PATH || join(DATA_DIR, 'observer-dead-letters.jsonl');
}

/**
 * Append one evidence record. Returns `true` only when the record was durably
 * persisted, `false` on any filesystem failure. The caller MUST treat `false`
 * as a failed dead-letter: it must NOT confirm (drop) the claimed messages,
 * and must keep the batch recoverable (e.g. reset/requeue to pending) plus log
 * an ERROR. A failed write is surfaced to the caller rather than swallowed so
 * a dead-letter failure can never silently become a permanent loss.
 */
export function appendDeadLetter(entry: DeadLetterEntry): boolean {
  const path = resolveDeadLetterPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}