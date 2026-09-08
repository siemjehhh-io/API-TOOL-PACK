import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eraser,
  FileSpreadsheet,
  FileText,
  Flag,
  FlagOff,
  ListOrdered,
  Loader2,
  QrCode,
  Sparkles,
  TableProperties,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IdRangePicker } from "@/components/IdRangePicker";

export function htmlTableToGrid(text: string): (string | number)[][] {
  if (!text || !text.trim()) return [];

  // Parse HTML tables if present
  if (typeof DOMParser !== "undefined" && (text.includes("<table") || text.includes("<tr"))) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const table = doc.querySelector("table");
      if (table) {
        const trs = Array.from(table.querySelectorAll("tr"));
        const grid = trs
          .map((tr) =>
            Array.from(tr.querySelectorAll("th, td")).map((td) => (td.textContent || "").trim())
          )
          .filter((row) => row.some(Boolean));
        if (grid.length > 0) return grid;
      }
    } catch {
      // Fallback to line parsing
    }
  }

  // Parse plain text lines (TSV, CSV, Pipe, or multi-space separated)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const sample = lines.slice(0, 10);
  const hasTabs = sample.some((l) => l.includes("\t"));
  const hasPipes = sample.some((l) => l.includes("|"));
  const hasCommas = sample.some((l) => l.includes(","));
  const hasMultiSpace = sample.some((l) => /\s{2,}/.test(l));

  let delimiter: string | RegExp = "\t";
  if (hasTabs) {
    delimiter = "\t";
  } else if (hasPipes) {
    delimiter = "|";
  } else if (hasCommas) {
    delimiter = ",";
  } else if (hasMultiSpace) {
    delimiter = /\s{2,}/;
  } else {
    delimiter = /\s+/;
  }

  return lines
    .map((line) =>
      line
        .split(delimiter)
        .map((cell) => cell.trim().replace(/^["']|["']$/g, ""))
        .filter((cell, idx, arr) => arr.length > 1 || cell.length > 0)
    )
    .filter((row) => row.some(Boolean));
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

export const OUTPUT_HEADERS = [
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

export function rowToArr(row: QrisAjaibOzzoRow): string[] {
  return [
    row.nama,
    row.nomorRekening,
    row.userId,
    row.sub || "BOT",
    row.kodeTransaksi || "WD",
    row.deposit || "",
    row.withdrawal,
    row.dpPulsa || "",
    row.keterangan,
    row.kodeBank || "WD QRIS AJAIB",
    row.saldoAkhir || "",
    row.jamInput || "",
    row.inputKodeBank || "",
  ];
}

export function rowToDocTrxArr(row: QrisAjaibOzzoRow): string[] {
  return [
    row.nama,
    row.nomorRekening,
    row.userId,
    row.sub || "BOT",
    row.kodeTransaksi || "WD",
    row.deposit || "",
    row.withdrawal,
    row.dpPulsa || "",
    row.keterangan,
    row.kodeBank || "WD QRIS AJAIB",
  ];
}

function normalizeAmount(value: string | number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-US");
  }
  const str = String(value ?? "").trim().replace(/\.00$/, "");
  const num = Number(str.replace(/,/g, ""));
  if (Number.isFinite(num) && num > 0) {
    return num.toLocaleString("en-US");
  }
  return str;
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
export function parseExcelGrid(
  grid: (string | number)[][],
  subValue: string = "BOT",
  kodeBankValue: string = "WD QRIS AJAIB"
): QrisAjaibOzzoRow[] {
  if (!grid || grid.length === 0) return [];

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
        c.includes("player") ||
        c.includes("rekening") ||
        c.includes("status") ||
        c.includes("request") ||
        c.includes("paid")
    ).length;

    if (matchCount >= 2) {
      headerRowIdx = r;
      headers = grid[r].map((c) => String(c || "").trim());
      break;
    }
  }

  let colName = -1;
  let colBank = -1;
  let colAccNo = -1;
  let colUser = -1;
  let colTrxId = -1;
  let colAmount = -1;
  let colDate = -1;
  let colStatus = -1;

  if (headerRowIdx !== -1) {
    colName = findHeaderIndex(headers, [
      "player acct name",
      "account name",
      "nama account",
      "nama rekening",
      "nama pemilik",
      "nama member",
      "name",
      "nama",
    ]);

    colBank = findHeaderIndex(headers, [
      "player bank",
      "payment method",
      "bank name",
      "nama bank",
      "jenis pembayaran",
      "method",
      "bank",
      "provider",
    ]);

    colAccNo = findHeaderIndex(headers, [
      "player acct no",
      "account number",
      "no rekening",
      "nomor rekening",
      "no rek",
      "number",
      "rekening",
    ]);

    colUser = findHeaderIndex(headers, [
      "player",
      "user id",
      "userid",
      "username",
      "user",
      "login",
      "id member",
    ]);

    colTrxId = findHeaderIndex(headers, [
      "transaction id",
      "trx id",
      "id transaksi",
      "ref no",
      "reference",
      "keterangan",
      "sn",
    ]);

    colAmount = findHeaderIndex(headers, [
      "total amount",
      "amount",
      "nominal",
      "debit",
      "withdrawal",
      "jumlah",
      "nilai",
    ]);

    colDate = findHeaderIndex(headers, [
      "finished date",
      "transaction date",
      "tanggal",
      "date",
      "waktu",
      "created at",
      "request",
      "paid",
    ]);

    colStatus = findHeaderIndex(headers, ["status", "keadaan", "state"]);
  }

  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

  // Fallback / Auto-detect column mapping if header is missing or incomplete
  if (startRow < grid.length) {
    const sampleRows = grid.slice(startRow, startRow + 10);

    // Find bank column index if not set
    if (colBank === -1) {
      for (const row of sampleRows) {
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] || "").toUpperCase();
          if (KNOWN_BANKS.some((b) => cellStr.includes(b))) {
            colBank = c;
            break;
          }
        }
        if (colBank !== -1) break;
      }
    }

    // Infer remaining columns based on bank column index or standard layouts
    if (colBank === 3) {
      // Standard OZZO 14-col layout: Request(0), Paid(1), Player(2), Bank(3), Name(4), AccNo(5), ..., TrxId(8), Amount(9), Status(10)
      if (colDate === -1) colDate = 0;
      if (colUser === -1) colUser = 2;
      if (colName === -1) colName = 4;
      if (colAccNo === -1) colAccNo = 5;
      if (colTrxId === -1) colTrxId = 8;
      if (colAmount === -1) colAmount = 9;
      if (colStatus === -1) colStatus = 10;
    } else if (colBank === 1) {
      // Standard 8-col layout: Name(0), Bank(1), AccNo(2), User(3), TrxId(4), Amount(5), Date(6), Status(7)
      if (colName === -1) colName = 0;
      if (colAccNo === -1) colAccNo = 2;
      if (colUser === -1) colUser = 3;
      if (colTrxId === -1) colTrxId = 4;
      if (colAmount === -1) colAmount = 5;
      if (colDate === -1) colDate = 6;
      if (colStatus === -1) colStatus = 7;
    } else {
      const maxCols = Math.max(...sampleRows.map((r) => r.length), 0);
      if (colName === -1 && maxCols > 0) colName = 0;
      if (colAccNo === -1 && maxCols > 1) colAccNo = 1;
      if (colUser === -1 && maxCols > 2) colUser = 2;
      if (colTrxId === -1 && maxCols > 3) colTrxId = 3;
      if (colAmount === -1 && maxCols > 4) colAmount = 4;
    }
  }

  const results: QrisAjaibOzzoRow[] = [];

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;

    const rawName = colName !== -1 && colName < row.length ? String(row[colName] || "").trim() : "";
    const rawBank = colBank !== -1 && colBank < row.length ? String(row[colBank] || "").trim() : "";
    const rawAccNo = colAccNo !== -1 && colAccNo < row.length ? String(row[colAccNo] || "").trim() : "";
    const rawUser = colUser !== -1 && colUser < row.length ? String(row[colUser] || "").trim() : "";
    const rawTrxId = colTrxId !== -1 && colTrxId < row.length ? String(row[colTrxId] || "").trim() : "";
    const rawAmtVal = colAmount !== -1 && colAmount < row.length ? row[colAmount] : "";
    const rawDate = colDate !== -1 && colDate < row.length ? String(row[colDate] || "").trim() : "";
    const rawStatus = colStatus !== -1 && colStatus < row.length ? String(row[colStatus] || "").trim() : "SUCCESS";

    const rowText = row.map((c) => String(c || "")).join(" ");
    if (!rawName && !rawAccNo && !rawAmtVal && !rawTrxId && !rowText.trim()) continue;

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
        sub: subValue || "BOT",
        kodeTransaksi: "WD",
        deposit: "",
        withdrawal,
        dpPulsa: "",
        keterangan: rawTrxId || `QRIS-${r + 1}`,
        kodeBank: kodeBankValue || "WD QRIS AJAIB",
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
  const [subValue, setSubValue] = useState("BOT");
  const [kodeBankValue, setKodeBankValue] = useState("WD QRIS AJAIB");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedRows, setParsedRows] = useState<QrisAjaibOzzoRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showRawMatrix, setShowRawMatrix] = useState(false);
  const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Range boundary search queries & match indices
  const [startIdQuery, setStartIdQuery] = useState("");
  const [startMatchIdx, setStartMatchIdx] = useState(0);
  const [endIdQuery, setEndIdQuery] = useState("");
  const [endMatchIdx, setEndMatchIdx] = useState(0);

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

        const rows = parseExcelGrid(grid, subValue, kodeBankValue);
        setParsedRows(rows);
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
    (text: string, customSub: string, customBank: string) => {
      if (!text.trim()) {
        setParsedRows([]);
        return;
      }

      setIsProcessing(true);
      let rows: QrisAjaibOzzoRow[] = [];

      const grid = htmlTableToGrid(text);
      if (grid.length > 0) {
        rows = parseExcelGrid(grid, customSub, customBank);
      }

      setParsedRows(rows);
      setIsProcessing(false);
    },
    []
  );

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    handleParseText(val, subValue, kodeBankValue);
  };

  const onSubChange = (newSub: string) => {
    setSubValue(newSub);
    setParsedRows((prev) => prev.map((r) => ({ ...r, sub: newSub })));
  };

  const onKodeBankChange = (newBank: string) => {
    setKodeBankValue(newBank);
    setParsedRows((prev) => prev.map((r) => ({ ...r, kodeBank: newBank })));
  };

  // Base rows array matching the UI display table order (oldest at #1, newest at #N)
  const baseRows = useMemo(() => {
    return [...parsedRows].reverse();
  }, [parsedRows]);

  // Range boundary search matches operating directly on baseRows
  const findIdMatches = useCallback(
    (query: string): { row: number; id: string }[] => {
      if (!baseRows.length) return [];
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) return [];
      const matches: { row: number; id: string }[] = [];
      for (let i = 0; i < baseRows.length; i += 1) {
        const r = baseRows[i];
        if (
          r.keterangan.toLowerCase().includes(trimmed) ||
          r.userId.toLowerCase().includes(trimmed) ||
          r.nama.toLowerCase().includes(trimmed) ||
          r.nomorRekening.toLowerCase().includes(trimmed)
        ) {
          // Prioritize Keterangan / SN (Transaction ID) for displayed match ID
          const matchId = r.keterangan || r.userId || r.nama;
          matches.push({ row: i + 1, id: matchId });
        }
      }
      return matches;
    },
    [baseRows]
  );

  const startMatches = useMemo(() => findIdMatches(startIdQuery), [findIdMatches, startIdQuery]);
  const endMatches = useMemo(() => findIdMatches(endIdQuery), [findIdMatches, endIdQuery]);

  useEffect(() => {
    if (startMatchIdx >= startMatches.length) setStartMatchIdx(0);
  }, [startMatches.length, startMatchIdx]);

  useEffect(() => {
    if (endMatchIdx >= endMatches.length) setEndMatchIdx(0);
  }, [endMatches.length, endMatchIdx]);

  const startMatch = startMatches.length ? startMatches[Math.min(startMatchIdx, startMatches.length - 1)] : null;
  const endMatch = endMatches.length ? endMatches[Math.min(endMatchIdx, endMatches.length - 1)] : null;

  const displayRows = useMemo(() => {
    if (!baseRows.length) return [];
    const startTrimmed = startIdQuery.trim();
    const endTrimmed = endIdQuery.trim();

    if (!startTrimmed && !endTrimmed) return baseRows;

    let startIdx = 0;
    let endIdx = baseRows.length - 1;

    if (startTrimmed && startMatch) {
      startIdx = startMatch.row; // ID AWAL: start range AFTER the matched row
    }
    if (endTrimmed && endMatch) {
      endIdx = endMatch.row - 1; // ID AKHIR: include up to matched row
    }

    if (startIdx > endIdx) return [];
    return baseRows.slice(Math.max(0, startIdx), Math.min(baseRows.length, endIdx + 1));
  }, [baseRows, startIdQuery, startMatch, endIdQuery, endMatch]);

  const totalAmount = useMemo(() => {
    return displayRows.reduce((sum, r) => sum + r.rawAmount, 0);
  }, [displayRows]);

  const handleCopyDocTrx = () => {
    if (displayRows.length === 0) {
      toast.error("Belum ada data untuk di-copy.");
      return;
    }

    const tsvContent = displayRows.map((r) => rowToDocTrxArr(r).join("\t")).join("\n");
    navigator.clipboard.writeText(tsvContent).then(() => {
      setIsCopied(true);
      toast.success(
        `✅ ${displayRows.length} baris dicopy ke Doc TRX! (Siap paste).`
      );
      setTimeout(() => setIsCopied(false), 2500);
    });
  };

  const handleCopySingleRow = (row: QrisAjaibOzzoRow, idx: number) => {
    const tsv = rowToDocTrxArr(row).join("\t");
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedRowIdx(idx);
      toast.success(`Baris #${idx + 1} (${row.nama} - ${row.withdrawal}) disalin!`);
      setTimeout(() => setCopiedRowIdx(null), 2000);
    });
  };

  const handleDownloadExcel = () => {
    if (displayRows.length === 0) {
      toast.error("Belum ada data untuk diunduh.");
      return;
    }

    const headers10 = [
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
    ];

    const data = [headers10, ...displayRows.map((r) => rowToDocTrxArr(r))];
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
    setStartIdQuery("");
    setStartMatchIdx(0);
    setEndIdQuery("");
    setEndMatchIdx(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.info("Area input dan hasil telah dibersihkan.");
  };

  return (
    <div className="flex flex-col gap-6 w-full text-[#23321B]">
      {/* ── HEADER CARD ── */}
      <div className="p-6 rounded-2xl neu-card border-2 border-[#D5C988] bg-[#FDFBD4] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl clay-btn-green flex items-center justify-center shrink-0 shadow-md">
            <QrCode size={28} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#23321B]">
                WD QRIS AJAIB OZZO
              </h2>
              <span className="px-3 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border border-[#74A355]/40 bg-[#74A355]/15 text-[#74A355]">
                EXCEL PARSER (.XLS / .XLSX)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#596B4F] mt-1 font-extrabold">
              Import file mentah penarikan PlayerWithdrawalPG (.xls / .xlsx) dan konversi ke 10 Kolom Doc TRX
            </p>
          </div>
        </div>

        {/* SUB & KODE BANK inputs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl neu-inset border border-[#E8E2B5]">
            <Tag size={14} className="text-[#74A355]" />
            <span className="text-[11px] font-black uppercase text-[#596B4F] tracking-wider">
              SUB:
            </span>
            <input
              type="text"
              value={subValue}
              onChange={(e) => onSubChange(e.target.value)}
              placeholder="BOT / OZZO"
              className="w-24 px-2 py-1 rounded-lg bg-[#FDFBD4] border border-[#E8E2B5] text-xs font-black text-[#23321B] text-center uppercase focus:outline-none focus:ring-1 focus:ring-[#74A355]"
            />
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl neu-inset border border-[#E8E2B5]">
            <Building2 size={14} className="text-[#74A355]" />
            <span className="text-[11px] font-black uppercase text-[#596B4F] tracking-wider">
              KODE BANK:
            </span>
            <input
              type="text"
              value={kodeBankValue}
              onChange={(e) => onKodeBankChange(e.target.value)}
              placeholder="WD QRIS AJAIB"
              className="w-36 px-2 py-1 rounded-lg bg-[#FDFBD4] border border-[#E8E2B5] text-xs font-black text-[#74A355] text-center uppercase focus:outline-none focus:ring-1 focus:ring-[#74A355]"
            />
          </div>
        </div>
      </div>

      {/* ── INPUT SECTION (FILE UPLOAD + SUMMARY & RANGE CONTROLS) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Upload & Textarea */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          {/* File Upload Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-6 rounded-2xl neu-inset border-2 border-dashed border-[#74A355]/40 hover:border-[#74A355] bg-[#74A355]/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group text-center"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-xl clay-btn-green flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
              <FileSpreadsheet size={24} className="text-white" />
            </div>
            <div>
              <span className="text-sm font-black text-[#23321B] block">
                {fileName ? `📄 ${fileName}` : "SERET & LEPAS FILE EXCEL (.XLSX, .XLS, .CSV) DI SINI"}
              </span>
              <span className="text-xs text-[#596B4F] font-bold mt-1 block">
                Otomatis membaca Player, Player Bank, Player Acct Name, Player Acct No, Transaction ID, & Amount
              </span>
            </div>
            <button
              type="button"
              className="clay-btn-green px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-sm transition cursor-pointer"
            >
              [ PILIH FILE EXCEL ]
            </button>
          </div>

          {/* Text Area Copy/Paste Fallback */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-[#596B4F] flex items-center gap-2">
                <FileText size={14} className="text-[#74A355]" />
                <span>ATAU PASTE TABEL / TEXT DI SINI</span>
              </label>
              {inputText && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] font-black text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition-all flex items-center gap-1 cursor-pointer"
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
                rows={3}
                className="w-full p-4 rounded-2xl neu-inset border border-[#E8E2B5] text-[#23321B] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#74A355] resize-y transition-all shadow-inner leading-relaxed"
              />
              {isProcessing && (
                <div className="absolute inset-0 rounded-2xl bg-[#FDFBD4]/80 backdrop-blur-sm flex items-center justify-center gap-2 text-[#74A355]">
                  <Loader2 className="animate-spin" size={20} />
                  <span className="text-xs font-black">Membaca Data Excel...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Summary Box & Range Picker */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="p-5 rounded-2xl neu-card border-2 border-[#D5C988] bg-[#FDFBD4] flex flex-col gap-4 shadow-md">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#596B4F] flex items-center gap-2">
              <Sparkles size={14} className="text-[#74A355]" />
              <span>RINGKASAN WD QRIS AJAIB OZZO</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-[#D5C988] bg-[#FFFEE6] flex flex-col">
                <span className="text-[10px] uppercase font-black text-[#596B4F]">Total Tiket</span>
                <span className="text-xl font-black text-[#23321B] mt-1 font-mono">
                  {displayRows.length} <span className="text-xs font-normal text-[#596B4F]">baris</span>
                </span>
              </div>

              <div className="p-3.5 rounded-xl border border-[#D5C988] bg-[#FFFEE6] flex flex-col">
                <span className="text-[10px] uppercase font-black text-[#596B4F]">Sub</span>
                <span className="text-base font-black text-[#74A355] mt-1 uppercase font-mono truncate">
                  {subValue}
                </span>
              </div>

              <div className="p-3.5 rounded-xl border border-[#D5C988] bg-[#FFFEE6] flex flex-col">
                <span className="text-[10px] uppercase font-black text-[#596B4F]">Kode Bank</span>
                <span className="text-base font-black text-[#74A355] mt-1 uppercase font-mono truncate">
                  {kodeBankValue}
                </span>
              </div>

              <div className="p-3.5 rounded-xl border border-[#D5C988] bg-[#FFFEE6] flex flex-col">
                <span className="text-[10px] uppercase font-black text-[#596B4F]">Total Nominal</span>
                <span className="text-base font-black text-[#74A355] mt-1 font-mono truncate">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>

            {/* Range Pickers: ID Awal & ID Akhir */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <IdRangePicker
                label="ID AWAL"
                accent="emerald"
                icon={<Flag size={12} />}
                query={startIdQuery}
                onQueryChange={setStartIdQuery}
                matches={startMatches}
                matchIdx={startMatchIdx}
                onCycle={(dir) => setStartMatchIdx((prev) => (prev + dir + startMatches.length) % (startMatches.length || 1))}
                onClear={() => { setStartIdQuery(""); setStartMatchIdx(0); }}
                inputCls="neu-inset rounded-lg border border-[#E8E2B5] bg-[#FFFEE6] text-[#23321B]"
                testidPrefix="start"
                placeholder="paste atau ketik ID Transaksi / SN..."
                excludeMarked
              />

              <IdRangePicker
                label="ID AKHIR"
                accent="rose"
                icon={<FlagOff size={12} />}
                query={endIdQuery}
                onQueryChange={setEndIdQuery}
                matches={endMatches}
                matchIdx={endMatchIdx}
                onCycle={(dir) => setEndMatchIdx((prev) => (prev + dir + endMatches.length) % (endMatches.length || 1))}
                onClear={() => { setEndIdQuery(""); setEndMatchIdx(0); }}
                inputCls="neu-inset rounded-lg border border-[#E8E2B5] bg-[#FFFEE6] text-[#23321B]"
                testidPrefix="end"
                placeholder="paste atau ketik ID Transaksi / SN..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyDocTrx}
                  disabled={displayRows.length === 0}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-xs sm:text-sm transition-all duration-200 cursor-pointer shadow-md ${
                    displayRows.length > 0
                      ? isCopied
                        ? "bg-emerald-600 text-white"
                        : "clay-btn-green text-white"
                      : "neu-flat border border-[#E8E2B5] text-[#596B4F]/50 cursor-not-allowed"
                  }`}
                >
                  {isCopied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{isCopied ? "BERHASIL DISALIN!" : "SALIN KE DOC TRX"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  disabled={displayRows.length === 0}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-xs sm:text-sm border transition-all cursor-pointer ${
                    displayRows.length > 0
                      ? "neu-flat border border-[#74A355]/40 text-[#74A355] hover:bg-[#74A355]/10"
                      : "neu-flat border border-[#E8E2B5] text-[#596B4F]/50 cursor-not-allowed"
                  }`}
                >
                  <Download size={16} />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 1: SPREADSHEET TSV OUTPUT TABLE (KOLOM A S/D J) — FEATURED MAIN TABLE ── */}
      {displayRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#23321B] flex items-center gap-2">
              <ListOrdered size={16} className="text-[#74A355]" />
              <span>HASIL OUTPUT SPREADSHEET (KOLOM A S/D J)</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#74A355] text-white shadow-sm">
                UTAMA / FINAL
              </span>
            </h3>
            <button
              type="button"
              onClick={handleCopyDocTrx}
              className="clay-btn-green px-3.5 py-1.5 rounded-xl text-xs font-black text-white hover:brightness-110 flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Copy size={13} />
              <span>Salin Ke Doc TRX</span>
            </button>
          </div>

          <div className="w-full overflow-x-auto rounded-2xl neu-card border-2 border-[#D5C988] bg-[#FDFBD4] shadow-md">
            <table className="w-full text-left text-xs text-[#23321B] border-collapse font-mono">
              <thead>
                <tr className="bg-[#E8E2B5] border-b border-[#D5C988] text-[11px] font-black text-[#23321B] uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-10">#</th>
                  <th className="py-3 px-3">A: NAMA</th>
                  <th className="py-3 px-3">B: NO. REKENING</th>
                  <th className="py-3 px-3">C: USER ID</th>
                  <th className="py-3 px-3 text-center">D: SUB</th>
                  <th className="py-3 px-3 text-center">E: KODE</th>
                  <th className="py-3 px-3 text-right">G: WITHDRAWAL</th>
                  <th className="py-3 px-3">I: KETERANGAN / SN</th>
                  <th className="py-3 px-3 text-center">J: KODE BANK</th>
                  <th className="py-3 px-3 text-center w-16">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2B5]">
                {displayRows.map((row, idx) => (
                  <tr
                    key={`out-ajaib-${row.keterangan}-${idx}`}
                    className="hover:bg-[#FFFEE6] transition-colors group"
                  >
                    <td className="py-3 px-3 text-center font-mono text-[#596B4F] text-[11px] font-black">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 font-black text-[#23321B] uppercase whitespace-nowrap">
                      {row.nama || <span className="text-[#596B4F]">-</span>}
                    </td>
                    <td className="py-3 px-3 font-mono font-black text-[#74A355] whitespace-nowrap">
                      {row.nomorRekening || <span className="text-[#596B4F]">-</span>}
                    </td>
                    <td className="py-3 px-3 font-mono text-[#74A355] font-black whitespace-nowrap">
                      {row.userId || <span className="text-[#596B4F]">-</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-[#74A355]/15 text-[#74A355] font-mono font-black text-[10px] border border-[#74A355]/30">
                        {row.sub || "BOT"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 font-mono font-black text-[10px] border border-rose-300">
                        {row.kodeTransaksi || "WD"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-[#74A355] whitespace-nowrap">
                      {row.withdrawal}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[#596B4F] whitespace-nowrap">
                      {row.keterangan || <span className="text-[#596B4F]">-</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-[#74A355]/15 text-[#74A355] font-mono font-black text-[10px] border border-[#74A355]/30">
                        {row.kodeBank || "WD QRIS AJAIB"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleCopySingleRow(row, idx)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          copiedRowIdx === idx
                            ? "bg-[#74A355] border-[#74A355] text-white"
                            : "neu-flat border-[#E8E2B5] text-[#596B4F] hover:text-[#23321B]"
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

      {/* ── STEP 2: RAW EXCEL MATRIX TABLE (COMPACT / COLLAPSIBLE SECONDARY VIEW) ── */}
      {displayRows.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[#D5C988]/50">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowRawMatrix((v) => !v)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#596B4F] hover:text-[#23321B] transition cursor-pointer"
            >
              <TableProperties size={14} className="text-[#74A355]" />
              <span>DATA MENTAH EXCEL (RAW MATRIX)</span>
              <span className="text-[10px] font-bold text-[#596B4F] bg-[#E8E2B5] px-2 py-0.5 rounded-full">
                {displayRows.length} baris
              </span>
              {showRawMatrix ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              type="button"
              onClick={() => setShowRawMatrix((v) => !v)}
              className="text-[11px] font-extrabold text-[#74A355] hover:underline flex items-center gap-1 cursor-pointer"
            >
              {showRawMatrix ? "Ciutkan Tampilan" : "Pratinjau Data Mentah (Scroll Box)"}
            </button>
          </div>

          {showRawMatrix && (
            <div className="w-full max-h-52 overflow-y-auto rounded-xl border border-[#D5C988] bg-[#FFFEE6] p-1 shadow-inner">
              <table className="w-full text-left text-[11px] text-[#23321B] border-collapse font-mono">
                <thead>
                  <tr className="bg-[#E8E2B5]/70 border-b border-[#D5C988] text-[10px] font-black text-[#23321B] uppercase tracking-wider">
                    <th className="py-1.5 px-2 text-center w-8">No.</th>
                    <th className="py-1.5 px-2">Date / Request</th>
                    <th className="py-1.5 px-2">Transaction ID / SN</th>
                    <th className="py-1.5 px-2">Nama Member / Rekening</th>
                    <th className="py-1.5 px-2">User ID</th>
                    <th className="py-1.5 px-2">Payment Method</th>
                    <th className="py-1.5 px-2 text-right">Amount (WD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2B5]/40">
                  {displayRows.map((row, idx) => (
                    <tr
                      key={`ajaib-raw-${row.keterangan}-${idx}`}
                      className="hover:bg-[#FDFBD4] transition-colors font-sans"
                    >
                      <td className="py-1.5 px-2 text-center font-mono text-[#596B4F] text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-[10px] text-[#23321B] whitespace-nowrap">
                        {row.date || "-"}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-[10px] text-[#74A355] whitespace-nowrap font-bold">
                        {row.keterangan || "-"}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <span className="font-bold text-[#23321B] uppercase">{row.nama || "-"}</span>{" "}
                        <span className="text-[10px] font-mono text-[#74A355]">({row.nomorRekening})</span>
                      </td>
                      <td className="py-1.5 px-2 font-mono font-bold text-[#74A355] whitespace-nowrap text-[10px]">
                        {row.userId || "-"}
                      </td>
                      <td className="py-1.5 px-2 text-[#596B4F] whitespace-nowrap text-[10px]">
                        {row.paymentMethod || "-"}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-[#74A355] whitespace-nowrap text-[11px]">
                        {row.withdrawal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
