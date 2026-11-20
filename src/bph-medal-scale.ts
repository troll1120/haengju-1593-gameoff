/** Convert old combat merit and persisted balances to the survival medal scale. */
export const BPH_MEDAL_DIVISOR = 96;
export const bphScaledMedals = (amount: number): number => Math.floor(amount / BPH_MEDAL_DIVISOR);
