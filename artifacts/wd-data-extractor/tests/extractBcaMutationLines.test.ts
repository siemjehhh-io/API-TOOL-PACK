/**
 * Unit tests for the BCA mutation paste parser.
 *
 * The parser lives in `src/pages/GigaSmartMutasi.jsx` as a pure module-scope
 * export (`extractBcaMutationLines`). It was extracted from the original
 * `handleExtractBca` callback purely for testability — the component still
 * delegates to this function, so any regression here is a regression in the
 * production paste flow as well.
 *
 * BCA paste shape (anchors on the literal line "0000"):
 *
 *   [lines[i-2]]   used as the name fallback for ESPAY / PAYMENT entries
 *   [lines[i-1]]   description / name line
 *   "0000"         anchor
 *   [lines[i+1]]   nominal (e.g. "1,500,000.00")
 *   [lines[i+2]]   "CR" -> DP, "DB" -> TRANSFER (otherwise defaults to DP)
 *   [lines[i+3]]   saldo akhir
 *
 * Tests are grouped by intent:
 *   - type detection      : DP (CR), TRANSFER (DB), BIAYA ADMIN markers
 *   - name fallback       : ESPAY / PAYMENT use lines[index-2]
 *   - name cleanup        : TRFDN- and TANGGAL: prefixes get stripped
 *   - nominal/saldo       : commas and trailing .00 cents removed
 *   - gatekeepers         : empty input, no anchors, zero nominal skipped
 *   - robustness          : random / malformed text does not throw
 */

import { describe, it, expect } from "vitest";
import { extractBcaMutationLines } from "@/pages/GigaSmartMutasi";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — keep fixtures readable without trailing-space surprises.
// Each block intentionally uses literal newlines so what you see is what the
// parser ingests.
// ─────────────────────────────────────────────────────────────────────────────

const block = (lines: string[]) => lines.join("\n");

const OPTS = { selectedBank: "BCA" };

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("extractBcaMutationLines — BCA mutation paste parser", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // Type detection
  // ───────────────────────────────────────────────────────────────────────────
  describe("type detection", () => {
    it("detects DP from a CR marker", () => {
      const raw = block([
        "PREV CONTEXT",
        "ANDI PRATAMA",
        "0000",
        "1,500,000.00",
        "CR",
        "50,000,000.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        nama: "ANDI PRATAMA",
        nominal: "1500000",
        type: "DP",
        saldoAkhir: "50000000",
      });
    });

    it("detects TRANSFER from a DB marker", () => {
      const raw = block([
        "PREV CONTEXT",
        "TRFDN-BUDI SETIAWAN",
        "0000",
        "500,000.00",
        "DB",
        "49,500,000.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("TRANSFER");
      expect(result[0].nominal).toBe("500000");
      expect(result[0].saldoAkhir).toBe("49500000");
    });

    it("detects BIAYA ADMIN from 'BIAYA ADM' in the name line", () => {
      const raw = block([
        "PREV CONTEXT",
        "BIAYA ADM 12345",
        "0000",
        "6,500.00",
        "DB",
        "49,493,500.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe("BIAYA ADMIN");
      expect(result[0].type).toBe("BIAYA ADMIN");
      expect(result[0].nominal).toBe("6500");
    });

    it("detects BIAYA ADMIN from 'ADMIN' in the name line", () => {
      const raw = block([
        "PREV CONTEXT",
        "ADMIN FEE MONTHLY",
        "0000",
        "3,000.00",
        "DB",
        "49,490,500.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe("BIAYA ADMIN");
      expect(result[0].type).toBe("BIAYA ADMIN");
    });

    it("detects BIAYA ADMIN from 'BIAYA TX' in the name line", () => {
      const raw = block([
        "PREV CONTEXT",
        "BIAYA TX TRANSFER",
        "0000",
        "2,500.00",
        "DB",
        "49,488,000.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe("BIAYA ADMIN");
      expect(result[0].type).toBe("BIAYA ADMIN");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Name fallback — ESPAY / PAYMENT entries take the name from lines[index-2]
  // ───────────────────────────────────────────────────────────────────────────
  describe("name fallback for ESPAY / PAYMENT", () => {
    it("uses lines[index-2] when the description contains ESPAY", () => {
      const raw = block([
        "JOHN DOE",
        "ESPAY/SOMETHING/REF123",
        "0000",
        "1,000,000.00",
        "CR",
        "50,488,000.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe("JOHN DOE");
      expect(result[0].type).toBe("DP");
    });

    it("uses lines[index-2] when the description contains PAYMENT", () => {
      const raw = block([
        "JANE SMITH",
        "PAYMENT GATEWAY ABC",
        "0000",
        "500,000.00",
        "CR",
        "51,488,000.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe("JANE SMITH");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Name cleanup — strip TRFDN- and TANGGAL:DD/DD TRANSFER DR <digits>
  // ───────────────────────────────────────────────────────────────────────────
  describe("name cleanup", () => {
    it("strips the TRFDN- prefix", () => {
      const raw = block([
        "PREV",
        "TRFDN-SITI AMINAH",
        "0000",
        "250,000.00",
        "CR",
        "50,250,000.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe("SITI AMINAH");
      expect(result[0].nama).not.toMatch(/TRFDN/i);
    });

    it("strips the TANGGAL:DD/DD TRANSFER DR <digits> prefix", () => {
      const raw = block([
        "PREV",
        "TANGGAL : 25/12 TRANSFER DR 12345 BUDI HARTONO",
        "0000",
        "750,000.00",
        "CR",
        "50,750,000.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].nama).toBe("BUDI HARTONO");
      expect(result[0].nama).not.toMatch(/TANGGAL/i);
      expect(result[0].nama).not.toMatch(/TRANSFER\s*DR/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Nominal / saldo formatting
  // ───────────────────────────────────────────────────────────────────────────
  describe("nominal and saldo formatting", () => {
    it("strips thousand-separator commas and trailing .00 cents", () => {
      const raw = block([
        "PREV",
        "RIA WULANDARI",
        "0000",
        "12,345,678.00",
        "CR",
        "62,345,678.99",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(1);
      expect(result[0].nominal).toBe("12345678");
      expect(result[0].saldoAkhir).toBe("62345678");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Multiple entries in one paste
  // ───────────────────────────────────────────────────────────────────────────
  describe("multiple entries", () => {
    it("parses several anchored blocks in a single paste", () => {
      const raw = block([
        "INTRO",
        "ANDI PRATAMA",
        "0000",
        "1,500,000.00",
        "CR",
        "50,000,000.00",
        "TRFDN-BUDI",
        "0000",
        "500,000.00",
        "DB",
        "49,500,000.00",
        "BIAYA ADM",
        "0000",
        "6,500.00",
        "DB",
        "49,493,500.00",
      ]);

      const result = extractBcaMutationLines(raw, OPTS);

      expect(result).toHaveLength(3);
      expect(result.map(r => r.type)).toEqual(["DP", "TRANSFER", "BIAYA ADMIN"]);
      expect(result[0].nama).toBe("ANDI PRATAMA");
      expect(result[1].nama).toBe("BUDI");
      expect(result[2].nama).toBe("BIAYA ADMIN");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gatekeepers — empty input, no anchors, items skipped
  // ───────────────────────────────────────────────────────────────────────────
  describe("gatekeepers", () => {
    it("returns an empty array for an empty string", () => {
      expect(extractBcaMutationLines("", OPTS)).toEqual([]);
    });

    it("returns an empty array for whitespace-only input", () => {
      expect(extractBcaMutationLines("   \n\t  \n  ", OPTS)).toEqual([]);
    });

    it("returns an empty array when no '0000' anchor is present", () => {
      const raw = block([
        "ANDI PRATAMA",
        "1,500,000.00",
        "CR",
        "50,000,000.00",
      ]);

      expect(extractBcaMutationLines(raw, OPTS)).toEqual([]);
    });

    it("skips an anchored block whose nominal resolves to 0", () => {
      const raw = block([
        "PREV",
        "RANDOM NAME",
        "0000",
        "0.00",
        "CR",
        "1,000,000.00",
      ]);

      expect(extractBcaMutationLines(raw, OPTS)).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Robustness — must never throw on weird input
  // ───────────────────────────────────────────────────────────────────────────
  describe("robustness", () => {
    it("does not throw on completely random text", () => {
      const garbage = "asdf qwerty 12345 lorem ipsum dolor sit amet";
      expect(() => extractBcaMutationLines(garbage, OPTS)).not.toThrow();
      expect(extractBcaMutationLines(garbage, OPTS)).toEqual([]);
    });

    it("does not throw when the '0000' anchor is the first line (no prior name)", () => {
      const raw = block(["0000", "1,000,000.00", "CR", "1,000,000.00"]);
      expect(() => extractBcaMutationLines(raw, OPTS)).not.toThrow();
      // No name available -> filtered out
      expect(extractBcaMutationLines(raw, OPTS)).toEqual([]);
    });

    it("does not throw when called with no options argument", () => {
      const raw = block([
        "PREV",
        "ANDI",
        "0000",
        "1,000.00",
        "CR",
        "1,000.00",
      ]);
      expect(() => extractBcaMutationLines(raw)).not.toThrow();
      expect(extractBcaMutationLines(raw)).toHaveLength(1);
    });
  });
});
