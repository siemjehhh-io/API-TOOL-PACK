// Throwaway: verify the column-based GIGA QRISHOKI extractor against real sample.
const cleanUsernameCell = (raw) => String(raw || '').replace(/\s+/g, ' ').trim().replace(/\s*New$/, '').trim();
const extractDateTime = (raw) => {
  const m = String(raw || '').match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/);
  return m ? m[0].replace('T', ' ') : String(raw || '').trim();
};

function extractGigaQrisFromMatrix(header, dataRows) {
  const findIdx = (pred) => header.findIndex((h) => pred(String(h || '').toLowerCase()));
  const usernameIdx = findIdx((h) => h.includes('username'));
  const trxIdIdx = findIdx((h) => h.includes('transaction id'));
  const creditIdx = findIdx((h) => h.includes('credit'));
  const statusIdx = findIdx((h) => h.includes('status'));
  const dateIdx = findIdx((h) => h.includes('transaction date'));
  const recognized = usernameIdx >= 0 && trxIdIdx >= 0 && creditIdx >= 0;
  const transactions = [];
  let confirmedCount = 0, rejectedCount = 0, skippedCount = 0;
  if (!recognized) return { transactions, confirmedCount, rejectedCount, skippedCount, recognized };
  for (const row of dataRows) {
    const status = statusIdx >= 0 ? String(row[statusIdx] || '') : '';
    if (!/confirmed/i.test(status)) { rejectedCount += 1; continue; }
    const creditRaw = String(row[creditIdx] || '').trim();
    if (!/\d/.test(creditRaw)) { skippedCount += 1; continue; }
    const amount = creditRaw.replace(/\.\d+$/, '');
    transactions.push({
      date: dateIdx >= 0 ? extractDateTime(row[dateIdx]) : '',
      trxId: String(row[trxIdIdx] || '').trim().split(/\s+/)[0],
      username: cleanUsernameCell(row[usernameIdx]),
      amount,
    });
    confirmedCount += 1;
  }
  return { transactions, confirmedCount, rejectedCount, skippedCount, recognized };
}

const header = ["No","Transaction Date","Transaction ID","Account Name","Username","Upline Ref ID","Ref No","Fund Method","Bank Details","Status","Receipt","Debit","Credit","Confirmed/Rejected by","Confirmed/Rejected time","Notes"];
const rows = [
  ["1","Game Wallet 2026-06-15 18:56:52 114.10.76.159","0013V86a2fe8842e01c","Citrapuspitasari / GOPAY085884857778","itaa83","","019ecb23-6629-9560-2b2c-99f8c2daf06b","Bank / QRISHOKI","Admin Deposit Transfer - QRISHOKI / QRISHOKI QRISHOKI","Confirmed","","","10,000.00","botqh","2026-06-15 18:56:52",""],
  ["2","Game Wallet 2026-06-15 18:56:35 180.247.56.45","001HS86a2fe873a54d0","Muhammad Darto / BCA6350173933","vermakin1New","","019ecb23-2806-9af6-75ba-9e2a880f1155","Bank / QRISHOKI","Admin Deposit Transfer - QRISHOKI / QRISHOKI QRISHOKI","Confirmed","","","50,000.00","botqh","2026-06-15 18:56:36",""],
  ["3","Game Wallet 2026-06-15 18:55:51 103.47.134.21","001JL86a2fe8477ba9e","Muhamad Hardiansyah / DANA088211555601","filter89New","","019ecb22-58d2-c380-1df8-790d67ec0f47","Bank / QRISHOKI","Admin Deposit Transfer - QRISHOKI / QRISHOKI QRISHOKI","Confirmed","","","25,000.00","botqh","2026-06-15 18:55:52",""],
  ["4","Game Wallet 2026-06-15 18:55:51 103.153.246.54","001JO86a2fe8476c756","ahlan ali adikara / GOPAY089698523366","slasamaksaNew","","019ecb22-f6f2-3f9e-3737-ed8700cf4893","Bank / QRISHOKI","Admin Deposit Transfer - QRISHOKI / QRISHOKI QRISHOKI","Confirmed","","","25,000.00","botqh","2026-06-15 18:55:51",""],
  ["5","Game Wallet 2026-06-15 18:55:50 157.20.233.39","000G486a2fe846ca725","Faizal saputra / DANA083139208767","bintannNew","","019ecb22-dbb0-fa5a-8cbd-5044b8ea34ca","Bank / QRISHOKI","Admin Deposit Transfer - QRISHOKI / QRISHOKI QRISHOKI","Confirmed","","","70,000.00","botqh","2026-06-15 18:55:51",""],
  // a rejected row to ensure it's filtered out
  ["6","Game Wallet 2026-06-15 18:55:00 1.2.3.4","00XYZ","Test / DANA1","ditolakNew","","ref","Bank / QRISHOKI","Admin","Rejected","","","","99,000.00","botqh","2026-06-15 18:55:00",""],
];

const out = extractGigaQrisFromMatrix(header, rows);
console.log('recognized =', out.recognized, '| confirmed =', out.confirmedCount, '| rejected =', out.rejectedCount, '| skipped =', out.skippedCount);
for (const t of out.transactions) console.log(`${t.trxId}\t${t.username}\t${t.amount}\t${t.date}`);
