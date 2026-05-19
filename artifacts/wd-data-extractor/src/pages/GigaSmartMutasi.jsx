import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';

const STORAGE_PREFIX = 'gigaSmartMutasi';
const DEFAULT_TAB = { id: 'bca-1', name: 'BCA 1', bank: 'BCA' };
const TYPE_OPTIONS = ['DP', 'TRANSFER', 'BIAYA ADMIN'];

const storageKey = (tabId) => `${STORAGE_PREFIX}:queue:${tabId}`;
const sanitizeTsvCell = (value) => String(value ?? '').replace(/[\t\n\r]/g, '').trim();
const cleanNominal = (value) => String(value ?? '').replace(/,/g, '').replace(/\./g, '').replace(/[^0-9-]/g, '').trim();
const parseNumber = (value) => Number(String(value ?? '').replace(/[^0-9-]/g, '')) || 0;
const formatNumber = (value) => parseNumber(value).toLocaleString('id-ID');
const getExportDate = () => new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

const readJson = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const NominalInput = ({ value, onChange, className, placeholder = '0' }) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const formatRibuan = (num) => {
        if (!num) return "";
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    return (
        <input
            type="text"
            className={className}
            value={isFocused ? value : formatRibuan(value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => {
                const rawAngka = e.target.value.replace(/[^0-9]/g, '');
                onChange(rawAngka);
            }}
            placeholder={placeholder}
        />
    );
};

const ConfirmDialog = ({ dialog, onCancel, onConfirm }) => {
  if (!dialog) return null;
  const isDanger = dialog.variant === 'danger';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-md backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-ds-2xl border border-white/15 bg-slate-900 shadow-ds-lg">
        <div className={`h-1.5 ${isDanger ? 'bg-red-500' : 'bg-amber-500'}`} />
        <div className="p-5 flex flex-col gap-md">
          <div className="mb-1 flex items-start justify-between gap-md">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-400">{dialog.title}</p>
              <p className="text-sm font-semibold leading-relaxed text-slate-300">{dialog.message}</p>
            </div>
            <button type="button" onClick={onCancel} className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Tutup konfirmasi">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-sm">
            <button type="button" onClick={onCancel} className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold border border-white/10 bg-white/10 text-slate-200 transition-all hover:bg-white/15">
              {dialog.cancelLabel || 'Batal'}
            </button>
            <button type="button" onClick={onConfirm} className={`inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold text-white shadow-ds-sm transition-all ${isDanger ? 'bg-red-600 hover:bg-red-700 shadow-red-950/40' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-950/40'}`}>
              {dialog.confirmLabel || 'Lanjutkan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function GigaSmartMutasi() {
  const [tabs, setTabs] = useState(() => readJson(`${STORAGE_PREFIX}:tabs`, [DEFAULT_TAB]));
  const [activeTabId, setActiveTabId] = useState(() => localStorage.getItem(`${STORAGE_PREFIX}:activeTab`) || DEFAULT_TAB.id);
  const [queueList, setQueueList] = useState(() => readJson(storageKey(localStorage.getItem(`${STORAGE_PREFIX}:activeTab`) || DEFAULT_TAB.id), []));
  const [shiftName, setShiftName] = useState(() => localStorage.getItem(`${STORAGE_PREFIX}:shiftName`) || '');
  const [selectedBank, setSelectedBank] = useState(() => localStorage.getItem(`${STORAGE_PREFIX}:selectedBank`) || 'BCA');
  const [bcaRawText, setBcaRawText] = useState('');
  const [manualNama, setManualNama] = useState('');
  const [manualNominal, setManualNominal] = useState('');
  const [manualType, setManualType] = useState('DP');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const activeTab = useMemo(() => tabs.find(tab => tab.id === activeTabId) || tabs[0] || DEFAULT_TAB, [tabs, activeTabId]);

  const closeConfirmDialog = () => setConfirmDialog(null);

  const runConfirmDialog = () => {
    const action = confirmDialog?.onConfirm;
    setConfirmDialog(null);
    if (action) action();
  };

  useEffect(() => {
    if (!tabs.length) {
      setTabs([DEFAULT_TAB]);
      setActiveTabId(DEFAULT_TAB.id);
      setQueueList(readJson(storageKey(DEFAULT_TAB.id), []));
      return;
    }
    if (!tabs.some(tab => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
      setQueueList(readJson(storageKey(tabs[0].id), []));
    }
  }, [tabs, activeTabId]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}:tabs`, JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}:activeTab`, activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}:shiftName`, shiftName);
  }, [shiftName]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_PREFIX}:selectedBank`, selectedBank);
  }, [selectedBank]);

  useEffect(() => {
    localStorage.setItem(storageKey(activeTabId), JSON.stringify(queueList));
  }, [queueList, activeTabId]);

  const switchTab = (tabId) => {
    if (tabId === activeTabId) return;
    localStorage.setItem(storageKey(activeTabId), JSON.stringify(queueList));
    setActiveTabId(tabId);
    setQueueList(readJson(storageKey(tabId), []));
  };

  const createQueueItem = (nama, nominal, type, saldoAkhir = '', bank = selectedBank || activeTab?.bank) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    nama: String(nama || '').trim(),
    nominal: cleanNominal(nominal),
    type,
    bank: String(bank || selectedBank || 'BCA').trim(),
    userId: '',
    sub: shiftName,
    saldoAkhir: cleanNominal(saldoAkhir),
    timestamp: new Date().toISOString()
  });

  const addQueueItems = (items) => {
    if (!items.length) return;
    setQueueList(prev => [...prev, ...items]);
  };

  const updateRow = (id, field, value) => {
    setQueueList(prev => prev.map(row => {
      if (row.id !== id) return row;
      const normalizedValue = field === 'nominal' || field === 'saldoAkhir' ? cleanNominal(value) : value;
      return { ...row, [field]: normalizedValue };
    }));
  };

  const deleteRow = (id) => {
    setQueueList(prev => prev.filter(row => row.id !== id));
    toast.success('Baris dihapus');
  };

  const resolveMutasiType = (text) => {
    const upper = String(text || '').toUpperCase();
    if (upper.includes('CR')) return 'DP';
    if (upper.includes('DB')) return 'TRANSFER';
    return 'BIAYA ADMIN';
  };

  const handleAddTab = () => {
    if (!shiftName.trim()) {
      toast.error('Isi SUB terlebih dahulu');
      return;
    }
    const bankName = selectedBank.trim();
    if (!bankName) {
      toast.error('Isi nama bank terlebih dahulu');
      return;
    }
    const newTab = {
      id: `${bankName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: bankName,
      bank: bankName
    };
    localStorage.setItem(storageKey(activeTabId), JSON.stringify(queueList));
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setQueueList([]);
    toast.success(`${newTab.name} ditambahkan`);
  };

  const handleDeleteTab = (tabId) => {
    const tabName = tabs.find(tab => tab.id === tabId)?.name || 'tab ini';
    setConfirmDialog({
      title: 'Hapus Tab Bank?',
      message: `Tab ${tabName} dan semua data antreannya akan dihapus permanen dari browser ini.`,
      confirmLabel: 'Hapus Tab',
      cancelLabel: 'Batal',
      variant: 'danger',
      onConfirm: () => {
        setTabs(prev => prev.filter(tab => tab.id !== tabId));
        localStorage.removeItem(storageKey(tabId));
        const remainingTabs = tabs.filter(tab => tab.id !== tabId);
        if (remainingTabs.length) {
          setActiveTabId(remainingTabs[0].id);
          setQueueList(readJson(storageKey(remainingTabs[0].id), []));
        } else {
          setTabs([DEFAULT_TAB]);
          setActiveTabId(DEFAULT_TAB.id);
          setQueueList([]);
        }
        toast.success('Tab dihapus');
      }
    });
  };

  const handleManualSubmit = (event) => {
    event.preventDefault();
    if (!manualNama.trim() || !manualNominal.trim()) {
      toast.error('Nama dan nominal wajib diisi');
      return;
    }
    addQueueItems([createQueueItem(manualNama, manualNominal, manualType)]);
    setManualNama('');
    setManualNominal('');
    setManualType('DP');
    toast.success('Data manual ditambahkan');
  };

  const handleExtractBca = () => {
    if (!bcaRawText.trim()) {
      toast.error('Paste teks mutasi BCA dulu');
      return;
    }
    const lines = bcaRawText.split('\n').map(line => line.trim()).filter(Boolean);
    const items = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index] !== '0000') continue;
      let rawName = lines[index - 1] || '';
      let upperRaw = rawName.toUpperCase();
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
      let rawNominal = lines[index + 1] || '0';
      let nominal = rawNominal.replace(/,/g, '').split('.')[0];

      // Tentukan Tipe
      let typeRaw = lines[index + 2];
      let type = 'DP';
      if (isAdmin) {
        type = 'BIAYA ADMIN';
      } else if (typeRaw === 'DB') {
        type = 'TRANSFER';
      } else if (typeRaw === 'CR') {
        type = 'DP';
      }

      // Ambil Saldo Akhir
      let rawSaldo = lines[index + 3] || '0';
      let saldoAkhir = rawSaldo.replace(/,/g, '').split('.')[0];

      // Filter Anti-Nyasar
      if (cleanName && nominal !== '0') {
        items.push(createQueueItem(cleanName, nominal, type, saldoAkhir, selectedBank));
      }
    }
    if (!items.length) {
      toast.error('Tidak ada data BCA valid ditemukan');
      return;
    }
    addQueueItems(items);
    setBcaRawText('');
    toast.success(`${items.length} baris berhasil diproses`);
  };

  const totals = useMemo(() => {
    const totalDeposit = queueList.filter(row => row.type === 'DP').reduce((sum, row) => sum + parseNumber(row.nominal), 0);
    const totalTransfer = queueList.filter(row => row.type === 'TRANSFER' || row.type === 'BIAYA ADMIN').reduce((sum, row) => sum + parseNumber(row.nominal), 0);
    const firstRow = queueList[0];
    const firstDelta = firstRow ? (firstRow.type === 'DP' ? parseNumber(firstRow.nominal) : -parseNumber(firstRow.nominal)) : 0;
    const saldoAwal = firstRow?.saldoAkhir ? parseNumber(firstRow.saldoAkhir) - firstDelta : 0;
    const saldoAkhir = queueList.length ? parseNumber(queueList[queueList.length - 1].saldoAkhir) : 0;
    const saldoKalkulasi = saldoAwal + totalDeposit - totalTransfer;
    const selisih = saldoAkhir - saldoKalkulasi;
    return { totalDeposit, totalTransfer, saldoAwal, saldoAkhir, saldoKalkulasi, selisih };
  }, [queueList]);

  const expectedSaldoByRow = useMemo(() => {
    const map = new Map();
    let runningSaldo = totals.saldoAwal;
    queueList.forEach(row => {
      runningSaldo += row.type === 'DP' ? parseNumber(row.nominal) : -parseNumber(row.nominal);
      map.set(row.id, runningSaldo);
    });
    return map;
  }, [queueList, totals.saldoAwal]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return queueList;
    return queueList.filter(row => [row.nama, row.userId, row.nominal, row.type, row.bank, row.saldoAkhir]
      .some(value => String(value || '').toLowerCase().includes(keyword)));
  }, [queueList, searchTerm]);

  const completedRows = useMemo(() => queueList.filter(row => String(row.userId || '').trim() !== ''), [queueList]);

  const handleCopyDocTrx = async () => {
    if (!queueList.length) {
      toast.error('Belum ada data antrean');
      return;
    }
    const date = getExportDate();
    const tsv = queueList.map(row => [
      sanitizeTsvCell(row.nama),
      sanitizeTsvCell(' '),
      sanitizeTsvCell(row.userId),
      sanitizeTsvCell(row.sub || shiftName),
      sanitizeTsvCell(row.type),
      sanitizeTsvCell(row.type === 'DP' ? row.nominal : ' '),
      sanitizeTsvCell(row.type === 'TRANSFER' ? row.nominal : ' '),
      sanitizeTsvCell(' '),
      sanitizeTsvCell(date),
      sanitizeTsvCell(row.bank),
      sanitizeTsvCell(row.saldoAkhir)
    ].join('\t')).join('\n');

    try {
      await navigator.clipboard.writeText(tsv);
      toast.success(`${queueList.length} baris dicopy ke Doc TRX`);
    } catch {
      toast.error('Gagal copy ke clipboard');
    }
  };

  const handleResetShift = () => {
    setConfirmDialog({
      title: 'Akhiri Shift?',
      message: 'Data antrean pada tab aktif akan dihapus. Pastikan data sudah dicopy ke Doc TRX sebelum melanjutkan.',
      confirmLabel: 'Akhiri Shift',
      cancelLabel: 'Batal',
      variant: 'danger',
      onConfirm: () => {
        setQueueList([]);
        localStorage.removeItem(storageKey(activeTabId));
        toast.success('Data tab aktif direset');
      }
    });
  };

  const glassCard = 'rounded-xl border border-white/40 bg-white/30 shadow-sm shadow-amber-950/10 backdrop-blur-md';
  const labelClass = 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-600';
  const inputClass = 'h-9 w-full rounded-lg border border-white/50 bg-white/65 px-3 text-xs font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60';
  const tableInputClass = 'h-8 w-full min-w-0 rounded-md border-none bg-transparent px-2 text-xs font-bold text-slate-800 outline-none transition focus:bg-white/70 focus:ring-1 focus:ring-amber-400';

  return (
    <div className="w-full h-full flex flex-col gap-lg overflow-hidden">
      <div className="flex min-h-0 w-full flex-1 flex-col gap-md overflow-hidden">
        <section className={`${glassCard} w-full shrink-0 overflow-hidden p-md`}>
          <div className="grid gap-2">
            <div className="rounded-xl border border-white/40 bg-white/35 px-2 py-1.5 shadow-inner shadow-white/10">
              <div className="grid gap-2 xl:grid-cols-[155px_150px_190px_minmax(0,1fr)] xl:items-center">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-black text-white">1</span>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">Setup Shift</p>
                    <p className="text-[10px] font-bold text-slate-600">Shift, bank, dan tab.</p>
                  </div>
                </div>
                <label className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Sub</span>
                  <input value={shiftName} onChange={event => setShiftName(event.target.value)} className="h-8 w-full rounded-lg border border-white/50 bg-white/65 px-2 text-xs font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60" placeholder="BOT / PAGI" />
                </label>
                <label className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Bank</span>
                  <input type="text" value={selectedBank} onChange={event => setSelectedBank(event.target.value)} className="h-8 w-full rounded-lg border border-white/50 bg-white/65 px-2 text-xs font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60" placeholder="Contoh: BCA" />
                </label>
                <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Tab Bank</span>
                  <div className="flex min-w-0 items-end gap-1 overflow-x-auto border-b border-white/50">
                    {tabs.map(tab => (
                      <div key={tab.id} className="relative group shrink-0">
                        <button onClick={() => switchTab(tab.id)} className={`h-8 rounded-t-xl border px-3 pr-7 text-[11px] font-black transition ${activeTabId === tab.id ? 'border-white/60 border-b-transparent bg-white/80 text-slate-900 shadow-sm' : 'border-white/30 bg-white/35 text-slate-600 hover:bg-white/55'}`}>
                          {tab.name}
                        </button>
                        {tabs.length > 1 && (
                          <button type="button" onClick={() => handleDeleteTab(tab.id)} className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-red-500 transition hover:bg-red-500 hover:text-white" title="Hapus tab">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={handleAddTab} className="h-8 shrink-0 rounded-t-xl border border-white/30 bg-slate-900 px-3 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-amber-700" title="Tambah tab bank">
                      + Tambah
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/40 bg-white/35 p-3 shadow-inner shadow-white/10">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-white">2</span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Input Mutasi</p>
                  <p className="text-[11px] font-bold text-slate-600">Pilih cara input: paste mutasi BCA atau tambah data manual.</p>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="grid gap-2 rounded-lg border border-white/40 bg-white/25 p-2 xl:grid-cols-[220px_minmax(0,1fr)_130px] xl:items-center">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-700">Paste Mutasi BCA</p>
                    <p className="text-[11px] font-semibold text-slate-500">Untuk proses cepat: paste teks mutasi dari BCA, lalu klik proses.</p>
                  </div>
                  <textarea rows={2} value={bcaRawText} onChange={event => setBcaRawText(event.target.value)} className="min-h-[48px] resize-none rounded-lg border border-white/50 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60" placeholder="Paste mutasi BCA di sini..." />
                  <button onClick={handleExtractBca} className="h-full min-h-[48px] rounded-lg bg-amber-500 px-3 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-amber-600">
                    Proses Mutasi
                  </button>
                </div>
                <form onSubmit={handleManualSubmit} className="grid gap-2 rounded-lg border border-white/40 bg-white/25 p-2 xl:grid-cols-[220px_minmax(0,1fr)_160px_150px_100px] xl:items-center">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-700">Input Manual</p>
                    <p className="text-[11px] font-semibold text-slate-500">Untuk data tambahan atau koreksi yang tidak terbaca otomatis.</p>
                  </div>
                  <input value={manualNama} onChange={event => setManualNama(event.target.value)} className={inputClass} placeholder="Nama" />
                  <input value={manualNominal} onChange={event => setManualNominal(cleanNominal(event.target.value))} className={inputClass} placeholder="Nominal" />
                  <select value={manualType} onChange={event => setManualType(event.target.value)} className={inputClass}>
                    {TYPE_OPTIONS.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <button type="submit" className="h-9 rounded-lg bg-slate-900 px-3 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-amber-700">
                    Tambah
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>

        <section className={`${glassCard} flex min-h-0 w-full flex-1 flex-col overflow-hidden p-md`}>
          <div className="mb-md flex shrink-0 flex-col gap-md md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-700">3. Cek Hasil Antrean</p>
              <span className="rounded-full bg-white/65 px-3 py-1 text-[10px] font-black text-slate-700">{queueList.length} Total</span>
              <span className="rounded-full bg-yellow-400 px-3 py-1 text-[10px] font-black text-yellow-950">{queueList.length - completedRows.length} Pending</span>
              <span className="rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-black text-white">{completedRows.length} Selesai</span>
            </div>
            <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="h-8 w-full rounded-lg border border-white/50 bg-white/70 px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60 md:w-72" placeholder="Cari data..." />
          </div>

          <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-white/50 bg-white/20 shadow-inner">
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-900/95 text-white shadow-sm">
                <tr className="text-[10px] font-black uppercase tracking-wide">
                  <th className="w-[18%] px-1 py-2">Nama</th>
                  <th className="w-[15%] px-1 py-2">User ID</th>
                  <th className="w-[12%] px-1 py-2">Nominal</th>
                  <th className="w-[12%] px-1 py-2">Tipe</th>
                  <th className="w-[12%] px-1 py-2">Bank</th>
                  <th className="w-[12%] px-1 py-2">Saldo Akhir</th>
                  <th className="w-[10%] px-1 py-2">Validasi</th>
                  <th className="w-[9%] px-1 py-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-sm font-black text-slate-500">Belum ada antrean. Input data dari panel atas.</td>
                  </tr>
                ) : filteredRows.map(row => {
                  const hasUserId = String(row.userId || '').trim() !== '';
                  const expectedSaldo = expectedSaldoByRow.get(row.id) || 0;
                  const hasSaldo = String(row.saldoAkhir || '').trim() !== '';
                  const isMismatch = hasSaldo && parseNumber(row.saldoAkhir) !== expectedSaldo;
                  const rowClass = isMismatch ? 'bg-red-50/80 ring-2 ring-inset ring-red-500' : hasUserId ? 'bg-white/90' : 'bg-yellow-100/80';

                  return (
                    <tr key={row.id} className={`${rowClass} transition hover:bg-white`}>
                      <td className="border-b border-white/60 px-1 py-1.5"><input value={row.nama} onChange={event => updateRow(row.id, 'nama', event.target.value)} className={tableInputClass} /></td>
                      <td className="border-b border-white/60 px-1 py-1.5"><input value={row.userId} onChange={event => updateRow(row.id, 'userId', event.target.value)} className={tableInputClass} placeholder="opsional" /></td>
                      <td className="border-b border-white/60 px-1 py-1.5"><NominalInput value={row.nominal} onChange={value => updateRow(row.id, 'nominal', value)} className={tableInputClass} /></td>
                      <td className="border-b border-white/60 px-1 py-1.5"><select value={row.type} onChange={event => updateRow(row.id, 'type', event.target.value)} className={tableInputClass}>{TYPE_OPTIONS.map(type => <option key={type} value={type}>{type}</option>)}</select></td>
                      <td className="border-b border-white/60 px-1 py-1.5"><input value={row.bank} onChange={event => updateRow(row.id, 'bank', event.target.value)} className={tableInputClass} /></td>
                      <td className="border-b border-white/60 px-1 py-1.5"><NominalInput value={row.saldoAkhir} onChange={value => updateRow(row.id, 'saldoAkhir', value)} className={tableInputClass} placeholder={String(expectedSaldo)} /></td>
                      <td className="border-b border-white/60 px-1 py-1.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${isMismatch ? 'bg-red-600 text-white' : hasUserId ? 'bg-emerald-500 text-white' : 'bg-yellow-400 text-yellow-950'}`}>
                          {isMismatch ? 'ERROR' : hasUserId ? 'SELESAI' : 'PENDING'}
                        </span>
                      </td>
                      <td className="border-b border-white/60 px-1 py-1.5 text-center">
                        <button onClick={() => deleteRow(row.id)} className="rounded-md bg-red-500 px-2 py-1 text-[10px] font-black uppercase text-white transition hover:bg-red-600">Hapus</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${glassCard} shrink-0 px-lg py-md`}>
          <div className="grid gap-md xl:grid-cols-[1fr_auto] xl:items-center">
            <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
              <div className="rounded-ds-md bg-white/60 px-md py-sm"><p className={labelClass}>Deposit</p><p className="text-sm font-black text-emerald-700">{formatNumber(totals.totalDeposit)}</p></div>
              <div className="rounded-ds-md bg-white/60 px-md py-sm"><p className={labelClass}>Transfer</p><p className="text-sm font-black text-red-700">{formatNumber(totals.totalTransfer)}</p></div>
              <div className="rounded-ds-md bg-white/60 px-md py-sm"><p className={labelClass}>Saldo Akhir</p><p className="text-sm font-black text-slate-900">{formatNumber(totals.saldoAkhir)}</p></div>
              <div className={`rounded-ds-md px-md py-sm ${totals.selisih === 0 ? 'bg-white/60' : 'bg-red-100/90 ring-2 ring-red-500'}`}><p className={labelClass}>Selisih</p><p className={`text-sm font-black ${totals.selisih === 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatNumber(totals.selisih)}</p></div>
            </div>
            <div className="grid gap-sm sm:grid-cols-2 xl:w-[430px]">
              <button onClick={handleCopyDocTrx} className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white shadow-ds-md transition-all hover:bg-emerald-700">
                Copy To Doc TRX
              </button>
              <button onClick={handleResetShift} className="inline-flex items-center justify-center h-10 px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold bg-red-600 text-white shadow-ds-md transition-all hover:bg-red-700">
                Akhiri Shift
              </button>
            </div>
          </div>
        </section>
      </div>
      <ConfirmDialog dialog={confirmDialog} onCancel={closeConfirmDialog} onConfirm={runConfirmDialog} />
    </div>
  );
}
