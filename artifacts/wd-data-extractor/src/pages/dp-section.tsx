import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
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
  TriangleAlert,
  Upload,
  X,
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
    <div className="flex flex-col gap-ds-lg">

      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl neu-flat border border-white/80 bg-[#FDFBD4]"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-[#74A355] shrink-0 shadow-sm" />
        <span className="text-sm font-semibold text-[#23321B]">QRIS HOKI DP</span>
        <span className="text-xs text-[#596B4F] ml-1 hidden sm:inline font-medium">
          SUB: {DP_OUTPUT_SUB} &nbsp;·&nbsp; KODE TRANSAKSI: {DP_OUTPUT_KODE_TRANSAKSI}
        </span>
      </motion.div>

      {/* ── UPLOAD ZONE ── */}
      <div
        data-testid="dp-upload-zone"
        className={`relative group w-full rounded-2xl border-2 border-dashed transition-all duration-300
          flex flex-col items-center justify-center p-12 sm:p-16 text-center overflow-hidden gap-ds-md
          ${isDragging
            ? "border-[#74A355] bg-[#74A355]/10 scale-[1.01]"
            : file
            ? "border-[#E8E2B5] neu-card"
            : "border-[#E8E2B5] neu-card hover:border-[#74A355]/60 cursor-pointer"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
      >
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
              <div className="w-14 h-14 rounded-full border-4 border-[#74A355]/20 border-t-[#74A355] animate-spin" />
              <p className="text-[#596B4F] font-medium">Memproses data deposit…</p>
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
              <div className="w-16 h-16 rounded-2xl bg-[#74A355]/15 border border-[#74A355]/30 flex items-center justify-center">
                <FileSpreadsheet size={30} className="text-[#74A355]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#23321B]">{file.name}</h3>
                <p className="text-xs text-[#596B4F] mt-0.5 font-mono">{(file.size / 1024).toFixed(1)} KB</p>
              </div>

              {/* Sheet picker (shown only when workbook has multiple sheets) */}
              {sheetNames.length > 1 && (
                <div
                  className="flex items-center gap-2 flex-wrap justify-center"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="text-xs text-[#596B4F]">Sheet:</span>
                  {sheetNames.map((sheetName) => (
                    <button
                      key={sheetName}
                      type="button"
                      onClick={() => changeSheet(sheetName)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                        ${sheetName === selectedSheet
                          ? "bg-[#74A355] text-white border-[#567C3E]"
                          : "border-[#E8E2B5] text-[#596B4F] hover:bg-white/60 text-[#23321B]"}`}
                    >
                      {sheetName}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); reset(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#CC2936]
                  hover:bg-red-500/10 border border-red-300 transition-all"
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
                    ? "bg-[#74A355] border-[#567C3E] text-white"
                    : "bg-[#74A355]/10 border-[#74A355]/30 text-[#74A355] group-hover:bg-[#74A355]/20"}`}
              >
                <Upload size={26} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#23321B]">Drop file Deposit Report di sini</h3>
                <p className="text-sm text-[#596B4F] mt-1.5 font-medium">
                  Format: <span className="text-[#74A355] font-bold">deposit-report-*.xlsx</span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── ERROR BANNER ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-start gap-4 p-5 rounded-2xl border border-red-300 bg-red-50 text-[#CC2936]">
              <AlertCircle size={22} className="text-[#CC2936] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#CC2936] mb-1">Proses Gagal</p>
                <p className="text-xs text-[#CC2936]/80">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-[#CC2936]/60 hover:text-[#CC2936] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DATA PREVIEW ── */}
      <AnimatePresence>
        {data && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex flex-col gap-ds-lg"
          >
            {/* Stat cards */}
            {stats && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-ds-md"
              >
                {/* Row count */}
                <div className="flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-2xl neu-card border border-white/80">
                  <div className="w-12 h-12 rounded-xl clay-badge flex items-center justify-center shrink-0">
                    <ListOrdered size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#596B4F] font-semibold">Baris Dipilih</p>
                    <p className="text-2xl font-bold text-[#23321B] leading-tight font-mono mt-1">
                      {stats.count}
                      <span className="text-sm text-[#596B4F] font-normal ml-1">/ {totalRows}</span>
                    </p>
                  </div>
                </div>

                {/* Total deposit */}
                <div className="flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-2xl neu-card border border-white/80">
                  <div className="w-12 h-12 rounded-xl clay-badge flex items-center justify-center shrink-0">
                    <Banknote size={20} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-[#596B4F] font-semibold">Total Deposit</p>
                    <p className="text-2xl font-bold text-[#23321B] leading-tight font-mono mt-1 truncate">
                      {fmt(stats.totalNominal)}
                    </p>
                  </div>
                </div>

                {/* Duplicate IDs or Total File count */}
                <div className={`flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-2xl neu-card border border-white/80 transition-colors ${stats.dupCount > 0 ? "border-amber-400" : ""}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white font-bold
                    ${stats.dupCount > 0
                      ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-md"
                      : "clay-badge"}`}
                  >
                    {stats.dupCount > 0
                      ? <TriangleAlert size={20} />
                      : <Layers size={20} />
                    }
                  </div>
                  <div>
                    {stats.dupCount > 0 ? (
                      <>
                        <p className="text-xs uppercase tracking-wide text-[#C87A14] font-semibold">ID Duplikat</p>
                        <p className="text-2xl font-bold text-[#C87A14] leading-tight font-mono mt-1">
                          {stats.dupCount} <span className="text-sm font-normal">baris</span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs uppercase tracking-wide text-[#596B4F] font-semibold">Total File</p>
                        <p className="text-2xl font-bold text-[#23321B] leading-tight font-mono mt-1">{totalRows}</p>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Top bar: title + export buttons */}
            <div className="flex items-center justify-between gap-ds-md flex-wrap">
              <div className="flex items-center gap-ds-md">
                <h2 className="text-base font-semibold text-[#23321B]">Pratinjau Data DP</h2>
                <span className="px-3 py-1 rounded-full bg-[#74A355]/15 text-[#74A355] text-xs font-bold border border-[#74A355]/30">
                  {totalRows} total
                </span>
              </div>
              <div className="flex items-center gap-ds-sm flex-wrap">
                <button
                  type="button"
                  onClick={exportXlsx}
                  disabled={filteredData.length === 0}
                  className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold neu-flat text-[#23321B] hover:bg-white transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  type="button"
                  onClick={copyTSV}
                  disabled={filteredData.length === 0}
                  className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold transition-all clay-btn-green disabled:opacity-35 disabled:cursor-not-allowed"
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
                  className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold transition-all clay-btn-green disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  {copiedType === "qris"
                    ? <><Check size={15} />Tersalin!</>
                    : <><Copy size={15} />Copy to Doc Qris</>
                  }
                </button>
              </div>
            </div>

            {/* ── Controls panel: row range + ID search + table filter ── */}
            <div className="flex flex-col gap-ds-md p-5 rounded-2xl neu-card border border-white/80">

              {/* Row range inputs + mark mode buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <ChevronsUpDown size={14} className="text-[#596B4F] shrink-0" />
                <span className="text-xs font-semibold text-[#596B4F] shrink-0">RENTANG:</span>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#596B4F]">Mulai</span>
                  <input
                    type="number"
                    min={1}
                    max={totalRows}
                    value={startRow}
                    onChange={(event) => handleStartInput(event.target.value)}
                    className={`w-16 h-7 px-2 text-sm text-center font-mono ${inputCls}`}
                  />
                </div>

                <span className="text-[#596B4F] text-xs">—</span>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#596B4F]">Sampai</span>
                  <input
                    type="number"
                    min={1}
                    max={totalRows}
                    value={endRow}
                    onChange={(event) => handleEndInput(event.target.value)}
                    className={`w-16 h-7 px-2 text-sm text-center font-mono ${inputCls}`}
                  />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {!isFullRange && (
                    <button
                      onClick={() => { setStartIndex(0); setEndIndex(totalRows - 1); setMarkMode(null); }}
                      className="text-xs text-[#596B4F] hover:text-[#23321B] underline underline-offset-2 transition-colors font-medium"
                    >
                      Reset
                    </button>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border
                    ${isFullRange ? "bg-[#FDFBD4] border-[#E8E2B5] text-[#596B4F]" : "bg-amber-100 border-amber-300 text-amber-800"}`}>
                    {rangeData.length} dipilih
                  </span>
                </div>
              </div>

              <div className="border-t border-[#E8E2B5]" />

              {/* ID range pickers (two independent boxes) — sama dengan WD */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-ds-md">
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

              <div className="border-t border-[#E8E2B5]" />

              {/* Table text filter */}
              <div className="flex flex-wrap items-center gap-2">
                <Hash size={13} className="text-[#596B4F] shrink-0" />
                <span className="text-xs font-semibold text-[#596B4F] shrink-0 hidden sm:inline">FILTER:</span>
                <div className="ml-auto flex items-center gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#596B4F] pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Filter tabel..."
                      value={tableFilter}
                      onChange={(event) => setTableFilter(event.target.value)}
                      className={`w-32 h-7 pl-7 pr-7 text-xs ${inputCls}`}
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
                  {tableFilter && (
                    <span className="text-[11px] text-[#596B4F]">{filteredData.length} hasil</span>
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
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                      : "bg-rose-50 border-rose-300 text-rose-800"}`}
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

            {/* ── Preview table ── */}
            <div className="rounded-2xl overflow-hidden neu-card border border-white/80">
              <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-[10px] uppercase tracking-wider text-[#23321B] bg-[#EFEBA9] sticky top-0 z-10 border-b border-[#E8E2B5]">
                    <tr>
                      <th className="px-ds-md py-ds-sm text-center w-10 border-b border-[#E8E2B5] font-bold whitespace-nowrap">#</th>
                      {OUTPUT_HEADERS.map((header, columnIndex) => (
                        <th key={columnIndex} className="px-ds-md py-ds-sm font-bold whitespace-nowrap border-b border-[#E8E2B5]">
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
                          key={rowIndex}
                          className={`transition-colors duration-100 bg-[#FDFBD4] text-[#23321B]
                            ${inRange ? "hover:bg-[#F5F0C2]" : "opacity-30"}
                            ${isStart ? "border-t-2 border-t-[#74A355]" : ""}
                            ${isEnd ? "border-b-2 border-b-rose-500" : ""}
                            ${isDup && inRange ? "bg-amber-100" : ""}`}
                        >
                          {/* Row number / mark cell */}
                          <td
                            className={`px-3 py-2.5 text-center align-middle select-none ${markMode ? "cursor-pointer" : ""}`}
                            onClick={() => markMode && handleRowClick(rowIndex)}
                          >
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-bold transition-all
                              ${isStart  ? "bg-[#74A355] text-white"
                              : isEnd    ? "bg-rose-500 text-white"
                              : isDup && inRange ? "bg-amber-500 text-white"
                              : markMode ? "text-[#74A355] hover:bg-[#74A355]/20"
                              : "text-[#596B4F]"}`}
                            >
                              {isDup && inRange ? "!" : rowNumber}
                            </span>
                          </td>

                          {/* Data cells */}
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#596B4F] text-[11px] font-medium">{row.nama}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-teal-700 text-[11px] font-semibold">{row.nomorRekening}</td>
                          <td className={`px-4 py-2.5 whitespace-nowrap ${isDup && inRange ? "text-amber-800 font-bold" : "text-[#23321B] font-medium"}`}>
                            {row.userId}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#596B4F]">{row.sub}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#74A355] font-bold">{row.kodeTransaksi}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#74A355] font-bold">{row.deposit}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#596B4F]">{row.withdrawal}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#596B4F]">{row.dpPulsa}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#596B4F] text-[11px] max-w-[200px] truncate" title={row.keterangan}>
                            {row.keterangan}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#596B4F]">{row.kodeBank}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#596B4F]">{row.saldoAkhir}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#74A355] font-semibold">{row.jamInput}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[#74A355] font-semibold">{row.inputKodeBank}</td>
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
