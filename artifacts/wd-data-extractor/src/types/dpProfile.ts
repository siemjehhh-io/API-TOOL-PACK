// ─── DP (Deposit / QRIS) Profile ─────────────────────────────────────────────
//
// A profile represents one "web platform" for the DP extractor.
// DP reports always use fixed column names (Member ID, Amount, etc.),
// so unlike WD profiles there is no column mapping — only hardcoded output values.

export interface DpProfile {
  id: string;

  // Display name shown in the picker dropdown.
  name: string;

  // ── Hardcoded output columns ──────────────────────────────────────────────
  sub:      string; // Column 4:  SUB
  kodeBank: string; // Column 10: KODE BANK (e.g. "QRIS HOKI RATUKILAT 77")
  // Note: KODE TRANSAKSI is always hardcoded to "DP" in transformDpData().
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_DP_PROFILE: Omit<DpProfile, "id" | "name"> = {
  sub:      "BOT",
  kodeBank: "QRIS HOKI RATUKILAT 77",
};
