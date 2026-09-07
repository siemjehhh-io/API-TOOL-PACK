import { describe, expect, it } from "vitest";
import { cleanTrxId, detectBrandFromText, parseGigaWdText } from "../src/pages/GigaCopyWd";

describe("GigaCopyWd — WD GIGA parser overhaul", () => {
  it("cleans transaction ID by stripping leading 00 or 01 prefix", () => {
    expect(cleanTrxId("012FI06a9ee87f3d4b7")).toBe("2FI06a9ee87f3d4b7");
    expect(cleanTrxId("01J9G06a7daa923de89")).toBe("J9G06a7daa923de89");
    expect(cleanTrxId("00MWM06a7d961abfa82")).toBe("MWM06a7d961abfa82");
  });

  it("parses user's exact sample input (arifin / SEABANK)", () => {
    const rawInput = `1
2026-09-07 23:38:23182.1.185.165
Game Wallet
[012FI06a9ee87f3d4b7](https://giga5-ns3-admin.net/transactions/withdrawalform/012FI06a9ee87f3d4b7)
arifin / SEABANK901721838243
[apiapi1234](https://giga5-ns3-admin.net/member_details/GGIABAC012FI)
Bank / SEABANK
arifin
901721838243
In Progess
200,000.00`;

    const results = parseGigaWdText(rawInput, "MJ");
    expect(results).toHaveLength(1);

    const row = results[0];
    expect(row.nama).toBe("ARIFIN");
    expect(row.nomorRekening).toBe("SEABANK 901721838243");
    expect(row.userId).toBe("apiapi1234");
    expect(row.sub).toBe("MJ");
    expect(row.kodeTransaksi).toBe("WD");
    expect(row.withdrawal).toBe("200,000");
    expect(row.dpPulsa).toBe("2FI06a9ee87f3d4b7");
    expect(row.keterangan).toBe("2FI06a9ee87f3d4b7");
    expect(row.jamInput).toBe("23:38:23");
    expect(row.brand).toBe("API22");
  });

  it("parses SAMPLE_TEXT_API22 (apip / DANA)", () => {
    const rawInput = `1
2026-08-13 18:29:22182.2.176.125
Game Wallet
[01J9G06a7daa923de89](https://giga5-ns3-admin.net/transactions/withdrawalform/01J9G06a7daa923de89)
apip / DANA081235908910
First Time
[somay345](https://giga5-ns3-admin.net/member_details/GGIABAC01J9G)
E-wallet / DANA
apip
081235908910
In Progess
121,000.00`;

    const results = parseGigaWdText(rawInput, "PNG");
    expect(results).toHaveLength(1);

    const row = results[0];
    expect(row.nama).toBe("APIP");
    expect(row.nomorRekening).toBe("DANA 081235908910");
    expect(row.userId).toBe("somay345");
    expect(row.sub).toBe("PNG");
    expect(row.withdrawal).toBe("121,000");
    expect(row.dpPulsa).toBe("J9G06a7daa923de89");
    expect(row.jamInput).toBe("18:29:22");
  });

  it("parses SAMPLE_TEXT_PIN88 (Rahmawati oktaviani / BCA)", () => {
    const rawInput = `1
2026-08-13 17:02:02 157.10.107.18
Game Wallet
[00MWM06a7d961abfa82](https://giga2-ns3-admin.net/transactions/t_withdrawalform/00MWM06a7d961abfa82)
Rahmawati oktaviani / BCA1570288373
[meyra8](https://giga2-ns3-admin.net/member_details/DGAABAF00MWM)2
Bank / BCA
Quick Withdraw -rahmawati oktaviani
1570288373
Confirmed
68,000.00
2026-08-13 17:05:25`;

    const results = parseGigaWdText(rawInput, "MJ");
    expect(results).toHaveLength(1);

    const row = results[0];
    expect(row.nama).toBe("RAHMAWATI OKTAVIANI");
    expect(row.nomorRekening).toBe("BCA 1570288373");
    expect(row.userId).toBe("meyra8");
    expect(row.sub).toBe("MJ");
    expect(row.withdrawal).toBe("68,000");
    expect(row.dpPulsa).toBe("MWM06a7d961abfa82");
    expect(row.jamInput).toBe("17:02:02");
    expect(row.brand).toBe("PIN88");
  });
});
