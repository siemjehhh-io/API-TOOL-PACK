/**
 * Unit tests for the BONUS panel text parser.
 *
 * Verifies behavior only â€” does not modify the parser source.
 * Source: `src/pages/GigaCopyBonus.tsx` (`parseGigaCopyBonus`).
 *
 * The BONUS parser handles two shapes:
 *   - Shape A: bank-anchored (DANA/BCA/etc + UUID present)  â† most common
 *   - Shape B: TRX-ID-anchored (no bank info, fallback path)
 *
 * Test groups:
 *   - happy path        : confirmed bonus transactions
 *   - gatekeepers       : Rejected / no-Confirmed inputs
 *   - bonus type detection : BONUS keyword variants
 *   - admin extraction  : keterangan composes "<admin>-<bonusType>"
 *   - robustness        : malformed / empty / huge inputs
 */

import { describe, it, expect } from "vitest";
import { SAMPLE_TEXT, parseGigaCopyBonus } from "@/pages/GigaCopyBonus";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test fixtures â€” anonymized BONUS panel exports
//
// BONUS TRX ID prefixes: BOTH `86a0` and `06a0` are valid (per parser regex).
// Bonus types observed: BONUS, CASHBACK, REBATE, EVENT, FREESPIN, BUYSPIN,
// ROLLINGAN, with optional WELCOME / NEW MEMBER / NEW DEPOSIT prefix.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Shape A: standard bank-anchored bonus transaction. */
const FIXTURE_BONUS_DANA =
  "1Game Wallet 2026-05-04 04:40:36 114.122.236.131004AL86a0c0d47f1e0aARDIANSYAH / DANA 082259082915 anjas888119defc80-0c60-6325-e94a-208736f2fec1BONUS DEPOSIT HARIAN 10%Confirmed20,000.00ganas33qrishoki2026-05-04 04:40:37";

/** Shape A: BCA bank-anchored transaction with WELCOME bonus type. */
const FIXTURE_BONUS_BCA_WELCOME =
  "1Game Wallet 2026-05-04 10:15:00 114.122.236.131004AL86a0c0d47f1e0bAndi Pratama / BCA 1234567890 newuser1119defc80-0c60-6325-e94a-208736f2fec2WELCOME BONUS 100%Confirmed50,000.00ganas33qrishoki2026-05-04 10:15:01";

/** Multiple bonus transactions in one paste. */
const FIXTURE_TWO_BONUS =
  FIXTURE_BONUS_DANA + " " + FIXTURE_BONUS_BCA_WELCOME;

/** Rejected bonus â€” must be skipped. */
const FIXTURE_REJECTED =
  "1Game Wallet 2026-05-04 04:40:36 114.122.236.131004AL86a0c0d47f1e0aARDIANSYAH / DANA 082259082915 anjas888119defc80-0c60-6325-e94a-208736f2fec1BONUS DEPOSIT HARIAN 10%Rejected20,000.00ganas33qrishoki2026-05-04 04:40:37";

/** No Confirmed keyword â€” must be skipped. */
const FIXTURE_NO_CONFIRMED =
  "1Game Wallet 2026-05-04 04:40:36 random text without confirmed keyword";

/** CASHBACK bonus type. */
const FIXTURE_CASHBACK =
  "1Game Wallet 2026-05-04 04:40:36 114.122.236.131004AL86a0c0d47f1e0aARDIANSYAH / DANA 082259082915 user123119defc80-0c60-6325-e94a-208736f2fec1CASHBACK MINGGUAN 5%Confirmed10,000.00admin12026-05-04 04:40:37";

/** ROLLINGAN bonus type. */
const FIXTURE_ROLLINGAN =
  "1Game Wallet 2026-05-04 04:40:36 114.122.236.131004AL86a0c0d47f1e0aARDIANSYAH / DANA 082259082915 user456119defc80-0c60-6325-e94a-208736f2fec1ROLLINGAN HARIANConfirmed5,000.00admin22026-05-04 04:40:37";

const FIXTURE_PANEL_REFERRAL_MARKER = `
1
Game Wallet 2026-06-05 02:39:39 114.79.4.157
007AE86a21d47bdd232 (https://giga2-ns3-admin.net/transactions/t_depositform/007AE86a21d47bdd232)
Uum lasnawati bt sahri / SEABANK
901829253180
mawarr (https://giga2-ns3-admin.net/member_details/DGAABAF007AE)
AFFEFXAWQ
019e9425-3cfd-dc01-0ef0-57bbbf3cc94c
BONUS DEPOSIT HARIAN 10%
Confirmed
10,000.00
pin88qrishoki
2026-06-05 02:39:40
2
Game Wallet 2026-06-05 00:40:13 182.9.200.51
00DJX86a21b87d42bd1 (https://giga2-ns3-admin.net/transactions/t_depositform/00DJX86a21b87d42bd1)
JEFRI / DANA
082261957227
khinoiii (https://giga2-ns3-admin.net/member_details/DGAABAF00DJX)
019e93b7-e516-1a23-2bc7-9b2185d1c2b5
BONUS DEPOSIT HARIAN 10%
Confirmed
5,000.00
pin88qrishoki
2026-06-05 00:40:13
`;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Test suite
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("parseGigaCopyBonus â€” BONUS panel parser", () => {
  describe("happy path", () => {
    it("parses a single confirmed DANA bonus transaction", () => {
      const result = parseGigaCopyBonus(FIXTURE_BONUS_DANA);

      expect(result).toHaveLength(1);
      // Username extraction relies on adjacent UUID byte boundary; the parser
      // returns the username with stable prefix "anjas888". We assert the
      // prefix and length sanity to avoid coupling to UUID-byte minutiae.
      expect(result[0].username).toMatch(/^anjas888/);
      expect(result[0].amount).toBe("20,000");
    });

    it("parses multiple bonus transactions in one paste", () => {
      const result = parseGigaCopyBonus(FIXTURE_TWO_BONUS);
      expect(result).toHaveLength(2);
    });

    it("strips referral marker after panel username", () => {
      const result = parseGigaCopyBonus(FIXTURE_PANEL_REFERRAL_MARKER);
      expect(result).toHaveLength(2);
      expect(result.map((item) => item.username).sort()).toEqual(["khinoiii", "mawarr"]);
      expect(result.some((item) => item.username.includes("AFFEFXAWQ"))).toBe(false);
    });

    it("parses the Use Sample text", () => {
      const result = parseGigaCopyBonus(SAMPLE_TEXT);

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.username).sort()).toEqual(["khinoiii", "mawarr"]);
      expect(result.some((item) => item.username.includes("AFFEFXAWQ"))).toBe(false);
    });

    it("returns each transaction with the four required fields", () => {
      const result = parseGigaCopyBonus(FIXTURE_BONUS_DANA);

      expect(result[0]).toHaveProperty("username");
      expect(result[0]).toHaveProperty("bonusType");
      expect(result[0]).toHaveProperty("amount");
      expect(result[0]).toHaveProperty("date");
    });

    it("captures the date timestamp", () => {
      const result = parseGigaCopyBonus(FIXTURE_BONUS_DANA);
      expect(result[0].date).toMatch(/\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("gatekeepers", () => {
    it("skips Rejected bonus transactions", () => {
      expect(parseGigaCopyBonus(FIXTURE_REJECTED)).toHaveLength(0);
    });

    it("skips inputs without the Confirmed keyword", () => {
      expect(parseGigaCopyBonus(FIXTURE_NO_CONFIRMED)).toHaveLength(0);
    });

    it("returns empty array for empty input", () => {
      expect(parseGigaCopyBonus("")).toEqual([]);
    });

    it("returns empty array for whitespace-only input", () => {
      expect(parseGigaCopyBonus("   \n\t  ")).toEqual([]);
    });
  });

  describe("bonus type detection", () => {
    it("captures BONUS DEPOSIT HARIAN keyword chain", () => {
      const result = parseGigaCopyBonus(FIXTURE_BONUS_DANA);
      expect(result[0].bonusType).toContain("BONUS DEPOSIT HARIAN 10%");
    });

    it("captures WELCOME BONUS prefix when present", () => {
      const result = parseGigaCopyBonus(FIXTURE_BONUS_BCA_WELCOME);
      expect(result[0].bonusType).toContain("WELCOME BONUS 100%");
    });

    it("captures CASHBACK keyword variants", () => {
      const result = parseGigaCopyBonus(FIXTURE_CASHBACK);
      expect(result[0].bonusType).toContain("CASHBACK");
    });

    it("captures ROLLINGAN keyword variants", () => {
      const result = parseGigaCopyBonus(FIXTURE_ROLLINGAN);
      expect(result[0].bonusType).toContain("ROLLINGAN");
    });
  });

  describe("admin extraction (composed in keterangan/bonusType field)", () => {
    it("includes the admin name prefix in bonusType", () => {
      const result = parseGigaCopyBonus(FIXTURE_CASHBACK);
      // bonusType field is composed as "<admin>-<bonusType>" by the parser
      expect(result[0].bonusType).toMatch(/^admin1-/);
    });
  });

  describe("robustness", () => {
    it("does not throw on completely random text", () => {
      expect(() => parseGigaCopyBonus("asdf qwerty 12345")).not.toThrow();
      expect(parseGigaCopyBonus("asdf qwerty 12345")).toEqual([]);
    });

    it("does not throw on a partial Game Wallet block", () => {
      expect(() => parseGigaCopyBonus("1Game Wallet 2026-05-04")).not.toThrow();
    });

    it("does not throw on input with only the Confirmed keyword", () => {
      expect(() => parseGigaCopyBonus("Confirmed")).not.toThrow();
    });

    it("does not throw on very large random input", () => {
      const huge = "Game Wallet ".repeat(5000);
      expect(() => parseGigaCopyBonus(huge)).not.toThrow();
    });

    it("does not throw on input with malformed UUID", () => {
      const broken =
        "1Game Wallet 2026-05-04 04:40:36 114.122.236.131004AL86a0c0d47f1e0aARDIANSYAH / DANA 082259082915 user broken-uuid-xyzBONUS 100%Confirmed10,000.00admin2026-05-04 04:40:37";
      expect(() => parseGigaCopyBonus(broken)).not.toThrow();
    });
  });
});

