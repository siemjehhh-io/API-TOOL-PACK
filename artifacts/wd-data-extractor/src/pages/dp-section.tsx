import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, X, Check, AlertCircle,
  ChevronDown, ChevronsUpDown, Flag, FlagOff, Search, Hash,
  Layers, Banknote, ListOrdered, Download, Copy, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { DpSettingsModal } from "@/components/dp-settings-modal";
import { useDpProfiles } from "@/hooks/useDpProfiles";
import { DpProfile } from "@/types/dpProfile";

/* ── Types ── */
interface DpRow {
  nama: string;        // Whitelabel Transaction ID
  nomorRekening: string; // Transaction Date formatted
  userId: string;      // Member ID
  sub: string;
  kodeTransaksi: string;
  deposit: string;     // Amount
  withdrawal: string;
  dpPulsa: string;
  keterangan: string;  // Transaction ID (UUID)
  kodeBank: string;
  saldoAkhir: string;
  jamInput: string;    // time from Finished Date
  inputKodeBank: string; // same time
}

const OUTPUT_HEADERS = [
  "NAMA", "NOMOR REKENING", "USER ID / LOGIN", "SUB", "KODE TRANSAKSI",
  "DEPOSIT", "WITHDRAWAL", "DP PULSA", "KETERANGAN / KODE SN",
  "KODE BANK", "SALDO AKHIR", "JAM INPUT WD", "INPUT KODE BANK",
];

function rowToArr(r: DpRow): string[] {
  return [
    r.nama, r.nomorRekening, r.userId, r.sub, r.kodeTransaksi,
    r.deposit, r.withdrawal, r.dpPulsa, r.keterangan,
    r.kodeBank, r.saldoAkhir, r.jamInput, r.inputKodeBank,
  ];
}

/* "2026-05-03 17:54:19" → "17:54:19" */
function extractTime(dateStr: unknown): string {
  if (!dateStr) return "";
  const s = String(dateStr);
  const m = s.match(/(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : "";
}

/* "2026-05-03 17:53:48" → "5/3/2026 17:53:48" */
function formatTxDate(dateStr: unknown): string {
  if (!dateStr) return "";
  const s = String(dateStr);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (!m) return s;
  const [, y, mo, d, t] = m;
  return `${parseInt(mo)}/${parseInt(d)}/${y} ${t}`;
}

function transformDpData(raw: Record<string, unknown>[], profile: DpProfile): DpRow[] {
  return raw.flatMap((row) => {
    const memberId = String(row["Member ID"] ?? "").trim();
    if (!memberId) return [];
    return [{
      nama:          String(row["Whitelabel Transaction ID"] ?? "").trim(),
      nomorRekening: formatTxDate(row["Transaction Date"]),
      userId:        memberId,
      sub:           profile.sub,
      kodeTransaksi: "DP",
      deposit:       String(row["Amount"] ?? "").trim(),
      withdrawal:    "",
      dpPulsa:       "",
      keterangan:    String(row["Transaction ID"] ?? "").trim(),
      kodeBank:      profile.kodeBank,
      saldoAkhir:    "",
      jamInput:      extractTime(row["Finished Date"]),
      inputKodeBank: extractTime(row["Finished Date"]),
    }];
  });
}

function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max); }
function fmt(n: number) { return n.toLocaleString("id-ID"); }
function parseAmt(v: string) { const n = parseFloat(v.replace(/[^0-9.,-]/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }

function GlassBtn({ active, activeClass, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; activeClass?: string }) {
  return (
    <button type="button" {...props}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
        ${active ? (activeClass ?? "bg-white/10 border-white/20 text-white") : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80 hover:bg-white/5"}
        ${props.className ?? ""} disabled:opacity-35 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

export function DpSection() {
  const { profiles, activeProfile, activeProfileId, setActiveProfileId,
    addProfile, updateProfile, deleteProfile } = useDpProfiles();

  const [isDragging, setIsDragging]       = useState(false);
  const [file, setFile]                   = useState<File | null>(null);
  const [data, setData]                   = useState<DpRow[] | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [isParsing, setIsParsing]         = useState(false);
  const [isCopied, setIsCopied]           = useState(false);
  const [pickerOpen, setPickerOpen]       = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  const [sheetNames, setSheetNames]       = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const wbRef                             = useRef<XLSX.WorkBook | null>(null);

  const [startRow, setStartRow]           = useState(1);
  const [endRow, setEndRow]               = useState(1);
  const [markMode, setMarkMode]           = useState<"start" | "end" | null>(null);

  const [idSearch, setIdSearch]           = useState("");
  const [idResult, setIdResult]           = useState<{ row: number; id: string } | null>(null);
  const [idErr, setIdErr]                 = useState<string | null>(null);
  const [tableFilter, setTableFilter]     = useState("");

  const totalRows = data?.length ?? 0;

  useEffect(() => {
    if (data) {
      setStartRow(1); setEndRow(data.length); setMarkMode(null);
      setIdSearch(""); setIdResult(null); setIdErr(null); setTableFilter("");
    }
  }, [data]);

  const rangeData    = useMemo(() => data ? data.slice(startRow - 1, endRow) : [], [data, startRow, endRow]);
  const filteredData = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return rangeData;
    return rangeData.filter((r) =>
      r.userId.toLowerCase().includes(q) || r.nama.toLowerCase().includes(q) ||
      r.deposit.toLowerCase().includes(q) || r.keterangan.toLowerCase().includes(q));
  }, [rangeData, tableFilter]);

  const dupIds = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rangeData) if (r.userId) c[r.userId] = (c[r.userId] ?? 0) + 1;
    return new Set(Object.keys(c).filter((k) => c[k] > 1));
  }, [rangeData]);

  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    return {
      count: filteredData.length,
      totalNominal: filteredData.reduce((s, r) => s + parseAmt(r.deposit), 0),
      dupCount: filteredData.filter((r) => dupIds.has(r.userId)).length,
    };
  }, [filteredData, dupIds]);

  const processSheet = (wb: XLSX.WorkBook, name: string) => {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name]) as Record<string, unknown>[];
    if (!raw.length) throw new Error(`Sheet "${name}" kosong.`);
    const required = ["Member ID", "Transaction ID", "Whitelabel Transaction ID", "Amount", "Finished Date", "Transaction Date"];
    const miss = required.filter((c) => !(c in raw[0]));
    if (miss.length) throw new Error(`Kolom tidak ditemukan: ${miss.join(", ")}. Pastikan ini adalah file Deposit Report yang benar.`);
    return transformDpData(raw, activeProfile);
  };

  const processFile = async (f: File) => {
    setFile(f); setError(null); setData(null);
    setSheetNames([]); setSelectedSheet(""); wbRef.current = null; setIsParsing(true);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      wbRef.current = wb;
      if (!wb.SheetNames.length) throw new Error("File Excel tidak memiliki sheet.");
      setSheetNames(wb.SheetNames);
      setSelectedSheet(wb.SheetNames[0]);
      setData(processSheet(wb, wb.SheetNames[0]));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Gagal membaca file."); }
    finally { setIsParsing(false); }
  };

  const changeSheet = (name: string) => {
    if (!wbRef.current) return;
    setSelectedSheet(name); setError(null); setData(null);
    try { setData(processSheet(wbRef.current, name)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Gagal membaca sheet."); }
  };

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) f.name.endsWith(".xlsx") ? processFile(f) : setError("Hanya file .xlsx yang didukung.");
  }, [activeProfile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const reset = () => {
    setFile(null); setData(null); setError(null); setIsCopied(false); setMarkMode(null);
    setIdSearch(""); setIdResult(null); setIdErr(null); setTableFilter("");
    setSheetNames([]); setSelectedSheet(""); wbRef.current = null;
  };

  const searchId = (target: "start" | "end") => {
    if (!data || !idSearch.trim()) return;
    const q = idSearch.trim().toLowerCase();
    const idx = data.findIndex((r) => r.userId.toLowerCase().includes(q));
    if (idx === -1) { setIdResult(null); setIdErr(`ID "${idSearch.trim()}" tidak ditemukan.`); return; }
    const n = idx + 1;
    setIdErr(null); setIdResult({ row: n, id: data[idx].userId });
    if (target === "start") {
      if (n > endRow) { setStartRow(endRow); setEndRow(n); toast.success(`Baris ${n} — set akhir (ditukar)`); }
      else { setStartRow(n); toast.success(`Baris ${n} — set awal`); }
    } else {
      if (n < startRow) { setEndRow(startRow); setStartRow(n); toast.success(`Baris ${n} — set awal (ditukar)`); }
      else { setEndRow(n); toast.success(`Baris ${n} — set akhir`); }
    }
  };

  const handleRowClick = (i: number) => {
    const n = i + 1;
    if (markMode === "start") { setStartRow(n); if (n > endRow) setEndRow(n); setMarkMode(null); }
    else if (markMode === "end") { setEndRow(n); if (n < startRow) setStartRow(n); setMarkMode(null); }
  };

  const handleStartInput = (v: string) => { const n = parseInt(v, 10); if (isNaN(n)) return; const c = clamp(n, 1, totalRows); setStartRow(c); if (c > endRow) setEndRow(c); };
  const handleEndInput   = (v: string) => { const n = parseInt(v, 10); if (isNaN(n)) return; const c = clamp(n, 1, totalRows); setEndRow(c); if (c < startRow) setStartRow(c); };

  const copyTSV = async () => {
    if (!filteredData.length) return;
    try {
      await navigator.clipboard.writeText(filteredData.map((r) => rowToArr(r).join("\t")).join("\n"));
      setIsCopied(true); toast.success(`${filteredData.length} baris disalin!`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch { toast.error("Gagal menyalin."); }
  };

  const exportXlsx = () => {
    if (!filteredData.length) return;
    try {
      const rows = filteredData.map(rowToArr);
      const ws = XLSX.utils.aoa_to_sheet([OUTPUT_HEADERS, ...rows]);
      ws["!cols"] = OUTPUT_HEADERS.map((h, i) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2 }));
      const wb2 = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb2, ws, "Output DP");
      const base = file?.name.replace(/\.xlsx$/i, "") ?? "dp-output";
      XLSX.writeFile(wb2, `${base}_output.xlsx`);
      toast.success(`"${base}_output.xlsx" berhasil diunduh!`);
    } catch { toast.error("Gagal ekspor Excel."); }
  };

  const isFullRange = startRow === 1 && endRow === totalRows;
  const inputCls = "bg-white/5 border border-white/10 text-white/90 placeholder:text-white/25 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400/50 focus:border-emerald-400/40 transition-all";

  return (
    <div className="flex flex-col gap-6">

      {/* Profile banner + controls */}
      <div className="flex items-center gap-3">
        {/* Profile picker */}
        <div className="relative flex-1 max-w-xs">
          <button type="button" onClick={() => setPickerOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl glass border-white/10 hover:bg-white/8 transition-all text-sm"
            data-testid="button-dp-profile-picker">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400/60" />
            <span className="flex-1 truncate text-white/85 font-medium text-left">{activeProfile.name}</span>
            <ChevronDown size={13} className={`text-white/40 transition-transform duration-200 ${pickerOpen ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {pickerOpen && (
              <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.15 }}
                className="absolute left-0 top-full mt-2 z-50 w-56 rounded-2xl glass-strong shadow-2xl overflow-hidden">
                {profiles.map((p) => (
                  <button key={p.id} type="button"
                    onClick={() => { setActiveProfileId(p.id); setPickerOpen(false); reset(); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-all
                      ${p.id === activeProfileId ? "bg-emerald-500/15 text-emerald-200" : "text-white/70 hover:bg-white/6 hover:text-white"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.id === activeProfileId ? "bg-emerald-400" : "bg-white/20"}`} />
                    <span className="truncate">{p.name}</span>
                    {p.id === activeProfileId && <Check size={12} className="ml-auto text-emerald-400 shrink-0" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {pickerOpen && <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />}
        </div>

        <DpSettingsModal profiles={profiles} activeProfileId={activeProfileId}
          onSelectProfile={(id) => { setActiveProfileId(id); reset(); }}
          onAddProfile={addProfile} onUpdateProfile={updateProfile} onDeleteProfile={deleteProfile} />
      </div>

      {/* Profile info banner */}
      <motion.div key={activeProfile.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl glass border-emerald-400/20"
        style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(5,150,105,0.04) 100%)" }}>
        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400/60" />
        <span className="text-sm font-semibold text-white/90">{activeProfile.name}</span>
        <span className="text-xs text-white/35 ml-1 hidden sm:inline">
          SUB: {activeProfile.sub} &nbsp;·&nbsp; KODE TRANSAKSI: DP &nbsp;·&nbsp; KODE BANK: {activeProfile.kodeBank}
        </span>
      </motion.div>

      {/* Upload Zone */}
      <div data-testid="dp-upload-zone"
        className={`relative group w-full rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-12 text-center overflow-hidden
          ${isDragging ? "border-emerald-400/70 scale-[1.01]"
          : file ? "border-white/12 glass" : "border-white/12 glass hover:border-emerald-400/40 cursor-pointer"}`}
        style={isDragging ? { background: "rgba(16,185,129,0.1)" } : undefined}
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}>

        {isDragging && <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: "inset 0 0 60px rgba(16,185,129,0.18)" }} />}

        <input type="file" accept=".xlsx" className="hidden" ref={fileInputRef} onChange={handleFileSelect} data-testid="dp-input-file" />
        <AnimatePresence mode="wait">
          {isParsing ? (
            <motion.div key="parsing" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-full border-4 border-emerald-400/20 border-t-emerald-400 animate-spin" />
              <p className="text-white/60 font-medium">Memproses data deposit…</p>
            </motion.div>
          ) : file ? (
            <motion.div key="file" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 w-full">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-400/20 flex items-center justify-center">
                <FileSpreadsheet size={30} className="text-emerald-300" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{file.name}</h3>
                <p className="text-xs text-white/40 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              {sheetNames.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap justify-center" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-white/40">Sheet:</span>
                  {sheetNames.map((s) => (
                    <button key={s} type="button" onClick={() => changeSheet(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                        ${s === selectedSheet ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-200" : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={(e) => { e.stopPropagation(); reset(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-red-400 hover:bg-red-400/10 border border-white/8 hover:border-red-400/20 transition-all">
                <X size={13} />Hapus file
              </button>
            </motion.div>
          ) : (
            <motion.div key="prompt" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 border
                ${isDragging ? "bg-emerald-500 border-emerald-400 text-white" : "bg-white/5 border-white/10 text-white/40 group-hover:bg-emerald-500/15 group-hover:border-emerald-400/30 group-hover:text-emerald-300"}`}>
                <Upload size={26} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white/85">Drop file Deposit Report di sini</h3>
                <p className="text-sm text-white/35 mt-1.5">Format: <span className="text-emerald-300/80">deposit-report-*.xlsx</span></p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="flex items-start gap-4 p-5 rounded-2xl border border-red-400/20 bg-red-500/8 backdrop-blur-sm">
              <AlertCircle size={22} className="text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300 mb-1">Proses Gagal</p>
                <p className="text-xs text-red-300/70">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-300 transition-colors"><X size={16} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview */}
      <AnimatePresence>
        {data && !error && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="flex flex-col gap-4">

            {/* Stats */}
            {stats && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-4 p-4 rounded-2xl glass border-white/8 shadow-lg">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                    <ListOrdered size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">Baris Dipilih</p>
                    <p className="text-2xl font-bold text-white leading-tight font-mono mt-0.5">
                      {stats.count}<span className="text-sm text-white/30 font-normal ml-1">/ {totalRows}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl glass border-white/8 shadow-lg">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 shrink-0">
                    <Banknote size={18} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">Total Deposit</p>
                    <p className="text-lg font-bold text-white leading-tight font-mono mt-0.5 truncate">{fmt(stats.totalNominal)}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-4 p-4 rounded-2xl glass shadow-lg transition-colors ${stats.dupCount > 0 ? "border-amber-400/25" : "border-white/8"}`}>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg shrink-0 ${stats.dupCount > 0 ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30" : "bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/30"}`}>
                    {stats.dupCount > 0 ? <TriangleAlert size={18} className="text-white" /> : <Layers size={18} className="text-white" />}
                  </div>
                  <div>
                    {stats.dupCount > 0 ? (
                      <>
                        <p className="text-[10px] uppercase tracking-widest text-amber-400/60 font-semibold">ID Duplikat</p>
                        <p className="text-2xl font-bold text-amber-300 leading-tight font-mono mt-0.5">{stats.dupCount} <span className="text-sm font-normal">baris</span></p>
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

            {/* Top bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-white/85">Pratinjau Data DP</h2>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-semibold border border-emerald-400/20">{totalRows} total</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={exportXlsx} disabled={filteredData.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass border-white/10 hover:bg-white/8 text-sm text-white/60 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                  <Download size={14} /><span className="hidden sm:inline text-xs">Export</span>
                </button>
                <button type="button" onClick={copyTSV} disabled={filteredData.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed
                    ${isCopied ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-500/30"
                    : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/30 hover:from-emerald-500 hover:to-teal-500"}`}>
                  {isCopied ? <><Check size={15} />Tersalin!</> : <><Copy size={15} />Salin TSV</>}
                </button>
              </div>
            </div>

            {/* Range + search controls */}
            <div className="flex flex-col gap-3 p-4 rounded-2xl glass border-white/8 shadow-lg">
              <div className="flex flex-wrap items-center gap-3">
                <ChevronsUpDown size={14} className="text-white/30 shrink-0" />
                <span className="text-xs font-semibold text-white/50 shrink-0">RENTANG:</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/30">Mulai</span>
                  <input type="number" min={1} max={totalRows} value={startRow} onChange={(e) => handleStartInput(e.target.value)}
                    className={`w-16 h-7 px-2 text-sm text-center font-mono ${inputCls}`} />
                </div>
                <span className="text-white/20 text-xs">—</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/30">Sampai</span>
                  <input type="number" min={1} max={totalRows} value={endRow} onChange={(e) => handleEndInput(e.target.value)}
                    className={`w-16 h-7 px-2 text-sm text-center font-mono ${inputCls}`} />
                </div>
                <div className="flex gap-1.5">
                  <GlassBtn active={markMode === "start"} activeClass="bg-emerald-500/15 border-emerald-400/40 text-emerald-300"
                    onClick={() => setMarkMode((m) => m === "start" ? null : "start")}><Flag size={11} />Tandai Awal</GlassBtn>
                  <GlassBtn active={markMode === "end"} activeClass="bg-rose-500/15 border-rose-400/40 text-rose-300"
                    onClick={() => setMarkMode((m) => m === "end" ? null : "end")}><FlagOff size={11} />Tandai Akhir</GlassBtn>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  {!isFullRange && (
                    <button onClick={() => { setStartRow(1); setEndRow(totalRows); setMarkMode(null); }}
                      className="text-xs text-white/30 hover:text-white/60 underline underline-offset-2 transition-colors">Reset</button>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${isFullRange ? "bg-white/5 border-white/8 text-white/30" : "bg-amber-500/12 border-amber-400/25 text-amber-300"}`}>
                    {rangeData.length} dipilih
                  </span>
                </div>
              </div>

              <div className="border-t border-white/6" />

              <div className="flex flex-wrap items-center gap-2">
                <Hash size={13} className="text-white/30 shrink-0" />
                <span className="text-xs font-semibold text-white/40 shrink-0 hidden sm:inline">ID:</span>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input type="text" placeholder="Cari Member ID…" value={idSearch}
                    onChange={(e) => { setIdSearch(e.target.value); setIdResult(null); setIdErr(null); }}
                    onKeyDown={(e) => e.key === "Enter" && searchId("start")}
                    className={`w-36 h-7 pl-7 pr-3 text-xs font-mono ${inputCls}`} />
                </div>
                <GlassBtn disabled={!idSearch.trim()} active={false} onClick={() => searchId("start")}><Flag size={11} />Set Awal</GlassBtn>
                <GlassBtn disabled={!idSearch.trim()} active={false} onClick={() => searchId("end")}><FlagOff size={11} />Set Akhir</GlassBtn>
                {idResult && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><Check size={10} />Baris {idResult.row}: <span className="font-mono">{idResult.id}</span></span>}
                {idErr && <span className="text-[11px] text-red-400 flex items-center gap-1"><AlertCircle size={10} />{idErr}</span>}

                <div className="ml-auto flex items-center gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input type="text" placeholder="Filter tabel…" value={tableFilter}
                      onChange={(e) => setTableFilter(e.target.value)}
                      className={`w-32 h-7 pl-7 pr-7 text-xs ${inputCls}`} />
                    {tableFilter && <button onClick={() => setTableFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X size={11} /></button>}
                  </div>
                  {tableFilter && <span className="text-[11px] text-white/30">{filteredData.length} hasil</span>}
                </div>
              </div>
            </div>

            {/* Mark mode hint */}
            <AnimatePresence>
              {markMode && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs overflow-hidden
                    ${markMode === "start" ? "bg-emerald-500/8 border-emerald-400/20 text-emerald-300" : "bg-rose-500/8 border-rose-400/20 text-rose-300"}`}>
                  <Flag size={12} />
                  Mode aktif: <strong>Tandai Baris {markMode === "start" ? "Awal" : "Akhir"}</strong> — klik nomor baris di tabel.
                  <button onClick={() => setMarkMode(null)} className="ml-auto opacity-60 hover:opacity-100"><X size={12} /></button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Table */}
            <div className="rounded-2xl overflow-hidden glass border-white/8 shadow-2xl">
              <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-[10px] uppercase tracking-wider text-white/30 sticky top-0 z-10"
                    style={{ background: "rgba(5,46,22,0.75)", backdropFilter: "blur(20px)" }}>
                    <tr>
                      <th className="px-3 py-3.5 text-center w-10 border-b border-white/6">#</th>
                      {OUTPUT_HEADERS.map((h, i) => (
                        <th key={i} className="px-4 py-3.5 font-semibold whitespace-nowrap border-b border-white/6">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs divide-y divide-white/4">
                    {data.map((row, i) => {
                      const rn = i + 1;
                      const inRange = rn >= startRow && rn <= endRow;
                      const isStart = rn === startRow;
                      const isEnd   = rn === endRow;
                      const isIdMatch = idSearch.trim() && row.userId.toLowerCase().includes(idSearch.trim().toLowerCase());
                      const isDup = dupIds.has(row.userId);

                      if (tableFilter.trim() && inRange) {
                        const q = tableFilter.trim().toLowerCase();
                        if (!(row.userId.toLowerCase().includes(q) || row.nama.toLowerCase().includes(q) ||
                          row.deposit.toLowerCase().includes(q) || row.keterangan.toLowerCase().includes(q))) return null;
                      }

                      return (
                        <tr key={i}
                          className={`transition-colors duration-100
                            ${inRange ? "hover:bg-white/3" : "opacity-20"}
                            ${isStart ? "border-t-2 border-t-emerald-400/40" : ""}
                            ${isEnd ? "border-b-2 border-b-rose-400/40" : ""}
                            ${isIdMatch && inRange ? "bg-emerald-500/5" : ""}
                            ${isDup && inRange ? "bg-amber-500/4" : ""}`}>
                          <td className={`px-3 py-2.5 text-center align-middle select-none ${markMode ? "cursor-pointer" : ""}`}
                            onClick={() => markMode && handleRowClick(i)}>
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-bold transition-all
                              ${isStart ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30"
                              : isEnd ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30"
                              : isDup && inRange ? "bg-amber-500/20 text-amber-300"
                              : markMode ? "text-white/20 hover:bg-emerald-500/20 hover:text-emerald-300"
                              : "text-white/15"}`}>
                              {isDup && inRange ? "!" : rn}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/50 text-[11px]">{row.nama}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-cyan-300/70 text-[11px]">{row.nomorRekening}</td>
                          <td className={`px-4 py-2.5 whitespace-nowrap ${isIdMatch ? "text-emerald-200 font-semibold" : isDup && inRange ? "text-amber-300" : "text-white/80"}`}>{row.userId}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/35">{row.sub}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-emerald-300/80 font-semibold">{row.kodeTransaksi}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-emerald-300/90 font-semibold">{row.deposit}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/25">{row.withdrawal}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/25">{row.dpPulsa}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-white/40 text-[11px] max-w-[200px] truncate" title={row.keterangan}>{row.keterangan}</td>
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
