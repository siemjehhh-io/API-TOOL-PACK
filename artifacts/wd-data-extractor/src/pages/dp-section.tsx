import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowDownToLine,
  Banknote,
  Check,
  ChevronsUpDown,
  Copy,
  Download,
  FileSpreadsheet,
  Flag,
  FlagOff,
  Hash,
  Layers,
  ListOrdered,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IdRangePicker } from "@/components/IdRangePicker";

// â”€â”€â”€ Output row type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Mirrors the same 13-column layout as WD (ExtractedRow in home.tsx).
// Many fields are always empty for DP rows â€” they exist to keep the output
// format identical so the result can be pasted into the same spreadsheet.
//
// Source column â†’ output field mapping (from deposit-report-*.xlsx):
//   Whitelabel Transaction ID â†’ nama         (col 1)
//   Transaction Date          â†’ nomorRekening (col 2, formatted as M/D/YYYY HH:MM:SS)
//   Member ID                 â†’ userId        (col 3)
//   "BOT"                     â†’ sub           (col 4)
//   "DP" (hardcoded)          â†’ kodeTransaksi (col 5)
//   Amount                    â†’ deposit       (col 6)
//   (empty)                   â†’ withdrawal    (col 7)
//   (empty)                   â†’ dpPulsa       (col 8)
//   Finished Date             â†’ keterangan    (col 9)
//   (empty)                   â†’ kodeBank      (col 10)
//   (empty)                   â†’ saldoAkhir    (col 11)
//   Finished Date (time only) â†’ jamInput      (col 12)
//   Finished Date (time only) â†’ inputKodeBank (col 13)

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

// â”€â”€â”€ Output column headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Required source columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// These must exist in the deposit report sheet for processing to succeed.

const REQUIRED_COLUMNS = [
  "Member ID",
  "Transaction ID",
  "Whitelabel Transaction ID",
  "Amount",
  "Finished Date",
  "Transaction Date",
];

// â”€â”€â”€ Pure utility functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
 * e.g. "2026-05-03 17:53:48" â†’ "5/3/2026 17:53:48"
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
}/** Clamp a number within [min, max]. */
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

// â”€â”€â”€ Shared small button component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Glassmorphism toggle/action button used in the controls panel.
 * Identical to GlassBtn in home.tsx â€” consider extracting to a shared component
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

// â”€â”€â”€ DpSection component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Rendered inside Home when the "DP" tab is active.

export function DpSection() {
  // â”€â”€ File state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ Row range state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [startIndex, setStartIndex] = useState<number | null>(null);
  const [endIndex, setEndIndex]     = useState<number | null>(null);
  const [markMode, setMarkMode] = useState<"start" | "end" | null>(null);

  // â”€â”€ Search / filter state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [startIdQuery, setStartIdQuery]   = useState("");
  const [startMatchIdx, setStartMatchIdx] = useState(0);
  const [endIdQuery, setEndIdQuery]       = useState("");
  const [endMatchIdx, setEndMatchIdx]     = useState(0);
  const [tableFilter, setTableFilter] = useState("");

  const totalRows = data?.length ?? 0;

  // â”€â”€ Derived data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Reset controls whenever a new file is loaded.
  useEffect(() => {
    if (data) {
      setStartIndex(0);
      setEndIndex(data.length - 1);
      setMarkMode(null);
      setStartIdQuery("");
      setStartMatchIdx(0);
      setEndIdQuery("");
      setEndMatchIdx(0);
      setTableFilter("");
    }
  }, [data]);

  const selectedBounds = useMemo(() => {
    if (!data?.length) return { minIdx: 0, maxIdx: -1 };
    const start = startIndex ?? 0;
    const end = endIndex ?? data.length - 1;
    // Penanda awal menunjuk SETELAH baris terakhir -> seleksi kosong.
    if (start > data.length - 1) return { minIdx: 0, maxIdx: -1 };
    return {
      minIdx: Math.max(0, Math.min(start, end)),
      maxIdx: Math.min(data.length - 1, Math.max(start, end)),
    };
  }, [data, startIndex, endIndex]);

  const startRow = totalRows ? (startIndex ?? 0) + 1 : 0;
  const endRow = totalRows ? (endIndex ?? totalRows - 1) + 1 : 0;

  // Slice the full dataset to the selected row range.
  const rangeData = useMemo(
    () => (data && data.length ? data.slice(selectedBounds.minIdx, selectedBounds.maxIdx + 1) : []),
    [data, selectedBounds]
  );

  // Apply the text filter on top of the range slice.
  const filteredData = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return rangeData;
    return rangeData.filter(
      (row) =>
        row.userId.toLowerCase().includes(q) ||
        row.nama.toLowerCase().includes(q) ||
        row.deposit.toLowerCase().includes(q) ||
        row.keterangan.toLowerCase().includes(q)
    );
  }, [rangeData, tableFilter]);

  // Set of Transaction IDs that appear more than once in the full extracted data.
  const duplicateTrxIds = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const trxId = row.nama.trim();
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
      totalNominal: filteredData.reduce((sum, row) => sum + parseAmt(row.deposit), 0),
      dupCount:     filteredData.filter((row) => duplicateTrxIds.has(row.nama)).length,
    };
  }, [filteredData, duplicateTrxIds]);

  // â”€â”€ File processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Parse a single sheet from an already-loaded workbook.
   * Validates that all required DP columns exist before calling transformDpData().
   */
  const processSheet = useCallback((workbook: XLSX.WorkBook, sheetName: string): DpRow[] => {
    const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as Record<string, unknown>[];
    if (!raw.length) throw new Error(`Sheet "${sheetName}" kosong.`);

    const missingCols = REQUIRED_COLUMNS.filter((col) => !(col in raw[0]));
    if (missingCols.length) {
      throw new Error(
        `Kolom tidak ditemukan: ${missingCols.join(", ")}. Pastikan ini adalah file Deposit Report yang benar.`
      );
    }

    return transformDpData(raw);
  }, []);

  /** Load a new .xlsx file: parse the workbook and process the first sheet. */
  const processFile = useCallback(async (incomingFile: File) => {
    setFile(incomingFile);
    setError(null);
    setData(null);
    setSheetNames([]);
    setSelectedSheet("");
    wbRef.current = null;
    setIsParsing(true);

    try {
      const workbook = XLSX.read(await incomingFile.arrayBuffer(), { type: "array" });
      wbRef.current = workbook;

      if (!workbook.SheetNames.length) throw new Error("File Excel tidak memiliki sheet.");

      setSheetNames(workbook.SheetNames);
      setSelectedSheet(workbook.SheetNames[0]);
      const processed = processSheet(workbook, workbook.SheetNames[0]);
      processed.sort((a, b) => {
        const tA = new Date(`${a.nomorRekening} ${a.jamInput}`).getTime();
        const tB = new Date(`${b.nomorRekening} ${b.jamInput}`).getTime();
        return tA - tB || a.nomorRekening.localeCompare(b.nomorRekening) || a.jamInput.localeCompare(b.jamInput);
      });
      setData(processed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal membaca file.");
    } finally {
      setIsParsing(false);
    }
  }, [processSheet]);

  /** Switch to a different sheet within the already-loaded workbook. */
  const changeSheet = useCallback((sheetName: string) => {
    if (!wbRef.current) return;
    setSelectedSheet(sheetName);
    setError(null);
    setData(null);
    try {
      const processed = processSheet(wbRef.current, sheetName);
      processed.sort((a, b) => {
        const tA = new Date(`${a.nomorRekening} ${a.jamInput}`).getTime();
        const tB = new Date(`${b.nomorRekening} ${b.jamInput}`).getTime();
        return tA - tB || a.nomorRekening.localeCompare(b.nomorRekening) || a.jamInput.localeCompare(b.jamInput);
      });
      setData(processed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal membaca sheet.");
    }
  }, [processSheet]);

  // â”€â”€ Drag & drop / file input handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      if (file.name.endsWith(".xlsx")) {
        processFile(file);
      } else {
        setError("Hanya file .xlsx yang didukung.");
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) processFile(event.target.files[0]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processFile]);

  /** Clear all DP state (called when removing a file). */
  const reset = useCallback(() => {
    setFile(null);
    setData(null);
    setError(null);
    setCopiedType(null);
    setMarkMode(null);
    setStartIdQuery("");
    setStartMatchIdx(0);
    setEndIdQuery("");
    setEndMatchIdx(0);
    setTableFilter("");
    setSheetNames([]);
    setSelectedSheet("");
    wbRef.current = null;
  }, []);

  // â”€â”€ Row range controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // ── ID search → live range boundaries (mirrors WD section) ─────────────────
  //
  // Find every row whose ID Transaksi (nama) contains `query`
  // (case-insensitive). Returns 1-indexed row numbers paired with the ID.
  const findIdMatches = useCallback(
    (query: string): { row: number; id: string }[] => {
      if (!data) return [];
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) return [];
      const matches: { row: number; id: string }[] = [];
      for (let i = 0; i < data.length; i += 1) {
        if (data[i].nama.toLowerCase().includes(trimmed)) {
          matches.push({ row: i + 1, id: data[i].nama });
        }
      }
      return matches;
    },
    [data],
  );

  const startMatches = useMemo(() => findIdMatches(startIdQuery), [findIdMatches, startIdQuery]);
  const endMatches   = useMemo(() => findIdMatches(endIdQuery),   [findIdMatches, endIdQuery]);

  useEffect(() => {
    if (startMatchIdx >= startMatches.length) setStartMatchIdx(0);
  }, [startMatches.length, startMatchIdx]);

  useEffect(() => {
    if (endMatchIdx >= endMatches.length) setEndMatchIdx(0);
  }, [endMatches.length, endMatchIdx]);

  const startMatch = startMatches.length ? startMatches[Math.min(startMatchIdx, startMatches.length - 1)] : null;
  const endMatch   = endMatches.length   ? endMatches[Math.min(endMatchIdx, endMatches.length - 1)]       : null;

  // Live boundary application. ID Awal marks the last-processed transaction, so
  // the range starts 1 transaction AFTER it (marked row excluded). ID Akhir is
  // inclusive (unchanged). Empty boxes restore the full range.
  useEffect(() => {
    if (!data || data.length === 0) return;
    const total = data.length;
    const startTrimmed = startIdQuery.trim();
    const endTrimmed   = endIdQuery.trim();

    if (!startTrimmed && !endTrimmed) {
      if (startIndex !== 0) setStartIndex(0);
      if (endIndex !== total - 1) setEndIndex(total - 1);
      return;
    }

    const startTarget = startMatch ? startMatch.row : null; // 1-based marked row
    const endTarget   = endMatch   ? endMatch.row   : null;

    let nextStartIdx = startIndex ?? 0;
    let nextEndIdx   = endIndex ?? total - 1;

    // startTarget is the 1-based marked row; as a 0-based index it already
    // points to the row AFTER the marked one ("mulai setelah").
    if (startTarget !== null) nextStartIdx = startTarget;
    else if (!startTrimmed) nextStartIdx = 0;
    if (endTarget !== null) nextEndIdx = endTarget - 1;
    else if (!endTrimmed) nextEndIdx = total - 1;

    const startIsLast = startTarget !== null && startTarget >= total;
    if (startIsLast) {
      nextStartIdx = total; // > last index -> empty via selectedBounds
      toast("ID penanda adalah transaksi terakhir — tidak ada transaksi setelahnya.");
    } else if (nextStartIdx > nextEndIdx) {
      [nextStartIdx, nextEndIdx] = [nextEndIdx, nextStartIdx];
      toast.success("Rentang ditukar otomatis (awal > akhir).");
    }

    if (nextStartIdx !== startIndex) setStartIndex(nextStartIdx);
    if (nextEndIdx !== endIndex) setEndIndex(nextEndIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, startIdQuery, endIdQuery, startMatch?.row, endMatch?.row]);

  const handleRowClick = useCallback((rowIndex: number) => {
    if (markMode === "start") {
      setStartIndex(rowIndex);
      setMarkMode(null);
    } else if (markMode === "end") {
      setEndIndex(rowIndex);
      setMarkMode(null);
    }
  }, [markMode]);

  const handleStartInput = useCallback((value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    const clamped = clamp(parsed, 1, totalRows);
    setStartIndex(clamped - 1);
  }, [totalRows]);

  const handleEndInput = useCallback((value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    const clamped = clamp(parsed, 1, totalRows);
    setEndIndex(clamped - 1);
  }, [totalRows]);

  // â”€â”€ Output actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const copyTSV = useCallback(async () => {
    if (!filteredData.length) return;
    try {
      const tsv = filteredData
        .map((row) => {
          const cleanTrxId = String(row.nama || "").replace(/[\t\n\r]/g, "").trim();
          const cleanUsername = String(row.userId || "").replace(/[\t\n\r]/g, "").trim();
          const cleanAmount = String(row.deposit || "0").replace(/[\t\n\r]/g, "").trim();
          const cleanDate = String(row.nomorRekening || "").replace(/[\t\n\r]/g, " ").trim();

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
  }, [filteredData]);

  const handleCopyDocQris = useCallback(async () => {
    if (!filteredData.length) return;
    try {
      // 6-column TSV: NAMA, NOMINAL, (hidden C), STATUS, KODE EWALLET, KODE WEB
      const tsv = filteredData
        .map(
          (row) =>
            [
              row.nama,            // Column A: NAMA (trxId)
              row.deposit,         // Column B: NOMINAL (amount)
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
  }, [filteredData]);

  const exportXlsx = useCallback(() => {
    if (!filteredData.length) return;
    try {
      const rows = filteredData.map(rowToArr);
      const ws = XLSX.utils.aoa_to_sheet([OUTPUT_HEADERS, ...rows]);

      ws["!cols"] = OUTPUT_HEADERS.map((header, columnIndex) => ({
        wch: Math.max(header.length, ...rows.map((row) => String(row[columnIndex] ?? "").length)) + 2,
      }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, ws, "Output DP");

      const baseName = file?.name.replace(/\.xlsx$/i, "") ?? "dp-output";
      XLSX.writeFile(workbook, `${baseName}_output.xlsx`);
      toast.success(`"${baseName}_output.xlsx" berhasil diunduh!`);
    } catch {
      toast.error("Gagal ekspor Excel.");
    }
  }, [filteredData, file]);

  // â”€â”€ Derived booleans & shared styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const isFullRange = totalRows > 0 && selectedBounds.minIdx === 0 && selectedBounds.maxIdx === totalRows - 1;

  const inputCls = [
    "neu-inset text-[#23321B] placeholder:text-[#596B4F]/60",
    "rounded-xl focus:outline-none focus:ring-2 focus:ring-[#74A355] transition-all px-3 py-1.5",
  ].join(" ");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start w-full">
      {/* Hidden file input */}
      <input
        type="file"
        accept=".xlsx"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileSelect}
        data-testid="dp-input-file"
      />

      {/* ── LEFT COLUMN: TABLE STUDIO / DROPZONE (xl:col-span-8) ── */}
      <div className="xl:col-span-8 flex flex-col gap-5">
        
        {/* Title Header Row (when data loaded) */}
        {data && !error && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#23321B]">
                PRATINJAU DATA TRANSAKSI DP
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-[#74A355]/20 text-[#74A355] text-[10px] font-mono font-bold">
                {filteredData.length} / {totalRows}
              </span>

              {file && (
                <div className="flex items-center gap-1.5 bg-[#F6F3C2] px-2.5 py-1 rounded-xl border border-[#E8E2B5] text-[11px] font-bold text-[#23321B]">
                  <FileSpreadsheet size={13} className="text-[#3A592B]" />
                  <span className="max-w-[140px] truncate" title={file.name}>{file.name}</span>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[#CC2936] hover:bg-red-100 p-0.5 rounded transition-colors ml-0.5"
                    title="Ganti / Hapus File"
                    data-testid="button-remove-file"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {sheetNames.length > 1 && (
                <select
                  value={selectedSheet}
                  onChange={(e) => changeSheet(e.target.value)}
                  className="text-xs font-bold text-[#3A592B] bg-white/80 border border-[#E8E2B5] rounded-xl px-2 py-1 focus:outline-none cursor-pointer"
                >
                  {sheetNames.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#596B4F] pointer-events-none" />
              <input
                type="text"
                placeholder="Cari kata kunci…"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                className={`w-36 h-7 pl-7 pr-6 text-xs ${inputCls}`}
                data-testid="input-table-filter"
              />
              {tableFilter && (
                <button
                  onClick={() => setTableFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#596B4F] hover:text-[#23321B]"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error Notification */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-red-100 border border-red-300 text-[#CC2936]"
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={18} />
                <span className="text-xs font-bold">{error}</span>
              </div>
              <button onClick={() => setError(null)}><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Interactive Dropzone Canvas (when !data || error) */}
        {!data || error ? (
          <motion.div
            whileHover={{ scale: 1.005 }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`neu-card rounded-[2.5rem] p-10 text-center flex flex-col items-center justify-center min-h-[380px] border-2 border-dashed transition-all cursor-pointer group relative overflow-hidden ${
              isDragging
                ? "border-[#74A355] bg-[#74A355]/15 ring-4 ring-[#74A355]/30"
                : "border-[#D5C988] hover:border-[#74A355]"
            }`}
            data-testid="dp-upload-zone"
          >
            <AnimatePresence mode="wait">
              {isParsing ? (
                <motion.div key="parsing" className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full border-4 border-[#74A355]/20 border-t-[#74A355] animate-spin" />
                  <p className="text-[#596B4F] font-bold text-xs">Memproses data deposit…</p>
                </motion.div>
              ) : (
                <motion.div key="prompt" className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl clay-btn-green flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform">
                    <Upload size={28} className="text-white" />
                  </div>
                  <h3 className="text-base font-extrabold text-[#23321B] tracking-wide uppercase">
                    SERET & LEPAS FILE EXCEL (.XLSX) DI SINI
                  </h3>
                  <p className="text-xs text-[#596B4F] font-medium mt-1 mb-5">
                    Format file deposit: <span className="font-mono font-bold text-[#3A592B]">deposit-report-*.xlsx</span>
                  </p>
                  <button
                    type="button"
                    className="clay-btn-green px-5 py-2.5 rounded-xl text-xs font-extrabold tracking-wider uppercase shadow-md pointer-events-none"
                  >
                    [ PILIH FILE EXCEL (.XLSX) ]
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* Data Table Studio */
          <div className="flex flex-col gap-4">
            {/* Duplicate Warning */}
            {duplicateTrxSummary.count > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2 px-4 py-3 rounded-2xl border border-amber-300 bg-amber-50 shadow-sm"
              >
                <div className="flex items-center gap-2 text-amber-800">
                  <TriangleAlert size={16} className="shrink-0 text-amber-600" />
                  <span className="text-sm font-bold">
                    WARNING: Ditemukan {duplicateTrxSummary.count} ID Transaksi Duplikat!
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {duplicateTrxSummary.preview.map((trxId) => (
                    <span
                      key={trxId}
                      className="px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-[11px] font-mono text-amber-900"
                    >
                      {trxId}
                    </span>
                  ))}
                  {duplicateTrxSummary.count > duplicateTrxSummary.preview.length && (
                    <span className="px-2 py-1 text-[11px] text-amber-800 font-medium">
                      +{duplicateTrxSummary.count - duplicateTrxSummary.preview.length} lainnya
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {/* Table Container */}
            <div className="neu-card rounded-[2rem] overflow-hidden border-2 border-[#D5C988] shadow-lg shadow-[#4A4215]/10">
              <div className="overflow-x-auto overflow-y-auto max-h-[560px]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="text-[10px] uppercase tracking-wider text-[#23321B] bg-[#EFEBA9] sticky top-0 z-10 border-b border-[#E8E2B5]">
                    <tr>
                      <th className="px-3 py-3 text-center w-10 border-b border-[#E8E2B5] font-extrabold whitespace-nowrap">#</th>
                      {OUTPUT_HEADERS.map((header, columnIndex) => (
                        <th key={columnIndex} className="px-3 py-3 font-extrabold whitespace-nowrap border-b border-[#E8E2B5]">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="font-mono text-xs divide-y divide-[#E8E2B5]">
                    {data.map((row, rowIndex) => {
                      const rowNumber = rowIndex + 1;
                      const inRange   = rowIndex >= selectedBounds.minIdx && rowIndex <= selectedBounds.maxIdx;
                      const isStart   = rowIndex === startIndex;
                      const isEnd     = rowIndex === endIndex;
                      const isDup     = duplicateTrxIds.has(row.nama);

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
                          key={rowIndex}
                          className={`transition-colors duration-100 bg-[#FDFBD4] text-[#23321B]
                            ${inRange ? "hover:bg-[#F5F0C2]" : "opacity-30"}
                            ${isStart ? "border-t-2 border-t-[#74A355]" : ""}
                            ${isEnd ? "border-b-2 border-b-rose-500" : ""}
                            ${isDup && inRange ? "bg-amber-100" : ""}`}
                        >
                          <td className="px-3 py-2 text-center align-middle select-none">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-bold transition-all
                              ${isStart  ? "bg-[#74A355] text-white"
                              : isEnd    ? "bg-rose-500 text-white"
                              : isDup && inRange ? "bg-amber-500 text-white"
                              : "text-[#596B4F]"}`}
                            >
                              {isDup && inRange ? "!" : rowNumber}
                            </span>
                          </td>

                          <td className="px-3 py-2 whitespace-nowrap text-[#596B4F] text-[11px] font-medium">{row.nama}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-teal-700 text-[11px] font-semibold">{row.nomorRekening}</td>
                          <td className={`px-3 py-2 whitespace-nowrap ${isDup && inRange ? "text-amber-800 font-bold" : "text-[#23321B] font-medium"}`}>
                            {row.userId}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.sub}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#74A355] font-bold">{row.kodeTransaksi}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#74A355] font-bold">{row.deposit}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.withdrawal}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.dpPulsa}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#596B4F] text-[11px] max-w-[180px] truncate" title={row.keterangan}>
                            {row.keterangan}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.kodeBank}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.saldoAkhir}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#74A355] font-semibold">{row.jamInput}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[#74A355] font-semibold">{row.inputKodeBank}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN: STATS & CONTROLS PANEL (xl:col-span-4) ── */}
      <div className="xl:col-span-4 flex flex-col gap-5">
        
        {/* If no data loaded: Info & Instructions Card */}
        {!data || error ? (
          <div className="neu-card rounded-[2rem] p-6 border-2 border-[#D5C988] flex flex-col gap-4 shadow-lg shadow-[#4A4215]/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#3A592B] text-white flex items-center justify-center shadow-md shrink-0">
                <ArrowDownToLine size={20} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#23321B]">
                  QRIS HOKI DP
                </h3>
                <p className="text-[11px] font-mono font-bold text-[#74A355] mt-0.5">
                  SUB: BOT &nbsp;·&nbsp; KODE TRANSAKSI: DP
                </p>
              </div>
            </div>

            <div className="border-t border-[#E8E2B5] pt-3 flex flex-col gap-3">
              <p className="text-xs font-medium text-[#596B4F] leading-relaxed">
                Modul pemroses laporan deposit QRIS HOKI untuk mengekstrak data transaksi sukses ke format standar Doc TRX & Doc QRIS.
              </p>

              <div className="bg-[#F6F3C2] p-3 rounded-xl border border-[#E8E2B5] flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#23321B]">
                  <span className="w-5 h-5 rounded-full bg-[#74A355] text-white text-[10px] flex items-center justify-center shrink-0">1</span>
                  <span>Unggah File Deposit Report (.xlsx)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#23321B]">
                  <span className="w-5 h-5 rounded-full bg-[#74A355] text-white text-[10px] flex items-center justify-center shrink-0">2</span>
                  <span>Filter Otomatis Status Success</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[#23321B]">
                  <span className="w-5 h-5 rounded-full bg-[#74A355] text-white text-[10px] flex items-center justify-center shrink-0">3</span>
                  <span>Salin ke Doc TRX / Doc QRIS dengan 1-Klik</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* When data is loaded: Action Buttons + Stat Cards + Range Controls */
          <>
            {/* Action Buttons Card */}
            <div className="neu-card rounded-[2rem] p-5 border-2 border-[#D5C988] flex flex-col gap-3 shadow-lg shadow-[#4A4215]/10">
              <div className="flex items-center gap-2 border-b border-[#E8E2B5] pb-2.5">
                <Zap size={15} className="text-[#3A592B]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#23321B]">
                  AKSI EKSTRAKSI & SALIN
                </h3>
              </div>
              
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={copyTSV}
                  disabled={filteredData.length === 0}
                  className="clay-btn-green w-full py-2.5 rounded-xl text-xs font-extrabold tracking-wide uppercase shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  data-testid="button-copy-tsv"
                >
                  <Copy size={14} />
                  <span>{copiedType === "trx" ? "TERSALIN KE DOC TRX!" : "SALIN KE DOC TRX"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyDocQris}
                  disabled={filteredData.length === 0}
                  className="neu-flat w-full py-2.5 rounded-xl text-xs font-extrabold tracking-wide uppercase text-[#23321B] hover:bg-white border border-[#D5C988] shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  data-testid="button-copy-qris"
                >
                  <Copy size={14} className="text-[#74A355]" />
                  <span>{copiedType === "qris" ? "TERSALIN KE DOC QRIS!" : "SALIN KE DOC QRIS"}</span>
                </button>

                <button
                  type="button"
                  onClick={exportXlsx}
                  disabled={filteredData.length === 0}
                  className="neu-flat w-full py-2.5 rounded-xl text-xs font-bold text-[#596B4F] hover:text-[#23321B] hover:bg-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  data-testid="button-export-excel"
                >
                  <Download size={14} />
                  <span>EXPORT FILE EXCEL</span>
                </button>
              </div>
            </div>

            {/* Summary Stat Cards */}
            {stats && (
              <div className="flex flex-col gap-3">
                <div className="neu-card rounded-2xl p-4 border-2 border-[#D5C988] flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#3A592B] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <ListOrdered size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-[#596B4F]">BARIS DIPILIH</p>
                      <p className="text-lg font-mono font-bold text-[#23321B]">
                        {stats.count} <span className="text-xs font-normal text-[#596B4F]">/ {totalRows}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="neu-card rounded-2xl p-4 border-2 border-[#D5C988] flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#74A355] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Banknote size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-[#596B4F]">TOTAL DEPOSIT</p>
                      <p className="text-lg font-mono font-bold text-[#23321B] truncate">
                        {fmt(stats.totalNominal)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={`neu-card rounded-2xl p-4 border-2 flex items-center justify-between shadow-sm transition-colors ${
                  stats.dupCount > 0 ? "border-amber-400 bg-amber-50/50" : "border-[#D5C988]"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm ${
                      stats.dupCount > 0 ? "bg-amber-500" : "bg-[#596B4F]"
                    }`}>
                      {stats.dupCount > 0 ? <TriangleAlert size={18} /> : <Layers size={18} />}
                    </div>
                    <div>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${stats.dupCount > 0 ? "text-amber-800" : "text-[#596B4F]"}`}>
                        {stats.dupCount > 0 ? "ID DUPLIKAT" : "TOTAL FILE"}
                      </p>
                      <p className={`text-lg font-mono font-bold ${stats.dupCount > 0 ? "text-amber-900" : "text-[#23321B]"}`}>
                        {stats.dupCount > 0 ? `${stats.dupCount} baris` : totalRows}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* RENTANG ID & CONTROLS Card */}
            <div className="neu-card rounded-[2rem] p-5 border-2 border-[#D5C988] flex flex-col gap-4 shadow-lg shadow-[#4A4215]/10">
              <div className="flex items-center justify-between border-b border-[#E8E2B5] pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-[#3A592B]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#23321B]">
                    RENTANG ID & CONTROLS
                  </h3>
                </div>
                {!isFullRange && (
                  <button
                    type="button"
                    onClick={() => { setStartIndex(0); setEndIndex(totalRows - 1); setMarkMode(null); }}
                    className="text-[11px] font-bold text-[#CC2936] hover:underline cursor-pointer"
                  >
                    RESET
                  </button>
                )}
              </div>

              {/* Quick Range Inputs */}
              <div className="flex items-center justify-between gap-2 bg-[#F6F3C2] p-2.5 rounded-xl border border-[#E8E2B5]">
                <span className="text-xs font-bold text-[#596B4F]">Baris:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={totalRows}
                    value={startRow}
                    onChange={(e) => handleStartInput(e.target.value)}
                    className="w-14 h-7 text-xs font-mono font-bold text-center bg-white rounded-lg border border-[#E8E2B5] text-[#23321B]"
                  />
                  <span className="text-xs text-[#596B4F] font-bold">-</span>
                  <input
                    type="number"
                    min={1}
                    max={totalRows}
                    value={endRow}
                    onChange={(e) => handleEndInput(e.target.value)}
                    className="w-14 h-7 text-xs font-mono font-bold text-center bg-white rounded-lg border border-[#E8E2B5] text-[#23321B]"
                  />
                </div>
              </div>

              {/* ID Range Pickers */}
              <IdRangePicker
                label="ID Awal"
                accent="emerald"
                icon={<Flag size={12} />}
                query={startIdQuery}
                onQueryChange={(value) => { setStartIdQuery(value); setStartMatchIdx(0); }}
                matches={startMatches}
                matchIdx={startMatchIdx}
                onCycle={(direction) => {
                  if (!startMatches.length) return;
                  setStartMatchIdx((current) => {
                    const next = current + direction;
                    if (next < 0) return startMatches.length - 1;
                    if (next >= startMatches.length) return 0;
                    return next;
                  });
                }}
                onClear={() => { setStartIdQuery(""); setStartMatchIdx(0); }}
                inputCls={inputCls}
                testidPrefix="start"
                excludeMarked
              />

              <IdRangePicker
                label="ID Akhir"
                accent="rose"
                icon={<FlagOff size={12} />}
                query={endIdQuery}
                onQueryChange={(value) => { setEndIdQuery(value); setEndMatchIdx(0); }}
                matches={endMatches}
                matchIdx={endMatchIdx}
                onCycle={(direction) => {
                  if (!endMatches.length) return;
                  setEndMatchIdx((current) => {
                    const next = current + direction;
                    if (next < 0) return endMatches.length - 1;
                    if (next >= endMatches.length) return 0;
                    return next;
                  });
                }}
                onClear={() => { setEndIdQuery(""); setEndMatchIdx(0); }}
                inputCls={inputCls}
                testidPrefix="end"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
