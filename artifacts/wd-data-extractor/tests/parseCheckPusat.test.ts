/**
 * Unit tests for the CHECK PUSAT GIGA parser.
 *
 * Verifies behavior only — does not modify the parser source. The parser
 * lives in `src/pages/CheckPusatGigaTools.tsx` and is imported here.
 *
 * Tests are grouped by intent:
 *   - happy path    : real-world inputs that should parse cleanly
 *   - filter        : Status !== WIN must be skipped
 *   - dedupe        : duplicate Ticket IDs must be skipped
 *   - grouping      : output groups by category-provider + game
 *   - sorting       : tickets within group are sorted descending by Win
 *   - rendering     : full template output matches user-provided format
 *   - robustness    : malformed / empty inputs do not throw
 */

import { describe, it, expect } from "vitest";
import {
  parseCheckPusat,
  groupTickets,
  renderTemplate,
} from "@/pages/CheckPusatGigaTools";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures — captured from real panel exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Real raw text the user pasted: 9 WIN tickets from PGSOFT Mahjong Ways 2,
 * all from the same player (same IP, same 2-minute window).
 */
const FIXTURE_NINE_PGSOFT_WINS = `131
SLOT - PGSOFT
Ticket : 2060379153714300416
2026-05-29 11:14:05
Mahjong Ways 2
BET Details
2026-05-29 23:14:05
0.00
0.00
0.00
WIN
990,000.00
0.00
-792,000.00
0.00
0.00
-198,000.00
0.00
80 %
0.000 %
103.251.8.54
146
SLOT - PGSOFT
Ticket : 2060378834720705025
2026-05-29 11:12:49
Mahjong Ways 2
BET Details
2026-05-29 23:12:49
0.00
0.00
0.00
WIN
980,000.00
0.00
-784,000.00
0.00
0.00
-196,000.00
0.00
80 %
0.000 %
103.251.8.54
127
SLOT - PGSOFT
Ticket : 2060379201109904384
2026-05-29 11:14:17
Mahjong Ways 2
BET Details
2026-05-29 23:14:17
0.00
0.00
0.00
WIN
600,000.00
0.00
-480,000.00
0.00
0.00
-120,000.00
0.00
80 %
0.000 %
103.251.8.54
133
SLOT - PGSOFT
Ticket : 2060379128082868225
2026-05-29 11:13:59
Mahjong Ways 2
BET Details
2026-05-29 23:13:59
0.00
0.00
0.00
WIN
460,000.00
0.00
-368,000.00
0.00
0.00
-92,000.00
0.00
80 %
0.000 %
103.251.8.54`;

/** Mixed WIN+LOSE — only WIN should be in output. */
const FIXTURE_MIXED_STATUS = `1
SLOT - PGSOFT
Ticket : 2060379153714300416
2026-05-29 11:14:05
Mahjong Ways 2
BET Details
2026-05-29 23:14:05
0.00
0.00
0.00
WIN
990,000.00
0.00
80 %
0.000 %
103.251.8.54
2
SLOT - PGSOFT
Ticket : 2060378999999999999
2026-05-29 11:14:06
Mahjong Ways 2
BET Details
2026-05-29 23:14:06
0.00
0.00
0.00
LOSE
50,000.00
0.00
80 %
0.000 %
103.251.8.54`;

/** Same ticket id twice — second occurrence should be deduplicated. */
const FIXTURE_DUPLICATE = `1
SLOT - PGSOFT
Ticket : 2060379153714300416
2026-05-29 11:14:05
Mahjong Ways 2
BET Details
2026-05-29 23:14:05
0.00
0.00
0.00
WIN
990,000.00
0.00
80 %
0.000 %
103.251.8.54
2
SLOT - PGSOFT
Ticket : 2060379153714300416
2026-05-29 11:14:06
Mahjong Ways 2
BET Details
2026-05-29 23:14:06
0.00
0.00
0.00
WIN
990,000.00
0.00
80 %
0.000 %
103.251.8.54`;

/** Two providers, two games — expect two groups in output. */
const FIXTURE_MULTI_PROVIDER = `1
SLOT - PGSOFT
Ticket : 2060379153714300416
2026-05-29 11:14:05
Mahjong Ways 2
BET Details
2026-05-29 23:14:05
0.00
0.00
0.00
WIN
990,000.00
0.00
80 %
0.000 %
103.251.8.54
2
SLOT - PRAGMATIC
Ticket : 2060379999999999999
2026-05-29 11:15:00
Sweet Bonanza
BET Details
2026-05-29 23:15:00
0.00
0.00
0.00
WIN
500,000.00
0.00
80 %
0.000 %
103.251.8.54`;

/**
 * REAL-WORLD shape #2: panel emits everything glued on one long line with
 * mixed whitespace. This is the format the user actually saw in production
 * when the multi-line parser failed to split blocks.
 */
const FIXTURE_SINGLE_LINE_GLUED =
  "131SLOT - PGSOFT Ticket : 2060379153714300416 2026-05-29 11:14:05Mahjong Ways 2 BET Details 2026-05-29 23:14:050.000.000.00WIN990,000.00 0.00-792,000.00 0.00 0.00-198,000.00 0.0080 %0.000 %103.251.8.54" +
  "146SLOT - PGSOFT Ticket : 2060378834720705025 2026-05-29 11:12:49Mahjong Ways 2 BET Details 2026-05-29 23:12:490.000.000.00WIN980,000.00 0.00-784,000.00 0.00 0.00-196,000.00 0.0080 %0.000 %103.251.8.54" +
  "127SLOT - PGSOFT Ticket : 2060379201109904384 2026-05-29 11:14:17Mahjong Ways 2 BET Details 2026-05-29 23:14:170.000.000.00WIN600,000.00 0.00-480,000.00 0.00 0.00-120,000.00 0.0080 %0.000 %103.251.8.54" +
  "133SLOT - PGSOFT Ticket : 2060379128082868225 2026-05-29 11:13:59Mahjong Ways 2 BET Details 2026-05-29 23:13:590.000.000.00WIN460,000.00 0.00-368,000.00 0.00 0.00-92,000.00 0.0080 %0.000 %103.251.8.54";

/**
 * Real-world shape #3: PragmaticPlay rows can use shorter 14-digit ticket ids.
 * This matches the format visible in the user screenshot.
 */
const FIXTURE_PRAGMATICPLAY_14_DIGIT_TICKET = `766
SLOT - PragmaticPlay
Ticket : 83557239908168
2026-06-04 06:46:43 Sweet Bonanza 2500
BET Details
2026-06-04 14:46:43 120,000.00 120,000.00 0.00 WIN 3,444,540.00
0.00 -2,755,632.00
0.00
0.00 -688,908.00
0.00 80 % 0.000 % 182.4.36.51`;

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCheckPusat — CHECK PUSAT GIGA panel parser", () => {
  describe("happy path", () => {
    it("parses 4 PGSOFT WIN tickets from real panel paste", () => {
      const result = parseCheckPusat(FIXTURE_NINE_PGSOFT_WINS);

      expect(result.tickets).toHaveLength(4);
      expect(result.skippedNonWin).toBe(0);
      expect(result.skippedDuplicate).toBe(0);
    });

    it("parses single-line glued paste (no newlines between fields)", () => {
      const result = parseCheckPusat(FIXTURE_SINGLE_LINE_GLUED);

      expect(result.tickets).toHaveLength(4);
      expect(result.tickets[0].ticketId).toBe("2060379153714300416");
      expect(result.tickets[0].memberWin).toBe(990000);
      expect(result.tickets[0].game).toBe("Mahjong Ways 2");
      expect(result.tickets[0].provider).toBe("PGSOFT");
      expect(result.tickets[0].category).toBe("SLOT");
    });

    it("parses PragmaticPlay rows with 14-digit ticket ids", () => {
      const result = parseCheckPusat(FIXTURE_PRAGMATICPLAY_14_DIGIT_TICKET);

      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0].ticketId).toBe("83557239908168");
      expect(result.tickets[0].memberWin).toBe(3444540);
      expect(result.tickets[0].memberWinFormatted).toBe("3,444,540");
      expect(result.tickets[0].game).toBe("Sweet Bonanza 2500");
      expect(result.tickets[0].provider).toBe("PRAGMATICPLAY");
      expect(result.tickets[0].category).toBe("SLOT");
      expect(result.tickets[0].confirmedTime).toBe("2026-06-04 14:46:43");
    });

    it("extracts ticket id, category, provider, game, member win", () => {
      const result = parseCheckPusat(FIXTURE_NINE_PGSOFT_WINS);
      const first = result.tickets.find(
        (t) => t.ticketId === "2060379153714300416",
      );

      expect(first).toBeDefined();
      expect(first!.category).toBe("SLOT");
      expect(first!.provider).toBe("PGSOFT");
      expect(first!.game).toBe("Mahjong Ways 2");
      expect(first!.memberWin).toBe(990000);
      expect(first!.memberWinFormatted).toBe("990,000");
    });

    it("strips the .00 decimals from formatted amount", () => {
      const result = parseCheckPusat(FIXTURE_NINE_PGSOFT_WINS);
      for (const ticket of result.tickets) {
        expect(ticket.memberWinFormatted).not.toMatch(/\.00$/);
      }
    });

    it("captures the LAST timestamp in the block as confirmedTime (WIB)", () => {
      const result = parseCheckPusat(FIXTURE_NINE_PGSOFT_WINS);
      const first = result.tickets.find(
        (t) => t.ticketId === "2060379153714300416",
      );
      // Block has two timestamps: 11:14:05 (UTC bet) and 23:14:05 (WIB settle).
      // We want the latter for the pusat report.
      expect(first!.confirmedTime).toBe("2026-05-29 23:14:05");
    });
  });

  describe("filter — status !== WIN dropped", () => {
    it("skips LOSE rows", () => {
      const result = parseCheckPusat(FIXTURE_MIXED_STATUS);

      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0].ticketId).toBe("2060379153714300416");
      expect(result.skippedNonWin).toBe(1);
    });

    it("returns empty when all rows are LOSE", () => {
      const lossOnly = FIXTURE_MIXED_STATUS
        .split("\n")
        .map((line) => (line === "WIN" ? "LOSE" : line))
        .join("\n");
      const result = parseCheckPusat(lossOnly);

      expect(result.tickets).toHaveLength(0);
      expect(result.skippedNonWin).toBe(2);
    });
  });

  describe("dedupe — duplicate ticket ids dropped", () => {
    it("keeps only the first occurrence of a duplicate Ticket ID", () => {
      const result = parseCheckPusat(FIXTURE_DUPLICATE);

      expect(result.tickets).toHaveLength(1);
      expect(result.skippedDuplicate).toBe(1);
    });
  });

  describe("robustness", () => {
    it("does not throw on empty input", () => {
      const result = parseCheckPusat("");
      expect(result.tickets).toEqual([]);
    });

    it("does not throw on whitespace-only input", () => {
      const result = parseCheckPusat("   \n\t  \n  ");
      expect(result.tickets).toEqual([]);
    });

    it("does not throw on completely random text", () => {
      const result = parseCheckPusat(
        "asdf qwerty 12345 lorem ipsum dolor sit amet",
      );
      expect(result.tickets).toEqual([]);
    });

    it("does not throw on a partial block", () => {
      const result = parseCheckPusat("131\nSLOT - PGSOFT\nTicket : 2060379");
      expect(() => result.tickets).not.toThrow();
    });
  });
});

describe("groupTickets — group by category-provider + game", () => {
  it("groups 4 tickets from the same provider+game into 1 group", () => {
    const { tickets } = parseCheckPusat(FIXTURE_NINE_PGSOFT_WINS);
    const groups = groupTickets(tickets);

    expect(groups).toHaveLength(1);
    expect(groups[0].header).toBe("SLOT - PGSOFT");
    expect(groups[0].game).toBe("Mahjong Ways 2");
    expect(groups[0].tickets).toHaveLength(4);
  });

  it("creates separate groups for different providers", () => {
    const { tickets } = parseCheckPusat(FIXTURE_MULTI_PROVIDER);
    const groups = groupTickets(tickets);

    expect(groups).toHaveLength(2);
    expect(groups[0].header).toBe("SLOT - PGSOFT");
    expect(groups[1].header).toBe("SLOT - PRAGMATIC");
  });

  it("sorts tickets within a group descending by member win", () => {
    const { tickets } = parseCheckPusat(FIXTURE_NINE_PGSOFT_WINS);
    const groups = groupTickets(tickets);

    const wins = groups[0].tickets.map((t) => t.memberWin);
    expect(wins).toEqual([990000, 980000, 600000, 460000]);
  });
});

describe("renderTemplate — final plain-text output", () => {
  it("matches the exact format the user wants", () => {
    const { tickets } = parseCheckPusat(FIXTURE_NINE_PGSOFT_WINS);

    const text = renderTemplate(tickets, {
      idPlayer: "john123",
      closingLine:
        "Hello sir, please help check this ticket, is it valid or not?",
    });

    const expected = [
      "john123",
      "",
      "SLOT - PGSOFT",
      "Mahjong Ways 2",
      "Ticket : 2060379153714300416 | 990,000 | 2026-05-29 23:14:05",
      "Ticket : 2060378834720705025 | 980,000 | 2026-05-29 23:12:49",
      "Ticket : 2060379201109904384 | 600,000 | 2026-05-29 23:14:17",
      "Ticket : 2060379128082868225 | 460,000 | 2026-05-29 23:13:59",
      "",
      "Hello sir, please help check this ticket, is it valid or not?",
    ].join("\n");

    expect(text).toBe(expected);
  });

  it("renders multiple groups with the closing line at the very end", () => {
    const { tickets } = parseCheckPusat(FIXTURE_MULTI_PROVIDER);

    const text = renderTemplate(tickets, {
      idPlayer: "p1",
      closingLine: "Hello",
    });

    const lines = text.split("\n");
    // Both group headers should appear before the closing line.
    const pgsoftIdx = lines.indexOf("SLOT - PGSOFT");
    const pragmaticIdx = lines.indexOf("SLOT - PRAGMATIC");
    const closingIdx = lines.lastIndexOf("Hello");

    expect(pgsoftIdx).toBeGreaterThan(0);
    expect(pragmaticIdx).toBeGreaterThan(pgsoftIdx);
    expect(closingIdx).toBeGreaterThan(pragmaticIdx);
  });

  it("returns empty string when there are no tickets", () => {
    const text = renderTemplate([], {
      idPlayer: "p1",
      closingLine: "Hello",
    });
    expect(text).toBe("");
  });
});
