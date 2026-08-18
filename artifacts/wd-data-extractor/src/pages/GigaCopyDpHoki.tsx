import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Check, Copy, Eraser, FileText, Layers, Loader2, Sparkles, Wand2, Download, ListOrdered, Banknote, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useCallback, useMemo, useRef, useState } from "react";

interface GigaCopyRow {
  nama: string;
  nomorRekening: string;
  userId: string;
  sub: string;
  kodeTransaksi: string;
  deposit: string;
  withdrawal: string;
  dpPulsa: string;
  keterangan: string;
  kodeBank: string;
  saldoAkhir: string;
  jamInput: string;
  inputKodeBank: string;
}

interface ParsedTransaction {
  date: string;
  trxId: string;
  username: string;
  amount: string;
}

interface ParseResult {
  transactions: ParsedTransaction[];
  confirmedCount: number;
  rejectedCount: number;
  skippedCount: number;
}

const OUTPUT_HEADERS = [
  "NAMA",
  "NOMOR REKENING",
  "USER ID / LOGIN",
  "SUB",
  "KODE TRANSAKSI",
  "DEPOSIT",
  "WITHDRAWAL",
  "DP PULSA",
  "KETERANGAN / KODE SN",
  "KODE BANK",
  "SALDO AKHIR",
  "JAM INPUT WD",
  "INPUT KODE BANK",
];

const GIGA_QRISHOKI_OUTPUT_SUB = "BOT";
const GIGA_QRISHOKI_OUTPUT_KODE_TRANSAKSI = "DP";

export const SAMPLE_TEXT = `1
Game Wallet 2026-06-05 02:39:39 114.79.4.157
007AE86a21d47bdcd19 (https://giga2-ns3-admin.net/transactions/t_depositform/007AE86a21d47bdcd19)
Uum lasnawati bt sahri / SEABANK
901829253180
mawarr (https://giga2-ns3-admin.net/member_details/DGAABAF007AE)
AFFEFXAWQ
019e9425-3cfd-dc01-0ef0-57bbbf3cc94c
Bank / QRISHOKI
Admin Deposit Transfer -
QRISHOKI / QRISHOKI
QRISHOKI
Confirmed
100,000.00
pin88qrishoki
2026-06-05 02:39:40`;

const INPUT_GUIDANCE =
  "Copy langsung dari tabel panel QRISHOKI lalu paste di sini — kolom (Username, Transaction ID, Credit, Status) terbaca otomatis & presisi. Hanya status Confirmed yang diambil. (Masih bisa paste teks biasa; klik Use Sample untuk contoh.)";

function rowToArr(row: GigaCopyRow): string[] {
  return [
    row.nama,
    row.nomorRekening,
    row.userId,
    row.sub,
    row.kodeTransaksi,
    row.deposit,
    row.withdrawal,
    row.dpPulsa,
    row.keterangan,
    row.kodeBank,
    row.saldoAkhir,
    row.jamInput,
    row.inputKodeBank,
  ];
}

function rowToDocTrxArr(row: GigaCopyRow): string[] {
  return [
    row.nama,
    "",
    row.userId,
    GIGA_QRISHOKI_OUTPUT_SUB,
    GIGA_QRISHOKI_OUTPUT_KODE_TRANSAKSI,
    row.deposit,
    "",
    "",
    row.keterangan,
    "",
  ];
}

function rowToDocQrisArr(row: GigaCopyRow): string[] {
  return [
    row.nama,
    "",
    row.userId,
    GIGA_QRISHOKI_OUTPUT_SUB,
    "",
    "",
    row.deposit,
    "",
    "",
    row.keterangan,
  ];
}

function normalizeAmount(value: string): string {
  return value.trim().replace(/\.00$/, "");
}

function mapTransactionToRow(parsedTransaction: ParsedTransaction): GigaCopyRow {
  return {
    nama: parsedTransaction.trxId,
    nomorRekening: "NO ACC",
    userId: parsedTransaction.username,
    sub: GIGA_QRISHOKI_OUTPUT_SUB,
    kodeTransaksi: GIGA_QRISHOKI_OUTPUT_KODE_TRANSAKSI,
    deposit: parsedTransaction.amount,
    withdrawal: "",
    dpPulsa: "",
    keterangan: parsedTransaction.date,
    kodeBank: "",
    saldoAkhir: "",
    jamInput: "",
    inputKodeBank: "",
  };
}

function formatCurrency(value: number): string {
  return "Rp " + value.toLocaleString("id-ID");
}

function formatExcelAmount(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw.toLocaleString("en-US");
  }
  const str = String(raw ?? "").trim();
  if (!str) return "";
  const numeric = Number(str.replace(/,/g, ""));
  if (Number.isFinite(numeric)) return numeric.toLocaleString("en-US");
  return str;
}

function formatExcelDate(raw: unknown): string {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())} ` +
      `${pad(raw.getHours())}:${pad(raw.getMinutes())}:${pad(raw.getSeconds())}`
    );
  }
  return String(raw ?? "").trim();
}

export function parseGigaCopyDpHoki(rawText: string): ParsedTransaction[] {
  return parseGigaCopyDpHokiDetailed(rawText).transactions;
}

// ─── HTML-table parser (panel copy carries a <table> on the clipboard) ───────
//
// When the user copies straight from the GIGA panel, the clipboard's `text/html`
// is the real table. Reading columns by their header is far more reliable than
// parsing the glued `text/plain` blob — the username comes from its own column,
// so the account-digit split heuristic is no longer needed (no more wrong IDs).
//
// Rules (per ops): only "Confirmed" rows are taken; the DP amount is the Credit
// column; the "New" member badge glued to the username is stripped.

const normHeader = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");

function cleanQrishokiUsername(raw: string): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  // Strip the trailing "New" member badge concatenated to the username.
  return s.replace(/\s*New$/, "").trim();
}

function cleanQrishokiTrxId(raw: string): string {
  const s = String(raw ?? "").replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
  const m = s.match(/[A-Za-z0-9]{6,}/);
  return m ? m[0] : s;
}

function extractQrishokiDate(raw: string): string {
  const m = String(raw ?? "").match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/);
  return m ? m[0].replace("T", " ") : "";
}

function extractQrishokiAmount(raw: string): string {
  const m = String(raw ?? "").match(/[\d.,]+/);
  return m ? normalizeAmount(m[0]) : "";
}

/**
 * Parse a 2D grid (rows x cells, grid[0] = header row) from the QRISHOKI panel.
 * Columns are matched by header name so column-order changes don't break it.
 * Keeps only "Confirmed" rows that have a Credit amount (DP).
 * Pure (no DOM) so it can be unit-tested.
 */
export function parseGigaQrishokiGrid(grid: string[][]): ParseResult {
  const empty: ParseResult = { transactions: [], confirmedCount: 0, rejectedCount: 0, skippedCount: 0 };
  if (!Array.isArray(grid) || grid.length < 1) return empty;

  // Find the header row anywhere in the grid (copy may include a filter/checkbox
  // row before it, or the header may not be the first <tr>).
  let headerIdx = -1;
  for (let i = 0; i < grid.length; i += 1) {
    const hs = grid[i].map(normHeader);
    if (hs.includes("username") && hs.includes("transactionid")) { headerIdx = i; break; }
  }

  let idxUser: number;
  let idxTrx: number;
  let idxDate: number;
  let idxCredit: number;
  let idxStatus: number;
  let dataStart: number;

  if (headerIdx >= 0) {
    const headers = grid[headerIdx].map(normHeader);
    idxUser = headers.indexOf("username");
    idxTrx = headers.indexOf("transactionid");
    idxDate = headers.indexOf("transactiondate");
    idxCredit = headers.indexOf("credit");
    idxStatus = headers.indexOf("status");
    dataStart = headerIdx + 1;
  } else {
    // No header row detected (e.g. only data rows were copied). Fall back to the
    // panel's standard column order.
    idxDate = 1; idxTrx = 2; idxUser = 4; idxStatus = 9; idxCredit = 12;
    dataStart = 0;
  }

  if (idxUser < 0 || idxTrx < 0 || idxCredit < 0) return empty;

  const transactions: ParsedTransaction[] = [];
  let confirmedCount = 0;
  let rejectedCount = 0;
  let skippedCount = 0;

  for (let r = dataStart; r < grid.length; r += 1) {
    const cells = grid[r];
    if (!cells || cells.length === 0) continue;
    try {
      const status = idxStatus >= 0 ? String(cells[idxStatus] ?? "").trim().toLowerCase() : "";
      if (status !== "confirmed") { rejectedCount += 1; continue; }

      const username = cleanQrishokiUsername(cells[idxUser] ?? "");
      const trxId = cleanQrishokiTrxId(cells[idxTrx] ?? "");
      const amount = extractQrishokiAmount(cells[idxCredit] ?? "");
      const date = idxDate >= 0 ? extractQrishokiDate(cells[idxDate] ?? "") : "";

      if (!username || !trxId || !amount) { skippedCount += 1; continue; }
      transactions.push({ date, trxId, username, amount });
      confirmedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  return { transactions, confirmedCount, rejectedCount, skippedCount };
}

/** Read the panel's clipboard HTML (<table>) into a 2D grid of cell texts. */
export function htmlTableToGrid(html: string): string[][] {
  try {
    if (!html || !/<table/i.test(html) || typeof DOMParser === "undefined") return [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) return [];
    return Array.from(table.querySelectorAll("tr"))
      .map((tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((cell) =>
          (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
        ),
      )
      .filter((row) => row.some((c) => c !== ""));
  } catch {
    return [];
  }
}

/** Read the panel's clipboard HTML (<table>) into a grid, then parse it. */
export function parseGigaQrishokiHtmlTable(html: string): ParseResult {
  return parseGigaQrishokiGrid(htmlTableToGrid(html));
}

/** Comparator for "YYYY-MM-DD HH:MM:SS" strings, ascending (oldest first; empty last). */
export function sortByDateAsc(a: string, b: string): number {
  const da = a || "";
  const db = b || "";
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da < db ? -1 : da > db ? 1 : 0;
}

/** Sort a grid's data rows by the Transaction Date column (oldest first). */
export function sortGridByDateAsc(grid: string[][]): string[][] {
  if (!Array.isArray(grid) || grid.length < 2) return grid;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  let headerIdx = -1;
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i].map(norm).includes("transactiondate")) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return grid;
  const dateCol = grid[headerIdx].map(norm).indexOf("transactiondate");
  if (dateCol < 0) return grid;
  const getDate = (row: string[]): string => {
    const m = String(row[dateCol] ?? "").match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/);
    return m ? m[0].replace("T", " ") : "";
  };
  const head = grid.slice(0, headerIdx + 1);
  const data = grid.slice(headerIdx + 1).sort((ra, rb) => sortByDateAsc(getDate(ra), getDate(rb)));
  return [...head, ...data];
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// QRISHOKI Raw-Text Parser (anchor-based)
//
// Each transaction in the panel export looks like this (no whitespace between
// most fields â€” they are concatenated in the source HTML/clipboard):
//
//   <rowNo>Game Wallet <date1> <ip><tracking><trxId><customerName> /
//   <BANK><accountNo><username><uuid>Bank / QRISHOKI...QRISHOKI<status>
//   <amount><adminUser>qrishoki<date2>
//
// Stable anchors we exploit:
//   â€¢ TRX ID  â†’ /86a0[a-f0-9]{10}/  (14 chars, panel-specific prefix)
//   â€¢ UUID    â†’ /019e3[0-9a-f]-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
//   â€¢ Bank    â†’ fixed enum (DANA / BCA / BNI / BRI / MANDIRI / SEABANK / OVO /
//               BANK JAGO / GOPAY / LINKAJA)
//   â€¢ Status  â†’ /Confirmed|Rejected/
//   â€¢ Date    â†’ /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/
//
// We do NOT rely on whitespace, IP shape, or UUID v4 layout â€” those are unreliable.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// TRX ID format: panel emits a 14-char hex token starting with `86a` or `06a`,
// where the 4th char is a UUIDv7 timestamp digit that increments over time
// (`86a0...`, `86a1...`, ...). Earlier we hard-coded `86a0|06a0` but more
// recent rows use `86a1`, `06a1`, etc., so we accept any hex 4th char.
const TRX_ID_REGEX = /(?:86a|06a)[0-9a-f][a-f0-9]{10}/i;
// Standard UUID format (v4/v7): 8-4-4-4-12 hex with hyphens.
// Panel uses UUIDv7 with timestamp prefix that increments over time
// (019e36XX, 019e37XX, 019e38XX, ...), so we match the generic shape.
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const IPV4_REGEX = /(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}/;
// Require near-full IPv6 (â‰¥7 segments) so we don't match HH:MM:SS time strings.
const IPV6_REGEX = /(?:[0-9a-f]{1,4}:){6,7}[0-9a-f]{1,4}/i;
const DATE_REGEX = /\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/g;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Bank name detection
//
// Pattern: "<customer> / <BANK_NAME><account_digits><username><uuid>"
// (or with whitespace separators after normalization)
//
// We use a flexible regex that matches any UPPERCASE bank identifier (single
// or two-word) followed by optional whitespace, then digits. This way new
// banks (SUPERBANK, ALLO, KROM, BSI, etc.) work automatically without code
// changes.
//
// Banks observed in panel exports:
//   â€¢ E-wallets: DANA, OVO, GOPAY, LINKAJA
//   â€¢ Traditional: BCA, BNI, BRI, MANDIRI, BSI, BTN, CIMB, DANAMON, PERMATA
//   â€¢ Digital: SEABANK, SUPERBANK, BANK JAGO, ALLO, KROM, BLU BY BCA DIGITAL
//
// Word lengths:
//   - First word: min 3 chars (avoids stray initials like " / X 123")
//   - Subsequent words (up to 3 more): min 2 chars (handles "BLU BY BCA DIGITAL")
//
// Case-insensitive (`i` flag) so panels that emit mixed-case bank names like
// "Blu BCA Digital" or "blu bca digital" still match. The captured bank name
// is upper-cased downstream before BANK_ACCOUNT_LEN lookup so the digit-split
// heuristic stays consistent.
//
// Subsequent words intentionally allow only letters (no digits) so the regex
// stops cleanly at the account-number boundary instead of greedily eating
// into the username portion when running case-insensitive.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BANK_REGEX = /\s\/\s([A-Za-z]{3,}(?:\s[A-Za-z]{2,}){0,3})(?=\s*\d)/i;

// Account length range per bank â€” used to disambiguate when the digit run
// between the bank name and the UUID could be split multiple ways.
// Banks not in this map fall back to "strip all leading digits" behavior,
// which is correct when the username doesn't start with a digit.
const BANK_ACCOUNT_LEN: Record<string, { min: number; max: number }> = {
  DANA: { min: 11, max: 13 },
  OVO: { min: 11, max: 13 },
  GOPAY: { min: 11, max: 13 },
  LINKAJA: { min: 11, max: 13 },
  BCA: { min: 10, max: 10 },
  BNI: { min: 10, max: 10 },
  BRI: { min: 15, max: 15 },
  MANDIRI: { min: 13, max: 13 },
  SEABANK: { min: 12, max: 12 },
  "BANK JAGO": { min: 12, max: 12 },
  "BLU BY BCA DIGITAL": { min: 12, max: 12 },
  // Some panels render the same bank without the "BY" word
  "BLU BCA DIGITAL": { min: 12, max: 12 },
  "BLU": { min: 12, max: 12 },
  SUPERBANK: { min: 12, max: 13 },
  BSI: { min: 10, max: 10 },
  BTN: { min: 10, max: 10 },
  CIMB: { min: 10, max: 14 },
  DANAMON: { min: 10, max: 12 },
  PERMATA: { min: 10, max: 16 },
  ALLO: { min: 12, max: 13 },
  KROM: { min: 12, max: 13 },
};

/**
 * Strip the panel's "Player Remark" color code from the end of a username.
 *
 * The panel renders a Player Remark badge (10 colors, codes 1-10) next to
 * usernames. When copied, the code gets appended to the username string with
 * a whitespace separator (single space after normalization).
 *
 * Remark codes & meanings (from panel inspection):
 *   1  PENIPU/CARI SILAP/SURUH DEPO          (dark)
 *   2  BELUM MENCAPAI TO                     (green)
 *   3  ISI FORM DEPOSIT BERULANG             (orange)
 *   4  WD TIDAK VALID/MELAKUKAN KECURANGAN   (red)
 *   5  HOLD SPIN                             (purple)
 *   6  NO PENGIRIM / SN TIDAK VALID / ...    (pink)
 *   7  BEDA NAMA                             (magenta)
 *   8  BLACKLIST                             (brown)
 *   9  DOUBLE AKUN                           (red1)
 *   10 TERLALU SERING MENGISIH NOMINAL DEPO  (green)
 *
 * Pattern: `<username>` + whitespace + `<1-9 or 10>` at end.
 *
 * Crucially we require a whitespace separator before the digit so usernames
 * that legitimately end in digits like "rivania02", "404notfond", "user123"
 * are NOT affected.
 *
 * Examples:
 *   "ragelku 1"      â†’ "ragelku"      âœ…
 *   "endah89 7"      â†’ "endah89"      âœ… (only the trailing " 7" stripped)
 *   "jekpotmania6 7" â†’ "jekpotmania6" âœ…
 *   "user 10"        â†’ "user"         âœ… (10 is valid remark code)
 *   "rivania02"      â†’ "rivania02"    âœ… (no space, preserved)
 *   "404notfond"     â†’ "404notfond"   âœ… (no space, preserved)
 *   "user 99"        â†’ "user 99"      âœ… (99 not a valid remark code, preserved)
 *   "user 11"        â†’ "user 11"      âœ… (11 not a valid remark code, preserved)
 */
function stripRemarkColor(username: string): string {
  // Match trailing " 1" through " 9" or " 10" (with whitespace separator).
  // Use anchored regex with explicit alternation so " 11", " 99", " 0" don't match.
  return username.replace(/\s+(?:10|[1-9])$/, "");
}

/**
 * Strip the "New" badge that the panel appends to new-member usernames
 * (e.g. "tiyara57New" â†’ "tiyara57", "letjend3 New" â†’ "letjend3").
 *
 * The panel renders a "New" badge next to new members which gets concatenated
 * into the username string when copied. We strip the trailing "New" marker
 * â€” note the case-sensitive capital N â€” to keep usernames clean.
 *
 * To avoid false positives we require the "New" to be preceded by a word
 * character or whitespace, and only strip the literal capitalization "New"
 * (not "NEW" or "new"). This means usernames like "Andrew" or "Newton" are
 * left untouched (their lowercase "n" prevents the match).
 *
 * Examples:
 *   "tiyara57New"        â†’ "tiyara57"     âœ…
 *   "almizan12New"       â†’ "almizan12"    âœ…
 *   "melaniyNew"         â†’ "melaniy"      âœ…
 *   "letjend3 New"       â†’ "letjend3"     âœ… (whitespace separator)
 *   "letjend3  New"      â†’ "letjend3"     âœ…
 *   "Andrew"             â†’ "Andrew"       âœ… (lowercase n, no match)
 *   "userNEW"            â†’ "userNEW"      âœ… (all caps, no match)
 *   "newuser"            â†’ "newuser"      âœ… ("New" not at end)
 */
function stripNewMemberMarker(username: string): string {
  return username.replace(/(\w)\s*New$/, "$1");
}

/**
 * Strip voucher/promo codes that the panel sometimes appends to a username
 * (e.g. "ongkyaisyahGS2AAAF00LJ" â†’ "ongkyaisyah").
 *
 * Voucher pattern observed in panel exports:
 *   - All UPPERCASE
 *   - Length 8-15 chars
 *   - Contains at least 2 digits AND 2 letters, OR starts with "AF" (referral code)
 *   - Appears as suffix to a lowercase/mixed-case username
 *   - May be separated by whitespace (HTML cell wrap â†’ newline â†’ normalized to space)
 *
 * Heuristic: If username ends with [optional whitespace + UPPERCASE-with-digits run]
 * AND the part before it ends with a lowercase letter or digit, strip the
 * UPPERCASE run.
 *
 * Examples:
 *   "ongkyaisyahGS2AAAF00LJ"     â†’ "ongkyaisyah"   âœ… (no separator)
 *   "ongkyaisyah GS2AAAF00LJ"    â†’ "ongkyaisyah"   âœ… (space separator from HTML wrap)
 *   "ongkyaisyah  GS2AAAF00LJ"   â†’ "ongkyaisyah"   âœ… (multi-space)
 *   "GACOR123"                   â†’ "GACOR123"      âœ… (no lowercase prefix)
 *   "user123"                    â†’ "user123"       âœ… (no upper suffix)
 *   "mawarr AFFEFXAWQ"           â†’ "mawarr"        âœ… (AF referral code)
 *   "userABC"                    â†’ "userABC"       âœ… (no digit and not AF referral)
 *   "404notfond"                 â†’ "404notfond"    âœ… (no upper suffix)
 *   "ragelku 1"                  â†’ "ragelku 1"     âœ… ("1" not uppercase)
 */
function stripVoucherSuffix(username: string): string {
  // Allow optional whitespace between the lowercase prefix and the UPPERCASE
  // voucher suffix (panels sometimes wrap usernames across HTML cells which
  // becomes a space after whitespace normalization).
  const match = username.match(/^(.*[a-z0-9])\s*([A-Z][A-Z0-9]{7,})$/);
  if (!match) return username;

  const suffix = match[2];
  // Referral codes in the panel's adjacent column are AF-prefixed uppercase
  // tokens and may contain no digits at all (e.g. AFFEFXAWQ, AFKRHDYBM).
  if (/^AF[A-Z0-9]{6,13}$/.test(suffix)) return match[1];

  // Other voucher suffixes must contain at least 2 digits AND 2 letters to be
  // considered a code (avoids stripping legitimate ALL-CAPS portions like "JOHN").
  const digitCount = (suffix.match(/\d/g) || []).length;
  const letterCount = (suffix.match(/[A-Z]/g) || []).length;
  if (digitCount < 2 || letterCount < 2) return username;

  return match[1];
}

/**
 * Apply all panel-marker cleanups in order:
 *   1. Strip remark color code (badge "1"-"10" with whitespace separator)
 *   2. Strip "New" badge for new members
 *   3. Strip voucher/promo code suffix
 *
 * Order matters:
 *   - Remark color comes BEFORE "New"/voucher because in real data the
 *     remark code is the outermost trailing element (panel rendering order).
 *   - Voucher strip removes UPPERCASE-only suffixes, but "New" has lowercase
 *     letters so it's stripped separately.
 *   - Running all three in sequence handles complex edge cases like
/**
 * Strip panel-rendered member-detail URLs that the new admin panel emits
 * inline next to the username when copied as text.
 *
 * The panel can render the URL in a few shapes:
 *   1. After the username:           "user (https://...)"
 *   2. Around a "New" badge:         "user (https://...) New (https://...)"
 *   3. Bare without parentheses:     "user https://..."
 *   4. Multiple wrapped blocks:      "user (https://...) (extra)"
 *
 * We strip URL-containing parenthesized blocks GLOBALLY (anywhere in the
 * string, not just trailing) so a "New" badge sandwiched between two URL
 * blocks doesn't leave one of them stranded. We also strip bare http(s)
 * URLs anywhere in the string. Non-URL parenthesized text is preserved
 * (e.g. "user (BONUS)" stays as-is) so we don't over-strip legitimate
 * trailing tokens.
 *
 * Examples:
 *   "user (https://...)"               â†’ "user"
 *   "user (https://...) New (https://...)" â†’ "user New"
 *   "user (https://...) New"           â†’ "user New"
 *   "user https://..."                 â†’ "user"
 *   "user (BONUS)"                     â†’ "user (BONUS)"  âœ… preserved
 */
function stripPanelUrl(username: string): string {
  return username
    // Remove every parenthesized block that contains an http(s) URL,
    // anywhere in the string. The block-and-its-leading-whitespace get
    // collapsed to a single space.
    .replace(/\s*\([^)]*https?:\/\/[^)]*\)/gi, " ")
    // Remove bare http(s) URLs anywhere in the string.
    .replace(/\s*https?:\/\/\S+/gi, " ")
    // Collapse the whitespace gaps left behind.
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Apply all panel-marker cleanups in order:
 *   1. Strip panel URLs (member_details links and bare URLs, anywhere)
 *   2. Strip remark color code (badge "1"-"10" with whitespace separator)
 *   3. Strip "New" badge for new members
 *   4. Strip voucher/promo code suffix
 *
 * URL strip runs first because the URL block is the outermost trailing
 * element when the new panel pastes a member-details link next to the
 * username; removing it lets the remaining cleanups work on a clean string.
 */
/**
 * Final defensive scrub: strip any character that is not part of the
 * canonical username alphabet `[A-Za-z0-9_]` from the beginning and end of
 * the string. Trailing badge glyphs (â­, â†‘, âœ“), zero-width chars that
 * survived earlier passes, stray punctuation, and the like all get peeled.
 *
 * The middle of the string is left alone because legitimate usernames
 * never contain non-alphanumeric chars in the middle, but if they did this
 * scrub wouldn't fix that anyway â€” it's a "best effort" peel of the edges.
 */
function scrubUsernameBoundary(username: string): string {
  return username.replace(/^[^A-Za-z0-9_]+|[^A-Za-z0-9_]+$/g, "");
}

function cleanUsername(username: string): string {
  return scrubUsernameBoundary(
    stripVoucherSuffix(
      stripNewMemberMarker(stripRemarkColor(stripPanelUrl(username))),
    ),
  );
}

/**
 * Refine a regex-captured bank name when it greedily absorbed adjacent
 * letter runs that aren't part of the bank.
 *
 * Why this is needed: BANK_REGEX matches `[A-Za-z]{3,}(?:\s[A-Za-z]{2,}){0,3}`
 * which is great for "BLU BY BCA DIGITAL" or "DANA". But some panel rows have
 * NO whitespace and NO account-number digits between the bank and the
 * neighbouring fields, e.g.
 *
 *   "Fariz Al-Firdaus / firdausDANAhadingaji019e44fe-..."
 *                       ^^^^^^^^^^^^^^^^^^^^
 *                       captured as one "bank name"
 *
 * In that case the capture is `firdausDANAhadingaji` â€” unknown bank, and
 * the substring between bank and UUID is empty, so extractUsername returns
 * UNKNOWN. The actual data layout is:
 *
 *   <preceding garbage><known bank><username>
 *
 * Strategy: if the captured name is not a known bank, scan it for any known
 * bank as a substring and pick the LAST occurrence (banks always sit between
 * the customer-display block and the username). Return both the refined bank
 * and the leftover suffix â€” the suffix is the username portion that the
 * regex accidentally swallowed.
 *
 * Returns { bank, prefix, suffix }:
 *   - bank   â€” the refined uppercase bank name (or original if no refinement)
 *   - prefix â€” letters BEFORE the bank match (discarded by caller)
 *   - suffix â€” letters AFTER the bank match (passed back as the "between"
 *              portion so extractUsername can derive the username)
 */
function refineBankCapture(captured: string): { bank: string; prefix: string; suffix: string } {
  const upper = captured.toUpperCase();
  // Already a known bank â€” no refinement needed.
  if (Object.prototype.hasOwnProperty.call(BANK_ACCOUNT_LEN, upper)) {
    return { bank: upper, prefix: "", suffix: "" };
  }

  // Try every known bank as a substring; prefer the longest match, then the
  // rightmost occurrence (banks live between the customer-display block and
  // the username, so the LAST occurrence is the structurally correct one).
  const knownBanks = Object.keys(BANK_ACCOUNT_LEN).sort((a, b) => b.length - a.length);
  for (const bank of knownBanks) {
    const idx = upper.lastIndexOf(bank);
    if (idx !== -1) {
      return {
        bank,
        prefix: captured.slice(0, idx),
        suffix: captured.slice(idx + bank.length),
      };
    }
  }

  // No known bank substring â€” fall back to the original capture so existing
  // behaviour (UNKNOWN-bank â†’ "strip all leading digits" in extractUsername)
  // still applies.
  return { bank: upper, prefix: "", suffix: "" };
}

/**
 * Extract username from the substring between `BANK + space` and the UUID.
 *
 * The substring is the form `<accountDigits><username>` with no separator.
 * Indonesian e-wallets (DANA, OVO, GOPAY, LINKAJA) accept 11-, 12-, or 13-digit
 * accounts, so we cannot hardcode the split point. Instead we score every
 * plausible split:
 *
 *   â€¢ letter start    â†’ quality 100 (almost certainly correct)
 *   â€¢ non-zero digit  â†’ quality 50  (possible â€” usernames like "404notfond")
 *   â€¢ zero digit      â†’ quality 10  (very rare â€” usually means we over-stripped)
 *
 * Highest quality wins; ties resolve to the longest account (most conservative).
 * After splitting, voucher/promo suffix is stripped if detected.
 */
function extractUsername(between: string, bankName: string): string {
  const trimmed = between.trim();
  if (!trimmed) return "UNKNOWN";

  const digitMatch = trimmed.match(/^\d+/);
  if (!digitMatch) return cleanUsername(trimmed);

  const totalDigits = digitMatch[0].length;
  const config = BANK_ACCOUNT_LEN[bankName];

  // Unknown bank â†’ strip the entire leading digit run.
  if (!config) {
    return cleanUsername(trimmed.slice(totalDigits).trim() || "UNKNOWN");
  }

  const minStrip = Math.min(config.min, totalDigits);
  const maxStrip = Math.min(config.max, totalDigits);

  const candidates: { strip: number; username: string; quality: number }[] = [];
  for (let strip = maxStrip; strip >= minStrip; strip--) {
    const username = trimmed.slice(strip).trim();
    if (!username) continue;

    const firstChar = username[0];
    let quality: number;
    if (/[a-zA-Z]/.test(firstChar)) quality = 100;
    else if (firstChar !== "0") quality = 50;
    else quality = 10;

    candidates.push({ strip, username, quality });
  }

  if (!candidates.length) {
    return cleanUsername(trimmed.slice(totalDigits).trim() || "UNKNOWN");
  }

  // Highest quality wins; tie-breaker = longest account.
  candidates.sort((a, b) => b.quality - a.quality || b.strip - a.strip);
  return cleanUsername(candidates[0].username);
}

function parseGigaCopyDpHokiDetailed(rawText: string): ParseResult {
  // Robust whitespace normalization. Browser copy-paste from HTML tables can
  // emit non-breaking spaces (U+00A0), zero-width separators (U+200Bâ€“200D,
  // U+FEFF), narrow no-break space (U+202F), and various Unicode spaces that
  // a plain `\s` class doesn't always cover. We:
  //   1. Strip zero-width characters entirely.
  //   2. Map all known whitespace variants to a regular ASCII space.
  //   3. Collapse runs of whitespace to a single space.
  const cleanText = rawText
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\n\r\t]+/g, " ")
    .replace(/\s{2,}/g, " ");

  // Split on the row-number prefix that separates each transaction
  // (e.g. "1Game Wallet ...", "1\tGame Wallet ...", "1 Game Wallet ..."). Some
  // panel exports use tabs/spaces between the row number and "Game Wallet".
  // After whitespace normalization the separator is collapsed to one space.
  // We also tolerate "GameWallet" with no space â€” this happens when zero-width
  // separators sneak in from copy-paste and get stripped by normalization.
  const blocks = cleanText.split(/(?=\d+\s?Game\s?Wallet)/i);

  const transactions: ParsedTransaction[] = [];
  let confirmedCount = 0;
  let rejectedCount = 0;
  let skippedCount = 0;

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (block.length < 50 || !/Game\s?Wallet/i.test(block)) {
      if (block.length > 0) skippedCount += 1;
      continue;
    }

    // Wrap each block in try/catch so one corrupt transaction doesn't kill
    // the entire parse â€” critical when processing thousands of rows.
    try {
      // --- GATEKEEPER ---
      if (!/Bank\s*\/\s*QRISHOKI/i.test(block)) {
        skippedCount += 1;
        continue;
      }
      if (/Rejected/i.test(block)) {
        rejectedCount += 1;
        continue;
      }
      if (!/Confirmed/i.test(block)) {
        skippedCount += 1;
        continue;
      }

      // --- AMOUNT (after "Confirmed") ---
      const amountMatch = block.match(
        /Confirmed\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?)/i,
      );
      if (!amountMatch) {
        skippedCount += 1;
        continue;
      }
      const amount = normalizeAmount(amountMatch[1]);

      // --- DATES (last one = confirmed/rejected time) ---
      const dateMatches = block.match(DATE_REGEX) || [];
      const date = dateMatches.length ? dateMatches[dateMatches.length - 1] : "";

      // --- TRX ID + tracking code (everything between IP and TRX ID) ---
      const trxIdMatch = block.match(TRX_ID_REGEX);
      if (!trxIdMatch || trxIdMatch.index === undefined) {
        skippedCount += 1;
        continue;
      }
      const trxIdRaw = trxIdMatch[0];
      const trxIdStart = trxIdMatch.index;

      // Tracking code = chars between the IP (v4 or v6) and the TRX ID.
      // Falls back to empty string if no IP can be located.
      let tracking = "";
      const ipv4 = block.match(IPV4_REGEX);
      const ipv6 = block.match(IPV6_REGEX);
      let ipEnd = -1;
      if (ipv4 && ipv4.index !== undefined) {
        ipEnd = ipv4.index + ipv4[0].length;
      }
      if (ipv6 && ipv6.index !== undefined) {
        const ipv6End = ipv6.index + ipv6[0].length;
        // Prefer the IP that ends right before the TRX ID
        if (ipv6End > ipEnd && ipv6End <= trxIdStart) ipEnd = ipv6End;
      }
      if (ipEnd > 0 && ipEnd <= trxIdStart) {
        tracking = block.slice(ipEnd, trxIdStart).trim();
      }

      const trxId = `${tracking}${trxIdRaw}`;

      // --- USERNAME (between BANK+account and UUID) ---
      let username = "UNKNOWN";
      const uuidMatch = block.match(UUID_REGEX);
      const bankMatch = block.match(BANK_REGEX);
      if (
        uuidMatch &&
        uuidMatch.index !== undefined &&
        bankMatch &&
        bankMatch.index !== undefined
      ) {
        // Refine the bank capture: when the regex greedily absorbed a
        // username/display-name into the bank match (no account digits or
        // whitespace separating them), `refined.suffix` carries the leftover
        // letters that should be treated as the username. Otherwise suffix
        // is empty and we use the slice between bank and UUID as before.
        const refined = refineBankCapture(bankMatch[1]);
        const bankName = refined.bank;
        const bankNameEnd = bankMatch.index + bankMatch[0].length;
        const uuidStart = uuidMatch.index;
        const sliced = block.slice(bankNameEnd, uuidStart);
        const between = refined.suffix
          ? `${refined.suffix}${sliced}`
          : sliced;
        username = extractUsername(between, bankName);
      }

      // Fallback: if the main path didn't yield a username (e.g. BANK_REGEX
      // missed because the row used a separator the regex didn't expect),
      // do a global scan of the substring between " / " and the UUID for
      // any known bank name and try extraction with that segment.
      if (username === "UNKNOWN" && uuidMatch && uuidMatch.index !== undefined) {
        const slashIdx = block.indexOf(" / ");
        if (slashIdx !== -1 && slashIdx < uuidMatch.index) {
          const segment = block.slice(slashIdx + 3, uuidMatch.index);
          const upper = segment.toUpperCase();
          const knownBanks = Object.keys(BANK_ACCOUNT_LEN).sort((a, b) => b.length - a.length);
          for (const bank of knownBanks) {
            const bankIdx = upper.indexOf(bank);
            if (bankIdx !== -1) {
              const tail = segment.slice(bankIdx + bank.length);
              const candidate = extractUsername(tail, bank);
              if (candidate && candidate !== "UNKNOWN") {
                username = candidate;
                break;
              }
            }
          }
        }
      }

      confirmedCount += 1;
      transactions.push({ date, trxId, username, amount });
    } catch (err) {
      // One row failed; log to console but keep going â€” robustness for bulk paste.
      // eslint-disable-next-line no-console
      console.warn("[QRISHOKI parser] Skipped malformed transaction:", err);
      skippedCount += 1;
    }
  }

  transactions.sort(
    (a, b) =>
      new Date(a.date || "1970-01-01").getTime() -
      new Date(b.date || "1970-01-01").getTime(),
  );

  return { transactions, confirmedCount, rejectedCount, skippedCount };
}

export default function GigaCopyDpHoki() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<GigaCopyRow[]>([]);
  const [copiedType, setCopiedType] = useState<"trx" | "qris" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseStats, setParseStats] = useState<ParseResult>({
    transactions: [],
    confirmedCount: 0,
    rejectedCount: 0,
    skippedCount: 0,
  });
  const [gridPreview, setGridPreview] = useState<string[][]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // When the user pastes straight from the panel, the clipboard's text/html
  // (the real table) is captured here and preferred over the glued text/plain.
  const pastedHtmlRef = useRef<string>("");
  const lastPastedPlainRef = useRef<string>("");

  const totalAmount = useMemo(() => {
    return rows.reduce((sum, row) => {
      const value = Number(String(row.deposit ?? "").replace(/,/g, ""));
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }, [rows]);

  const processData = useCallback(() => {
    setIsProcessing(true);
    setError(null);

    window.setTimeout(() => {
      try {
        const html = pastedHtmlRef.current;
        const useHtml = !!html && /<table/i.test(html);
        let result = useHtml
          ? parseGigaQrishokiHtmlTable(html)
          : parseGigaCopyDpHokiDetailed(rawText);
        // Safety net: if the table-read found nothing, fall back to the old
        // text parser so we never do worse than before.
        if (useHtml && result.transactions.length === 0) {
          result = parseGigaCopyDpHokiDetailed(rawText);
        }
        const sortedTxns = [...result.transactions].sort((a, b) => sortByDateAsc(a.date, b.date));
        const mappedRows = sortedTxns.map(mapTransactionToRow);
        setParseStats(result);
        setRows(mappedRows);

        if (!useHtml && !String(rawText ?? "").trim()) {
          setError("Tempel raw text dari tabel dashboard terlebih dahulu.");
          toast.error("Input masih kosong.");
          return;
        }

        if (!mappedRows.length) {
          setError("Tidak ada transaksi Confirmed yang berhasil diparse. Pastikan format text sesuai panel GIGA.");
          toast.error("Data tidak ditemukan.");
          return;
        }

        toast.success(`${mappedRows.length} transaksi berhasil diproses.`);
      } catch (err) {
        console.error("Error processing QRISHOKI text:", err);
        setRows([]);
        setParseStats({ transactions: [], confirmedCount: 0, rejectedCount: 0, skippedCount: 0 });
        setError("Gagal memproses text. Pastikan data tidak corrupt dan format sesuai panel GIGA.");
        toast.error("Gagal memproses text.");
      } finally {
        setIsProcessing(false);
      }
    }, 220);
  }, [rawText]);

  const clearData = useCallback(() => {
    setRawText("");
    setRows([]);
    setError(null);
    setCopiedType(null);
    pastedHtmlRef.current = "";
    lastPastedPlainRef.current = "";
    setGridPreview([]);
    setParseStats({ transactions: [], confirmedCount: 0, rejectedCount: 0, skippedCount: 0 });
  }, []);

  const useSample = useCallback(() => {
    setRawText(SAMPLE_TEXT);
    setRows([]);
    setError(null);
    pastedHtmlRef.current = "";
    lastPastedPlainRef.current = "";
    setGridPreview([]);
    setParseStats({ transactions: [], confirmedCount: 0, rejectedCount: 0, skippedCount: 0 });
  }, []);

  const handleCopyDocTrx = useCallback(async () => {
    if (!rows.length) return;

    const tsv = rows.map(rowToDocTrxArr).map((arr) => arr.join("\t")).join("\n");

    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedType("trx");
      toast.success("Data berhasil disalin ke Doc TRX!");
      window.setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = tsv;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedType("trx");
        toast.success("Data berhasil disalin ke Doc TRX!");
        window.setTimeout(() => setCopiedType(null), 2000);
      } catch (fallbackErr) {
        toast.error("Gagal menyalin ke clipboard.");
        console.error("Clipboard error:", err);
        console.error("Fallback error:", fallbackErr);
      }
    }
  }, [rows]);

  const handleCopyDocQris = useCallback(async () => {
    if (!rows.length) return;

    const tsv = rows
      .map((row) => {
        const cleanTrxId = String(row.nama || "").replace(/[\t\n\r]/g, "").trim();
        const cleanAmount = String(row.deposit || "0").replace(/[\t\n\r]/g, "").trim();

        return [
          cleanTrxId,
          cleanAmount,
          " ",
          "COMPLETED",
        ].join("\t");
      })
      .join("\n");

    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedType("qris");
      toast.success("Data berhasil disalin ke Doc Qris!");
      window.setTimeout(() => setCopiedType(null), 2000);
    } catch {
      toast.error("Gagal menyalin Doc Qris.");
    }
  }, [rows]);

  const exportToExcel = useCallback(() => {
    if (!rows.length) return;

    try {
      const worksheet = XLSX.utils.json_to_sheet(
        rows.map((row) => {
          const obj: Record<string, string> = {};
          const cells = rowToArr(row);
          OUTPUT_HEADERS.forEach((header, index) => {
            obj[header] = cells[index];
          });
          return obj;
        })
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Output QRISHOKI");

      // Auto-size columns
      const colWidths = OUTPUT_HEADERS.map(() => ({ wch: 20 }));
      worksheet["!cols"] = colWidths;

      XLSX.writeFile(workbook, "QRISHOKI_DP_Report_Extract.xlsx");
      toast.success("File Excel berhasil didownload!");
    } catch (err) {
      console.error("Error exporting Excel:", err);
      toast.error("Gagal mengekspor file Excel.");
    }
  }, [rows]);

  // --- Native .xlsx parser (GIGA GAMING Whitelabel System export) ---
  //
  // Format traits:
  //   - Row 0: title banner. Real headers sit on row 1 → use `range: 1`.
  //   - Important columns: Transaction ID, Username, Credit, Status, Fund Method,
  //     "Comfirmed/Rejected time" (native system typo).
  //   - Gatekeeper: Status === "Confirmed" AND Fund Method ~ "Bank / QRISHOKI".
  //
  // Output is bridged through `mapTransactionToRow`, so SUB="BOT", KODE TRANSAKSI="DP",
  // and KODE BANK="" stay consistent with the text-based parser.
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    const reader = new FileReader();
    const cleanupReader = () => {
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    reader.onload = (event) => {
      try {
        const buffer = event.target?.result;
        if (!(buffer instanceof ArrayBuffer)) throw new Error("Gagal membaca buffer file.");

        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error("File Excel tidak memiliki sheet.");
        const worksheet = workbook.Sheets[firstSheetName];

        // `range: 1` skips the title row (row 0) so actual headers on row 1 are used.
        const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          range: 1,
          defval: "",
        });

        const parsed: ParsedTransaction[] = [];
        let confirmed = 0;
        let rejected = 0;
        let skipped = 0;

        for (const row of sheetRows) {
          const status = String(row["Status"] ?? "");
          const fundMethod = String(row["Fund Method"] ?? "");

          // --- STRICT GATEKEEPER ---
          // Must be Confirmed AND Fund Method must be Bank / QRISHOKI
          if (!/Confirmed/i.test(status) || !/Bank\s*\/\s*QRISHOKI/i.test(fundMethod)) {
            if (/Rejected/i.test(status)) {
              rejected += 1;
            } else {
              skipped += 1;
            }
            continue;
          }

          const trxIdRaw = row["Transaction ID"];
          const usernameRaw = row["Username"];
          const amountRaw = row["Credit"] !== "" && row["Credit"] !== undefined
            ? row["Credit"]
            : row["Debit"];
          const dateRaw =
            row["Comfirmed/Rejected time"] ??
            row["Confirmed/Rejected time"] ??
            "";

          const amount = formatExcelAmount(amountRaw);
          if (!amount) {
            skipped += 1;
            continue;
          }

          parsed.push({
            date: formatExcelDate(dateRaw),
            trxId: String(trxIdRaw ?? "-").trim() || "-",
            username: String(usernameRaw ?? "UNKNOWN").trim() || "UNKNOWN",
            amount,
          });
          confirmed += 1;
        }

        parsed.sort(
          (a, b) =>
            new Date(a.date || "1970-01-01").getTime() -
            new Date(b.date || "1970-01-01").getTime()
        );

        const mapped = parsed.map(mapTransactionToRow);
        setRawText("");
        setRows(mapped);
        setParseStats({
          transactions: parsed,
          confirmedCount: confirmed,
          rejectedCount: rejected,
          skippedCount: skipped,
        });

        if (!mapped.length) {
          setError(
            "Tidak ada baris Confirmed + Bank / QRISHOKI yang cocok dalam file Excel."
          );
          toast.error("Data Excel tidak ditemukan.");
        } else {
          toast.success(`${mapped.length} transaksi Excel berhasil diproses.`);
        }
      } catch (err) {
        console.error("Error parsing Excel file:", err);
        setError("Gagal membaca file Excel. Pastikan file tidak corrupt dan format sesuai export GIGA.");
        toast.error("Gagal memproses file Excel.");
      } finally {
        setIsProcessing(false);
        cleanupReader();
      }
    };

    reader.onerror = () => {
      setIsProcessing(false);
      setError("Gagal membaca file Excel.");
      toast.error("Gagal membaca file.");
      cleanupReader();
    };

    reader.onabort = () => {
      setIsProcessing(false);
      setError("Pembacaan file Excel dibatalkan.");
      toast.error("Pembacaan file dibatalkan.");
      cleanupReader();
    };

    try {
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error("Error starting Excel file read:", err);
      setIsProcessing(false);
      setError("Gagal membuka file Excel.");
      toast.error("Gagal membuka file.");
      cleanupReader();
    }
  }, []);

  return (
    <section className="relative z-10 flex flex-col gap-ds-lg text-slate-800">
      {/* TOP MODULE: Input Card */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-ds-2xl border border-white/70 bg-white/65 px-ds-lg py-ds-lg shadow-ds-lg backdrop-blur-2xl"
      >
        <div className="mb-ds-lg flex items-center justify-between gap-ds-md flex-wrap">
          <div className="flex items-center gap-ds-md">
            <div className="flex items-center justify-center rounded-ds-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 p-2.5 shadow-ds-md shadow-indigo-500/25">
              <Layers size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">DP GIGA QRISHOKI</h2>
              <p className="text-xs text-slate-500">Parse DP data dari dashboard GIGA QRISHOKI</p>
            </div>
          </div>
          <button
            type="button"
            onClick={useSample}
            className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold border border-indigo-100 bg-indigo-50/70 text-indigo-600 transition-all hover:border-indigo-200 hover:bg-indigo-100"
          >
            <Wand2 size={15} />
            Use Sample
          </button>
        </div>

        <textarea
          value={rawText}
          onChange={(event) => {
            const val = event.target.value;
            setRawText(val);
            setError(null);
            // Manual edit invalidates a previously-pasted HTML table.
            if (val !== lastPastedPlainRef.current) pastedHtmlRef.current = "";
          }}
          onPaste={(event) => {
            const html = event.clipboardData.getData("text/html");
            if (html && /<table/i.test(html)) {
              event.preventDefault();
              const plain = event.clipboardData.getData("text/plain") || "";
              pastedHtmlRef.current = html;
              lastPastedPlainRef.current = plain;
              setRawText(plain);
              setError(null);
              const grid = sortGridByDateAsc(htmlTableToGrid(html));
              setGridPreview(grid);
              toast.success("Tabel panel terbaca. Klik Process Data untuk generate.");
            }
          }}
          placeholder={INPUT_GUIDANCE}
          className="min-h-[390px] w-full resize-y rounded-ds-2xl border-2 border-dashed border-indigo-200 bg-white/50 p-ds-lg font-mono text-sm leading-7 text-slate-700 shadow-inner shadow-indigo-100/40 outline-none backdrop-blur-md transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white/80 focus:ring-4 focus:ring-indigo-100"
        />

        {gridPreview.length > 0 && (
          <div className="mt-ds-md rounded-ds-xl border border-indigo-200 bg-white/70 p-2 shadow-inner">
            <p className="mb-1 px-1 text-[11px] font-bold text-indigo-700">
              Grid sumber dari panel ({gridPreview.length} baris × {gridPreview[0]?.length ?? 0} kolom) — output diambil per kolom.
            </p>
            <div className="max-h-52 overflow-auto">
              <table className="w-max border-collapse text-[10px]">
                <tbody>
                  {gridPreview.slice(0, 30).map((r, ri) => (
                    <tr key={ri} className={ri === 0 ? "bg-indigo-100 font-bold" : "odd:bg-white even:bg-slate-50"}>
                      {r.map((c, ci) => (
                        <td key={ci} className="max-w-[160px] truncate border border-slate-200 px-1.5 py-0.5 text-slate-700" title={c}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-ds-lg flex flex-col gap-ds-md sm:flex-row">
          <motion.button
            type="button"
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={processData}
            disabled={isProcessing}
            className="inline-flex flex-1 items-center justify-center h-12 px-6 py-3 gap-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 text-white shadow-ds-md shadow-fuchsia-500/25 transition-all hover:shadow-ds-lg hover:shadow-fuchsia-500/35 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Process Data
          </motion.button>
          <button
            type="button"
            onClick={clearData}
            className="inline-flex items-center justify-center h-12 px-6 py-3 gap-2 rounded-xl text-sm font-semibold border border-slate-200 bg-white/60 text-slate-600 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            <Eraser size={17} />
            Clear
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="inline-flex items-center justify-center h-12 px-6 py-3 gap-2 rounded-xl text-sm font-semibold border border-slate-200 bg-white/60 text-slate-600 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Upload size={17} />
            Upload Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-ds-md px-ds-lg py-ds-md rounded-ds-2xl border border-rose-200 bg-rose-50/80 text-rose-700 shadow-ds-md backdrop-blur-xl"
          >
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {rows.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="flex flex-col gap-ds-lg"
        >
          {/* MIDDLE MODULE: Summary Metrics Grid - 4 cards */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-ds-md"
          >
            {/* Card 1: JENIS DATA */}
            <div className="flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-ds-xl glass shadow-ds-sm bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-400/20">
              <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-ds-md shadow-amber-500/30 shrink-0">
                <Layers size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-600/70 font-medium">Jenis Data</p>
                <p className="text-lg font-bold text-amber-700 leading-tight font-mono mt-1">DP QRISHOKI</p>
              </div>
            </div>

            {/* Card 2: TOTAL DATA */}
            <div className="flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
              <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-ds-md shadow-violet-500/30 shrink-0">
                <ListOrdered size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/50 font-medium">Total Data</p>
                <p className="text-2xl font-bold text-white leading-tight font-mono mt-1">{rows.length}</p>
              </div>
            </div>

            {/* Card 3: TOTAL NOMINAL */}
            <div className="flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
              <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-ds-md shadow-emerald-500/30 shrink-0">
                <Banknote size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-white/50 font-medium">Total Nominal</p>
                <p className="text-2xl font-bold text-white leading-tight font-mono mt-1 truncate" title={formatCurrency(totalAmount)}>
                  {formatCurrency(totalAmount)}
                </p>
              </div>
            </div>

            {/* Card 4: ROW FINAL */}
            <div className="flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
              <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-ds-md shadow-fuchsia-500/30 shrink-0">
                <FileText size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/50 font-medium">Row Final</p>
                <p className="text-2xl font-bold text-white leading-tight font-mono mt-1">{rows.length}</p>
              </div>
            </div>
          </motion.div>

          {/* BOTTOM MODULE: Output Table Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-ds-2xl border border-white/70 bg-white/65 shadow-ds-lg backdrop-blur-2xl"
          >
            {/* Action Bar Header */}
            <div className="flex items-center justify-between gap-ds-md px-ds-lg py-ds-md border-b border-slate-200 bg-slate-50/50 sticky top-0 flex-wrap">
              <div className="flex items-center gap-ds-md">
                <h3 className="text-sm font-semibold text-slate-800">Output Preview</h3>
                <p className="text-xs text-slate-500">Hasil mapping ke format spreadsheet.</p>
              </div>
              <div className="flex items-center gap-ds-sm flex-wrap">
                <motion.button
                  type="button"
                  whileHover={{ scale: rows.length ? 1.02 : 1 }}
                  whileTap={{ scale: rows.length ? 0.98 : 1 }}
                  onClick={handleCopyDocTrx}
                  disabled={!rows.length}
                  className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold border-2 border-amber-400 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-ds-md shadow-amber-500/20 transition-all hover:shadow-ds-lg hover:shadow-amber-500/30 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {copiedType === "trx" ? <Check size={15} /> : <Copy size={15} />}
                  {copiedType === "trx" ? "Copied" : "Copy to Doc TRX"}
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: rows.length ? 1.02 : 1 }}
                  whileTap={{ scale: rows.length ? 0.98 : 1 }}
                  onClick={handleCopyDocQris}
                  disabled={!rows.length}
                  className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold border-2 border-cyan-400 bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-ds-md shadow-cyan-500/20 transition-all hover:shadow-ds-lg hover:shadow-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {copiedType === "qris" ? <Check size={15} /> : <Copy size={15} />}
                  {copiedType === "qris" ? "Copied" : "Copy to Doc Qris"}
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: rows.length ? 1.02 : 1 }}
                  whileTap={{ scale: rows.length ? 0.98 : 1 }}
                  onClick={exportToExcel}
                  disabled={!rows.length}
                  className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-ds-md shadow-emerald-500/20 transition-all hover:shadow-ds-lg hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Download size={15} />
                  Export to Excel
                </motion.button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50/50 sticky top-0">
                    {OUTPUT_HEADERS.map((header) => (
                      <th key={header} className="px-ds-md py-ds-sm text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-slate-100 bg-white/40 hover:bg-indigo-50/30 transition-colors">
                      {rowToArr(row).map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-ds-md py-ds-md text-sm text-slate-700 whitespace-nowrap">
                          {cell || "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.section>
      )}
    </section>
  );
}
