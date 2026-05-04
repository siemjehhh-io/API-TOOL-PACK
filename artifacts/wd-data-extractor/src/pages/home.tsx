import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, X, Check, AlertCircle,
  ChevronDown, ChevronsUpDown, Flag, FlagOff, Search, Hash,
  Layers, Banknote, ListOrdered, Download, Copy, TriangleAlert,
  TableProperties, ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsModal } from "@/components/settings-modal";
import { useWebProfiles } from "@/hooks/useWebProfiles";
import { WebProfile } from "@/types/webProfile";
import { DpSection } from "@/pages/dp-section";
import { DpSettingsModal } from "@/components/dp-settings-modal";
import { useDpProfiles } from "@/hooks/useDpProfiles";

// ─── Output row type ──────────────────────────────────────────────────────────
//
// This is the internal representation of one processed withdrawal row.
// Field names map 1-to-1 with OUTPUT_HEADERS (see below).
// _paymentMethod is a temporary field used for display only — not exported.

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
}

// ─── Output column headers (same order for WD and DP) ────────────────────────

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

// ─── Pure utility functions ───────────────────────────────────────────────────

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
    // Excel serial date → JS Date → time string
    const date = new Date((cellValue - (25567 + 2)) * 86400 * 1000);
    return date.toISOString().substr(11, 8);
  }

  if (typeof cellValue === "string") {
    const match = cellValue.match(/(\d{2}:\d{2}:\d{2})/);
    if (match) return match[1];
  }

  return "";
}

/**
 * Transform raw Excel rows from a withdrawal report into ExtractedRow objects.
 * - Rows without key columns are skipped.
 * - Rows where Status !== "success" are skipped (if Status column exists).
 * - The user ID is truncated at the first "-" (removes branch suffix).
 */
function transformData(raw: Record<string, unknown>[], profile: WebProfile): ExtractedRow[] {
  const {
    sub, kodeTransaksi, keterangan,
    colAccountName, colPaymentMethod, colAccountNumber,
    colTransactionId, colTotalAmount, colFinishedDate,
  } = profile;

  const hasStatusCol = raw.length > 0 && "Status" in raw[0];

  return raw.flatMap((row) => {
    // Skip completely empty rows
    if (!row[colAccountName] && !row[colPaymentMethod] && !row[colAccountNumber] && !row[colTransactionId]) {
      return [];
    }
    // Skip non-successful transactions
    if (hasStatusCol && String(row["Status"] ?? "").trim().toLowerCase() !== "success") {
      return [];
    }

    const paymentMethod = String(row[colPaymentMethod] ?? "").trim();

    // Transaction ID is split on "-" to remove branch/suffix (e.g. "ABC123-01" → "ABC123")
    let userId = String(row[colTransactionId] ?? "").trim();
    if (userId.includes("-")) userId = userId.split("-")[0].trim();

    return [{
      nama:           String(row[colAccountName] ?? "").trim().toUpperCase(),
      nomorRekening:  `${paymentMethod} ${String(row[colAccountNumber] ?? "").trim()}`.trim().toUpperCase(),
      userId,
      sub,
      kodeTransaksi,
      deposit:        "",
      withdrawal:     String(row[colTotalAmount] ?? "").trim(),
      dpPulsa:        "",
      keterangan,
      kodeBank:       "",
      saldoAkhir:     "",
      jamInput:       formatExcelDate(row[colFinishedDate]),
      inputKodeBank:  "",
      _paymentMethod: paymentMethod.toUpperCase(),
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

// ─── Shared small button component ───────────────────────────────────────────

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

// ─── Home page ────────────────────────────────────────────────────────────────
//
// Shell component that owns:
//   - Tab state (WD | DP)
//   - Both profile hooks (WD via useWebProfiles, DP via useDpProfiles)
//   - All WD extractor state + logic
//   - The shared header (logo, tab switcher, profile pickers, settings)
//
// The DP extractor logic lives entirely in <DpSection activeProfile={...} />.

export default function Home() {
  // ── Tab ──────────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<"wd" | "dp">("wd");

  // ── WD profile management ─────────────────────────────────────────────────

  const {
    profiles,
    activeProfile,
    activeProfileId,
    setActiveProfileId,
    addProfile,
    updateProfile,
    deleteProfile,
  } = useWebProfiles();

  const [pickerOpen, setPickerOpen] = useState(false);

  // ── DP profile management ─────────────────────────────────────────────────

  const {
    profiles:         dpProfiles,
    activeProfile:    dpActiveProfile,
    activeProfileId:  dpActiveProfileId,
    setActiveProfileId: setDpActiveProfileId,
    addProfile:       dpAddProfile,
    updateProfile:    dpUpdateProfile,
    deleteProfile:    dpDeleteProfile,
  } = useDpProfiles();

  const [dpPickerOpen, setDpPickerOpen] = useState(false);

  // ── WD extractor state ────────────────────────────────────────────────────

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
  const [markMode, setMarkMode] = useState<"start" | "end" | null>(null);

  // ID search (finds a user ID in the full dataset and sets start/end).
  const [idSearch, setIdSearch] = useState("");
  const [idResult, setIdResult] = useState<{ row: number; id: string } | null>(null);
  const [idErr, setIdErr]       = useState<string | null>(null);

  // Table filter (client-side substring filter on visible columns).
  const [tableFilter, setTableFilter] = useState("");

  const totalRows = data?.length ?? 0;

  // ── Derived data ──────────────────────────────────────────────────────────

  // Reset controls whenever a new file is loaded.
  useEffect(() => {
    if (data) {
      setStartRow(1);
      setEndRow(data.length);
      setMarkMode(null);
      setIdSearch("");
      setIdResult(null);
      setIdErr(null);
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
    const q = tableFilter.trim().toLowerCase();
    if (!q) return rangeData;
    return rangeData.filter(
      (r) =>
        r.nama.toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q) ||
        r.nomorRekening.toLowerCase().includes(q) ||
        r.withdrawal.toLowerCase().includes(q)
    );
  }, [rangeData, tableFilter]);

  // Set of user IDs that appear more than once in the current range.
  const dupIds = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rangeData) {
      if (r.userId) counts[r.userId] = (counts[r.userId] ?? 0) + 1;
    }
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [rangeData]);

  // Summary statistics for the stat cards.
  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    return {
      count:        filteredData.length,
      totalNominal: filteredData.reduce((sum, r) => sum + parseAmt(r.withdrawal), 0),
      dupCount:     filteredData.filter((r) => dupIds.has(r.userId)).length,
    };
  }, [filteredData, dupIds]);

  // ── File processing ───────────────────────────────────────────────────────

  /**
   * Parse a single sheet from an already-loaded workbook.
   * Validates that all mapped columns exist before calling transformData().
   */
  const processSheet = (wb: XLSX.WorkBook, sheetName: string, profile: WebProfile): ExtractedRow[] => {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]) as Record<string, unknown>[];
    if (!raw.length) throw new Error(`Sheet "${sheetName}" kosong.`);

    const requiredCols = [
      profile.colAccountName, profile.colPaymentMethod, profile.colAccountNumber,
      profile.colTransactionId, profile.colTotalAmount, profile.colFinishedDate,
    ];
    const missingCols = requiredCols.filter((col) => !(col in raw[0]));
    if (missingCols.length) {
      throw new Error(
        `Kolom tidak ditemukan: ${missingCols.join(", ")}. Periksa mapping kolom di Pengaturan.`
      );
    }

    return transformData(raw, profile);
  };

  /** Load a new .xlsx file: parse the workbook and process the first sheet. */
  const processFile = async (f: File, profile: WebProfile) => {
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
      setData(processSheet(wb, wb.SheetNames[0], profile));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal membaca file Excel.");
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
      setData(processSheet(wbRef.current, name, activeProfile));
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
        processFile(f, activeProfile);
      } else {
        setError("Hanya file .xlsx yang didukung.");
      }
    },
    [activeProfile]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0], activeProfile);
    // Reset input so the same file can be re-selected after a reset.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Clear all WD state (called when removing a file or switching profiles). */
  const reset = () => {
    setFile(null);
    setData(null);
    setError(null);
    setIsCopied(false);
    setMarkMode(null);
    setIdSearch("");
    setIdResult(null);
    setIdErr(null);
    setTableFilter("");
    setSheetNames([]);
    setSelectedSheet("");
    wbRef.current = null;
  };

  // ── Row range controls ────────────────────────────────────────────────────

  /**
   * Search the full dataset for a user ID and apply the result as start or end row.
   * If the found row would invert the range, the two boundaries are swapped.
   */
  const searchId = (target: "start" | "end") => {
    if (!data || !idSearch.trim()) return;
    const q = idSearch.trim().toLowerCase();
    const idx = data.findIndex((r) => r.userId.toLowerCase().includes(q));

    if (idx === -1) {
      setIdResult(null);
      setIdErr(`ID "${idSearch.trim()}" tidak ditemukan.`);
      return;
    }

    const rowNumber = idx + 1;
    setIdErr(null);
    setIdResult({ row: rowNumber, id: data[idx].userId });

    if (target === "start") {
      if (rowNumber > endRow) {
        setStartRow(endRow);
        setEndRow(rowNumber);
        toast.success(`Baris ${rowNumber} — set akhir (ditukar)`);
      } else {
        setStartRow(rowNumber);
        toast.success(`Baris ${rowNumber} — set awal`);
      }
    } else {
      if (rowNumber < startRow) {
        setEndRow(startRow);
        setStartRow(rowNumber);
        toast.success(`Baris ${rowNumber} — set awal (ditukar)`);
      } else {
        setEndRow(rowNumber);
        toast.success(`Baris ${rowNumber} — set akhir`);
      }
    }
  };

  /** Called when user clicks a row number cell while mark mode is active. */
  const handleRowClick = (rowIndex: number) => {
    const rowNumber = rowIndex + 1;
    if (markMode === "start") {
      setStartRow(rowNumber);
      if (rowNumber > endRow) setEndRow(rowNumber);
      setMarkMode(null);
    } else if (markMode === "end") {
      setEndRow(rowNumber);
      if (rowNumber < startRow) setStartRow(rowNumber);
      setMarkMode(null);
    }
  };

  const handleStartInput = (value: string) => {
    const n = parseInt(value, 10);
    if (isNaN(n)) return;
    const clamped = clamp(n, 1, totalRows);
    setStartRow(clamped);
    if (clamped > endRow) setEndRow(clamped);
  };

  const handleEndInput = (value: string) => {
    const n = parseInt(value, 10);
    if (isNaN(n)) return;
    const clamped = clamp(n, 1, totalRows);
    setEndRow(clamped);
    if (clamped < startRow) setStartRow(clamped);
  };

  // ── Output actions ────────────────────────────────────────────────────────

  /** Copy the filtered rows as tab-separated values for pasting into spreadsheets. */
  const copyTSV = async () => {
    if (!filteredData.length) return;
    try {
      const tsv = filteredData.map((r) => rowToArr(r).join("\t")).join("\n");
      await navigator.clipboard.writeText(tsv);
      setIsCopied(true);
      toast.success(`${filteredData.length} baris disalin!`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin.");
    }
  };

  /** Export the filtered rows as an .xlsx file with auto-sized columns. */
  const exportXlsx = () => {
    if (!filteredData.length) return;
    try {
      const rows = filteredData.map(rowToArr);
      const ws = XLSX.utils.aoa_to_sheet([OUTPUT_HEADERS, ...rows]);

      // Auto-fit column widths based on header + content length.
      ws["!cols"] = OUTPUT_HEADERS.map((header, i) => ({
        wch: Math.max(header.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Output");

      const baseName = file?.name.replace(/\.xlsx$/i, "") ?? "output";
      XLSX.writeFile(wb, `${baseName}_output.xlsx`);
      toast.success(`"${baseName}_output.xlsx" berhasil diunduh!`);
    } catch {
      toast.error("Gagal ekspor Excel.");
    }
  };

  // ── Derived booleans & shared styles ─────────────────────────────────────

  const isFullRange = startRow === 1 && endRow === totalRows;

  // Shared Tailwind class for text inputs in the controls panel.
  const inputCls = [
    "bg-white/5 border border-white/10 text-white/90 placeholder:text-white/25",
    "rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:border-violet-400/40 transition-all",
  ].join(" ");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen flex flex-col text-white font-sans">

      {/* ── Animated background ────────────────────────────────────────── */}
      <div className="bg-scene" aria-hidden>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass-strong border-b border-white/8 shadow-lg">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">

          {/* Left: logo + tab switcher */}
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <FileSpreadsheet size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-none tracking-tight">Data Extractor</h1>
                <p className="text-[10px] text-white/35 mt-0.5">Internal Operations Tooling</p>
              </div>
            </div>

            {/* WD / DP tab switcher */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
              <button
                type="button"
                onClick={() => setActiveTab("wd")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                  ${activeTab === "wd"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/30"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"}`}
              >
                <ArrowUpFromLine size={12} />
                WD
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("dp")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                  ${activeTab === "dp"
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/30"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"}`}
              >
                <ArrowDownToLine size={12} />
                DP
              </button>
            </div>
          </div>

          {/* Right: profile picker + settings (switches based on active tab) */}
          <div className="flex items-center gap-2">

            {/* WD profile picker + WD settings */}
            {activeTab === "wd" && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPickerOpen((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl glass border-white/10 hover:bg-white/8 transition-all text-sm"
                    data-testid="button-profile-picker"
                  >
                    <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0 shadow-sm shadow-violet-400/60" />
                    <span className="max-w-[140px] truncate text-white/85 font-medium">
                      {activeProfile.name}
                    </span>
                    <ChevronDown
                      size={13}
                      className={`text-white/40 transition-transform duration-200 ${pickerOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  <AnimatePresence>
                    {pickerOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl glass-strong shadow-2xl overflow-hidden"
                      >
                        {profiles.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setActiveProfileId(p.id); setPickerOpen(false); reset(); }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-all
                              ${p.id === activeProfileId
                                ? "bg-violet-500/15 text-violet-200"
                                : "text-white/70 hover:bg-white/6 hover:text-white"}`}
                            data-testid={`option-profile-${p.id}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.id === activeProfileId ? "bg-violet-400" : "bg-white/20"}`} />
                            <span className="truncate">{p.name}</span>
                            {p.id === activeProfileId && (
                              <Check size={12} className="ml-auto text-violet-400 shrink-0" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Backdrop to close the picker when clicking outside */}
                  {pickerOpen && (
                    <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
                  )}
                </div>

                <SettingsModal
                  profiles={profiles}
                  activeProfileId={activeProfileId}
                  onSelectProfile={(id) => { setActiveProfileId(id); reset(); }}
                  onAddProfile={addProfile}
                  onUpdateProfile={updateProfile}
                  onDeleteProfile={deleteProfile}
                />
              </>
            )}

            {/* DP profile picker + DP settings */}
            {activeTab === "dp" && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDpPickerOpen((v) => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl glass border-white/10 hover:bg-white/8 transition-all text-sm"
                    data-testid="button-dp-profile-picker"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400/60" />
                    <span className="max-w-[140px] truncate text-white/85 font-medium">
                      {dpActiveProfile.name}
                    </span>
                    <ChevronDown
                      size={13}
                      className={`text-white/40 transition-transform duration-200 ${dpPickerOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  <AnimatePresence>
                    {dpPickerOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl glass-strong shadow-2xl overflow-hidden"
                      >
                        {dpProfiles.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setDpActiveProfileId(p.id); setDpPickerOpen(false); }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-all
                              ${p.id === dpActiveProfileId
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "text-white/70 hover:bg-white/6 hover:text-white"}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.id === dpActiveProfileId ? "bg-emerald-400" : "bg-white/20"}`} />
                            <span className="truncate">{p.name}</span>
                            {p.id === dpActiveProfileId && (
                              <Check size={12} className="ml-auto text-emerald-400 shrink-0" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {dpPickerOpen && (
                    <div className="fixed inset-0 z-40" onClick={() => setDpPickerOpen(false)} />
                  )}
                </div>

                <DpSettingsModal
                  profiles={dpProfiles}
                  activeProfileId={dpActiveProfileId}
                  onSelectProfile={(id) => setDpActiveProfileId(id)}
                  onAddProfile={dpAddProfile}
                  onUpdateProfile={dpUpdateProfile}
                  onDeleteProfile={dpDeleteProfile}
                />
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">

        {/* DP section is rendered entirely by its own component */}
        {activeTab === "dp" && <DpSection activeProfile={dpActiveProfile} />}

        {/* WD section ───────────────────────────────────────────────────── */}
        {activeTab === "wd" && (
          <>
            {/* Profile banner */}
            <motion.div
              key={activeProfile.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl glass border-violet-400/20"
              style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(99,102,241,0.06) 100%)" }}
            >
              <div className="w-2 h-2 rounded-full bg-violet-400 shrink-0 shadow-sm shadow-violet-400/60" />
              <span className="text-sm font-semibold text-white/90">{activeProfile.name}</span>
              <span className="text-xs text-white/35 ml-1 hidden sm:inline">
                SUB: {activeProfile.sub} &nbsp;·&nbsp; KODE: {activeProfile.kodeTransaksi} &nbsp;·&nbsp; {activeProfile.keterangan}
              </span>
            </motion.div>

            {/* ── UPLOAD ZONE ────────────────────────────────────────────── */}
            <section>
              <div
                data-testid="upload-zone"
                className={`relative group w-full rounded-2xl border-2 border-dashed transition-all duration-300
                  flex flex-col items-center justify-center p-12 text-center overflow-hidden
                  ${isDragging
                    ? "border-violet-400/70 scale-[1.01]"
                    : file
                    ? "border-white/12 glass"
                    : "border-white/12 glass hover:border-violet-400/40 cursor-pointer"}`}
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
                      <p className="text-white/60 font-medium">Memproses data…</p>
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
                          onClick={(e) => e.stopPropagation()}
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
                        onClick={(e) => { e.stopPropagation(); reset(); }}
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

            {/* ── ERROR BANNER ────────────────────────────────────────────── */}
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

            {/* ── DATA PREVIEW ────────────────────────────────────────────── */}
            <AnimatePresence>
              {data && !error && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="flex flex-col gap-4"
                >
                  {/* Stat cards */}
                  {stats && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                    >
                      {/* Row count */}
                      <div className="flex items-center gap-4 p-4 rounded-2xl glass border-white/8 shadow-lg">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
                          <ListOrdered size={18} className="text-white" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">Baris Dipilih</p>
                          <p className="text-2xl font-bold text-white leading-tight font-mono mt-0.5">
                            {stats.count}
                            <span className="text-sm text-white/30 font-normal ml-1">/ {totalRows}</span>
                          </p>
                        </div>
                      </div>

                      {/* Total withdrawal */}
                      <div className="flex items-center gap-4 p-4 rounded-2xl glass border-white/8 shadow-lg">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                          <Banknote size={18} className="text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">Total Nominal</p>
                          <p className="text-lg font-bold text-white leading-tight font-mono mt-0.5 truncate" title={fmt(stats.totalNominal)}>
                            {fmt(stats.totalNominal)}
                          </p>
                        </div>
                      </div>

                      {/* Duplicate IDs (amber warning) or Total File count */}
                      <div className={`flex items-center gap-4 p-4 rounded-2xl glass shadow-lg transition-colors ${stats.dupCount > 0 ? "border-amber-400/25" : "border-white/8"}`}>
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg shrink-0
                          ${stats.dupCount > 0
                            ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30"
                            : "bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-fuchsia-500/30"}`}
                        >
                          {stats.dupCount > 0
                            ? <TriangleAlert size={18} className="text-white" />
                            : <Layers size={18} className="text-white" />
                          }
                        </div>
                        <div>
                          {stats.dupCount > 0 ? (
                            <>
                              <p className="text-[10px] uppercase tracking-widest text-amber-400/60 font-semibold">ID Duplikat</p>
                              <p className="text-2xl font-bold text-amber-300 leading-tight font-mono mt-0.5">
                                {stats.dupCount} <span className="text-sm font-normal">baris</span>
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">Total File</p>
                              <p className="text-2xl font-bold text-white leading-tight font-mono mt-0.5">{totalRows}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Top bar: title + export buttons */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-semibold text-white/85">Pratinjau Data</h2>
                      <span className="px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 text-xs font-semibold border border-violet-400/20">
                        {totalRows} total
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={exportXlsx}
                        disabled={filteredData.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass border-white/10 hover:bg-white/8
                          text-sm text-white/60 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        data-testid="button-export-excel"
                      >
                        <Download size={14} />
                        <span className="hidden sm:inline text-xs">Export</span>
                      </button>
                      <button
                        type="button"
                        onClick={copyTSV}
                        disabled={filteredData.length === 0}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-lg
                          disabled:opacity-30 disabled:cursor-not-allowed
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

                  {/* ── Controls panel: row range + ID search + table filter ─ */}
                  <div className="flex flex-col gap-3 p-4 rounded-2xl glass border-white/8 shadow-lg">

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
                          data-testid="input-start-row"
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
                          data-testid="input-end-row"
                        />
                      </div>

                      <div className="flex gap-1.5">
                        <GlassBtn
                          active={markMode === "start"}
                          activeClass="bg-emerald-500/15 border-emerald-400/40 text-emerald-300"
                          onClick={() => setMarkMode((m) => m === "start" ? null : "start")}
                          data-testid="button-mark-start"
                        >
                          <Flag size={11} />Tandai Awal
                        </GlassBtn>
                        <GlassBtn
                          active={markMode === "end"}
                          activeClass="bg-rose-500/15 border-rose-400/40 text-rose-300"
                          onClick={() => setMarkMode((m) => m === "end" ? null : "end")}
                          data-testid="button-mark-end"
                        >
                          <FlagOff size={11} />Tandai Akhir
                        </GlassBtn>
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        {!isFullRange && (
                          <button
                            onClick={() => { setStartRow(1); setEndRow(totalRows); setMarkMode(null); }}
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

                    {/* ID search + table filter */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Hash size={13} className="text-white/30 shrink-0" />
                      <span className="text-xs font-semibold text-white/40 shrink-0 hidden sm:inline">ID:</span>

                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Cari User ID…"
                          value={idSearch}
                          onChange={(e) => { setIdSearch(e.target.value); setIdResult(null); setIdErr(null); }}
                          onKeyDown={(e) => e.key === "Enter" && searchId("start")}
                          className={`w-36 h-7 pl-7 pr-3 text-xs font-mono ${inputCls}`}
                          data-testid="input-id-search"
                        />
                      </div>

                      <GlassBtn
                        disabled={!idSearch.trim()}
                        active={false}
                        onClick={() => searchId("start")}
                        data-testid="button-id-set-start"
                      >
                        <Flag size={11} />Set Awal
                      </GlassBtn>
                      <GlassBtn
                        disabled={!idSearch.trim()}
                        active={false}
                        onClick={() => searchId("end")}
                        data-testid="button-id-set-end"
                      >
                        <FlagOff size={11} />Set Akhir
                      </GlassBtn>

                      {idResult && (
                        <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                          <Check size={10} />Baris {idResult.row}: <span className="font-mono">{idResult.id}</span>
                        </span>
                      )}
                      {idErr && (
                        <span className="text-[11px] text-red-400 flex items-center gap-1">
                          <AlertCircle size={10} />{idErr}
                        </span>
                      )}

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

                  {/* ── Preview table ───────────────────────────────────────── */}
                  <div className="rounded-2xl overflow-hidden glass border-white/8 shadow-2xl">
                    <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
                      <table
                        className="w-full text-sm text-left border-collapse"
                        data-testid="preview-table"
                      >
                        <thead
                          className="text-[10px] uppercase tracking-wider text-white/30 sticky top-0 z-10"
                          style={{ background: "rgba(15,12,40,0.75)", backdropFilter: "blur(20px)" }}
                        >
                          <tr>
                            <th className="px-3 py-3.5 text-center w-10 border-b border-white/6">#</th>
                            {OUTPUT_HEADERS.map((header, i) => (
                              <th key={i} className="px-4 py-3.5 font-semibold whitespace-nowrap border-b border-white/6">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody className="font-mono text-xs divide-y divide-white/4">
                          {data.map((row, i) => {
                            const rowNumber = i + 1;
                            const inRange   = rowNumber >= startRow && rowNumber <= endRow;
                            const isStart   = rowNumber === startRow;
                            const isEnd     = rowNumber === endRow;
                            const isIdMatch = idSearch.trim() && row.userId.toLowerCase().includes(idSearch.trim().toLowerCase());
                            const isDup     = dupIds.has(row.userId);

                            // Apply text filter: skip rows outside range or not matching query
                            if (tableFilter.trim() && inRange) {
                              const q = tableFilter.trim().toLowerCase();
                              const matches =
                                row.nama.toLowerCase().includes(q) ||
                                row.userId.toLowerCase().includes(q) ||
                                row.nomorRekening.toLowerCase().includes(q) ||
                                row.withdrawal.toLowerCase().includes(q);
                              if (!matches) return null;
                            }

                            return (
                              <tr
                                key={i}
                                className={`transition-colors duration-100
                                  ${inRange ? "hover:bg-white/3" : "opacity-20"}
                                  ${isStart ? "border-t-2 border-t-emerald-400/40" : ""}
                                  ${isEnd ? "border-b-2 border-b-rose-400/40" : ""}
                                  ${isIdMatch && inRange ? "bg-violet-500/5" : ""}
                                  ${isDup && inRange ? "bg-amber-500/4" : ""}`}
                                data-testid={`row-data-${i}`}
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
                                    : markMode ? "text-white/20 hover:bg-violet-500/20 hover:text-violet-300"
                                    : "text-white/15"}`}
                                  >
                                    {isDup && inRange ? "!" : rowNumber}
                                  </span>
                                </td>

                                {/* Data cells */}
                                <td className="px-4 py-2.5 whitespace-nowrap text-white/80">{row.nama}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-violet-300/80">{row.nomorRekening}</td>
                                <td className={`px-4 py-2.5 whitespace-nowrap ${isIdMatch ? "text-violet-200 font-semibold" : isDup && inRange ? "text-amber-300" : "text-white/70"}`}>
                                  {row.userId}
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
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 py-5 text-center">
        <p className="text-[11px] text-white/20">Data Extractor &nbsp;·&nbsp; Internal Operations Tooling</p>
      </footer>
    </div>
  );
}
