import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUpFromLine,
  Banknote,
  Check,
  Copy,
  Download,
  Eraser,
  FileSpreadsheet,
  FileText,
  Layers,
  ListOrdered,
  Loader2,
  QrCode,
  Sparkles,
  TableProperties,
  Tag,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useCallback, useMemo, useRef, useState } from "react";

function htmlTableToGrid(html: string): string[][] {
  if (typeof DOMParser === "undefined") return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) {
      return html
        .split(/\r?\n/)
        .map((line) => line.split("\t").map((cell) => cell.trim()))
        .filter((row) => row.some(Boolean));
    }
    const rows = Array.from(table.querySelectorAll("tr"));
    return rows.map((tr) =>
      Array.from(tr.querySelectorAll("th, td")).map((td) => (td.textContent || "").trim())
    );
  } catch {
    return html
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((cell) => cell.trim()))
      .filter((row) => row.some(Boolean));
  }
}

function sortByDateAsc<T extends { date?: string; keterangan?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = new Date(a.date || a.keterangan || 0).getTime();
    const db = new Date(b.date || b.keterangan || 0).getTime();
    return (isNaN(da) ? 0 : da) - (isNaN(db) ? 0 : db);
  });
}

export interface QrisAjaibOzzoRow {
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
  date: string;
  paymentMethod: string;
  rawAmount: number;
  status: string;
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

const KNOWN_BANKS = [
  "QRIS",
  "AJAIB",
  "OZZO",
  "DANA",
  "GOPAY",
  "OVO",
  "SHOPEEPAY",
  "LINKAJA",
  "BCA",
  "BRI",
  "BNI",
  "MANDIRI",
  "SEABANK",
  "CIMB",
  "PERMATA",
  "DANAMON",
  "BSI",
  "NEO",
  "BNC",
  "JAGO",
];

function rowToArr(row: QrisAjaibOzzoRow): string[] {
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

function normalizeAmount(value: string | number): string {
  if (typeof value === "number") {
    return value.toLocaleString("en-US");
  }
  return String(value)
    .trim()
    .replace(/\.00$/, "");
}

function formatCurrency(value: number): string {
  return "Rp " + value.toLocaleString("id-ID");
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => String(h || "").toLowerCase().trim());
  for (const candidate of candidates) {
    const candLower = candidate.toLowerCase();
    const idx = normalized.findIndex((h) => h === candLower || h.includes(candLower));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parses Excel worksheet rows or 2D grid into structured QrisAjaibOzzoRow objects
 */
function parseExcelGrid(grid: (string | number)[][], subValue: string): QrisAjaibOzzoRow[] {
  if (!grid || grid.length < 2) return [];

  // 1. Locate header row
  let headerRowIdx = -1;
  let headers: string[] = [];

  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const rowStr = grid[r].map((c) => String(c || "").toLowerCase());
    const matchCount = rowStr.filter(
      (c) =>
        c.includes("name") ||
        c.includes("account") ||
        c.includes("amount") ||
        c.includes("transaction") ||
        c.includes("method") ||
        c.includes("nominal") ||
        c.includes("user") ||
        c.includes("rekening")
    ).length;

    if (matchCount >= 2) {
      headerRowIdx = r;
      headers = grid[r].map((c) => String(c || "").trim());
      break;
    }
  }

  if (headerRowIdx === -1) {
    // Default to first row as headers if no keywords matched
    headerRowIdx = 0;
    headers = grid[0].map((c) => String(c || "").trim());
  }

  const colName = findHeaderIndex(headers, [
    "account name",
    "nama account",
    "nama rekening",
    "nama pemilik",
    "nama member",
    "name",
    "nama",
  ]);

  const colBank = findHeaderIndex(headers, [
    "payment method",
    "bank name",
    "nama bank",
    "jenis pembayaran",
    "method",
    "bank",
    "provider",
  ]);

  const colAccNo = findHeaderIndex(headers, [
    "account number",
    "no rekening",
    "nomor rekening",
    "no rek",
    "number",
    "rekening",
  ]);

  const colUser = findHeaderIndex(headers, [
    "user id",
    "userid",
    "username",
    "user",
    "login",
    "id member",
  ]);

  const colTrxId = findHeaderIndex(headers, [
    "transaction id",
    "trx id",
    "id transaksi",
    "ref no",
    "reference",
    "keterangan",
    "sn",
  ]);

  const colAmount = findHeaderIndex(headers, [
    "total amount",
    "amount",
    "nominal",
    "debit",
    "withdrawal",
    "jumlah",
    "nilai",
  ]);

  const colDate = findHeaderIndex(headers, [
    "finished date",
    "transaction date",
    "tanggal",
    "date",
    "waktu",
    "created at",
  ]);

  const colStatus = findHeaderIndex(headers, ["status", "keadaan", "state"]);

  const results: QrisAjaibOzzoRow[] = [];

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;

    const rawName = colName !== -1 ? String(row[colName] || "").trim() : "";
    const rawBank = colBank !== -1 ? String(row[colBank] || "").trim() : "";
    const rawAccNo = colAccNo !== -1 ? String(row[colAccNo] || "").trim() : "";
    const rawUser = colUser !== -1 ? String(row[colUser] || "").trim() : "";
    const rawTrxId = colTrxId !== -1 ? String(row[colTrxId] || "").trim() : "";
    const rawAmtVal = colAmount !== -1 ? row[colAmount] : "";
    const rawDate = colDate !== -1 ? String(row[colDate] || "").trim() : "";
    const rawStatus = colStatus !== -1 ? String(row[colStatus] || "").trim() : "SUCCESS";

    const rowText = row.map((c) => String(c || "")).join(" ");
    if (!rawName && !rawAccNo && !rawAmtVal && !rawTrxId) continue;

    // Format Name
    let nama = rawName.toUpperCase();
    if (!nama && rowText.includes("/")) {
      nama = rowText.split("/")[0].trim().toUpperCase();
    }

    // Format Bank & Account Number
    let bankName = rawBank.toUpperCase();
    if (!bankName) {
      for (const b of KNOWN_BANKS) {
        if (rowText.toUpperCase().includes(b)) {
          bankName = b;
          break;
        }
      }
      if (!bankName) bankName = "QRIS AJAIB";
    }

    let accNo = rawAccNo.replace(/\D/g, "");
    if (!accNo) {
      const digitMatch = rowText.match(/\b(\d{8,25})\b/);
      if (digitMatch) accNo = digitMatch[1];
    }

    const nomorRekening = bankName && accNo ? `${bankName} ${accNo}` : accNo || bankName;

    // Format User ID
    let userId = rawUser;
    if (!userId) {
      // Look for username in row or extract from Trx ID before hyphen
      const hyphenParts = rawTrxId.split("-");
      if (hyphenParts.length > 1 && hyphenParts[0].length >= 3) {
        userId = hyphenParts[0];
      }
    }

    // Format Amount
    let rawAmount = 0;
    let withdrawal = "";

    if (typeof rawAmtVal === "number") {
      rawAmount = rawAmtVal;
      withdrawal = rawAmount.toLocaleString("en-US");
    } else if (rawAmtVal) {
      const numStr = String(rawAmtVal).replace(/[^\d\.]/g, "");
      rawAmount = Number(numStr) || 0;
      withdrawal = normalizeAmount(String(rawAmtVal));
    } else {
      const amtMatch = rowText.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
      if (amtMatch) {
        withdrawal = normalizeAmount(amtMatch[1]);
        rawAmount = Number(withdrawal.replace(/,/g, "")) || 0;
      }
    }

    // Format Time (HH:MM:SS)
    let jamInput = "";
    const timeMatch = rawDate.match(/\d{2}:\d{2}:\d{2}/);
    if (timeMatch) {
      jamInput = timeMatch[0];
    }

    if (nama || nomorRekening || withdrawal) {
      results.push({
        nama,
        nomorRekening,
        userId: userId || nama.toLowerCase().replace(/\s+/g, ""),
        sub: subValue,
        kodeTransaksi: "WD",
        deposit: "",
        withdrawal,
        dpPulsa: "",
        keterangan: rawTrxId || `QRIS-${r}`,
        kodeBank: "",
        saldoAkhir: "",
        jamInput,
        inputKodeBank: "",
        date: rawDate,
        paymentMethod: bankName,
        rawAmount,
        status: rawStatus || "SUCCESS",
      });
    }
  }

  return results;
}

export default function WdQrisAjaibOzzo() {
  const [inputText, setInputText] = useState("");
  const [subValue, setSubValue] = useState("OZZO");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedRows, setParsedRows] = useState<QrisAjaibOzzoRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Upload Handler (.xlsx, .xls, .csv)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const grid = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, { header: 1 });

        const rows = parseExcelGrid(grid, subValue);
        setParsedRows(sortByDateAsc(rows));
        toast.success(`Berhasil memuat ${rows.length} baris WD dari file ${file.name}!`);
      } catch (err) {
        console.error("Excel Read Error:", err);
        toast.error("Gagal membaca file Excel. Pastikan format file .xlsx / .xls / .csv valid.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Text / Clipboard Paste fallback handler
  const handleParseText = useCallback(
    (text: string, customSub: string) => {
      if (!text.trim()) {
        setParsedRows([]);
        return;
      }

      setIsProcessing(true);
      let rows: QrisAjaibOzzoRow[] = [];

      if (text.includes("\t") || text.includes("<table") || text.includes("<tr")) {
        const grid = htmlTableToGrid(text);
        if (grid.length > 0) {
          rows = parseExcelGrid(grid, customSub);
        }
      }

      setParsedRows(sortByDateAsc(rows));
      setIsProcessing(false);
    },
    []
  );

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    handleParseText(val, subValue);
  };

  const onSubChange = (newSub: string) => {
    setSubValue(newSub);
    setParsedRows((prev) => prev.map((r) => ({ ...r, sub: newSub })));
  };

  const totalAmount = useMemo(() => {
    return parsedRows.reduce((sum, r) => sum + r.rawAmount, 0);
  }, [parsedRows]);

  const handleCopyTSV = () => {
    if (parsedRows.length === 0) {
      toast.error("Belum ada data untuk di-copy.");
      return;
    }

    const tsvContent = parsedRows.map((r) => rowToArr(r).join("\t")).join("\n");
    navigator.clipboard.writeText(tsvContent).then(() => {
      setIsCopied(true);
      toast.success(
        `✅ ${parsedRows.length} baris WD QRIS AJAIB OZZO berhasil disalin! (13 Kolom A-M siap paste).`
      );
      setTimeout(() => setIsCopied(false), 2500);
    });
  };

  const handleCopySingleRow = (row: QrisAjaibOzzoRow, idx: number) => {
    const tsv = rowToArr(row).join("\t");
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedRowIdx(idx);
      toast.success(`Baris #${idx + 1} (${row.nama} - ${row.withdrawal}) disalin!`);
      setTimeout(() => setCopiedRowIdx(null), 2000);
    });
  };

  const handleDownloadExcel = () => {
    if (parsedRows.length === 0) {
      toast.error("Belum ada data untuk diunduh.");
      return;
    }

    const data = [OUTPUT_HEADERS, ...parsedRows.map((r) => rowToArr(r))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WD_QRIS_AJAIB_OZZO");

    const filename = `WD_QRIS_AJAIB_OZZO_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success(`File Excel ${filename} berhasil diunduh!`);
  };

  const handleClear = () => {
    setInputText("");
    setFileName(null);
    setParsedRows([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.info("Area input dan hasil telah dibersihkan.");
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ── HEADER CARD ── */}
      <div className="relative overflow-hidden p-6 rounded-3xl glass border border-white/10 shadow-2xl bg-gradient-to-br from-amber-950/60 via-slate-900/80 to-slate-950/90 backdrop-blur-xl">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-25 bg-amber-500 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-amber-500/10">
              <QrCode size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  WD QRIS AJAIB OZZO
                </h2>
                <span className="px-3 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border bg-amber-500/20 border-amber-400/40 text-amber-300">
                  EXCEL &amp; TABLE PARSER
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Import file Excel/CSV mentah penarikan QRIS AJAIB OZZO dan konversi ke 13 Kolom Spreadsheet otomatis
              </p>
            </div>
          </div>

          {/* SUB input */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/40 border border-white/10">
            <Tag size={14} className="text-amber-400" />
            <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              KOLOM SUB:
            </span>
            <input
              type="text"
              value={subValue}
              onChange={(e) => onSubChange(e.target.value)}
              placeholder="SUB (OZZO / AJAIB)"
              className="w-28 px-2.5 py-1 rounded-md bg-white/10 border border-white/10 text-xs font-bold text-amber-300 text-center uppercase focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* ── INPUT SECTION (FILE UPLOAD + TEXTAREA FALLBACK) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Upload & Textarea */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          {/* File Upload Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-6 rounded-2xl glass border-2 border-dashed border-amber-500/30 hover:border-amber-500/60 bg-amber-500/5 hover:bg-amber-500/10 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group text-center"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <span className="text-sm font-bold text-white block">
                {fileName ? `📄 ${fileName}` : "Klik atau Drag File Excel (.xlsx, .xls, .csv) di sini"}
              </span>
              <span className="text-xs text-slate-400 mt-1 block">
                Sistem otomatis membaca kolom Account Name, Payment Method, Total Amount, Trx ID, dll.
              </span>
            </div>
          </div>

          {/* Text Area Copy/Paste Fallback */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <FileText size={14} className="text-amber-400" />
                <span>ATAU PASTE TABEL / TEXT DI SINI</span>
              </label>
              {inputText && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-lg border border-rose-500/20 transition-all flex items-center gap-1"
                >
                  <Eraser size={11} />
                  Clear
                </button>
              )}
            </div>

            <div className="relative">
              <textarea
                value={inputText}
                onChange={onTextChange}
                placeholder="Atau paste langsung data baris tabel penarikan QRIS AJAIB OZZO di sini..."
                rows={6}
                className="w-full p-4 rounded-2xl bg-black/40 border border-white/10 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y transition-all shadow-inner leading-relaxed"
              />
              {isProcessing && (
                <div className="absolute inset-0 rounded-2xl bg-black/60 backdrop-blur-sm flex items-center justify-center gap-2 text-amber-400">
                  <Loader2 className="animate-spin" size={20} />
                  <span className="text-xs font-bold">Membaca Data Excel...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Summary Box */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="p-5 rounded-2xl glass border border-white/10 bg-slate-900/40 backdrop-blur-md flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <span>RINGKASAN WD QRIS AJAIB OZZO</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Tiket</span>
                <span className="text-2xl font-black text-white mt-1">
                  {parsedRows.length} <span className="text-xs font-normal text-slate-400">baris</span>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400">Label SUB</span>
                <span className="text-base font-black text-amber-400 mt-1 uppercase">
                  {subValue}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Nominal</span>
                <span className="text-base font-black text-rose-400 mt-1">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopyTSV}
                disabled={parsedRows.length === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 shadow-lg ${
                  parsedRows.length > 0
                    ? isCopied
                      ? "bg-emerald-600 text-white shadow-emerald-500/25"
                      : "bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-500/25 hover:scale-[1.02]"
                    : "bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed"
                }`}
              >
                {isCopied ? <Check size={16} /> : <Copy size={16} />}
                <span>{isCopied ? "BERHASIL DISALIN!" : "COPY KE SPREADSHEET (TSV 13 KOLOM)"}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={parsedRows.length === 0}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm border transition-all ${
                  parsedRows.length > 0
                    ? "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30 hover:border-emerald-500/50"
                    : "bg-white/5 text-slate-500 border-white/5 cursor-not-allowed"
                }`}
              >
                <Download size={16} />
                <span>Export Excel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 1: RAW EXCEL MATRIX TABLE ── */}
      {parsedRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <TableProperties size={14} className="text-amber-400" />
              <span>STEP 1: TABEL HASIL IMPORT EXCEL (RAW MATRIX)</span>
            </h3>
            <span className="text-xs text-amber-300/80 font-mono">
              {parsedRows.length} baris terdeteksi
            </span>
          </div>

          <div className="w-full overflow-x-auto rounded-2xl glass border border-white/10 bg-slate-950/80 shadow-xl">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="bg-white/10 border-b border-white/10 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-10">No.</th>
                  <th className="py-3 px-3">Transaction Date / Time</th>
                  <th className="py-3 px-3">Transaction ID / Ref</th>
                  <th className="py-3 px-3">Nama Member / Rekening</th>
                  <th className="py-3 px-3">User ID</th>
                  <th className="py-3 px-3">Payment Method</th>
                  <th className="py-3 px-3 text-right">Total Amount (WD)</th>
                  <th className="py-3 px-3 text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {parsedRows.map((row, idx) => (
                  <tr
                    key={`ajaib-${row.keterangan}-${idx}`}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-3 text-center font-mono text-slate-500 text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                      {row.date || "-"}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-amber-300 whitespace-nowrap font-bold">
                      {row.keterangan || "-"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-bold text-white uppercase">{row.nama || "-"}</div>
                      <div className="text-[11px] font-mono text-cyan-300 font-semibold">
                        {row.nomorRekening || "-"}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-amber-300 whitespace-nowrap">
                      {row.userId || "-"}
                    </td>
                    <td className="py-3 px-3 text-slate-300 whitespace-nowrap text-[11px]">
                      {row.paymentMethod || "-"}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-rose-400 whitespace-nowrap text-sm">
                      {row.withdrawal}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleCopySingleRow(row, idx)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          copiedRowIdx === idx
                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                            : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white"
                        }`}
                        title="Copy Baris Ini (TSV)"
                      >
                        {copiedRowIdx === idx ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STEP 2: SPREADSHEET TSV OUTPUT TABLE (KOLOM A S/D M) ── */}
      {parsedRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ListOrdered size={14} className="text-emerald-400" />
              <span>STEP 2: PREVIEW OUTPUT SPREADSHEET (KOLOM A S/D M)</span>
            </h3>
            <button
              type="button"
              onClick={handleCopyTSV}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5"
            >
              <Copy size={12} />
              <span>Salin Semua Baris (13 Kolom)</span>
            </button>
          </div>

          <div className="w-full overflow-x-auto rounded-2xl glass border border-white/10 bg-slate-950/60 shadow-xl">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-10">#</th>
                  <th className="py-3 px-3">A: NAMA</th>
                  <th className="py-3 px-3">B: NO. REKENING</th>
                  <th className="py-3 px-3">C: USER ID</th>
                  <th className="py-3 px-3 text-center">D: SUB</th>
                  <th className="py-3 px-3 text-center">E: KODE</th>
                  <th className="py-3 px-3 text-right">G: WITHDRAWAL</th>
                  <th className="py-3 px-3">I: KETERANGAN / SN</th>
                  <th className="py-3 px-3 text-center w-16">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {parsedRows.map((row, idx) => (
                  <tr
                    key={`out-ajaib-${row.keterangan}-${idx}`}
                    className="hover:bg-white/5 transition-colors group"
                  >
                    <td className="py-3 px-3 text-center font-mono text-slate-500 text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 font-bold text-white uppercase whitespace-nowrap">
                      {row.nama || <span className="text-slate-600">-</span>}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-cyan-300 whitespace-nowrap">
                      {row.nomorRekening || <span className="text-slate-600">-</span>}
                    </td>
                    <td className="py-3 px-3 font-mono text-amber-300 whitespace-nowrap">
                      {row.userId || <span className="text-slate-600">-</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] border border-amber-500/30">
                        {row.sub}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-mono font-bold text-[10px] border border-rose-500/30">
                        {row.kodeTransaksi}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-rose-400 whitespace-nowrap">
                      {row.withdrawal}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {row.keterangan || <span className="text-slate-600">-</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleCopySingleRow(row, idx)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          copiedRowIdx === idx
                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                            : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white"
                        }`}
                        title="Copy Baris Ini"
                      >
                        {copiedRowIdx === idx ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
