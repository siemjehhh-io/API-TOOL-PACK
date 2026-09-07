import { describe, expect, it } from "vitest";
import { parseExcelGrid } from "../src/pages/WdQrisAjaibOzzo";

describe("WdQrisAjaibOzzo — Excel & Grid Parser", () => {
  it("parses Excel grid rows with standard withdrawal report headers", () => {
    const grid = [
      [
        "Account Name",
        "Payment Method",
        "Account Number",
        "User ID",
        "Transaction ID",
        "Total Amount",
        "Finished Date",
        "Status",
      ],
      [
        "BUDI SANTOSO",
        "BCA",
        "1234567890",
        "budi99",
        "TRX-998877",
        "500000",
        "2026-09-08 14:30:15",
        "SUCCESS",
      ],
      [
        "SITI AMINAH",
        "DANA",
        "081299887766",
        "siti88",
        "TRX-112233",
        "250000",
        "2026-09-08 15:45:00",
        "SUCCESS",
      ],
    ];

    const results = parseExcelGrid(grid, "OZZO");
    expect(results).toHaveLength(2);

    // Entry 1
    expect(results[0].nama).toBe("BUDI SANTOSO");
    expect(results[0].nomorRekening).toBe("BCA 1234567890");
    expect(results[0].userId).toBe("budi99");
    expect(results[0].sub).toBe("OZZO");
    expect(results[0].kodeTransaksi).toBe("WD");
    expect(results[0].withdrawal).toBe("500,000");
    expect(results[0].jamInput).toBe("14:30:15");

    // Entry 2
    expect(results[1].nama).toBe("SITI AMINAH");
    expect(results[1].nomorRekening).toBe("DANA 081299887766");
    expect(results[1].userId).toBe("siti88");
    expect(results[1].sub).toBe("OZZO");
    expect(results[1].withdrawal).toBe("250,000");
    expect(results[1].jamInput).toBe("15:45:00");
  });
});
