export interface DpProfile {
  id: string;
  name: string;
  sub: string;
  kodeBank: string;
}

export const DEFAULT_DP_PROFILE: Omit<DpProfile, "id" | "name"> = {
  sub: "BOT",
  kodeBank: "QRIS HOKI RATUKILAT 77",
};
