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

export const SAMPLE_TEXT_GIGA = `1\t2026-09-08 00:01:38
103.161.162.106
Game Wallet\t00C5K06a9eedf2f3fb8
indra saputra / DANA
082124978105
indra77
E-wallet / DANA\t
indra saputra
082124978105
In Progess
150,500.00

2\t2026-09-08 00:02:13
114.10.99.187
Game Wallet\t024EN06a9eee15ad4ff
hendra antoni / SEABANK
901033581899
First Time
salwa478
Bank / SEABANK\t
hendra antoni
901033581899
In Progess
300,000.00`;

const INPUT_GUIDANCE =
  "Paste data form Withdrawal dari panel Giga. Sistem otomatis memetakan kolom secara presisi (Nama, Nomor Rekening, User ID, Withdrawal) tanpa tertukar dengan ID Transaksi / IP.";

export function cleanTrxId(rawTrxId: string): string {
  if (!rawTrxId) return "";
  return rawTrxId.replace(/^0[0-9]/, "").trim();
}

function rowToArr(row: GigaWdRow): string[] {
  const cleanedTrxId = cleanTrxId(row.dpPulsa || row.keterangan || "");
  return [
    row.nama,
    row.nomorRekening,
    row.userId,
    row.sub,
    row.kodeTransaksi,
    row.deposit,
    row.withdrawal,
    cleanedTrxId,
    "",
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
  if (/^0[0-9][0-9A-Za-z]{15,25}$/.test(trimmed)) return true; // Trx ID
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
  
  const trxMatch = text.match(/\b(0[0-9][0-9A-Za-z]{15,22})\b/);
  if (trxMatch) {
    const trxId = trxMatch[1];
    if (trxId.startsWith("00")) return "PIN88";
    if (/^0[1-9]/.test(trxId)) return "API22";
  }

  if (lower.includes("01aau") || lower.includes("01j9g") || lower.includes("01j91") || lower.includes("01hgv") || lower.includes("01j5l")) return "API22";
  if (lower.includes("00mwm") || lower.includes("009f1") || lower.includes("0072z") || lower.includes("00hzs")) return "PIN88";
  return "UNKNOWN";
}

/**
 * Extracts Transaction ID safely
 */
function extractTrxId(blockText: string): string {
  // Look for 18-22 char alphanumeric token starting with 00, 01, 02, etc.
  const m1 = blockText.match(/\[(0[0-9][0-9A-Za-z]{16,22})\]/);
  if (m1) return m1[1];
  const m2 = blockText.match(/\b(0[0-9][0-9A-Za-z]{16,22})\b/);
  if (m2) return m2[1];
  const m3 = blockText.match(/withdrawalform\/(0[0-9][0-9A-Za-z]{16,22})/i);
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

  // 1. Scan for line with slash and bank name: e.g. "muhammad nahwan faisal / DANA" or "ahmad salim / SEABANK901721838243"
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineWithoutUrl = rawLine.replace(/https?:\/\/\S+/gi, "").replace(/[\[\]]/g, "").trim();
    if (!lineWithoutUrl) continue;
    if (lineWithoutUrl.toLowerCase().includes("game wallet")) continue;
    if (lineWithoutUrl.toLowerCase().includes("e-wallet /") || lineWithoutUrl.toLowerCase().includes("bank /")) continue;

    if (lineWithoutUrl.includes("/")) {
      const parts = lineWithoutUrl.split("/");
      const left = parts[0].trim();
      const right = parts[1]?.trim() || "";

      if (left && left !== trxId && !isBadgeOrGarbage(left)) {
        nama = left.toUpperCase();

        // Extract bank name and account digits from right side
        for (const b of KNOWN_BANKS) {
          const idx = right.toUpperCase().indexOf(b);
          if (idx !== -1) {
            bankName = b;
            const afterBank = right.slice(idx + b.length);
            const digitMatch = afterBank.match(/(\d{6,25})/);
            if (digitMatch) {
              accNo = digitMatch[1].trim();
            }
            break;
          }
        }

        if (!accNo) {
          const digitMatch = right.match(/(\d{6,25})/);
          if (digitMatch) accNo = digitMatch[1].trim();
        }

        // If accNo is still missing, check next line for account digits
        if (!accNo && lines[i + 1]) {
          const nextClean = lines[i + 1].replace(/https?:\/\/\S+/gi, "").replace(/[\[\]]/g, "").trim();
          const nextDigitMatch = nextClean.match(/^(\d{6,25})$/);
          if (nextDigitMatch) {
            accNo = nextDigitMatch[1];
          }
        }

        if (nama && (bankName || accNo)) break;
      }
    }
  }

  // 2. Scan Bank Details section fallback:
  // In Giga panel, line 1 = Name ("arifin"), line 2 = AccNo ("901721838243")
  if (!nama || !accNo) {
    let foundFundMethod = false;
    for (const rawLine of lines) {
      const cleanLine = rawLine.replace(/https?:\/\/\S+/gi, "").replace(/[\[\]]/g, "").trim();
      if (/^(E-wallet\s*\/\s*|Bank\s*\/\s*)/i.test(cleanLine)) {
        foundFundMethod = true;
        const bankPart = cleanLine.split("/")[1]?.trim();
        if (bankPart && !bankName) bankName = bankPart.toUpperCase();
        continue;
      }
      if (foundFundMethod) {
        if (isBadgeOrGarbage(cleanLine) || cleanLine === trxId) continue;
        if (!nama && /^[A-Za-z\s\.\,\'\-]+$/.test(cleanLine) && cleanLine.length >= 2) {
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

  // Cleanup nama: ensure it does NOT contain IP or Game Wallet or TrxID
  if (nama) {
    nama = nama.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, "");
    nama = nama.replace(/GAME\s*WALLET/gi, "");
    nama = nama.replace(/0[0-9][0-9A-Z]{15,22}/gi, "");
    nama = nama.trim().toUpperCase();
  }

  const nomorRekening = bankName && accNo ? `${bankName} ${accNo}` : accNo || bankName || "";

  return { nama, nomorRekening, bankName, accNo };
}

/**
 * Grid-based Parser for HTML table paste
 */
export function parseGigaWdGrid(grid: string[][], subValue: string): GigaWdRow[] {
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

    // Extract Date & IP & Jam
    let date = "";
    let jamInput = "";
    let ip = "";
    const dateCell = colTrxDate >= 0 ? row[colTrxDate] : rowText;
    const dateMatch = dateCell.match(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2})/);
    if (dateMatch) {
      date = dateMatch[0];
      jamInput = dateMatch[1];
    }
    const ipMatch = dateCell.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    if (ipMatch) ip = ipMatch[0];

    // Extract Transaction ID
    let trxId = "";
    if (colTrxId >= 0 && row[colTrxId]) {
      trxId = extractTrxId(row[colTrxId]);
    }
    if (!trxId) trxId = extractTrxId(rowText);
    const cleanedTrxId = cleanTrxId(trxId);

    // Extract Account Info
    const accCell = colAccountName >= 0 ? row[colAccountName] : "";
    const bankDetailsCell = colBankDetails >= 0 ? row[colBankDetails] : "";
    const { nama, nomorRekening } = parseAccountInfo(accCell, [bankDetailsCell, accCell, ...row], trxId);

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
        dpPulsa: cleanedTrxId,
        keterangan: "",
        kodeBank: "",
        saldoAkhir: "",
        jamInput,
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
function isBlockStartLine(line: string, nextLine: string): boolean {
  const trimmed = line.trim();
  // Case 1: Standalone row number, e.g. "1" or "2", followed by date/IP/Game Wallet on next line
  if (/^\d+$/.test(trimmed)) {
    return (
      /\d{4}-\d{2}-\d{2}/.test(nextLine) ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(nextLine) ||
      /Game\s*Wallet/i.test(nextLine) ||
      /0[0-9][0-9A-Za-z]{15,22}/.test(nextLine)
    );
  }
  // Case 2: Row number combined with tab/space and date/IP/Game Wallet on the same line, e.g. "1\t2026-09-08 00:01:38" or "2\t114.10.99.187"
  if (/^\d+[\t\s]+/.test(trimmed)) {
    return (
      /\d{4}-\d{2}-\d{2}/.test(trimmed) ||
      /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed) ||
      /Game\s*Wallet/i.test(trimmed) ||
      /0[0-9][0-9A-Za-z]{15,22}/.test(trimmed)
    );
  }
  // Case 3: Line starting directly with date/time e.g. "2026-09-09 00:13:21"
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return true;
  }
  // Case 4: Line starting directly with IP address
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Text-based Parser for plain-text / markdown pastes
 */
export function parseGigaWdText(rawText: string, subValue: string): GigaWdRow[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || "";

    if (isBlockStartLine(line, nextLine) && currentBlock.length > 2) {
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

    // Date & IP & Jam
    let date = "";
    let jamInput = "";
    let ip = "";
    const dateMatch = blockText.match(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2})/);
    if (dateMatch) {
      date = dateMatch[0];
      jamInput = dateMatch[1];
    }
    const ipMatch = blockText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    if (ipMatch) ip = ipMatch[0];

    // Transaction ID
    const trxId = extractTrxId(blockText);
    const cleanedTrxId = cleanTrxId(trxId);

    // Username
    const username = extractCleanUsername(blockText, block, trxId);

    // Account Name & Number
    const { nama, nomorRekening } = parseAccountInfo(blockText, block, trxId);

    // Fund Method
    let fundMethod = "";
    const fundMatch = blockText.match(/(?:E-wallet|Bank)\s*\/\s*([A-Za-z0-9]+)/i);
    if (fundMatch) {
      fundMethod = fundMatch[0];
    }

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
      const amtMatches = Array.from(blockText.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/g));
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
        dpPulsa: cleanedTrxId,
        keterangan: "",
        kodeBank: "",
        saldoAkhir: "",
        jamInput,
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
  const [subValue, setSubValue] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("giga_wd_sub_value") || "PNG";
    }
    return "PNG";
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedRows, setParsedRows] = useState<GigaWdRow[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Parse input whenever text changes or sub changes
  const handleParse = useCallback(
    (text: string, customSub: string) => {
      if (!text.trim()) {
        setParsedRows([]);
        return;
      }

      setIsProcessing(true);

      let rows: GigaWdRow[] = [];
      if (text.includes("<table") || text.includes("<tr")) {
        const grid = htmlTableToGrid(text);
        if (grid.length > 0) {
          rows = parseGigaWdGrid(grid, customSub);
        }
      }

      if (rows.length === 0) {
        rows = parseGigaWdText(text, customSub);
      }

      if (rows.length === 0 && text.includes("\t")) {
        const grid = htmlTableToGrid(text);
        if (grid.length > 0) {
          rows = parseGigaWdGrid(grid, customSub);
        }
      }

      // Chronological sort if dates are present
      rows = [...rows].sort((a, b) => sortByDateAsc(a.jamInput, b.jamInput));

      setParsedRows(rows);
      setIsProcessing(false);
    },
    []
  );

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    handleParse(val, subValue);
  };

  const onSubChange = (newSub: string) => {
    setSubValue(newSub);
    if (typeof window !== "undefined") {
      localStorage.setItem("giga_wd_sub_value", newSub);
    }
    setParsedRows((prev) => prev.map((r) => ({ ...r, sub: newSub })));
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
        setParsedRows(rows);
        toast.success(`Berhasil mengekstrak ${rows.length} baris form WD dari tabel HTML!`);
        return;
      }
    }
  };

  // Detected overall brand summary
  const detectedBrandSummary = useMemo(() => {
    if (parsedRows.some((r) => r.brand === "API22")) return "API22";
    if (parsedRows.some((r) => r.brand === "PIN88")) return "PIN88";
    return detectBrandFromText(inputText);
  }, [parsedRows, inputText]);

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
        `✅ ${parsedRows.length} baris WD berhasil disalin! (9 Kolom A-I siap paste ke Google Sheet).`
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

  // Sample Loader (Single universal sample)
  const handleUseSample = () => {
    setInputText(SAMPLE_TEXT_GIGA);
    handleParse(SAMPLE_TEXT_GIGA, subValue);
    toast.success("Sample data WD GIGA dimuat!");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── HEADER BANNER ── */}
      <div className="p-6 rounded-2xl neu-card border border-white/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl clay-badge flex items-center justify-center shrink-0">
            <ArrowUpFromLine size={28} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#23321B]">
                WD GIGA EXTRACTOR
              </h2>
              <span className="px-3 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase border border-[#74A355]/30 bg-[#74A355]/15 text-[#74A355]">
                PANEL GIGA
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#596B4F] mt-1 font-medium">
              Formula Ekstraksi form WD giga
            </p>
          </div>
        </div>

        {/* SUB Input (Persisted) */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl neu-inset border border-[#E8E2B5]">
            <Tag size={13} className="text-[#74A355]" />
            <span className="text-[11px] font-bold uppercase text-[#596B4F] tracking-wider">
              KOLOM SUB:
            </span>
            <input
              type="text"
              value={subValue}
              onChange={(e) => onSubChange(e.target.value)}
              placeholder="SUB (PNG / MJ / NG+EA)"
              className="w-24 px-2.5 py-1 rounded-md bg-[#FDFBD4] border border-[#E8E2B5] text-xs font-bold text-[#74A355] text-center uppercase focus:outline-none focus:ring-1 focus:ring-[#74A355]"
            />
          </div>
        </div>
      </div>

      {/* ── INPUT SECTION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Textarea */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-[#23321B] flex items-center gap-2">
              <FileText size={14} className="text-[#74A355]" />
              <span>RAW DATA WITHDRAWAL PANEL GIGA</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUseSample}
                className="text-[11px] font-bold text-[#74A355] bg-[#74A355]/15 hover:bg-[#74A355]/25 px-2.5 py-1 rounded-lg border border-[#74A355]/30 transition-all flex items-center gap-1"
              >
                <Sparkles size={11} />
                Use Sample
              </button>
              {inputText && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] font-bold text-[#CC2936] bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-300 transition-all flex items-center gap-1"
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
              className="w-full p-4 rounded-2xl neu-inset text-[#23321B] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#74A355] resize-y transition-all leading-relaxed placeholder:text-[#596B4F]/60"
            />
            {isProcessing && (
              <div className="absolute inset-0 rounded-2xl bg-white/70 backdrop-blur-sm flex items-center justify-center gap-2 text-[#74A355]">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-xs font-bold">Memproses Data...</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-[#596B4F] leading-relaxed neu-flat p-3 rounded-xl border border-white/80 font-medium">
            💡 {INPUT_GUIDANCE}
          </p>
        </div>

        {/* Right: Quick Summary & Action Box */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="p-5 rounded-2xl neu-card border border-white/80 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#23321B] flex items-center gap-2">
              <Sparkles size={14} className="text-[#74A355]" />
              <span>RINGKASAN EKSTRAKSI WD</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Stat 1: Total Rows */}
              <div className="p-3.5 rounded-xl neu-flat border border-white/80 flex flex-col">
                <span className="text-[10px] uppercase font-bold text-[#596B4F]">Total Tiket WD</span>
                <span className="text-2xl font-bold text-[#23321B] mt-1">
                  {parsedRows.length} <span className="text-xs font-normal text-[#596B4F]">tiket</span>
                </span>
              </div>

              {/* Stat 2: Brand Active */}
              <div className="p-3.5 rounded-xl neu-flat border border-white/80 flex flex-col">
                <span className="text-[10px] uppercase font-bold text-[#596B4F]">Website / Brand</span>
                <span className="text-base font-bold mt-1 uppercase text-[#74A355]">
                  {detectedBrandSummary === "UNKNOWN" ? "Belum Terdeteksi" : detectedBrandSummary}
                </span>
              </div>

              {/* Stat 3: Total Nominal */}
              <div className="p-3.5 rounded-xl neu-flat border border-white/80 flex flex-col col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-[#596B4F]">Total Nominal WD</span>
                <span className="text-base font-bold text-[#74A355] mt-1 font-mono">
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
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 clay-btn-green disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {isCopied ? <Check size={16} /> : <Copy size={16} />}
                <span>{isCopied ? "BERHASIL DISALIN!" : "COPY KE SPREADSHEET (TSV 9 KOLOM)"}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExcel}
                disabled={parsedRows.length === 0}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm neu-flat text-[#23321B] hover:bg-white border border-[#E8E2B5] transition-all disabled:opacity-35 disabled:cursor-not-allowed"
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#23321B] flex items-center gap-2">
              <TableProperties size={14} className="text-[#74A355]" />
              <span>STEP 1: TABEL BARIS TERSTRUKTUR (RAW PANEL MATRIX)</span>
            </h3>
            <span className="text-xs text-[#74A355] font-mono font-bold">
              {parsedRows.length} baris terpetakan otomatis
            </span>
          </div>

          <div className="w-full overflow-x-auto rounded-2xl neu-card border border-white/80 shadow-md">
            <table className="w-full text-left text-xs text-[#23321B] border-collapse">
              <thead>
                <tr className="bg-[#EFEBA9] border-b border-[#E8E2B5] text-[11px] font-bold text-[#23321B] uppercase tracking-wider">
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
              <tbody className="divide-y divide-[#E8E2B5] font-mono">
                {parsedRows.map((row, idx) => (
                  <tr
                    key={`matrix-${row.keterangan}-${idx}`}
                    className="hover:bg-[#F5F0C2] bg-[#FDFBD4] transition-colors"
                  >
                    <td className="py-3 px-3 text-center text-[#596B4F] text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="text-[11px] text-[#23321B] font-medium">{row.date || "-"}</div>
                      <div className="text-[10px] text-[#596B4F]">{row.ip}</div>
                    </td>
                    <td className="py-3 px-3 text-[11px] text-[#74A355] whitespace-nowrap font-bold">
                      {row.keterangan || "-"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap font-sans">
                      <div className="font-bold text-[#23321B] uppercase">{row.nama || "-"}</div>
                      <div className="text-[11px] font-mono text-[#74A355] font-semibold">
                        {row.nomorRekening || "-"}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold text-[#23321B] whitespace-nowrap">
                      {row.userId || "-"}
                    </td>
                    <td className="py-3 px-3 text-[#596B4F] whitespace-nowrap text-[11px] font-sans">
                      {row.fundMethod || "-"}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap font-sans">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          row.status.toLowerCase().includes("progess")
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : row.status.toLowerCase().includes("confirmed")
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : "bg-slate-100 text-slate-700 border-slate-300"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-black text-[#74A355] whitespace-nowrap text-sm">
                      {row.withdrawal}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleCopySingleRow(row, idx)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          copiedRowIdx === idx
                            ? "bg-[#74A355] text-white border-[#567C3E]"
                            : "neu-flat text-[#23321B] hover:bg-white"
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

      {/* ── STEP 2: SPREADSHEET TSV OUTPUT TABLE (KOLOM A S/D I) ── */}
      {parsedRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#23321B] flex items-center gap-2">
              <ListOrdered size={14} className="text-[#74A355]" />
              <span>STEP 2: PREVIEW OUTPUT SPREADSHEET (KOLOM A S/D I)</span>
            </h3>
            <button
              type="button"
              onClick={handleCopyTSV}
              className="text-xs font-bold text-[#74A355] hover:text-[#567C3E] flex items-center gap-1.5"
            >
              <Copy size={12} />
              <span>Salin Semua Baris (9 Kolom)</span>
            </button>
          </div>

          <div className="w-full overflow-x-auto rounded-2xl neu-card border border-white/80 shadow-md">
            <table className="w-full text-left text-xs text-[#23321B] border-collapse">
              <thead>
                <tr className="bg-[#EFEBA9] border-b border-[#E8E2B5] text-[11px] font-bold text-[#23321B] uppercase tracking-wider">
                  <th className="py-3 px-3 text-center w-10">#</th>
                  <th className="py-3 px-3">A: NAMA</th>
                  <th className="py-3 px-3">B: NO. REKENING</th>
                  <th className="py-3 px-3">C: USER ID</th>
                  <th className="py-3 px-3 text-center">D: SUB</th>
                  <th className="py-3 px-3 text-center">E: KODE</th>
                  <th className="py-3 px-3 text-center">F: DEPOSIT</th>
                  <th className="py-3 px-3 text-right">G: WITHDRAWAL</th>
                  <th className="py-3 px-3">H: DP PULSA</th>
                  <th className="py-3 px-3">I: KETERANGAN / SN</th>
                  <th className="py-3 px-3 text-center w-16">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2B5] font-mono">
                {parsedRows.map((row, idx) => {
                  const cleanedTrxId = cleanTrxId(row.dpPulsa || row.keterangan || "");
                  return (
                    <tr
                      key={`out-${cleanedTrxId || idx}-${idx}`}
                      className="hover:bg-[#F5F0C2] bg-[#FDFBD4] transition-colors group"
                    >
                      <td className="py-3 px-3 text-center text-[#596B4F] text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#23321B] uppercase whitespace-nowrap font-sans">
                        {row.nama || <span className="text-[#596B4F]">-</span>}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#74A355] whitespace-nowrap">
                        {row.nomorRekening || <span className="text-[#596B4F]">-</span>}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#23321B] whitespace-nowrap">
                        {row.userId || <span className="text-[#596B4F]">-</span>}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        <span className="px-2 py-0.5 rounded-md bg-[#74A355]/15 text-[#74A355] font-bold text-[10px] border border-[#74A355]/30">
                          {row.sub}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-300">
                          {row.kodeTransaksi}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-[#596B4F] font-sans">
                        {row.deposit || "-"}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-[#74A355] whitespace-nowrap">
                        {row.withdrawal}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-[#23321B] whitespace-nowrap">
                        {cleanedTrxId || <span className="text-[#596B4F]">-</span>}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[#596B4F] whitespace-nowrap">
                        {row.keterangan || <span className="text-[#596B4F]">-</span>}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleCopySingleRow(row, idx)}
                          className={`p-1.5 rounded-lg border transition-all ${
                            copiedRowIdx === idx
                              ? "bg-[#74A355] text-white border-[#567C3E]"
                              : "neu-flat text-[#23321B] hover:bg-white"
                          }`}
                          title="Copy Baris Ini"
                        >
                          {copiedRowIdx === idx ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
