# WD Data Extractor — Project Documentation

## Overview

A fully **client-side** internal tool for the operations team. It reads `.xlsx` files
from two different report formats and converts them into a standardized 13-column output
that can be copied (TSV) or exported as a new `.xlsx` file.

**No server, no database, no authentication.** All processing happens in the browser
using SheetJS. Data never leaves the machine.

---

## Stack

| Layer            | Technology                                    |
|------------------|-----------------------------------------------|
| Framework        | React 18 + Vite                               |
| Language         | TypeScript (strict)                           |
| Styling          | TailwindCSS v3 + custom glassmorphism theme   |
| File parsing     | SheetJS / xlsx v0.18.5                        |
| Animations       | Framer Motion                                 |
| Toast            | Sonner                                        |
| UI components    | shadcn/ui (Dialog, Button, Input, Label)      |
| Icons            | Lucide React                                  |
| Package manager  | pnpm (workspace monorepo)                     |

---

## Project Structure

```
artifacts/wd-data-extractor/
├── src/
│   ├── pages/
│   │   ├── home.tsx            ← Shell: header, tabs, WD extractor logic
│   │   └── dp-section.tsx      ← DP extractor component (rendered inside Home)
│   │
│   ├── components/
│   │   ├── settings-modal.tsx      ← WD profile CRUD modal (shadcn Dialog)
│   │   └── dp-settings-modal.tsx   ← DP profile CRUD modal (shadcn Dialog)
│   │
│   ├── hooks/
│   │   ├── useWebProfiles.ts   ← WD profiles: state + localStorage persistence
│   │   └── useDpProfiles.ts    ← DP profiles: state + localStorage persistence
│   │
│   ├── types/
│   │   ├── webProfile.ts       ← WebProfile interface + defaults + initial seed data
│   │   └── dpProfile.ts        ← DpProfile interface + defaults
│   │
│   ├── lib/utils.ts            ← shadcn cn() utility
│   ├── index.css               ← Glassmorphism theme (.glass, .orb, .bg-scene)
│   └── main.tsx                ← React root
│
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

---

## Features

### Tab 1 — WD (Withdrawal) Extractor

**Source file:** Any `.xlsx` withdrawal report with configurable column names.

**Default column mapping** (set per-profile in Settings):

| Source column (xlsx)        | Output column           |
|-----------------------------|-------------------------|
| Account Name                | NAMA                    |
| Payment Method + Account Number | NOMOR REKENING      |
| Whitelabel Transaction ID   | USER ID / LOGIN (split on "-") |
| *(hardcoded from profile)*  | SUB                     |
| *(hardcoded from profile)*  | KODE TRANSAKSI          |
| *(empty)*                   | DEPOSIT                 |
| Total Amount                | WITHDRAWAL              |
| *(empty)*                   | DP PULSA                |
| *(hardcoded from profile)*  | KETERANGAN / KODE SN   |
| *(empty)*                   | KODE BANK               |
| *(empty)*                   | SALDO AKHIR             |
| Finished Date (time only)   | JAM INPUT WD            |
| *(empty)*                   | INPUT KODE BANK         |

**Filtering:** Rows where `Status !== "success"` are automatically skipped.

**Profile fields** (`WebProfile`):
- `name` — display name in picker
- `sub` — hardcoded SUB value
- `kodeTransaksi` — hardcoded (usually "WD")
- `keterangan` — hardcoded KETERANGAN value
- `colAccountName`, `colPaymentMethod`, `colAccountNumber`, `colTransactionId`, `colTotalAmount`, `colFinishedDate` — Excel column names

---

### Tab 2 — DP (Deposit / QRIS) Extractor

**Source file:** `deposit-report-*.xlsx` (fixed column names, no mapping needed).

**Fixed column mapping:**

| Source column (xlsx)        | Output column           |
|-----------------------------|-------------------------|
| Whitelabel Transaction ID   | NAMA                    |
| Transaction Date            | NOMOR REKENING (reformatted to M/D/YYYY HH:MM:SS) |
| Member ID                   | USER ID / LOGIN         |
| *(hardcoded from profile)*  | SUB                     |
| "DP" (always)               | KODE TRANSAKSI          |
| Amount                      | DEPOSIT                 |
| *(empty)*                   | WITHDRAWAL              |
| *(empty)*                   | DP PULSA                |
| Transaction ID (UUID)       | KETERANGAN / KODE SN   |
| *(hardcoded from profile)*  | KODE BANK               |
| *(empty)*                   | SALDO AKHIR             |
| Finished Date (time only)   | JAM INPUT WD            |
| Finished Date (time only)   | INPUT KODE BANK         |

**Filtering:** Rows without a Member ID, or where `Status !== "success"`, are skipped.

**Profile fields** (`DpProfile`):
- `name` — display name in picker
- `sub` — hardcoded SUB value
- `kodeBank` — hardcoded KODE BANK value (e.g. "QRIS HOKI RATUKILAT 77")

---

## Output Format

Both WD and DP produce the **same 13-column output**:

```
NAMA | NOMOR REKENING | USER ID / LOGIN | SUB | KODE TRANSAKSI |
DEPOSIT | WITHDRAWAL | DP PULSA | KETERANGAN / KODE SN |
KODE BANK | SALDO AKHIR | JAM INPUT WD | INPUT KODE BANK
```

Output can be:
- **Copied as TSV** — paste directly into Google Sheets / Excel
- **Exported as .xlsx** — auto-sized columns, single sheet named "Output" (WD) or "Output DP"

---

## Profile System

Profiles are stored in **localStorage** and persist across page reloads.

| Key                          | What it stores                     |
|------------------------------|------------------------------------|
| `wd-extractor-profiles`      | `WebProfile[]` JSON array          |
| `wd-extractor-active-profile`| ID of the selected WD profile      |
| `dp-extractor-profiles`      | `DpProfile[]` JSON array           |
| `dp-extractor-active-profile`| ID of the selected DP profile      |

Seed data (shown on first load) is defined in `INITIAL_PROFILES` (webProfile.ts)
and `INITIAL_PROFILES` (useDpProfiles.ts).

---

## Row Range Selection

After a file is loaded, users can narrow the export to a subset of rows:

- **Number inputs** — type start/end row numbers directly
- **Mark mode** — click "Tandai Awal" or "Tandai Akhir", then click any row number
  in the table to set that boundary
- **ID search** — search for a user ID / member ID and apply the found row as start or end

The range selection affects both the stat cards and the TSV/xlsx export.

---

## UI / Theme

- **Glassmorphism** — `.glass`, `.glass-strong` classes defined in `index.css` using
  `backdrop-filter: blur()` + semi-transparent backgrounds
- **Animated orbs** — `.bg-scene`, `.orb-1/2/3` provide the animated gradient background
- **WD color theme** — violet / indigo (`violet-400`, `indigo-600`)
- **DP color theme** — emerald / teal (`emerald-400`, `teal-600`)
- **Amber warnings** — duplicate user IDs are highlighted amber in both tabs

---

## How to Run

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start the dev server (runs on the PORT env var assigned by Replit)
pnpm --filter @workspace/wd-data-extractor run dev
```

The workflow `artifacts/wd-data-extractor: web` handles this automatically in Replit.

## TypeScript Check

```bash
pnpm --filter @workspace/wd-data-extractor exec tsc --noEmit
```

---

## Extending the Project

### Add a new WD column mapping field
1. Add the field to `WebProfile` in `src/types/webProfile.ts`
2. Add a default value in `DEFAULT_PROFILE`
3. Add a form field in `settings-modal.tsx` (inside `ProfileForm`)
4. Use the new field in `transformData()` in `home.tsx`

### Add a new tab / extractor
1. Create a new section component (model after `dp-section.tsx`)
2. Create a new profile type and hook (model after `dpProfile.ts` / `useDpProfiles.ts`)
3. Add a settings modal (model after `dp-settings-modal.tsx`)
4. Wire the tab, picker, and settings into the header in `home.tsx`

### Change seed profiles
- WD seed: `INITIAL_PROFILES` in `src/types/webProfile.ts`
- DP seed: `INITIAL_PROFILES` in `src/hooks/useDpProfiles.ts`

> **Note:** Changing seed data only affects users who have never opened the app before
> (or after clearing localStorage). Existing users keep their saved profiles.
