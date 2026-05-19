import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Check, Copy, Eraser, FileText, Layers, Loader2, Sparkles, Wand2, Download, ListOrdered, Banknote } from "lucide-react";
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
  username: string;
  bonusType: string;
  amount: string;
  // Confirmed/Rejected timestamp from the panel — used internally to sort
  // rows chronologically (oldest first). Not surfaced to the output table.
  date: string;
}

// Output is intentionally truncated at "KETERANGAN / KODE SN" (column I) for
// the BONUS extractor. The remaining columns (KODE BANK, SALDO AKHIR, JAM
// INPUT WD, INPUT KODE BANK) are not used for bonus transactions, so we
// stop the table/TSV/Excel output at the 9th column.
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
];

const GIGA_BONUS_OUTPUT_SUB = "BOT";
const GIGA_BONUS_OUTPUT_KODE_TRANSAKSI = "BONUS DP";

const SAMPLE_TEXT = "1Game Wallet 2026-05-04 04:40:36 114.122.236.131004AL869f7c0d47f1e0ARDIANSYAH / DANA 082259082915 anjas888019defc8-0c60-6325-e94a-208736f2fec1BONUS DEPOSIT HARIAN 10%Confirmed20,000.001ggabacc@sub0052026-05-04 04:40:37";

function rowToArr(row: GigaCopyRow): string[] {
  // Returns only the 9 columns matching OUTPUT_HEADERS (NAMA → KETERANGAN/KODE SN).
  // The GigaCopyRow interface keeps all 13 fields for backwards compatibility
  // with shared types, but BONUS output is intentionally truncated.
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
  ];
}

function normalizeAmount(value: string): string {
  return value.trim().replace(/\.00$/, "");
}

function mapTransactionToRow(tx: ParsedTransaction): GigaCopyRow {
  return {
    nama: "",
    nomorRekening: "",
    userId: tx.username,
    sub: GIGA_BONUS_OUTPUT_SUB,
    kodeTransaksi: GIGA_BONUS_OUTPUT_KODE_TRANSAKSI,
    deposit: tx.amount,
    withdrawal: "",
    dpPulsa: "",
    keterangan: tx.bonusType,
    kodeBank: "",
    saldoAkhir: "",
    jamInput: "",
    inputKodeBank: "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BONUS Raw-Text Parser (anchor-based, ported from QRISHOKI/ZENPAY)
//
// BONUS panel exports come in TWO shapes that we must handle:
//
//   Shape A (most common — ~95% of rows):
//     <rowNo>\tGame Wallet <date>\t<ip>\t<tracking><trxId>\t<name> / <BANK>\n
//     <account>\n<username>\t<uuid>\t<BONUS_TYPE>\tConfirmed\t<amount>\t...
//
//   Shape B (rare — usually direct bonus credits):
//     <rowNo>\tGame Wallet <date>\t<ip>\t<tracking><trxId>\t<customerName>
//     <username>\t<BONUS_TYPE>\tConfirmed\t<amount>\t...
//
// TRX ID prefix in BONUS panel: BOTH "86a0" and "06a0" appear (verified via
// real production data: 191x "86a0" + 9x "06a0" in a 200-row sample).
//
// Strategy: try Shape A (bank-anchored) first; fall back to Shape B
// (TRX→BONUS keyword) when no bank/UUID structure is found.
// ─────────────────────────────────────────────────────────────────────────────

const BONUS_TRX_ID_REGEX = /(?:86a0|06a0)[a-f0-9]{10}/i;
const BONUS_UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Generic bank detection — same regex as QRISHOKI/ZENPAY, auto-detects
// any UPPERCASE bank identifier (DANA, BCA, BNI, BRI, MANDIRI, SEABANK,
// SUPERBANK, BANK JAGO, ALLO, KROM, BSI, BTN, CIMB, DANAMON, PERMATA, etc.)
const BONUS_BANK_REGEX = /\s\/\s([A-Z][A-Z0-9]{2,}(?:\s[A-Z][A-Z0-9]{2,})?)(?=\s*\d)/;

// Account length range per bank — used to disambiguate digit boundary when
// splitting account number from username. Banks not in this map fall back
// to "strip all leading digits" behavior.
const BONUS_BANK_ACCOUNT_LEN: Record<string, { min: number; max: number }> = {
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

// Bonus type keywords — these mark END of username and START of bonus description.
//
// We capture optional prefix words BEFORE the core keyword so descriptions
// like "WELCOME BONUS 100%" or "NEW MEMBER BONUS 100%" are kept intact
// (without prefix capture, just "BONUS 100%" would be returned).
//
// Prefix patterns observed in real panel exports:
//   • "WELCOME"             (e.g. "WELCOME BONUS 100%")
//   • "NEW MEMBER" / "NEW DEPOSIT" (e.g. "NEW MEMBER BONUS 100%")
//
// Note: do NOT use \b — chat-format paste glues words and JS \b doesn't fire
// on lowercase→uppercase transitions.
const BONUS_KEYWORD_REGEX = /(?:WELCOME\s+)?(?:NEW\s+(?:MEMBER|DEPOSIT)\s+)?(?:BONUS|CASHBACK|REBATE|EVENT|FREESPIN|BUYSPIN|ROLLINGAN)/i;

/**
 * Strip the panel's "Player Remark" color code (1-10) from the end of a username.
 */
function stripRemarkColor(username: string): string {
  return username.replace(/\s+(?:10|[1-9])$/, "");
}

/**
 * Strip the "New" badge appended to new-member usernames.
 */
function stripNewMemberMarker(username: string): string {
  return username.replace(/(\w)\s*New$/, "$1");
}

/**
 * Strip voucher/promo codes appended to a username.
 * All UPPERCASE, ≥8 chars, ≥2 digits & 2 letters.
 */
function stripVoucherSuffix(username: string): string {
  const match = username.match(/^(.*[a-z])\s*([A-Z][A-Z0-9]{7,})$/);
  if (!match) return username;
  const suffix = match[2];
  const digitCount = (suffix.match(/\d/g) || []).length;
  const letterCount = (suffix.match(/[A-Z]/g) || []).length;
  if (digitCount < 2 || letterCount < 2) return username;
  return match[1];
}

/**
 * Apply all panel-marker cleanups in order:
 *   1. Strip remark color code (1-10)
 *   2. Strip "New" badge
 *   3. Strip voucher/promo code suffix
 */
function cleanUsername(username: string): string {
  return stripVoucherSuffix(
    stripNewMemberMarker(stripRemarkColor(username)),
  );
}

/**
 * Extract username from "<account><username>" segment between bank and UUID.
 * Same algorithm as QRISHOKI: try every plausible account-length split,
 * pick the one yielding the cleanest username (letter > digit > zero start).
 */
function extractUsernameFromBankSegment(between: string, bankName: string): string {
  const trimmed = between.trim();
  if (!trimmed) return "UNKNOWN";

  const digitMatch = trimmed.match(/^\d+/);
  if (!digitMatch) return cleanUsername(trimmed);

  const totalDigits = digitMatch[0].length;
  const config = BONUS_BANK_ACCOUNT_LEN[bankName];
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
  candidates.sort((a, b) => b.quality - a.quality || b.strip - a.strip);
  return cleanUsername(candidates[0].username);
}

export function parseGigaCopyBonus(rawText: string): ParsedTransaction[] {
  const cleanText = rawText
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s{2,}/g, " ");

  // Split on "<digit run> Game Wallet" but only at string start or after a
  // whitespace, so multi-digit row numbers like "192" don't get pulverized.
  const blocks = cleanText.split(/(?=(?:^|\s)\d+\s?Game Wallet)/i);
  const transactions: ParsedTransaction[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (block.length < 50 || !/Game Wallet/i.test(block)) continue;

    // Per-block try/catch — one corrupt row shouldn't kill the entire parse.
    try {
      // --- GATEKEEPER ---
      if (/Rejected/i.test(block)) continue;
      if (!/Confirmed/i.test(block)) continue;

      // --- AMOUNT (after "Confirmed", to avoid year-2026 false matches) ---
      const amountMatch = block.match(
        /Confirmed\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?)/i,
      );
      if (!amountMatch) continue;
      const amount = normalizeAmount(amountMatch[1]);

      // --- USERNAME EXTRACTION (Shape A: bank-anchored, primary path) ---
      let username = "UNKNOWN";
      const uuidMatch = block.match(BONUS_UUID_REGEX);
      const bankMatch = block.match(BONUS_BANK_REGEX);
      if (
        uuidMatch &&
        uuidMatch.index !== undefined &&
        bankMatch &&
        bankMatch.index !== undefined
      ) {
        const bankName = bankMatch[1].toUpperCase();
        const between = block.slice(
          bankMatch.index + bankMatch[0].length,
          uuidMatch.index,
        );
        username = extractUsernameFromBankSegment(between, bankName);
      } else {
        // --- FALLBACK (Shape B: no bank info, ZENPAY-style anchor) ---
        const trxIdMatch = block.match(BONUS_TRX_ID_REGEX);
        if (trxIdMatch && trxIdMatch.index !== undefined) {
          const trxIdEnd = trxIdMatch.index + trxIdMatch[0].length;
          const segmentAfter = block.slice(trxIdEnd);
          const bonusKwMatch = segmentAfter.match(BONUS_KEYWORD_REGEX);
          if (bonusKwMatch && bonusKwMatch.index !== undefined) {
            let segment = block
              .slice(trxIdEnd, trxIdEnd + bonusKwMatch.index)
              .trim();
            segment = stripRemarkColor(segment);
            segment = stripNewMemberMarker(segment);
            const parts = segment.split(/\s+/).filter(Boolean);
            if (parts.length > 0) {
              username = cleanUsername(parts[parts.length - 1]);
            }
          }
        }
      }

      // --- BONUS TYPE = from BONUS keyword to "Confirmed" ---
      let bonusType = "-";
      const bonusKeywordMatch = block.match(BONUS_KEYWORD_REGEX);
      if (bonusKeywordMatch && bonusKeywordMatch.index !== undefined) {
        const seg = block.slice(bonusKeywordMatch.index);
        const confirmedIdx = seg.search(/Confirmed/i);
        bonusType = confirmedIdx > 0 ? seg.slice(0, confirmedIdx).trim() : bonusKeywordMatch[0];
      }

      // --- ADMIN USERNAME = the operator name between "Confirmed <amount>"
      // and the trailing date2. Admin can include letters, digits, dots, @,
      // hyphens, underscores (e.g. "ganas33qrishoki", "jiss", "1ggabacc@sub005").
      let adminName = "";
      const adminMatch = block.match(
        /Confirmed\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?\s*([a-zA-Z0-9][a-zA-Z0-9_.@-]*)\s*(?=\d{4}-\d{2}-\d{2})/i,
      );
      if (adminMatch && adminMatch[1]) {
        adminName = adminMatch[1];
      }

      // Compose KETERANGAN as "<admin>-<bonusType>" (e.g.
      // "ganas33qrishoki-BONUS DEPOSIT HARIAN 10%"). Fall back to bonusType
      // alone when admin couldn't be parsed (graceful degradation).
      const keterangan = adminName ? `${adminName}-${bonusType}` : bonusType;

      // --- CONFIRMED TIME = the LAST timestamp in the row ---
      // Each row contains 2 timestamps: the request time (first) and the
      // confirmed/rejected time (last). We use the last one for sorting
      // since it represents when the bonus actually completed.
      const dateMatches = block.match(/\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/g) || [];
      const date = dateMatches.length ? dateMatches[dateMatches.length - 1] : "";

      transactions.push({ username, bonusType: keterangan, amount, date });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[BONUS parser] Skipped malformed transaction:", err);
    }
  }

  // Sort by confirmed time ASCENDING (oldest first → newest last) so the
  // output spreadsheet is chronologically ordered for downstream processing.
  transactions.sort(
    (a, b) =>
      new Date(a.date || "1970-01-01").getTime() -
      new Date(b.date || "1970-01-01").getTime(),
  );

  return transactions;
}

export default function GigaCopyBonus() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<GigaCopyRow[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const totalNominal = useMemo(() => {
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
        const parsed = parseGigaCopyBonus(rawText);
        const mappedRows = parsed.map(mapTransactionToRow);
        setRows(mappedRows);

        if (!String(rawText ?? "").trim()) {
          setError("Tempel raw text dari tabel dashboard terlebih dahulu.");
          toast.error("Input masih kosong.");
          return;
        }

        if (!mappedRows.length) {
          setError("Tidak ada transaksi bonus yang berhasil diparse. Pastikan format text sesuai panel BONUS.");
          toast.error("Data tidak ditemukan.");
          return;
        }

        toast.success(`${mappedRows.length} transaksi berhasil diproses.`);
      } catch (err) {
        console.error("Error processing BONUS text:", err);
        setRows([]);
        setError("Gagal memproses text. Pastikan data tidak corrupt dan format sesuai panel BONUS.");
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
    toast.info("Data dihapus.");
  };

  const copyToClipboard = async () => {
    if (!rows.length) return;

    const tsv = rows.map(rowToArr).map((arr) => arr.join("\t")).join("\n");
    
    try {
      await navigator.clipboard.writeText(tsv);
      setIsCopied(true);
      toast.success("Data berhasil disalin ke clipboard!");
      window.setTimeout(() => setIsCopied(false), 2000);
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
        setIsCopied(true);
        toast.success("Data berhasil disalin ke clipboard!");
        window.setTimeout(() => setIsCopied(false), 2000);
      } catch (fallbackErr) {
        toast.error("Gagal menyalin ke clipboard.");
        console.error("Clipboard error:", err);
        console.error("Fallback error:", fallbackErr);
      }
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Output Bonus");

    // Auto-size columns
    const colWidths = OUTPUT_HEADERS.map(() => ({ wch: 20 }));
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, "Bonus_Report_Extract.xlsx");
    toast.success("File Excel berhasil didownload!");
  };

  const useSample = () => {
    setRawText(SAMPLE_TEXT);
    setError(null);
    toast.success("Sample text dimuat.");
  };

  return (
    <section className="relative z-10 flex flex-col gap-lg text-slate-800">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-ds-2xl border border-white/70 bg-white/65 px-lg py-lg shadow-ds-lg backdrop-blur-2xl"
      >
        <div className="mb-lg flex items-center justify-between gap-md flex-wrap">
          <div className="flex items-center gap-md">
            <div className="flex items-center justify-center rounded-ds-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 p-2.5 shadow-ds-md shadow-indigo-500/25">
              <Layers size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Copy Extract BONUS FORM</h2>
              <p className="text-xs text-slate-500">Parse bonus data dari dashboard GIGA</p>
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
          {/* Stat cards - EXACTLY 4 cards */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md"
          >
            {/* Card 1: JENIS BONUS */}
            <div className="flex items-center gap-md px-lg py-lg rounded-ds-xl glass shadow-ds-sm bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-400/20">
              <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-ds-md shadow-amber-500/30 shrink-0">
                <Layers size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-600/70 font-medium">Jenis Bonus</p>
                <p className="text-lg font-bold text-amber-700 leading-tight font-mono mt-1">BONUS DP</p>
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
                <p className="text-2xl font-bold text-white leading-tight font-mono mt-1 truncate" title={formatCurrency(totalNominal)}>
                  {formatCurrency(totalNominal)}
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

          {/* Output Table & Action Bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-ds-2xl border border-white/70 bg-white/65 shadow-ds-lg backdrop-blur-2xl"
          >
            {/* Action Bar Header */}
            <div className="flex items-center justify-between gap-md px-lg py-md border-b border-white/10 bg-white/40 flex-wrap">
              <div className="flex items-center gap-md">
                <h3 className="text-sm font-semibold text-slate-800">Output Preview</h3>
                <p className="text-xs text-slate-500">Hasil mapping ke format spreadsheet.</p>
              </div>
              <div className="flex items-center gap-sm flex-wrap">
                <motion.button
                  type="button"
                  whileHover={{ scale: rows.length ? 1.02 : 1 }}
                  whileTap={{ scale: rows.length ? 0.98 : 1 }}
                  onClick={copyToClipboard}
                  disabled={!rows.length}
                  className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold border-2 border-amber-400 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-ds-md shadow-amber-500/20 transition-all hover:shadow-ds-lg hover:shadow-amber-500/30 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {isCopied ? <Check size={15} /> : <Copy size={15} />}
                  {isCopied ? "Copied" : "Copy to Spreadsheet"}
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
