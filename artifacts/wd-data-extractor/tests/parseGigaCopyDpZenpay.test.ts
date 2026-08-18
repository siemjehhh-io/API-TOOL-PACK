/**
 * Unit tests for the ZENPAY panel text parser.
 *
 * Parser source: `src/pages/GigaCopyDpZenpay.tsx` (not modified).
 * The ZENPAY parser uses TRX ID prefix `06a0...` and gatekeeps on
 * `ZENPAY88 / QRIS`. Username extraction takes the LAST whitespace-separated
 * word between TRX ID and "Payment Gateway".
 */

import { describe, it, expect } from "vitest";
import { SAMPLE_TEXT, parseGigaCopyDpZenpay } from "@/pages/GigaCopyDpZenpay";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures — anonymized, valid TRX ID prefix `06a0`, ZENPAY88 / QRIS gate
// ─────────────────────────────────────────────────────────────────────────────

/** A single confirmed ZENPAY transaction. */
const FIXTURE_SINGLE_CONFIRMED =
  "1\tGame Wallet 2026-05-04 23:52:00 114.122.43.157\t06a0069f8ceb0017\tBangun Simbolon sunjaya18\t\tPayment Gateway\t\nZENPAY88 / QRIS\nConfirmed\t\t100,000.00\tAuto System\t2026-05-04 23:56:25\t";

/** A confirmed transaction with single-name customer. */
const FIXTURE_SINGLE_NAME =
  "2\tGame Wallet 2026-05-05 10:00:00 114.122.43.157\t06a0069f8ceb0018\tSANUBARI sanu123\t\tPayment Gateway\t\nZENPAY88 / QRIS\nConfirmed\t\t250,000.00\tAuto System\t2026-05-05 10:05:00\t";

/** A Rejected transaction — must be filtered out. */
const FIXTURE_REJECTED =
  "1\tGame Wallet 2026-05-04 23:52:00 114.122.43.157\t06a0069f8ceb0017\tBangun Simbolon sunjaya18\t\tPayment Gateway\t\nZENPAY88 / QRIS\nRejected\t\t100,000.00\tAuto System\t2026-05-04 23:56:25\t";

/** A non-ZENPAY transaction — must be filtered out (no ZENPAY88 / QRIS). */
const FIXTURE_NON_ZENPAY =
  "1\tGame Wallet 2026-05-04 23:52:00 114.122.43.157\t06a0069f8ceb0017\tBangun Simbolon sunjaya18\t\tPayment Gateway\t\nQRISHOKI / QRIS\nConfirmed\t\t100,000.00\tAuto System\t2026-05-04 23:56:25\t";

/** Transaction where username has the "New" badge appended. */
const FIXTURE_NEW_MEMBER =
  "1\tGame Wallet 2026-05-04 23:52:00 114.122.43.157\t06a0069f8ceb0017\tCustomer Baru tiyara57New\t\tPayment Gateway\t\nZENPAY88 / QRIS\nConfirmed\t\t75,000.00\tAuto System\t2026-05-04 23:56:25\t";

/** Transaction where username has remark color code (1-10) appended. */
const FIXTURE_REMARK_COLOR =
  "1\tGame Wallet 2026-05-04 23:52:00 114.122.43.157\t06a0069f8ceb0017\tBangun Simbolon ragelku 1\t\tPayment Gateway\t\nZENPAY88 / QRIS\nConfirmed\t\t100,000.00\tAuto System\t2026-05-04 23:56:25\t";

/** Two transactions back-to-back. */
const FIXTURE_TWO_TRANSACTIONS = FIXTURE_SINGLE_CONFIRMED + " " + FIXTURE_SINGLE_NAME;

/** Real panel copy where username is followed by New badge or AF referral code. */
const FIXTURE_PANEL_USERNAME_MARKERS =
  "2 Game Wallet 2026-06-04 23:19:31 114.8.207.16 " +
  "00MEF06a21a592cafbb (https://giga2-ns3-admin.net/transactions/t_depositform/00MEF06a21a592cafbb) " +
  "Gunan ettu2008 (https://giga2-ns3-admin.net/member_details/DGAABAF00MEF) " +
  "New (https://giga2-ns3-admin.net/member_details/DGAABAF00MEF) " +
  "Payment Gateway ZENPAY88 / QRIS Confirmed 33,000.00 Auto System 2026-06-04 23:20:29 " +
  "3 Game Wallet 2026-06-04 21:29:49 114.5.102.85 " +
  "0080R06a218bdc6880c (https://giga2-ns3-admin.net/transactions/t_depositform/0080R06a218bdc6880c) " +
  "M RIZKY PRAYOGA rizky5555 (https://giga2-ns3-admin.net/member_details/DGAABAF0080R) " +
  "AFKRHDYBM Payment Gateway ZENPAY88 / QRIS Confirmed 150,000.00 Auto System 2026-06-04 21:30:52";

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("parseGigaCopyDpZenpay — ZENPAY panel parser", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // Happy path
  // ───────────────────────────────────────────────────────────────────────────
  describe("happy path", () => {
    it("parses a single confirmed ZENPAY transaction", () => {
      const result = parseGigaCopyDpZenpay(FIXTURE_SINGLE_CONFIRMED);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("sunjaya18");
      expect(result[0].amount).toBe("100,000");
    });

    it("parses the Use Sample text", () => {
      const result = parseGigaCopyDpZenpay(SAMPLE_TEXT);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.username).sort()).toEqual(["ettu2008", "rizky5555"]);
      expect(result.some((item) => item.username.includes("AFKRHDYBM"))).toBe(false);
    });

    it("returns each transaction with the four required fields", () => {
      const result = parseGigaCopyDpZenpay(FIXTURE_SINGLE_CONFIRMED);

      expect(result[0]).toHaveProperty("date");
      expect(result[0]).toHaveProperty("trxId");
      expect(result[0]).toHaveProperty("username");
      expect(result[0]).toHaveProperty("amount");
    });

    it("preserves Indonesian thousand separator format", () => {
      const result = parseGigaCopyDpZenpay(FIXTURE_SINGLE_CONFIRMED);
      expect(result[0].amount).toBe("100,000");
    });

    it("strips the trailing .00 cents from amount", () => {
      const result = parseGigaCopyDpZenpay(FIXTURE_SINGLE_CONFIRMED);
      expect(result[0].amount).not.toMatch(/\.00$/);
    });

    it("parses multiple transactions in chronological order", () => {
      const result = parseGigaCopyDpZenpay(FIXTURE_TWO_TRANSACTIONS);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Date sort ascending
      for (let i = 1; i < result.length; i++) {
        expect(result[i].date >= result[i - 1].date).toBe(true);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gatekeepers
  // ───────────────────────────────────────────────────────────────────────────
  describe("gatekeepers", () => {
    it("skips Rejected transactions", () => {
      expect(parseGigaCopyDpZenpay(FIXTURE_REJECTED)).toHaveLength(0);
    });

    it("skips transactions that are not ZENPAY88 / QRIS", () => {
      expect(parseGigaCopyDpZenpay(FIXTURE_NON_ZENPAY)).toHaveLength(0);
    });

    it("returns empty array for empty input", () => {
      expect(parseGigaCopyDpZenpay("")).toEqual([]);
    });

    it("returns empty array for whitespace-only input", () => {
      expect(parseGigaCopyDpZenpay("   \n\t  ")).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Username cleanup
  // ───────────────────────────────────────────────────────────────────────────
  describe("username cleanup", () => {
    it('strips the "New" badge from new-member usernames', () => {
      const result = parseGigaCopyDpZenpay(FIXTURE_NEW_MEMBER);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("tiyara57");
      expect(result[0].username).not.toMatch(/New$/);
    });

    it("strips the trailing remark color code", () => {
      const result = parseGigaCopyDpZenpay(FIXTURE_REMARK_COLOR);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("ragelku");
      expect(result[0].username).not.toMatch(/\s+\d+$/);
    });

    it("uses the LAST word in the customer-name segment as username", () => {
      // "Bangun Simbolon sunjaya18" → username = "sunjaya18"
      const result = parseGigaCopyDpZenpay(FIXTURE_SINGLE_CONFIRMED);
      expect(result[0].username).toBe("sunjaya18");
    });

    it("strips panel URLs, New badge, and AF referral codes before username extraction", () => {
      const result = parseGigaCopyDpZenpay(FIXTURE_PANEL_USERNAME_MARKERS);

      expect(result).toHaveLength(2);
      expect(result.map((row) => row.username)).toEqual([
        "rizky5555",
        "ettu2008",
      ]);
      expect(result.map((row) => row.username).join(" ")).not.toMatch(
        /\b(?:New|AF[A-Z0-9]{6,})\b/,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Robustness
  // ───────────────────────────────────────────────────────────────────────────
  describe("robustness", () => {
    it("does not throw on completely random text", () => {
      expect(() => parseGigaCopyDpZenpay("asdf qwerty 12345")).not.toThrow();
      expect(parseGigaCopyDpZenpay("asdf qwerty 12345")).toEqual([]);
    });

    it("does not throw on partial Game Wallet block", () => {
      expect(() =>
        parseGigaCopyDpZenpay("1\tGame Wallet 2026-05-04"),
      ).not.toThrow();
    });

    it("does not throw on input with broken IPs (auto-fixed)", () => {
      // Parser repairs "192.168.1. 106" → "192.168.1.106" before parsing
      const broken =
        "1\tGame Wallet 2026-05-04 23:52:00 114.122.43. 157\t06a0069f8ceb0017\tBangun sunjaya18\t\tPayment Gateway\t\nZENPAY88 / QRIS\nConfirmed\t\t100,000.00\tAuto\t2026-05-04 23:56:25\t";
      expect(() => parseGigaCopyDpZenpay(broken)).not.toThrow();
    });

    it("does not throw on very large random input", () => {
      const huge = "Game Wallet ".repeat(5000);
      expect(() => parseGigaCopyDpZenpay(huge)).not.toThrow();
    });
  });
});
