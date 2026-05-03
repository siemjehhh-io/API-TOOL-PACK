import { useState, useEffect } from "react";
import { WebProfile, INITIAL_PROFILES } from "@/types/webProfile";

const STORAGE_KEY = "wd-extractor-profiles";
const ACTIVE_KEY = "wd-extractor-active-profile";

export function useWebProfiles() {
  const [profiles, setProfiles] = useState<WebProfile[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as WebProfile[];
        if (parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_PROFILES;
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) || INITIAL_PROFILES[0].id;
    } catch {
      return INITIAL_PROFILES[0].id;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, activeProfileId);
  }, [activeProfileId]);

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0];

  const addProfile = (profile: Omit<WebProfile, "id">) => {
    const newProfile: WebProfile = {
      ...profile,
      id: crypto.randomUUID(),
    };
    setProfiles((prev) => [...prev, newProfile]);
    return newProfile.id;
  };

  const updateProfile = (id: string, updates: Partial<Omit<WebProfile, "id">>) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const deleteProfile = (id: string) => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length === 0) return INITIAL_PROFILES;
      return next;
    });
    if (activeProfileId === id) {
      setActiveProfileId(
        profiles.find((p) => p.id !== id)?.id ?? INITIAL_PROFILES[0].id
      );
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
