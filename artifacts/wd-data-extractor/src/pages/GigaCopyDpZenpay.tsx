import { useMemo, useRef, useState } from "react";
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

const SAMPLE_TEXT = "1\tGame Wallet 2026-05-04 23:52:00 114.122.43.157\t1CBG069f8ceb001764\tBangun simbolon sunjaya18\t\tPayment Gateway\t\nZENPAY88 / QRIS\nConfirmed\t\t100,000.00\tAuto System\t2026-05-04 23:56:25\t";

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
 * "userGS2AAAF00LJ" → "user"). All UPPERCASE, ≥8 chars, ≥2 digits & 2 letters.
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
 *   1. Strip remark color code (1-10 with whitespace separator)
 *   2. Strip "New" badge for new members
 *   3. Strip voucher/promo code suffix
 */
function cleanUsername(username: string): string {
  return stripVoucherSuffix(
    stripNewMemberMarker(stripRemarkColor(username)),
  );
}

export function parseGigaCopyDpZenpay(rawText: string): ParsedTransaction[] {
  // 1. Normalize spacing but keep the core text intact
  let cleanText = rawText
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s{2,}/g, " ");

  // Fix broken IPs (e.g., "192.168.1. 106" -> "192.168.1.106")
  cleanText = cleanText.replace(/(\d{1,3}\.\s+)(\d{1,3})/g, "$1$2");

  // 2. Split into individual transaction blocks
  // Use row-number-aware anchor like QRISHOKI to handle "1Game Wallet" etc.
  const blocks = cleanText.split(/(?=\d+\s?Game Wallet)/i);
  const transactions: ParsedTransaction[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (block.length < 50 || !/Game Wallet/i.test(block)) continue;

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

      // --- TRX ID EXTRACTION (anchor-based, ZENPAY prefix is "06a0") ---
      let trxId = "-";
      const trxIdAnchorMatch = block.match(/06a0[a-f0-9]{10}/i);
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
          const e = ipv6.index + ipv6[0].length;
          if (e > ipEnd && e <= trxIdStart) ipEnd = e;
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
      const trxIdAnchorMatchForUser = block.match(/06a0[a-f0-9]{10}/i);
      if (trxIdAnchorMatchForUser && trxIdAnchorMatchForUser.index !== undefined) {
        const tEnd = trxIdAnchorMatchForUser.index + trxIdAnchorMatchForUser[0].length;
        const pgMatch = block.slice(tEnd).match(/Payment\s+Gateway/i);
        if (pgMatch && pgMatch.index !== undefined) {
          let segment = block.slice(tEnd, tEnd + pgMatch.index).trim();
          // Peel badges first so they don't end up as the "last word"
          segment = stripRemarkColor(segment);
          segment = stripNewMemberMarker(segment);
          // Username = last whitespace-separated word
          const parts = segment.split(/\s+/).filter(Boolean);
          if (parts.length > 0) {
            username = cleanUsername(parts[parts.length - 1]);
          }
        }
      }

      transactions.push({ date, trxId, username, amount });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[ZENPAY parser] Skipped malformed transaction:", err);
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

function mapTransactionToRow(tx: ParsedTransaction): GigaCopyRow {
  return {
    nama: tx.trxId,
    nomorRekening: "NO ACC",
    userId: tx.username,
    sub: GIGA_ZENPAY_OUTPUT_SUB,
    kodeTransaksi: GIGA_ZENPAY_OUTPUT_KODE_TRANSAKSI,
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

export default function GigaCopyDpZenpay() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<GigaCopyRow[]>([]);
  const [copiedType, setCopiedType] = useState<"trx" | "qris" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
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
        const parsed = parseGigaCopyDpZenpay(rawText);
        const mappedRows = parsed.map(mapTransactionToRow);
        setRows(mappedRows);

        if (!String(rawText ?? "").trim()) {
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
      } catch (err) {
        console.error("Error processing ZENPAY text:", err);
        setRows([]);
        setError("Gagal memproses text. Pastikan data tidak corrupt dan format sesuai panel ZENPAY.");
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
  };

  const useSample = () => {
    setRawText(SAMPLE_TEXT);
    setRows([]);
    setError(null);
  };

  const copyToClipboard = async () => {
    if (!rows.length) return;

    const tsv = rows.map(rowToArr).map((arr) => arr.join("\t")).join("\n");
    
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Output ZENPAY");

    // Auto-size columns
    const colWidths = OUTPUT_HEADERS.map(() => ({ wch: 20 }));
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, "ZENPAY_DP_Report_Extract.xlsx");
    toast.success("File Excel berhasil didownload!");
  };

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
              <h2 className="text-lg font-bold text-slate-800">DP GIGA ZENPAY</h2>
              <p className="text-xs text-slate-500">Parse DP data dari dashboard GIGA ZENPAY</p>
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
                <p className="text-lg font-bold text-amber-700 leading-tight font-mono mt-1">DP ZENPAY</p>
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
