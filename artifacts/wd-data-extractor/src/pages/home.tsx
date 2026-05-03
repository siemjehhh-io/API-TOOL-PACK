import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, X, Clipboard, Check, AlertCircle,
  ChevronDown, ChevronsUpDown, Flag, FlagOff, Search, Hash,
  Layers, Banknote, ListOrdered, CreditCard,
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
  // internal only — not in TSV output
  _paymentMethod: string;
}

const OUTPUT_HEADERS = [
  "NAMA", "NOMOR REKENING", "USER ID / LOGIN", "SUB", "KODE TRANSAKSI",
  "DEPOSIT", "WITHDRAWAL", "DP PULSA", "KETERANGAN / KODE SN",
  "KODE BANK", "SALDO AKHIR", "JAM INPUT WD", "INPUT KODE BANK",
];

function rowToTsv(row: ExtractedRow): string {
  return [
    row.nama, row.nomorRekening, row.userId, row.sub, row.kodeTransaksi,
    row.deposit, row.withdrawal, row.dpPulsa, row.keterangan,
    row.kodeBank, row.saldoAkhir, row.jamInput, row.inputKodeBank,
  ].join("\t");
}

const formatExcelDate = (dateVal: unknown): string => {
  if (!dateVal) return "";
  if (typeof dateVal === "number") {
    const date = new Date((dateVal - (25567 + 2)) * 86400 * 1000);
    return date.toISOString().substr(11, 8);
  }
  if (typeof dateVal === "string") {
    const timeMatch = dateVal.match(/(\d{2}:\d{2}:\d{2})/);
    if (timeMatch) return timeMatch[1];
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

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

function formatNumber(n: number): string {
  return n.toLocaleString("id-ID");
}

function parseAmount(val: string): number {
  const cleaned = val.replace(/[^0-9.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
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

  // Row range (1-indexed, inclusive)
  const [startRow, setStartRow] = useState(1);
  const [endRow, setEndRow] = useState(1);
  const [markMode, setMarkMode] = useState<"start" | "end" | null>(null);

  // ID Transaksi search
  const [idSearch, setIdSearch] = useState("");
  const [idSearchResult, setIdSearchResult] = useState<{ row: number; id: string } | null>(null);
  const [idSearchError, setIdSearchError] = useState<string | null>(null);

  const totalRows = data?.length ?? 0;

  useEffect(() => {
    if (data) { setStartRow(1); setEndRow(data.length); setMarkMode(null); setIdSearch(""); setIdSearchResult(null); setIdSearchError(null); }
  }, [data]);

  const filteredData = useMemo(() => data ? data.slice(startRow - 1, endRow) : [], [data, startRow, endRow]);

  // Stats computed from filteredData
  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    const totalNominal = filteredData.reduce((acc, r) => acc + parseAmount(r.withdrawal), 0);
    const uniqueBanks = [...new Set(filteredData.map((r) => r._paymentMethod).filter(Boolean))];
    return { count: filteredData.length, totalNominal, uniqueBanks };
  }, [filteredData]);

  const processFile = async (selectedFile: File, profile: WebProfile) => {
    setFile(selectedFile); setError(null); setData(null); setIsParsing(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      if (!workbook.SheetNames.length) throw new Error("File Excel tidak memiliki sheet.");
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(firstSheet) as Record<string, unknown>[];
      if (rawData.length === 0) throw new Error("Sheet yang dipilih kosong.");
      const expectedCols = [profile.colAccountName, profile.colPaymentMethod,
        profile.colAccountNumber, profile.colTransactionId, profile.colTotalAmount, profile.colFinishedDate];
      const missingColumns = expectedCols.filter((col) => !(col in rawData[0]));
      if (missingColumns.length > 0) throw new Error(`Kolom tidak ditemukan di profil "${profile.name}": ${missingColumns.join(", ")}. Periksa mapping kolom di Pengaturan.`);
      setData(transformData(rawData, profile));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal membaca file Excel.");
    } finally { setIsParsing(false); }
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

  const resetState = () => { setFile(null); setData(null); setError(null); setIsCopied(false); setMarkMode(null); setIdSearch(""); setIdSearchResult(null); setIdSearchError(null); };

  // Search by transaction ID and apply to start/end
  const searchIdAndApply = (target: "start" | "end") => {
    if (!data || !idSearch.trim()) return;
    const q = idSearch.trim().toLowerCase();
    const idx = data.findIndex((r) => r.userId.toLowerCase().includes(q));
    if (idx === -1) {
      setIdSearchResult(null);
      setIdSearchError(`ID "${idSearch.trim()}" tidak ditemukan.`);
      return;
    }
    const rowNum = idx + 1;
    setIdSearchError(null);
    setIdSearchResult({ row: rowNum, id: data[idx].userId });
    if (target === "start") {
      setStartRow(rowNum);
      if (rowNum > endRow) setEndRow(rowNum);
    } else {
      setEndRow(rowNum);
      if (rowNum < startRow) setStartRow(rowNum);
    }
    toast.success(`ID ditemukan di baris ${rowNum} — set sebagai baris ${target === "start" ? "awal" : "akhir"}`);
  };

  const handleRowClick = (rowIndex: number) => {
    const displayNum = rowIndex + 1;
    if (markMode === "start") {
      setStartRow(displayNum);
      if (displayNum > endRow) setEndRow(displayNum);
      setMarkMode(null);
    } else if (markMode === "end") {
      setEndRow(displayNum);
      if (displayNum < startRow) setStartRow(displayNum);
      setMarkMode(null);
    }
  };

  const handleStartInput = (val: string) => {
    const n = parseInt(val, 10);
    if (isNaN(n)) return;
    const c = clamp(n, 1, totalRows);
    setStartRow(c);
    if (c > endRow) setEndRow(c);
  };

  const handleEndInput = (val: string) => {
    const n = parseInt(val, 10);
    if (isNaN(n)) return;
    const c = clamp(n, 1, totalRows);
    setEndRow(c);
    if (c < startRow) setStartRow(c);
  };

  const copyToClipboard = async () => {
    if (!filteredData.length) return;
    try {
      const tsv = filteredData.map(rowToTsv).join("\n");
      await navigator.clipboard.writeText(tsv);
      setIsCopied(true);
      toast.success(`Berhasil menyalin ${filteredData.length} baris ke clipboard!`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch { toast.error("Gagal menyalin ke clipboard."); }
  };

  const isFullRange = startRow === 1 && endRow === totalRows;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      {/* Header */}
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
                    {profiles.map((profile) => (
                      <button key={profile.id} type="button"
                        onClick={() => { setActiveProfileId(profile.id); setProfilePickerOpen(false); resetState(); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${profile.id === activeProfileId ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"}`}
                        data-testid={`option-profile-${profile.id}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${profile.id === activeProfileId ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        <span className="truncate">{profile.name}</span>
                        {profile.id === activeProfileId && <Check size={12} className="ml-auto shrink-0" />}
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

        {/* Upload Zone */}
        <section>
          <div data-testid="upload-zone"
            className={`relative group w-full rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out flex flex-col items-center justify-center p-12 text-center ${
              isDragging ? "border-primary bg-primary/10 scale-[1.02]"
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
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); resetState(); }}
                    className="mt-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10" data-testid="button-remove-file">
                    <X size={16} className="mr-2" />Hapus file
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="upload-prompt" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex flex-col items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-300 ${isDragging ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground group-hover:text-primary group-hover:border-primary/30"}`}>
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

        {/* Error State */}
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

        {/* Preview & Actions */}
        <AnimatePresence>
          {data && !error && (
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="flex flex-col gap-4">

              {/* ── STATS PANEL ── */}
              <AnimatePresence>
                {stats && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Baris Dipilih */}
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-border/60 bg-card/80">
                      <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        <ListOrdered size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Baris Dipilih</p>
                        <p className="text-xl font-bold text-foreground leading-tight font-mono">
                          {stats.count}
                          <span className="text-xs text-muted-foreground font-normal ml-1">/ {totalRows}</span>
                        </p>
                      </div>
                    </div>

                    {/* Total Nominal */}
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-border/60 bg-card/80">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                        <Banknote size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Nominal</p>
                        <p className="text-base font-bold text-foreground leading-tight font-mono truncate" title={formatNumber(stats.totalNominal)}>
                          {formatNumber(stats.totalNominal)}
                        </p>
                      </div>
                    </div>

                    {/* Total File */}
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-border/60 bg-card/80">
                      <div className="w-9 h-9 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
                        <Layers size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total File</p>
                        <p className="text-xl font-bold text-foreground leading-tight font-mono">{totalRows}</p>
                      </div>
                    </div>

                    {/* Kode Bank */}
                    <div className="flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card/80">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                        <CreditCard size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Kode Bank</p>
                        {stats.uniqueBanks.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {stats.uniqueBanks.slice(0, 4).map((b) => (
                              <span key={b} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                                {b}
                              </span>
                            ))}
                            {stats.uniqueBanks.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">+{stats.uniqueBanks.length - 4}</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── TOP BAR ── */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-medium">Pratinjau Data</h2>
                  <span className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium border border-primary/20">{totalRows} total</span>
                </div>
                <Button onClick={copyToClipboard} disabled={filteredData.length === 0}
                  className={`transition-all duration-300 ${isCopied ? "bg-green-600 hover:bg-green-700 text-white" : ""}`} data-testid="button-copy-tsv">
                  {isCopied ? <><Check size={16} className="mr-2" />Tersalin!</> : <><Clipboard size={16} className="mr-2" />Salin sebagai TSV</>}
                </Button>
              </div>

              {/* ── ROW RANGE SELECTOR ── */}
              <div className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/60">
                {/* Row number controls */}
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
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                        markMode === "start" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                      data-testid="button-mark-start">
                      <Flag size={11} />Tandai Awal
                    </button>
                    <button type="button" onClick={() => setMarkMode((m) => m === "end" ? null : "end")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                        markMode === "end" ? "bg-rose-500/20 border-rose-500/50 text-rose-400" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                      data-testid="button-mark-end">
                      <FlagOff size={11} />Tandai Akhir
                    </button>
                  </div>

                  <div className="flex items-center gap-3 ml-auto">
                    {!isFullRange && (
                      <button type="button" onClick={() => { setStartRow(1); setEndRow(totalRows); setMarkMode(null); }}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors" data-testid="button-reset-range">
                        Reset
                      </button>
                    )}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                      isFullRange ? "bg-muted/40 border-border/50 text-muted-foreground" : "bg-amber-500/15 border-amber-500/30 text-amber-400"}`}>
                      {filteredData.length} baris dipilih
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border/40" />

                {/* ID Transaksi search */}
                <div className="flex flex-wrap items-center gap-2">
                  <Hash size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground/80 shrink-0">Patokan ID Transaksi:</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="relative flex-1 max-w-xs">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Cari User ID / Login..."
                        value={idSearch}
                        onChange={(e) => { setIdSearch(e.target.value); setIdSearchResult(null); setIdSearchError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") searchIdAndApply("start"); }}
                        className="w-full h-7 pl-7 pr-3 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono placeholder:text-muted-foreground/50"
                        data-testid="input-id-search"
                      />
                    </div>
                    <button type="button" onClick={() => searchIdAndApply("start")} disabled={!idSearch.trim()}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      data-testid="button-id-set-start">
                      <Flag size={11} />Set Awal
                    </button>
                    <button type="button" onClick={() => searchIdAndApply("end")} disabled={!idSearch.trim()}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border text-muted-foreground hover:border-rose-500/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      data-testid="button-id-set-end">
                      <FlagOff size={11} />Set Akhir
                    </button>
                  </div>

                  {/* Search result feedback */}
                  {idSearchResult && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <Check size={11} />
                      Baris {idSearchResult.row}: <span className="font-mono">{idSearchResult.id}</span>
                    </span>
                  )}
                  {idSearchError && (
                    <span className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle size={11} />{idSearchError}
                    </span>
                  )}
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
                    Mode aktif: <strong>Tandai Baris {markMode === "start" ? "Awal" : "Akhir"}</strong> — klik nomor baris (#) di tabel untuk menetapkan posisi.
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
                        {OUTPUT_HEADERS.map((header, i) => (
                          <th key={i} className="px-4 py-4 font-medium whitespace-nowrap border-b border-border/50">{header}</th>
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

                        return (
                          <tr key={i}
                            className={`transition-all duration-150 ${isInRange ? "hover:bg-muted/30" : "opacity-30 bg-background/30"}
                              ${isStart ? "border-t-2 border-t-emerald-500/50" : ""}
                              ${isEnd ? "border-b-2 border-b-rose-500/50" : ""}
                              ${isIdMatch ? "bg-primary/5" : ""}`}
                            data-testid={`row-data-${i}`}>
                            <td className={`px-3 py-3 text-center align-middle select-none transition-all ${isClickable ? "cursor-pointer" : ""}`}
                              onClick={() => isClickable && handleRowClick(i)}
                              title={isClickable ? `Set baris ${markMode === "start" ? "awal" : "akhir"} ke ${rowNum}` : undefined}>
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-medium transition-all ${
                                isStart ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                                : isEnd ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40"
                                : isClickable ? "text-muted-foreground/40 hover:bg-primary/20 hover:text-primary"
                                : "text-muted-foreground/30"}`}>
                                {rowNum}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-foreground/90">{row.nama}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-primary/90">{row.nomorRekening}</td>
                            <td className={`px-4 py-3 whitespace-nowrap ${isIdMatch ? "text-primary font-semibold" : ""}`}>{row.userId}</td>
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
