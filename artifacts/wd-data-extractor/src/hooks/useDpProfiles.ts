import { useState, useEffect } from "react";
import { DpProfile, DEFAULT_DP_PROFILE } from "@/types/dpProfile";

const INITIAL: DpProfile[] = [
  { id: "dp-default-1", name: "HOKI RATUKILAT 77", ...DEFAULT_DP_PROFILE },
];

const STORAGE_KEY  = "dp-extractor-profiles";
const ACTIVE_KEY   = "dp-extractor-active-profile";

export function useDpProfiles() {
  const [profiles, setProfiles] = useState<DpProfile[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) { const p = JSON.parse(s) as DpProfile[]; if (p.length) return p; }
    } catch {}
    return INITIAL;
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    try { return localStorage.getItem(ACTIVE_KEY) || INITIAL[0].id; } catch { return INITIAL[0].id; }
  });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); }, [profiles]);
  useEffect(() => { localStorage.setItem(ACTIVE_KEY, activeProfileId); }, [activeProfileId]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];

  const addProfile = (profile: Omit<DpProfile, "id">) => {
    const np: DpProfile = { ...profile, id: crypto.randomUUID() };
    setProfiles((prev) => [...prev, np]);
    return np.id;
  };

  const updateProfile = (id: string, updates: Partial<Omit<DpProfile, "id">>) =>
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));

  const deleteProfile = (id: string) => {
    setProfiles((prev) => { const n = prev.filter((p) => p.id !== id); return n.length ? n : INITIAL; });
    if (activeProfileId === id) setActiveProfileId(profiles.find((p) => p.id !== id)?.id ?? INITIAL[0].id);
  };

  return { profiles, activeProfile, activeProfileId, setActiveProfileId, addProfile, updateProfile, deleteProfile };
}
