export interface WebProfile {
  id: string;
  name: string;
  sub: string;
  kodeTransaksi: string;
  keterangan: string;
  colAccountName: string;
  colPaymentMethod: string;
  colAccountNumber: string;
  colTransactionId: string;
  colTotalAmount: string;
  colFinishedDate: string;
}

export const DEFAULT_PROFILE: Omit<WebProfile, "id" | "name"> = {
  sub: "BOT",
  kodeTransaksi: "WD",
  keterangan: "QRIS HOKI RATUKILAT 77",
  colAccountName: "Account Name",
  colPaymentMethod: "Payment Method",
  colAccountNumber: "Account Number",
  colTransactionId: "Whitelabel Transaction ID",
  colTotalAmount: "Total Amount",
  colFinishedDate: "Finished Date",
};

export const INITIAL_PROFILES: WebProfile[] = [
  {
    id: "default",
    name: "HOKI RATUKILAT 77",
    ...DEFAULT_PROFILE,
  },
];
