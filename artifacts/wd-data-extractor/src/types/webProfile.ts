// ─── WD (Withdrawal) Profile ─────────────────────────────────────────────────
//
// A profile represents one "web platform" (e.g. HOKI77, RATUKILAT).
// It stores both hardcoded output values and the Excel column mapping
// needed to read the withdrawal report file for that platform.

export interface WebProfile {
  id: string;

  // Display name shown in the picker dropdown.
  name: string;

  // ── Hardcoded output columns ──────────────────────────────────────────────
  // These values are written as-is into every output row.
  sub: string;           // Column 4:  SUB
  kodeTransaksi: string; // Column 5:  KODE TRANSAKSI (usually "WD")
  keterangan: string;    // Column 9:  KETERANGAN / KODE SN

  // ── Excel column mapping ──────────────────────────────────────────────────
  // The header name as it appears in the source withdrawal report .xlsx file.
  colAccountName:   string; // → NAMA (col 1)
  colPaymentMethod: string; // → prefix of NOMOR REKENING (col 2)
  colAccountNumber: string; // → suffix of NOMOR REKENING (col 2)
  colTransactionId: string; // → USER ID / LOGIN (col 3, split on "-")
  colTotalAmount:   string; // → WITHDRAWAL (col 7)
  colFinishedDate:  string; // → JAM INPUT WD (col 12), time portion only
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_PROFILE: Omit<WebProfile, "id" | "name"> = {
  sub:            "BOT",
  kodeTransaksi:  "WD",
  keterangan:     "QRIS HOKI RATUKILAT 77",
  colAccountName:   "Account Name",
  colPaymentMethod: "Payment Method",
  colAccountNumber: "Account Number",
  colTransactionId: "Whitelabel Transaction ID",
  colTotalAmount:   "Total Amount",
  colFinishedDate:  "Finished Date",
};

export const INITIAL_PROFILES: WebProfile[] = [
  { id: "default", name: "HOKI RATUKILAT 77", ...DEFAULT_PROFILE },
];
