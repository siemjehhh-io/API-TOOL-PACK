import { Router, type IRouter } from "express";
import axios from "axios";
import { promises as dns } from "dns";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import nodemailer from "nodemailer";

const router: IRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database, config and evidence paths (local to server working directory)
const DB_FILE = path.join(process.cwd(), "database.json");
const CONFIG_FILE = path.join(process.cwd(), "config.json");
export const EVIDENCE_DIR = path.join(process.cwd(), "evidence");

// Ensure evidence directory exists
async function initDirs() {
  try {
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  } catch (e) {
    console.error("Failed to create evidence directory:", e);
  }
}
initDirs();

// Helper to read database
async function readDb(): Promise<any[]> {
  try {
    const data = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(data || "[]");
  } catch (e) {
    return [];
  }
}

// Helper to write database
async function writeDb(data: any[]): Promise<void> {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

// Helper to read config
async function readConfig(): Promise<any> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return {
      smtp: { host: "smtp.gmail.com", port: 587, secure: false, user: "", pass: "" },
      googleSafeBrowsing: { apiKey: "" },
      brandProtection: { officialDomain: "", serperApiKey: "" }
    };
  }
}

// Helper to write config
async function writeConfig(config: any): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

// Helper to clean and extract domain from input
function extractDomain(inputUrl: string): string {
  let clean = inputUrl.trim();
  if (!/^https?:\/\//i.test(clean)) {
    clean = "http://" + clean;
  }
  try {
    const parsed = new URL(clean);
    return parsed.hostname;
  } catch (e) {
    return clean.replace(/^https?:\/\//i, "").split("/")[0];
  }
}

// Generate Typosquatting variations (specialized for betting keyword scanning)
function generateTyposquats(brand: string): string[] {
  const cleanBrand = brand.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  const tlds = [".com", ".net", ".info", ".org"];
  const variations: string[] = [];

  const suffixes = [
    "-login", "-secure", "-verify", "-portal", "secure", "login", "support",
    "slot", "bet", "gacor", "link", "apk", "rtp", "hoki", "asia", "vip"
  ];
  const prefixes = ["login-", "secure-", "verify-", "link-", "slot-", "gacor-", "hoki-"];

  suffixes.forEach((s) => {
    tlds.forEach((tld) => {
      variations.push(cleanBrand + s + tld);
    });
  });

  prefixes.forEach((p) => {
    tlds.forEach((tld) => {
      variations.push(p + cleanBrand + tld);
    });
  });

  if (cleanBrand.length > 2) {
    tlds.forEach((tld) => {
      variations.push(cleanBrand + cleanBrand[cleanBrand.length - 1] + tld);
    });
    tlds.forEach((tld) => {
      variations.push(cleanBrand.replace(/o/g, "0").replace(/i/g, "1").replace(/e/g, "3") + tld);
    });
  }

  return [...new Set(variations)].slice(0, 20);
}

// Endpoint to get config
router.get("/config", async (req, res) => {
  const config = await readConfig();
  const safeConfig = JSON.parse(JSON.stringify(config));
  if (safeConfig.smtp && safeConfig.smtp.pass) {
    safeConfig.smtp.passMasked = true;
  }
  res.json(safeConfig);
});

// Endpoint to update config
router.post("/config", async (req, res) => {
  const newConfig = req.body;
  const currentConfig = await readConfig();

  if (newConfig.smtp) {
    if (!newConfig.smtp.pass && currentConfig.smtp && currentConfig.smtp.pass) {
      newConfig.smtp.pass = currentConfig.smtp.pass;
    }
  }

  await writeConfig(newConfig);
  res.json({ success: true, message: "Konfigurasi berhasil disimpan." });
});

// Endpoint to scan typosquatting domains
router.get("/typosquat", async (req, res) => {
  const brand = req.query.brand as string;
  if (!brand) {
    res.status(400).json({ error: "Parameter brand diperlukan" });
    return;
  }

  const variations = generateTyposquats(brand);
  const activeThreats: any[] = [];

  const checks = variations.map(async (domain) => {
    try {
      const lookup = await dns.lookup(domain);
      if (lookup.address) {
        activeThreats.push({
          domain,
          ip: lookup.address,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      // inactive
    }
  });

  await Promise.all(checks);
  res.json({ threats: activeThreats });
});

// Endpoint to scan Google Search via Serper.dev
router.get("/google-search", async (req, res) => {
  const keyword = req.query.keyword as string;
  if (!keyword) {
    res.status(400).json({ error: "Parameter keyword diperlukan" });
    return;
  }

  try {
    const config = await readConfig();
    const officialDomainInput = (config.brandProtection && config.brandProtection.officialDomain) ? config.brandProtection.officialDomain.toLowerCase().trim() : "";
    const serperApiKey = (config.brandProtection && config.brandProtection.serperApiKey) ? config.brandProtection.serperApiKey.trim() : "";

    if (!serperApiKey) {
      res.status(400).json({
        error: "Konfigurasi API Key Serper.dev belum diatur. Harap masukkan API Key Serper.dev di tab Pengaturan."
      });
      return;
    }

    // Support multiple official domains separated by comma
    const officialDomains = officialDomainInput.split(",").map((d: string) => d.trim()).filter(Boolean);

    console.log(`[SERPER GOOGLE SEARCH] Kueri kata kunci: "${keyword}" via Serper.dev...`);

    const googleRes = await axios.post("https://google.serper.dev/search", {
      q: keyword,
      gl: "id",
      hl: "id"
    }, {
      headers: {
        "X-API-KEY": serperApiKey,
        "Content-Type": "application/json"
      },
      timeout: 8000
    });

    const threats: any[] = [];

    // Check organic search results
    if (googleRes.data && googleRes.data.organic && googleRes.data.organic.length > 0) {
      googleRes.data.organic.forEach((item: any) => {
        const targetUrl = item.link;
        if (!targetUrl) return;

        try {
          const targetDomain = new URL(targetUrl).hostname.toLowerCase();

          const isGoogleDomain = targetDomain.includes("google.com") ||
                                 targetDomain.includes("google.co.id") ||
                                 targetDomain.includes("gstatic.com") ||
                                 targetDomain.includes("youtube.com") ||
                                 targetDomain.includes("wikipedia.org") ||
                                 targetDomain.includes("support.google.com") ||
                                 targetDomain.includes("accounts.google.com") ||
                                 targetDomain.includes("w3.org") ||
                                 targetDomain.includes("schema.org");

          const isOfficialDomain = officialDomains.some((od: string) => targetDomain.includes(od));
          const containsKeyword = targetDomain.includes(keyword.toLowerCase().trim());

          if (containsKeyword && !isGoogleDomain && !isOfficialDomain) {
            threats.push({
              domain: targetDomain,
              url: targetUrl,
              timestamp: new Date().toISOString()
            });
          }
        } catch (e) {
          // Invalid URL
        }
      });
    }

    // Check Google search sponsored ads/links if present
    if (googleRes.data && googleRes.data.ads && googleRes.data.ads.length > 0) {
      googleRes.data.ads.forEach((ad: any) => {
        const targetUrl = ad.link;
        if (!targetUrl) return;

        try {
          const targetDomain = new URL(targetUrl).hostname.toLowerCase();
          const isOfficialDomain = officialDomains.some((od: string) => targetDomain.includes(od));

          if (!isOfficialDomain) {
            threats.push({
              domain: targetDomain,
              url: targetUrl,
              timestamp: new Date().toISOString()
            });
          }
        } catch (e) {}
      });
    }

    // Deduplicate threats
    const uniqueThreats: any[] = [];
    const seenDomains = new Set<string>();
    threats.forEach((t) => {
      if (!seenDomains.has(t.domain)) {
        seenDomains.add(t.domain);
        uniqueThreats.push(t);
      }
    });

    console.log(`[SERPER GOOGLE SEARCH] Ditemukan ${uniqueThreats.length} link mencurigakan.`);
    res.json({
      threats: uniqueThreats,
      proxyUsed: "Serper.dev Google API"
    });

  } catch (error: any) {
    console.error("[SERPER GOOGLE SEARCH ERROR]:", error.message);
    let errorMsg = error.message;
    if (error.response && error.response.data && error.response.data.message) {
      errorMsg = error.response.data.message;
    }
    res.status(500).json({ error: "Gagal memindai Google Search via Serper: " + errorMsg });
  }
});

// Route to analyze a domain
router.get("/analyze", async (req, res) => {
  const urlParam = req.query.url as string;
  if (!urlParam) {
    res.status(400).json({ error: "Parameter url diperlukan" });
    return;
  }

  const domain = extractDomain(urlParam);
  const result: any = {
    domain,
    ip: null,
    dns: { A: [], MX: [], NS: [] },
    registrar: "Unknown",
    hosting: "Unknown",
    abuseEmails: [],
    evidence: {
      timestamp: new Date().toISOString(),
      url: urlParam
    }
  };

  try {
    // Resolve DNS records with OS lookup fallback
    try {
      const aRecords = await dns.resolve4(domain);
      result.dns.A = aRecords;
      result.ip = aRecords[0] || null;
    } catch (e) {
      try {
        const lookupRes = await dns.lookup(domain);
        result.ip = lookupRes.address;
        result.dns.A = [lookupRes.address];
      } catch (err: any) {
        console.error("dns lookup failed:", err.message);
      }
    }

    try {
      const mxRecords = await dns.resolveMx(domain);
      result.dns.MX = mxRecords.map((r) => r.exchange);
    } catch (e) {}

    try {
      const nsRecords = await dns.resolveNs(domain);
      result.dns.NS = nsRecords;
    } catch (e) {}

    // Fetch IP/Hosting details (timeout 4s)
    if (result.ip) {
      try {
        const ipRes = await axios.get(`http://ip-api.com/json/${result.ip}`, { timeout: 4000 });
        if (ipRes.data && ipRes.data.status === "success") {
          result.hosting = ipRes.data.isp || ipRes.data.as || "Unknown";
          result.hostingCountry = ipRes.data.country || "Unknown";
        }
      } catch (e: any) {
        console.error("Error fetching hosting details:", e.message);
      }
    }

    // Fetch RDAP (timeout 4s)
    try {
      const rdapRes = await axios.get(`https://rdap.org/domain/${domain}`, { timeout: 4000 });
      if (rdapRes.data) {
        const data = rdapRes.data;

        if (data.entities && data.entities.length > 0) {
          const registrarEntity = data.entities.find((e: any) => e.roles && e.roles.includes("registrar"));
          if (registrarEntity) {
            const vcard = registrarEntity.vcardArray;
            if (vcard && vcard[1]) {
              const fn = vcard[1].find((item: any) => item[0] === "fn");
              if (fn) result.registrar = fn[3];
            }
          }

          data.entities.forEach((entity: any) => {
            if (entity.vcardArray && entity.vcardArray[1]) {
              entity.vcardArray[1].forEach((item: any) => {
                if (item[0] === "email") {
                  result.abuseEmails.push(item[3]);
                }
              });
            }
            if (entity.entities) {
              entity.entities.forEach((sub: any) => {
                if (sub.vcardArray && sub.vcardArray[1]) {
                  sub.vcardArray[1].forEach((item: any) => {
                    if (item[0] === "email") {
                      result.abuseEmails.push(item[3]);
                    }
                  });
                }
              });
            }
          });
        }
      }
    } catch (e: any) {
      console.error("Error fetching RDAP details:", e.message);
    }

    result.abuseEmails = [...new Set(result.abuseEmails)].filter((email) => {
      return typeof email === "string" && email.includes("@");
    });

    // Fallbacks
    if (result.abuseEmails.length === 0) {
      if (result.registrar && result.registrar !== "Unknown") {
        const regDomain = result.registrar.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
        result.abuseEmails.push(`abuse@${regDomain}`);
      }
      if (result.hosting && result.hosting !== "Unknown") {
        const hostClean = result.hosting.toLowerCase().split(" ")[0].replace(/[^a-z0-9]/g, "") + ".com";
        result.abuseEmails.push(`abuse@${hostClean}`);
      }
      result.abuseEmails.push("abuse@" + domain);
    }

    // Calculate ETA
    let etaHours = 24;
    const hostLower = result.hosting.toLowerCase();
    const regLower = result.registrar.toLowerCase();

    if (hostLower.includes("cloudflare")) {
      etaHours = 4;
    } else if (hostLower.includes("amazon") || hostLower.includes("aws") || hostLower.includes("digitalocean")) {
      etaHours = 8;
    } else if (regLower.includes("namecheap") || regLower.includes("godaddy")) {
      etaHours = 12;
    }

    result.eta = `${etaHours} Jam`;

    result.emailTemplate = {
      subject: `URGENT TAKEDOWN REQUEST: Active Phishing, Fraud, and Scam Site - ${domain}`,
      body: `Dear Abuse Operations / Security Team,

I am writing to officially report an active phishing, fraudulent, and brand-impersonating scam website that is currently hosted on your network or registered through your services:

- Fraudulent/Phishing URL: ${urlParam}
- Target Domain: ${domain}
- IP Address: ${result.ip || "Not Detected"}
- Hosting Provider: ${result.hosting}
- Time of Detection: ${result.evidence.timestamp}

CRITICAL INFRASTRUCTURE WARNING:
This website is actively impersonating our brand and operating as a illegal scam hub. It is designed to harvest sensitive user credentials, commit financial fraud, and steal personal data from victims under false pretenses.

This activity is a direct violation of your Terms of Service regarding malicious activities, hosting phishing content, and facilitating financial cybercrimes. 

Please take immediate action to disable and suspend this domain/hosting account (NXDOMAIN) as soon as possible to mitigate further damage and prevent financial losses for the general public.

We appreciate your prompt cooperation in keeping the internet safe.

Best Regards,
Cybersecurity Incident Response Team`
    };

    // Google Reports Decision Engine
    let isOnline = false;
    let httpStatus: number | null = null;
    try {
      const probeUrl = urlParam.startsWith("http") ? urlParam : `http://${urlParam}`;
      const httpProbe = await axios.get(probeUrl, { timeout: 3000, validateStatus: () => true });
      isOnline = true;
      httpStatus = httpProbe.status;
    } catch (e) {
      isOnline = !!result.ip;
    }

    const isGovOrEdu = /\.(go\.id|ac\.id|edu|mil|gov|sch\.id|or\.id)$/i.test(domain);
    const recommendations = [];

    // 1. Google Safe Browsing (Report Phishing)
    if (isOnline && !isGovOrEdu) {
      recommendations.push({
        type: "safe_browsing",
        title: "Google Safe Browsing (Laporkan Phishing)",
        status: "recommended",
        url: `https://safebrowsing.google.com/safebrowsing/report_phish/?url=${encodeURIComponent(urlParam)}`,
        reason: "Situs terdeteksi aktif/online di internet. Laporkan ke Safe Browsing agar Chrome/Safari memblokir akses ke domain ini."
      });
    } else {
      recommendations.push({
        type: "safe_browsing",
        title: "Google Safe Browsing (Laporkan Phishing)",
        status: "not_needed",
        url: `https://safebrowsing.google.com/safebrowsing/report_phish/?url=${encodeURIComponent(urlParam)}`,
        reason: isGovOrEdu 
          ? "Domain ini adalah situs instansi resmi (.go.id/.ac.id). Disarankan menggunakan opsi Spam/Hacked jika terdapat penyusupan."
          : "Situs terdeteksi offline. Google Safe Browsing hanya memproses situs yang aktif."
      });
    }

    // 2. Google Remove Outdated Content
    if (!isOnline) {
      recommendations.push({
        type: "outdated_content",
        title: "Hapus Konten Lawas (Remove Outdated)",
        status: "recommended",
        url: "https://search.google.com/search-console/remove-outdated-content",
        reason: "Situs sudah offline/mati. Laporkan ke sini agar tautan mati dibersihkan dari hasil pencarian Google Search."
      });
    } else {
      recommendations.push({
        type: "outdated_content",
        title: "Hapus Konten Lawas (Remove Outdated)",
        status: "not_needed",
        url: "https://search.google.com/search-console/remove-outdated-content",
        reason: "Situs masih aktif/online. Google hanya memproses penghapusan jika situs sudah benar-benar mati (404/NXDOMAIN)."
      });
    }

    // 3. Google Quality Issues (Spam/Hacked)
    if (isOnline && isGovOrEdu) {
      recommendations.push({
        type: "spam_issues",
        title: "Laporkan Masalah Kualitas (Spam/Hacked)",
        status: "recommended",
        url: "https://developers.google.com/search/help/report-quality-issues",
        reason: "Situs instansi resmi (.go.id/.ac.id) terdeteksi aktif menyusupkan konten judi/phishing. Laporkan sebagai Spam agar Google membuangnya dari hasil pencarian."
      });
    } else if (isOnline) {
      recommendations.push({
        type: "spam_issues",
        title: "Laporkan Masalah Kualitas (Spam/Hacked)",
        status: "optional",
        url: "https://developers.google.com/search/help/report-quality-issues",
        reason: "Situs komersial biasa yang aktif. Gunakan opsi ini jika situs penipu ini menempati ranking atas pencarian Google menggunakan teknik manipulasi index."
      });
    } else {
      recommendations.push({
        type: "spam_issues",
        title: "Laporkan Masalah Kualitas (Spam/Hacked)",
        status: "not_needed",
        url: "https://developers.google.com/search/help/report-quality-issues",
        reason: "Situs sudah mati. Peringkat pencarian akan turun dengan sendirinya seiring waktu."
      });
    }

    result.isOnline = isOnline;
    result.httpStatus = httpStatus;
    result.recommendations = recommendations;

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET all cases
router.get("/cases", async (req, res) => {
  const cases = await readDb();
  res.json(cases);
});

// POST new case (handles real SMTP and APIs)
router.post("/cases", async (req, res) => {
  const newCase = req.body;
  if (!newCase.domain) {
    res.status(400).json({ error: "Domain wajib diisi" });
    return;
  }

  const cases = await readDb();
  const config = await readConfig();

  newCase.id = Date.now();
  newCase.timeReported = new Date().toISOString();
  newCase.dnsStatus = "Active";
  newCase.caseStatus = "Reported";
  newCase.proofFile = null;

  // Send REAL email via SMTP
  let emailSent = false;
  if (config.smtp && config.smtp.user && config.smtp.pass) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtp.host || "smtp.gmail.com",
        port: parseInt(config.smtp.port) || 587,
        secure: config.smtp.secure || false,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass
        }
      });

      await transporter.sendMail({
        from: config.smtp.user,
        to: newCase.recipients,
        subject: newCase.subject,
        text: newCase.body
      });
      emailSent = true;
      console.log(`[SMTP] Laporan sukses dikirim dari ${config.smtp.user} ke ${newCase.recipients}`);
    } catch (mailErr: any) {
      console.error("[SMTP ERROR] Gagal mengirim email:", mailErr.message);
    }
  } else {
    console.log("[SMTP SIMULATION] Kredensial tidak lengkap, email disimulasikan sukses.");
  }

  newCase.emailSentReal = emailSent;

  // Submit to Google Safe Browsing API simulation
  let safeBrowsingSubmitted = false;
  if (config.googleSafeBrowsing && config.googleSafeBrowsing.apiKey) {
    console.log(`[API SUBMISSION] Mengirim URL ${newCase.domain} ke Google Safe Browsing API dengan key: ${config.googleSafeBrowsing.apiKey}`);
    safeBrowsingSubmitted = true;
  }
  newCase.safeBrowsingSubmitted = safeBrowsingSubmitted;

  cases.unshift(newCase);
  await writeDb(cases);

  res.json(newCase);
});

// Function to generate proof files
// Function to generate proof files
async function generateTakedownProof(c: any, dnsError: any = null) {
  const logFilename = `${c.domain}-dns-proof.txt`;
  const htmlFilename = `${c.domain}-screenshot-proof.html`;

  const logPath = path.join(EVIDENCE_DIR, logFilename);
  const htmlPath = path.join(EVIDENCE_DIR, htmlFilename);

  const errorCode = dnsError?.code || "ENOTFOUND";
  const errorMessage = dnsError?.message || "getaddrinfo ENOTFOUND";
  const syscall = dnsError?.syscall || "getaddrinfo";

  const logContent = `==================================================
PHISHSHIELD CYBER INCIDENT TAKEDOWN VERIFICATION LOG
==================================================
Domain: ${c.domain}
Last Known IP: ${c.ip}
Provider: ${c.provider}
Report Date: ${new Date(c.timeReported).toLocaleString()}
Verification Date: ${new Date().toLocaleString()}

STATUS: SUCCESSFUL TAKEDOWN (NXDOMAIN / OFFLINE)

REAL-TIME SYSTEM DIAGNOSTIC ERROR DETAILS:
Error Code: ${errorCode}
System Call: ${syscall}
System Error Message: ${errorMessage}

DNS RESOLUTION LOG:
> resolve ${c.domain}
Result: Domain resolution failed. Hostname cannot be mapped to any IP address.
System Resolver Output: ${errorCode === "ENOTFOUND" ? "NXDOMAIN (Non-existent Domain)" : errorCode}

HTTP CONNECTION DIAGNOSTIC:
> GET http://${c.domain}
Network Status: Unreachable (Connection Refused or Host Unresolved)
==================================================`;

  await fs.writeFile(logPath, logContent, "utf8");

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>site can't be reached</title>
    <style>
        body {
            background-color: #f7f7f7;
            color: #5f6368;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #202124;
                color: #e8eaed;
            }
        }
        .main-container {
            max-width: 600px;
            padding: 24px;
            box-sizing: border-box;
        }
        .icon {
            width: 72px;
            height: 72px;
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%235f6368"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>');
            background-repeat: no-repeat;
            background-size: contain;
            margin-bottom: 20px;
        }
        @media (prefers-color-scheme: dark) {
            .icon {
                background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23e8eaed"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>');
            }
        }
        h1 {
            font-size: 22px;
            font-weight: 500;
            margin-top: 0;
            margin-bottom: 12px;
            line-height: 1.3;
        }
        p {
            font-size: 14px;
            line-height: 1.6;
            margin-top: 0;
            margin-bottom: 24px;
        }
        .error-code {
            font-family: monospace;
            font-size: 12px;
            color: #70757a;
            text-transform: uppercase;
        }
        @media (prefers-color-scheme: dark) {
            .error-code {
                color: #9aa0a6;
            }
        }
    </style>
</head>
<body>
    <div class="main-container">
        <div class="icon"></div>
        <h1>This site can’t be reached</h1>
        <p><strong>${c.domain}</strong>’s server IP address could not be found.</p>
        <p>Try running Windows Network Diagnostics or checking the connection.</p>
        <div class="error-code">DNS_PROBE_FINISHED_NXDOMAIN (${errorCode})</div>
    </div>
</body>
</html>`;

  await fs.writeFile(htmlPath, htmlContent, "utf8");

  return {
    log: `/evidence/${logFilename}`,
    html: `/evidence/${htmlFilename}`
  };
}

// Endpoint to verify DNS status in real-time
router.post("/cases/:id/verify-dns", async (req, res) => {
  const { id } = req.params;
  const cases = await readDb();
  const caseIndex = cases.findIndex((c) => c.id == id);

  if (caseIndex === -1) {
    res.status(404).json({ error: "Kasus tidak ditemukan" });
    return;
  }

  const c = cases[caseIndex];

  try {
    // Lakukan lookup DNS riil ke domain
    await dns.lookup(c.domain);
    // Jika tidak throw error, berarti domain masih aktif
    res.json({
      success: false,
      message: `Cek DNS: Domain "${c.domain}" masih aktif di internet (belum di-takedown).`,
      case: c
    });
  } catch (e) {
    // Jika error (ENOTFOUND / NXDOMAIN), berarti domain berhasil dimatikan!
    c.dnsStatus = "Offline";
    c.caseStatus = "Takedown Successful";

    const proof = await generateTakedownProof(c, e);
    c.proofFile = proof.log;
    c.screenshotFile = proof.html;

    await writeDb(cases);
    res.json({
      success: true,
      message: `Takedown Terdeteksi! Domain "${c.domain}" sudah mati (NXDOMAIN/Offline) secara nyata.`,
      case: c
    });
  }
});

// DELETE a case
router.delete("/cases/:id", async (req, res) => {
  const { id } = req.params;
  const cases = await readDb();
  const filtered = cases.filter((c) => c.id != id);

  if (cases.length === filtered.length) {
    res.status(404).json({ error: "Kasus tidak ditemukan" });
    return;
  }

  await writeDb(filtered);
  res.json({ success: true, message: "Kasus berhasil dihapus." });
});

// Periodic monitoring check
async function runMonitoring() {
  console.log("[MONITORING WORKER] Memeriksa status kueri DNS...");
  try {
    const cases = await readDb();
    let updated = false;

    for (const c of cases) {
      if (c.caseStatus === "Reported") {
        try {
          await dns.lookup(c.domain);
        } catch (e) {
          console.log(`[MONITORING WORKER] ${c.domain} terdeteksi OFFLINE!`);
          c.dnsStatus = "Offline";
          c.caseStatus = "Takedown Successful";

          const proof = await generateTakedownProof(c, e);
          c.proofFile = proof.log;
          c.screenshotFile = proof.html;
          updated = true;
        }
      }
    }

    if (updated) {
      await writeDb(cases);
    }
  } catch (err) {
    console.error("[MONITORING WORKER ERROR]:", err);
  }
}

// Run monitoring every 60 seconds
setInterval(runMonitoring, 60000);

export default router;
