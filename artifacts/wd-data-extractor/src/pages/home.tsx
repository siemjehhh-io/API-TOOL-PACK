// External dependencies
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Banknote,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Copy,
  Download,
  FileSpreadsheet,
  Flag,
  FlagOff,
  Hash,
  Layers,
  ListOrdered,
  QrCode,
  Search,
  Shield,
  TableProperties,
  TriangleAlert,
  Trophy,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// React
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

// Shared components
import { IdRangePicker } from "@/components/IdRangePicker";

// Local pages — lazy-loaded so each tab ships as its own chunk.
const DpSection = lazy(() =>
  import("@/pages/dp-section").then((m) => ({ default: m.DpSection })),
);
const GigaCopyBonus = lazy(() => import("@/pages/GigaCopyBonus"));
const GigaCopyDpHoki = lazy(() => import("@/pages/GigaCopyDpHoki"));
const GigaCopyDpZenpay = lazy(() => import("@/pages/GigaCopyDpZenpay"));
const GigaCopyWd = lazy(() => import("@/pages/GigaCopyWd"));
const GigaSmartMutasi = lazy(() => import("@/pages/GigaSmartMutasi"));
const CheckPusatGigaTools = lazy(() => import("@/pages/CheckPusatGigaTools"));
const WdQrisAjaibOzzo = lazy(() => import("@/pages/WdQrisAjaibOzzo"));
const PhishShield = lazy(() => import("@/pages/PhishShield"));

// Lightweight spinner shown while a tab's chunk is being fetched.
const TabLoadingFallback = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-12 h-12 rounded-full border-4 border-violet-400/20 border-t-violet-400 animate-spin" />
  </div>
);

// â”€â”€â”€ Output row type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// This is the internal representation of one processed withdrawal row.
// Field names map 1-to-1 with OUTPUT_HEADERS (see below).
// _paymentMethod is a temporary field used for display only â€” not exported.

interface ExtractedRow {
  nama:           string; // col 1:  NAMA
  nomorRekening:  string; // col 2:  NOMOR REKENING  (payment method + account number)
  userId:         string; // col 3:  USER ID / LOGIN (transaction ID before the first "-")
  sub:            string; // col 4:  SUB
  kodeTransaksi:  string; // col 5:  KODE TRANSAKSI
  deposit:        string; // col 6:  DEPOSIT         (always empty for WD rows)
  withdrawal:     string; // col 7:  WITHDRAWAL      (total amount)
  dpPulsa:        string; // col 8:  DP PULSA        (always empty for WD rows)
  keterangan:     string; // col 9:  KETERANGAN / KODE SN
  kodeBank:       string; // col 10: KODE BANK       (always empty for WD rows)
  saldoAkhir:     string; // col 11: SALDO AKHIR     (always empty for WD rows)
  jamInput:       string; // col 12: JAM INPUT WD    (HH:MM:SS from finished date)
  inputKodeBank:  string; // col 13: INPUT KODE BANK (always empty for WD rows)
  _paymentMethod: string; // internal: raw payment method, used for table colouring
  _userIdNeedsReview?: boolean;
}

// â”€â”€â”€ Output column headers (same order for WD and DP) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

const WD_OUTPUT_SUB = "BOT";
const WD_OUTPUT_KODE_TRANSAKSI = "WD";
const WD_USER_ID_REGEX = /^(?=.{5,30}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_]+$/;

const WD_SOURCE_COLUMNS = {
  accountName: "Account Name",
  paymentMethod: "Payment Method",
  accountNumber: "Account Number",
  transactionId: "Transaction ID",
  totalAmount: "Total Amount",
  finishedDate: "Finished Date",
};

// â”€â”€â”€ Pure utility functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Serialize a row to an ordered string array matching OUTPUT_HEADERS. */
function rowToArr(row: ExtractedRow): string[] {
  return [
    row.nama, row.nomorRekening, row.userId, row.sub, row.kodeTransaksi,
    row.deposit, row.withdrawal, row.dpPulsa, row.keterangan,
    row.kodeBank, row.saldoAkhir, row.jamInput, row.inputKodeBank,
  ];
}

/**
 * Extract "HH:MM:SS" from a cell value that may be:
 * - An Excel serial date number  (e.g. 46000.75)
 * - A date-time string           (e.g. "2026-05-03 17:54:19")
 */
function formatExcelDate(cellValue: unknown): string {
  if (!cellValue) return "";

  if (typeof cellValue === "number") {
    // Excel serial date â†’ JS Date â†’ time string
    const date = new Date((cellValue - (25567 + 2)) * 86400 * 1000);
    return date.toISOString().substr(11, 8);
  }

  if (typeof cellValue === "string") {
    const match = cellValue.match(/(\d{2}:\d{2}:\d{2})/);
    if (match) return match[1];
  }

  return "";
}

function formatExcelDateTime(cellValue: unknown): string {
  if (!cellValue) return "";

  if (typeof cellValue === "number") {
    const date = new Date((cellValue - (25567 + 2)) * 86400 * 1000);
    return date.toISOString().replace("T", " ").slice(0, 19);
  }

  return String(cellValue).trim();
}

function cleanWdUserIdCandidate(value: unknown): string {
  return String(value ?? "").trim().replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/^[^A-Za-z0-9_]+|[^A-Za-z0-9_]+$/g, "");
}

function isLikelyWdUserId(value: unknown): boolean {
  return WD_USER_ID_REGEX.test(cleanWdUserIdCandidate(value));
}

function extractWdUserId(rawValue: unknown): string {
  const block = String(rawValue ?? "").trim();
  if (!block) return "";

  const candidates: string[] = [];
  const pushCandidate = (value: unknown) => {
    const candidate = cleanWdUserIdCandidate(value);
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };

  pushCandidate(block);

  const compactBlock = block.replace(/\s+/g, "");
  const whitelabelMatch = block.match(/([A-Za-z0-9_]{5,30})\s*-\s*([A-Za-z0-9_]{1,20})/) ?? compactBlock.match(/([A-Za-z0-9_]{5,30})-([A-Za-z0-9_]{1,20})/);
  if (whitelabelMatch) {
    pushCandidate(whitelabelMatch[1]);
    pushCandidate(whitelabelMatch[2]);
  }

  if (block.includes("-")) {
    block.split("-").slice().reverse().forEach(pushCandidate);
  }

  block.match(/[A-Za-z0-9_]+/g)?.forEach(pushCandidate);

  return candidates.find(isLikelyWdUserId) ?? "";
}

function transformOutputData(raw: Record<string, unknown>[]): ExtractedRow[] {
  return raw.flatMap((row) => {
    const nama = String(row["NAMA"] ?? "").trim().toUpperCase();
    const nomorRekening = String(row["NOMOR REKENING"] ?? "").trim().toUpperCase();
    const userId = extractWdUserId(row["USER ID / LOGIN"]);
    let safeUserId = userId ? userId.trim() : "";
    if (safeUserId.includes(" ") || safeUserId.length > 20) {
        safeUserId = "";
    }

    const withdrawal = String(row["WITHDRAWAL"] ?? "").trim();
    const keterangan = String(row["KETERANGAN / KODE SN"] ?? "").trim();

    if (!nama && !nomorRekening && !safeUserId && !withdrawal && !keterangan) {
      return [];
    }

    const jamInput = String(row["JAM INPUT WD"] ?? "").trim() || formatExcelDate(keterangan);

    return [{
      nama,
      nomorRekening,
      userId: safeUserId,
      sub: String(row["SUB"] ?? WD_OUTPUT_SUB).trim() || WD_OUTPUT_SUB,
      kodeTransaksi: String(row["KODE TRANSAKSI"] ?? WD_OUTPUT_KODE_TRANSAKSI).trim() || WD_OUTPUT_KODE_TRANSAKSI,
      deposit: String(row["DEPOSIT"] ?? "").trim(),
      withdrawal,
      dpPulsa: String(row["DP PULSA"] ?? "").trim(),
      keterangan,
      kodeBank: String(row["KODE BANK"] ?? "").trim(),
      saldoAkhir: String(row["SALDO AKHIR"] ?? "").trim(),
      jamInput,
      inputKodeBank: String(row["INPUT KODE BANK"] ?? "").trim(),
      _paymentMethod: nomorRekening.split(/\s+/)[0] ?? "",
      _userIdNeedsReview: !safeUserId,
    }];
  });
}

/**
 * Transform raw Excel rows from a withdrawal report into ExtractedRow objects.
 * - Rows without key columns are skipped.
 * - Rows where Status !== "success" are skipped (if Status column exists).
 * - The user ID is truncated at the first "-" (removes branch suffix).
 */
function transformData(raw: Record<string, unknown>[]): ExtractedRow[] {
  const hasStatusCol = raw.length > 0 && "Status" in raw[0];

  return raw.flatMap((row) => {
    const rowValues = Object.values(row);
    const forcedColD = rowValues.length > 3 ? String(rowValues[3] ?? "").trim() : "";
    const rawColD = forcedColD || String(row["Whitelabel Transaction ID"] || row["Transaction ID"] || "");
    if (!rawColD && !row[WD_SOURCE_COLUMNS.paymentMethod] && !row[WD_SOURCE_COLUMNS.accountNumber]) {
      return [];
    }
    if (hasStatusCol && String(row["Status"] ?? "").trim().toLowerCase() !== "success") {
      return [];
    }

    const paymentMethod = String(row[WD_SOURCE_COLUMNS.paymentMethod] ?? "").trim();

    const userId = extractWdUserId(forcedColD) || extractWdUserId(rawColD);
    let safeUserId = userId ? userId.trim() : "";
    if (safeUserId.includes(" ") || safeUserId.length > 20) {
        safeUserId = "";
    }

    return [{
      nama:           String(row[WD_SOURCE_COLUMNS.accountName] ?? "").trim().toUpperCase(),
      nomorRekening:  `${paymentMethod} ${String(row[WD_SOURCE_COLUMNS.accountNumber] ?? "").trim()}`.trim().toUpperCase(),
      userId:        safeUserId,
      sub:            WD_OUTPUT_SUB,
      kodeTransaksi:  WD_OUTPUT_KODE_TRANSAKSI,
      deposit:        "",
      withdrawal:     String(row[WD_SOURCE_COLUMNS.totalAmount] ?? "").trim(),
      dpPulsa:        "",
      keterangan:     formatExcelDateTime(row[WD_SOURCE_COLUMNS.finishedDate]),
      kodeBank:       "",
      saldoAkhir:     "",
      jamInput:       formatExcelDate(row[WD_SOURCE_COLUMNS.finishedDate]),
      inputKodeBank:  "",
      _paymentMethod: paymentMethod.toUpperCase(),
      _userIdNeedsReview: !safeUserId,
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

/** Parse a formatted amount string back to a float (handles "1.250.000,50"). */
function parseAmt(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.,-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// â”€â”€â”€ Shared small button component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * A small glassmorphism toggle/action button used in the controls panel.
 * Pass `active` + `activeClass` to style the "on" state differently.
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

// ─── ID range picker ─────────────────────────────────────────────────────────
// Extracted to a shared component so both QRIS HOKI sections (WD here, DP in
// dp-section.tsx) use an identical marking UI/flow. See @/components/IdRangePicker.

// ─── Home page ───────────────────────────────────────────────────────────────
//
// Shell component that owns:
//   - Tab state (WD | DP)
//   - All WD extractor state + logic
//   - The shared header (logo, tab switcher, category tabs)
//
// The DP extractor logic lives entirely in <DpSection />.

export default function Home() {
  // ── Category & Tab ────────────────────────────────────────────────────────────

  const [mainSection, setMainSection] = useState<"formula" | "mutasi" | "phishing" | null>(null);
  const [activeCategory, setActiveCategory] = useState<"qris-hoki" | "giga" | "ozzo" | "giga-smart-mutasi">("giga");
  const [activeQrisTab, setActiveQrisTab] = useState<"wd" | "dp">("wd");
  const [activeGigaTab, setActiveGigaTab] = useState<"qrishoki" | "zenpay" | "bonus" | "check-pusat" | "wd">("qrishoki");
  const [activeOzzoTab, setActiveOzzoTab] = useState<"qris-ajaib">("qris-ajaib");

  // â”€â”€ WD extractor state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [isDragging, setIsDragging]       = useState(false);
  const [file, setFile]                   = useState<File | null>(null);
  const [data, setData]                   = useState<ExtractedRow[] | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [isParsing, setIsParsing]         = useState(false);
  const [isCopied, setIsCopied]           = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  // Multiple sheets: wbRef holds the parsed workbook so we can re-process on sheet change.
  const [sheetNames, setSheetNames]       = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const wbRef                             = useRef<XLSX.WorkBook | null>(null);

  // Row range selection (1-indexed, inclusive).
  const [startRow, setStartRow] = useState(1);
  const [endRow, setEndRow]     = useState(1);

  // Range marking via two independent ID search boxes.
  // Each box has its own typed query and currently-selected match index
  // (when an ID matches multiple rows the user can cycle through them).
  const [startIdQuery, setStartIdQuery]   = useState("");
  const [startMatchIdx, setStartMatchIdx] = useState(0);
  const [endIdQuery, setEndIdQuery]       = useState("");
  const [endMatchIdx, setEndMatchIdx]     = useState(0);

  // Table filter (client-side substring filter on visible columns).
  const [tableFilter, setTableFilter] = useState("");

  const totalRows = data?.length ?? 0;

  // â”€â”€ Derived data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Reset controls whenever a new file is loaded.
  useEffect(() => {
    if (data) {
      setStartRow(1);
      setEndRow(data.length);
      setStartIdQuery("");
      setStartMatchIdx(0);
      setEndIdQuery("");
      setEndMatchIdx(0);
      setTableFilter("");
    }
  }, [data]);

  // Slice the full dataset to the selected row range.
  const rangeData = useMemo(
    () => (data ? data.slice(startRow - 1, endRow) : []),
    [data, startRow, endRow]
  );

  // Apply the text filter on top of the range slice.
  const filteredData = useMemo(() => {
    const query = tableFilter.trim().toLowerCase();
    if (!query) return rangeData;
    return rangeData.filter(
      (row) =>
        row.nama.toLowerCase().includes(query) ||
        row.userId.toLowerCase().includes(query) ||
        row.nomorRekening.toLowerCase().includes(query) ||
        row.withdrawal.toLowerCase().includes(query)
    );
  }, [rangeData, tableFilter]);

  // Set of user IDs that appear more than once in the current range.
  const dupIds = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rangeData) {
      if (row.userId) counts[row.userId] = (counts[row.userId] ?? 0) + 1;
    }
    return new Set(Object.keys(counts).filter((key) => counts[key] > 1));
  }, [rangeData]);

  // Summary statistics for the stat cards.
  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    return {
      count:        filteredData.length,
      totalNominal: filteredData.reduce((sum, row) => sum + parseAmt(row.withdrawal), 0),
      dupCount:     filteredData.filter((row) => dupIds.has(row.userId)).length,
    };
  }, [filteredData, dupIds]);

  // â”€â”€ File processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Parse a single sheet from an already-loaded workbook.
   * Validates that all mapped columns exist before calling transformData().
   */
  const processSheet = useCallback((workbook: XLSX.WorkBook, sheetName: string): ExtractedRow[] => {
    const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" }) as Record<string, unknown>[];
    if (!raw.length) throw new Error(`Sheet "${sheetName}" kosong.`);

    const hasOutputHeaders = OUTPUT_HEADERS.slice(0, 9).every((col) => col in raw[0]);
    if (hasOutputHeaders) return transformOutputData(raw);

    const requiredCols = [
      WD_SOURCE_COLUMNS.paymentMethod,
      WD_SOURCE_COLUMNS.accountNumber,
      WD_SOURCE_COLUMNS.totalAmount,
      WD_SOURCE_COLUMNS.finishedDate,
    ];
    const missingCols = requiredCols.filter((col) => !(col in raw[0]));
    const hasWhitelabelIdCol =
      "Whitelabel Transaction ID" in raw[0] ||
      WD_SOURCE_COLUMNS.accountName in raw[0] ||
      WD_SOURCE_COLUMNS.transactionId in raw[0];
    if (missingCols.length || !hasWhitelabelIdCol) {
      throw new Error(
        `Kolom tidak ditemukan: ${[...missingCols, ...(!hasWhitelabelIdCol ? ["Whitelabel Transaction ID / Account Name / Transaction ID"] : [])].join(", ")}. Pastikan file Withdrawal Report atau file output QRIS HOKI sesuai format.`
      );
    }

    return transformData(raw);
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
      processed.sort((a, b) => new Date(a.keterangan).getTime() - new Date(b.keterangan).getTime());
      setData(processed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal membaca file Excel.");
    } finally {
      setIsParsing(false);
    }
  }, [processSheet]);

  /** Switch to a different sheet within the already-loaded workbook. */
  const changeSheet = useCallback((name: string) => {
    if (!wbRef.current) return;
    setSelectedSheet(name);
    setError(null);
    setData(null);
    try {
      const processed = processSheet(wbRef.current, name);
      processed.sort((a, b) => new Date(a.keterangan).getTime() - new Date(b.keterangan).getTime());
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
      const incomingFile = event.dataTransfer.files?.[0];
      if (!incomingFile) return;
      if (incomingFile.name.endsWith(".xlsx")) {
        processFile(incomingFile);
      } else {
        setError("Hanya file .xlsx yang didukung.");
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const incomingFile = event.target.files?.[0];
    if (incomingFile) processFile(incomingFile);
    // Reset input so the same file can be re-selected after a reset.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processFile]);

  /** Clear all WD state (called when removing a file). */
  const reset = useCallback(() => {
    setFile(null);
    setData(null);
    setError(null);
    setIsCopied(false);
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

  /**
   * Find every row whose userId contains `query` (case-insensitive).
   * Returns 1-indexed row numbers paired with the actual ID for display.
   * Empty / whitespace-only query yields an empty list.
   */
  const findIdMatches = useCallback(
    (query: string): { row: number; id: string }[] => {
      if (!data) return [];
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) return [];
      const matches: { row: number; id: string }[] = [];
      for (let i = 0; i < data.length; i += 1) {
        if (data[i].userId.toLowerCase().includes(trimmed)) {
          matches.push({ row: i + 1, id: data[i].userId });
        }
      }
      return matches;
    },
    [data],
  );

  // Recompute matches as the user types in either box.
  const startMatches = useMemo(() => findIdMatches(startIdQuery), [findIdMatches, startIdQuery]);
  const endMatches   = useMemo(() => findIdMatches(endIdQuery),   [findIdMatches, endIdQuery]);

  // Keep the cycle index in range whenever the matches list changes.
  useEffect(() => {
    if (startMatchIdx >= startMatches.length) setStartMatchIdx(0);
  }, [startMatches.length, startMatchIdx]);
  useEffect(() => {
    if (endMatchIdx >= endMatches.length) setEndMatchIdx(0);
  }, [endMatches.length, endMatchIdx]);

  // The actual selected match (clamped to the available list).
  const startMatch = startMatches.length ? startMatches[Math.min(startMatchIdx, startMatches.length - 1)] : null;
  const endMatch   = endMatches.length   ? endMatches[Math.min(endMatchIdx, endMatches.length - 1)]       : null;

  // â”€â”€ Live boundary application â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // Both ID boxes update startRow/endRow live (no Apply button). When both
  // boxes are empty we restore the full range (1..total) so the user gets
  // back to "everything selected" with a single Backspace.
  //
  // Auto-swap: if the start match lands on a row after the end boundary we
  // swap them so the resulting range stays valid (and surface a toast so the
  // user knows what happened).

  useEffect(() => {
    if (!data || data.length === 0) return;

    const total = data.length;
    const startTrimmed = startIdQuery.trim();
    const endTrimmed   = endIdQuery.trim();

    // Both boxes empty â†’ restore full range.
    if (!startTrimmed && !endTrimmed) {
      if (startRow !== 1) setStartRow(1);
      if (endRow !== total) setEndRow(total);
      return;
    }

    // Resolve the row numbers each box is currently pointing at (or null
    // when the box is empty / has no matches).
    const startTarget = startMatch ? startMatch.row : null;
    const endTarget   = endMatch   ? endMatch.row   : null;

    let nextStart = startRow;
    let nextEnd   = endRow;

    // ID Awal menandai transaksi terakhir yang SUDAH diproses, jadi rentang
    // dimulai 1 transaksi SETELAH baris itu (baris penanda tidak ikut).
    if (startTarget !== null) nextStart = startTarget + 1;
    else if (!startTrimmed) nextStart = 1;
    if (endTarget !== null) nextEnd = endTarget;
    else if (!endTrimmed) nextEnd = total;

    const startIsLast = startTarget !== null && startTarget >= total;
    if (startIsLast) {
      // Tidak ada transaksi setelah ID penanda -> rentang kosong (slice kosong).
      nextStart = total + 1;
      toast("ID penanda adalah transaksi terakhir — tidak ada transaksi setelahnya.");
    } else if (nextStart > nextEnd) {
      // Auto-swap if the resulting range is inverted.
      [nextStart, nextEnd] = [nextEnd, nextStart];
      toast.success("Rentang ditukar otomatis (awal > akhir).");
    }

    if (nextStart !== startRow) setStartRow(nextStart);
    if (nextEnd !== endRow) setEndRow(nextEnd);
    // We intentionally depend only on the *resolved* match rows + queries.
    // Re-running on every startRow/endRow tick would create a feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, startIdQuery, endIdQuery, startMatch?.row, endMatch?.row]);

  const handleStartInput = useCallback((value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    const clamped = clamp(parsed, 1, totalRows);
    setStartRow(clamped);
    if (clamped > endRow) setEndRow(clamped);
  }, [totalRows, endRow]);

  const handleEndInput = useCallback((value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;
    const clamped = clamp(parsed, 1, totalRows);
    setEndRow(clamped);
    if (clamped < startRow) setStartRow(clamped);
  }, [totalRows, startRow]);

  // â”€â”€ Output actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Copy the filtered rows as tab-separated values for pasting into spreadsheets. */
  const copyTSV = useCallback(async () => {
    if (!filteredData.length) return;
    try {
      const tsv = filteredData
        .map((row) =>
          rowToArr(row)
            .slice(0, 9)
            .map((cell) => String(cell ?? "").replace(/[\t\n\r]/g, " ").trim())
            .join("\t")
        )
        .join("\n");
      await navigator.clipboard.writeText(tsv);
      setIsCopied(true);
      toast.success(`${filteredData.length} baris disalin ke Doc TRX! (9 kolom)`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin.");
    }
  }, [filteredData]);

  /** Export the filtered rows as an .xlsx file with auto-sized columns. */
  const exportXlsx = useCallback(() => {
    if (!filteredData.length) return;
    try {
      const rows = filteredData.map(rowToArr);
      const worksheet = XLSX.utils.aoa_to_sheet([OUTPUT_HEADERS, ...rows]);

      // Auto-fit column widths based on header + content length.
      worksheet["!cols"] = OUTPUT_HEADERS.map((header, columnIndex) => ({
        wch: Math.max(header.length, ...rows.map((row) => String(row[columnIndex] ?? "").length)) + 2,
      }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Output");

      const baseName = file?.name.replace(/\.xlsx$/i, "") ?? "output";
      XLSX.writeFile(workbook, `${baseName}_output.xlsx`);
      toast.success(`"${baseName}_output.xlsx" berhasil diunduh!`);
    } catch {
      toast.error("Gagal ekspor Excel.");
    }
  }, [filteredData, file]);

  // â”€â”€ Derived booleans & shared styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const isFullRange = startRow === 1 && endRow === totalRows;

  // Shared Tailwind class for text inputs in the controls panel.
  const inputCls = [
    "bg-white/5 border border-white/10 text-white/90 placeholder:text-white/25",
    "rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:border-violet-400/40 transition-all",
  ].join(" ");

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="relative min-h-screen flex flex-col text-white font-sans">

      {/* â”€â”€ Animated background â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bg-scene" aria-hidden>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="sticky top-0 z-30 bg-[#131424]/85 backdrop-blur-md border-b border-white/5">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-3">

          {/* Left: logo + title */}
          <div 
            onClick={() => setMainSection(null)}
            className="flex items-center gap-4 min-w-0 cursor-pointer group select-none self-start"
          >
            <img
              src="/logo.png"
              alt="API GROUP TOOLS"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-lg shadow-violet-500/20 object-cover group-hover:scale-105 transition-transform duration-200"
            />
            <div className="flex flex-col justify-center">
              <h1 className="text-2xl sm:text-3xl font-quadrillion italic leading-none tracking-tight text-white whitespace-nowrap group-hover:text-violet-300 transition-colors">API GROUP TOOLS</h1>
              <p className="text-sm sm:text-base text-slate-400 mt-1 whitespace-nowrap">Internal Operation Tools</p>
            </div>
          </div>
        </div>
      </header>

      {/* â”€â”€ MAIN CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <main className="relative z-10 flex-1 min-h-0 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-ds-lg sm:py-ds-xl flex flex-col gap-ds-lg">

        {/* ── UNIFIED FORMULA TOOLS TOP NAVIGATION BAR ── */}
        {mainSection === "formula" && (
          <div className="flex flex-col gap-2.5">
            {/* Top Bar: Back Button + Main Category Switcher in a unified glass navbar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-2 sm:p-2.5 rounded-2xl glass border border-white/10 shadow-lg bg-slate-900/60 backdrop-blur-xl">
              {/* Left: Back to Lobby + Section Title */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMainSection(null)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 shadow-sm shrink-0"
                >
                  <ArrowLeft size={14} className="text-violet-400" />
                  <span>Menu Utama</span>
                </button>
                <div className="h-5 w-px bg-white/10 hidden sm:block" />
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-violet-300">
                    Formula Tools
                  </span>
                </div>
              </div>

              {/* Right: Main Category Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveCategory("giga")}
                  className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap
                    ${activeCategory === "giga"
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25 ring-1 ring-white/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                >
                  <ClipboardList size={14} />
                  GIGA PANEL TOOLS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("qris-hoki")}
                  className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap
                    ${activeCategory === "qris-hoki"
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25 ring-1 ring-white/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                >
                  <ArrowDownToLine size={14} />
                  QRIS HOKI TOOLS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("ozzo")}
                  className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap
                    ${activeCategory === "ozzo"
                      ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-500/25 ring-1 ring-white/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                >
                  <Zap size={14} />
                  OZZO TOOLS
                </button>
              </div>
            </div>

            {/* Sub-Tab Bar (For Giga Panel, Ozzo & QRIS Hoki) */}
            {activeCategory === "giga" && (
              <div className="flex items-center justify-between gap-3 p-1.5 px-3 rounded-xl bg-white/5 border border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider mr-1 hidden sm:inline">
                    PILIH PANEL:
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveGigaTab("qrishoki")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                      ${activeGigaTab === "qrishoki"
                        ? "bg-fuchsia-600 text-white shadow-sm shadow-fuchsia-500/30 border border-fuchsia-400/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <ClipboardList size={13} />
                    QRISHOKI
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGigaTab("zenpay")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                      ${activeGigaTab === "zenpay"
                        ? "bg-cyan-600 text-white shadow-sm shadow-cyan-500/30 border border-cyan-400/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <Layers size={13} />
                    ZENPAY
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGigaTab("bonus")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                      ${activeGigaTab === "bonus"
                        ? "bg-amber-500 text-white shadow-sm shadow-amber-500/30 border border-amber-400/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <Banknote size={13} />
                    BONUS
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGigaTab("check-pusat")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                      ${activeGigaTab === "check-pusat"
                        ? "bg-violet-600 text-white shadow-sm shadow-violet-500/30 border border-violet-400/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <Trophy size={13} />
                    CHECK PUSAT
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGigaTab("wd")}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                      ${activeGigaTab === "wd"
                        ? "bg-rose-600 text-white shadow-sm shadow-rose-500/30 border border-rose-400/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <ArrowUpFromLine size={13} />
                    WD GIGA
                  </button>
                </div>
                <span className="text-[11px] font-mono text-white/30 hidden md:inline">
                  GIGA PANEL TOOLS
                </span>
              </div>
            )}

            {activeCategory === "ozzo" && (
              <div className="flex items-center justify-between gap-3 p-1.5 px-3 rounded-xl bg-white/5 border border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider mr-1 hidden sm:inline">
                    PILIH PANEL:
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveOzzoTab("qris-ajaib")}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                      ${activeOzzoTab === "qris-ajaib"
                        ? "bg-amber-600 text-white shadow-sm shadow-amber-500/30 border border-amber-400/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <QrCode size={13} />
                    WD QRIS AJAIB OZZO
                  </button>
                </div>
                <span className="text-[11px] font-mono text-amber-400/50 hidden md:inline">
                  OZZO TOOLS
                </span>
              </div>
            )}

            {activeCategory === "qris-hoki" && (
              <div className="flex items-center justify-between gap-3 p-1.5 px-3 rounded-xl bg-white/5 border border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider mr-1 hidden sm:inline">
                    MODE TRANSAKSI:
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveQrisTab("wd")}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                      ${activeQrisTab === "wd"
                        ? "bg-violet-600 text-white shadow-sm shadow-violet-500/30 border border-violet-400/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <ArrowUpFromLine size={13} />
                    QRIS HOKI WD
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQrisTab("dp")}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200
                      ${activeQrisTab === "dp"
                        ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/30 border border-emerald-400/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                  >
                    <ArrowDownToLine size={13} />
                    QRIS HOKI DP
                  </button>
                </div>
                <span className="text-[11px] font-mono text-white/30 hidden md:inline">
                  QRIS HOKI TOOLS
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── UNIFIED SMART MUTASI TOP BAR ── */}
        {mainSection === "mutasi" && (
          <div className="flex items-center justify-between gap-3 p-2 sm:p-2.5 rounded-2xl glass border border-white/10 shadow-lg bg-slate-900/60 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setMainSection(null)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 shadow-sm shrink-0"
            >
              <ArrowLeft size={14} className="text-violet-400" />
              <span>Menu Utama</span>
            </button>
            <div className="flex items-center gap-2 pr-3">
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-violet-300">
                Smart Mutasi Tools
              </span>
            </div>
          </div>
        )}

        {mainSection === null && (
          <div className="flex-1 flex flex-col justify-center items-center py-12">
            <div className="max-w-4xl w-full text-center mb-12">
              <h2 className="text-4xl sm:text-5xl font-quadrillion tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-red-400 bg-clip-text text-transparent">
                PILIH LAYANAN PORTAL
              </h2>
              <p className="text-slate-400 mt-3 text-sm sm:text-base">
                Silakan pilih salah satu dari tiga tools di bawah ini untuk memulai operasional
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl px-4">
              {/* Card 1: Formula Tools */}
              <button
                type="button"
                onClick={() => {
                  setMainSection("formula");
                  setActiveCategory("giga");
                }}
                className="group relative flex flex-col items-center justify-center p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-violet-500/50 hover:bg-white/10 transition-all duration-300 text-center shadow-lg hover:shadow-violet-500/10 cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 to-fuchsia-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-16 h-16 rounded-2xl bg-violet-600/20 text-violet-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-violet-500/20">
                  <ClipboardList size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-violet-300 transition-colors">
                  Formula Tools
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Giga Panel Tools &amp; QRIS Hoki Tools untuk perhitungan dan salin data DP/WD.
                </p>
              </button>

              {/* Card 2: Smart Mutasi Tools */}
              <button
                type="button"
                onClick={() => {
                  setMainSection("mutasi");
                  setActiveCategory("giga-smart-mutasi");
                }}
                className="group relative flex flex-col items-center justify-center p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-violet-500/50 hover:bg-white/10 transition-all duration-300 text-center shadow-lg hover:shadow-violet-500/10 cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 to-fuchsia-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-16 h-16 rounded-2xl bg-violet-600/20 text-violet-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-violet-500/20">
                  <TableProperties size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-violet-300 transition-colors">
                  Smart Mutasi Tools
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Laporan dan sinkronisasi otomatis mutasi bank internal.
                </p>
              </button>

              {/* Card 3: Phishing Report Tools */}
              <button
                type="button"
                onClick={() => {
                  setMainSection("phishing");
                }}
                className="group relative flex flex-col items-center justify-center p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-amber-500/50 hover:bg-white/10 transition-all duration-300 text-center shadow-lg hover:shadow-amber-500/10 cursor-pointer overflow-hidden"
              >
                <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold tracking-wider uppercase">
                  Under Maintenance
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-amber-600/10 to-orange-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-16 h-16 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-amber-500/20">
                  <Shield size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-amber-300 transition-colors">
                  Phishing Report Tools
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  PhishShield untuk perlindungan brand (Sedang dalam pemeliharaan).
                </p>
              </button>
            </div>
          </div>
        )}

        {/* QRIS HOKI TOOL category content */}
        {mainSection === "formula" && activeCategory === "qris-hoki" && (
          <>

            {/* DP section */}
            {activeQrisTab === "dp" && (
              <Suspense fallback={<TabLoadingFallback />}>
                <DpSection />
              </Suspense>
            )}

            {/* WD section */}
            {activeQrisTab === "wd" && (
              <>
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl glass border-violet-400/20"
              style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(99,102,241,0.06) 100%)" }}
            >
              <div className="w-2 h-2 rounded-full bg-violet-400 shrink-0 shadow-sm shadow-violet-400/60" />
              <span className="text-sm font-semibold text-white/90">QRIS HOKI WD</span>
              <span className="text-xs text-white/35 ml-1 hidden sm:inline">
                SUB: {WD_OUTPUT_SUB} &nbsp;Â·&nbsp; KODE: {WD_OUTPUT_KODE_TRANSAKSI}
              </span>
            </motion.div>

            {/* â”€â”€ UPLOAD ZONE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <section>
              <div
                data-testid="upload-zone"
                className={`relative group w-full rounded-ds-2xl border-2 border-dashed transition-all duration-300
                  flex flex-col items-center justify-center p-12 sm:p-16 text-center overflow-hidden gap-ds-md
                  ${isDragging
                    ? "border-violet-400/70 scale-[1.01]"
                    : file
                    ? "border-white/15 glass"
                    : "border-white/15 glass hover:border-violet-400/40 cursor-pointer"}`}
                style={isDragging ? { background: "rgba(139,92,246,0.12)" } : undefined}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                {/* Drag-active glow overlay */}
                {isDragging && (
                  <div
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{ boxShadow: "inset 0 0 60px rgba(139,92,246,0.2)" }}
                  />
                )}

                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  data-testid="input-file"
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
                      <div className="w-14 h-14 rounded-full border-4 border-violet-400/20 border-t-violet-400 animate-spin" />
                      <p className="text-white/60 font-medium">Memproses dataâ€¦</p>
                    </motion.div>
                  )}

                  {/* State: file loaded */}
                  {!isParsing && file && (
                    <motion.div
                      key="file-info"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-4 w-full"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-400/20 flex items-center justify-center">
                        <FileSpreadsheet size={30} className="text-violet-300" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">{file.name}</h3>
                        <p className="text-xs text-white/40 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>

                      {/* Sheet picker (shown only when workbook has multiple sheets) */}
                      {sheetNames.length > 1 && (
                        <div
                          className="flex items-center gap-2 flex-wrap justify-center"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <TableProperties size={13} className="text-white/40" />
                          <span className="text-xs text-white/40">Sheet:</span>
                          {sheetNames.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => changeSheet(s)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                                ${s === selectedSheet
                                  ? "bg-violet-500/25 border-violet-400/50 text-violet-200"
                                  : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"}`}
                              data-testid={`button-sheet-${s}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); reset(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40
                          hover:text-red-400 hover:bg-red-400/10 border border-white/8 hover:border-red-400/20 transition-all"
                        data-testid="button-remove-file"
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
                            ? "bg-violet-500 border-violet-400 text-white shadow-lg shadow-violet-500/40"
                            : "bg-white/5 border-white/10 text-white/40 group-hover:bg-violet-500/15 group-hover:border-violet-400/30 group-hover:text-violet-300"}`}
                      >
                        <Upload size={26} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white/85">Drop file Excel di sini</h3>
                        <p className="text-sm text-white/35 mt-1.5">
                          Hanya format <span className="text-violet-300/80">.xlsx</span> yang didukung. Klik untuk memilih file.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* â”€â”€ ERROR BANNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                      data-testid="button-try-again"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* â”€â”€ DATA PREVIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <AnimatePresence>
              {data && !error && (
                <motion.section
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
                      <div className="flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
                        <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-ds-md shadow-violet-500/30 shrink-0">
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

                      {/* Total withdrawal */}
                      <div className="flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-ds-xl bg-white/5 border border-white/10 shadow-ds-sm">
                        <div className="w-12 h-12 rounded-ds-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-ds-md shadow-emerald-500/30 shrink-0">
                          <Banknote size={20} className="text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-wide text-white/50 font-medium">Total Nominal</p>
                          <p className="text-2xl font-bold text-white leading-tight font-mono mt-1 truncate" title={fmt(stats.totalNominal)}>
                            {fmt(stats.totalNominal)}
                          </p>
                        </div>
                      </div>

                      {/* Duplicate IDs (amber warning) or Total File count */}
                      <div className={`flex items-center gap-ds-md px-ds-lg py-ds-lg rounded-ds-xl bg-white/5 border shadow-ds-sm transition-colors ${stats.dupCount > 0 ? "border-amber-400/25" : "border-white/10"}`}>
                        <div className={`w-12 h-12 rounded-ds-md flex items-center justify-center shadow-ds-md shrink-0
                          ${stats.dupCount > 0
                            ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30"
                            : "bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-fuchsia-500/30"}`}
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
                  <div className="flex items-center justify-between gap-ds-md">
                    <div className="flex items-center gap-ds-md">
                      <h2 className="text-base font-semibold text-white/85">Pratinjau Data</h2>
                      <span className="px-3 py-1 rounded-full bg-violet-500/15 text-violet-300 text-xs font-semibold border border-violet-400/20">
                        {totalRows} total
                      </span>
                    </div>
                    <div className="flex items-center gap-ds-sm">
                      <button
                        type="button"
                        onClick={exportXlsx}
                        disabled={filteredData.length === 0}
                        className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                        data-testid="button-export-excel"
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
                          ${isCopied
                            ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-500/30"
                            : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-500/30 hover:from-violet-500 hover:to-indigo-500"}`}
                        data-testid="button-copy-tsv"
                      >
                        {isCopied
                          ? <><Check size={15} />Tersalin!</>
                          : <><Copy size={15} />Salin TSV</>
                        }
                      </button>
                    </div>
                  </div>

                  {/* â”€â”€ Controls panel: row range + ID search + table filter â”€ */}
                  <div className="flex flex-col gap-ds-md px-ds-lg py-ds-lg rounded-ds-2xl glass border border-white/10 shadow-ds-md">

                    {/* Row range inputs + mark mode buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                      <ChevronsUpDown size={14} className="text-white/30 shrink-0" />
                      <span className="text-xs font-semibold text-white/50 shrink-0 hidden sm:inline">RENTANG:</span>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/30">Mulai</span>
                        <input
                          type="number"
                          min={1}
                          max={totalRows}
                          value={startRow}
                          onChange={(event) => handleStartInput(event.target.value)}
                          className={`w-16 h-7 px-2 text-sm text-center font-mono ${inputCls}`}
                          data-testid="input-start-row"
                        />
                      </div>

                      <span className="text-white/20 text-xs">â€”</span>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/30">Sampai</span>
                        <input
                          type="number"
                          min={1}
                          max={totalRows}
                          value={endRow}
                          onChange={(event) => handleEndInput(event.target.value)}
                          className={`w-16 h-7 px-2 text-sm text-center font-mono ${inputCls}`}
                          data-testid="input-end-row"
                        />
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        {!isFullRange && (
                          <button
                            onClick={() => {
                              setStartRow(1);
                              setEndRow(totalRows);
                              setStartIdQuery("");
                              setStartMatchIdx(0);
                              setEndIdQuery("");
                              setEndMatchIdx(0);
                            }}
                            className="text-xs text-white/30 hover:text-white/60 underline underline-offset-2 transition-colors"
                            data-testid="button-reset-range"
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

                    {/* â”€â”€ ID range pickers (two independent boxes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

                    <div className="border-t border-white/6" />

                    {/* Table text filter */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Hash size={13} className="text-white/30 shrink-0" />
                      <span className="text-xs font-semibold text-white/40 shrink-0 hidden sm:inline">FILTER:</span>
                      <div className="ml-auto flex items-center gap-2">
                        <div className="relative">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Filter tabelâ€¦"
                            value={tableFilter}
                            onChange={(event) => setTableFilter(event.target.value)}
                            className={`w-32 h-7 pl-7 pr-7 text-xs ${inputCls}`}
                            data-testid="input-table-filter"
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

                  {/* â”€â”€ Preview table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                  <div className="rounded-ds-2xl overflow-hidden glass border border-white/10 shadow-ds-lg">
                    <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
                      <table
                        className="w-full text-sm text-left border-collapse"
                        data-testid="preview-table"
                      >
                        <thead
                          className="text-[10px] uppercase tracking-wider text-white/50 sticky top-0 z-10"
                          style={{ background: "rgba(15,12,40,0.75)", backdropFilter: "blur(20px)" }}
                        >
                          <tr>
                            <th className="px-ds-md py-ds-sm text-center w-10 border-b border-white/10 font-semibold whitespace-nowrap">#</th>
                            {OUTPUT_HEADERS.map((header, columnIndex) => (
                              <th key={columnIndex} className="px-ds-md py-ds-sm font-semibold whitespace-nowrap border-b border-white/10">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody className="font-mono text-xs divide-y divide-white/4">
                          {data.map((row, rowIndex) => {
                            const rowNumber = rowIndex + 1;
                            const inRange   = rowNumber >= startRow && rowNumber <= endRow;
                            const isStart   = rowNumber === startRow;
                            const isEnd     = rowNumber === endRow;
                            const startQ    = startIdQuery.trim().toLowerCase();
                            const endQ      = endIdQuery.trim().toLowerCase();
                            const isIdMatch = (startQ && row.userId.toLowerCase().includes(startQ)) ||
                                              (endQ   && row.userId.toLowerCase().includes(endQ));
                            const isDup     = dupIds.has(row.userId);
                            const needsIdReview = row._userIdNeedsReview || !row.userId;

                            // Apply text filter: skip rows outside range or not matching query
                            if (tableFilter.trim() && inRange) {
                              const query = tableFilter.trim().toLowerCase();
                              const matches =
                                row.nama.toLowerCase().includes(query) ||
                                row.userId.toLowerCase().includes(query) ||
                                row.nomorRekening.toLowerCase().includes(query) ||
                                row.withdrawal.toLowerCase().includes(query);
                              if (!matches) return null;
                            }

                            return (
                              <tr
                                key={rowIndex}
                                className={`transition-colors duration-100
                                  ${inRange ? "hover:bg-white/3" : "opacity-20"}
                                  ${isStart ? "border-t-2 border-t-emerald-400/40" : ""}
                                  ${isEnd ? "border-b-2 border-b-rose-400/40" : ""}
                                  ${needsIdReview && inRange ? "bg-red-500/10 ring-1 ring-inset ring-red-400/30" : ""}
                                  ${isIdMatch && inRange ? "bg-violet-500/5" : ""}
                                  ${isDup && inRange ? "bg-amber-500/4" : ""}`}
                                data-testid={`row-data-${rowIndex}`}
                              >
                                {/* Row number cell (visual marker only; no click action). */}
                                <td className="px-3 py-2.5 text-center align-middle select-none">
                                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-bold transition-all
                                    ${needsIdReview && inRange ? "bg-red-500/25 text-red-300 ring-1 ring-red-400/40"
                                    : isStart  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30"
                                    : isEnd    ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30"
                                    : isDup && inRange ? "bg-amber-500/20 text-amber-300"
                                    : "text-white/15"}`}
                                  >
                                    {needsIdReview && inRange ? "!" : isDup && inRange ? "!" : rowNumber}
                                  </span>
                                </td>

                                {/* Data cells */}
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/80">{row.nama}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-violet-300/80">{row.nomorRekening}</td>
                                <td className={`px-4 py-2.5 whitespace-nowrap ${needsIdReview ? "text-red-300 font-black" : isIdMatch ? "text-violet-200 font-semibold" : isDup && inRange ? "text-amber-300" : "text-white/70"}`}>
                                  {needsIdReview ? "AWAS! Cek ID" : row.userId}
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.sub}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.kodeTransaksi}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.deposit}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-emerald-300/80 font-semibold">{row.withdrawal}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.dpPulsa}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.keterangan}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.kodeBank}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.saldoAkhir}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-cyan-300/70">{row.jamInput}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.inputKodeBank}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
              </>
            )}
          </>
        )}

        {/* GIGA category content */}
        {mainSection === "formula" && activeCategory === "giga" && (
          <>
            {/* GIGA sub-tab content */}
            <Suspense fallback={<TabLoadingFallback />}>
              {activeGigaTab === "qrishoki" && <GigaCopyDpHoki />}
              {activeGigaTab === "zenpay" && <GigaCopyDpZenpay />}
              {activeGigaTab === "bonus" && <GigaCopyBonus />}
              {activeGigaTab === "check-pusat" && <CheckPusatGigaTools />}
              {activeGigaTab === "wd" && <GigaCopyWd />}
            </Suspense>
          </>
        )}

        {/* OZZO category content */}
        {mainSection === "formula" && activeCategory === "ozzo" && (
          <Suspense fallback={<TabLoadingFallback />}>
            {activeOzzoTab === "qris-ajaib" && <WdQrisAjaibOzzo />}
          </Suspense>
        )}

        {mainSection === "mutasi" && (
          <Suspense fallback={<TabLoadingFallback />}>
            <GigaSmartMutasi />
          </Suspense>
        )}

        {mainSection === "phishing" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center p-10 sm:p-14 rounded-3xl bg-slate-900/80 border border-amber-500/20 glass shadow-2xl max-w-2xl mx-auto my-6"
          >
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20">
                <Shield size={38} className="animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[9px] uppercase tracking-wider shadow-sm">
                Maintenance
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white tracking-wide mb-3">
              Phishing Report Tools Sedang Dalam Pemeliharaan
            </h2>

            <p className="text-sm text-slate-400 leading-relaxed mb-8 max-w-lg">
              Modul PhishShield saat ini sedang dinonaktifkan sementara untuk peningkatan sistem dan pemeliharaan berkala (Under Maintenance). Fitur lainnya tetap berjalan normal.
            </p>

            <button
              type="button"
              onClick={() => setMainSection(null)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-500/25 transition-all hover:scale-105"
            >
              <ArrowLeft size={16} />
              Kembali ke Menu Utama
            </button>
          </motion.div>
        )}
      </main>

      {/* â”€â”€ FOOTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <footer className="relative z-10 border-t border-white/5 py-5 text-center">
        <p className="text-[11px] text-white/20">API GROUP TOOLS &nbsp;·&nbsp; Internal Operation Tools</p>
      </footer>
    </div>
  );
}
