import { useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Check, Copy, Eraser, FileText, Layers, Loader2, Sparkles, Wand2, Download, ListOrdered, Banknote, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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

const SAMPLE_TEXT = "1Game Wallet 2026-05-04 23:10:47 202.65.239.152003OK869f8c507343bcDwi angga yuda / DANA 082351054946 yuda89 1019df3c1-18bb-2abd-c386-11fdfd50d248Bank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKI QRISHOKI Confirmed80,000.001ggabacc@sub0052026-05-04 23:10:47";

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

function mapTransactionToRow(tx: ParsedTransaction): GigaCopyRow {
  return {
    nama: tx.trxId,
    nomorRekening: "NO ACC",
    userId: tx.username,
    sub: GIGA_QRISHOKI_OUTPUT_SUB,
    kodeTransaksi: GIGA_QRISHOKI_OUTPUT_KODE_TRANSAKSI,
    deposit: tx.amount,
    withdrawal: "",
    dpPulsa: "",
    keterangan: tx.date,
    kodeBank: "",
    saldoAkhir: "",
    jamInput: "",
    inputKodeBank: "",
  };
}

export function parseGigaCopyDpHoki(rawText: string): ParsedTransaction[] {
  return parseGigaCopyDpHokiDetailed(rawText).transactions;
}

// ─────────────────────────────────────────────────────────────────────────────
// QRISHOKI Raw-Text Parser (anchor-based)
//
// Each transaction in the panel export looks like this (no whitespace between
// most fields — they are concatenated in the source HTML/clipboard):
//
//   <rowNo>Game Wallet <date1> <ip><tracking><trxId><customerName> /
//   <BANK><accountNo><username><uuid>Bank / QRISHOKI...QRISHOKI<status>
//   <amount><adminUser>qrishoki<date2>
//
// Stable anchors we exploit:
//   • TRX ID  → /86a0[a-f0-9]{10}/  (14 chars, panel-specific prefix)
//   • UUID    → /019e3[0-9a-f]-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
//   • Bank    → fixed enum (DANA / BCA / BNI / BRI / MANDIRI / SEABANK / OVO /
//               BANK JAGO / GOPAY / LINKAJA)
//   • Status  → /Confirmed|Rejected/
//   • Date    → /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/
//
// We do NOT rely on whitespace, IP shape, or UUID v4 layout — those are unreliable.
// ─────────────────────────────────────────────────────────────────────────────

const TRX_ID_REGEX = /86a0[a-f0-9]{10}/i;
// Standard UUID format (v4/v7): 8-4-4-4-12 hex with hyphens.
// Panel uses UUIDv7 with timestamp prefix that increments over time
// (019e36XX, 019e37XX, 019e38XX, ...), so we match the generic shape.
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const IPV4_REGEX = /(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}/;
// Require near-full IPv6 (≥7 segments) so we don't match HH:MM:SS time strings.
const IPV6_REGEX = /(?:[0-9a-f]{1,4}:){6,7}[0-9a-f]{1,4}/i;
const DATE_REGEX = /\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/g;

// ─────────────────────────────────────────────────────────────────────────────
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
//   • E-wallets: DANA, OVO, GOPAY, LINKAJA
//   • Traditional: BCA, BNI, BRI, MANDIRI, BSI, BTN, CIMB, DANAMON, PERMATA
//   • Digital: SEABANK, SUPERBANK, BANK JAGO, ALLO, KROM
//
// Min 3 chars to avoid matching stray initials like " / X 123".
// ─────────────────────────────────────────────────────────────────────────────
const BANK_REGEX = /\s\/\s([A-Z][A-Z0-9]{2,}(?:\s[A-Z][A-Z0-9]{2,})?)(?=\s*\d)/;

// Account length range per bank — used to disambiguate when the digit run
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
 *   "ragelku 1"      → "ragelku"      ✅
 *   "endah89 7"      → "endah89"      ✅ (only the trailing " 7" stripped)
 *   "jekpotmania6 7" → "jekpotmania6" ✅
 *   "user 10"        → "user"         ✅ (10 is valid remark code)
 *   "rivania02"      → "rivania02"    ✅ (no space, preserved)
 *   "404notfond"     → "404notfond"   ✅ (no space, preserved)
 *   "user 99"        → "user 99"      ✅ (99 not a valid remark code, preserved)
 *   "user 11"        → "user 11"      ✅ (11 not a valid remark code, preserved)
 */
function stripRemarkColor(username: string): string {
  // Match trailing " 1" through " 9" or " 10" (with whitespace separator).
  // Use anchored regex with explicit alternation so " 11", " 99", " 0" don't match.
  return username.replace(/\s+(?:10|[1-9])$/, "");
}

/**
 * Strip the "New" badge that the panel appends to new-member usernames
 * (e.g. "tiyara57New" → "tiyara57", "letjend3 New" → "letjend3").
 *
 * The panel renders a "New" badge next to new members which gets concatenated
 * into the username string when copied. We strip the trailing "New" marker
 * — note the case-sensitive capital N — to keep usernames clean.
 *
 * To avoid false positives we require the "New" to be preceded by a word
 * character or whitespace, and only strip the literal capitalization "New"
 * (not "NEW" or "new"). This means usernames like "Andrew" or "Newton" are
 * left untouched (their lowercase "n" prevents the match).
 *
 * Examples:
 *   "tiyara57New"        → "tiyara57"     ✅
 *   "almizan12New"       → "almizan12"    ✅
 *   "melaniyNew"         → "melaniy"      ✅
 *   "letjend3 New"       → "letjend3"     ✅ (whitespace separator)
 *   "letjend3  New"      → "letjend3"     ✅
 *   "Andrew"             → "Andrew"       ✅ (lowercase n, no match)
 *   "userNEW"            → "userNEW"      ✅ (all caps, no match)
 *   "newuser"            → "newuser"      ✅ ("New" not at end)
 */
function stripNewMemberMarker(username: string): string {
  return username.replace(/(\w)\s*New$/, "$1");
}

/**
 * Strip voucher/promo codes that the panel sometimes appends to a username
 * (e.g. "ongkyaisyahGS2AAAF00LJ" → "ongkyaisyah").
 *
 * Voucher pattern observed in panel exports:
 *   - All UPPERCASE
 *   - Length 8-15 chars
 *   - Contains at least 2 digits AND 2 letters
 *   - Appears as suffix to a lowercase/mixed-case username
 *   - May be separated by whitespace (HTML cell wrap → newline → normalized to space)
 *
 * Heuristic: If username ends with [optional whitespace + UPPERCASE-with-digits run]
 * AND the part before it ends with a lowercase letter, strip the UPPERCASE run.
 *
 * Examples:
 *   "ongkyaisyahGS2AAAF00LJ"     → "ongkyaisyah"   ✅ (no separator)
 *   "ongkyaisyah GS2AAAF00LJ"    → "ongkyaisyah"   ✅ (space separator from HTML wrap)
 *   "ongkyaisyah  GS2AAAF00LJ"   → "ongkyaisyah"   ✅ (multi-space)
 *   "GACOR123"                   → "GACOR123"      ✅ (no lowercase prefix)
 *   "user123"                    → "user123"       ✅ (no upper suffix)
 *   "userABC"                    → "userABC"       ✅ (no digit in suffix)
 *   "404notfond"                 → "404notfond"    ✅ (no upper suffix)
 *   "ragelku 1"                  → "ragelku 1"     ✅ ("1" not uppercase)
 */
function stripVoucherSuffix(username: string): string {
  // Allow optional whitespace between the lowercase prefix and the UPPERCASE
  // voucher suffix (panels sometimes wrap usernames across HTML cells which
  // becomes a space after whitespace normalization).
  const match = username.match(/^(.*[a-z])\s*([A-Z][A-Z0-9]{7,})$/);
  if (!match) return username;

  const suffix = match[2];
  // Suffix must contain at least 2 digits AND 2 letters to be considered a
  // voucher code (avoids stripping legitimate ALL-CAPS portions like "JOHN").
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
 *     "userBONUS123XYZNew 7" → "user".
 */
function cleanUsername(username: string): string {
  return stripVoucherSuffix(
    stripNewMemberMarker(stripRemarkColor(username)),
  );
}

/**
 * Extract username from the substring between `BANK + space` and the UUID.
 *
 * The substring is the form `<accountDigits><username>` with no separator.
 * Indonesian e-wallets (DANA, OVO, GOPAY, LINKAJA) accept 11-, 12-, or 13-digit
 * accounts, so we cannot hardcode the split point. Instead we score every
 * plausible split:
 *
 *   • letter start    → quality 100 (almost certainly correct)
 *   • non-zero digit  → quality 50  (possible — usernames like "404notfond")
 *   • zero digit      → quality 10  (very rare — usually means we over-stripped)
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

  // Unknown bank → strip the entire leading digit run.
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
  const cleanText = rawText.replace(/[\n\r\t]+/g, " ").replace(/\s{2,}/g, " ");

  // Split on the row-number prefix that separates each transaction
  // (e.g. "1Game Wallet ...", "1\tGame Wallet ...", "1 Game Wallet ..."). Some
  // panel exports use tabs/spaces between the row number and "Game Wallet".
  // After whitespace normalization the separator is collapsed to one space.
  const blocks = cleanText.split(/(?=\d+\s?Game Wallet)/i);

  const transactions: ParsedTransaction[] = [];
  let confirmedCount = 0;
  let rejectedCount = 0;
  let skippedCount = 0;

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (block.length < 50 || !/Game Wallet/i.test(block)) {
      if (block.length > 0) skippedCount += 1;
      continue;
    }

    // Wrap each block in try/catch so one corrupt transaction doesn't kill
    // the entire parse — critical when processing thousands of rows.
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
        const bankName = bankMatch[1].toUpperCase();
        const bankNameEnd = bankMatch.index + bankMatch[0].length;
        const uuidStart = uuidMatch.index;
        const between = block.slice(bankNameEnd, uuidStart);
        username = extractUsername(between, bankName);
      }

      confirmedCount += 1;
      transactions.push({ date, trxId, username, amount });
    } catch (err) {
      // One row failed; log to console but keep going — robustness for bulk paste.
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const totalAmount = useMemo(() => {
    return rows.reduce((sum, row) => {
      const value = Number(String(row.deposit ?? "").replace(/,/g, ""));
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }, [rows]);

  const formatCurrency = (value: number): string => {
    return "Rp " + value.toLocaleString("id-ID");
  };

  const processData = () => {
    setIsProcessing(true);
    setError(null);

    window.setTimeout(() => {
      try {
        const result = parseGigaCopyDpHokiDetailed(rawText);
        const mappedRows = result.transactions.map(mapTransactionToRow);
        setParseStats(result);
        setRows(mappedRows);

        if (!String(rawText ?? "").trim()) {
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
  };

  const clearData = () => {
    setRawText("");
    setRows([]);
    setError(null);
    setCopiedType(null);
    setParseStats({ transactions: [], confirmedCount: 0, rejectedCount: 0, skippedCount: 0 });
  };

  const useSample = () => {
    setRawText(SAMPLE_TEXT);
    setRows([]);
    setError(null);
    setParseStats({ transactions: [], confirmedCount: 0, rejectedCount: 0, skippedCount: 0 });
  };

  const handleCopyDocTrx = async () => {
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
  };

  const handleCopyDocQris = async () => {
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
  };

  const exportToExcel = () => {
    if (!rows.length) return;

    const worksheet = XLSX.utils.json_to_sheet(
      rows.map((row) => {
        const obj: any = {};
        OUTPUT_HEADERS.forEach((header, i) => {
          obj[header] = rowToArr(row)[i];
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
  };

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
  const formatExcelAmount = (raw: unknown): string => {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw.toLocaleString("en-US");
    }
    const str = String(raw ?? "").trim();
    if (!str) return "";
    const numeric = Number(str.replace(/,/g, ""));
    if (Number.isFinite(numeric)) return numeric.toLocaleString("en-US");
    return str;
  };

  const formatExcelDate = (raw: unknown): string => {
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return (
        `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())} ` +
        `${pad(raw.getHours())}:${pad(raw.getMinutes())}:${pad(raw.getSeconds())}`
      );
    }
    return String(raw ?? "").trim();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
  };

  return (
    <section className="relative z-10 flex flex-col gap-lg text-slate-800">
      {/* TOP MODULE: Input Card */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-ds-2xl border border-white/70 bg-white/65 px-lg py-lg shadow-ds-lg backdrop-blur-2xl"
      >
        <div className="mb-lg flex items-center justify-between gap-md flex-wrap">
          <div className="flex items-center gap-md">
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
            setRawText(event.target.value);
            setError(null);
          }}
          placeholder="Paste raw copied table text here..."
          className="min-h-[390px] w-full resize-y rounded-ds-2xl border-2 border-dashed border-indigo-200 bg-white/50 p-lg font-mono text-sm leading-7 text-slate-700 shadow-inner shadow-indigo-100/40 outline-none backdrop-blur-md transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white/80 focus:ring-4 focus:ring-indigo-100"
        />

        <div className="mt-lg flex flex-col gap-md sm:flex-row">
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
            className="flex items-start gap-md px-lg py-md rounded-ds-2xl border border-rose-200 bg-rose-50/80 text-rose-700 shadow-ds-md backdrop-blur-xl"
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
          className="flex flex-col gap-lg"
        >
          {/* MIDDLE MODULE: Summary Metrics Grid - 4 cards */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md"
          >
            {/* Card 1: JENIS DATA */}
            <div className="flex items-center gap-md px-lg py-lg rounded-ds-xl glass shadow-ds-sm bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-400/20">
              <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-ds-md shadow-amber-500/30 shrink-0">
                <Layers size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-600/70 font-medium">Jenis Data</p>
                <p className="text-lg font-bold text-amber-700 leading-tight font-mono mt-1">DP QRISHOKI</p>
              </div>
            </div>

            {/* Card 2: TOTAL DATA */}
            <div className="flex items-center gap-md px-lg py-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
              <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-ds-md shadow-violet-500/30 shrink-0">
                <ListOrdered size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/50 font-medium">Total Data</p>
                <p className="text-2xl font-bold text-white leading-tight font-mono mt-1">{rows.length}</p>
              </div>
            </div>

            {/* Card 3: TOTAL NOMINAL */}
            <div className="flex items-center gap-md px-lg py-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
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
            <div className="flex items-center gap-md px-lg py-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
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
            <div className="flex items-center justify-between gap-md px-lg py-md border-b border-slate-200 bg-slate-50/50 sticky top-0 flex-wrap">
              <div className="flex items-center gap-md">
                <h3 className="text-sm font-semibold text-slate-800">Output Preview</h3>
                <p className="text-xs text-slate-500">Hasil mapping ke format spreadsheet.</p>
              </div>
              <div className="flex items-center gap-sm flex-wrap">
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
                      <th key={header} className="px-md py-sm text-left text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100 bg-white/40 hover:bg-indigo-50/30 transition-colors">
                      {rowToArr(row).map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-md py-md text-sm text-slate-700 whitespace-nowrap">
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
