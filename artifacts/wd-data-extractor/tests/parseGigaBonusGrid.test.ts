import { describe, it, expect } from "vitest";
import { parseGigaBonusGrid } from "../src/pages/GigaCopyBonus";

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

function row(opts: { username: string; fund: string; status: string; credit: string; date: string }): string[] {
  return [
    "1",
    `Game Wallet ${opts.date} 140.213.16.245`,
    "002A286a302f8944f4c",
    "Moch Riki / BCA 7772370574",
    opts.username,
    "",
    "019ecc39-5783-3fc9",
    opts.fund,
    "",
    opts.status,
    "",
    "",
    opts.credit,
    "botqh",
    opts.date,
    "",
  ];
}

describe("parseGigaBonusGrid", () => {
  const grid = [
    HEADERS,
    row({ username: "timez22", fund: "BONUS NEW MEMBER SLOT 100%", status: "Confirmed", credit: "25,000.00", date: "2026-06-15 23:59:53" }),
    row({ username: "renol88New", fund: "BONUS DEPOSIT HARIAN 10%", status: "Confirmed", credit: "20,000.00", date: "2026-06-15 23:52:11" }),
    row({ username: "ditolak1", fund: "BONUS NEW MEMBER SLOT 100%", status: "Rejected", credit: "25,000.00", date: "2026-06-15 23:00:00" }),
  ];

  const result = parseGigaBonusGrid(grid);

  it("keeps only Confirmed rows", () => {
    expect(result).toHaveLength(2);
  });

  it("reads username (strips New) from its own column", () => {
    expect(result[0].username).toBe("timez22");
    expect(result[1].username).toBe("renol88");
  });

  it("uses Fund Method as the bonus type (keterangan)", () => {
    expect(result[0].bonusType).toBe("BONUS NEW MEMBER SLOT 100%");
    expect(result[1].bonusType).toBe("BONUS DEPOSIT HARIAN 10%");
  });

  it("captures Confirmed/Rejected by (for keterangan prefix)", () => {
    expect(result[0].confirmedBy).toBe("botqh");
  });

  it("takes Credit as the amount and strips .00", () => {
    expect(result[0].amount).toBe("25,000");
    expect(result[1].amount).toBe("20,000");
  });

  it("extracts the transaction date", () => {
    expect(result[0].date).toBe("2026-06-15 23:59:53");
  });
});
