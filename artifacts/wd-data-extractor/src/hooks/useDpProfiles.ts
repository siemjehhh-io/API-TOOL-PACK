import { useState, useEffect } from "react";
import { DpProfile, DEFAULT_DP_PROFILE } from "@/types/dpProfile";

// ─── Default seed data ────────────────────────────────────────────────────────

const INITIAL_PROFILES: DpProfile[] = [
  { id: "dp-default-1", name: "HOKI RATUKILAT 77", ...DEFAULT_DP_PROFILE },
];

// ─── localStorage keys ────────────────────────────────────────────────────────

const STORAGE_KEY = "dp-extractor-profiles";
const ACTIVE_KEY  = "dp-extractor-active-profile";

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages the list of DP (deposit/QRIS) profiles and which one is active.
 * Both the profile list and the active ID are persisted to localStorage.
 */
export function useDpProfiles() {
  // Load profiles from localStorage on first render; fall back to seed data.
  const [profiles, setProfiles] = useState<DpProfile[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DpProfile[];
        if (parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_PROFILES;
  });

  // Load the last-selected profile ID; fall back to the first seed profile.
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) || INITIAL_PROFILES[0].id;
    } catch {
      return INITIAL_PROFILES[0].id;
    }
  });

  // Persist changes to localStorage whenever state changes.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeProfileId);
  }, [activeProfileId]);

  // Resolve the active profile object (always defined — falls back to first).
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const addProfile = (profile: Omit<DpProfile, "id">): string => {
    const newProfile: DpProfile = { ...profile, id: crypto.randomUUID() };
    setProfiles((prev) => [...prev, newProfile]);
    return newProfile.id;
  };

  const updateProfile = (id: string, updates: Partial<Omit<DpProfile, "id">>) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const deleteProfile = (id: string) => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      // Never allow an empty list — fall back to seed data.
      return next.length > 0 ? next : INITIAL_PROFILES;
    });
    // If the deleted profile was active, switch to another one.
    if (activeProfileId === id) {
      const fallback = profiles.find((p) => p.id !== id)?.id ?? INITIAL_PROFILES[0].id;
      setActiveProfileId(fallback);
    }
  };

  return {
    profiles,
    activeProfile,
    activeProfileId,
    setActiveProfileId,
    addProfile,
    updateProfile,
    deleteProfile,
  };
}
