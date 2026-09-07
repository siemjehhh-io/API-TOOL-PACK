// External dependencies
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Activity,
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
import { InteractiveHero } from "@/components/InteractiveHero";

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

export type GigaTabKey = "qrishoki" | "zenpay" | "bonus" | "check-pusat" | "wd";

export interface GigaTabMeta {
  id: GigaTabKey;
  label: string;
  iconName: "ClipboardList" | "Layers" | "Banknote" | "Trophy" | "ArrowUpFromLine";
  activeColor: string;
}

const DEFAULT_GIGA_TABS: GigaTabMeta[] = [
  {
    id: "qrishoki",
    label: "QRISHOKI",
    iconName: "ClipboardList",
    activeColor: "clay-btn-green shadow-md border border-[#567C3E]",
  },
  {
    id: "zenpay",
    label: "ZENPAY",
    iconName: "Layers",
    activeColor: "clay-btn-green shadow-md border border-[#567C3E]",
  },
  {
    id: "bonus",
    label: "BONUS",
    iconName: "Banknote",
    activeColor: "clay-btn-green shadow-md border border-[#567C3E]",
  },
  {
    id: "check-pusat",
    label: "CHECK PUSAT",
    iconName: "Trophy",
    activeColor: "clay-btn-green shadow-md border border-[#567C3E]",
  },
  {
    id: "wd",
    label: "WD GIGA",
    iconName: "ArrowUpFromLine",
    activeColor: "clay-btn-green shadow-md border border-[#567C3E]",
  },
];

function renderGigaTabIcon(iconName: GigaTabMeta["iconName"]) {
  switch (iconName) {
    case "ClipboardList":
      return <ClipboardList size={13} />;
    case "Layers":
      return <Layers size={13} />;
    case "Banknote":
      return <Banknote size={13} />;
    case "Trophy":
      return <Trophy size={13} />;
    case "ArrowUpFromLine":
      return <ArrowUpFromLine size={13} />;
  }
}

export default function Home() {
  // ── Category & Tab ────────────────────────────────────────────────────────────

  const [mainSection, setMainSection] = useState<"formula" | "mutasi" | "phishing" | null>("formula");
  const [activeCategory, setActiveCategory] = useState<"qris-hoki" | "giga" | "ozzo" | "giga-smart-mutasi">("giga");
  const [activeQrisTab, setActiveQrisTab] = useState<"wd" | "dp">("wd");
  const [activeGigaTab, setActiveGigaTab] = useState<GigaTabKey>("qrishoki");
  const [activeOzzoTab, setActiveOzzoTab] = useState<"qris-ajaib">("qris-ajaib");

  const handleSelectService = (section: string | null, category?: string) => {
    if (section === null) {
      setMainSection(null);
      return;
    }
    setMainSection(section as "formula" | "mutasi" | "phishing");
    if (category) {
      setActiveCategory(category as "qris-hoki" | "giga" | "ozzo" | "giga-smart-mutasi");
    }
  };

  // Re-orderable GIGA sub-tabs state with localStorage persistence
  const [gigaTabs, setGigaTabs] = useState<GigaTabMeta[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("giga_panel_tab_order");
        if (saved) {
          const orderIds = JSON.parse(saved) as GigaTabKey[];
          const map = new Map(DEFAULT_GIGA_TABS.map((t) => [t.id, t]));
          const ordered = orderIds.map((id) => map.get(id)).filter(Boolean) as GigaTabMeta[];
          DEFAULT_GIGA_TABS.forEach((t) => {
            if (!ordered.some((ot) => ot.id === t.id)) ordered.push(t);
          });
          return ordered;
        }
      } catch {
        // Fallback
      }
    }
    return DEFAULT_GIGA_TABS;
  });

  const handleReorderGigaTabs = (newOrder: GigaTabMeta[]) => {
    setGigaTabs(newOrder);
    if (typeof window !== "undefined") {
      const orderIds = newOrder.map((t) => t.id);
      localStorage.setItem("giga_panel_tab_order", JSON.stringify(orderIds));
    }
  };

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
  // ── Derived booleans & shared styles ───────────────────────────────────────

  const isFullRange = startRow === 1 && endRow === totalRows;

  // Shared Tailwind class for text inputs in the controls panel.
  const inputCls = [
    "neu-inset text-[#23321B] placeholder:text-[#596B4F]/60",
    "rounded-xl focus:outline-none focus:ring-2 focus:ring-[#74A355] transition-all px-3 py-1.5",
  ].join(" ");

  // ── Render ─────────────────────────────────────────────────────────────────

  const isWdSection = mainSection === "formula" && activeCategory === "qris-hoki" && activeQrisTab === "wd";

  return (
    <div className="relative min-h-screen bg-[#EBE7AB]/40 p-3 sm:p-5 lg:p-7 flex items-center justify-center font-sans selection:bg-[#74A355] selection:text-white">
      {/* ── Ambient Background Lighting ── */}
      <div className="bg-scene-light" aria-hidden />

      {/* ── UNIFIED FLIGHT DASHBOARD INNER CONTAINER (Matching Photo Sample) ── */}
      <div className="w-full max-w-[1440px] bg-[#FDFBD4] rounded-[2.5rem] neu-card p-4 sm:p-6 lg:p-7 flex flex-col lg:flex-row gap-6 shadow-2xl border border-white/90 overflow-hidden relative z-10">

        {/* ── 1. LEFT CURVED SIDEBAR PANEL (Dark Forest Green Card #3A592B) ── */}
        <aside className="w-full lg:w-72 shrink-0 bg-[#3A592B] rounded-[2rem] p-6 text-white flex flex-col justify-between shadow-xl relative overflow-hidden">
          
          {/* Top Brand / User Profile Section */}
          <div className="flex flex-col items-center text-center gap-2 pb-6 border-b border-white/15">
            <div className="relative">
              <img
                src="/logo.png"
                alt="API GROUP"
                className="w-16 h-16 rounded-2xl border-2 border-[#D9B038] object-cover shadow-md"
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#82B660] border-2 border-[#3A592B]" />
            </div>
            <h2 className="text-lg font-thertole tracking-wider text-white uppercase mt-1 drop-shadow-sm">
              API GROUP TOOLS
            </h2>
            <p className="text-[11px] text-white/80 font-mono font-bold tracking-wide">apitool.gwk.web.id</p>
          </div>

          {/* Vertical Navigation Menu with Scooped Active Tab Cutout */}
          <nav className="flex flex-col gap-1.5 my-6 pr-0">
            <button
              type="button"
              onClick={() => {
                setMainSection(null);
              }}
              className={mainSection === null
                ? "nav-scoop-active -mr-6 pr-8 pl-5 py-3 text-xs tracking-wider uppercase font-extrabold flex items-center gap-3 transition-all text-[#3A592B]"
                : "text-white/70 hover:text-white px-5 py-3 text-xs tracking-wider uppercase font-bold flex items-center gap-3 transition-colors cursor-pointer"}
            >
              <Zap size={16} />
              <span>DASHBOARD</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainSection("formula");
                setActiveCategory("giga");
              }}
              className={mainSection === "formula" && activeCategory === "giga"
                ? "nav-scoop-active -mr-6 pr-8 pl-5 py-3 text-xs tracking-wider uppercase font-extrabold flex items-center gap-3 transition-all text-[#3A592B]"
                : "text-white/70 hover:text-white px-5 py-3 text-xs tracking-wider uppercase font-bold flex items-center gap-3 transition-colors cursor-pointer"}
            >
              <ClipboardList size={16} />
              <span>GIGA PANEL</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainSection("formula");
                setActiveCategory("qris-hoki");
              }}
              className={mainSection === "formula" && activeCategory === "qris-hoki"
                ? "nav-scoop-active -mr-6 pr-8 pl-5 py-3 text-xs tracking-wider uppercase font-extrabold flex items-center gap-3 transition-all text-[#3A592B]"
                : "text-white/70 hover:text-white px-5 py-3 text-xs tracking-wider uppercase font-bold flex items-center gap-3 transition-colors cursor-pointer"}
            >
              <ArrowDownToLine size={16} />
              <span>QRIS HOKI</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainSection("formula");
                setActiveCategory("ozzo");
              }}
              className={mainSection === "formula" && activeCategory === "ozzo"
                ? "nav-scoop-active -mr-6 pr-8 pl-5 py-3 text-xs tracking-wider uppercase font-extrabold flex items-center gap-3 transition-all text-[#3A592B]"
                : "text-white/70 hover:text-white px-5 py-3 text-xs tracking-wider uppercase font-bold flex items-center gap-3 transition-colors cursor-pointer"}
            >
              <Zap size={16} />
              <span>OZZO TOOLS</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainSection("mutasi");
                setActiveCategory("giga-smart-mutasi");
              }}
              className={mainSection === "mutasi"
                ? "nav-scoop-active -mr-6 pr-8 pl-5 py-3 text-xs tracking-wider uppercase font-extrabold flex items-center gap-3 transition-all text-[#3A592B]"
                : "text-white/70 hover:text-white px-5 py-3 text-xs tracking-wider uppercase font-bold flex items-center gap-3 transition-colors cursor-pointer"}
            >
              <TableProperties size={16} />
              <span>SMART MUTASI</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainSection("phishing");
              }}
              className={mainSection === "phishing"
                ? "nav-scoop-active -mr-6 pr-8 pl-5 py-3 text-xs tracking-wider uppercase font-extrabold flex items-center gap-3 transition-all text-[#3A592B]"
                : "text-white/70 hover:text-white px-5 py-3 text-xs tracking-wider uppercase font-bold flex items-center gap-3 transition-colors cursor-pointer"}
            >
              <Shield size={16} />
              <span>PHISH SHIELD</span>
            </button>
          </nav>

          {/* Bottom Server Information & Status Widget */}
          <div className="pt-4 border-t border-white/15">
            <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#82B660]/20 text-[#82B660] flex items-center justify-center shrink-0 border border-[#82B660]/30">
                  <Activity size={16} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#D9B038] block leading-tight">
                    STATUS SYSTEM
                  </span>
                  <span className="text-[11px] font-mono font-bold text-white/90 truncate block">
                    ONLINE & OPERATIONAL
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-[#82B660]/20 border border-[#82B660]/40 px-2.5 py-1 rounded-full shrink-0">
                <span className="w-2 h-2 rounded-full bg-[#82B660] animate-pulse" />
                <span className="text-[10px] font-mono font-extrabold text-[#82B660] tracking-wider">ONLINE</span>
              </div>
            </div>
          </div>

        </aside>

        {/* ── 2. RIGHT MAIN CONTENT AREA ── */}
        <main className="flex-1 flex flex-col gap-6 min-w-0">

          {/* ── TOP CONSOLE SEARCH PILL CARD (Upper Flight Bar Style) ── */}
          <div className="neu-card rounded-[2rem] p-5 border border-white/90 flex flex-col gap-4 shadow-md">
            
            {/* Top Row: Console Pills (STATUS MONITOR on Dashboard, FILE EXCEL & SHEET AKTIF on QRIS HOKI) */}
            {mainSection === null && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="neu-inset rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 border border-[#E8E2B5]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#D9B038] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Zap size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-[#596B4F] uppercase tracking-wider">STATUS MONITOR</p>
                      <p className="text-xs font-bold text-[#74A355]">ENGINE READY (v2.0)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isWdSection && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                
                {/* Pill 1: File Dropzone Input Pill */}
                <div
                  data-testid="upload-zone"
                  onClick={() => !file && fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`neu-inset rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-all border border-[#E8E2B5]
                    ${isDragging ? "border-[#74A355] bg-[#74A355]/15" : "hover:border-[#74A355]"}`}
                >
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    data-testid="input-file"
                  />
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#3A592B] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <FileSpreadsheet size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-[#596B4F] uppercase tracking-wider">FILE EXCEL</p>
                      <p className="text-xs font-bold text-[#23321B] truncate">
                        {isParsing ? "Memproses…" : file ? file.name : "Pilih File (.xlsx)"}
                      </p>
                    </div>
                  </div>

                  {file && !isParsing && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); reset(); }}
                      className="text-[#CC2936] hover:bg-red-100 p-1 rounded-lg transition-colors"
                      data-testid="button-remove-file"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Pill 2: Sheet Selector / Multi-Sheet Pill */}
                <div className="neu-inset rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 border border-[#E8E2B5]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#567C3E] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <TableProperties size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-[#596B4F] uppercase tracking-wider">SHEET AKTIF</p>
                      <p className="text-xs font-bold text-[#23321B] truncate">
                        {selectedSheet || (sheetNames.length ? sheetNames[0] : "Sheet 1")}
                      </p>
                    </div>
                  </div>

                  {sheetNames.length > 1 && (
                    <select
                      value={selectedSheet}
                      onChange={(e) => changeSheet(e.target.value)}
                      className="text-xs font-bold text-[#3A592B] bg-white/80 border border-[#E8E2B5] rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
                    >
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>

              </div>
            )}

            {/* Bottom Row: Subtab Segmented Switcher & Clay Action Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              
              {/* Segmented Controller Switcher (Only shown when a formula module is active) */}
              {mainSection === "formula" && (
                <div className="flex items-center gap-1.5 bg-[#F6F3C2] p-1.5 rounded-2xl neu-inset overflow-x-auto w-full sm:w-auto">
                  {activeCategory === "giga" && (
                    <Reorder.Group
                      axis="x"
                      values={gigaTabs}
                      onReorder={handleReorderGigaTabs}
                      className="flex items-center gap-1.5"
                    >
                      {gigaTabs.map((tab) => {
                        const isActive = activeGigaTab === tab.id;
                        return (
                          <Reorder.Item
                            key={tab.id}
                            value={tab}
                            axis="x"
                            className="cursor-grab active:cursor-grabbing select-none shrink-0"
                          >
                            <button
                              type="button"
                              onClick={() => setActiveGigaTab(tab.id)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5
                                ${isActive
                                  ? "bg-[#3A592B] text-white shadow-md"
                                  : "text-[#596B4F] hover:text-[#23321B]"}`}
                            >
                              {renderGigaTabIcon(tab.iconName)}
                              <span>{tab.label}</span>
                            </button>
                          </Reorder.Item>
                        );
                      })}
                    </Reorder.Group>
                  )}

                  {activeCategory === "qris-hoki" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveQrisTab("wd")}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer
                          ${activeQrisTab === "wd" ? "bg-[#3A592B] text-white shadow-md" : "text-[#596B4F]"}`}
                      >
                        QRIS HOKI WD
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveQrisTab("dp")}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer
                          ${activeQrisTab === "dp" ? "bg-[#3A592B] text-white shadow-md" : "text-[#596B4F]"}`}
                      >
                        QRIS HOKI DP
                      </button>
                    </>
                  )}

                  {activeCategory === "ozzo" && (
                    <button
                      type="button"
                      onClick={() => setActiveOzzoTab("qris-ajaib")}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#3A592B] text-white shadow-md cursor-pointer"
                    >
                      WD QRIS AJAIB OZZO
                    </button>
                  )}
                </div>
              )}

              {/* Gold/Green Clay Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                {data && !error && isWdSection && (
                  <>
                    <button
                      type="button"
                      onClick={exportXlsx}
                      disabled={filteredData.length === 0}
                      className="neu-flat px-4 py-2 rounded-xl text-xs font-bold text-[#23321B] hover:bg-white transition-all cursor-pointer"
                      data-testid="button-export-excel"
                    >
                      <Download size={14} className="inline mr-1" />
                      Excel
                    </button>

                    <button
                      type="button"
                      onClick={copyTSV}
                      disabled={filteredData.length === 0}
                      className="clay-btn-green px-5 py-2 rounded-xl text-xs font-extrabold shadow-md cursor-pointer"
                      data-testid="button-copy-tsv"
                    >
                      {isCopied ? "TERSALIN!" : "SALIN TSV"}
                    </button>
                  </>
                )}
              </div>

            </div>

          </div>

          {/* ── MIDDLE WORKSPACE & TABLE STUDIO GRID ── */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            
            {/* ── CENTER WORKSPACE TABLE ── */}
            <div className={isWdSection ? "xl:col-span-8 flex flex-col gap-5" : "xl:col-span-12 flex flex-col gap-5"}>
              
              {/* Header Title Row */}
              {isWdSection && (
                <div className="flex items-center justify-between gap-4 px-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#23321B]">
                      PRATINJAU DATA TRANSAKSI
                    </h3>
                    {data && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#74A355]/20 text-[#74A355] text-[10px] font-mono font-bold">
                        {filteredData.length} / {totalRows}
                      </span>
                    )}
                  </div>

                  {data && (
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
                  )}
                </div>
              )}

              {/* Sub-page Render Switcher */}
              {mainSection === "formula" && activeCategory === "giga" && (
                <Suspense fallback={<TabLoadingFallback />}>
                  {activeGigaTab === "qrishoki" && <GigaCopyDpHoki />}
                  {activeGigaTab === "zenpay" && <GigaCopyDpZenpay />}
                  {activeGigaTab === "bonus" && <GigaCopyBonus />}
                  {activeGigaTab === "check-pusat" && <CheckPusatGigaTools />}
                  {activeGigaTab === "wd" && <GigaCopyWd />}
                </Suspense>
              )}

              {mainSection === "formula" && activeCategory === "ozzo" && (
                <Suspense fallback={<TabLoadingFallback />}>
                  {activeOzzoTab === "qris-ajaib" && <WdQrisAjaibOzzo />}
                </Suspense>
              )}

              {mainSection === "formula" && activeCategory === "qris-hoki" && activeQrisTab === "dp" && (
                <Suspense fallback={<TabLoadingFallback />}>
                  <DpSection />
                </Suspense>
              )}

              {/* WD Data Extractor Table Render */}
              {isWdSection && (
                <div className="flex flex-col gap-4">
                  
                  {/* Error Notification */}
                  <AnimatePresence>
                    {error && (
                      <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-red-100 border border-red-300 text-[#CC2936]">
                        <div className="flex items-center gap-2">
                          <AlertCircle size={18} />
                          <span className="text-xs font-bold">{error}</span>
                        </div>
                        <button onClick={() => setError(null)} data-testid="button-try-again">
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </AnimatePresence>

                  {!data || error ? (
                    <div className="neu-card rounded-[2rem] p-12 text-center flex flex-col items-center justify-center min-h-[360px] border border-white/80">
                      <div className="w-16 h-16 rounded-2xl bg-[#3A592B]/10 text-[#3A592B] flex items-center justify-center mb-4">
                        <FileSpreadsheet size={32} />
                      </div>
                      <h4 className="text-sm font-bold text-[#23321B]">Data Canvas Belum Dimuat</h4>
                      <p className="text-xs text-[#596B4F] mt-1 max-w-sm">
                        Silakan upload file Excel laporan Withdrawal pada panel input atas untuk menampilkan hasil ekstraksi.
                      </p>
                    </div>
                  ) : (
                    <div className="neu-card rounded-[2rem] p-5 border border-white/90 shadow-md">
                      <div className="rounded-2xl overflow-hidden neu-inset border border-[#E8E2B5]">
                        <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
                          <table className="w-full text-xs text-left border-collapse" data-testid="preview-table">
                            <thead className="text-[10px] uppercase tracking-wider text-[#23321B] bg-[#EFEBA9] sticky top-0 z-10 border-b border-[#E8E2B5]">
                              <tr>
                                <th className="px-3 py-2.5 text-center w-10 font-bold border-b border-[#E8E2B5]">#</th>
                                {OUTPUT_HEADERS.map((h, idx) => (
                                  <th key={idx} className="px-3 py-2.5 font-bold whitespace-nowrap border-b border-[#E8E2B5]">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="font-mono text-[11px] divide-y divide-[#E8E2B5]">
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
                                    className={`transition-colors duration-100 bg-[#FDFBD4] text-[#23321B]
                                      ${inRange ? "hover:bg-[#F5F0C2]" : "opacity-30"}
                                      ${isStart ? "border-t-2 border-t-[#74A355]" : ""}
                                      ${isEnd ? "border-b-2 border-b-rose-500" : ""}
                                      ${needsIdReview && inRange ? "bg-red-100" : ""}
                                      ${isIdMatch && inRange ? "bg-[#74A355]/15" : ""}
                                      ${isDup && inRange ? "bg-amber-100" : ""}`}
                                    data-testid={`row-data-${rowIndex}`}
                                  >
                                    <td className="px-2 py-2 text-center align-middle select-none">
                                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold
                                        ${needsIdReview && inRange ? "bg-red-500 text-white"
                                        : isStart  ? "bg-[#74A355] text-white"
                                        : isEnd    ? "bg-rose-500 text-white"
                                        : isDup && inRange ? "bg-amber-500 text-white"
                                        : "text-[#596B4F]"}`}
                                      >
                                        {needsIdReview && inRange ? "!" : isDup && inRange ? "!" : rowNumber}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap font-medium text-[#23321B]">{row.nama}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#74A355] font-semibold">{row.nomorRekening}</td>
                                    <td className={`px-3 py-2 whitespace-nowrap ${needsIdReview ? "text-red-600 font-black" : isIdMatch ? "text-[#74A355] font-bold" : isDup && inRange ? "text-amber-700" : "text-[#23321B]"}`}>
                                      {needsIdReview ? "AWAS! Cek ID" : row.userId}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.sub}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.kodeTransaksi}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.deposit}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#74A355] font-bold">{row.withdrawal}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.dpPulsa}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.keterangan}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.kodeBank}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.saldoAkhir}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-teal-700 font-semibold">{row.jamInput}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-[#596B4F]">{row.inputKodeBank}</td>
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
              )}

              {mainSection === "mutasi" && (
                <Suspense fallback={<TabLoadingFallback />}>
                  <GigaSmartMutasi />
                </Suspense>
              )}

              {mainSection === "phishing" && (
                <div className="neu-card rounded-[2rem] p-10 text-center flex flex-col items-center justify-center border border-amber-300">
                  <Shield size={40} className="text-amber-600 mb-3" />
                  <h4 className="text-base font-bold text-[#23321B]">PhishShield Under Maintenance</h4>
                  <p className="text-xs text-[#596B4F] mt-1 max-w-sm">Modul Phishing Report sedang dalam pemeliharaan berkala.</p>
                </div>
              )}

              {mainSection === null && (
                <InteractiveHero onSelectService={handleSelectService} />
              )}

            </div>

            {/* ── 3. RIGHT SIDE CONTROL WIDGET PANEL (Only rendered when in QRIS HOKI WD / WD section) ── */}
            {isWdSection && (
              <div className="xl:col-span-4 shrink-0 bg-[#3A592B] rounded-[2rem] p-6 text-white flex flex-col gap-5 shadow-xl">
                
                {/* Header Title */}
                <div className="flex items-center justify-between border-b border-white/15 pb-3">
                  <div className="flex items-center gap-2">
                    <Flag size={16} className="text-[#D9B038]" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                      RENTANG ID &amp; CONTROLS
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-[#D9B038] font-bold">LIVE FILTER</span>
                </div>

                {/* Graphic Node Diagram Widget (Matching Map Widget in Reference Photo) */}
                <div className="p-4 rounded-2xl bg-white/10 border border-white/10 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[10px] text-white/80 font-mono">
                    <span>FROM: {startIdQuery ? startIdQuery.toUpperCase() : "START"}</span>
                    <span className="text-[#82B660] font-bold">➔</span>
                    <span>TO: {endIdQuery ? endIdQuery.toUpperCase() : "END"}</span>
                  </div>
                  
                  {/* Visual Flight Node Arc Line */}
                  <div className="relative py-2 flex items-center justify-between px-2">
                    <span className="w-3 h-3 rounded-full bg-[#82B660] border-2 border-white" />
                    <div className="flex-1 border-t-2 border-dashed border-[#D9B038] mx-2 relative">
                      <Zap size={14} className="text-[#D9B038] absolute -top-2 left-1/2 -translate-x-1/2" />
                    </div>
                    <span className="w-3 h-3 rounded-full bg-rose-500 border-2 border-white" />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-white/60 font-mono">
                    <span>Rentang: {rangeData.length} baris</span>
                    <span>Total: {totalRows} baris</span>
                  </div>
                </div>

                {/* ID Range Pickers Component (Start ID & End ID) */}
                <div className="flex flex-col gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
                  <IdRangePicker
                    label="ID Awal"
                    accent="emerald"
                    icon={<Flag size={12} />}
                    query={startIdQuery}
                    onQueryChange={(val) => { setStartIdQuery(val); setStartMatchIdx(0); }}
                    matches={startMatches}
                    matchIdx={startMatchIdx}
                    onCycle={(dir) => {
                      if (!startMatches.length) return;
                      setStartMatchIdx((curr) => (curr + dir + startMatches.length) % startMatches.length);
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
                    onQueryChange={(val) => { setEndIdQuery(val); setEndMatchIdx(0); }}
                    matches={endMatches}
                    matchIdx={endMatchIdx}
                    onCycle={(dir) => {
                      if (!endMatches.length) return;
                      setEndMatchIdx((curr) => (curr + dir + endMatches.length) % endMatches.length);
                    }}
                    onClear={() => { setEndIdQuery(""); setEndMatchIdx(0); }}
                    inputCls={inputCls}
                    testidPrefix="end"
                  />
                </div>

                {/* Manual Row Inputs */}
                <div className="p-3.5 rounded-2xl bg-white/10 border border-white/10 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold text-white/90">
                    <span>INPUT BARIS MANUAL</span>
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
                        className="text-[10px] text-[#D9B038] hover:underline cursor-pointer"
                        data-testid="button-reset-range"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={totalRows}
                      value={startRow}
                      onChange={(e) => handleStartInput(e.target.value)}
                      className="w-full h-8 px-2 text-xs text-center font-mono rounded-lg bg-white/20 text-white font-bold placeholder:text-white/50 border border-white/20 focus:outline-none"
                      data-testid="input-start-row"
                    />
                    <span className="text-white/60 font-bold">—</span>
                    <input
                      type="number"
                      min={1}
                      max={totalRows}
                      value={endRow}
                      onChange={(e) => handleEndInput(e.target.value)}
                      className="w-full h-8 px-2 text-xs text-center font-mono rounded-lg bg-white/20 text-white font-bold placeholder:text-white/50 border border-white/20 focus:outline-none"
                      data-testid="input-end-row"
                    />
                  </div>
                </div>

                {/* Summary Stats Overview */}
                {stats && (
                  <div className="p-[#3.5] rounded-2xl bg-white/10 border border-white/10 flex flex-col gap-2 p-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">RINGKASAN ESTIMASI</span>
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-white">
                      <span>TOTAL NOMINAL:</span>
                      <span className="text-[#82B660]">{fmt(stats.totalNominal)}</span>
                    </div>
                    {stats.dupCount > 0 && (
                      <div className="flex items-center justify-between text-xs font-mono font-bold text-amber-300">
                        <span>DUPLIKAT ID:</span>
                        <span>{stats.dupCount} baris</span>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

          </div>

        </main>

      </div>
    </div>
  );
}
