import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, Lock, Globe, Plus, Trash2, RefreshCw, WifiOff, Pencil, ImagePlus, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import {
  listWebs,
  createWeb,
  deleteWeb,
  updateWeb,
  getState,
  putState,
  subscribeStream,
  safeWebId,
} from '@/lib/mutasiSync';

const DEFAULT_TAB = { id: 'bca-1', name: 'BCA 1', bank: 'BCA' };
const TYPE_OPTIONS = ['DP', 'TRANSFER', 'BIAYA ADMIN'];
// Persist only the LAST-selected web id per browser (UI convenience, not data).
const LAST_WEB_KEY = 'gigaSmartMutasi:lastWeb';

// Read an image File, downscale it to a small square-ish thumbnail, and return
// a data URL suitable for storing alongside the web entry (kept tiny so the
// registry stays light). Resolves to '' on failure.
const fileToLogoDataUrl = (file, max = 256) => new Promise((resolve) => {
  try {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, max / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = String(reader.result || '');
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  } catch {
    resolve('');
  }
});

const sanitizeTsvCell = (value) => String(value ?? '').replace(/[\t\n\r]/g, '').trim();
const cleanNominal = (value) => String(value ?? '').replace(/,/g, '').replace(/\./g, '').replace(/[^0-9-]/g, '').trim();
const parseNumber = (value) => Number(String(value ?? '').replace(/[^0-9-]/g, '')) || 0;
const formatNumber = (value) => parseNumber(value).toLocaleString('id-ID');
const getExportDate = () => new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

/**
 * Pure parser for BCA mutation paste text.
 *
 * Anchors on the literal line "0000" — the BCA panel emits this marker
 * between the description block and the amount/type/balance triplet:
 *
 *   [lines[i-2]]     (used as name fallback for ESPAY / PAYMENT entries)
 *   [lines[i-1]]     (description / name line)
 *   "0000"           (anchor)
 *   [lines[i+1]]     (nominal, e.g. "1,234,567.00")
 *   [lines[i+2]]     ("CR" -> DP, "DB" -> TRANSFER)
 *   [lines[i+3]]     (saldo akhir)
 *
 * The `options.selectedBank` argument is accepted for future use and to
 * mirror the call site shape inside the component; it does not affect
 * the parsed output today.
 *
 * Extracted from handleExtractBca purely for testability — does not
 * touch component state, localStorage, or React.
 *
 * @param {string} rawText
 * @param {{ selectedBank?: string }} [options]
 * @returns {Array<{ nama: string, nominal: string, type: 'DP'|'TRANSFER'|'BIAYA ADMIN', saldoAkhir: string }>}
 */
export const extractBcaMutationLines = (rawText, _options = {}) => {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
  const items = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== '0000') continue;
    try {
      const rawName = lines[index - 1] || '';
      const upperRaw = rawName.toUpperCase();
      let targetNameLine = rawName;

      // Deteksi Biaya Admin
      let isAdmin = false;
      if (upperRaw.includes('BIAYA ADM') || upperRaw.includes('ADMIN') || upperRaw.includes('BIAYA TX')) {
        targetNameLine = 'BIAYA ADMIN';
        isAdmin = true;
      }

      // Deteksi ESPAY / E-Wallet
      if (!isAdmin && (upperRaw.includes('ESPAY') || upperRaw.includes('PAYMENT'))) {
        targetNameLine = lines[index - 2] || rawName;
      }

      // Bersihkan Nama
      let cleanName = targetNameLine;
      if (!isAdmin) {
        cleanName = cleanName.replace(/TANGGAL\s*:\s*\d{2}\/\d{2}\s*TRANSFER\s*DR\s*\d*\s*/i, '');
        cleanName = cleanName.replace(/TRFDN-/i, '');
        cleanName = cleanName.trim();
      }

      // Ambil Nominal
      const rawNominal = lines[index + 1] || '0';
      const nominal = rawNominal.replace(/,/g, '').split('.')[0];

      // Tentukan Tipe
      const typeRaw = lines[index + 2];
      let type = 'DP';
      if (isAdmin) {
        type = 'BIAYA ADMIN';
      } else if (typeRaw === 'DB') {
        type = 'TRANSFER';
      } else if (typeRaw === 'CR') {
        type = 'DP';
      }

      // Ambil Saldo Akhir
      const rawSaldo = lines[index + 3] || '0';
      const saldoAkhir = rawSaldo.replace(/,/g, '').split('.')[0];

      // Filter Anti-Nyasar
      if (cleanName && nominal !== '0') {
        items.push({ nama: cleanName, nominal, type, saldoAkhir });
      }
    } catch {
      // Skip baris yang gagal di-parse agar batch tetap jalan.
    }
  }
  return items;
};

// ── Qlola (internet banking) mutasi parser ────────────────────────────────────
// Qlola rows look like: "<DD Bulan YYYY HH:MM:SS><deskripsi><Rp debit><Rp kredit><Rp saldo>".
// The pasted text can be newline-separated OR fully glued (no separators), so we
// anchor with a regex instead of splitting on lines. Indonesian thousand grouping
// (Rp794.500) is matched as \d{1,3}(\.\d{3})* so a glued next-date digit (e.g.
// "Rp794.50014 Juni") is NOT swallowed into the amount.
const QLOLA_MONTHS = { januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5, juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11 };

const parseQlolaDate = (s) => {
  const m = String(s).match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const mon = QLOLA_MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return NaN;
  return new Date(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
};

const cleanQlolaName = (raw) => {
  // Glue newlines (bank fields split across lines) then collapse spaces.
  const s = String(raw || '').replace(/[\r\n]+/g, '').replace(/[ \t]+/g, ' ').trim();
  // 1. "Transfer dari/ke <nama> via <channel>" -> nama
  const t = s.match(/transfer\s+(?:dari|ke)\s+(.+?)\s+via\s+/i);
  if (t) return t[1].trim();
  // 2. "GoPay Bank Transfer ID..." -> teks sebelum " ID<angka>"
  const gp = s.match(/^(GoPay.*?)\s+ID\d/i);
  if (gp) return gp[1].trim();
  // 3. "ATM... <no rekening panjang>" -> "ATM <no panjang terakhir>"
  if (/^ATM/i.test(s)) {
    const nums = s.match(/\d{6,}/g);
    if (nums && nums.length) return `ATM ${nums[nums.length - 1]}`;
    return 'ATM';
  }
  // 4. "FT <X> TO <Y>" -> "FT <X>"
  const ft = s.match(/^(FT .+?) TO /);
  if (ft) return ft[1].trim();
  // 5. BFST: ada spasi setelah angka -> ambil sisa apa adanya (mis. "NBMB:CENAIDJA");
  //    tanpa spasi (nama nempel) -> ambil bagian sebelum titik dua (mis. "DOMPET ANAK").
  const bfst = s.match(/^BFST(\d+)(\s*)(.+)$/i);
  if (bfst) {
    const hadSpace = bfst[2].length > 0;
    const rest = bfst[3].trim();
    if (hadSpace) return rest;
    const namePart = rest.split(':')[0].trim();
    return namePart || rest;
  }
  // 6. "TRF<digits><NAMA><digits...>" -> NAMA (deret huruf di depan)
  const trf = s.match(/^TRF\d+\s*([A-Za-z][A-Za-z ]*)/);
  if (trf && trf[1].trim()) return trf[1].trim();
  // 7. "DANA<digits><NAMA>" -> NAMA
  const dana = s.match(/^DANA\d+\s*([A-Za-z].*)$/);
  if (dana) return dana[1].trim();
  return s;
};

/**
 * Pure parser for Qlola internet-banking mutation paste text.
 * Returns chronological (oldest-first) rows so the running balance lines up
 * with each row's saldo.
 *
 * @param {string} rawText
 * @returns {Array<{ nama: string, nominal: string, type: 'DP'|'TRANSFER', saldoAkhir: string }>}
 */
export const extractQlolaMutationLines = (rawText, _options = {}) => {
  if (!rawText || typeof rawText !== 'string') return [];
  const text = rawText.replace(/\u00a0/g, ' ');
  const RP = String.raw`Rp\d{1,3}(?:\.\d{3})*`;
  const recordRe = new RegExp(
    String.raw`(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+\d{2}:\d{2}:\d{2})([\s\S]*?)(${RP})\s*(${RP})\s*(${RP})`,
    'g',
  );
  const toNum = (s) => Number(String(s).replace(/[^0-9]/g, '')) || 0;
  const rows = [];
  let m;
  while ((m = recordRe.exec(text)) !== null) {
    const debit = toNum(m[3]);
    const credit = toNum(m[4]);
    const saldo = toNum(m[5]);
    let type;
    let nominal;
    if (credit > 0) { type = 'DP'; nominal = credit; }
    else if (debit > 0) { type = 'TRANSFER'; nominal = debit; }
    else continue;
    rows.push({
      nama: cleanQlolaName(m[2]),
      nominal: String(nominal),
      type,
      saldoAkhir: String(saldo),
      _t: parseQlolaDate(m[1].trim()),
    });
  }
  rows.sort((a, b) => (Number.isNaN(a._t) || Number.isNaN(b._t) ? 0 : a._t - b._t));
  return rows.map(({ _t, ...rest }) => rest);
};

const NominalInput = ({ value, onChange, className, placeholder = '0', disabled = false, sep = '.' }) => {
  const [isFocused, setIsFocused] = React.useState(false);

  const formatRibuan = (amount) => {
    if (!amount) return '';
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  };

  return (
    <input
      type="text"
      className={className}
      disabled={disabled}
      value={isFocused ? value : formatRibuan(value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onChange={(event) => {
        const rawDigits = event.target.value.replace(/[^0-9]/g, '');
        onChange(rawDigits);
      }}
      placeholder={placeholder}
    />
  );
};

const ConfirmDialog = ({ dialog, onCancel, onConfirm }) => {
  if (!dialog) return null;
  const isDanger = dialog.variant === 'danger';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-ds-md backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/80 bg-[#FDFBD4] neu-card shadow-2xl">
        <div className={`h-1.5 ${isDanger ? 'bg-red-500' : 'bg-[#74A355]'}`} />
        <div className="p-5 flex flex-col gap-ds-md">
          <div className="mb-1 flex items-start justify-between gap-ds-md">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#74A355]">{dialog.title}</p>
              <p className="text-sm font-semibold leading-relaxed text-[#23321B]">{dialog.message}</p>
            </div>
            <button type="button" onClick={onCancel} className="rounded-full p-1.5 text-[#596B4F] transition hover:bg-[#74A355]/10 hover:text-[#23321B]" aria-label="Tutup konfirmasi">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-ds-sm">
            <button type="button" onClick={onCancel} className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-bold border border-[#E8E2B5] neu-flat text-[#596B4F] transition-all hover:bg-white">
              {dialog.cancelLabel || 'Batal'}
            </button>
            <button type="button" onClick={onConfirm} className={`inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-bold text-white transition-all ${isDanger ? 'bg-red-600 hover:bg-red-700' : 'clay-btn-green'}`}>
              {dialog.confirmLabel || 'Lanjutkan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};



// ─────────────────────────────────────────────────────────────────────────────
// The actual mutasi workspace for ONE web. Mounted with key={webId} so that
// switching web remounts it cleanly. All data is synced to the server: loaded
// on mount, pushed (debounced) on edit, and refreshed live via SSE.
// ─────────────────────────────────────────────────────────────────────────────
function MutasiWorkspace({ webId, webName, webLogo, onExit }) {
  // The whole synced blob for this web.
  const emptyState = useMemo(() => ({
    tabs: [DEFAULT_TAB],
    activeTabId: DEFAULT_TAB.id,
    queuesByTab: { [DEFAULT_TAB.id]: [] },
    saldoAwalByTab: {},
    shiftNoByTab: {},
    shiftName: '',
    selectedBank: 'BCA',
  }), []);

  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState(emptyState);

  // local editor-only state (not synced)
  const [bcaRawText, setBcaRawText] = useState('');
  const [qlolaRawText, setQlolaRawText] = useState('');
  const [manualNama, setManualNama] = useState('');
  const [manualNominal, setManualNominal] = useState('');
  const [manualType, setManualType] = useState('DP');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Collapsible panels (UI-only, remembered per browser).
  const [setupOpen, setSetupOpen] = useState(() => {
    try { return localStorage.getItem('gsm:setupOpen') !== '0'; } catch { return true; }
  });
  const [statusOpen, setStatusOpen] = useState(() => {
    try { return localStorage.getItem('gsm:statusOpen') !== '0'; } catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem('gsm:setupOpen', setupOpen ? '1' : '0'); } catch { /* ignore */ } }, [setupOpen]);
  useEffect(() => { try { localStorage.setItem('gsm:statusOpen', statusOpen ? '1' : '0'); } catch { /* ignore */ } }, [statusOpen]);

  // Version bookkeeping to ignore our own SSE echoes and avoid clobbering.
  const versionRef = useRef(0);
  const saveTimerRef = useRef(null);
  const pendingSaveRef = useRef(false);
  const streamRef = useRef(null);

  const tabs = data.tabs;
  const activeTabId = data.activeTabId;
  const queueList = data.queuesByTab[activeTabId] || [];
  const shiftName = data.shiftName;
  const selectedBank = data.selectedBank;
  const saldoAwalByTab = data.saldoAwalByTab || {};
  const manualSaldoAwalRaw = saldoAwalByTab[activeTabId] || '';
  const hasManualSaldoAwal = String(manualSaldoAwalRaw).trim() !== '';
  const shiftNoByTab = data.shiftNoByTab || {};
  const currentShiftNo = shiftNoByTab[activeTabId] || 1;

  // Which past shifts the user has temporarily unlocked for editing (UI-only,
  // not synced). Keyed by `${tabId}#${shiftNo}` so it's per-tab.
  const [unlockedShifts, setUnlockedShifts] = useState(() => new Set());
  const isShiftUnlocked = useCallback(
    (shiftNo) => unlockedShifts.has(`${activeTabId}#${shiftNo}`),
    [unlockedShifts, activeTabId],
  );
  const toggleUnlockShift = useCallback((shiftNo) => {
    setUnlockedShifts(prev => {
      const next = new Set(prev);
      const key = `${activeTabId}#${shiftNo}`;
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, [activeTabId]);

  const activeTab = useMemo(
    () => tabs.find(tab => tab.id === activeTabId) || tabs[0] || DEFAULT_TAB,
    [tabs, activeTabId],
  );

  // Which paste inputs to show depends on the active tab's bank:
  //   BCA -> Paste Mutasi BCA + manual;  BRI -> Paste Mutasi Qlola + manual;
  //   bank lain (BNI, MANDIRI, dll) -> manual saja.
  const activeBankUpper = String(activeTab?.bank || activeTab?.name || '').toUpperCase();
  const showBcaPaste = /\bBCA\b/.test(activeBankUpper);
  const showQlolaPaste = /\bBRI\b/.test(activeBankUpper);

  // ── Normalize a loaded snapshot into a complete state object ───────────────
  const normalizeState = useCallback((raw) => {
    if (!raw || typeof raw !== 'object') return emptyState;
    const tabs = Array.isArray(raw.tabs) && raw.tabs.length ? raw.tabs : [DEFAULT_TAB];
    const queuesByTab = raw.queuesByTab && typeof raw.queuesByTab === 'object' ? raw.queuesByTab : {};
    // ensure every tab has a queue array
    for (const t of tabs) {
      if (!Array.isArray(queuesByTab[t.id])) queuesByTab[t.id] = [];
    }
    let activeTabId = raw.activeTabId;
    if (!tabs.some(t => t.id === activeTabId)) activeTabId = tabs[0].id;
    const saldoAwalByTab = raw.saldoAwalByTab && typeof raw.saldoAwalByTab === 'object' ? raw.saldoAwalByTab : {};
    // Shift segmentation: every row carries a shiftNo. Migrate legacy data
    // (rows with the old boolean `shiftClosed` or no shiftNo at all).
    const shiftNoByTab = raw.shiftNoByTab && typeof raw.shiftNoByTab === 'object' ? { ...raw.shiftNoByTab } : {};
    for (const t of tabs) {
      const q = queuesByTab[t.id];
      const sawClosed = q.some(r => r && r.shiftClosed);
      let maxNo = 1;
      for (const r of q) {
        if (r && typeof r.shiftNo !== 'number') {
          r.shiftNo = r.shiftClosed ? 1 : (sawClosed ? 2 : 1);
        }
        if (r && r.shiftNo > maxNo) maxNo = r.shiftNo;
      }
      if (typeof shiftNoByTab[t.id] !== 'number' || shiftNoByTab[t.id] < maxNo) {
        shiftNoByTab[t.id] = maxNo;
      }
    }
    return {
      tabs,
      activeTabId,
      queuesByTab,
      saldoAwalByTab,
      shiftNoByTab,
      shiftName: typeof raw.shiftName === 'string' ? raw.shiftName : '',
      selectedBank: typeof raw.selectedBank === 'string' && raw.selectedBank ? raw.selectedBank : 'BCA',
    };
  }, [emptyState]);

  // ── Push current state to the server (debounced) ──────────────────────────
  const scheduleSave = useCallback((nextData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = true;
    saveTimerRef.current = setTimeout(async () => {
      const result = await putState(webId, nextData, webName);
      if (result.ok) {
        versionRef.current = result.data.version;
      }
      pendingSaveRef.current = false;
    }, 500);
  }, [webId, webName]);

  // ── The single mutator: update local state + schedule server save ─────────
  const mutate = useCallback((producer) => {
    setData(prev => {
      const next = producer(prev);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // ── Initial load + SSE subscription ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getState(webId);
      if (cancelled) return;
      if (result.ok) {
        versionRef.current = result.data.version || 0;
        setData(result.data.state ? normalizeState(result.data.state) : emptyState);
      } else {
        setData(emptyState);
      }
      setLoaded(true);
    })();

    const handle = subscribeStream(webId, (payload) => {
      if (cancelled) return;
      if (payload.deleted) return;
      setConnected(true);
      // Ignore snapshots that aren't newer than what we have, and skip while we
      // have a pending local save (our own change in flight).
      if (typeof payload.version === 'number' && payload.version <= versionRef.current) return;
      if (pendingSaveRef.current) return;
      versionRef.current = payload.version || versionRef.current;
      if (payload.state) {
        setData(normalizeState(payload.state));
      }
    }, () => {
      if (!cancelled) setConnected(false);
    });
    streamRef.current = handle;

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (streamRef.current) streamRef.current.close();
    };
  }, [webId, normalizeState, emptyState]);

  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), []);
  const runConfirmDialog = useCallback(() => {
    const action = confirmDialog?.onConfirm;
    setConfirmDialog(null);
    if (action) action();
  }, [confirmDialog]);

  // ── Setters that go through mutate ────────────────────────────────────────
  const setShiftName = useCallback((value) => {
    mutate(prev => ({ ...prev, shiftName: value }));
  }, [mutate]);

  const setSelectedBank = useCallback((value) => {
    mutate(prev => ({ ...prev, selectedBank: value }));
  }, [mutate]);

  // Per-tab "Saldo Awal" — a marker so the running balance (saldo berjalan)
  // continues correctly across subsequent mutasi pastes for this bank.
  const setSaldoAwalForActive = useCallback((value) => {
    mutate(prev => ({
      ...prev,
      saldoAwalByTab: { ...(prev.saldoAwalByTab || {}), [prev.activeTabId]: cleanNominal(value) },
    }));
  }, [mutate]);

  const switchTab = useCallback((tabId) => {
    mutate(prev => (prev.activeTabId === tabId ? prev : { ...prev, activeTabId: tabId }));
  }, [mutate]);

  const setQueueForActive = useCallback((updater) => {
    mutate(prev => {
      const current = prev.queuesByTab[prev.activeTabId] || [];
      const nextQueue = typeof updater === 'function' ? updater(current) : updater;
      return {
        ...prev,
        queuesByTab: { ...prev.queuesByTab, [prev.activeTabId]: nextQueue },
      };
    });
  }, [mutate]);

  const createQueueItem = useCallback((nama, nominal, type, saldoAkhir = '', bank) => {
    // Bank default mengikuti baris TERAKHIR di tab ini; kalau belum ada baris,
    // ikut NAMA TAB aktif. Tetap bisa diedit per baris.
    const resolvedBank = (bank != null && String(bank).trim())
      ? String(bank).trim()
      : String(queueList[queueList.length - 1]?.bank || activeTab?.name || activeTab?.bank || 'BCA').trim();
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      nama: String(nama || '').trim(),
      nominal: cleanNominal(nominal),
      type,
      bank: resolvedBank,
      userId: '',
      sub: shiftName,
      saldoAkhir: cleanNominal(saldoAkhir),
      shiftNo: currentShiftNo,
      timestamp: new Date().toISOString(),
    };
  }, [queueList, activeTab, shiftName, currentShiftNo]);

  const addQueueItems = useCallback((items) => {
    if (!items.length) return;
    setQueueForActive(prev => [...prev, ...items]);
  }, [setQueueForActive]);

  const updateRow = useCallback((id, field, value) => {
    setQueueForActive(prev => prev.map(row => {
      if (row.id !== id) return row;
      const normalizedValue = field === 'nominal' || field === 'saldoAkhir' ? cleanNominal(value) : value;
      return { ...row, [field]: normalizedValue };
    }));
  }, [setQueueForActive]);

  const deleteRow = useCallback((id) => {
    setQueueForActive(prev => prev.filter(row => row.id !== id));
    toast.success('Baris dihapus');
  }, [setQueueForActive]);

  // Copy saldo akhir dengan format ribuan koma (untuk Ctrl+F di iBanking).
  const copySaldo = useCallback(async (rawSaldo) => {
    const digits = cleanNominal(rawSaldo);
    if (!digits) { toast.error('Saldo kosong'); return; }
    const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    try {
      await navigator.clipboard.writeText(formatted);
      toast.success(`Saldo ${formatted} dicopy`);
    } catch {
      toast.error('Gagal copy saldo');
    }
  }, []);

  const handleAddTab = useCallback(() => {
    if (!shiftName.trim()) { toast.error('Isi SUB terlebih dahulu'); return; }
    const bankName = selectedBank.trim();
    if (!bankName) { toast.error('Isi nama bank terlebih dahulu'); return; }
    const newTab = {
      id: `${bankName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: bankName,
      bank: bankName,
    };
    mutate(prev => ({
      ...prev,
      tabs: [...prev.tabs, newTab],
      activeTabId: newTab.id,
      queuesByTab: { ...prev.queuesByTab, [newTab.id]: [] },
    }));
    toast.success(`${newTab.name} ditambahkan`);
  }, [shiftName, selectedBank, mutate]);

  const handleDeleteTab = useCallback((tabId) => {
    const tabName = tabs.find(tab => tab.id === tabId)?.name || 'tab ini';
    setConfirmDialog({
      title: 'Hapus Tab Bank?',
      message: `Tab ${tabName} dan semua data antreannya akan dihapus permanen.`,
      confirmLabel: 'Hapus Tab',
      cancelLabel: 'Batal',
      variant: 'danger',
      onConfirm: () => {
        mutate(prev => {
          const remaining = prev.tabs.filter(tab => tab.id !== tabId);
          const nextQueues = { ...prev.queuesByTab };
          delete nextQueues[tabId];
          const nextSaldoAwal = { ...(prev.saldoAwalByTab || {}) };
          delete nextSaldoAwal[tabId];
          if (remaining.length) {
            const nextActive = prev.activeTabId === tabId ? remaining[0].id : prev.activeTabId;
            return { ...prev, tabs: remaining, activeTabId: nextActive, queuesByTab: nextQueues, saldoAwalByTab: nextSaldoAwal };
          }
          return {
            ...prev,
            tabs: [DEFAULT_TAB],
            activeTabId: DEFAULT_TAB.id,
            queuesByTab: { [DEFAULT_TAB.id]: [] },
            saldoAwalByTab: {},
          };
        });
        toast.success('Tab dihapus');
      },
    });
  }, [tabs, mutate]);

  const [editingTabId, setEditingTabId] = useState(null);
  const [editingTabName, setEditingTabName] = useState('');

  const handleRenameTab = useCallback((tabId, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error('Nama tab tidak boleh kosong');
      return;
    }
    mutate(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => (tab.id === tabId ? { ...tab, name: trimmed, bank: trimmed } : tab)),
    }));
    if (tabId === activeTabId) {
      setSelectedBank(trimmed);
    }
    toast.success(`Tab diubah menjadi "${trimmed}"`);
  }, [mutate, activeTabId, setSelectedBank]);

  const startRenameTab = useCallback((tab) => {
    setEditingTabId(tab.id);
    setEditingTabName(tab.name);
  }, []);

  const saveRenameTab = useCallback((tabId) => {
    const trimmed = editingTabName.trim();
    const currentTab = tabs.find(t => t.id === tabId);
    if (trimmed && currentTab && trimmed !== currentTab.name) {
      handleRenameTab(tabId, trimmed);
    }
    setEditingTabId(null);
    setEditingTabName('');
  }, [editingTabName, tabs, handleRenameTab]);

  const handleManualSubmit = useCallback((event) => {
    event.preventDefault();
    if (!manualNama.trim() || !manualNominal.trim()) {
      toast.error('Nama dan nominal wajib diisi');
      return;
    }
    const lastRow = queueList[queueList.length - 1];
    let baseSaldo = lastRow?.saldoAkhir ? parseNumber(lastRow.saldoAkhir) : null;
    if (baseSaldo === null && hasManualSaldoAwal) baseSaldo = parseNumber(manualSaldoAwalRaw);
    const manualNominalNum = parseNumber(manualNominal);
    let computedSaldo = '';
    if (baseSaldo !== null) {
      const delta = manualType === 'DP' ? manualNominalNum : -manualNominalNum;
      computedSaldo = String(baseSaldo + delta);
    }
    addQueueItems([createQueueItem(manualNama, manualNominal, manualType, computedSaldo)]);
    setManualNama('');
    setManualNominal('');
    setManualType('DP');
    toast.success('Data manual ditambahkan');
  }, [manualNama, manualNominal, manualType, queueList, addQueueItems, createQueueItem, hasManualSaldoAwal, manualSaldoAwalRaw]);

  const handleExtractBca = useCallback(() => {
    if (!bcaRawText.trim()) { toast.error('Paste teks mutasi BCA dulu'); return; }
    const parsed = extractBcaMutationLines(bcaRawText, { selectedBank });
    const items = parsed.map(item =>
      createQueueItem(item.nama, item.nominal, item.type, item.saldoAkhir),
    );
    if (!items.length) { toast.error('Tidak ada data BCA valid ditemukan'); return; }
    addQueueItems(items);
    setBcaRawText('');
    toast.success(`${items.length} baris berhasil diproses`);
  }, [bcaRawText, selectedBank, addQueueItems, createQueueItem]);

  const handleExtractQlola = useCallback(() => {
    if (!qlolaRawText.trim()) { toast.error('Paste teks mutasi Qlola dulu'); return; }
    const parsed = extractQlolaMutationLines(qlolaRawText);
    const items = parsed.map(item =>
      createQueueItem(item.nama, item.nominal, item.type, item.saldoAkhir),
    );
    if (!items.length) { toast.error('Tidak ada data Qlola valid ditemukan'); return; }
    addQueueItems(items);
    setQlolaRawText('');
    toast.success(`${items.length} baris Qlola berhasil diproses`);
  }, [qlolaRawText, selectedBank, addQueueItems, createQueueItem]);

  const totals = useMemo(() => {
    const totalDeposit = queueList.filter(row => row.type === 'DP').reduce((sum, row) => sum + parseNumber(row.nominal), 0);
    const totalTransfer = queueList.filter(row => row.type === 'TRANSFER' || row.type === 'BIAYA ADMIN').reduce((sum, row) => sum + parseNumber(row.nominal), 0);
    const firstRow = queueList[0];
    const firstDelta = firstRow ? (firstRow.type === 'DP' ? parseNumber(firstRow.nominal) : -parseNumber(firstRow.nominal)) : 0;
    const derivedSaldoAwal = firstRow?.saldoAkhir ? parseNumber(firstRow.saldoAkhir) - firstDelta : 0;
    const saldoAwal = hasManualSaldoAwal ? parseNumber(manualSaldoAwalRaw) : derivedSaldoAwal;
    const saldoAkhir = queueList.length ? parseNumber(queueList[queueList.length - 1].saldoAkhir) : saldoAwal;
    const saldoKalkulasi = saldoAwal + totalDeposit - totalTransfer;
    const selisih = saldoAkhir - saldoKalkulasi;
    return { totalDeposit, totalTransfer, saldoAwal, saldoAkhir, saldoKalkulasi, selisih };
  }, [queueList, hasManualSaldoAwal, manualSaldoAwalRaw]);

  const expectedSaldoByRow = useMemo(() => {
    const map = new Map();
    let currentBase = totals.saldoAwal;
    queueList.forEach(row => {
      const delta = row.type === 'DP' ? parseNumber(row.nominal) : -parseNumber(row.nominal);
      const expected = currentBase + delta;
      map.set(row.id, expected);

      // Re-sync base saldo for subsequent rows: if row has an explicit mutasi saldo, use it!
      const hasActual = String(row.saldoAkhir || '').trim() !== '';
      if (hasActual) {
        currentBase = parseNumber(row.saldoAkhir);
      } else {
        currentBase = expected;
      }
    });
    return map;
  }, [queueList, totals.saldoAwal]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return queueList;
    return queueList.filter(row => [row.nama, row.userId, row.nominal, row.type, row.bank, row.saldoAkhir]
      .some(value => String(value || '').toLowerCase().includes(keyword)));
  }, [queueList, searchTerm]);

  // Rows belonging to the current (open) shift — what the footer copy targets.
  const currentShiftRows = useMemo(
    () => queueList.filter(row => (row.shiftNo || 1) === currentShiftNo),
    [queueList, currentShiftNo],
  );
  const pastShiftCount = queueList.length - currentShiftRows.length;

  const completedRows = useMemo(() => currentShiftRows.filter(row => String(row.userId || '').trim() !== ''), [currentShiftRows]);

  // Build the Doc TRX TSV from an arbitrary set of rows.
  const buildDocTrxTsv = useCallback((rows) => {
    const date = getExportDate();
    return rows.map(row => [
      sanitizeTsvCell(row.nama),
      sanitizeTsvCell(' '),
      sanitizeTsvCell(parseNumber(row.nominal) < 10000 ? '*NULL*' : row.userId),
      sanitizeTsvCell(row.sub || shiftName),
      sanitizeTsvCell(row.type),
      sanitizeTsvCell(row.type === 'DP' ? row.nominal : ' '),
      sanitizeTsvCell(row.type === 'TRANSFER' ? row.nominal : ' '),
      sanitizeTsvCell(' '),
      sanitizeTsvCell(date),
      sanitizeTsvCell(row.bank),
      sanitizeTsvCell(row.saldoAkhir),
    ].join('\t')).join('\n');
  }, [shiftName]);

  const handleCopyDocTrx = useCallback(async () => {
    if (!currentShiftRows.length) { toast.error('Tidak ada mutasi shift berjalan untuk dicopy'); return; }
    try {
      await navigator.clipboard.writeText(buildDocTrxTsv(currentShiftRows));
      toast.success(`${currentShiftRows.length} baris shift berjalan dicopy ke Doc TRX`);
    } catch {
      toast.error('Gagal copy ke clipboard');
    }
  }, [currentShiftRows, buildDocTrxTsv]);

  // Manual copy of a specific (past) shift segment.
  const copyShiftSegment = useCallback(async (shiftNo) => {
    const rows = queueList.filter(row => (row.shiftNo || 1) === shiftNo);
    if (!rows.length) { toast.error('Tidak ada baris di shift ini'); return; }
    try {
      await navigator.clipboard.writeText(buildDocTrxTsv(rows));
      toast.success(`Shift ${shiftNo}: ${rows.length} baris dicopy ke Doc TRX`);
    } catch {
      toast.error('Gagal copy ke clipboard');
    }
  }, [queueList, buildDocTrxTsv]);

  // Ganti Shift: mark the end of the current shift by starting a new shift
  // number. Past rows stay visible (saldo berjalan stays continuous) and are
  // locked by default, but can be unlocked + copied manually per segment.
  const handleGantiShift = useCallback(() => {
    if (!currentShiftRows.length) { toast.error('Belum ada mutasi di shift berjalan'); return; }
    setConfirmDialog({
      title: 'Ganti Shift?',
      message: `Tandai akhir shift berjalan (${currentShiftRows.length} baris). Shift baru mulai di bawah garis GANTI SHIFT, dan copy-annya TIDAK tergabung dengan shift ini. Baris shift ini terkunci, tapi bisa dibuka lagi & dicopy manual kapan saja. Pastikan sudah klik "Copy To Doc TRX" lebih dulu.`,
      confirmLabel: 'Ganti Shift',
      cancelLabel: 'Batal',
      onConfirm: () => {
        mutate(prev => ({
          ...prev,
          shiftNoByTab: {
            ...(prev.shiftNoByTab || {}),
            [prev.activeTabId]: (prev.shiftNoByTab?.[prev.activeTabId] || 1) + 1,
          },
        }));
        toast.success('Shift baru dimulai. Copy-an shift berikutnya dimulai dari baris baru.');
      },
    });
  }, [currentShiftRows, mutate]);

  const handleResetShift = useCallback(() => {
    setConfirmDialog({
      title: 'Reset Tab Ini?',
      message: 'SEMUA baris pada tab ini (termasuk yang sudah terkunci) akan dihapus permanen. Gunakan ini untuk mulai bersih, misalnya pergantian hari. Pastikan semua data sudah dicopy ke Doc TRX.',
      confirmLabel: 'Reset Tab',
      cancelLabel: 'Batal',
      variant: 'danger',
      onConfirm: () => {
        setQueueForActive([]);
        toast.success('Data tab aktif direset');
      },
    });
  }, [setQueueForActive]);

  const glassCard = 'neu-card border-2 border-[#D5C988] bg-[#FDFBD4] rounded-2xl shadow-md p-4';
  const labelClass = 'text-[10px] font-black uppercase tracking-wider text-[#596B4F] whitespace-nowrap truncate';
  const inputClass = 'neu-inset h-9 w-full rounded-xl border border-[#E8E2B5] px-3 text-xs font-bold text-[#23321B] outline-none transition placeholder:text-[#596B4F]/60 focus:ring-2 focus:ring-[#74A355]';
  const tableInputClass = 'h-8 w-full min-w-0 rounded-lg border-none bg-transparent px-2 text-xs font-bold text-[#23321B] outline-none transition focus:bg-white focus:ring-1 focus:ring-[#74A355]';

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-[#596B4F]">
          <RefreshCw className="h-5 w-5 animate-spin text-[#74A355]" />
          <span className="text-sm font-extrabold">Memuat mutasi {webName}...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden">
      {/* Top Bar Header */}
      <div className="flex items-center justify-between gap-4 rounded-2xl neu-card border-2 border-[#D5C988] bg-[#FDFBD4] p-3 shadow-md shrink-0">
        <button
          type="button"
          onClick={onExit}
          title="Kembali ke pilihan web"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E8E2B5] neu-flat px-4 text-xs font-extrabold uppercase text-[#23321B] transition hover:bg-white cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 text-[#74A355]" />
          <span>Kembali ke Pilih Web</span>
        </button>
        <div className="flex items-center gap-3">
          {webLogo ? (
            <img src={webLogo} alt="" className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <Globe className="h-6 w-6 text-[#74A355]" />
          )}
          <span className="rounded-xl clay-btn-green px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-sm">
            DIVISI WEB: {webName}
          </span>
        </div>
      </div>

      {/* Setup & Input Panels */}
      <section className={`${glassCard} w-full shrink-0 overflow-hidden`}>
        <div className="grid gap-3">
          {/* Step 1: Setup Shift & Bank */}
          <div className="rounded-xl border border-[#D5C988] bg-[#FFFEE6] p-3 shadow-sm">
            <div className={`grid gap-3 xl:items-center transition-all duration-300 ${setupOpen ? 'xl:grid-cols-[200px_160px_200px_minmax(0,1fr)]' : 'xl:grid-cols-[200px_0px_0px_minmax(0,1fr)]'}`}>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSetupOpen(o => !o)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E8E2B5] neu-flat text-[#596B4F] transition hover:bg-white"
                  title={setupOpen ? 'Ciutkan Sub & Bank' : 'Buka Sub & Bank'}
                >
                  {setupOpen ? <ChevronLeft className="h-4 w-4 text-[#74A355]" /> : <ChevronRight className="h-4 w-4 text-[#74A355]" />}
                </button>
                <span className="flex h-7 w-7 items-center justify-center rounded-xl clay-btn-green text-xs font-black text-white shadow-sm shrink-0">1</span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-[#23321B]">Setup Shift</p>
                  <p className="text-[10px] font-semibold text-[#596B4F]">Shift, bank, & tab.</p>
                </div>
              </div>
              <label className={`grid grid-cols-[40px_minmax(0,1fr)] items-center gap-1.5 overflow-hidden transition-all duration-200 ${setupOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <span className="text-[10px] font-black uppercase tracking-wider text-[#596B4F]">Sub</span>
                <input value={shiftName} onChange={event => setShiftName(event.target.value)} className={inputClass} placeholder="BOT / PAGI" />
              </label>
              <label className={`grid grid-cols-[46px_minmax(0,1fr)] items-center gap-1.5 overflow-hidden transition-all duration-200 ${setupOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <span className="text-[10px] font-black uppercase tracking-wider text-[#596B4F]">Bank</span>
                <input
                  type="text"
                  value={selectedBank}
                  onChange={event => setSelectedBank(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && selectedBank.trim() && activeTab && selectedBank.trim() !== activeTab.name) {
                      handleRenameTab(activeTab.id, selectedBank.trim());
                    }
                  }}
                  onBlur={() => {
                    if (selectedBank.trim() && activeTab && selectedBank.trim() !== activeTab.name) {
                      handleRenameTab(activeTab.id, selectedBank.trim());
                    }
                  }}
                  className={inputClass}
                  placeholder="Mis: BCA"
                  title="Tekan Enter atau klik luar untuk memperbarui nama tab aktif"
                />
              </label>
              <div className="grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#596B4F]">Tab Bank</span>
                <div className="flex min-w-0 items-end gap-1.5 overflow-x-auto border-b border-[#D5C988] pb-1">
                  {tabs.map(tab => {
                    const isEditing = editingTabId === tab.id;
                    const isActive = activeTabId === tab.id;
                    return (
                      <div key={tab.id} className="relative group shrink-0 flex items-center">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingTabName}
                            onChange={e => setEditingTabName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveRenameTab(tab.id);
                              if (e.key === 'Escape') { setEditingTabId(null); setEditingTabName(''); }
                            }}
                            onBlur={() => saveRenameTab(tab.id)}
                            autoFocus
                            onFocus={e => e.target.select()}
                            className="h-8 rounded-xl border-2 border-[#74A355] bg-white px-2.5 text-[11px] font-black text-[#23321B] outline-none shadow-md w-28 transition-all"
                            placeholder="Nama Tab..."
                          />
                        ) : (
                          <div className="relative flex items-center">
                            <button
                              type="button"
                              onClick={() => switchTab(tab.id)}
                              onDoubleClick={() => startRenameTab(tab)}
                              className={`h-8 rounded-xl border pl-3 pr-11 text-[11px] font-black transition cursor-pointer flex items-center gap-1.5 ${isActive ? 'border-[#74A355] bg-[#74A355] text-white shadow-sm' : 'border-[#E8E2B5] neu-flat text-[#23321B] hover:bg-white'}`}
                              title="Klik untuk pilih | Double click (2x) untuk rename tab"
                            >
                              <span>{tab.name}</span>
                            </button>
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); startRenameTab(tab); }}
                                className={`flex h-4 w-4 items-center justify-center rounded-full transition cursor-pointer ${isActive ? 'text-white/80 hover:text-white hover:bg-white/20' : 'text-[#596B4F] hover:text-[#23321B] hover:bg-[#E8E2B5]'}`}
                                title="Edit / Rename Tab (Klik 2x)"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </button>
                              {tabs.length > 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTab(tab.id); }}
                                  className={`flex h-4 w-4 items-center justify-center rounded-full transition cursor-pointer ${isActive ? 'text-white/80 hover:text-rose-200 hover:bg-white/20' : 'text-rose-600 hover:bg-rose-100'}`}
                                  title="Hapus tab"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" onClick={handleAddTab} className="h-8 shrink-0 rounded-xl clay-btn-green px-3 text-[11px] font-black uppercase tracking-wider text-white shadow-sm transition cursor-pointer" title="Tambah tab bank">
                    + Tambah
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Input Mutasi */}
          <div className="rounded-xl border border-[#D5C988] bg-[#FFFEE6] p-3 shadow-sm">
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl clay-btn-green text-xs font-black text-white shadow-sm shrink-0">2</span>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#23321B]">Input Mutasi</p>
                <p className="text-[10px] font-semibold text-[#596B4F]">Paste mutasi BCA / Qlola atau input manual data mutasi baru.</p>
              </div>
            </div>
            <div className="grid gap-2.5">
              {showBcaPaste && (
              <div className="grid gap-2 rounded-xl border border-[#E8E2B5] bg-[#FDFBD4] p-3 xl:grid-cols-[220px_minmax(0,1fr)_140px] xl:items-center">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#23321B]">Paste Mutasi BCA</p>
                  <p className="text-[10px] font-semibold text-[#596B4F]">Paste teks mutasi dari BCA, lalu klik proses.</p>
                </div>
                <textarea rows={2} value={bcaRawText} onChange={event => setBcaRawText(event.target.value)} className="neu-inset min-h-[50px] resize-none rounded-xl border border-[#E8E2B5] p-2.5 text-xs font-bold text-[#23321B] outline-none transition placeholder:text-[#596B4F]/60 focus:ring-2 focus:ring-[#74A355]" placeholder="Paste mutasi BCA di sini..." />
                <button onClick={handleExtractBca} className="clay-btn-green h-full min-h-[46px] rounded-xl px-4 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition cursor-pointer">
                  Proses Mutasi
                </button>
              </div>
              )}
              {showQlolaPaste && (
              <div className="grid gap-2 rounded-xl border border-[#E8E2B5] bg-[#FDFBD4] p-3 xl:grid-cols-[220px_minmax(0,1fr)_140px] xl:items-center">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#23321B]">Paste Mutasi Qlola</p>
                  <p className="text-[10px] font-semibold text-[#596B4F]">Paste teks mutasi Qlola, lalu klik proses.</p>
                </div>
                <textarea rows={2} value={qlolaRawText} onChange={event => setQlolaRawText(event.target.value)} className="neu-inset min-h-[50px] resize-none rounded-xl border border-[#E8E2B5] p-2.5 text-xs font-bold text-[#23321B] outline-none transition placeholder:text-[#596B4F]/60 focus:ring-2 focus:ring-[#74A355]" placeholder="Paste mutasi Qlola di sini..." />
                <button onClick={handleExtractQlola} className="clay-btn-green h-full min-h-[46px] rounded-xl px-4 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition cursor-pointer">
                  Proses Qlola
                </button>
              </div>
              )}
              <form onSubmit={handleManualSubmit} className="grid gap-2 rounded-xl border border-[#E8E2B5] bg-[#FDFBD4] p-3 xl:grid-cols-[200px_minmax(0,1fr)_160px_150px_110px] xl:items-center">
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#23321B]">Input Manual</p>
                  <p className="text-[10px] font-semibold text-[#596B4F]">Data koreksi / tambahan manual.</p>
                </div>
                <input value={manualNama} onChange={event => setManualNama(event.target.value)} className={inputClass} placeholder="Nama" />
                <input value={manualNominal} onChange={event => setManualNominal(cleanNominal(event.target.value))} className={inputClass} placeholder="Nominal" />
                <select value={manualType} onChange={event => setManualType(event.target.value)} className={inputClass}>
                  {TYPE_OPTIONS.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <button type="submit" className="clay-btn-green h-9 rounded-xl px-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-md transition cursor-pointer">
                  Tambah
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Step 3: Antrean Table */}
      <section className={`${glassCard} flex min-h-0 w-full flex-1 flex-col overflow-hidden`}>
        <div className="mb-3 flex shrink-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl clay-btn-green text-xs font-black text-white shadow-sm shrink-0">3</span>
            <p className="whitespace-nowrap text-xs font-black uppercase tracking-wider text-[#23321B]">3. Cek Hasil Antrean</p>
            <span className="inline-flex items-center justify-center rounded-xl bg-[#74A355] text-white px-3.5 py-1 text-xs font-black uppercase tracking-wider shrink-0 whitespace-nowrap shadow-sm">SHIFT {currentShiftNo}</span>
            <button
              type="button"
              onClick={() => setStatusOpen(o => !o)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-[#E8E2B5] neu-flat text-[#596B4F] transition hover:bg-white"
              title={statusOpen ? 'Ciutkan status' : 'Buka status'}
            >
              {statusOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className={`flex items-center gap-3 overflow-hidden rounded-xl border border-[#E8E2B5] bg-[#FFFEE6] text-xs font-bold text-[#23321B] transition-all duration-300 ${statusOpen ? 'max-w-[600px] px-3.5 py-1.5 opacity-100' : 'max-w-0 border-transparent px-0 py-0 opacity-0'}`}>
              <span className="whitespace-nowrap"><b className="font-black text-[#23321B]">{currentShiftRows.length}</b> berjalan</span>
              <span className="h-3 w-px shrink-0 bg-[#D5C988]" />
              <span className="whitespace-nowrap text-amber-700"><b className="font-black">{currentShiftRows.length - completedRows.length}</b> pending</span>
              <span className="h-3 w-px shrink-0 bg-[#D5C988]" />
              <span className="whitespace-nowrap text-emerald-700"><b className="font-black">{completedRows.length}</b> selesai</span>
              {pastShiftCount > 0 && (
                <>
                  <span className="h-3 w-px shrink-0 bg-[#D5C988]" />
                  <span className="whitespace-nowrap text-[#596B4F]"><b className="font-black">{pastShiftCount}</b> shift lama</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-[#D5C988] bg-[#FFFEE6] px-3 py-1 shadow-sm">
              <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-wider text-[#596B4F]">Saldo Awal</span>
              <NominalInput value={manualSaldoAwalRaw} onChange={setSaldoAwalForActive} className="h-7 w-28 rounded-lg border border-[#E8E2B5] neu-inset px-2 text-xs font-bold text-[#23321B] outline-none transition placeholder:text-[#596B4F]/60 focus:ring-2 focus:ring-[#74A355]" placeholder="0" />
            </label>
            <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="h-9 w-full rounded-xl border border-[#E8E2B5] neu-inset px-3 text-xs font-bold text-[#23321B] outline-none transition focus:ring-2 focus:ring-[#74A355] md:w-48" placeholder="Cari data..." />
          </div>
        </div>

        <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden rounded-xl border-2 border-[#D5C988] bg-[#FFFEE6] shadow-inner">
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#E8E2B5] text-[#23321B] border-b-2 border-[#D5C988] shadow-sm">
              <tr className="text-[11px] font-black uppercase tracking-wider">
                <th className="w-[18%] px-3 py-2.5">Nama</th>
                <th className="w-[15%] px-3 py-2.5">User ID</th>
                <th className="w-[12%] px-3 py-2.5">Nominal</th>
                <th className="w-[12%] px-3 py-2.5">Tipe</th>
                <th className="w-[12%] px-3 py-2.5">Bank</th>
                <th className="w-[12%] px-3 py-2.5">Saldo Akhir</th>
                <th className="w-[10%] px-3 py-2.5">Validasi</th>
                <th className="w-[9%] px-3 py-2.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm font-extrabold text-[#596B4F]">Belum ada antrean. Input data dari panel di atas.</td>
                </tr>
              ) : filteredRows.map((row, index) => {
                const rowShiftNo = row.shiftNo || 1;
                const prevRow = index > 0 ? filteredRows[index - 1] : null;
                const prevShiftNo = prevRow ? (prevRow.shiftNo || 1) : null;
                const showDivider = !searchTerm.trim() && prevShiftNo !== null && rowShiftNo !== prevShiftNo;
                const dividerShiftNo = prevShiftNo; // segment that just ended (past shift)
                const isPast = rowShiftNo < currentShiftNo;
                const locked = isPast && !isShiftUnlocked(rowShiftNo);
                const hasUserId = String(row.userId || '').trim() !== '';
                const expectedSaldo = expectedSaldoByRow.get(row.id) || 0;
                const hasSaldo = String(row.saldoAkhir || '').trim() !== '';
                const isMismatch = !locked && hasSaldo && parseNumber(row.saldoAkhir) !== expectedSaldo;
                // Nominal di bawah 10.000 (0–9.999) tidak boleh diproses -> User ID *NULL*.
                const belowMin = parseNumber(row.nominal) < 10000;
                const isLastRow = index === filteredRows.length - 1;
                const showTrailingDivider = isLastRow && !searchTerm.trim() && rowShiftNo < currentShiftNo;
                const rowClass = locked
                  ? 'bg-slate-200/80 opacity-70'
                  : isMismatch ? 'bg-rose-100/90 ring-2 ring-inset ring-rose-500' : hasUserId ? 'bg-white' : 'bg-amber-50/90';

                return (
                  <React.Fragment key={row.id}>
                    {showDivider && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <div className="flex items-center gap-3 px-4 py-1.5 bg-[#E8E2B5]/50">
                            <div className="h-px flex-1 bg-[#D5C988]" />
                            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.25em] text-[#596B4F]">Ganti Shift</span>
                            <button type="button" onClick={() => toggleUnlockShift(dividerShiftNo)} className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide transition cursor-pointer ${isShiftUnlocked(dividerShiftNo) ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white text-[#23321B] border border-[#D5C988] hover:bg-[#FFFEE6]'}`}>
                              {isShiftUnlocked(dividerShiftNo) ? 'Kunci' : 'Buka Kunci'}
                            </button>
                            <button type="button" onClick={() => copyShiftSegment(dividerShiftNo)} className="rounded-lg clay-btn-green px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white transition cursor-pointer">
                              Copy Shift {dividerShiftNo}
                            </button>
                            <div className="h-px flex-1 bg-[#D5C988]" />
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr className={`${rowClass} transition border-b border-[#E8E2B5]/70 hover:bg-[#FDFBD4]`}>
                      <td className="px-2 py-1.5"><input value={row.nama} disabled={locked} onChange={event => updateRow(row.id, 'nama', event.target.value)} className={tableInputClass} /></td>
                      <td className="px-2 py-1.5">{belowMin ? (
                        <span className="block px-2 text-xs font-black text-rose-600" title="Nominal di bawah 10.000 — tidak boleh diproses">*NULL*</span>
                      ) : (
                        <input value={row.userId} disabled={locked} onChange={event => updateRow(row.id, 'userId', event.target.value)} className={tableInputClass} placeholder="opsional" />
                      )}</td>
                      <td className="px-2 py-1.5"><NominalInput value={row.nominal} disabled={locked} onChange={value => updateRow(row.id, 'nominal', value)} className={tableInputClass} /></td>
                      <td className="px-2 py-1.5"><select value={row.type} disabled={locked} onChange={event => updateRow(row.id, 'type', event.target.value)} className={tableInputClass}>{TYPE_OPTIONS.map(type => <option key={type} value={type}>{type}</option>)}</select></td>
                      <td className="px-2 py-1.5"><input value={row.bank} disabled={locked} onChange={event => updateRow(row.id, 'bank', event.target.value)} className={tableInputClass} /></td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <NominalInput value={row.saldoAkhir} disabled={locked} onChange={value => updateRow(row.id, 'saldoAkhir', value)} className={tableInputClass} placeholder={String(expectedSaldo)} sep="," />
                          <button type="button" onClick={() => copySaldo(row.saldoAkhir)} title="Copy saldo (untuk Ctrl+F di iBanking)" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[#596B4F] transition hover:bg-[#74A355] hover:text-white cursor-pointer">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${locked ? 'bg-slate-500 text-white' : belowMin ? 'bg-rose-600 text-white' : isMismatch ? 'bg-rose-600 text-white' : hasUserId ? 'bg-[#74A355] text-white' : 'bg-amber-400 text-amber-950'}`}>
                          {locked ? `SHIFT ${rowShiftNo}` : belowMin ? '*NULL*' : isMismatch ? 'ERROR' : hasUserId ? 'SELESAI' : 'PENDING'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {locked ? (
                          <Lock className="mx-auto h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <button onClick={() => deleteRow(row.id)} className="rounded-lg bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase text-white transition hover:bg-rose-700 cursor-pointer">Hapus</button>
                        )}
                      </td>
                    </tr>
                    {showTrailingDivider && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <div className="flex items-center gap-3 px-4 py-1.5 bg-[#E8E2B5]/50">
                            <div className="h-px flex-1 bg-[#D5C988]" />
                            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.25em] text-[#596B4F]">Ganti Shift</span>
                            <button type="button" onClick={() => toggleUnlockShift(rowShiftNo)} className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide transition cursor-pointer ${isShiftUnlocked(rowShiftNo) ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white text-[#23321B] border border-[#D5C988] hover:bg-[#FFFEE6]'}`}>
                              {isShiftUnlocked(rowShiftNo) ? 'Kunci' : 'Buka Kunci'}
                            </button>
                            <button type="button" onClick={() => copyShiftSegment(rowShiftNo)} className="rounded-lg clay-btn-green px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white transition cursor-pointer">
                              Copy Shift {rowShiftNo}
                            </button>
                            <div className="h-px flex-1 bg-[#D5C988]" />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom Summary & Actions */}
      <section className={`${glassCard} shrink-0`}>
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="flex flex-col justify-center rounded-xl border border-[#D5C988] bg-[#FFFEE6] px-3.5 py-2.5 shadow-sm min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black uppercase text-[#596B4F] tracking-wide leading-none">Saldo Awal</span>
              <span className="text-xs sm:text-sm font-mono font-black text-[#23321B] mt-2 leading-none">{formatNumber(totals.saldoAwal)}</span>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-[#D5C988] bg-[#FFFEE6] px-3.5 py-2.5 shadow-sm min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black uppercase text-[#596B4F] tracking-wide leading-none">Deposit</span>
              <span className="text-xs sm:text-sm font-mono font-black text-emerald-700 mt-2 leading-none">{formatNumber(totals.totalDeposit)}</span>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-[#D5C988] bg-[#FFFEE6] px-3.5 py-2.5 shadow-sm min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black uppercase text-[#596B4F] tracking-wide leading-none">Transfer</span>
              <span className="text-xs sm:text-sm font-mono font-black text-rose-700 mt-2 leading-none">{formatNumber(totals.totalTransfer)}</span>
            </div>
            <div className="flex flex-col justify-center rounded-xl border border-[#D5C988] bg-[#FFFEE6] px-3.5 py-2.5 shadow-sm min-w-0">
              <span className="text-[9px] sm:text-[10px] font-black uppercase text-[#596B4F] tracking-wide leading-none">Saldo Akhir</span>
              <span className="text-xs sm:text-sm font-mono font-black text-[#23321B] mt-2 leading-none">{formatNumber(totals.saldoAkhir)}</span>
            </div>
            <div className={`flex flex-col justify-center rounded-xl px-3.5 py-2.5 shadow-sm min-w-0 ${totals.selisih === 0 ? 'border border-[#D5C988] bg-[#FFFEE6]' : 'border-2 border-rose-500 bg-rose-50'}`}>
              <span className="text-[9px] sm:text-[10px] font-black uppercase text-[#596B4F] tracking-wide leading-none">Selisih</span>
              <span className={`text-xs sm:text-sm font-mono font-black mt-2 leading-none ${totals.selisih === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatNumber(totals.selisih)}</span>
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3 xl:w-[580px]">
            <button onClick={handleCopyDocTrx} className="clay-btn-green inline-flex items-center justify-center h-11 px-5 rounded-xl text-xs font-extrabold uppercase text-white shadow-md transition-all cursor-pointer">
              Copy To Doc TRX
            </button>
            <button onClick={handleGantiShift} className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-xs font-extrabold uppercase bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md transition-all hover:brightness-110 cursor-pointer gap-1.5">
              <Lock className="h-4 w-4" /> Ganti Shift
            </button>
            <button onClick={handleResetShift} className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-xs font-extrabold uppercase bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-md transition-all hover:brightness-110 cursor-pointer">
              Reset Tab
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog dialog={confirmDialog} onCancel={closeConfirmDialog} onConfirm={runConfirmDialog} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level: web selector → workspace.
// ─────────────────────────────────────────────────────────────────────────────
export default function GigaSmartMutasi() {
  const [webs, setWebs] = useState([]);
  const [selectedWeb, setSelectedWeb] = useState('');
  const [loadingWebs, setLoadingWebs] = useState(false);
  const [addingName, setAddingName] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  // Edit-web modal state.
  const [editingWeb, setEditingWeb] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const refreshWebs = useCallback(async () => {
    setLoadingWebs(true);
    const result = await listWebs();
    setLoadingWebs(false);
    if (result.ok) {
      setWebs(result.data.webs || []);
      // Don't auto-enter a web — the lobby lets the user pick explicitly.
      // Just drop the selection if the previously selected web no longer exists.
      setSelectedWeb(prev => (prev && result.data.webs.some(w => w.id === prev) ? prev : ''));
    } else {
      toast.error('Gagal memuat daftar web (server tidak terhubung?).');
    }
  }, []);

  useEffect(() => {
    refreshWebs();
  }, [refreshWebs]);

  const selectWeb = useCallback((id) => {
    setSelectedWeb(id);
    try { localStorage.setItem(LAST_WEB_KEY, id); } catch { /* ignore */ }
  }, []);

  const handleAddWeb = useCallback(async () => {
    const name = addingName.trim();
    if (!name) { toast.error('Isi nama web.'); return; }
    const id = safeWebId(name);
    if (!id) { toast.error('Nama web tidak valid.'); return; }
    const result = await createWeb(id, name);
    if (result.ok) {
      setWebs(result.data.webs || []);
      setAddingName('');
      toast.success(`Web "${name}" ditambahkan. Klik untuk masuk.`);
    } else {
      toast.error('Gagal menambah web.');
    }
  }, [addingName]);

  const handleDeleteWeb = useCallback((web) => {
    setConfirmDialog({
      title: 'Hapus Web?',
      message: `Web "${web.name}" beserta SEMUA data mutasinya akan dihapus permanen dari server. Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus Web',
      cancelLabel: 'Batal',
      variant: 'danger',
      onConfirm: async () => {
        const result = await deleteWeb(web.id);
        if (result.ok) {
          setWebs(result.data.webs || []);
          setSelectedWeb(prev => (prev === web.id ? (result.data.webs[0]?.id || '') : prev));
          toast.success(`Web "${web.name}" dihapus.`);
        } else {
          toast.error('Gagal menghapus web.');
        }
      },
    });
  }, []);

  const openEditWeb = useCallback((web) => {
    setEditingWeb(web);
    setEditName(web.name || '');
    setEditLogo(web.logo || '');
  }, []);

  const handlePickLogo = useCallback(async (file) => {
    if (!file) return;
    const dataUrl = await fileToLogoDataUrl(file);
    if (!dataUrl) { toast.error('Gagal memproses gambar.'); return; }
    if (dataUrl.length > 280000) { toast.error('Logo terlalu besar, coba gambar lain.'); return; }
    setEditLogo(dataUrl);
  }, []);

  const saveEditWeb = useCallback(async () => {
    if (!editingWeb) return;
    const name = editName.trim();
    if (!name) { toast.error('Nama web tidak boleh kosong.'); return; }
    setSavingEdit(true);
    const result = await updateWeb(editingWeb.id, { name, logo: editLogo });
    setSavingEdit(false);
    if (result.ok) {
      setWebs(result.data.webs || []);
      setEditingWeb(null);
      toast.success('Web diperbarui.');
    } else {
      toast.error('Gagal memperbarui web.');
    }
  }, [editingWeb, editName, editLogo]);

  const selectedWebObj = webs.find(w => w.id === selectedWeb);

  // ── Workspace view: a web is selected → show its mutasi ──
  if (selectedWeb && selectedWebObj) {
    return (
      <MutasiWorkspace
        key={selectedWeb}
        webId={selectedWeb}
        webName={selectedWebObj.name}
        webLogo={selectedWebObj.logo}
        onExit={() => setSelectedWeb('')}
      />
    );
  }

  // ── Lobby view: choose a web (room) before entering its mutasi ──
  return (
    <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-start overflow-y-auto py-8 px-4">
      <div className="w-full max-w-3xl rounded-[2rem] neu-card border-2 border-[#D5C988] bg-[#FDFBD4] p-8 shadow-2xl flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl clay-btn-green shadow-md shrink-0">
            <Globe className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black uppercase tracking-wide text-[#23321B]">PILIH DIVISI WEB</h2>
            <p className="text-xs text-[#596B4F] font-semibold mt-0.5">Pilih divisi web atau tambahkan divisi baru untuk mengelola mutasi.</p>
          </div>
          <button
            type="button"
            onClick={refreshWebs}
            disabled={loadingWebs}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E8E2B5] neu-flat px-3.5 text-xs font-bold text-[#23321B] transition hover:bg-white disabled:opacity-50 cursor-pointer"
            title="Refresh daftar web"
          >
            <RefreshCw className={`h-4 w-4 text-[#74A355] ${loadingWebs ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {webs.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[#D5C988] bg-[#FFFEE6] py-12 text-center text-[#596B4F]">
            <Globe className="mx-auto mb-3 h-10 w-10 opacity-60 text-[#74A355]" />
            <p className="text-base font-extrabold text-[#23321B]">Belum Ada Web Divisi</p>
            <p className="text-xs mt-1">Tambahkan divisi web pertama Anda pada formulir di bawah ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {webs.map(web => (
              <div key={web.id} className="relative group">
                <button
                  type="button"
                  onClick={() => selectWeb(web.id)}
                  className="flex h-44 w-full flex-col items-center justify-center gap-3 rounded-2xl neu-card border-2 border-[#D5C988] bg-[#FFFEE6] p-4 text-[#23321B] transition-all hover:border-[#74A355] hover:shadow-xl hover:scale-[1.02] cursor-pointer"
                >
                  {web.logo ? (
                    <img src={web.logo} alt="" className="h-20 w-20 rounded-xl object-contain drop-shadow-sm" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8E2B5]/50 text-[#74A355]">
                      <Globe className="h-10 w-10" />
                    </div>
                  )}
                  <span className="px-2 text-center text-sm font-black uppercase tracking-wider text-[#23321B]">{web.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEditWeb(web)}
                  className="absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-xl bg-sky-600 text-white opacity-0 shadow-md transition-all group-hover:opacity-100 hover:bg-sky-700 cursor-pointer"
                  title="Edit nama / logo"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteWeb(web)}
                  className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-xl bg-rose-600 text-white opacity-0 shadow-md transition-all group-hover:opacity-100 hover:bg-rose-700 cursor-pointer"
                  title="Hapus web"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-[#E8E2B5] pt-5">
          <input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddWeb(); }}
            placeholder="Masukkan nama web baru (mis. WEB A)..."
            className="neu-inset h-11 flex-1 rounded-xl border border-[#E8E2B5] px-4 text-xs font-bold text-[#23321B] outline-none transition placeholder:text-[#596B4F]/60 focus:ring-2 focus:ring-[#74A355]"
          />
          <button
            type="button"
            onClick={handleAddWeb}
            className="clay-btn-green h-11 px-5 rounded-xl text-xs font-extrabold uppercase shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Tambah Web
          </button>
        </div>
      </div>

      <ConfirmDialog dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} onConfirm={() => { const a = confirmDialog?.onConfirm; setConfirmDialog(null); if (a) a(); }} />

      {editingWeb && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-[#D5C988] bg-[#FDFBD4] neu-card shadow-2xl">
            <div className="h-1.5 bg-[#74A355]" />
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <p className="text-sm font-black uppercase tracking-wider text-[#74A355]">Edit Web Divisi</p>
                <button type="button" onClick={() => setEditingWeb(null)} className="rounded-full p-1.5 text-[#596B4F] transition hover:bg-[#74A355]/10 hover:text-[#23321B]" aria-label="Tutup"><X className="h-4 w-4" /></button>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#596B4F]">Nama Web</span>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="neu-inset h-11 w-full rounded-xl border border-[#E8E2B5] px-3.5 text-xs font-bold text-[#23321B] outline-none focus:ring-2 focus:ring-[#74A355]" placeholder="Nama web" />
              </label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#D5C988] bg-[#FFFEE6]">
                  {editLogo ? <img src={editLogo} alt="" className="h-full w-full object-contain" /> : <Globe className="h-7 w-7 text-[#74A355]" />}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-sky-700 shadow-md">
                    <ImagePlus className="h-4 w-4" /> Pilih Logo
                    <input type="file" accept="image/*" className="hidden" onChange={e => { handlePickLogo(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {editLogo && <button type="button" onClick={() => setEditLogo('')} className="text-left text-[11px] font-extrabold text-rose-600 transition hover:text-rose-700">Hapus Logo</button>}
                  <span className="text-[10px] text-[#596B4F]">Format PNG/JPG, otomatis di-resize.</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={() => setEditingWeb(null)} className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E8E2B5] neu-flat text-xs font-bold text-[#596B4F] transition hover:bg-white">Batal</button>
                <button type="button" onClick={saveEditWeb} disabled={savingEdit} className="clay-btn-green inline-flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-extrabold text-white shadow-md transition disabled:opacity-50">{savingEdit && <RefreshCw className="h-4 w-4 animate-spin" />}Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
