import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Banknote,
  Check,
  Copy,
  Download,
  Eraser,
  FileText,
  Layers,
  ListOrdered,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { useCallback, useMemo, useRef, useState } from "react";

// Reuse the column-precise table parser from QRISHOKI — the ZENPAY panel has the
// same columns (Username, Transaction ID, Credit, Status, Transaction Date).
import { htmlTableToGrid, parseGigaQrishokiGrid, sortByDateAsc, sortGridByDateAsc } from "./GigaCopyDpHoki";

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

const GIGA_ZENPAY_OUTPUT_SUB = "BOT";
const GIGA_ZENPAY_OUTPUT_KODE_TRANSAKSI = "DP";

export const SAMPLE_TEXT = `2
Game Wallet 2026-06-04 23:19:31 114.8.207.16
00MEF06a21a592cafbb (https://giga2-ns3-admin.net/transactions/t_depositform/00MEF06a21a592cafbb)
Gunan
ettu2008 (https://giga2-ns3-admin.net/member_details/DGAABAF00MEF)
New (https://giga2-ns3-admin.net/member_details/DGAABAF00MEF)
Payment Gateway
ZENPAY88 / QRIS
Confirmed
33,000.00
Auto System
2026-06-04 23:20:29
3
Game Wallet 2026-06-04 21:29:49 114.5.102.85
0080R06a218bdc6880c (https://giga2-ns3-admin.net/transactions/t_depositform/0080R06a218bdc6880c)
M RIZKY PRAYOGA
rizky5555 (https://giga2-ns3-admin.net/member_details/DGAABAF0080R)
AFKRHDYBM
Payment Gateway
ZENPAY88 / QRIS
Confirmed
150,000.00
Auto System
2026-06-04 21:30:52`;

const INPUT_GUIDANCE =
  "Paste data hasil copy dari panel ZENPAY. Minimal harus berisi Game Wallet, Transaction ID, username, Payment Gateway, ZENPAY88 / QRIS, Confirmed, nominal, Auto System, dan waktu confirmed. Klik Use Sample untuk contoh valid.";

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

function normalizeAmount(value: string): string {
  return value.trim().replace(/\.00$/, "");
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

// ─────────────────────────────────────────────────────────────────────────────
// Username badge cleanup helpers (ported from QRISHOKI parser)
//
// The panel appends three kinds of suffixes to usernames that the basic text
// parser sometimes captures. These helpers run AFTER username extraction to
// remove those suffixes — they are safe to apply regardless of how the
// username was extracted.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip the panel's "Player Remark" color code (1-10) from the end of a
 * username. The badge appears with a whitespace separator after the username
 * (e.g. "loo11 1" → "loo11").
 */
function stripRemarkColor(username: string): string {
  return username.replace(/\s+(?:10|[1-9])$/, "");
}

/**
 * Strip the "New" badge appended to new-member usernames (e.g.
 * "ganas112llllNew" → "ganas112llll", "kontolodon87 New" → "kontolodon87").
 * Case-sensitive "New" only.
 */
function stripNewMemberMarker(username: string): string {
  return username.replace(/(\w)\s*New$/, "$1");
}

/**
 * Strip voucher/promo codes appended to a username (e.g.
 * "userGS2AAAF00LJ" → "user"). All UPPERCASE, ≥8 chars, ≥2 digits & 2 letters,
 * or AF-prefixed referral codes copied from the adjacent Ref ID column.
 */
function stripVoucherSuffix(username: string): string {
  const match = username.match(/^(.*[a-z0-9])\s*([A-Z][A-Z0-9]{7,})$/);
  if (!match) return username;
  const suffix = match[2];
  if (/^AF[A-Z0-9]{6,13}$/.test(suffix)) return match[1];

  const digitCount = (suffix.match(/\d/g) || []).length;
  const letterCount = (suffix.match(/[A-Z]/g) || []).length;
  if (digitCount < 2 || letterCount < 2) return username;
  return match[1];
}

/**
 * Apply all panel-marker cleanups in order:
 *   1. Strip remark color code (1-10 with whitespace separator)
 *   2. Strip "New" badge for new members
 *   3. Strip voucher/promo code suffix
 */
/**
 * Strip panel-rendered member-detail URLs (any shape, anywhere).
 *
 * Patterns handled:
 *   "user (https://...)"                            â†’ "user"
 *   "user (https://...) New (https://...)"          â†’ "user New"
 *   "user https://..."                              â†’ "user"
 *   "user (BONUS)"  (non-URL parens)                â†’ "user (BONUS)" preserved
 */
function stripPanelUrl(username: string): string {
  return username
    .replace(/\s*\([^)]*https?:\/\/[^)]*\)/gi, " ")
    .replace(/\s*https?:\/\/\S+/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Final defensive scrub: strip any character that is not [A-Za-z0-9_] from
 * the beginning and end of the string.
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

export function parseGigaCopyDpZenpay(rawText: string): ParsedTransaction[] {
  // 1. Normalize spacing but keep the core text intact.
  // Robust to non-breaking spaces, zero-width separators, and other Unicode
  // whitespace browser copy-paste can introduce (see GigaCopyDpHoki for the
  // full rationale).
  let cleanText = rawText
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\n\r\t]+/g, " ")
    .replace(/\s{2,}/g, " ");

  // Fix broken IPs (e.g., "192.168.1. 106" -> "192.168.1.106")
  cleanText = cleanText.replace(/(\d{1,3}\.\s+)(\d{1,3})/g, "$1$2");

  // 2. Split into individual transaction blocks
  // Use row-number-aware anchor like QRISHOKI to handle "1Game Wallet" etc.
  // Tolerate "GameWallet" without space (zero-width separators stripped).
  const blocks = cleanText.split(/(?=\d+\s?Game\s?Wallet)/i);
  const transactions: ParsedTransaction[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (block.length < 50 || !/Game\s?Wallet/i.test(block)) continue;

    // Per-block try/catch — robustness for bulk paste (100k+ rows).
    try {
      // --- GATEKEEPER ---
      if (!/ZENPAY88\s*\/\s*QRIS/i.test(block)) continue;
      if (/Rejected/i.test(block)) continue;
      if (!/Confirmed/i.test(block)) continue;

      // --- AMOUNT EXTRACTION ---
      const amountMatch = block.match(
        /Confirmed\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?)/i,
      );
      if (!amountMatch) continue;
      const amount = normalizeAmount(amountMatch[1]);

      // --- DATE EXTRACTION (last date = confirmed time) ---
      const dateRegex = /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}|\d{1,2}\/\d{1,2}\/\d{4}\s\d{2}:\d{2}:\d{2})/g;
      const allDates = block.match(dateRegex);
      const date = allDates && allDates.length > 0 ? allDates[allDates.length - 1] : "";

      // --- TRX ID EXTRACTION (anchor-based, ZENPAY prefix is "06a") ---
      let trxId = "-";
      const trxIdAnchorMatch = block.match(/06a[0-9a-f][a-f0-9]{10}/i);
      if (trxIdAnchorMatch && trxIdAnchorMatch.index !== undefined) {
        const trxIdRaw = trxIdAnchorMatch[0];
        const trxIdStart = trxIdAnchorMatch.index;
        // Tracking code = chars between IP and TRX ID
        let tracking = "";
        const ipv4 = block.match(/(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}/);
        const ipv6 = block.match(/(?:[0-9a-f]{1,4}:){6,7}[0-9a-f]{1,4}/i);
        let ipEnd = -1;
        if (ipv4 && ipv4.index !== undefined) ipEnd = ipv4.index + ipv4[0].length;
        if (ipv6 && ipv6.index !== undefined) {
          const ipv6End = ipv6.index + ipv6[0].length;
          if (ipv6End > ipEnd && ipv6End <= trxIdStart) ipEnd = ipv6End;
        }
        if (ipEnd > 0 && ipEnd <= trxIdStart) {
          tracking = block.slice(ipEnd, trxIdStart).trim();
        }
        trxId = `${tracking}${trxIdRaw}`;
      } else {
        // Fallback to old IP-tracker approach if anchor fails
        const ipMatch = block.match(/\d{1,3}(?:\.\d{1,3}){3}/);
        if (ipMatch) {
          const afterIpIndex = block.indexOf(ipMatch[0]) + ipMatch[0].length;
          const textAfterIp = block.substring(afterIpIndex).trim();
          const words = textAfterIp.split(/\s+/);
          if (words.length > 0) {
            if (words[0].length >= 14) {
              trxId = words[0];
            } else if (words.length > 1) {
              const glued = words[0] + words[1];
              if (glued.length >= 14 && /^[A-Za-z0-9]+$/.test(glued)) {
                trxId = glued;
              } else {
                trxId = words[0];
              }
            }
          }
        }
      }

      // --- USERNAME EXTRACTION ---
      // The panel exports separate customer name and username with TAB or
      // NEWLINE characters in the original HTML clipboard data. After our
      // whitespace normalization (\t \n → space), the segment between TRX ID
      // and "Payment Gateway" looks like:
      //
      //   "SANUBARI sanu123"
      //   "Risaldi Saputra cacau8"
      //   "MISWARDI IBRAHIM ganas112llllNew"
      //   "firman alfin badar ainan racas12"
      //
      // So username = LAST WORD in that segment, after stripping badges.
      // This works because the panel ALWAYS puts customer name and username
      // in separate <td> cells which become whitespace-separated after copy.
      let username = "UNKNOWN";
      const trxIdAnchorMatchForUser = block.match(/06a[0-9a-f][a-f0-9]{10}/i);
      if (trxIdAnchorMatchForUser && trxIdAnchorMatchForUser.index !== undefined) {
        const trxIdEnd = trxIdAnchorMatchForUser.index + trxIdAnchorMatchForUser[0].length;
        const pgMatch = block.slice(trxIdEnd).match(/Payment\s+Gateway/i);
        if (pgMatch && pgMatch.index !== undefined) {
          let segment = block.slice(trxIdEnd, trxIdEnd + pgMatch.index).trim();
          // Peel URLs and badges from the entire customer+username segment
          // before taking the last word. New panel copies can emit:
          //   "Gunan ettu2008 (url) New (url)"
          //   "M RIZKY PRAYOGA rizky5555 (url) AFKRHDYBM"
          segment = cleanUsername(segment);
          // Username = last whitespace-separated word
          const parts = segment.split(/\s+/).filter(Boolean);
          if (parts.length > 0) {
            username = cleanUsername(parts[parts.length - 1]);
          }
        }
      }

      transactions.push({ date, trxId, username, amount });
    } catch (parseError) {
      // eslint-disable-next-line no-console
      console.warn("[ZENPAY parser] Skipped malformed transaction:", parseError);
    }
  }

  // Sort by date ascending
  transactions.sort(
    (a, b) =>
      new Date(a.date || "1970-01-01").getTime() -
      new Date(b.date || "1970-01-01").getTime(),
  );

  return transactions;
}

function mapTransactionToRow(parsedTransaction: ParsedTransaction): GigaCopyRow {
  return {
    nama: parsedTransaction.trxId,
    nomorRekening: "NO ACC",
    userId: parsedTransaction.username,
    sub: GIGA_ZENPAY_OUTPUT_SUB,
    kodeTransaksi: GIGA_ZENPAY_OUTPUT_KODE_TRANSAKSI,
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

export default function GigaCopyDpZenpay() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<GigaCopyRow[]>([]);
  const [copiedType, setCopiedType] = useState<"trx" | "qris" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pastedHtmlRef = useRef<string>("");
  const lastPastedPlainRef = useRef<string>("");
  const [gridPreview, setGridPreview] = useState<string[][]>([]);

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
        let parsed = useHtml
          ? parseGigaQrishokiGrid(htmlTableToGrid(html)).transactions
          : parseGigaCopyDpZenpay(rawText);
        if (useHtml && parsed.length === 0) {
          parsed = parseGigaCopyDpZenpay(rawText); // safety-net fallback
        }
        parsed = [...parsed].sort((a, b) => sortByDateAsc(a.date, b.date));
        const mappedRows = parsed.map(mapTransactionToRow);
        setRows(mappedRows);

        if (!useHtml && !String(rawText ?? "").trim()) {
          setError("Tempel raw text dari tabel dashboard terlebih dahulu.");
          toast.error("Input masih kosong.");
          return;
        }

        if (!mappedRows.length) {
          setError("Tidak ada transaksi Confirmed yang berhasil diparse. Pastikan format text sesuai panel ZENPAY.");
          toast.error("Data tidak ditemukan.");
          return;
        }

        toast.success(`${mappedRows.length} transaksi berhasil diproses.`);
      } catch (processError) {
        console.error("Error processing ZENPAY text:", processError);
        setRows([]);
        setError("Gagal memproses text. Pastikan data tidak corrupt dan format sesuai panel ZENPAY.");
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
  }, []);

  const useSample = useCallback(() => {
    setRawText(SAMPLE_TEXT);
    setRows([]);
    setError(null);
    pastedHtmlRef.current = "";
    lastPastedPlainRef.current = "";
    setGridPreview([]);
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (!rows.length) return;

    const tsv = rows.map(rowToArr).map((arr) => arr.join("\t")).join("\n");

    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedType("trx");
      toast.success("Data berhasil disalin ke Doc TRX!");
      window.setTimeout(() => setCopiedType(null), 2000);
    } catch (clipboardError) {
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
        console.error("Clipboard error:", clipboardError);
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
          OUTPUT_HEADERS.forEach((header, index) => {
            obj[header] = rowToArr(row)[index];
          });
          return obj;
        })
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Output ZENPAY");

      // Auto-size columns
      const colWidths = OUTPUT_HEADERS.map(() => ({ wch: 20 }));
      worksheet["!cols"] = colWidths;

      XLSX.writeFile(workbook, "ZENPAY_DP_Report_Extract.xlsx");
      toast.success("File Excel berhasil didownload!");
    } catch (exportError) {
      console.error("Error exporting Excel:", exportError);
      toast.error("Gagal export Excel.");
    }
  }, [rows]);

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

    reader.onload = (loadEvent) => {
      try {
        const buffer = loadEvent.target?.result;
        if (!(buffer instanceof ArrayBuffer)) throw new Error("Gagal membaca buffer file.");

        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error("File Excel tidak memiliki sheet.");
        const worksheet = workbook.Sheets[firstSheetName];

        const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          range: 1,
          defval: "",
        });

        const parsed: ParsedTransaction[] = [];
        let skipped = 0;

        for (const row of sheetRows) {
          const status = String(row["Status"] ?? "");
          const bankDetails = String(row["Bank Details"] ?? "");

          if (!/Confirmed/i.test(status) || !/ZENPAY88\s*\/\s*QRIS/i.test(bankDetails)) {
            skipped += 1;
            continue;
          }

          const amountRaw = row["Credit"] !== "" && row["Credit"] !== undefined
            ? row["Credit"]
            : row["Debit"];
          const amount = formatExcelAmount(amountRaw);

          if (!amount || amount === "0") {
            skipped += 1;
            continue;
          }

          const dateRaw =
            row["Comfirmed/Rejected time"] ??
            row["Confirmed/Rejected time"] ??
            "";

          parsed.push({
            trxId: String(row["Transaction ID"] ?? "-").trim() || "-",
            username: String(row["Username"] ?? "UNKNOWN").trim() || "UNKNOWN",
            amount,
            date: formatExcelDate(dateRaw),
          });
        }

        parsed.sort(
          (a, b) =>
            new Date(a.date || "1970-01-01").getTime() -
            new Date(b.date || "1970-01-01").getTime()
        );

        const mappedRows = parsed.map(mapTransactionToRow);
        setRawText("");
        setRows(mappedRows);

        if (!mappedRows.length) {
          setError("Tidak ada baris Confirmed + ZENPAY88 / QRIS yang cocok dalam file Excel.");
          toast.error("Data Excel tidak ditemukan.");
        } else {
          toast.success(`${mappedRows.length} transaksi Excel berhasil diproses.`);
        }
      } catch (parseError) {
        console.error("Error parsing Excel file:", parseError);
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
    } catch (readError) {
      console.error("Error starting Excel file read:", readError);
      setIsProcessing(false);
      setError("Gagal membuka file Excel.");
      toast.error("Gagal membuka file.");
      cleanupReader();
    }
  }, []);

  return (
    <section className="relative z-10 flex flex-col gap-6 text-[#23321B]">
      {/* TOP MODULE: Input Card */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-2xl neu-card border border-white/80"
      >
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl clay-badge flex items-center justify-center shrink-0">
              <Layers size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#23321B]">DP GIGA ZENPAY</h2>
              <p className="text-xs text-[#596B4F] font-medium">Parse DP data dari dashboard GIGA ZENPAY</p>
            </div>
          </div>
          <button
            type="button"
            onClick={useSample}
            className="inline-flex items-center justify-center h-10 px-4 py-2 gap-2 rounded-xl text-xs font-bold border border-[#74A355]/30 bg-[#74A355]/10 text-[#74A355] hover:bg-[#74A355]/20 transition-all cursor-pointer"
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
              setGridPreview(sortGridByDateAsc(htmlTableToGrid(html)));
              toast.success("Tabel panel terbaca. Klik Process Data untuk generate.");
            }
          }}
          placeholder={INPUT_GUIDANCE}
          className="min-h-[300px] w-full resize-y rounded-2xl neu-inset border border-[#E8E2B5] p-4 font-mono text-xs leading-6 text-[#23321B] outline-none transition placeholder:text-[#596B4F]/50 focus:ring-2 focus:ring-[#74A355]"
        />

        {gridPreview.length > 0 && (
          <div className="mt-4 rounded-xl neu-inset border border-[#E8E2B5] p-3">
            <p className="mb-1 px-1 text-[11px] font-bold text-[#74A355]">
              Grid sumber dari panel ({gridPreview.length} baris × {gridPreview[0]?.length ?? 0} kolom) — output diambil per kolom.
            </p>
            <div className="max-h-52 overflow-auto">
              <table className="w-max border-collapse text-[10px]">
                <tbody>
                  {gridPreview.slice(0, 30).map((r, ri) => (
                    <tr key={ri} className={ri === 0 ? "bg-[#EFEBA9] font-bold text-[#23321B]" : "odd:bg-[#FDFBD4] even:bg-[#F7F4C8]"}>
                      {r.map((c, ci) => (
                        <td key={ci} className="max-w-[160px] truncate border border-[#E8E2B5] px-1.5 py-0.5 text-[#23321B]" title={c}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <motion.button
            type="button"
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={processData}
            disabled={isProcessing}
            className="inline-flex flex-1 items-center justify-center h-12 px-6 gap-2 rounded-xl text-sm font-bold clay-btn-green text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Process Data
          </motion.button>
          <button
            type="button"
            onClick={clearData}
            className="inline-flex items-center justify-center h-12 px-6 gap-2 rounded-xl text-sm font-bold neu-flat border border-[#E8E2B5] text-[#596B4F] hover:text-rose-600 hover:border-rose-300 transition-all cursor-pointer"
          >
            <Eraser size={17} />
            Clear
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="inline-flex items-center justify-center h-12 px-6 gap-2 rounded-xl text-sm font-bold neu-flat border border-[#74A355]/30 text-[#74A355] hover:bg-[#74A355]/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
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
            className="flex items-start gap-3 p-4 rounded-2xl border border-rose-300 bg-rose-50 text-rose-800 shadow-sm"
          >
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-600" />
            <p className="text-sm font-bold">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {rows.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="flex flex-col gap-6"
        >
          {/* MIDDLE MODULE: Summary Metrics Grid - 4 cards */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {/* Card 1: JENIS DATA */}
            <div className="flex items-center gap-4 p-4 rounded-2xl neu-flat border border-white/80">
              <div className="w-12 h-12 rounded-xl clay-badge flex items-center justify-center shrink-0">
                <Layers size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[#596B4F] font-bold">Jenis Data</p>
                <p className="text-lg font-bold text-[#74A355] leading-tight font-mono mt-1">DP ZENPAY</p>
              </div>
            </div>

            {/* Card 2: TOTAL DATA */}
            <div className="flex items-center gap-4 p-4 rounded-2xl neu-flat border border-white/80">
              <div className="w-12 h-12 rounded-xl clay-badge flex items-center justify-center shrink-0">
                <ListOrdered size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[#596B4F] font-bold">Total Data</p>
                <p className="text-2xl font-bold text-[#23321B] leading-tight font-mono mt-1">{rows.length}</p>
              </div>
            </div>

            {/* Card 3: TOTAL NOMINAL */}
            <div className="flex items-center gap-4 p-4 rounded-2xl neu-flat border border-white/80">
              <div className="w-12 h-12 rounded-xl clay-badge flex items-center justify-center shrink-0">
                <Banknote size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-[#596B4F] font-bold">Total Nominal</p>
                <p className="text-2xl font-bold text-[#74A355] leading-tight font-mono mt-1 truncate" title={formatCurrency(totalAmount)}>
                  {formatCurrency(totalAmount)}
                </p>
              </div>
            </div>

            {/* Card 4: ROW FINAL */}
            <div className="flex items-center gap-4 p-4 rounded-2xl neu-flat border border-white/80">
              <div className="w-12 h-12 rounded-xl neu-inset border border-[#E8E2B5] flex items-center justify-center shrink-0 text-[#596B4F]">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[#596B4F] font-bold">Row Final</p>
                <p className="text-2xl font-bold text-[#23321B] leading-tight font-mono mt-1">{rows.length}</p>
              </div>
            </div>
          </motion.div>

          {/* BOTTOM MODULE: Output Table Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl neu-card border border-white/80"
          >
            {/* Action Bar Header */}
            <div className="flex items-center justify-between gap-4 p-4 border-b border-[#E8E2B5] bg-[#EFEBA9]/40 flex-wrap">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-[#23321B]">Output Preview</h3>
                <p className="text-xs text-[#596B4F] font-medium">Hasil mapping ke format spreadsheet.</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <motion.button
                  type="button"
                  whileHover={{ scale: rows.length ? 1.02 : 1 }}
                  whileTap={{ scale: rows.length ? 0.98 : 1 }}
                  onClick={copyToClipboard}
                  disabled={!rows.length}
                  className="inline-flex items-center justify-center h-10 px-4 gap-2 rounded-xl text-xs font-bold clay-btn-green text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="inline-flex items-center justify-center h-10 px-4 gap-2 rounded-xl text-xs font-bold neu-flat border border-[#74A355]/40 text-[#74A355] hover:bg-[#74A355]/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="inline-flex items-center justify-center h-10 px-4 gap-2 rounded-xl text-xs font-bold neu-flat border border-[#74A355]/40 text-[#74A355] hover:bg-[#74A355]/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={15} />
                  Export to Excel
                </motion.button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono">
                <thead>
                  <tr className="border-b border-[#E8E2B5] bg-[#EFEBA9]/60 sticky top-0">
                    {OUTPUT_HEADERS.map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#596B4F] whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2B5]/50 text-[#23321B]">
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-[#74A355]/5 transition-colors">
                      {rowToArr(row).map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-2.5 text-xs whitespace-nowrap">
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
