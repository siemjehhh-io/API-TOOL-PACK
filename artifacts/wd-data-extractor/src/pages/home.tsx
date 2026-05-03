import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, X, Clipboard, Check, AlertCircle,
  ChevronDown, ChevronsUpDown, Flag, FlagOff, Search, Hash,
  Layers, Banknote, ListOrdered, Download, Copy, TriangleAlert,
  TableProperties,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsModal } from "@/components/settings-modal";
import { useWebProfiles } from "@/hooks/useWebProfiles";
import { WebProfile } from "@/types/webProfile";

interface ExtractedRow {
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
  _paymentMethod: string; // internal
}

const OUTPUT_HEADERS = [
  "NAMA", "NOMOR REKENING", "USER ID / LOGIN", "SUB", "KODE TRANSAKSI",
  "DEPOSIT", "WITHDRAWAL", "DP PULSA", "KETERANGAN / KODE SN",
  "KODE BANK", "SALDO AKHIR", "JAM INPUT WD", "INPUT KODE BANK",
];

function rowToArr(row: ExtractedRow): string[] {
  return [
    row.nama, row.nomorRekening, row.userId, row.sub, row.kodeTransaksi,
    row.deposit, row.withdrawal, row.dpPulsa, row.keterangan,
    row.kodeBank, row.saldoAkhir, row.jamInput, row.inputKodeBank,
  ];
}

const formatExcelDate = (dateVal: unknown): string => {
  if (!dateVal) return "";
  if (typeof dateVal === "number") {
    const date = new Date((dateVal - (25567 + 2)) * 86400 * 1000);
    return date.toISOString().substr(11, 8);
  }
  if (typeof dateVal === "string") {
    const m = dateVal.match(/(\d{2}:\d{2}:\d{2})/);
    if (m) return m[1];
  }
  return "";
};

function transformData(rawData: Record<string, unknown>[], profile: WebProfile): ExtractedRow[] {
  const { sub, kodeTransaksi, keterangan, colAccountName, colPaymentMethod,
    colAccountNumber, colTransactionId, colTotalAmount, colFinishedDate } = profile;
  const result: ExtractedRow[] = [];
  for (const row of rawData) {
    if (!row[colAccountName] && !row[colPaymentMethod] && !row[colAccountNumber] && !row[colTransactionId]) continue;
    const accountName = String(row[colAccountName] ?? "").trim().toUpperCase();
    const paymentMethod = String(row[colPaymentMethod] ?? "").trim();
    const accountNumber = String(row[colAccountNumber] ?? "").trim();
    const nomorRekening = `${paymentMethod} ${accountNumber}`.trim().toUpperCase();
    let userId = String(row[colTransactionId] ?? "").trim();
    if (userId.includes("-")) userId = userId.split("-")[0].trim();
    result.push({
      nama: accountName, nomorRekening, userId, sub, kodeTransaksi, deposit: "",
      withdrawal: String(row[colTotalAmount] ?? "").trim(), dpPulsa: "",
      keterangan, kodeBank: "", saldoAkhir: "",
      jamInput: formatExcelDate(row[colFinishedDate]), inputKodeBank: "",
      _paymentMethod: paymentMethod.toUpperCase(),
    });
  }
  return result;
}

function clamp(val: number, min: number, max: number) { return Math.min(Math.max(val, min), max); }
function formatNumber(n: number) { return n.toLocaleString("id-ID"); }
function parseAmount(val: string) {
  const n = parseFloat(val.replace(/[^0-9.,-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export default function Home() {
  const { profiles, activeProfile, activeProfileId, setActiveProfileId,
    addProfile, updateProfile, deleteProfile } = useWebProfiles();

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ExtractedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sheet selection
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const rawWorkbookRef = useRef<XLSX.WorkBook | null>(null);

  // Row range
  const [startRow, setStartRow] = useState(1);
  const [endRow, setEndRow] = useState(1);
  const [markMode, setMarkMode] = useState<"start" | "end" | null>(null);

  // ID Transaksi search
  const [idSearch, setIdSearch] = useState("");
  const [idSearchResult, setIdSearchResult] = useState<{ row: number; id: string } | null>(null);
  const [idSearchError, setIdSearchError] = useState<string | null>(null);

  // Table quick filter
  const [tableFilter, setTableFilter] = useState("");

  const totalRows = data?.length ?? 0;

  useEffect(() => {
    if (data) {
      setStartRow(1); setEndRow(data.length);
      setMarkMode(null); setIdSearch(""); setIdSearchResult(null);
      setIdSearchError(null); setTableFilter("");
    }
  }, [data]);

  // Range-sliced data
  const rangeData = useMemo(() => data ? data.slice(startRow - 1, endRow) : [], [data, startRow, endRow]);

  // After table filter
  const filteredData = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return rangeData;
    return rangeData.filter((r) =>
      r.nama.toLowerCase().includes(q) ||
      r.userId.toLowerCase().includes(q) ||
      r.nomorRekening.toLowerCase().includes(q) ||
      r.withdrawal.toLowerCase().includes(q)
    );
  }, [rangeData, tableFilter]);

  // Duplicate userId detection within rangeData
  const duplicateUserIds = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rangeData) if (r.userId) counts[r.userId] = (counts[r.userId] ?? 0) + 1;
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [rangeData]);

  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    const totalNominal = filteredData.reduce((acc, r) => acc + parseAmount(r.withdrawal), 0);
    const dupCount = filteredData.filter((r) => duplicateUserIds.has(r.userId)).length;
    return { count: filteredData.length, totalNominal, dupCount };
  }, [filteredData, duplicateUserIds]);

  // ── Process a sheet by name ──
  const processSheet = (wb: XLSX.WorkBook, sheetName: string, profile: WebProfile) => {
    const sheet = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
    if (rawData.length === 0) throw new Error(`Sheet "${sheetName}" kosong.`);
    const expectedCols = [profile.colAccountName, profile.colPaymentMethod, profile.colAccountNumber,
      profile.colTransactionId, profile.colTotalAmount, profile.colFinishedDate];
    const missing = expectedCols.filter((col) => !(col in rawData[0]));
    if (missing.length > 0) throw new Error(`Kolom tidak ditemukan: ${missing.join(", ")}. Periksa mapping kolom di Pengaturan.`);
    return transformData(rawData, profile);
  };

  const processFile = async (selectedFile: File, profile: WebProfile) => {
    setFile(selectedFile); setError(null); setData(null);
    setSheetNames([]); setSelectedSheet(""); rawWorkbookRef.current = null;
    setIsParsing(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      rawWorkbookRef.current = wb;
      if (!wb.SheetNames.length) throw new Error("File Excel tidak memiliki sheet.");
      setSheetNames(wb.SheetNames);
      const firstSheet = wb.SheetNames[0];
      setSelectedSheet(firstSheet);
      setData(processSheet(wb, firstSheet, profile));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal membaca file Excel.");
    } finally { setIsParsing(false); }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!rawWorkbookRef.current) return;
    setSelectedSheet(sheetName);
    setError(null); setData(null);
    try { setData(processSheet(rawWorkbookRef.current, sheetName, activeProfile)); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : "Gagal membaca sheet."); }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      const f = e.dataTransfer.files[0];
      if (f.name.endsWith(".xlsx")) processFile(f, activeProfile);
      else setError("Hanya file .xlsx yang didukung.");
    }
  }, [activeProfile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0], activeProfile);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetState = () => {
    setFile(null); setData(null); setError(null); setIsCopied(false);
    setMarkMode(null); setIdSearch(""); setIdSearchResult(null); setIdSearchError(null);
    setTableFilter(""); setSheetNames([]); setSelectedSheet(""); rawWorkbookRef.current = null;
  };

  const searchIdAndApply = (target: "start" | "end") => {
    if (!data || !idSearch.trim()) return;
    const q = idSearch.trim().toLowerCase();
    const idx = data.findIndex((r) => r.userId.toLowerCase().includes(q));
    if (idx === -1) { setIdSearchResult(null); setIdSearchError(`ID "${idSearch.trim()}" tidak ditemukan.`); return; }
    const rowNum = idx + 1;
    setIdSearchError(null);
    setIdSearchResult({ row: rowNum, id: data[idx].userId });
    if (target === "start") { setStartRow(rowNum); if (rowNum > endRow) setEndRow(rowNum); }
    else { setEndRow(rowNum); if (rowNum < startRow) setStartRow(rowNum); }
    toast.success(`ID ditemukan di baris ${rowNum} — set sebagai baris ${target === "start" ? "awal" : "akhir"}`);
  };

  const handleRowClick = (i: number) => {
    const n = i + 1;
    if (markMode === "start") { setStartRow(n); if (n > endRow) setEndRow(n); setMarkMode(null); }
    else if (markMode === "end") { setEndRow(n); if (n < startRow) setStartRow(n); setMarkMode(null); }
  };

  const handleStartInput = (val: string) => { const c = clamp(parseInt(val, 10) || 1, 1, totalRows); setStartRow(c); if (c > endRow) setEndRow(c); };
  const handleEndInput = (val: string) => { const c = clamp(parseInt(val, 10) || 1, 1, totalRows); setEndRow(c); if (c < startRow) setStartRow(c); };

  const copyToClipboard = async () => {
    if (!filteredData.length) return;
    try {
      const tsv = filteredData.map((r) => rowToArr(r).join("\t")).join("\n");
      await navigator.clipboard.writeText(tsv);
      setIsCopied(true);
      toast.success(`Berhasil menyalin ${filteredData.length} baris ke clipboard!`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch { toast.error("Gagal menyalin ke clipboard."); }
  };

  // Export to Excel (.xlsx)
  const exportToExcel = () => {
    if (!filteredData.length) return;
    try {
      const rows = filteredData.map(rowToArr);
      const ws = XLSX.utils.aoa_to_sheet([OUTPUT_HEADERS, ...rows]);
      // Auto column widths
      ws["!cols"] = OUTPUT_HEADERS.map((_, i) => ({
        wch: Math.max(OUTPUT_HEADERS[i].length, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Output");
      const baseName = file?.name.replace(/\.xlsx$/i, "") ?? "output";
      XLSX.writeFile(wb, `${baseName}_output.xlsx`);
      toast.success(`File "${baseName}_output.xlsx" berhasil diunduh!`);
    } catch { toast.error("Gagal mengekspor ke Excel."); }
  };

  const isFullRange = startRow === 1 && endRow === totalRows;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary shrink-0">
              <FileSpreadsheet size={18} />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">WD Data Extractor</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button type="button" onClick={() => setProfilePickerOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 transition-colors text-sm"
                data-testid="button-profile-picker">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="max-w-[140px] truncate text-foreground/90 font-medium">{activeProfile.name}</span>
                <ChevronDown size={13} className={`text-muted-foreground transition-transform duration-200 ${profilePickerOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {profilePickerOpen && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                    {profiles.map((p) => (
                      <button key={p.id} type="button"
                        onClick={() => { setActiveProfileId(p.id); setProfilePickerOpen(false); resetState(); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${p.id === activeProfileId ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"}`}
                        data-testid={`option-profile-${p.id}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.id === activeProfileId ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        <span className="truncate">{p.name}</span>
                        {p.id === activeProfileId && <Check size={12} className="ml-auto shrink-0" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              {profilePickerOpen && <div className="fixed inset-0 z-40" onClick={() => setProfilePickerOpen(false)} />}
            </div>
            <SettingsModal profiles={profiles} activeProfileId={activeProfileId}
              onSelectProfile={(id) => { setActiveProfileId(id); resetState(); }}
              onAddProfile={addProfile} onUpdateProfile={updateProfile} onDeleteProfile={deleteProfile} />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-12 flex flex-col gap-8">
        {/* Profile banner */}
        <motion.div key={activeProfile.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5">
          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground/90">{activeProfile.name}</span>
            <span className="text-xs text-muted-foreground ml-2">
              SUB: {activeProfile.sub} &nbsp;·&nbsp; KODE: {activeProfile.kodeTransaksi} &nbsp;·&nbsp; {activeProfile.keterangan}
            </span>
          </div>
        </motion.div>

        {/* ── UPLOAD ZONE ── */}
        <section>
          <div data-testid="upload-zone"
            className={`relative group w-full rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out flex flex-col items-center justify-center p-12 text-center
              ${isDragging ? "border-primary bg-primary/10 scale-[1.02]"
              : file ? "border-border bg-card"
              : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50 cursor-pointer"}`}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}>
            <input type="file" accept=".xlsx" className="hidden" ref={fileInputRef} onChange={handleFileSelect} data-testid="input-file" />
            <AnimatePresence mode="wait">
              {isParsing ? (
                <motion.div key="parsing" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
                  <p className="text-muted-foreground font-medium">Memproses baris data...</p>
                </motion.div>
              ) : file ? (
                <motion.div key="file-info" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex flex-col items-center gap-4 w-full">
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mb-2"><FileSpreadsheet size={32} /></div>
                  <div>
                    <h3 className="text-lg font-medium text-foreground">{file.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  {/* Sheet picker (shown only if multiple sheets) */}
                  {sheetNames.length > 1 && (
                    <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                      <TableProperties size={14} className="text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Sheet:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {sheetNames.map((s) => (
                          <button key={s} type="button"
                            onClick={() => handleSheetChange(s)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                              s === selectedSheet
                                ? "bg-primary/20 border-primary/50 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            }`}
                            data-testid={`button-sheet-${s}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); resetState(); }}
                    className="mt-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10" data-testid="button-remove-file">
                    <X size={16} className="mr-2" />Hapus file
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="upload-prompt" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex flex-col items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-300
                    ${isDragging ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground group-hover:text-primary group-hover:border-primary/30"}`}>
                    <Upload size={28} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-foreground">Drop file Excel di sini</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">Hanya format .xlsx yang didukung. Klik untuk memilih file.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ── ERROR STATE ── */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0, y: -10 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -10 }}>
              <Card className="border-destructive/50 bg-destructive/10 overflow-hidden">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="text-destructive mt-1"><AlertCircle size={24} /></div>
                  <div className="flex-1">
                    <h4 className="text-base font-medium text-destructive mb-1">Proses Gagal</h4>
                    <p className="text-sm text-destructive/80 mb-4">{error}</p>
                    <Button variant="outline" size="sm" className="border-destructive/30 hover:bg-destructive/20 hover:text-destructive text-destructive" onClick={() => setError(null)} data-testid="button-try-again">Tutup</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── PREVIEW & ACTIONS ── */}
        <AnimatePresence>
          {data && !error && (
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="flex flex-col gap-4">

              {/* ── STATS ── */}
              {stats && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-border/60 bg-card/80">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0"><ListOrdered size={16} /></div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Baris Dipilih</p>
                      <p className="text-xl font-bold text-foreground leading-tight font-mono">
                        {stats.count}<span className="text-xs text-muted-foreground font-normal ml-1">/ {totalRows}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl border border-border/60 bg-card/80">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0"><Banknote size={16} /></div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Nominal</p>
                      <p className="text-base font-bold text-foreground leading-tight font-mono truncate" title={formatNumber(stats.totalNominal)}>{formatNumber(stats.totalNominal)}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 p-4 rounded-xl border bg-card/80 transition-colors ${stats.dupCount > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border/60"}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${stats.dupCount > 0 ? "bg-amber-500/20 text-amber-400" : "bg-violet-500/15 text-violet-400"}`}>
                      {stats.dupCount > 0 ? <TriangleAlert size={16} /> : <Layers size={16} />}
                    </div>
                    <div className="min-w-0">
                      {stats.dupCount > 0 ? (
                        <>
                          <p className="text-[10px] uppercase tracking-wider text-amber-400/80 font-medium">ID Duplikat</p>
                          <p className="text-xl font-bold text-amber-400 leading-tight font-mono">{stats.dupCount} <span className="text-xs font-normal">baris</span></p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total File</p>
                          <p className="text-xl font-bold text-foreground leading-tight font-mono">{totalRows}</p>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── TOP BAR: title + actions ── */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-medium">Pratinjau Data</h2>
                  <span className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium border border-primary/20">{totalRows} total</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportToExcel} disabled={filteredData.length === 0}
                    className="gap-2 border-border text-muted-foreground hover:text-foreground" data-testid="button-export-excel">
                    <Download size={14} />
                    <span className="hidden sm:inline">Export Excel</span>
                  </Button>
                  <Button onClick={copyToClipboard} disabled={filteredData.length === 0}
                    className={`gap-2 transition-all duration-300 ${isCopied ? "bg-green-600 hover:bg-green-700 text-white" : ""}`} data-testid="button-copy-tsv">
                    {isCopied ? <><Check size={16} />Tersalin!</> : <><Copy size={16} />Salin TSV</>}
                  </Button>
                </div>
              </div>

              {/* ── ROW RANGE + ID SEARCH ── */}
              <div className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/60">
                {/* Row numbers */}
                <div className="flex flex-wrap items-center gap-3">
                  <ChevronsUpDown size={15} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground/80 shrink-0">Rentang Baris:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Mulai</span>
                    <input type="number" min={1} max={totalRows} value={startRow} onChange={(e) => handleStartInput(e.target.value)}
                      className="w-16 h-7 px-2 rounded-md border border-border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                      data-testid="input-start-row" />
                  </div>
                  <span className="text-muted-foreground/50 text-xs">—</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sampai</span>
                    <input type="number" min={1} max={totalRows} value={endRow} onChange={(e) => handleEndInput(e.target.value)}
                      className="w-16 h-7 px-2 rounded-md border border-border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                      data-testid="input-end-row" />
                  </div>
                  <div className="flex items-center gap-1.5 ml-1">
                    <button type="button" onClick={() => setMarkMode((m) => m === "start" ? null : "start")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${markMode === "start" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                      data-testid="button-mark-start"><Flag size={11} />Tandai Awal</button>
                    <button type="button" onClick={() => setMarkMode((m) => m === "end" ? null : "end")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${markMode === "end" ? "bg-rose-500/20 border-rose-500/50 text-rose-400" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                      data-testid="button-mark-end"><FlagOff size={11} />Tandai Akhir</button>
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    {!isFullRange && (
                      <button type="button" onClick={() => { setStartRow(1); setEndRow(totalRows); setMarkMode(null); }}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors" data-testid="button-reset-range">Reset</button>
                    )}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${isFullRange ? "bg-muted/40 border-border/50 text-muted-foreground" : "bg-amber-500/15 border-amber-500/30 text-amber-400"}`}>
                      {rangeData.length} baris dipilih
                    </span>
                  </div>
                </div>

                <div className="border-t border-border/40" />

                {/* ID Transaksi search + Table filter on same row */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* ID search */}
                  <Hash size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground/80 shrink-0 hidden sm:inline">ID Transaksi:</span>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input type="text" placeholder="Cari User ID..." value={idSearch}
                      onChange={(e) => { setIdSearch(e.target.value); setIdSearchResult(null); setIdSearchError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") searchIdAndApply("start"); }}
                      className="w-40 h-7 pl-7 pr-3 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono placeholder:text-muted-foreground/50"
                      data-testid="input-id-search" />
                  </div>
                  <button type="button" onClick={() => searchIdAndApply("start")} disabled={!idSearch.trim()}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="button-id-set-start"><Flag size={11} />Set Awal</button>
                  <button type="button" onClick={() => searchIdAndApply("end")} disabled={!idSearch.trim()}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:border-rose-500/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="button-id-set-end"><FlagOff size={11} />Set Akhir</button>
                  {idSearchResult && <span className="text-xs text-emerald-400 flex items-center gap-1"><Check size={11} />Baris {idSearchResult.row}: <span className="font-mono">{idSearchResult.id}</span></span>}
                  {idSearchError && <span className="text-xs text-destructive flex items-center gap-1"><AlertCircle size={11} />{idSearchError}</span>}

                  {/* Table filter */}
                  <div className="ml-auto flex items-center gap-2">
                    <Search size={13} className="text-muted-foreground shrink-0" />
                    <div className="relative">
                      <input type="text" placeholder="Filter tabel..." value={tableFilter}
                        onChange={(e) => setTableFilter(e.target.value)}
                        className="w-36 h-7 px-3 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                        data-testid="input-table-filter" />
                      {tableFilter && (
                        <button type="button" onClick={() => setTableFilter("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X size={11} />
                        </button>
                      )}
                    </div>
                    {tableFilter && (
                      <span className="text-xs text-muted-foreground">{filteredData.length} hasil</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Mark mode hint */}
              <AnimatePresence>
                {markMode && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs overflow-hidden"
                    style={{
                      borderColor: markMode === "start" ? "rgb(52 211 153 / 0.4)" : "rgb(251 113 133 / 0.4)",
                      background: markMode === "start" ? "rgb(52 211 153 / 0.08)" : "rgb(251 113 133 / 0.08)",
                      color: markMode === "start" ? "rgb(52 211 153)" : "rgb(251 113 133)",
                    }}>
                    <Flag size={12} />
                    Mode aktif: <strong>Tandai Baris {markMode === "start" ? "Awal" : "Akhir"}</strong> — klik nomor baris (#) di tabel.
                    <button type="button" onClick={() => setMarkMode(null)} className="ml-auto opacity-70 hover:opacity-100"><X size={12} /></button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── TABLE ── */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                  <table className="w-full text-sm text-left border-collapse" data-testid="preview-table">
                    <thead className="text-xs uppercase bg-slate-900/50 text-muted-foreground sticky top-0 z-10 shadow-sm backdrop-blur-md">
                      <tr>
                        <th className="px-3 py-4 font-medium border-b border-border/50 text-center w-10 text-muted-foreground/50">#</th>
                        {OUTPUT_HEADERS.map((h, i) => (
                          <th key={i} className="px-4 py-4 font-medium whitespace-nowrap border-b border-border/50">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs divide-y divide-border/50">
                      {data.length > 0 ? data.map((row, i) => {
                        const rowNum = i + 1;
                        const isInRange = rowNum >= startRow && rowNum <= endRow;
                        const isStart = rowNum === startRow;
                        const isEnd = rowNum === endRow;
                        const isClickable = markMode !== null;
                        const isIdMatch = idSearch.trim() && row.userId.toLowerCase().includes(idSearch.trim().toLowerCase());
                        const isDup = duplicateUserIds.has(row.userId);

                        // Table filter: hide rows not matching filter (only within range)
                        if (tableFilter.trim() && isInRange) {
                          const q = tableFilter.trim().toLowerCase();
                          const matches = row.nama.toLowerCase().includes(q) ||
                            row.userId.toLowerCase().includes(q) ||
                            row.nomorRekening.toLowerCase().includes(q) ||
                            row.withdrawal.toLowerCase().includes(q);
                          if (!matches) return null;
                        }

                        return (
                          <tr key={i}
                            className={`transition-all duration-150
                              ${isInRange ? "hover:bg-muted/30" : "opacity-25 bg-background/30"}
                              ${isStart ? "border-t-2 border-t-emerald-500/50" : ""}
                              ${isEnd ? "border-b-2 border-b-rose-500/50" : ""}
                              ${isIdMatch ? "bg-primary/5" : ""}
                              ${isDup && isInRange ? "bg-amber-500/5" : ""}`}
                            data-testid={`row-data-${i}`}>
                            <td className={`px-3 py-3 text-center align-middle select-none transition-all ${isClickable ? "cursor-pointer" : ""}`}
                              onClick={() => isClickable && handleRowClick(i)}>
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-medium transition-all ${
                                isStart ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                                : isEnd ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40"
                                : isDup && isInRange ? "bg-amber-500/20 text-amber-400"
                                : isClickable ? "text-muted-foreground/40 hover:bg-primary/20 hover:text-primary"
                                : "text-muted-foreground/30"}`}>
                                {isDup && isInRange ? "!" : rowNum}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-foreground/90">{row.nama}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-primary/90">{row.nomorRekening}</td>
                            <td className={`px-4 py-3 whitespace-nowrap ${isIdMatch ? "text-primary font-semibold" : isDup && isInRange ? "text-amber-400" : ""}`}>{row.userId}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.sub}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.kodeTransaksi}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.deposit}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-medium">{row.withdrawal}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.dpPulsa}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.keterangan}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.kodeBank}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.saldoAkhir}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-foreground/80">{row.jamInput}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.inputKodeBank}</td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={14} className="px-4 py-12 text-center text-muted-foreground text-sm font-sans">
                            Tidak ada baris data yang valid di file yang dipilih.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto border-t border-border/50 py-6 text-center">
        <p className="text-xs text-muted-foreground/60">WD Data Extractor &nbsp;·&nbsp; Internal Operations Tooling</p>
      </footer>
    </div>
  );
}
