import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Loader2,
  Check,
  Copy,
  Mail,
  AlertTriangle,
  ExternalLink,
  History,
  Trash2,
  RefreshCw,
  Globe,
  Database,
  Key
} from "lucide-react";
import { toast } from "sonner";

interface Threat {
  domain: string;
  url?: string;
  ip?: string;
  timestamp: string;
}

interface Case {
  id: number;
  domain: string;
  ip: string;
  provider: string;
  recipients: string;
  subject: string;
  body: string;
  timeReported: string;
  dnsStatus: string;
  caseStatus: string;
  proofFile?: string | null;
  screenshotFile?: string | null;
}

export default function PhishShield() {
  const [activeSubTab, setActiveSubTab] = useState<"manual" | "typosquat" | "cases" | "settings">("manual");

  // Manual Analyzer State
  const [targetUrl, setTargetUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Email template editing state
  const [recipients, setRecipients] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSubmittingCase, setIsSubmittingCase] = useState(false);

  // Typosquat & Google Search Scanner State
  const [targetBrand, setTargetBrand] = useState("");
  const [isScanningTyposquat, setIsScanningTyposquat] = useState(false);
  const [isScanningGoogle, setIsScanningGoogle] = useState(false);
  const [threats, setThreats] = useState<Threat[]>([]);

  // Cases state
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);

  // Settings State
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [officialDomain, setOfficialDomain] = useState("");
  const [serperApiKey, setSerperApiKey] = useState("");
  const [safeBrowsingApiKey, setSafeBrowsingApiKey] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Load config and cases on mount
  useEffect(() => {
    fetchConfig();
    fetchCases();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/phishshield/config");
      if (!res.ok) throw new Error();
      const config = await res.json();

      setSmtpHost(config.smtp?.host || "smtp.gmail.com");
      setSmtpPort(config.smtp?.port || 587);
      setSmtpSecure(config.smtp?.secure || false);
      setSmtpUser(config.smtp?.user || "");
      setOfficialDomain(config.brandProtection?.officialDomain || "");
      setSerperApiKey(config.brandProtection?.serperApiKey || "");
      setSafeBrowsingApiKey(config.googleSafeBrowsing?.apiKey || "");
    } catch (e) {
      toast.error("Gagal memuat konfigurasi dari server.");
    }
  };

  const fetchCases = async () => {
    setIsLoadingCases(true);
    try {
      const res = await fetch("/api/phishshield/cases");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCases(data);
    } catch (e) {
      toast.error("Gagal memuat log laporan kasus.");
    } finally {
      setIsLoadingCases(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const payload = {
        smtp: {
          host: smtpHost.trim(),
          port: smtpPort,
          secure: smtpSecure,
          user: smtpUser.trim(),
          pass: smtpPass
        },
        brandProtection: {
          officialDomain: officialDomain.trim(),
          serperApiKey: serperApiKey.trim()
        },
        googleSafeBrowsing: {
          apiKey: safeBrowsingApiKey.trim()
        }
      };

      const res = await fetch("/api/phishshield/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error();
      toast.success("Konfigurasi berhasil disimpan!");
      fetchConfig();
    } catch (e) {
      toast.error("Gagal menyimpan konfigurasi.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim()) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const res = await fetch(`/api/phishshield/analyze?url=${encodeURIComponent(targetUrl.trim())}`);
      if (!res.ok) throw new Error("Gagal menganalisis domain.");
      const data = await res.json();
      setAnalysisResult(data);

      // Populate email template fields
      setRecipients(data.abuseEmails.join(", "));
      setEmailSubject(data.emailTemplate?.subject || "");
      setEmailBody(data.emailTemplate?.body || "");
    } catch (err: any) {
      toast.error(err.message || "Gagal menganalisis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleScanTyposquat = async () => {
    if (!targetBrand.trim()) {
      toast.error("Masukkan nama brand untuk memindai.");
      return;
    }
    setIsScanningTyposquat(true);
    try {
      const res = await fetch(`/api/phishshield/typosquat?brand=${encodeURIComponent(targetBrand.trim())}`);
      if (!res.ok) throw new Error("Pemindaian gagal.");
      const data = await res.json();
      
      setThreats((prev) => {
        const combined = [...data.threats, ...prev];
        const unique = combined.filter((v, i, a) => a.findIndex(t => t.domain === v.domain) === i);
        return unique;
      });
      toast.success(`Ditemukan ${data.threats.length} variasi typosquat aktif.`);
    } catch (err: any) {
      toast.error(err.message || "Variasi typosquat gagal dipindai.");
    } finally {
      setIsScanningTyposquat(false);
    }
  };

  const handleScanGoogle = async () => {
    if (!targetBrand.trim()) {
      toast.error("Masukkan nama brand/kata kunci pencarian.");
      return;
    }
    setIsScanningGoogle(true);
    try {
      const res = await fetch(`/api/phishshield/google-search?keyword=${encodeURIComponent(targetBrand.trim())}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Pemindaian Google Search gagal.");
      }
      const data = await res.json();

      setThreats((prev) => {
        const combined = [...data.threats, ...prev];
        const unique = combined.filter((v, i, a) => a.findIndex(t => t.domain === v.domain) === i);
        return unique;
      });
      toast.success(`Ditemukan ${data.threats.length} link mencurigakan dari Google Search.`);
    } catch (err: any) {
      toast.error(err.message || "Pencarian Google Search gagal.");
    } finally {
      setIsScanningGoogle(false);
    }
  };

  const handleSubmitCase = async (e: React.FormEvent, method: "gmail" | "mailto" = "gmail") => {
    e.preventDefault();
    if (!analysisResult) return;

    setIsSubmittingCase(true);
    try {
      const payload = {
        domain: analysisResult.domain,
        ip: analysisResult.ip || "Unknown",
        provider: analysisResult.hosting || "Unknown",
        recipients,
        subject: emailSubject,
        body: emailBody
      };

      const res = await fetch("/api/phishshield/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error();

      if (method === "gmail") {
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipients)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        window.open(gmailUrl, "_blank");
        toast.success("Draf dibuka di Gmail Web. Silakan klik Send pada tab Gmail!");
      } else {
        const mailtoUrl = `mailto:${encodeURIComponent(recipients)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        window.location.href = mailtoUrl;
        toast.success("Aplikasi email default dibuka!");
      }

      toast.success("Laporan insiden berhasil diarsipkan!");
      
      // Reset analyzer and refresh cases
      setTargetUrl("");
      setAnalysisResult(null);
      fetchCases();
      setActiveSubTab("cases");
    } catch (e) {
      toast.error("Gagal mengirimkan laporan insiden.");
    } finally {
      setIsSubmittingCase(false);
    }
  };

  const handleVerifyDns = async (caseId: number) => {
    try {
      const res = await fetch(`/api/phishshield/cases/${caseId}/verify-dns`, {
        method: "POST"
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.info(data.message);
      }
      fetchCases();
    } catch (e) {
      toast.error("Gagal melakukan pengecekan DNS status.");
    }
  };

  const handleDeleteCase = async (caseId: number) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus kasus ini dari log?")) return;
    try {
      const res = await fetch(`/api/phishshield/cases/${caseId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error();
      toast.success("Kasus berhasil dihapus.");
      fetchCases();
    } catch (e) {
      toast.error("Gagal menghapus kasus.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Teks disalin ke papan klip!");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Title block */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl glass border-red-500/20"
        style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(99,102,241,0.06) 100%)" }}
      >
        <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 shadow-sm shadow-red-400/60 animate-pulse" />
        <span className="text-sm font-semibold text-white/90">PHISHSHIELD PROTECTION ENGINE</span>
        <span className="text-xs text-white/35 ml-1 hidden sm:inline">
          Anti-Phishing & Domain Brand Abuse Monitor
        </span>
      </motion.div>

      {/* PhishShield Sub-Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-white/5 border border-white/10 self-start">
        <button
          type="button"
          onClick={() => setActiveSubTab("manual")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200
            ${activeSubTab === "manual" ? "bg-red-600/90 text-white shadow-md shadow-red-500/20" : "text-slate-300 hover:bg-white/5"}`}
        >
          <Search size={14} />
          Analisis Domain Manual
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("typosquat")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200
            ${activeSubTab === "typosquat" ? "bg-red-600/90 text-white shadow-md shadow-red-500/20" : "text-slate-300 hover:bg-white/5"}`}
        >
          <Globe size={14} />
          Penyisir Typosquat & Ads
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("cases")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200
            ${activeSubTab === "cases" ? "bg-red-600/90 text-white shadow-md shadow-red-500/20" : "text-slate-300 hover:bg-white/5"}`}
        >
          <History size={14} />
          Log Kasus Aktif ({cases.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("settings")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200
            ${activeSubTab === "settings" ? "bg-red-600/90 text-white shadow-md shadow-red-500/20" : "text-slate-300 hover:bg-white/5"}`}
        >
          <Settings size={14} />
          Konfigurasi Proteksi
        </button>
      </div>

      {/* Tab Contents */}
      <AnimatePresence mode="wait">
        {activeSubTab === "manual" && (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Domain Analysis Form */}
            <div className="flex flex-col gap-4 p-5 rounded-2xl glass border border-white/10 shadow-lg">
              <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300 flex items-center gap-2">
                <Search size={16} className="text-red-400" /> Domain Analyzer
              </h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Masukkan URL domain mencurigakan yang meniru situs betting Anda untuk mengambil data DNS, registrar, dan email abuse hosting provider mereka.
              </p>

              <form onSubmit={handleAnalyze} className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder="Contoh: gigaslot-login.com atau https://..."
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  disabled={isAnalyzing}
                  className="flex-1 bg-white/5 border border-white/10 text-white/90 placeholder:text-white/20 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-red-400 focus:border-red-400"
                />
                <button
                  type="submit"
                  disabled={isAnalyzing || !targetUrl.trim()}
                  className="flex items-center justify-center gap-1.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? <Loader2 size={13} className="animate-spin" /> : null}
                  Analisis
                </button>
              </form>

              {/* Analysis Results */}
              {analysisResult && (
                <div className="flex flex-col gap-3 mt-4 border-t border-white/10 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase">Domain</p>
                      <p className="text-xs font-mono font-bold text-white mt-1 break-all">{analysisResult.domain}</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase">IP Address</p>
                      <p className="text-xs font-mono font-bold text-white mt-1">{analysisResult.ip || "OFFLINE"}</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase">Registrar</p>
                      <p className="text-xs font-bold text-white mt-1">{analysisResult.registrar}</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase">Penyedia Hosting</p>
                      <p className="text-xs font-bold text-white mt-1">{analysisResult.hosting}</p>
                    </div>
                  </div>

                  <div className="bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col gap-2">
                    <p className="text-[10px] text-white/40 uppercase">DNS Records</p>
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono mt-1">
                      <div>
                        <span className="text-emerald-400 font-bold">[A] </span>
                        {analysisResult.dns?.A?.length ? analysisResult.dns.A.join(", ") : "-"}
                      </div>
                      <div>
                        <span className="text-cyan-400 font-bold">[MX] </span>
                        {analysisResult.dns?.MX?.length ? analysisResult.dns.MX.slice(0,2).join(", ") : "-"}
                      </div>
                      <div>
                        <span className="text-purple-400 font-bold">[NS] </span>
                        {analysisResult.dns?.NS?.length ? analysisResult.dns.NS.slice(0,2).join(", ") : "-"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] text-white/40 uppercase">Email Takedown Abuse</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {analysisResult.abuseEmails.map((email: string) => (
                        <span key={email} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/10 text-red-300 border border-red-400/20 text-[10px] font-mono">
                          {email}
                          <Copy size={10} className="cursor-pointer text-red-300/60 hover:text-red-300" onClick={() => copyToClipboard(email)} />
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Google Decision Recommendations */}
                  {analysisResult.recommendations && (
                    <div className="flex flex-col gap-2.5 border-t border-white/10 pt-3 mt-1">
                      <p className="text-[10px] text-white/40 uppercase">Rekomendasi Jalur Laporan Google</p>
                      <div className="flex flex-col gap-2">
                        {analysisResult.recommendations.map((rec: any, idx: number) => {
                          const isRec = rec.status === "recommended";
                          const isOpt = rec.status === "optional";
                          
                          let badgeBg = "bg-slate-800 text-slate-400 border-slate-700";
                          let badgeText = "Tidak Diperlukan";
                          if (isRec) {
                            badgeBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                            badgeText = "Sangat Direkomendasikan";
                          } else if (isOpt) {
                            badgeBg = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                            badgeText = "Opsional";
                          }

                          return (
                            <div key={idx} className="bg-white/5 p-3 rounded-lg border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                              <div className="flex flex-col gap-1 max-w-full sm:max-w-[70%]">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-white/90">{rec.title}</span>
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-wider ${badgeBg}`}>
                                    {badgeText}
                                  </span>
                                </div>
                                <span className="text-[11px] text-white/50 leading-relaxed">{rec.reason}</span>
                              </div>
                              <a
                                href={rec.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-flex items-center justify-center h-8 px-3 rounded text-[11px] font-bold transition-all shrink-0
                                  ${isRec 
                                    ? "bg-red-600 hover:bg-red-500 text-white shadow-sm" 
                                    : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                                  }`}
                              >
                                Buka Link Laporan
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Email Report Details */}
            <div className="flex flex-col gap-4 p-5 rounded-2xl glass border border-white/10 shadow-lg">
              <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300 flex items-center gap-2">
                <Mail size={16} className="text-red-400" /> Takedown Report Form
              </h3>

              {!analysisResult ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-white/10 rounded-xl">
                  <ShieldAlert size={36} className="text-white/20 mb-2" />
                  <p className="text-xs text-white/40">Silakan lakukan analisis domain terlebih dahulu untuk memuat template laporan takedown.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitCase} className="flex-1 flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase text-white/40">Penerima Abuse (Separated by comma)</label>
                    <input
                      type="text"
                      value={recipients}
                      onChange={(e) => setRecipients(e.target.value)}
                      className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase text-white/40">Subjek Email Laporan</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-[10px] uppercase text-white/40">Konten / Isi Email</label>
                    <textarea
                      rows={8}
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      className="flex-1 min-h-[160px] bg-white/5 border border-white/10 text-white/90 font-mono text-[10px] leading-relaxed rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={(e) => handleSubmitCase(e, "gmail")}
                      disabled={isSubmittingCase || !recipients.trim()}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
                    >
                      {isSubmittingCase ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                      Kirim via Gmail Web &amp; Arsipkan
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSubmitCase(e, "mailto")}
                      disabled={isSubmittingCase || !recipients.trim()}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
                    >
                      {isSubmittingCase ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                      Kirim via Mailto &amp; Arsipkan
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === "typosquat" && (
          <motion.div
            key="typosquat"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-6"
          >
            {/* Input Brand Search Panel */}
            <div className="p-5 rounded-2xl glass border border-white/10 shadow-lg flex flex-col gap-4">
              <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300 flex items-center gap-2">
                <Globe size={16} className="text-red-400" /> Brand Scan Engine
              </h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Mencari domain typosquatting tiruan di DNS global atau memindai Google Search (organik & iklan bersponsor Google Ads) secara otomatis berdasarkan nama brand Anda.
              </p>

              <div className="flex flex-wrap gap-3 mt-2">
                <input
                  type="text"
                  placeholder="Masukkan nama brand (contoh: giga, hokibets)"
                  value={targetBrand}
                  onChange={(e) => setTargetBrand(e.target.value)}
                  disabled={isScanningTyposquat || isScanningGoogle}
                  className="flex-1 min-w-[200px] bg-white/5 border border-white/10 text-white/90 placeholder:text-white/20 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-red-400 focus:border-red-400"
                />
                
                <button
                  type="button"
                  onClick={handleScanTyposquat}
                  disabled={isScanningTyposquat || isScanningGoogle || !targetBrand.trim()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isScanningTyposquat ? <Loader2 size={13} className="animate-spin" /> : null}
                  Pindai Typosquat (DNS)
                </button>

                <button
                  type="button"
                  onClick={handleScanGoogle}
                  disabled={isScanningTyposquat || isScanningGoogle || !targetBrand.trim()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isScanningGoogle ? <Loader2 size={13} className="animate-spin" /> : null}
                  Pindai Google (Ads & Organik)
                </button>
              </div>
            </div>

            {/* Scanning Results Preview */}
            <div className="p-5 rounded-2xl glass border border-white/10 shadow-lg flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300 flex items-center gap-2">
                  <ShieldAlert size={16} className="text-red-400" /> Hasil Deteksi Ancaman ({threats.length})
                </h3>
                {threats.length > 0 && (
                  <button onClick={() => setThreats([])} className="text-[10px] text-red-400 hover:underline">
                    Clear list
                  </button>
                )}
              </div>

              {threats.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-white/5 rounded-xl">
                  <Check size={30} className="text-emerald-400/30 mb-2" />
                  <p className="text-xs text-white/35">Belum ada ancaman baru yang terpindai. Jalankan pencarian di atas.</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-950/60 uppercase text-[9px] tracking-wider text-white/50 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-2.5">Domain Ancaman</th>
                        <th className="px-4 py-2.5">IP Terakhir</th>
                        <th className="px-4 py-2.5">Sumber Deteksi</th>
                        <th className="px-4 py-2.5 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-white/80">
                      {threats.map((t, idx) => (
                        <tr key={idx} className="hover:bg-white/3">
                          <td className="px-4 py-2.5 text-red-300 font-semibold">{t.domain}</td>
                          <td className="px-4 py-2.5 text-white/70">{t.ip || "Google Search Link"}</td>
                          <td className="px-4 py-2.5 text-white/40">{t.url ? "Google Search Ads/Organik" : "DNS Typosquat"}</td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-2 font-sans">
                              {t.url && (
                                <a href={t.url} target="_blank" rel="noreferrer" className="p-1 hover:text-violet-400" title="Buka Link">
                                  <ExternalLink size={13} />
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setTargetUrl(t.domain);
                                  setActiveSubTab("manual");
                                }}
                                className="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-400/20"
                              >
                                Investigasi & Takedown
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === "cases" && (
          <motion.div
            key="cases"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-5 rounded-2xl glass border border-white/10 shadow-lg flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300 flex items-center gap-2">
                <History size={16} className="text-red-400" /> Log Kasus Phishing Aktif
              </h3>
              <button onClick={fetchCases} className="p-1 hover:bg-white/5 rounded text-white/50 hover:text-white transition-all">
                <RefreshCw size={13} />
              </button>
            </div>

            {isLoadingCases ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-red-400" />
              </div>
            ) : cases.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-white/5 rounded-xl">
                <Check size={30} className="text-emerald-400/30 mb-2" />
                <p className="text-xs text-white/35">Tidak ada kasus phishing yang terdaftar saat ini.</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-white/10">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-950/60 uppercase text-[9px] tracking-wider text-white/50 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-2.5">Domain Kasus</th>
                      <th className="px-4 py-2.5">Waktu Lapor</th>
                      <th className="px-4 py-2.5">DNS Status</th>
                      <th className="px-4 py-2.5">Status Takedown</th>
                      <th className="px-4 py-2.5 text-center">Bukti NXDOMAIN</th>
                      <th className="px-4 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-white/80">
                    {cases.map((c) => (
                      <tr key={c.id} className="hover:bg-white/3">
                        <td className="px-4 py-2.5 text-red-300 font-bold">{c.domain}</td>
                        <td className="px-4 py-2.5 text-white/40 text-[10px]">{new Date(c.timeReported).toLocaleString()}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.dnsStatus === "Active" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                            {c.dnsStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${c.caseStatus === "Reported" ? "text-amber-400" : "text-emerald-400"}`}>
                            {c.caseStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-sans">
                          {c.proofFile ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <a href={c.proofFile} target="_blank" rel="noreferrer" className="text-[10px] text-violet-400 hover:underline flex items-center gap-0.5">
                                DNS Log
                              </a>
                              <span className="text-white/20">|</span>
                              <a href={c.screenshotFile || "#"} target="_blank" rel="noreferrer" className="text-[10px] text-violet-400 hover:underline flex items-center gap-0.5">
                                Visual Page
                              </a>
                            </div>
                          ) : (
                            <span className="text-white/20">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center font-sans">
                          <div className="flex items-center justify-center gap-2">
                            {c.caseStatus === "Reported" ? (
                              <button
                                onClick={() => handleVerifyDns(c.id)}
                                className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold transition-all cursor-pointer"
                              >
                                Cek DNS Real-time
                              </button>
                            ) : (
                              <span className="text-emerald-400 font-semibold text-[10px] flex items-center justify-center gap-1">
                                <Check size={11} /> Takedown Sukses
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteCase(c.id)}
                              className="p-1 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                              title="Hapus Kasus"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {activeSubTab === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-5 rounded-2xl glass border border-white/10 shadow-lg flex flex-col gap-4"
          >
            <h3 className="text-sm font-bold tracking-wider uppercase text-slate-300 flex items-center gap-2">
              <Settings size={16} className="text-red-400" /> Konfigurasi Proteksi PhishShield
            </h3>
            <p className="text-xs text-white/50 leading-relaxed">
              Atur kredensial SMTP Email untuk mengirim surat abuse ke hosting provider domain phishing, serta tambahkan API Key Serper.dev untuk pemindaian Google Ads.
            </p>

            <form onSubmit={handleSaveSettings} className="flex flex-col gap-4 mt-2">
              {/* SMTP Settings */}
              <div className="border border-white/5 rounded-xl bg-white/5 p-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                  <Mail size={14} className="text-red-400" /> SMTP Host & Auth
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase text-white/40">SMTP Host</label>
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase text-white/40">SMTP Port</label>
                    <input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                      className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 justify-center pt-4 pl-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={smtpSecure}
                        onChange={(e) => setSmtpSecure(e.target.checked)}
                        className="rounded border-white/10 bg-white/5 text-red-500 focus:ring-0"
                      />
                      Secure SSL/TLS
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase text-white/40">SMTP User / Email</label>
                    <input
                      type="email"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="Contoh: security-alerts@gmail.com"
                      className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase text-white/40">SMTP Password</label>
                    <input
                      type="password"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder="Masukkan password baru untuk merubah..."
                      className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>
                </div>
              </div>

              {/* Brand & Serper.dev Settings */}
              <div className="border border-white/5 rounded-xl bg-white/5 p-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                  <Key size={14} className="text-red-400" /> Google Search (Serper.dev) & Brand
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase text-white/40">Domain Resmi (Official Domains, Comma Separated)</label>
                    <input
                      type="text"
                      value={officialDomain}
                      onChange={(e) => setOfficialDomain(e.target.value)}
                      placeholder="Contoh: hokiplay.com, alternatip-hoki.net"
                      className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase text-white/40">Serper.dev API Key</label>
                    <input
                      type="password"
                      value={serperApiKey}
                      onChange={(e) => setSerperApiKey(e.target.value)}
                      placeholder="Masukkan API Key Serper.dev Anda..."
                      className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>
                </div>
              </div>

              {/* Google Safe Browsing API Key */}
              <div className="border border-white/5 rounded-xl bg-white/5 p-4 flex flex-col gap-3">
                <p className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                  <Database size={14} className="text-red-400" /> API Google Safe Browsing
                </p>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase text-white/40">Safe Browsing API Key</label>
                  <input
                    type="password"
                    value={safeBrowsingApiKey}
                    onChange={(e) => setSafeBrowsingApiKey(e.target.value)}
                    placeholder="Masukkan Google Safe Browsing API Key..."
                    className="bg-white/5 border border-white/10 text-white/90 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                {isSavingSettings ? <Loader2 size={13} className="animate-spin" /> : null}
                Simpan Semua Konfigurasi
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
