import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, X, Clipboard, Check, AlertCircle, ChevronDown } from "lucide-react";
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
  const {
    sub,
    kodeTransaksi,
    keterangan,
    colAccountName,
    colPaymentMethod,
    colAccountNumber,
    colTransactionId,
    colTotalAmount,
    colFinishedDate,
  } = profile;

  const processedData: ExtractedRow[] = [];

  for (const row of rawData) {
    if (
      !row[colAccountName] &&
      !row[colPaymentMethod] &&
      !row[colAccountNumber] &&
      !row[colTransactionId]
    ) {
      continue;
    }

    const accountName = String(row[colAccountName] ?? "").trim().toUpperCase();
    const paymentMethod = String(row[colPaymentMethod] ?? "").trim();
    const accountNumber = String(row[colAccountNumber] ?? "").trim();
    const nomorRekening = `${paymentMethod} ${accountNumber}`.trim().toUpperCase();

    let userId = String(row[colTransactionId] ?? "").trim();
    if (userId.includes("-")) {
      userId = userId.split("-")[0].trim();
    }

    const withdrawal = String(row[colTotalAmount] ?? "").trim();
    const jamInput = formatExcelDate(row[colFinishedDate]);

    processedData.push({
      nama: accountName,
      nomorRekening,
      userId,
      sub,
      kodeTransaksi,
      deposit: "",
      withdrawal,
      dpPulsa: "",
      keterangan,
      kodeBank: "",
      saldoAkhir: "",
      jamInput,
      inputKodeBank: "",
    });
  }

  return processedData;
}

export default function Home() {
  const {
    profiles,
    activeProfile,
    activeProfileId,
    setActiveProfileId,
    addProfile,
    updateProfile,
    deleteProfile,
  } = useWebProfiles();

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ExtractedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (selectedFile: File, profile: WebProfile) => {
    setFile(selectedFile);
    setError(null);
    setData(null);
    setIsParsing(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });

      if (!workbook.SheetNames.length) throw new Error("File Excel tidak memiliki sheet.");

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(firstSheet) as Record<string, unknown>[];

      if (rawData.length === 0) throw new Error("Sheet yang dipilih kosong.");

      const expectedCols = [
        profile.colAccountName,
        profile.colPaymentMethod,
        profile.colAccountNumber,
        profile.colTransactionId,
        profile.colTotalAmount,
        profile.colFinishedDate,
      ];

      const firstRow = rawData[0];
      const missingColumns = expectedCols.filter((col) => !(col in firstRow));

      if (missingColumns.length > 0) {
        throw new Error(
          `Kolom tidak ditemukan di profil "${profile.name}": ${missingColumns.join(", ")}. ` +
          `Periksa mapping kolom di Pengaturan.`
        );
      }

      const processedData = transformData(rawData, profile);
      setData(processedData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal membaca file Excel.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files?.[0]) {
        const f = e.dataTransfer.files[0];
        if (f.name.endsWith(".xlsx")) {
          processFile(f, activeProfile);
        } else {
          setError("Hanya file .xlsx yang didukung.");
        }
      }
    },
    [activeProfile]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0], activeProfile);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetState = () => {
    setFile(null);
    setData(null);
    setError(null);
    setIsCopied(false);
  };

  const copyToClipboard = async () => {
    if (!data || data.length === 0) return;
    try {
      const tsvData = data
        .map((row) =>
          [
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
          ].join("\t")
        )
        .join("\n");

      await navigator.clipboard.writeText(tsvData);
      setIsCopied(true);
      toast.success(`Berhasil menyalin ${data.length} baris ke clipboard!`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin ke clipboard.");
    }
  };

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
            {/* Active profile pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfilePickerOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 transition-colors text-sm"
                data-testid="button-profile-picker"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="max-w-[140px] truncate text-foreground/90 font-medium">
                  {activeProfile.name}
                </span>
                <ChevronDown
                  size={13}
                  className={`text-muted-foreground transition-transform duration-200 ${profilePickerOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {profilePickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
                  >
                    {profiles.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => {
                          setActiveProfileId(profile.id);
                          setProfilePickerOpen(false);
                          resetState();
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                          profile.id === activeProfileId
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted/50"
                        }`}
                        data-testid={`option-profile-${profile.id}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            profile.id === activeProfileId ? "bg-primary" : "bg-muted-foreground/30"
                          }`}
                        />
                        <span className="truncate">{profile.name}</span>
                        {profile.id === activeProfileId && (
                          <Check size={12} className="ml-auto shrink-0" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Overlay to close picker */}
              {profilePickerOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfilePickerOpen(false)}
                />
              )}
            </div>

            <SettingsModal
              profiles={profiles}
              activeProfileId={activeProfileId}
              onSelectProfile={(id) => {
                setActiveProfileId(id);
                resetState();
              }}
              onAddProfile={addProfile}
              onUpdateProfile={updateProfile}
              onDeleteProfile={deleteProfile}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-12 flex flex-col gap-8">
        {/* Active profile info banner */}
        <motion.div
          key={activeProfile.id}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5"
        >
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
          <div
            data-testid="upload-zone"
            className={`
              relative group w-full rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out
              flex flex-col items-center justify-center p-12 text-center
              ${
                isDragging
                  ? "border-primary bg-primary/10 scale-[1.02]"
                  : file
                  ? "border-border bg-card"
                  : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
              }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelect}
              data-testid="input-file"
            />

            <AnimatePresence mode="wait">
              {isParsing ? (
                <motion.div
                  key="parsing"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
                  <p className="text-muted-foreground font-medium">Memproses baris data...</p>
                </motion.div>
              ) : file ? (
                <motion.div
                  key="file-info"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center gap-4 w-full"
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mb-2">
                    <FileSpreadsheet size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-foreground">{file.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetState();
                    }}
                    className="mt-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    data-testid="button-remove-file"
                  >
                    <X size={16} className="mr-2" />
                    Hapus file
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="upload-prompt"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div
                    className={`
                      w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-300
                      ${
                        isDragging
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border text-muted-foreground group-hover:text-primary group-hover:border-primary/30"
                      }
                    `}
                  >
                    <Upload size={28} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-foreground">
                      Drop file Excel di sini
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                      Hanya format .xlsx yang didukung. Klik untuk memilih file.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
            >
              <Card className="border-destructive/50 bg-destructive/10 overflow-hidden">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="text-destructive mt-1">
                    <AlertCircle size={24} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-medium text-destructive mb-1">Proses Gagal</h4>
                    <p className="text-sm text-destructive/80 mb-4">{error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/30 hover:bg-destructive/20 hover:text-destructive text-destructive"
                      onClick={() => setError(null)}
                      data-testid="button-try-again"
                    >
                      Tutup
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preview & Actions */}
        <AnimatePresence>
          {data && !error && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-medium">Pratinjau Data</h2>
                  <span className="px-2.5 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium border border-primary/20">
                    {data.length} baris
                  </span>
                </div>
                <Button
                  onClick={copyToClipboard}
                  className={`transition-all duration-300 ${isCopied ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                  data-testid="button-copy-tsv"
                >
                  {isCopied ? (
                    <>
                      <Check size={16} className="mr-2" />
                      Tersalin!
                    </>
                  ) : (
                    <>
                      <Clipboard size={16} className="mr-2" />
                      Salin sebagai TSV
                    </>
                  )}
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                  <table
                    className="w-full text-sm text-left border-collapse"
                    data-testid="preview-table"
                  >
                    <thead className="text-xs uppercase bg-slate-900/50 text-muted-foreground sticky top-0 z-10 shadow-sm backdrop-blur-md">
                      <tr>
                        {OUTPUT_HEADERS.map((header, i) => (
                          <th
                            key={i}
                            className="px-4 py-4 font-medium whitespace-nowrap border-b border-border/50"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="font-mono text-xs divide-y divide-border/50">
                      {data.length > 0 ? (
                        data.map((row, i) => (
                          <tr
                            key={i}
                            className="hover:bg-muted/30 transition-colors"
                            data-testid={`row-data-${i}`}
                          >
                            <td className="px-4 py-3 whitespace-nowrap text-foreground/90">{row.nama}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-primary/90">{row.nomorRekening}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{row.userId}</td>
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
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={13}
                            className="px-4 py-12 text-center text-muted-foreground text-sm font-sans"
                          >
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
        <p className="text-xs text-muted-foreground/60">
          WD Data Extractor &nbsp;·&nbsp; Internal Operations Tooling
        </p>
      </footer>
    </div>
  );
}
