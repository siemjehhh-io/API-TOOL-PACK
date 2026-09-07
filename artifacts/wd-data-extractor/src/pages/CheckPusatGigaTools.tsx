import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Banknote,
  Check,
  ClipboardCheck,
  Copy,
  Eraser,
  Globe,
  ListOrdered,
  Loader2,
  RotateCcw,
  Sparkles,
  Table,
  Trophy,
  User,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CHECK PUSAT GIGA TOOLS — 2-STEP ROW PIPELINE
//
// 1. Raw Text → Structured Row Table Parsing (Step 1)
// 2. Filter WIN Rows → Group by Provider & Game → Formatted Chat Template (Step 2)
// ─────────────────────────────────────────────────────────────────────────────

const CLOSING_LINE_DEFAULT =
  "Hello sir, please help check this ticket, is it valid or not?";
const CLOSING_LINE_STORAGE_KEY = "checkPusat:closingLine";

export const SAMPLE_TEXT = `1	SLOT - PGSOFT
Ticket : 2083893410871340035
2026-08-02 08:31:21	Lucky Neko
BET Details
2026-08-02 20:31:21	0.00	0.00	0.00	WIN	1,689,600.00
0.00	-1,351,680.00
0.00
0.00	-337,920.00
0.00	80%	0.000%	114.122.213.223
2	SLOT - PGSOFT
Ticket : 2083890416222166019
2026-08-02 08:19:27	Lucky Neko
BET Details
2026-08-02 20:19:27	4,000.00	4,000.00	0.00	WIN	384,800.00
0.00	-307,840.00
0.00
0.00	-76,960.00
0.00	80%	0.000%	114.122.213.223
3	SLOT - PGSOFT
Ticket : 2083814835770054656
2026-08-02 03:19:07	Mahjong Ways
BET Details
2026-08-02 15:19:07	0.00	0.00	0.00	WIN	384,000.00
0.00	-307,200.00
0.00
0.00	-76,800.00
0.00	80%	0.000%	114.122.213.223
4	SLOT - PGSOFT
Ticket : 2083847115271983105
2026-08-02 05:27:23	Wild Bounty Showdown
BET Details
2026-08-02 17:27:23	0.00	0.00	0.00	WIN	307,200.00
0.00	-245,760.00
0.00
0.00	-61,440.00
0.00	80%	0.000%	114.122.213.223
5	SLOT - PGSOFT
Ticket : 2083863351175343616
2026-08-02 06:31:54	Wild Bounty Showdown
BET Details
2026-08-02 18:31:54	0.00	0.00	0.00	WIN	288,000.00
0.00	-230,400.00
0.00
0.00	-57,600.00
0.00	80%	0.000%	114.122.213.223`;

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface CheckPusatRow {
  no: string;
  category: string;
  provider: string;
  ticketId: string;
  transTime: string;
  gameName: string;
  settleTime: string;
  status: string;
  memberWinRaw: string;
  memberWinFormatted: string;
  memberWinNum: number;
  ipAddress: string;
}

export interface CheckPusatParseResult {
  rows: CheckPusatRow[];
  totalWinCount: number;
  totalNonWinCount: number;
  totalDuplicateCount: number;
}

// ─── Core Parser ────────────────────────────────────────────────────────────

export function parseCheckPusatRows(rawText: string): CheckPusatParseResult {
  const result: CheckPusatParseResult = {
    rows: [],
    totalWinCount: 0,
    totalNonWinCount: 0,
    totalDuplicateCount: 0,
  };

  if (!rawText || typeof rawText !== "string" || !rawText.trim()) return result;

  let chunks: string[] = [];
  const rowPattern = /(?:^|\r?\n|\b|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*(\d{1,4})?\s*((?:SLOT|LIVE|CASINO|SPORTS|TABLE|CARD|ARCADE|LOTTERY|OTHER|E-GAMES)\s*-\s*[A-Za-z0-9]+)/gi;
  const matchIndices: number[] = [];
  let m: RegExpExecArray | null;

  while ((m = rowPattern.exec(rawText)) !== null) {
    // If matched after IP, advance index to where the row index/category begins
    const matchStr = m[0];
    const catIdx = matchStr.search(/(?:\d{1,4}\s*)?(?:SLOT|LIVE|CASINO|SPORTS|TABLE|CARD|ARCADE|LOTTERY|OTHER|E-GAMES)\s*-\s*/i);
    matchIndices.push(m.index + (catIdx > 0 ? catIdx : 0));
  }

  if (matchIndices.length > 0) {
    for (let i = 0; i < matchIndices.length; i++) {
      const start = matchIndices[i];
      const end = i + 1 < matchIndices.length ? matchIndices[i + 1] : rawText.length;
      chunks.push(rawText.slice(start, end).trim());
    }
  } else {
    const ticketPattern = /Ticket\s*:\s*[A-Za-z0-9_\-]+/gi;
    const ticketIndices: number[] = [];
    while ((m = ticketPattern.exec(rawText)) !== null) {
      ticketIndices.push(m.index);
    }
    if (ticketIndices.length > 0) {
      for (let i = 0; i < ticketIndices.length; i++) {
        const start = ticketIndices[i];
        const end = i + 1 < ticketIndices.length ? ticketIndices[i + 1] : rawText.length;
        chunks.push(rawText.slice(start, end).trim());
      }
    } else {
      chunks = [rawText.trim()];
    }
  }

  const seenTickets = new Set<string>();

  for (const chunk of chunks) {
    if (!chunk) continue;

    const ticketMatch = chunk.match(/Ticket\s*:\s*([A-Za-z0-9_\-]+)/i) || chunk.match(/\b([A-Za-z0-9]{14,35})\b/);
    const ticketId = ticketMatch ? ticketMatch[1] : "";

    let category = "SLOT";
    let provider = "PGSOFT";
    const catMatch = chunk.match(/\b(SLOT|LIVE|CASINO|SPORTS|TABLE|CARD|ARCADE|LOTTERY|OTHER|E-GAMES)\s*-\s*([A-Za-z0-9]+)/i);
    if (catMatch) {
      category = catMatch[1].trim().toUpperCase();
      provider = catMatch[2].trim().toUpperCase();
    }

    let status = "WIN";
    const statusMatch = chunk.match(/\b(WIN|LOSE|CANCEL|DRAW)\b/i);
    if (statusMatch) {
      status = statusMatch[1].toUpperCase();
    }

    const dateMatches = Array.from(chunk.matchAll(/\b(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\b/g));
    const transTime = dateMatches[0] ? dateMatches[0][1] : "";
    const confirmedTime = dateMatches.length > 1 ? dateMatches[dateMatches.length - 1][1] : transTime;

    let gameName = "";
    const gameMatch1 = chunk.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*([A-Za-z0-9\s]+?)\s*BET\s*Details/i);
    if (gameMatch1 && gameMatch1[1].trim()) {
      gameName = gameMatch1[1].trim();
    }
    if (!gameName) {
      const gameMatch2 = chunk.match(/Ticket\s*:\s*[A-Za-z0-9_\-]+\s*(?:\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})?\s*([A-Za-z0-9\s]+?)\s*BET\s*Details/i);
      if (gameMatch2 && gameMatch2[1].trim()) {
        gameName = gameMatch2[1].trim();
      }
    }
    if (!gameName) {
      const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        if (/BET\s*Details/i.test(lines[i]) && i > 0) {
          const prev = lines[i - 1].replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/, "").replace(/Ticket\s*:\s*[A-Za-z0-9_\-]+/i, "").trim();
          if (prev && !/WIN|LOSE|CANCEL|DRAW/i.test(prev)) {
            gameName = prev;
            break;
          }
        }
      }
    }

    if (gameName) {
      gameName = gameName.replace(/^\d+\s+/, "").trim();
    }

    let memberWinNum = 0;
    let memberWinFormatted = "0";
    const winAmountMatch = chunk.match(/(?:WIN|LOSE|CANCEL|DRAW)\s*([0-9,]+(?:\.\d{2})?)/i);
    if (winAmountMatch) {
      const rawAmt = winAmountMatch[1];
      memberWinFormatted = rawAmt.replace(/\.00$/, "").replace(/\.\d+$/, "");
      memberWinNum = Number(rawAmt.replace(/,/g, "")) || 0;
    }

    const ipMatch = chunk.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    const ipAddress = ipMatch ? ipMatch[0] : "";

    if (status !== "WIN") {
      result.totalNonWinCount++;
      continue;
    }

    if (ticketId && seenTickets.has(ticketId)) {
      result.totalDuplicateCount++;
      continue;
    }

    if (ticketId) seenTickets.add(ticketId);

    if (ticketId || gameName) {
      result.totalWinCount++;
      result.rows.push({
        no: String(result.rows.length + 1),
        category,
        provider,
        ticketId,
        transTime,
        gameName: gameName || "Game Details",
        settleTime: confirmedTime || transTime,
        status,
        memberWinRaw: memberWinFormatted,
        memberWinFormatted,
        memberWinNum,
        ipAddress,
      });
    }
  }

  return result;
}

// ─── Group & Template Formatter ─────────────────────────────────────────────

export function groupCheckPusatRows(rows: CheckPusatRow[]): {
  header: string;
  game: string;
  tickets: CheckPusatRow[];
}[] {
  const groupOrder: string[] = [];
  const groups = new Map<string, CheckPusatRow[]>();

  for (const row of rows) {
    const header = `${row.category} - ${row.provider}`;
    const key = `${header}::${row.gameName}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key)!.push(row);
  }

  return groupOrder.map((key) => {
    const list = groups.get(key)!;
    const sorted = [...list].sort((a, b) => b.memberWinNum - a.memberWinNum);
    return {
      header: `${sorted[0].category} - ${sorted[0].provider}`,
      game: sorted[0].gameName,
      tickets: sorted,
    };
  });
}

export function renderCheckPusatTemplate(
  rows: CheckPusatRow[],
  options: { idPlayer: string; closingLine: string },
): string {
  const groups = groupCheckPusatRows(rows);
  if (!groups.length) return "";

  const parts: string[] = [];
  if (options.idPlayer.trim()) {
    parts.push(options.idPlayer.trim());
  }

  for (const group of groups) {
    if (parts.length > 0) parts.push("");
    parts.push(group.header.toUpperCase());
    parts.push(group.game);
    for (const ticket of group.tickets) {
      const base = `Ticket : ${ticket.ticketId} | ${ticket.memberWinFormatted}`;
      parts.push(ticket.settleTime ? `${base} | ${ticket.settleTime}` : base);
    }
  }

  parts.push("");
  parts.push(options.closingLine.trim() || CLOSING_LINE_DEFAULT);

  return parts.join("\n");
}

function formatCurrency(value: number): string {
  return "Rp " + value.toLocaleString("id-ID");
}

export function parseCheckPusat(rawText: string) {
  const parsed = parseCheckPusatRows(rawText);
  const tickets = parsed.rows.map((r) => ({
    ticketId: r.ticketId,
    category: r.category,
    provider: r.provider,
    game: r.gameName,
    transTime: r.transTime,
    confirmedTime: r.settleTime,
    status: r.status,
    memberWin: r.memberWinNum,
    memberWinFormatted: r.memberWinFormatted,
    ipAddress: r.ipAddress,
  }));
  return {
    tickets,
    skippedNonWin: parsed.totalNonWinCount,
    skippedDuplicate: parsed.totalDuplicateCount,
    totalParsed: parsed.totalWinCount + parsed.totalNonWinCount,
  };
}

export function groupTickets(tickets: any[]) {
  const converted: CheckPusatRow[] = tickets.map((t, idx) => ({
    no: String(idx + 1),
    category: t.category,
    provider: t.provider,
    ticketId: t.ticketId,
    transTime: t.transTime,
    gameName: t.game || t.gameName,
    settleTime: t.confirmedTime || t.settleTime,
    status: t.status || "WIN",
    memberWinRaw: t.memberWinFormatted || String(t.memberWin),
    memberWinFormatted: t.memberWinFormatted || String(t.memberWin),
    memberWinNum: t.memberWin || 0,
    ipAddress: t.ipAddress || "",
  }));
  const groups = groupCheckPusatRows(converted);
  return groups.map((g) => ({
    header: g.header,
    game: g.game,
    tickets: g.tickets.map((r) => ({
      ticketId: r.ticketId,
      category: r.category,
      provider: r.provider,
      game: r.gameName,
      transTime: r.transTime,
      confirmedTime: r.settleTime,
      status: r.status,
      memberWin: r.memberWinNum,
      memberWinFormatted: r.memberWinFormatted,
      ipAddress: r.ipAddress,
    })),
  }));
}

export function renderTemplate(
  tickets: any[],
  options: { idPlayer?: string; closingLine?: string } = {},
) {
  if (!tickets || !tickets.length) return "";
  const converted: CheckPusatRow[] = tickets.map((t, idx) => ({
    no: String(idx + 1),
    category: t.category,
    provider: t.provider,
    ticketId: t.ticketId,
    transTime: t.transTime,
    gameName: t.game || t.gameName,
    settleTime: t.confirmedTime || t.settleTime,
    status: t.status || "WIN",
    memberWinRaw: t.memberWinFormatted || String(t.memberWin),
    memberWinFormatted: t.memberWinFormatted || String(t.memberWin),
    memberWinNum: t.memberWin || 0,
    ipAddress: t.ipAddress || "",
  }));
  return renderCheckPusatTemplate(converted, {
    idPlayer: options.idPlayer || "",
    closingLine: options.closingLine || CLOSING_LINE_DEFAULT,
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CheckPusatGigaTools() {
  const [rawText, setRawText] = useState("");
  const [idPlayer, setIdPlayer] = useState("");
  const [closingLine, setClosingLine] = useState(CLOSING_LINE_DEFAULT);
  const [parsedRows, setParsedRows] = useState<CheckPusatRow[]>([]);
  const [parseStats, setParseStats] = useState<CheckPusatParseResult>({
    rows: [],
    totalWinCount: 0,
    totalNonWinCount: 0,
    totalDuplicateCount: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const idPlayerRef = useRef<HTMLInputElement | null>(null);

  // Restore persisted closing line on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CLOSING_LINE_STORAGE_KEY);
      if (saved && saved.trim()) {
        setClosingLine(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist closing line
  useEffect(() => {
    try {
      localStorage.setItem(CLOSING_LINE_STORAGE_KEY, closingLine);
    } catch {
      // ignore
    }
  }, [closingLine]);

  const totalWin = useMemo(
    () => parsedRows.reduce((sum, r) => sum + r.memberWinNum, 0),
    [parsedRows],
  );

  const previewText = useMemo(() => {
    if (!parsedRows.length) return "";
    return renderCheckPusatTemplate(parsedRows, {
      idPlayer: idPlayer || "ID PLAYER",
      closingLine,
    });
  }, [parsedRows, idPlayer, closingLine]);

  const processData = useCallback(() => {
    if (!rawText.trim()) {
      setError("Tempel raw text dari panel terlebih dahulu.");
      toast.error("Input masih kosong.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    window.setTimeout(() => {
      try {
        const result = parseCheckPusatRows(rawText);
        setParseStats(result);
        setParsedRows(result.rows);

        if (!result.rows.length) {
          setError(
            "Tidak ada tiket WIN yang berhasil diproses. Pastikan format teks sesuai salinan panel GIGA.",
          );
          toast.error("Tidak ada tiket WIN ditemukan.");
        } else {
          const skipped = result.totalNonWinCount + result.totalDuplicateCount;
          if (skipped > 0) {
            toast.success(
              `${result.rows.length} tiket WIN diproses (${skipped} non-WIN/duplikat diabaikan).`,
            );
          } else {
            toast.success(`${result.rows.length} tiket WIN berhasil diproses.`);
          }
        }
      } catch (parseError) {
        console.error("Error parsing CHECK PUSAT text:", parseError);
        setParsedRows([]);
        setParseStats({
          rows: [],
          totalWinCount: 0,
          totalNonWinCount: 0,
          totalDuplicateCount: 0,
        });
        setError(
          "Gagal memproses teks. Pastikan format sesuai tabel kemenangan GIGA.",
        );
        toast.error("Gagal memproses teks.");
      } finally {
        setIsProcessing(false);
      }
    }, 180);
  }, [rawText]);

  const clearAll = useCallback(() => {
    setRawText("");
    setParsedRows([]);
    setError(null);
    setParseStats({
      rows: [],
      totalWinCount: 0,
      totalNonWinCount: 0,
      totalDuplicateCount: 0,
    });
    setIsCopied(false);
    toast.info("Data berhasil dibersihkan.");
  }, []);

  const useSample = useCallback(() => {
    setRawText(SAMPLE_TEXT);
    setError(null);
    toast.success("Contoh data panel berhasil dimuat.");
  }, []);

  const resetClosingLine = useCallback(() => {
    setClosingLine(CLOSING_LINE_DEFAULT);
    toast.info("Closing line direset ke default.");
  }, []);

  const copyTemplate = useCallback(async () => {
    if (!parsedRows.length) return;
    if (!idPlayer.trim()) {
      toast.error("ID Player wajib diisi sebelum copy template.");
      idPlayerRef.current?.focus();
      return;
    }

    const text = renderCheckPusatTemplate(parsedRows, {
      idPlayer,
      closingLine: closingLine.trim() ? closingLine : CLOSING_LINE_DEFAULT,
    });

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success("Template verifikasi berhasil disalin ke clipboard!");
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setIsCopied(true);
        toast.success("Template verifikasi berhasil disalin ke clipboard!");
        window.setTimeout(() => setIsCopied(false), 2000);
      } catch {
        toast.error("Gagal menyalin ke clipboard.");
      }
    }
  }, [parsedRows, idPlayer, closingLine]);

  return (
    <section className="relative z-10 flex flex-col gap-6 text-[#23321B]">
      {/* ── STEP 1: INPUT MODULE ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-2xl neu-card border border-white/80"
      >
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl clay-badge flex items-center justify-center shrink-0">
              <Trophy size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#23321B]">
                CHECK PUSAT GIGA
              </h2>
              <p className="text-xs text-[#596B4F] font-medium">
                Format sistem row & ekstraksi tiket verifikasi pusat otomatis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={useSample}
            className="inline-flex items-center justify-center h-10 px-4 py-2 gap-2 rounded-xl text-xs font-bold border border-[#74A355]/30 bg-[#74A355]/10 text-[#74A355] hover:bg-[#74A355]/20 transition-all cursor-pointer"
          >
            <Wand2 size={15} />
            Use Sample
          </button>
        </div>

        {/* ID Player input */}
        <div className="mb-4">
          <label className="flex items-center gap-1.5 text-xs font-bold text-[#596B4F] mb-1.5 uppercase tracking-wider">
            <User size={13} className="text-[#74A355]" />
            ID Player
            <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              ref={idPlayerRef}
              type="text"
              value={idPlayer}
              onChange={(event) =>
                setIdPlayer(event.target.value.replace(/[^A-Za-z0-9_.\-]/g, ""))
              }
              placeholder="Masukkan ID Player (contoh: GGIABAC00HEA)..."
              maxLength={30}
              className="h-11 w-full rounded-xl neu-inset border border-[#E8E2B5] px-3 pr-9 text-sm font-mono font-bold text-[#23321B] outline-none transition placeholder:text-[#596B4F]/50 focus:ring-2 focus:ring-[#74A355]"
              data-testid="input-id-player"
            />
            {idPlayer && (
              <button
                type="button"
                onClick={() => setIdPlayer("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#596B4F] hover:text-[#23321B]"
                aria-label="Bersihkan ID Player"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Raw text from panel */}
        <label className="flex items-center gap-1.5 text-xs font-bold text-[#596B4F] mb-1.5 uppercase tracking-wider">
          <ClipboardCheck size={13} className="text-[#74A355]" />
          Raw Text Salinan Tabel Panel GIGA
        </label>
        <textarea
          value={rawText}
          onChange={(event) => {
            setRawText(event.target.value);
            setError(null);
          }}
          placeholder="Paste salinan tabel panel GIGA di sini..."
          className="min-h-[220px] w-full resize-y rounded-2xl neu-inset border border-[#E8E2B5] p-4 font-mono text-xs leading-6 text-[#23321B] outline-none transition placeholder:text-[#596B4F]/50 focus:ring-2 focus:ring-[#74A355]"
          data-testid="input-raw-text"
        />

        {/* Closing line input */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-[#596B4F] uppercase tracking-wider">
              <Sparkles size={13} className="text-[#74A355]" />
              Closing Line Pesan Chat
            </label>
            {closingLine !== CLOSING_LINE_DEFAULT && (
              <button
                type="button"
                onClick={resetClosingLine}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#74A355] hover:underline transition-colors"
              >
                <RotateCcw size={11} />
                Reset default
              </button>
            )}
          </div>
          <textarea
            value={closingLine}
            onChange={(event) => setClosingLine(event.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl neu-inset border border-[#E8E2B5] px-3 py-2 text-sm font-medium text-[#23321B] outline-none transition placeholder:text-[#596B4F]/50 focus:ring-2 focus:ring-[#74A355]"
            data-testid="input-closing-line"
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <motion.button
            type="button"
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={processData}
            disabled={isProcessing}
            className="inline-flex flex-1 items-center justify-center h-12 px-6 gap-2 rounded-xl text-sm font-bold clay-btn-green text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-process"
          >
            {isProcessing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Sparkles size={18} />
            )}
            Proses & Buat Baris Tabel
          </motion.button>
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center justify-center h-12 px-6 gap-2 rounded-xl text-sm font-bold neu-flat border border-[#E8E2B5] text-[#596B4F] hover:text-rose-600 hover:border-rose-300 transition-all cursor-pointer"
            data-testid="button-clear"
          >
            <Eraser size={17} />
            Clear
          </button>
        </div>
      </motion.div>

      {/* ── ERROR BANNER ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 p-4 rounded-2xl border border-rose-300 bg-rose-50 text-rose-800 shadow-sm"
          >
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-600" />
            <p className="text-sm font-bold">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── STEP 2: ROW TABLE PREVIEW & TEMPLATE OUTPUT ──────────────────── */}
      {parsedRows.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="flex flex-col gap-6"
        >
          {/* STATS CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-4 p-4 rounded-2xl neu-flat border border-white/80">
              <div className="w-12 h-12 rounded-xl clay-badge flex items-center justify-center shrink-0">
                <Trophy size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[#596B4F] font-bold">
                  Total Tiket WIN
                </p>
                <p className="text-2xl font-bold text-[#23321B] leading-tight font-mono mt-1">
                  {parsedRows.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-2xl neu-flat border border-white/80">
              <div className="w-12 h-12 rounded-xl clay-badge flex items-center justify-center shrink-0">
                <Banknote size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-[#596B4F] font-bold">
                  Total Nilai Win
                </p>
                <p
                  className="text-2xl font-bold text-[#74A355] leading-tight font-mono mt-1 truncate"
                  title={formatCurrency(totalWin)}
                >
                  {formatCurrency(totalWin)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-2xl neu-flat border border-white/80">
              <div className="w-12 h-12 rounded-xl neu-inset border border-[#E8E2B5] flex items-center justify-center shrink-0 text-[#596B4F]">
                <ListOrdered size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-[#596B4F] font-bold">
                  Skipped / Ignored
                </p>
                <p className="text-2xl font-bold text-[#23321B] leading-tight font-mono mt-1">
                  {parseStats.totalNonWinCount + parseStats.totalDuplicateCount}
                </p>
                <p className="text-[10px] text-[#596B4F] font-semibold mt-0.5">
                  {parseStats.totalNonWinCount} non-WIN ·{" "}
                  {parseStats.totalDuplicateCount} duplikat
                </p>
              </div>
            </div>
          </div>

          {/* INTERMEDIATE ROW TABLE (TABEL BARIS TERSTRUKTUR) */}
          <div className="overflow-hidden rounded-2xl neu-card border border-white/80">
            <div className="flex items-center justify-between gap-4 p-4 border-b border-[#E8E2B5] bg-[#EFEBA9]/40 flex-wrap">
              <div className="flex items-center gap-2">
                <Table size={16} className="text-[#74A355]" />
                <h3 className="text-sm font-bold text-[#23321B] tracking-wide">
                  Tabel Baris Terstruktur ({parsedRows.length} Baris Valid)
                </h3>
              </div>
              <span className="text-xs text-[#596B4F] font-mono font-semibold">
                Urutan sesuai input panel
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-[#E8E2B5] bg-[#EFEBA9]/60 text-[10px] uppercase text-[#596B4F] font-bold tracking-wider">
                    <th className="px-4 py-3 text-center w-12">#</th>
                    <th className="px-4 py-3">Category / Provider</th>
                    <th className="px-4 py-3">Game Name</th>
                    <th className="px-4 py-3">Ticket ID</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Member Win</th>
                    <th className="px-4 py-3">Settle Time</th>
                    <th className="px-4 py-3">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E2B5]/50 text-[#23321B]">
                  {parsedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-[#74A355]/5 transition-colors font-sans"
                    >
                      <td className="px-4 py-2.5 text-center text-[#596B4F] font-mono font-bold">
                        {row.no || idx + 1}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#74A355]/15 text-[#74A355] border border-[#74A355]/30 font-mono">
                          {row.category} - {row.provider}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-[#23321B]">
                        {row.gameName}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[#23321B]">
                        {row.ticketId}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#74A355]/20 text-[#74A355] border border-[#74A355]/30">
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-[#74A355]">
                        {row.memberWinFormatted}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#596B4F] font-mono">
                        {row.settleTime}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#596B4F] font-mono">
                        {row.ipAddress || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FINAL EXTRACTED TEMPLATE OUTPUT */}
          <div className="overflow-hidden rounded-2xl neu-card border border-white/80">
            <div className="flex items-center justify-between gap-4 p-4 border-b border-[#E8E2B5] bg-[#EFEBA9]/40 flex-wrap">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-[#23321B]">
                  Hasil Ekstraksi Format Chat Pusat
                </h3>
                <p className="text-xs text-[#596B4F] font-medium">
                  Teks rapi terkelompok siap di-copy ke pusat.
                </p>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: parsedRows.length ? 1.02 : 1 }}
                whileTap={{ scale: parsedRows.length ? 0.98 : 1 }}
                onClick={copyTemplate}
                disabled={!parsedRows.length}
                className="inline-flex items-center justify-center h-10 px-4 gap-2 rounded-xl text-xs font-bold clay-btn-green text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="button-copy-template"
              >
                {isCopied ? <Check size={15} /> : <Copy size={15} />}
                {isCopied ? "Copied to Clipboard" : "Copy Template"}
              </motion.button>
            </div>

            <pre
              className="p-4 font-mono text-sm leading-7 text-[#23321B] whitespace-pre-wrap break-words neu-inset border-t border-[#E8E2B5] max-h-[480px] overflow-y-auto"
              data-testid="output-preview"
            >
              {previewText}
            </pre>
          </div>
        </motion.section>
      )}
    </section>
  );
}
