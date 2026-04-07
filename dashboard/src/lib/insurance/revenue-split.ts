/**
 * Insurance revenue split computation.
 *
 * For insured patients, appointment revenue has three components:
 * - Insurer portion (session fee minus patient excess)
 * - Patient excess (paid by patient to clinic)
 * - Self-pay (non-insured patients — full fee)
 *
 * Pure function — no external dependencies.
 */

export interface RevenueSplitInput {
  revenueAmountPence: number;
  insuranceFlag: boolean;
  excessAmountPence?: number;
}

export interface RevenueSplitResult {
  insurerPence: number;
  excessPence: number;
  selfPayPence: number;
}

export function computeRevenueSplit(input: RevenueSplitInput): RevenueSplitResult {
  const revenue = Math.max(0, input.revenueAmountPence);

  if (!input.insuranceFlag) {
    return { insurerPence: 0, excessPence: 0, selfPayPence: revenue };
  }

  const excess = Math.max(0, input.excessAmountPence ?? 0);
  const cappedExcess = Math.min(excess, revenue);
  const insurerPortion = revenue - cappedExcess;

  return {
    insurerPence: insurerPortion,
    excessPence: cappedExcess,
    selfPayPence: 0,
  };
}
