/**
 * Unit tests for the QRISHOKI panel text parser.
 *
 * These tests verify behavior only — they do not modify the parser source.
 * The parser lives in `src/pages/GigaCopyDpHoki.tsx` and is imported here.
 *
 * Tests are grouped by intent:
 *   - happy path           : real-world inputs that should succeed
 *   - gatekeepers          : inputs that should be skipped (Rejected, etc.)
 *   - username cleanup     : panel-marker stripping (remark color, "New", voucher)
 *   - amount handling      : currency / decimal normalization
 *   - bank parsing         : multi-bank support
 *   - robustness           : empty / malformed inputs that must not throw
 */

import { describe, it, expect } from "vitest";
import { SAMPLE_TEXT, parseGigaCopyDpHoki } from "@/pages/GigaCopyDpHoki";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures — captured from real panel exports (anonymized)
//
// Note on TRX ID prefix: the QRISHOKI parser requires the panel transaction ID
// to match `/86a0[a-f0-9]{10}/i`. The fixtures below use valid `86a0...` IDs.
//
// Note on admin name: in production, admin usernames are usually bare names
// like "ganas33qrishoki" or "jiss" (no leading digit). We use that pattern in
// fixtures to avoid amount-regex false matches. The "leading digit" edge case
// is documented separately under `known edge cases`.
// ─────────────────────────────────────────────────────────────────────────────

/** A single confirmed DANA transaction. */
const FIXTURE_SINGLE_DANA =
  "1Game Wallet 2026-05-04 23:10:47 202.65.239.152003OK86a0f8c507343bcDwi angga yuda / DANA 082351054946 yuda89 019df3c1-18bb-2abd-c386-11fdfd50d248Bank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKI QRISHOKI Confirmed80,000.00ganas33qrishoki2026-05-04 23:10:47";

/** A confirmed BCA transaction. */
const FIXTURE_SINGLE_BCA =
  "1Game Wallet 2026-05-04 10:15:00 202.65.239.152003OK86a0f8c507343caAndi Pratama / BCA 1234567890 andi123 019df3c1-18bb-2abd-c386-11fdfd50d249Bank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKI QRISHOKI Confirmed150,000.00ganas33qrishoki2026-05-04 10:15:00";

/** A Rejected transaction — must be skipped by the gatekeeper. */
const FIXTURE_REJECTED =
  "1Game Wallet 2026-05-04 23:10:47 202.65.239.152003OK86a0f8c507343bcDwi angga yuda / DANA 082351054946 yuda89 019df3c1-18bb-2abd-c386-11fdfd50d248Bank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKI QRISHOKI Rejected80,000.00ganas33qrishoki2026-05-04 23:10:47";

/** Two transactions back-to-back (DANA + BCA), separated by a row marker. */
const FIXTURE_TWO_TRANSACTIONS =
  FIXTURE_SINGLE_DANA + " 2Game Wallet" + FIXTURE_SINGLE_BCA.slice("1Game Wallet".length);

/** A transaction where the username has the "New" badge appended. */
const FIXTURE_NEW_MEMBER =
  "1Game Wallet 2026-05-04 23:10:47 202.65.239.152003OK86a0f8c507343bcCustomer Baru / DANA 082351054946 tiyara57New 019df3c1-18bb-2abd-c386-11fdfd50d250Bank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKI QRISHOKI Confirmed25,000.00ganas33qrishoki2026-05-04 23:10:47";

/** A transaction where the username has a remark color code (1-10) appended. */
const FIXTURE_REMARK_COLOR =
  "1Game Wallet 2026-05-04 23:10:47 202.65.239.152003OK86a0f8c507343bcDwi angga yuda / DANA 082351054946 ragelku 1 019df3c1-18bb-2abd-c386-11fdfd50d251Bank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKI QRISHOKI Confirmed30,000.00ganas33qrishoki2026-05-04 23:10:47";

/** A transaction that is NOT a Bank/QRISHOKI transaction (should be skipped). */
const FIXTURE_NON_QRISHOKI =
  "1Game Wallet 2026-05-04 23:10:47 202.65.239.152003OK86a0f8c507343bcDwi angga yuda / DANA 082351054946 yuda89 019df3c1-18bb-2abd-c386-11fdfd50d248ZENPAY88 / QRISConfirmed80,000.00ganas33qrishoki2026-05-04 23:10:47";

/**
 * EDGE CASE FIXTURE: admin name starts with a digit.
 * Mirrors the SAMPLE_TEXT shape in `GigaCopyDpHoki.tsx` (admin "1ggabacc@sub005").
 * Used to document current parser behavior when the admin token starts with
 * a digit — the amount regex is greedy and absorbs the leading digit.
 */
const FIXTURE_DIGIT_LEADING_ADMIN =
  "1Game Wallet 2026-05-04 23:10:47 202.65.239.152003OK86a0f8c507343bcDwi angga yuda / DANA 082351054946 yuda89 019df3c1-18bb-2abd-c386-11fdfd50d248Bank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKI QRISHOKI Confirmed80,000.001ggabacc@sub0052026-05-04 23:10:47";

/** Real panel copy where referral codes occupy the cell after username. */
const FIXTURE_REFERRAL_CODE_COLUMN =
  "9 Game Wallet 2026-06-05 02:39:39 114.79.4.157 " +
  "007AE86a21d47bdcd19 (https://giga2-ns3-admin.net/transactions/t_depositform/007AE86a21d47bdcd19) " +
  "Uum lasnawati bt sahri / SEABANK 901829253180 " +
  "mawarr (https://giga2-ns3-admin.net/member_details/DGAABAF007AE) AFFEFXAWQ " +
  "019e9425-3cfd-dc01-0ef0-57bbbf3cc94c Bank / QRISHOKI Admin Deposit Transfer - " +
  "QRISHOKI / QRISHOKI QRISHOKI Confirmed 100,000.00 pin88qrishoki 2026-06-05 02:39:40 " +
  "12 Game Wallet 2026-06-05 02:09:10 203.17.81.22 " +
  "009TF86a21cd56a9389 (https://giga2-ns3-admin.net/transactions/t_depositform/009TF86a21cd56a9389) " +
  "KEVIN MARTHEN SIRMAN YOURWE / BNI 1852923249 " +
  "kevin23 (https://giga2-ns3-admin.net/member_details/DGAABAF009TF) AFKRHDYBM " +
  "019e9409-7ef0-a508-454c-7c546ee4c694 Bank / QRISHOKI Admin Deposit Transfer - " +
  "QRISHOKI / QRISHOKI QRISHOKI Confirmed 1,100,000.00 pin88qrishoki 2026-06-05 02:09:11 " +
  "14 Game Wallet 2026-06-05 01:57:41 112.215.221.153 " +
  "00MEG86a21caa576494 (https://giga2-ns3-admin.net/transactions/t_depositform/00MEG86a21caa576494) " +
  "M auryadi / SEABANK 901749993362 " +
  "gasal9 (https://giga2-ns3-admin.net/member_details/DGAABAF00MEG) New (https://giga2-ns3-admin.net/member_details/DGAABAF00MEG) " +
  "019e93ff-5895-4859-e3a4-7bbe778095e8 Bank / QRISHOKI Admin Deposit Transfer - " +
  "QRISHOKI / QRISHOKI QRISHOKI Confirmed 100,000.00 pin88qrishoki 2026-06-05 01:57:41 " +
  "15 Game Wallet 2026-06-05 01:53:59 114.123.37.58 " +
  "00FVT86a21c9c714bc3 (https://giga2-ns3-admin.net/transactions/t_depositform/00FVT86a21c9c714bc3) " +
  "HENDRIANTO / DANA 082261643191 " +
  "hendrianto12 (https://giga2-ns3-admin.net/member_details/DGAABAF00FVT) AFFOB818U " +
  "019e93fb-e5f6-b526-e920-051a9871eb0c Bank / QRISHOKI Admin Deposit Transfer - " +
  "QRISHOKI / QRISHOKI QRISHOKI Confirmed 43,000.00 pin88qrishoki 2026-06-05 01:53:59";

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("parseGigaCopyDpHoki — QRISHOKI panel parser", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // Happy path
  // ───────────────────────────────────────────────────────────────────────────
  describe("happy path", () => {
    it("parses a single confirmed DANA transaction", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_SINGLE_DANA);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("yuda89");
      expect(result[0].amount).toBe("80,000");
      expect(result[0].date).toBe("2026-05-04 23:10:47");
    });

    it("parses a single confirmed BCA transaction", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_SINGLE_BCA);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("andi123");
      expect(result[0].amount).toBe("150,000");
    });

    it("parses multiple transactions in one paste", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_TWO_TRANSACTIONS);

      expect(result).toHaveLength(2);
      // Sorted ascending by date
      expect(result[0].date).toBe("2026-05-04 10:15:00");
      expect(result[1].date).toBe("2026-05-04 23:10:47");
    });

    it("parses the Use Sample text", () => {
      const result = parseGigaCopyDpHoki(SAMPLE_TEXT);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("mawarr");
      expect(result[0].amount).toBe("100,000");
    });

    it("returns each transaction with the four required fields", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_SINGLE_DANA);

      expect(result[0]).toHaveProperty("date");
      expect(result[0]).toHaveProperty("trxId");
      expect(result[0]).toHaveProperty("username");
      expect(result[0]).toHaveProperty("amount");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gatekeepers — inputs that must be filtered out
  // ───────────────────────────────────────────────────────────────────────────
  describe("gatekeepers", () => {
    it("skips Rejected transactions", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_REJECTED);
      expect(result).toHaveLength(0);
    });

    it("skips transactions that are not Bank/QRISHOKI", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_NON_QRISHOKI);
      expect(result).toHaveLength(0);
    });

    it("returns empty array for empty input", () => {
      expect(parseGigaCopyDpHoki("")).toEqual([]);
    });

    it("returns empty array for whitespace-only input", () => {
      expect(parseGigaCopyDpHoki("   \n\t  \n  ")).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Username cleanup — panel marker stripping
  // ───────────────────────────────────────────────────────────────────────────
  describe("username cleanup", () => {
    it('strips the "New" badge from new-member usernames', () => {
      const result = parseGigaCopyDpHoki(FIXTURE_NEW_MEMBER);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("tiyara57");
      expect(result[0].username).not.toMatch(/New$/);
    });

    it("strips the trailing remark color code (1-10)", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_REMARK_COLOR);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("ragelku");
      expect(result[0].username).not.toMatch(/\s+\d+$/);
    });

    it("preserves usernames that legitimately end with digits (no whitespace before)", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_SINGLE_DANA);
      // "yuda89" ends with digits but they are part of the name — must stay intact
      expect(result[0].username).toBe("yuda89");
    });

    it("strips AF referral codes copied from the column after username", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_REFERRAL_CODE_COLUMN);

      expect(result).toHaveLength(4);
      expect(result.map((row) => row.username)).toEqual([
        "hendrianto12",
        "gasal9",
        "kevin23",
        "mawarr",
      ]);
      expect(result.map((row) => row.username).join(" ")).not.toMatch(
        /\bAF[A-Z0-9]{6,}\b/,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Amount handling
  // ───────────────────────────────────────────────────────────────────────────
  describe("amount handling", () => {
    it("preserves Indonesian thousand separator format", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_SINGLE_DANA);
      expect(result[0].amount).toBe("80,000");
    });

    it("strips trailing .00 cents", () => {
      const result = parseGigaCopyDpHoki(FIXTURE_SINGLE_DANA);
      // Source has "Confirmed80,000.00" — parser should strip .00
      expect(result[0].amount).not.toMatch(/\.00$/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Robustness — must never throw on weird input
  // ───────────────────────────────────────────────────────────────────────────
  describe("robustness", () => {
    it("does not throw on completely random text", () => {
      const garbage = "asdf qwerty 12345 lorem ipsum dolor sit amet";
      expect(() => parseGigaCopyDpHoki(garbage)).not.toThrow();
      expect(parseGigaCopyDpHoki(garbage)).toEqual([]);
    });

    it("does not throw on a partial Game Wallet block", () => {
      const partial = "1Game Wallet 2026-05-04 23:10:47";
      expect(() => parseGigaCopyDpHoki(partial)).not.toThrow();
    });

    it("does not throw on input with only the Confirmed keyword", () => {
      expect(() => parseGigaCopyDpHoki("Confirmed")).not.toThrow();
    });

    it("does not throw on very large random input", () => {
      const huge = "Game Wallet ".repeat(5000);
      expect(() => parseGigaCopyDpHoki(huge)).not.toThrow();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Multi-word bank names — regression coverage
  //
  // These tests guard against regressions when banks with multi-word names
  // (e.g. "BLU BY BCA DIGITAL", "BANK JAGO") are parsed. Older versions of
  // the bank regex only handled 1-2 word banks with min 3 chars per word,
  // which caused 4-word bank names like "BLU BY BCA DIGITAL" to fall through
  // and the username to default to "UNKNOWN".
  // ───────────────────────────────────────────────────────────────────────────
  describe("multi-word bank names", () => {
    it("parses BLU BY BCA DIGITAL transaction (4-word bank)", () => {
      const fixture =
        "1Game Wallet 2026-05-19 20:48:11 182.8.100.1770GP7K86a0c6a1b2d072SINTA MUSRYFATUL ARDILLA / BLU BY BCA DIGITAL006927819007sintandkNew019e407d-b9e7-fc77-adc1-4c11e6b5005bBank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKIQRISHOKIConfirmed25,000.00indo178qrishoki2026-05-19 20:48:11";

      const result = parseGigaCopyDpHoki(fixture);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("sintandk");
      expect(result[0].amount).toBe("25,000");
      expect(result[0].username).not.toBe("UNKNOWN");
    });

    it("parses two BLU BY BCA DIGITAL transactions back-to-back", () => {
      const fixture =
        "1Game Wallet 2026-05-19 20:48:11 182.8.100.1770GP7K86a0c6a1b2d072SINTA MUSRYFATUL ARDILLA / BLU BY BCA DIGITAL006927819007sintandkNew019e407d-b9e7-fc77-adc1-4c11e6b5005bBank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKIQRISHOKIConfirmed25,000.00indo178qrishoki2026-05-19 20:48:11" +
        "1Game Wallet 2026-05-19 17:42:48 182.6.44.740GG8L86a0c3ea8758e7Aria satia permana / BLU BY BCA DIGITAL001046362111himin12019e3fd4-352c-a4ec-8bd9-7475df6f849bBank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKIQRISHOKIConfirmed50,000.00indo178qrishoki2026-05-19 17:42:48";

      const result = parseGigaCopyDpHoki(fixture);

      expect(result).toHaveLength(2);
      // Sorted ascending by date — earlier one comes first
      expect(result[0].username).toBe("himin12");
      expect(result[1].username).toBe("sintandk");
      expect(result[0].amount).toBe("50,000");
      expect(result[1].amount).toBe("25,000");
    });

    it("strips the New badge after BLU BY BCA DIGITAL", () => {
      const fixture =
        "1Game Wallet 2026-05-19 20:48:11 182.8.100.1770GP7K86a0c6a1b2d072SINTA MUSRYFATUL ARDILLA / BLU BY BCA DIGITAL006927819007sintandkNew019e407d-b9e7-fc77-adc1-4c11e6b5005bBank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKIQRISHOKIConfirmed25,000.00indo178qrishoki2026-05-19 20:48:11";

      const result = parseGigaCopyDpHoki(fixture);
      expect(result[0].username).toBe("sintandk");
      expect(result[0].username).not.toMatch(/New$/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Bank-name absorbs adjacent letters (no whitespace, no account digits)
  //
  // Some panel rows render "<display><BANK><username>" with no separators
  // and no account number, e.g.:
  //   "Fariz Al-Firdaus / firdausDANAhadingaji019e44fe-..."
  //
  // The bank regex greedily captures `firdausDANAhadingaji` as one token.
  // Without refinement that capture is unknown and the substring between bank
  // and UUID is empty, so the parser used to return UNKNOWN.
  //
  // refineBankCapture splits the capture on the rightmost known-bank
  // substring and feeds the leftover suffix back to extractUsername.
  // ───────────────────────────────────────────────────────────────────────────
  describe("bank greedy-capture refinement", () => {
    it("recovers DANA username when display name is glued to the bank", () => {
      const fixture =
        "1Game Wallet 2026-05-20 17:46:57 182.9.2.340GEOU86a0d91219f9c7Fariz Al-Firdaus / firdausDANAhadingaji019e44fe-4e21-43be-92cb-55ca5e1251cdBank / QRISHOKIAdmin Deposit Transfer -QRISHOKI / QRISHOKIQRISHOKIConfirmed50,000.00indo178qrishoki2026-05-20 17:46:57";

      const result = parseGigaCopyDpHoki(fixture);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("hadingaji");
      expect(result[0].username).not.toBe("UNKNOWN");
      expect(result[0].amount).toBe("50,000");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TRX ID prefix family (UUIDv7 timestamp drift)
  //
  // The panel's TRX ID format is `<5-char tracking><14-char hex token>`. The
  // hex token starts with `86a` or `06a` and the 4th char is a UUIDv7
  // timestamp digit that increments over time (`86a0...`, `86a1...`, ...).
  //
  // Older fixtures used `86a0` exclusively. As of mid-2026 panel exports
  // contain `86a1`, so the regex must accept any hex 4th char.
  // ─────────────────────────────────────────────────────────────────────────
  describe("TRX ID prefix family", () => {
    it("parses transactions with the 86a1 prefix (post-2026 timestamp)", () => {
      const fixture =
        "49\tGame Wallet 2026-05-27 04:03:20 182.2.234.194\t024ZQ86a160a98b8b45\tFERDYANSAH / DANA\n" +
        "081356565733\n" +
        "fauzyozzy017\t019e6618-b1a9-5178-3fb4-e3afb5626356\tBank / QRISHOKI Admin Deposit Transfer -\n" +
        "QRISHOKI / QRISHOKI\nQRISHOKI\nConfirmed\t20,000.00\tganas33qrishoki 2026-05-27 04:03:21";

      const result = parseGigaCopyDpHoki(fixture);

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe("fauzyozzy017");
      expect(result[0].trxId).toContain("86a160a98b8b45");
      expect(result[0].amount).toBe("20,000");
    });
  });
  //
  // These tests pin down quirks in the current parser. They are not statements
  // of "correct" behavior — they describe what the parser does today so any
  // future change is intentional and visible. If a future fix changes the
  // behavior, the test should be updated to match the new expected output.
  // ───────────────────────────────────────────────────────────────────────────
  describe("known edge cases", () => {
    it("absorbs leading digit of admin name into amount when admin starts with a digit", () => {
      // FIXTURE shape: "Confirmed80,000.001ggabacc@sub005..."
      // Real-world impact today: admins in production are named "ganas33qrishoki",
      // "jiss", etc. (no leading digit), so this case is currently dormant.
      // If an admin name like "1ggabacc" is ever introduced, the amount will
      // include a stray ".001" suffix. Worth tracking for a future fix.
      const result = parseGigaCopyDpHoki(FIXTURE_DIGIT_LEADING_ADMIN);

      expect(result).toHaveLength(1);
      // Today's behavior — pin it so any change is intentional.
      expect(result[0].amount).toBe("80,000.001");
    });
  });
});
