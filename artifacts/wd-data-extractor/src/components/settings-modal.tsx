import { useState } from "react";
import { Settings, Plus, Trash2, Edit2, Check, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WebProfile, DEFAULT_PROFILE } from "@/types/webProfile";

interface SettingsModalProps {
  profiles: WebProfile[];
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  onAddProfile: (profile: Omit<WebProfile, "id">) => string;
  onUpdateProfile: (id: string, updates: Partial<Omit<WebProfile, "id">>) => void;
  onDeleteProfile: (id: string) => void;
}

type FormState = Omit<WebProfile, "id">;

const emptyForm = (): FormState => ({
  name: "",
  ...DEFAULT_PROFILE,
});

function ProfileForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (key: keyof FormState, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  const fieldRow = (label: string, key: keyof FormState, placeholder?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm bg-background border-border focus-visible:ring-primary/40"
        data-testid={`input-profile-${key}`}
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground font-medium">Nama Web / Platform</Label>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. HOKI77, RATUKILAT"
          className="h-9 bg-background border-border focus-visible:ring-primary/40"
          autoFocus
          data-testid="input-profile-name"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nilai Tetap (Hardcoded)</p>
        {fieldRow("SUB", "sub", "BOT")}
        {fieldRow("KODE TRANSAKSI", "kodeTransaksi", "WD")}
        {fieldRow("KETERANGAN / KODE SN", "keterangan", "QRIS HOKI RATUKILAT 77")}
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
        data-testid="button-toggle-advanced"
      >
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
        />
        Mapping Kolom Excel (Advanced)
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
          <p className="col-span-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Nama Kolom di File Excel
          </p>
          {fieldRow("Account Name", "colAccountName", "Account Name")}
          {fieldRow("Payment Method", "colPaymentMethod", "Payment Method")}
          {fieldRow("Account Number", "colAccountNumber", "Account Number")}
          {fieldRow("Transaction ID", "colTransactionId", "Whitelabel Transaction ID")}
          {fieldRow("Total Amount", "colTotalAmount", "Total Amount")}
          {fieldRow("Finished Date", "colFinishedDate", "Finished Date")}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="flex-1" data-testid="button-save-profile">
          <Check size={14} className="mr-1.5" />
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="flex-1 text-muted-foreground"
          data-testid="button-cancel-profile"
        >
          Batal
        </Button>
      </div>
    </form>
  );
}

export function SettingsModal({
  profiles,
  activeProfileId,
  onSelectProfile,
  onAddProfile,
  onUpdateProfile,
  onDeleteProfile,
}: SettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "add" | { editing: string }>("list");

  const handleAdd = (form: FormState) => {
    const id = onAddProfile(form);
    onSelectProfile(id);
    setMode("list");
  };

  const handleUpdate = (id: string, form: FormState) => {
    onUpdateProfile(id, form);
    setMode("list");
  };

  const editingProfile =
    typeof mode === "object" && "editing" in mode
      ? profiles.find((p) => p.id === mode.editing)
      : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          data-testid="button-open-settings"
        >
          <Settings size={16} />
          <span className="hidden sm:inline">Pengaturan</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {mode === "add"
              ? "Tambah Web Baru"
              : typeof mode === "object"
              ? "Edit Web"
              : "Profil Web"}
          </DialogTitle>
        </DialogHeader>

        {mode === "list" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Pilih profil web aktif atau kelola daftar web yang tersedia.
            </p>

            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${
                    profile.id === activeProfileId
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                  }`}
                  onClick={() => onSelectProfile(profile.id)}
                  data-testid={`item-profile-${profile.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{profile.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {profile.keterangan}
                    </p>
                  </div>

                  {profile.id === activeProfileId && (
                    <span className="text-xs text-primary font-medium shrink-0">Aktif</span>
                  )}

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMode({ editing: profile.id });
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      data-testid={`button-edit-profile-${profile.id}`}
                    >
                      <Edit2 size={13} />
                    </button>
                    {profiles.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProfile(profile.id);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-delete-profile-${profile.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode("add")}
              className="w-full border-dashed border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground"
              data-testid="button-add-profile"
            >
              <Plus size={14} className="mr-1.5" />
              Tambah Web Baru
            </Button>
          </div>
        )}

        {mode === "add" && (
          <ProfileForm
            initial={emptyForm()}
            onSave={handleAdd}
            onCancel={() => setMode("list")}
            submitLabel="Simpan"
          />
        )}

        {typeof mode === "object" && editingProfile && (
          <ProfileForm
            initial={{
              name: editingProfile.name,
              sub: editingProfile.sub,
              kodeTransaksi: editingProfile.kodeTransaksi,
              keterangan: editingProfile.keterangan,
              colAccountName: editingProfile.colAccountName,
              colPaymentMethod: editingProfile.colPaymentMethod,
              colAccountNumber: editingProfile.colAccountNumber,
              colTransactionId: editingProfile.colTransactionId,
              colTotalAmount: editingProfile.colTotalAmount,
              colFinishedDate: editingProfile.colFinishedDate,
            }}
            onSave={(form) => handleUpdate(mode.editing, form)}
            onCancel={() => setMode("list")}
            submitLabel="Simpan Perubahan"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
