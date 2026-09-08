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

  it("parses PlayerWithdrawalPG raw file headers matching sample ASSET file", () => {
    const grid = [
      [
        "Request",
        "Paid",
        "Player",
        "Player Bank",
        "Player Acct Name",
        "Player Acct No",
        "PG Name",
        "MerchantName",
        "Transaction ID",
        "Amount",
        "Status",
        "Remark",
        "Admin",
        "Process",
      ],
      [
        "06-09-2026 04:33:36",
        "06-09-2026 04:33:42",
        "Falireva",
        "BNI",
        "Roberth",
        "1919245590",
        "AjaibWD-PBR 188 b2c-20260906043337138820-01m1sqvgwgmadrybgygj508f76",
        "AjaibWD-PBR 188",
        215092654,
        100000,
        "Approve",
        "b2c-20260906043337138820-01m1sqvgwgmadrybgygj508f76",
        "System",
        "06-09-2026 04:33:36",
      ],
    ];

    const results = parseExcelGrid(grid, "BOT", "WD QRIS AJAIB");
    expect(results).toHaveLength(1);
    expect(results[0].nama).toBe("ROBERTH");
    expect(results[0].nomorRekening).toBe("BNI 1919245590");
    expect(results[0].userId).toBe("Falireva");
    expect(results[0].sub).toBe("BOT");
    expect(results[0].kodeTransaksi).toBe("WD");
    expect(results[0].withdrawal).toBe("100,000");
    expect(results[0].keterangan).toBe("215092654");
    expect(results[0].kodeBank).toBe("WD QRIS AJAIB");
  });

  it("parses raw Excel data pasted WITHOUT headers", () => {
    const gridWithoutHeaders = [
      [
        "06-09-2026 04:33:36",
        "06-09-2026 04:33:42",
        "Falireva",
        "BNI",
        "Roberth",
        "1919245590",
        "PG-1",
        "Merchant-1",
        215092654,
        100000,
        "Approve",
        "b2c-1",
        "System",
        "06-09-2026 04:33:36",
      ],
      [
        "06-09-2026 05:12:10",
        "06-09-2026 05:12:15",
        "Hardi88",
        "BCA",
        "Hardi",
        "883019283",
        "PG-2",
        "Merchant-2",
        215092655,
        500000,
        "Approve",
        "b2c-2",
        "System",
        "06-09-2026 05:12:10",
      ],
    ];

    const results = parseExcelGrid(gridWithoutHeaders, "BOT", "WD QRIS AJAIB");
    expect(results).toHaveLength(2);
    expect(results[0].nama).toBe("ROBERTH");
    expect(results[0].nomorRekening).toBe("BNI 1919245590");
    expect(results[0].userId).toBe("Falireva");
    expect(results[0].withdrawal).toBe("100,000");

    expect(results[1].nama).toBe("HARDI");
    expect(results[1].nomorRekening).toBe("BCA 883019283");
    expect(results[1].userId).toBe("Hardi88");
    expect(results[1].withdrawal).toBe("500,000");
  });
});
