/**
 * Confidence scoring + the auto-write gate.
 *
 * A typed form is the source of truth (confidence 1). Voice capture is scored
 * from read-back confirmation, STT confidence, and field completeness, and is
 * never allowed to auto-write unless the in-call read-back was confirmed.
 */

import type { InsuranceRecord } from "./types";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A typed form is the source of truth. */
export function formConfidence(): number {
  return 1;
}

export function voiceConfidence(opts: {
  readBackConfirmed: boolean;
  sttConfidence?: number;
  hasInsurer: boolean;
  hasPolicyNumber: boolean;
}): number {
  const stt = clamp01(opts.sttConfidence ?? 0.7);

  // Confirmed read-back lifts the floor to 0.5; unconfirmed is capped low.
  let score = opts.readBackConfirmed ? 0.5 + 0.5 * stt : 0.4 * stt;

  if (!opts.hasPolicyNumber) score *= 0.5;
  if (!opts.hasInsurer) score *= 0.5;

  // Belt-and-braces: an unconfirmed read-back can never reach auto-write range.
  if (!opts.readBackConfirmed) score = Math.min(score, 0.95);

  return round2(clamp01(score));
}

/**
 * Whether a captured record may be written to the PMS without a human in the
 * loop. Voice always requires a confirmed read-back; nothing auto-writes unless
 * the tenant has explicitly enabled it.
 */
export function shouldAutoWrite(
  record: InsuranceRecord,
  opts: { autoWriteEnabled: boolean; minConfidence: number },
): boolean {
  if (!opts.autoWriteEnabled) return false;

  if (record.source === "form") {
    return record.confidence >= opts.minConfidence;
  }

  if (record.source === "voice") {
    if (!record.readBackConfirmed) return false;
    return record.confidence >= opts.minConfidence;
  }

  // CSV (or any future source) never auto-writes.
  return false;
}
