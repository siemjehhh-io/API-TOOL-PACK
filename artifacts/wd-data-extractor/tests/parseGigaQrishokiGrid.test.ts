import { describe, it, expect } from "vitest";
import { parseGigaQrishokiGrid } from "../src/pages/GigaCopyDpHoki";

// Header row exactly as the QRISHOKI panel emits it (column order from a real copy).
const HEADERS = [
  "No",
  "Transaction Date",
  "Transaction ID",
  "Account Name",
  "Username",
  "Upline Ref ID",
  "Ref No",
  "Fund Method",
  "Bank Details",
  "Status",
  "Receipt",
  "Debit",
  "Credit",
  "Confirmed/Rejected by",
  "Confirmed/Rejected time",
  "Notes",
];

function row(opts: {
  no: string;
  date: string;
  trxId: string;
  account: string;
  username: string;
  status: string;
  credit: string;
}): string[] {
  return [
    opts.no,
    `Game Wallet ${opts.date} 114.10.76.159`,
    opts.trxId,
    opts.account,
    opts.username,
    "",
    "019ecb23-6629-9560-2b2c-99f8c2daf06b",
    "Bank / QRISHOKI",
    "Admin Deposit Transfer - QRISHOKI / QRISHOKI QRISHOKI",
    opts.status,
    "",
    "",
    opts.credit,
    "botqh",
    opts.date,
    "",
  ];
}

describe("parseGigaQrishokiGrid", () => {
  const grid = [
    HEADERS,
    row({ no: "1", date: "2026-06-15 18:56:52", trxId: "0013V86a2fe8842e01c", account: "Citrapuspitasari / GOPAY 085884857778", username: "itaa83", status: "Confirmed", credit: "10,000.00" }),
    row({ no: "2", date: "2026-06-15 18:56:35", trxId: "001HS86a2fe873a54d0", account: "Muhammad Darto / BCA 6350173933", username: "vermakin1New", status: "Confirmed", credit: "50,000.00" }),
    row({ no: "3", date: "2026-06-15 18:55:51", trxId: "001JL86a2fe8477ba9e", account: "Muhamad Hardiansyah / DANA 088211555601", username: "filter89New", status: "Confirmed", credit: "25,000.00" }),
    // Rejected row -> excluded
    row({ no: "4", date: "2026-06-15 18:55:51", trxId: "001JO86a2fe8476c756", account: "ahlan ali adikara / GOPAY 089698523366", username: "slasamaksaNew", status: "Rejected", credit: "25,000.00" }),
    // Confirmed but empty credit -> skipped (not a DP/credit row)
    row({ no: "5", date: "2026-06-15 18:55:50", trxId: "000G486a2fe846ca725", account: "Faizal saputra / DANA 083139208767", username: "bintannNew", status: "Confirmed", credit: "" }),
  ];

  const result = parseGigaQrishokiGrid(grid);

  it("keeps only Confirmed rows that have a Credit amount", () => {
    expect(result.transactions).toHaveLength(3);
    expect(result.rejectedCount).toBe(1); // the Rejected row
    expect(result.skippedCount).toBe(1); // the empty-credit row
  });

  it("reads username from its own column (no account/username split heuristic)", () => {
    expect(result.transactions[0].username).toBe("itaa83");
  });

  it('strips the trailing "New" member badge from the username', () => {
    expect(result.transactions[1].username).toBe("vermakin1");
    expect(result.transactions[2].username).toBe("filter89");
  });

  it("takes the Credit column as the amount and strips the .00 decimals", () => {
    expect(result.transactions[0].amount).toBe("10,000");
    expect(result.transactions[1].amount).toBe("50,000");
  });

  it("extracts trxId and the date-time from their columns", () => {
    expect(result.transactions[0].trxId).toBe("0013V86a2fe8842e01c");
    expect(result.transactions[0].date).toBe("2026-06-15 18:56:52");
  });

  it("works regardless of column order (matched by header name)", () => {
    // Build a grid with a different column order.
    const shuffledHeaders = ["Username", "Credit", "Transaction ID", "Status", "Transaction Date"];
    const shuffled = [
      shuffledHeaders,
      ["budi99New", "15,000.00", "00ABC86a2fe800001", "Confirmed", "Game Wallet 2026-06-16 01:00:00 1.2.3.4"],
    ];
    const r = parseGigaQrishokiGrid(shuffled);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].username).toBe("budi99");
    expect(r.transactions[0].amount).toBe("15,000");
    expect(r.transactions[0].trxId).toBe("00ABC86a2fe800001");
    expect(r.transactions[0].date).toBe("2026-06-16 01:00:00");
  });

  it("returns empty when essential columns are missing (caller falls back)", () => {
    const r = parseGigaQrishokiGrid([["Foo", "Bar"], ["a", "b"]]);
    expect(r.transactions).toHaveLength(0);
  });
});
