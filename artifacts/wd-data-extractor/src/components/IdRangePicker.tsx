import React from "react";
import { Search, ChevronUp, ChevronDown, X, Check, AlertCircle } from "lucide-react";

// ─── ID range picker ─────────────────────────────────────────────────────────
//
// One of two boxes used to mark the start / end of the visible row range
// by typing an ID. Matching is live (substring, case-insensitive) and the
// parent component reads the resolved match to drive the row range.
//
// Shared by both QRIS HOKI sections (WD = home.tsx, DP = dp-section.tsx) so the
// marking UI and flow stay identical.
//
// When the typed ID matches more than one row the user can cycle through
// matches with the ▲/▼ buttons (or ArrowUp/ArrowDown while the input is
// focused).

export interface IdRangePickerProps {
  label: string;                          // "ID Awal" / "ID Akhir"
  accent: "emerald" | "rose";             // colour scheme
  icon: React.ReactNode;                  // leading icon (Flag / FlagOff)
  query: string;
  onQueryChange: (value: string) => void;
  matches: { row: number; id: string }[];
  matchIdx: number;
  onCycle: (direction: 1 | -1) => void;   // +1 next, -1 previous
  onClear: () => void;
  inputCls: string;                       // shared input style
  testidPrefix: string;                   // "start" / "end"
  excludeMarked?: boolean;                // ID Awal: range mulai SETELAH baris ini
  placeholder?: string;
}

export function IdRangePicker({
  label,
  accent,
  icon,
  query,
  onQueryChange,
  matches,
  matchIdx,
  onCycle,
  onClear,
  inputCls,
  testidPrefix,
  excludeMarked = false,
  placeholder = "paste atau ketik User ID…",
}: IdRangePickerProps) {
  const trimmed = query.trim();
  const hasMatch = matches.length > 0;
  const current = hasMatch ? matches[Math.min(matchIdx, matches.length - 1)] : null;

  const accentRing = accent === "emerald"
    ? "focus-within:ring-[#74A355] focus-within:border-[#74A355]"
    : "focus-within:ring-rose-500 focus-within:border-rose-500";
  const accentLabel = accent === "emerald" ? "text-emerald-800 font-bold" : "text-rose-800 font-bold";
  const accentIcon  = accent === "emerald" ? "text-[#74A355]" : "text-rose-600";

  return (
    <div className={`flex flex-col gap-1.5 px-3 py-2 rounded-xl border border-white/80 neu-flat bg-[#FDFBD4] transition-all ${accentRing} focus-within:ring-1`}>
      {/* Label row */}
      <div className="flex items-center gap-1.5">
        <span className={accentIcon}>{icon}</span>
        <span className={`text-[10px] uppercase tracking-wider ${accentLabel}`}>
          {label}
        </span>
        {matches.length > 1 && (
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[10px] font-mono text-[#596B4F]">
              {matchIdx + 1}/{matches.length}
            </span>
            <button
              type="button"
              onClick={() => onCycle(-1)}
              className="flex items-center justify-center w-5 h-5 rounded text-[#596B4F] hover:text-[#23321B] hover:bg-white/60 transition-colors"
              data-testid={`button-${testidPrefix}-prev`}
              aria-label="Match sebelumnya"
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              onClick={() => onCycle(1)}
              className="flex items-center justify-center w-5 h-5 rounded text-[#596B4F] hover:text-[#23321B] hover:bg-white/60 transition-colors"
              data-testid={`button-${testidPrefix}-next`}
              aria-label="Match berikutnya"
            >
              <ChevronDown size={12} />
            </button>
          </span>
        )}
      </div>

      {/* Input row */}
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#596B4F] pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onCycle(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              onCycle(-1);
            }
          }}
          placeholder={placeholder}
          className={`w-full h-7 pl-7 pr-7 text-xs font-mono ${inputCls}`}
          data-testid={`input-${testidPrefix}-id`}
        />
        {query && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#596B4F] hover:text-[#23321B]"
            data-testid={`button-${testidPrefix}-clear`}
            aria-label="Bersihkan"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Status row */}
      <div className="min-h-[14px] text-[11px] flex items-center gap-1">
        {!trimmed && (
          <span className="text-[#596B4F]">Kosong — range mengikuti input manual.</span>
        )}
        {trimmed && current && (
          <span className="text-[#74A355] flex items-center gap-1 font-medium">
            <Check size={10} />
            {excludeMarked ? (
              <>Mulai setelah baris {current.row}: <span className="font-mono">{current.id}</span></>
            ) : (
              <>Baris {current.row}: <span className="font-mono">{current.id}</span></>
            )}
          </span>
        )}
        {trimmed && !current && (
          <span className="text-[#CC2936] flex items-center gap-1 font-medium">
            <AlertCircle size={10} />
            Tidak ditemukan
          </span>
        )}
      </div>
    </div>
  );
}
