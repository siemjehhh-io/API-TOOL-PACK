import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, X, Check, AlertCircle,
  ChevronsUpDown, Flag, FlagOff, Search, Hash,
  Layers, Banknote, ListOrdered, Download, Copy, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ─── Output row type ──────────────────────────────────────────────────────────
//
// Mirrors the same 13-column layout as WD (ExtractedRow in home.tsx).
// Many fields are always empty for DP rows — they exist to keep the output
// format identical so the result can be pasted into the same spreadsheet.
//
// Source column → output field mapping (from deposit-report-*.xlsx):
//   Whitelabel Transaction ID → nama         (col 1)
//   Transaction Date          → nomorRekening (col 2, formatted as M/D/YYYY HH:MM:SS)
//   Member ID                 → userId        (col 3)
//   "BOT"                     → sub           (col 4)
//   "DP" (hardcoded)          → kodeTransaksi (col 5)
//   Amount                    → deposit       (col 6)
//   (empty)                   → withdrawal    (col 7)
//   (empty)                   → dpPulsa       (col 8)
//   Finished Date             → keterangan    (col 9)
//   (empty)                   → kodeBank      (col 10)
//   (empty)                   → saldoAkhir    (col 11)
//   Finished Date (time only) → jamInput      (col 12)
//   Finished Date (time only) → inputKodeBank (col 13)

interface DpRow {
  nama:          string;
  nomorRekening: string;
  userId:        string;
  sub:           string;
  kodeTransaksi: string;
  deposit:       string;
  withdrawal:    string;
  dpPulsa:       string;
  keterangan:    string;
  kodeBank:      string;
  saldoAkhir:    string;
  jamInput:      string;
  inputKodeBank: string;
}

// ─── Output column headers ────────────────────────────────────────────────────

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

const DP_OUTPUT_SUB = "BOT";
const DP_OUTPUT_KODE_TRANSAKSI = "DP";

// ─── Required source columns ──────────────────────────────────────────────────
// These must exist in the deposit report sheet for processing to succeed.

const REQUIRED_COLUMNS = [
  "Member ID",
  "Transaction ID",
  "Whitelabel Transaction ID",
  "Amount",
  "Finished Date",
  "Transaction Date",
];

// ─── Pure utility functions ───────────────────────────────────────────────────

/** Serialize a DpRow to an ordered string array matching OUTPUT_HEADERS. */
function rowToArr(row: DpRow): string[] {
  return [
    row.nama, row.nomorRekening, row.userId, row.sub, row.kodeTransaksi,
    row.deposit, row.withdrawal, row.dpPulsa, row.keterangan,
    row.kodeBank, row.saldoAkhir, row.jamInput, row.inputKodeBank,
  ];
}

/**
 * Extract "HH:MM:SS" from a date-time string like "2026-05-03 17:54:19".
 * Used for the jamInput and inputKodeBank output columns.
 */
function extractTime(dateValue: unknown): string {
  if (!dateValue) return "";
  const match = String(dateValue).match(/(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : "";
}

/**
 * Reformat a datetime string from "YYYY-MM-DD HH:MM:SS" to "M/D/YYYY HH:MM:SS".
 * Used for the nomorRekening (Transaction Date) column.
 * e.g. "2026-05-03 17:53:48" → "5/3/2026 17:53:48"
 */
function formatTxDate(dateValue: unknown): string {
  if (!dateValue) return "";
  const str = String(dateValue);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (!match) return str;
  const [, year, month, day, time] = match;
  return `${parseInt(month)}/${parseInt(day)}/${year} ${time}`;
}

/**
 * Transform raw Excel rows from a deposit report into DpRow objects.
 * - Rows without a Member ID are skipped.
 * - Rows where Status !== "success" are skipped (if Status column exists).
 */
function transformDpData(raw: Record<string, unknown>[]): DpRow[] {
  const hasStatusCol = raw.length > 0 && "Status" in raw[0];

  return raw.flatMap((row) => {
    const memberId = String(row["Member ID"] ?? "").trim();

    // Skip rows with no member ID
    if (!memberId) return [];

    // Skip non-successful transactions
    if (hasStatusCol && String(row["Status"] ?? "").trim().toLowerCase() !== "success") {
      return [];
    }

    const finishedDate = row["Finished Date"];

    return [{
      nama:          String(row["Whitelabel Transaction ID"] ?? "").trim(),
      nomorRekening: formatTxDate(row["Transaction Date"]),
      userId:        memberId,
      sub:           DP_OUTPUT_SUB,
      kodeTransaksi: DP_OUTPUT_KODE_TRANSAKSI,
      deposit:       String(row["Amount"] ?? "").trim(),
      withdrawal:    "",
      dpPulsa:       "",
      keterangan:    formatTxDate(finishedDate),
      kodeBank:      "",
      saldoAkhir:    "",
      jamInput:      extractTime(finishedDate),
      inputKodeBank: extractTime(finishedDate),
    }];
  });
}

/** Clamp a number within [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Format a number with Indonesian locale thousand separators. */
function fmt(n: number): string {
  return n.toLocaleString("id-ID");
}

/** Parse a formatted amount string back to a float. */
function parseAmt(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.,-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// ─── Shared small button component ───────────────────────────────────────────

/**
 * Glassmorphism toggle/action button used in the controls panel.
 * Identical to GlassBtn in home.tsx — consider extracting to a shared component
 * if more pages are added in the future.
 */
function GlassBtn({
  active,
  activeClass,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  activeClass?: string;
}) {
  const baseClass = `flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
    disabled:opacity-35 disabled:cursor-not-allowed`;

  const stateClass = active
    ? (activeClass ?? "bg-white/10 border-white/20 text-white")
    : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80 hover:bg-white/5";

  return (
    <button
      type="button"
      {...props}
      className={`${baseClass} ${stateClass} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

// ─── DpSection component ──────────────────────────────────────────────────────
//
// Rendered inside Home when the "DP" tab is active.

export function DpSection() {
  // ── File state ────────────────────────────────────────────────────────────

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile]             = useState<File | null>(null);
  const [data, setData]             = useState<DpRow[] | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [isParsing, setIsParsing]   = useState(false);
  const [copiedType, setCopiedType] = useState<"trx" | "qris" | null>(null);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // Multiple sheets: wbRef holds the parsed workbook so we can re-process on sheet change.
  const [sheetNames, setSheetNames]       = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const wbRef                             = useRef<XLSX.WorkBook | null>(null);

  // ── Row range state ───────────────────────────────────────────────────────

  const [startIndex, setStartIndex] = useState<number | null>(null);
  const [endIndex, setEndIndex]     = useState<number | null>(null);
  const [markMode, setMarkMode] = useState<"start" | "end" | null>(null);

  // ── Search / filter state ─────────────────────────────────────────────────

  const [startTrxIdInput, setStartTrxIdInput] = useState("");
  const [endTrxIdInput, setEndTrxIdInput]     = useState("");
  const [tableFilter, setTableFilter] = useState("");

  const totalRows = data?.length ?? 0;

  // ── Derived data ──────────────────────────────────────────────────────────

  // Reset controls whenever a new file is loaded.
  useEffect(() => {
    if (data) {
      setStartIndex(0);
      setEndIndex(data.length - 1);
      setMarkMode(null);
      setStartTrxIdInput("");
      setEndTrxIdInput("");
      setTableFilter("");
    }
  }, [data]);

  const selectedBounds = useMemo(() => {
    if (!data?.length) return { minIdx: 0, maxIdx: -1 };
    const start = startIndex ?? 0;
    const end = endIndex ?? data.length - 1;
    return {
      minIdx: Math.max(0, Math.min(start, end)),
      maxIdx: Math.min(data.length - 1, Math.max(start, end)),
    };
  }, [data, startIndex, endIndex]);

  const startRow = totalRows ? (startIndex ?? 0) + 1 : 0;
  const endRow = totalRows ? (endIndex ?? totalRows - 1) + 1 : 0;

  // Slice the full dataset to the selected row range.
  const rangeData = useMemo(
    () => (data ? data.slice(selectedBounds.minIdx, selectedBounds.maxIdx + 1) : []),
    [data, selectedBounds]
  );

  // Apply the text filter on top of the range slice.
  const filteredData = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return rangeData;
    return rangeData.filter(
      (r) =>
        r.userId.toLowerCase().includes(q) ||
        r.nama.toLowerCase().includes(q) ||
        r.deposit.toLowerCase().includes(q) ||
        r.keterangan.toLowerCase().includes(q)
    );
  }, [rangeData, tableFilter]);

  // Set of Transaction IDs that appear more than once in the full extracted data.
  const duplicateTrxIds = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of data ?? []) {
      const trxId = r.nama.trim();
      if (trxId) counts[trxId] = (counts[trxId] ?? 0) + 1;
    }
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [data]);

  const duplicateTrxSummary = useMemo(() => {
    const ids = Array.from(duplicateTrxIds);
    return {
      count: ids.length,
      preview: ids.slice(0, 5),
    };
  }, [duplicateTrxIds]);

  // Summary statistics for the stat cards.
  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    return {
      count:        filteredData.length,
      totalNominal: filteredData.reduce((sum, r) => sum + parseAmt(r.deposit), 0),
      dupCount:     filteredData.filter((r) => duplicateTrxIds.has(r.nama)).length,
    };
  }, [filteredData, duplicateTrxIds]);

  // ── File processing ───────────────────────────────────────────────────────

  /**
   * Parse a single sheet from an already-loaded workbook.
   * Validates that all required DP columns exist before calling transformDpData().
   */
  const processSheet = (wb: XLSX.WorkBook, sheetName: string): DpRow[] => {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]) as Record<string, unknown>[];
    if (!raw.length) throw new Error(`Sheet "${sheetName}" kosong.`);

    const missingCols = REQUIRED_COLUMNS.filter((col) => !(col in raw[0]));
    if (missingCols.length) {
      throw new Error(
        `Kolom tidak ditemukan: ${missingCols.join(", ")}. Pastikan ini adalah file Deposit Report yang benar.`
      );
    }

    return transformDpData(raw);
  };

  /** Load a new .xlsx file: parse the workbook and process the first sheet. */
  const processFile = async (f: File) => {
    setFile(f);
    setError(null);
    setData(null);
    setSheetNames([]);
    setSelectedSheet("");
    wbRef.current = null;
    setIsParsing(true);

    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      wbRef.current = wb;

      if (!wb.SheetNames.length) throw new Error("File Excel tidak memiliki sheet.");

      setSheetNames(wb.SheetNames);
      setSelectedSheet(wb.SheetNames[0]);
      const processed = processSheet(wb, wb.SheetNames[0]);
      processed.sort((a, b) => {
        const tA = new Date(`${a.nomorRekening} ${a.jamInput}`).getTime();
        const tB = new Date(`${b.nomorRekening} ${b.jamInput}`).getTime();
        return tA - tB || a.nomorRekening.localeCompare(b.nomorRekening) || a.jamInput.localeCompare(b.jamInput);
      });
      setData(processed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal membaca file.");
    } finally {
      setIsParsing(false);
    }
  };

  /** Switch to a different sheet within the already-loaded workbook. */
  const changeSheet = (name: string) => {
    if (!wbRef.current) return;
    setSelectedSheet(name);
    setError(null);
    setData(null);
    try {
      const processed = processSheet(wbRef.current, name);
      processed.sort((a, b) => {
        const tA = new Date(`${a.nomorRekening} ${a.jamInput}`).getTime();
        const tB = new Date(`${b.nomorRekening} ${b.jamInput}`).getTime();
        return tA - tB || a.nomorRekening.localeCompare(b.nomorRekening) || a.jamInput.localeCompare(b.jamInput);
      });
      setData(processed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal membaca sheet.");
    }
  };

  // ── Drag & drop / file input handlers ────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      if (f.name.endsWith(".xlsx")) {
        processFile(f);
      } else {
        setError("Hanya file .xlsx yang didukung.");
      }
    },
    []
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Clear all DP state (called when removing a file). */
  const reset = () => {
    setFile(null);
    setData(null);
    setError(null);
    setCopiedType(null);
    setMarkMode(null);
    setStartTrxIdInput("");
    setEndTrxIdInput("");
    setTableFilter("");
    setSheetNames([]);
    setSelectedSheet("");
    wbRef.current = null;
  };

  // ── Row range controls ────────────────────────────────────────────────────

  const setStartByTrxId = () => {
    if (!data || !startTrxIdInput.trim()) return;
    const q = startTrxIdInput.trim();
    const idx = data.findIndex((r) => r.nama.trim() === q);
    if (idx === -1) {
      toast.error(`ID Transaksi "${q}" tidak ditemukan.`);
      return;
    }
    setStartIndex(idx);
    toast.success(`Baris ${idx + 1} — set awal (ID: ${q})`);
  };

  const setEndByTrxId = () => {
    if (!data || !endTrxIdInput.trim()) return;
    const q = endTrxIdInput.trim();
    const idx = data.findIndex((r) => r.nama.trim() === q);
    if (idx === -1) {
      toast.error(`ID Transaksi "${q}" tidak ditemukan.`);
      return;
    }
    setEndIndex(idx);
    toast.success(`Baris ${idx + 1} — set akhir (ID: ${q})`);
  };

  const handleRowClick = (rowIndex: number) => {
    const rowNumber = rowIndex + 1;
    if (markMode === "start") {
      setStartIndex(rowIndex);
      setMarkMode(null);
    } else if (markMode === "end") {
      setEndIndex(rowIndex);
      setMarkMode(null);
    }
  };

  const handleStartInput = (value: string) => {
    const n = parseInt(value, 10);
    if (isNaN(n)) return;
    const clamped = clamp(n, 1, totalRows);
    setStartIndex(clamped - 1);
  };

  const handleEndInput = (value: string) => {
    const n = parseInt(value, 10);
    if (isNaN(n)) return;
    const clamped = clamp(n, 1, totalRows);
    setEndIndex(clamped - 1);
  };

  // ── Output actions ────────────────────────────────────────────────────────

  const copyTSV = async () => {
    if (!filteredData.length) return;
    try {
      const tsv = filteredData
        .map((r) => {
          const cleanTrxId = String(r.nama || "").replace(/[\t\n\r]/g, "").trim();
          const cleanUsername = String(r.userId || "").replace(/[\t\n\r]/g, "").trim();
          const cleanAmount = String(r.deposit || "0").replace(/[\t\n\r]/g, "").trim();
          const cleanDate = String(r.nomorRekening || "").replace(/[\t\n\r]/g, " ").trim();

          return [
            cleanTrxId,
            " ",
            cleanUsername,
            "BOT",
            "DP",
            cleanAmount,
            " ",
            " ",
            cleanDate,
          ].join("\t");
        })
        .join("\n");
      await navigator.clipboard.writeText(tsv);
      setCopiedType("trx");
      toast.success(`${filteredData.length} baris disalin ke Doc TRX! (9 kolom)`);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      toast.error("Gagal menyalin.");
    }
  };

  const handleCopyDocQris = async () => {
    if (!filteredData.length) return;
    try {
      // 6-column TSV: NAMA, NOMINAL, (hidden C), STATUS, KODE EWALLET, KODE WEB
      const tsv = filteredData
        .map(
          (r) =>
            [
              r.nama,              // Column A: NAMA (trxId)
              r.deposit,           // Column B: NOMINAL (amount)
              "",                  // Column C: HIDDEN (empty)
              "COMPLETED",         // Column D: STATUS
              "",
              "",
            ].join("\t")
        )
        .join("\n");
      await navigator.clipboard.writeText(tsv);
      setCopiedType("qris");
      toast.success(`${filteredData.length} baris disalin ke Doc Qris!`);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      toast.error("Gagal menyalin Doc Qris.");
    }
  };

  const exportXlsx = () => {
    if (!filteredData.length) return;
    try {
      const rows = filteredData.map(rowToArr);
      const ws = XLSX.utils.aoa_to_sheet([OUTPUT_HEADERS, ...rows]);

      ws["!cols"] = OUTPUT_HEADERS.map((header, i) => ({
        wch: Math.max(header.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Output DP");

      const baseName = file?.name.replace(/\.xlsx$/i, "") ?? "dp-output";
      XLSX.writeFile(wb, `${baseName}_output.xlsx`);
      toast.success(`"${baseName}_output.xlsx" berhasil diunduh!`);
    } catch {
      toast.error("Gagal ekspor Excel.");
    }
  };

  // ── Derived booleans & shared styles ─────────────────────────────────────

  const isFullRange = totalRows > 0 && selectedBounds.minIdx === 0 && selectedBounds.maxIdx === totalRows - 1;

  const inputCls = [
    "bg-white/5 border border-white/10 text-white/90 placeholder:text-white/25",
    "rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400/50 focus:border-emerald-400/40 transition-all",
  ].join(" ");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-lg">

      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl glass border-emerald-400/20"
        style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(5,150,105,0.04) 100%)" }}
      >
        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400/60" />
        <span className="text-sm font-semibold text-white/90">QRIS HOKI DP</span>
        <span className="text-xs text-white/35 ml-1 hidden sm:inline">
          SUB: {DP_OUTPUT_SUB} &nbsp;·&nbsp; KODE TRANSAKSI: {DP_OUTPUT_KODE_TRANSAKSI}
        </span>
      </motion.div>

      {/* ── UPLOAD ZONE ────────────────────────────────────────────────── */}
      <div
        data-testid="dp-upload-zone"
        className={`relative group w-full rounded-ds-2xl border-2 border-dashed transition-all duration-300
          flex flex-col items-center justify-center p-12 sm:p-16 text-center overflow-hidden gap-md
          ${isDragging
            ? "border-emerald-400/70 scale-[1.01]"
            : file
            ? "border-white/15 glass"
            : "border-white/15 glass hover:border-emerald-400/40 cursor-pointer"}`}
        style={isDragging ? { background: "rgba(16,185,129,0.1)" } : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
      >
        {/* Drag-active glow overlay */}
        {isDragging && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ boxShadow: "inset 0 0 60px rgba(16,185,129,0.18)" }}
          />
        )}

        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileSelect}
          data-testid="dp-input-file"
        />

        <AnimatePresence mode="wait">
          {/* State: parsing */}
          {isParsing && (
            <motion.div
              key="parsing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-14 h-14 rounded-full border-4 border-emerald-400/20 border-t-emerald-400 animate-spin" />
              <p className="text-white/60 font-medium">Memproses data deposit…</p>
            </motion.div>
          )}

          {/* State: file loaded */}
          {!isParsing && file && (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 w-full"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-400/20 flex items-center justify-center">
                <FileSpreadsheet size={30} className="text-emerald-300" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{file.name}</h3>
                <p className="text-xs text-white/40 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
              </div>

              {/* Sheet picker (shown only when workbook has multiple sheets) */}
              {sheetNames.length > 1 && (
                <div
                  className="flex items-center gap-2 flex-wrap justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-white/40">Sheet:</span>
                  {sheetNames.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changeSheet(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                        ${s === selectedSheet
                          ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-200"
                          : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); reset(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40
                  hover:text-red-400 hover:bg-red-400/10 border border-white/8 hover:border-red-400/20 transition-all"
              >
                <X size={13} />
                Hapus file
              </button>
            </motion.div>
          )}

          {/* State: empty prompt */}
          {!isParsing && !file && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 border
                  ${isDragging
                    ? "bg-emerald-500 border-emerald-400 text-white"
                    : "bg-white/5 border-white/10 text-white/40 group-hover:bg-emerald-500/15 group-hover:border-emerald-400/30 group-hover:text-emerald-300"}`}
              >
                <Upload size={26} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white/85">Drop file Deposit Report di sini</h3>
                <p className="text-sm text-white/35 mt-1.5">
                  Format: <span className="text-emerald-300/80">deposit-report-*.xlsx</span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── ERROR BANNER ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-start gap-4 p-5 rounded-2xl border border-red-400/20 bg-red-500/8 backdrop-blur-sm">
              <AlertCircle size={22} className="text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300 mb-1">Proses Gagal</p>
                <p className="text-xs text-red-300/70">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400/60 hover:text-red-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DATA PREVIEW ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {data && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex flex-col gap-lg"
          >
            {/* Stat cards */}
            {stats && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md"
              >
                {/* Row count */}
                <div className="flex items-center gap-md px-lg py-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
                  <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-ds-md shadow-emerald-500/30 shrink-0">
                    <ListOrdered size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/50 font-medium">Baris Dipilih</p>
                    <p className="text-2xl font-bold text-white leading-tight font-mono mt-1">
                      {stats.count}
                      <span className="text-sm text-white/30 font-normal ml-1">/ {totalRows}</span>
                    </p>
                  </div>
                </div>

                {/* Total deposit */}
                <div className="flex items-center gap-md px-lg py-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
                  <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-ds-md shadow-cyan-500/30 shrink-0">
                    <Banknote size={20} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-white/50 font-medium">Total Deposit</p>
                    <p className="text-2xl font-bold text-white leading-tight font-mono mt-1 truncate">
                      {fmt(stats.totalNominal)}
                    </p>
                  </div>
                </div>

                {/* Duplicate IDs or Total File count */}
                <div className={`flex items-center gap-md px-lg py-lg rounded-ds-xl bg-white/5 border shadow-ds-sm transition-colors ${stats.dupCount > 0 ? "border-amber-400/25" : "border-white/10"}`}>
                  <div className={`w-12 h-12 rounded-ds-md flex items-center justify-center shadow-ds-md shrink-0
                    ${stats.dupCount > 0
                      ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30"
                      : "bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/30"}`}
                  >
                    {stats.dupCount > 0
                      ? <TriangleAlert size={20} className="text-white" />
                      : <Layers size={20} className="text-white" />
                    }
                  </div>
                  <div>
                    {stats.dupCount > 0 ? (
                      <>
                        <p className="text-xs uppercase tracking-wide text-amber-400/70 font-medium">ID Duplikat</p>
                        <p className="text-2xl font-bold text-amber-300 leading-tight font-mono mt-1">
                          {stats.dupCount} <span className="text-sm font-normal">baris</span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs uppercase tracking-wide text-white/50 font-medium">Total File</p>
                        <p className="text-2xl font-bold text-white leading-tight font-mono mt-1">{totalRows}</p>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Top bar: title + export buttons */}
            <div className="flex items-center justify-between gap-md flex-wrap">
              <div className="flex items-center gap-md">
                <h2 className="text-base font-semibold text-white/85">Pratinjau Data DP</h2>
                <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold border border-emerald-400/20">
                  {totalRows} total
                </span>
              </div>
              <div className="flex items-center gap-sm flex-wrap">
                <button
                  type="button"
                  onClick={exportXlsx}
                  disabled={filteredData.length === 0}
                  className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  type="button"
                  onClick={copyTSV}
                  disabled={filteredData.length === 0}
                  className={`inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold transition-all shadow-ds-md
                    disabled:opacity-35 disabled:cursor-not-allowed
                    ${copiedType === "trx"
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/30"
                      : "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/30 hover:from-amber-400 hover:to-orange-400"}`}
                >
                  {copiedType === "trx"
                    ? <><Check size={15} />Tersalin!</>
                    : <><Copy size={15} />Copy to Doc TRX</>
                  }
                </button>
                <button
                  type="button"
                  onClick={handleCopyDocQris}
                  disabled={filteredData.length === 0}
                  className={`inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold transition-all shadow-ds-md
                    disabled:opacity-35 disabled:cursor-not-allowed
                    ${copiedType === "qris"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-cyan-500/30"
                      : "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-cyan-500/30 hover:from-cyan-500 hover:to-blue-500"}`}
                >
                  {copiedType === "qris"
                    ? <><Check size={15} />Tersalin!</>
                    : <><Copy size={15} />Copy to Doc Qris</>
                  }
                </button>
              </div>
            </div>

            {/* ── Controls panel: row range + ID search + table filter ── */}
            <div className="flex flex-col gap-md px-lg py-lg rounded-ds-2xl glass border border-white/10 shadow-ds-md">

              {/* Row range inputs + mark mode buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <ChevronsUpDown size={14} className="text-white/30 shrink-0" />
                <span className="text-xs font-semibold text-white/50 shrink-0">RENTANG:</span>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/30">Mulai</span>
                  <input
                    type="number"
                    min={1}
                    max={totalRows}
                    value={startRow}
                    onChange={(e) => handleStartInput(e.target.value)}
                    className={`w-16 h-7 px-2 text-sm text-center font-mono ${inputCls}`}
                  />
                </div>

                <span className="text-white/20 text-xs">—</span>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/30">Sampai</span>
                  <input
                    type="number"
                    min={1}
                    max={totalRows}
                    value={endRow}
                    onChange={(e) => handleEndInput(e.target.value)}
                    className={`w-16 h-7 px-2 text-sm text-center font-mono ${inputCls}`}
                  />
                </div>

                <div className="flex gap-1.5">
                  <GlassBtn
                    active={markMode === "start"}
                    activeClass="bg-emerald-500/15 border-emerald-400/40 text-emerald-300"
                    onClick={() => setMarkMode((m) => m === "start" ? null : "start")}
                  >
                    <Flag size={11} />Tandai Awal
                  </GlassBtn>
                  <GlassBtn
                    active={markMode === "end"}
                    activeClass="bg-rose-500/15 border-rose-400/40 text-rose-300"
                    onClick={() => setMarkMode((m) => m === "end" ? null : "end")}
                  >
                    <FlagOff size={11} />Tandai Akhir
                  </GlassBtn>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {!isFullRange && (
                    <button
                      onClick={() => { setStartIndex(0); setEndIndex(totalRows - 1); setMarkMode(null); }}
                      className="text-xs text-white/30 hover:text-white/60 underline underline-offset-2 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border
                    ${isFullRange ? "bg-white/5 border-white/8 text-white/30" : "bg-amber-500/12 border-amber-400/25 text-amber-300"}`}>
                    {rangeData.length} dipilih
                  </span>
                </div>
              </div>

              <div className="border-t border-white/6" />

              {/* Dual ID Transaksi search + table filter */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Start ID group */}
                <div className="flex items-center gap-2">
                  <Flag size={13} className="text-emerald-400/60 shrink-0" />
                  <span className="text-xs font-semibold text-white/40 shrink-0">Awal:</span>
                  <input
                    type="text"
                    placeholder="Paste ID Transaksi Awal…"
                    value={startTrxIdInput}
                    onChange={(e) => setStartTrxIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setStartByTrxId()}
                    className={`w-44 h-7 px-2.5 text-xs font-mono ${inputCls}`}
                  />
                  <GlassBtn
                    disabled={!startTrxIdInput.trim()}
                    active={false}
                    onClick={setStartByTrxId}
                  >
                    <Flag size={11} />Set Awal
                  </GlassBtn>
                </div>

                {/* End ID group */}
                <div className="flex items-center gap-2">
                  <FlagOff size={13} className="text-rose-400/60 shrink-0" />
                  <span className="text-xs font-semibold text-white/40 shrink-0">Akhir:</span>
                  <input
                    type="text"
                    placeholder="Paste ID Transaksi Akhir…"
                    value={endTrxIdInput}
                    onChange={(e) => setEndTrxIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setEndByTrxId()}
                    className={`w-44 h-7 px-2.5 text-xs font-mono ${inputCls}`}
                  />
                  <GlassBtn
                    disabled={!endTrxIdInput.trim()}
                    active={false}
                    onClick={setEndByTrxId}
                  >
                    <FlagOff size={11} />Set Akhir
                  </GlassBtn>
                </div>

                {/* Table text filter (right-aligned) */}
                <div className="ml-auto flex items-center gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Filter tabel…"
                      value={tableFilter}
                      onChange={(e) => setTableFilter(e.target.value)}
                      className={`w-32 h-7 pl-7 pr-7 text-xs ${inputCls}`}
                    />
                    {tableFilter && (
                      <button
                        onClick={() => setTableFilter("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                  {tableFilter && (
                    <span className="text-[11px] text-white/30">{filteredData.length} hasil</span>
                  )}
                </div>
              </div>
            </div>

            {/* Mark mode active hint */}
            <AnimatePresence>
              {markMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs overflow-hidden
                    ${markMode === "start"
                      ? "bg-emerald-500/8 border-emerald-400/20 text-emerald-300"
                      : "bg-rose-500/8 border-rose-400/20 text-rose-300"}`}
                >
                  <Flag size={12} />
                  Mode aktif: <strong>Tandai Baris {markMode === "start" ? "Awal" : "Akhir"}</strong> — klik nomor baris di tabel.
                  <button onClick={() => setMarkMode(null)} className="ml-auto opacity-60 hover:opacity-100">
                    <X size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {duplicateTrxSummary.count > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2 px-4 py-3 rounded-2xl border border-amber-400/35 bg-amber-500/12 shadow-lg shadow-amber-500/10"
              >
                <div className="flex items-center gap-2 text-amber-200">
                  <TriangleAlert size={16} className="shrink-0" />
                  <span className="text-sm font-black">
                    WARNING: Ditemukan {duplicateTrxSummary.count} ID Transaksi Duplikat!
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {duplicateTrxSummary.preview.map((trxId) => (
                    <span
                      key={trxId}
                      className="px-2 py-1 rounded-lg bg-amber-300/10 border border-amber-300/20 text-[11px] font-mono text-amber-100"
                    >
                      {trxId}
                    </span>
                  ))}
                  {duplicateTrxSummary.count > duplicateTrxSummary.preview.length && (
                    <span className="px-2 py-1 text-[11px] text-amber-200/70">
                      +{duplicateTrxSummary.count - duplicateTrxSummary.preview.length} lainnya
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Preview table ───────────────────────────────────────── */}
            <div className="rounded-ds-2xl overflow-hidden glass border border-white/10 shadow-ds-lg">
              <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
                <table className="w-full text-sm text-left border-collapse">
                  <thead
                    className="text-[10px] uppercase tracking-wider text-white/50 sticky top-0 z-10"
                    style={{ background: "rgba(5,46,22,0.75)", backdropFilter: "blur(20px)" }}
                  >
                    <tr>
                      <th className="px-md py-sm text-center w-10 border-b border-white/10 font-semibold whitespace-nowrap">#</th>
                      {OUTPUT_HEADERS.map((header, i) => (
                        <th key={i} className="px-md py-sm font-semibold whitespace-nowrap border-b border-white/10">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="font-mono text-xs divide-y divide-white/4">
                    {data.map((row, i) => {
                      const rowNumber = i + 1;
                      const inRange   = i >= selectedBounds.minIdx && i <= selectedBounds.maxIdx;
                      const isStart   = i === startIndex;
                      const isEnd     = i === endIndex;
                      const isDup = duplicateTrxIds.has(row.nama);

                      // Apply text filter
                      if (tableFilter.trim() && inRange) {
                        const q = tableFilter.trim().toLowerCase();
                        const matches =
                          row.userId.toLowerCase().includes(q) ||
                          row.nama.toLowerCase().includes(q) ||
                          row.deposit.toLowerCase().includes(q) ||
                          row.keterangan.toLowerCase().includes(q);
                        if (!matches) return null;
                      }

                      return (
                        <tr
                          key={i}
                          className={`transition-colors duration-100
                            ${inRange ? "hover:bg-white/3" : "opacity-20"}
                            ${isStart ? "border-t-2 border-t-emerald-400/40" : ""}
                            ${isEnd ? "border-b-2 border-b-rose-400/40" : ""}
                            ${isDup && inRange ? "bg-amber-500/4" : ""}`}
                        >
                          {/* Row number / mark cell */}
                          <td
                            className={`px-3 py-2.5 text-center align-middle select-none ${markMode ? "cursor-pointer" : ""}`}
                            onClick={() => markMode && handleRowClick(i)}
                          >
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-bold transition-all
                              ${isStart  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30"
                              : isEnd    ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30"
                              : isDup && inRange ? "bg-amber-500/20 text-amber-300"
                              : markMode ? "text-white/20 hover:bg-emerald-500/20 hover:text-emerald-300"
                              : "text-white/15"}`}
                            >
                              {isDup && inRange ? "!" : rowNumber}
                            </span>
                          </td>

                          {/* Data cells */}
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/50 text-[11px]">{row.nama}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-cyan-300/70 text-[11px]">{row.nomorRekening}</td>
                          <td className={`px-4 py-2.5 whitespace-nowrap ${isDup && inRange ? "text-amber-300" : "text-white/80"}`}>
                            {row.userId}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.sub}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-emerald-300/80 font-semibold">{row.kodeTransaksi}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-emerald-300/90 font-semibold">{row.deposit}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/25">{row.withdrawal}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/25">{row.dpPulsa}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/40 text-[11px] max-w-[200px] truncate" title={row.keterangan}>
                            {row.keterangan}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.kodeBank}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/25">{row.saldoAkhir}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-violet-300/70">{row.jamInput}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-violet-300/70">{row.inputKodeBank}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
