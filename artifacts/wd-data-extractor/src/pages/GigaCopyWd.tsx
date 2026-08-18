import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUpFromLine,
  Banknote,
  Check,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  FileText,
  Layers,
  ListOrdered,
  Loader2,
  Sparkles,
  TableProperties,
  Tag,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useCallback, useMemo, useRef, useState } from "react";

// Reuse clipboard HTML-table reader from GigaCopyDpHoki
import { htmlTableToGrid, sortByDateAsc } from "./GigaCopyDpHoki";

export interface GigaWdRow {
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
  brand: "API22" | "PIN88" | "UNKNOWN";
  date: string;
  ip: string;
  fundMethod: string;
  status: string;
  rawAmount: number;
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

export const SAMPLE_TEXT_API22 = `1
2026-08-13 18:29:22182.2.176.125
Game Wallet
[01J9G06a7daa923de89](https://giga5-ns3-admin.net/transactions/withdrawalform/01J9G06a7daa923de89)
apip / DANA081235908910
First Time
[somay345](https://giga5-ns3-admin.net/member_details/GGIABAC01J9G)
E-wallet / DANA
apip
081235908910
In Progess
121,000.00`;

export const SAMPLE_TEXT_PIN88 = `1
2026-08-13 17:02:02 157.10.107.18
Game Wallet
[00MWM06a7d961abfa82](https://giga2-ns3-admin.net/transactions/t_withdrawalform/00MWM06a7d961abfa82)
Rahmawati oktaviani / BCA1570288373
[meyra8](https://giga2-ns3-admin.net/member_details/DGAABAF00MWM)2
Bank / BCA
Quick Withdraw -rahmawati oktaviani
1570288373
Confirmed
68,000.00
2026-08-13 17:05:25`;

const INPUT_GUIDANCE =
  "Paste data form Withdrawal dari panel Giga (API22 / PIN88). Sistem otomatis memetakan kolom secara presisi (Nama, Nomor Rekening, User ID, Withdrawal) tanpa tertukar dengan ID Transaksi / IP.";

function rowToArr(row: GigaWdRow): string[] {
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

function normalizeAmount(value: string): string {
  return value.trim().replace(/\.00$/, "");
}

function formatCurrency(value: number): string {
  return "Rp " + value.toLocaleString("id-ID");
}

const KNOWN_BANKS = [
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
  "PANIN",
  "BTN",
  "MAYBANK",
  "BTPN",
  "JENIUS",
];

const BADGE_PATTERNS = [
  /^First\s*Time$/i,
  /^Quick\s*Withdraw.*$/i,
  /^Admin\s*Deposit.*$/i,
  /^AF[A-Z0-9]+$/i,
  /^New$/i,
  /^In\s*Progess$/i,
  /^Confirmed$/i,
  /^Reject$/i,
  /^Confirm$/i,
  /^Game\s*Wallet$/i,
  /^E-wallet(\s*\/\s*[A-Za-z0-9]+)?$/i,
  /^Bank(\s*\/\s*[A-Za-z0-9]+)?$/i,
  /^\d{4}-\d{2}-\d{2}/, // Date
  /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // IP
  /^https?:\/\//i,
  /^\d+$/, // Plain row numbers
];

function isBadgeOrGarbage(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^0[01][0-9A-Za-z]{15,25}$/.test(trimmed)) return true; // Trx ID
  if (trimmed.toLowerCase().includes("game wallet")) return true;
  if (trimmed.toLowerCase().includes("giga") && trimmed.toLowerCase().includes(".net")) return true;
  return BADGE_PATTERNS.some((p) => p.test(trimmed));
}

export function detectBrandFromText(text: string): "API22" | "PIN88" | "UNKNOWN" {
  const lower = text.toLowerCase();
  if (lower.includes("ggiabac")) return "API22";
  if (lower.includes("dgaabaf")) return "PIN88";
  if (lower.includes("giga5-ns3-admin.net") || lower.includes("giga5")) return "API22";
  if (lower.includes("giga2-ns3-admin.net") || lower.includes("giga2")) return "PIN88";
  if (lower.includes("01aau") || lower.includes("01j9g") || lower.includes("01j91") || lower.includes("01hgv") || lower.includes("01j5l")) return "API22";
  if (lower.includes("00mwm") || lower.includes("009f1") || lower.includes("0072z") || lower.includes("00hzs")) return "PIN88";
  return "UNKNOWN";
}

/**
 * Extracts Transaction ID safely
 */
function extractTrxId(blockText: string): string {
  // Look for 18-22 char alphanumeric token starting with 00 or 01
  const m1 = blockText.match(/\[(0[01][0-9A-Za-z]{16,22})\]/);
  if (m1) return m1[1];
  const m2 = blockText.match(/\b(0[01][0-9A-Za-z]{16,22})\b/);
  if (m2) return m2[1];
  const m3 = blockText.match(/withdrawalform\/(0[01][0-9A-Za-z]{16,22})/i);
  if (m3) return m3[1];
  return "";
}

/**
 * Extracts and cleans username safely (never confuses with Trx ID)
 */
function extractCleanUsername(blockText: string, lines: string[], trxId: string): string {
  // Method 1: Check lines containing member_details
  for (const line of lines) {
    if (line.includes("member_details")) {
      let s = line
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/[\[\]\(\)]/g, "")
        .trim();
      s = s.replace(/New$/i, "").replace(/^New/i, "");
      s = s.replace(/First\s*Time/gi, "").trim();
      if (s && s.length >= 3 && s !== trxId && !s.includes("/")) return s;
    }
  }

  // Method 2: Regex match on member_details URL
  const mdMatch = blockText.match(/\[([^\]]+)\]\(https?:\/\/[^\)]*member_details[^\)]*\)/i);
  if (mdMatch) {
    let u = mdMatch[1].replace(/New$/i, "").trim();
    if (u && u !== trxId) return u;
  }

  // Method 3: Clean line scan between Account line and Fund Method
  let foundAccountLine = false;
  for (const rawLine of lines) {
    const cleanLine = rawLine.replace(/https?:\/\/\S+/gi, "").replace(/[\[\]\(\)]/g, "").trim();
    if (cleanLine.includes("/") && KNOWN_BANKS.some((b) => cleanLine.toUpperCase().includes(b))) {
      foundAccountLine = true;
      continue;
    }
    if (foundAccountLine) {
      if (isBadgeOrGarbage(cleanLine)) continue;
      if (cleanLine === trxId) continue;
      if (cleanLine.length >= 3 && cleanLine.length <= 25 && /^[a-zA-Z0-9_]+$/.test(cleanLine)) {
        return cleanLine;
      }
    }
  }

  return "";
}

/**
 * Extracts Name, Bank, and Account Number cleanly
 */
function parseAccountInfo(
  blockText: string,
  lines: string[],
  trxId: string
): {
  nama: string;
  nomorRekening: string;
  bankName: string;
  accNo: string;
} {
  let nama = "";
  let bankName = "";
  let accNo = "";

  // 1. Scan for line with slash and bank name: e.g. "apip / DANA081235908910"
  for (const rawLine of lines) {
    // Strip URLs first to prevent URL slashes from triggering
    const lineWithoutUrl = rawLine.replace(/https?:\/\/\S+/gi, "").replace(/[\[\]]/g, "").trim();
    if (!lineWithoutUrl) continue;
    if (lineWithoutUrl.toLowerCase().includes("game wallet")) continue;
    if (lineWithoutUrl.toLowerCase().includes("e-wallet") || lineWithoutUrl.toLowerCase().includes("bank /")) continue;

    if (lineWithoutUrl.includes("/")) {
      const parts = lineWithoutUrl.split("/");
      const left = parts[0].trim();
      const right = parts[1]?.trim() || "";

      // Check if right side contains a recognized bank
      const hasBank = KNOWN_BANKS.some((b) => right.toUpperCase().includes(b));
      if (hasBank && left && left !== trxId && !isBadgeOrGarbage(left)) {
        nama = left.toUpperCase();

        // Extract bank name and account digits from right side
        for (const b of KNOWN_BANKS) {
          if (right.toUpperCase().includes(b)) {
            bankName = b;
            break;
          }
        }
        const digitMatch = right.match(/(\d{6,25})/);
        if (digitMatch) accNo = digitMatch[1].trim();
        break;
      }
    }
  }

  // 2. If nama is still missing, scan Bank Details section:
  // In Giga panel, after Fund Method (e.g. "E-wallet / DANA"), the next lines are Name and AccNo
  if (!nama || !accNo) {
    let foundFundMethod = false;
    for (const rawLine of lines) {
      const cleanLine = rawLine.replace(/https?:\/\/\S+/gi, "").replace(/[\[\]]/g, "").trim();
      if (/^(E-wallet\s*\/\s*|Bank\s*\/\s*)/i.test(cleanLine)) {
        foundFundMethod = true;
        continue;
      }
      if (foundFundMethod) {
        if (isBadgeOrGarbage(cleanLine) || cleanLine === trxId) continue;
        if (!nama && /^[A-Za-z\s\.\,\'\-]+$/.test(cleanLine) && cleanLine.length > 2) {
          nama = cleanLine.toUpperCase();
        } else if (!accNo && /^\d{6,25}$/.test(cleanLine)) {
          accNo = cleanLine;
        }
      }
    }
  }

  // 3. Extract bank name from Fund Method if not already resolved
  if (!bankName) {
    for (const b of KNOWN_BANKS) {
      if (blockText.toUpperCase().includes(b)) {
        bankName = b;
        break;
      }
    }
  }

  // 4. Extract Account Number if still missing
  if (!accNo) {
    const digitMatch = blockText.match(/\b(\d{8,25})\b/);
    if (digitMatch) accNo = digitMatch[1];
  }

  // Cleanup nama: ensure it does NOT contain IP or Game Wallet
  if (nama) {
    nama = nama.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, "");
    nama = nama.replace(/GAME\s*WALLET/gi, "");
    nama = nama.replace(/0[01][0-9A-Z]{15,22}/gi, "");
    nama = nama.trim().toUpperCase();
  }

  const nomorRekening = bankName && accNo ? `${bankName} ${accNo}` : accNo || bankName || "";

  return { nama, nomorRekening, bankName, accNo };
}

/**
 * Grid-based Parser for HTML table paste
 */
function parseGigaWdGrid(grid: string[][], subValue: string): GigaWdRow[] {
  if (!grid.length) return [];

  let headerRowIdx = -1;
  let colTrxDate = -1;
  let colTrxId = -1;
  let colAccountName = -1;
  let colUsername = -1;
  let colFundMethod = -1;
  let colBankDetails = -1;
  let colDebit = -1;
  let colStatus = -1;

  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const row = grid[r].map((c) => c.toLowerCase());
    const hasTrx = row.some((c) => c.includes("transaction") || c.includes("debit") || c.includes("account"));
    if (hasTrx) {
      headerRowIdx = r;
      for (let c = 0; c < row.length; c++) {
        const text = row[c];
        if (text.includes("transaction date") || text.includes("date")) colTrxDate = c;
        else if (text.includes("transaction id") || text.includes("trx id")) colTrxId = c;
        else if (text.includes("account name")) colAccountName = c;
        else if (text.includes("username") || text.includes("user")) colUsername = c;
        else if (text.includes("fund method") || text.includes("method")) colFundMethod = c;
        else if (text.includes("bank details") || text.includes("details")) colBankDetails = c;
        else if (text.includes("debit") || text.includes("amount") || text.includes("nominal")) colDebit = c;
        else if (text.includes("status")) colStatus = c;
      }
      break;
    }
  }

  const results: GigaWdRow[] = [];
  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length < 3) continue;

    const rowText = row.join(" ");
    const brand = detectBrandFromText(rowText);

    // Extract Date & IP
    let date = "";
    let ip = "";
    const dateCell = colTrxDate >= 0 ? row[colTrxDate] : rowText;
    const dateMatch = dateCell.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/);
    if (dateMatch) date = dateMatch[0];
    const ipMatch = dateCell.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    if (ipMatch) ip = ipMatch[0];

    // Extract Transaction ID
    let trxId = "";
    if (colTrxId >= 0 && row[colTrxId]) {
      trxId = extractTrxId(row[colTrxId]);
    }
    if (!trxId) trxId = extractTrxId(rowText);

    // Extract Account Info
    const accCell = colAccountName >= 0 ? row[colAccountName] : "";
    const bankDetailsCell = colBankDetails >= 0 ? row[colBankDetails] : "";
    const { nama, nomorRekening } = parseAccountInfo(accCell, [bankDetailsCell, ...row], trxId);

    // Extract Username
    let username = "";
    if (colUsername >= 0 && row[colUsername]) {
      username = extractCleanUsername(row[colUsername], row, trxId);
    }
    if (!username) {
      username = extractCleanUsername(rowText, row, trxId);
    }

    // Fund Method
    const fundMethod = colFundMethod >= 0 ? row[colFundMethod].trim() : "";

    // Status
    let status = colStatus >= 0 ? row[colStatus].trim() : "";
    if (!status) {
      if (/in\s*progess/i.test(rowText)) status = "In Progess";
      else if (/confirmed/i.test(rowText)) status = "Confirmed";
      else if (/reject/i.test(rowText)) status = "Rejected";
    }

    // Extract Amount (Debit)
    let rawAmount = 0;
    let withdrawal = "";
    if (colDebit >= 0 && row[colDebit]) {
      const amtMatch = row[colDebit].match(/[\d,]+(?:\.\d{2})?/);
      if (amtMatch) {
        withdrawal = normalizeAmount(amtMatch[0]);
        rawAmount = Number(withdrawal.replace(/,/g, "")) || 0;
      }
    }
    if (!withdrawal) {
      const amtMatches = Array.from(rowText.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g));
      if (amtMatches.length > 0) {
        const lastAmt = amtMatches[amtMatches.length - 1][1];
        withdrawal = normalizeAmount(lastAmt);
        rawAmount = Number(withdrawal.replace(/,/g, "")) || 0;
      }
    }

    if (username || trxId || nama) {
      results.push({
        nama,
        nomorRekening,
        userId: username,
        sub: subValue,
        kodeTransaksi: "WD",
        deposit: "",
        withdrawal,
        dpPulsa: "",
        keterangan: trxId,
        kodeBank: "",
        saldoAkhir: "",
        jamInput: "",
        inputKodeBank: "",
        brand,
        date,
        ip,
        fundMethod,
        status: status || "In Progess",
        rawAmount,
      });
    }
  }

  return results;
}

/**
 * Text-based Parser for plain-text / markdown pastes
 */
function parseGigaWdText(rawText: string, subValue: string): GigaWdRow[] {
  if (!rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (/^\d{1,4}$/.test(line) && currentBlock.length > 2) {
      blocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const results: GigaWdRow[] = [];

  for (const block of blocks) {
    const blockText = block.join("\n");
    const brand = detectBrandFromText(blockText);

    // Date & IP
    let date = "";
    let ip = "";
    const dateMatch = blockText.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/);
    if (dateMatch) date = dateMatch[0];
    const ipMatch = blockText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    if (ipMatch) ip = ipMatch[0];

    // Transaction ID
    const trxId = extractTrxId(blockText);

    // Username
    const username = extractCleanUsername(blockText, block, trxId);

    // Account Name & Number
    const { nama, nomorRekening } = parseAccountInfo(blockText, block, trxId);

    // Fund Method
    let fundMethod = "";
    if (/E-wallet\s*\/\s*DANA/i.test(blockText)) fundMethod = "E-wallet / DANA";
    else if (/E-wallet\s*\/\s*GOPAY/i.test(blockText)) fundMethod = "E-wallet / GOPAY";
    else if (/Bank\s*\/\s*BCA/i.test(blockText)) fundMethod = "Bank / BCA";
    else if (/Bank\s*\/\s*BRI/i.test(blockText)) fundMethod = "Bank / BRI";
    else if (/Bank\s*\/\s*BNI/i.test(blockText)) fundMethod = "Bank / BNI";
    else if (/Bank\s*\/\s*MANDIRI/i.test(blockText)) fundMethod = "Bank / MANDIRI";
    else if (/Bank\s*\/\s*SEABANK/i.test(blockText)) fundMethod = "Bank / SEABANK";

    // Status
    let status = "In Progess";
    if (/Confirmed/i.test(blockText)) status = "Confirmed";
    else if (/Reject/i.test(blockText)) status = "Rejected";

    // Amount (Debit/Withdrawal)
    let withdrawal = "";
    let rawAmount = 0;
    for (let i = block.length - 1; i >= 0; i--) {
      const line = block[i];
      const match = line.match(/^(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)$/);
      if (match) {
        withdrawal = normalizeAmount(match[1]);
        rawAmount = Number(withdrawal.replace(/,/g, "")) || 0;
        break;
      }
    }

    if (!withdrawal) {
      const amtMatch = blockText.match(/(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/);
      if (amtMatch) {
        withdrawal = normalizeAmount(amtMatch[1]);
        rawAmount = Number(withdrawal.replace(/,/g, "")) || 0;
      }
    }

    if (username || trxId || nama) {
      results.push({
        nama,
        nomorRekening,
        userId: username,
        sub: subValue,
        kodeTransaksi: "WD",
        deposit: "",
        withdrawal,
        dpPulsa: "",
        keterangan: trxId,
        kodeBank: "",
        saldoAkhir: "",
        jamInput: "",
        inputKodeBank: "",
        brand,
        date,
        ip,
        fundMethod,
        status,
        rawAmount,
      });
    }
  }

  return results;
}

export default function GigaCopyWd() {
  const [inputText, setInputText] = useState("");
  const [subValue, setSubValue] = useState("PNG");
  const [brandOverride, setBrandOverride] = useState<"AUTO" | "API22" | "PIN88">("AUTO");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedRows, setParsedRows] = useState<GigaWdRow[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Parse input whenever text changes or sub changes
  const handleParse = useCallback(
    (text: string, customSub: string, overrideBrand: "AUTO" | "API22" | "PIN88") => {
      if (!text.trim()) {
        setParsedRows([]);
        return;
      }

      setIsProcessing(true);

      let rows: GigaWdRow[] = [];
      if (text.includes("<table") || text.includes("<tr") || text.includes("\t")) {
        const grid = htmlTableToGrid(text);
        if (grid.length > 0) {
          rows = parseGigaWdGrid(grid, customSub);
        }
      }

      if (rows.length === 0) {
        rows = parseGigaWdText(text, customSub);
      }

      // Apply brand override if set
      if (overrideBrand !== "AUTO") {
        rows = rows.map((r) => ({ ...r, brand: overrideBrand }));
      }

      // Chronological sort if dates are present
      rows = sortByDateAsc(rows);

      setParsedRows(rows);
      setIsProcessing(false);
    },
    []
  );

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    const detected = detectBrandFromText(val);
    let currentSub = subValue;
    if (detected === "API22" && subValue === "MJ") {
      currentSub = "NG+EA";
      setSubValue("NG+EA");
    } else if (detected === "PIN88" && subValue === "NG+EA") {
      currentSub = "MJ";
      setSubValue("MJ");
    }

    handleParse(val, currentSub, brandOverride);
  };

  const onSubChange = (newSub: string) => {
    setSubValue(newSub);
    setParsedRows((prev) => prev.map((r) => ({ ...r, sub: newSub })));
  };

  const onBrandOverrideChange = (brand: "AUTO" | "API22" | "PIN88") => {
    setBrandOverride(brand);
    handleParse(inputText, subValue, brand);
  };

  // Clipboard Paste handler for rich HTML tables
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (html && (html.includes("<table") || html.includes("<tr"))) {
      const grid = htmlTableToGrid(html);
      if (grid.length > 0) {
        e.preventDefault();
        const textFallback = e.clipboardData.getData("text/plain");
        setInputText(textFallback || html);
        const rows = parseGigaWdGrid(grid, subValue);
        const brand = brandOverride !== "AUTO" ? brandOverride : rows[0]?.brand || "UNKNOWN";
        setParsedRows(rows.map((r) => ({ ...r, brand })));
        toast.success(`Berhasil mengekstrak ${rows.length} baris form WD dari tabel HTML!`);
        return;
      }
    }
  };

  // Detected overall brand summary
  const detectedBrandSummary = useMemo(() => {
    if (brandOverride !== "AUTO") return brandOverride;
    if (parsedRows.some((r) => r.brand === "API22")) return "API22";
    if (parsedRows.some((r) => r.brand === "PIN88")) return "PIN88";
    return detectBrandFromText(inputText);
  }, [brandOverride, parsedRows, inputText]);

  // Statistics
  const totalAmount = useMemo(() => {
    return parsedRows.reduce((sum, r) => sum + r.rawAmount, 0);
  }, [parsedRows]);

  // Copy Full Table as TSV to Clipboard (13 Full Columns)
  const handleCopyTSV = () => {
    if (parsedRows.length === 0) {
      toast.error("Belum ada data untuk di-copy.");
      return;
    }

    const tsvContent = parsedRows.map((r) => rowToArr(r).join("\t")).join("\n");
    navigator.clipboard.writeText(tsvContent).then(() => {
      setIsCopied(true);
      toast.success(
        `✅ ${parsedRows.length} baris WD berhasil disalin! (13 Kolom A-M siap paste ke Google Sheet).`
      );
      setTimeout(() => setIsCopied(false), 2500);
    });
  };

  // Copy Single Row TSV
  const handleCopySingleRow = (row: GigaWdRow, idx: number) => {
    const tsv = rowToArr(row).join("\t");
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedRowIdx(idx);
      toast.success(`Baris #${idx + 1} (${row.nama} - ${row.userId}) disalin!`);
      setTimeout(() => setCopiedRowIdx(null), 2000);
    });
  };

  // Download Excel
  const handleDownloadExcel = () => {
    if (parsedRows.length === 0) {
      toast.error("Belum ada data untuk diunduh.");
      return;
    }

    const data = [OUTPUT_HEADERS, ...parsedRows.map((r) => rowToArr(r))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WD_GIGA");

    const brandTag = detectedBrandSummary !== "UNKNOWN" ? detectedBrandSummary : "GIGA";
    const filename = `WD_${brandTag}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success(`File Excel ${filename} berhasil diunduh!`);
  };

  // Clear
  const handleClear = () => {
    setInputText("");
    setParsedRows([]);
    toast.info("Area input dan hasil telah dibersihkan.");
    textareaRef.current?.focus();
  };

  // Sample Loader
  const handleUseSample = (brand: "API22" | "PIN88") => {
    const text = brand === "API22" ? SAMPLE_TEXT_API22 : SAMPLE_TEXT_PIN88;
    const defaultSub = brand === "API22" ? "PNG" : "MJ";
    setInputText(text);
    setSubValue(defaultSub);
    handleParse(text, defaultSub, brand);
    toast.success(`Sample data WD ${brand} dimuat!`);
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ── HEADER CARD & BRAND INDICATOR ── */}
      <div className="relative overflow-hidden p-6 rounded-3xl glass border border-white/10 shadow-2xl bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/90 backdrop-blur-xl">
        {/* Dynamic Brand Gradient Background */}
        <div
          className={`absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-20 transition-all duration-700 pointer-events-none ${
            detectedBrandSummary === "API22"
              ? "bg-violet-500"
              : detectedBrandSummary === "PIN88"
              ? "bg-emerald-500"
              : "bg-blue-500"
          }`}
        />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg transition-all duration-300 ${
                detectedBrandSummary === "API22"
                  ? "bg-violet-600/20 border-violet-500/40 text-violet-400 shadow-violet-500/10"
                  : detectedBrandSummary === "PIN88"
                  ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-400 shadow-emerald-500/10"
                  : "bg-blue-600/20 border-blue-500/40 text-blue-400 shadow-blue-500/10"
              }`}
            >
              <ArrowUpFromLine size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  WD GIGA EXTRACTOR
                </h2>
                {/* Brand Badge */}
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border shadow-sm transition-all duration-300 ${
                    detectedBrandSummary === "API22"
                      ? "bg-violet-500/20 border-violet-400/40 text-violet-300"
                      : detectedBrandSummary === "PIN88"
                      ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                      : "bg-slate-500/20 border-slate-400/40 text-slate-300"
                  }`}
                >
                  {detectedBrandSummary === "UNKNOWN" ? "MULTI-BRAND" : detectedBrandSummary}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Ekstraksi otomatis form penarikan (Withdrawal) GIGA untuk website API22 &amp; PIN88
              </p>
            </div>
          </div>

          {/* Brand Switcher & SUB input */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* SUB input */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10">
              <Tag size={13} className="text-amber-400" />
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                KOLOM SUB:
              </span>
              <input
                type="text"
                value={subValue}
                onChange={(e) => onSubChange(e.target.value)}
                placeholder="SUB (PNG / MJ / NG+EA)"
                className="w-24 px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-xs font-bold text-amber-300 text-center uppercase focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>

            {/* Brand Toggle Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/10">
              <button
                type="button"
                onClick={() => onBrandOverrideChange("AUTO")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  brandOverride === "AUTO"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                AUTO
              </button>
              <button
                type="button"
                onClick={() => onBrandOverrideChange("API22")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  brandOverride === "API22"
                    ? "bg-violet-600 text-white shadow-sm shadow-violet-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                API22
              </button>
              <button
                type="button"
                onClick={() => onBrandOverrideChange("PIN88")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  brandOverride === "PIN88"
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                PIN88
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── INPUT SECTION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Textarea */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <FileText size={14} className="text-violet-400" />
              <span>RAW DATA WITHDRAWAL PANEL GIGA</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUseSample("API22")}
                className="text-[11px] font-bold text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1 rounded-lg border border-violet-500/20 transition-all"
              >
                Sample API22
              </button>
              <button
                type="button"
                onClick={() => handleUseSample("PIN88")}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/20 transition-all"
              >
                Sample PIN88
              </button>
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
          </div>

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={onTextChange}
              onPaste={handlePaste}
              placeholder="Paste data tabel Withdrawal dari panel Giga di sini (Mendukung Ctrl+V tabel browser langsung)..."
              rows={12}
              className="w-full p-4 rounded-2xl bg-black/40 border border-white/10 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-y transition-all shadow-inner leading-relaxed"
            />
            {isProcessing && (
              <div className="absolute inset-0 rounded-2xl bg-black/60 backdrop-blur-sm flex items-center justify-center gap-2 text-violet-400">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-xs font-bold">Memproses Data...</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
            💡 {INPUT_GUIDANCE}
          </p>
        </div>

        {/* Right: Quick Summary & Action Box */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="p-5 rounded-2xl glass border border-white/10 bg-slate-900/40 backdrop-blur-md flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <span>RINGKASAN EKSTRAKSI WD</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Stat 1: Total Rows */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Tiket WD</span>
                <span className="text-2xl font-black text-white mt-1">
                  {parsedRows.length} <span className="text-xs font-normal text-slate-400">tiket</span>
                </span>
              </div>

              {/* Stat 2: Brand Active */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col">
                <span className="text-[10px] uppercase font-bold text-slate-400">Website / Brand</span>
                <span
                  className={`text-base font-black mt-1 uppercase ${
                    detectedBrandSummary === "API22"
                      ? "text-violet-400"
                      : detectedBrandSummary === "PIN88"
                      ? "text-emerald-400"
                      : "text-slate-300"
                  }`}
                >
                  {detectedBrandSummary === "UNKNOWN" ? "Belum Terdeteksi" : detectedBrandSummary}
                </span>
              </div>

              {/* Stat 3: Total Nominal */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex flex-col col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Nominal WD</span>
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
                      : "bg-gradient-to-r from-violet-600 via-indigo-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-violet-500/25 hover:scale-[1.02]"
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

      {/* ── STEP 1: INTERMEDIATE STRUCTURED RAW MATRIX (SESUAI PANEL GIGA) ── */}
      {parsedRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <TableProperties size={14} className="text-cyan-400" />
              <span>STEP 1: TABEL BARIS TERSTRUKTUR (RAW PANEL MATRIX)</span>
            </h3>
            <span className="text-xs text-cyan-300/80 font-mono">
              {parsedRows.length} baris terpetakan otomatis
            </span>
          </div>

          <div className="w-full overflow-x-auto rounded-2xl glass border border-white/10 bg-slate-950/80 shadow-xl">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="bg-white/10 border-b border-white/10 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-10">No.</th>
                  <th className="py-3 px-3">Transaction Date / IP</th>
                  <th className="py-3 px-3">Transaction ID</th>
                  <th className="py-3 px-3">Account Name (Rekening)</th>
                  <th className="py-3 px-3">Username (User ID)</th>
                  <th className="py-3 px-3">Fund Method</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Debit (Nominal WD)</th>
                  <th className="py-3 px-3 text-center w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {parsedRows.map((row, idx) => (
                  <tr
                    key={`matrix-${row.keterangan}-${idx}`}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-3 text-center font-mono text-slate-500 text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-mono text-[11px] text-white/90">{row.date || "-"}</div>
                      <div className="text-[10px] text-cyan-400/80 font-mono">{row.ip}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-violet-300 whitespace-nowrap font-bold">
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
                      {row.fundMethod || "-"}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          row.status.toLowerCase().includes("progess")
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : row.status.toLowerCase().includes("confirmed")
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-500/20 text-slate-300 border-slate-500/30"
                        }`}
                      >
                        {row.status}
                      </span>
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
              className="text-xs font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1.5"
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
                    key={`out-${row.keterangan}-${idx}`}
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
