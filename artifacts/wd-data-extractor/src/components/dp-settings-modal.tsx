import { useState } from "react";
import { Settings, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DpProfile, DEFAULT_DP_PROFILE } from "@/types/dpProfile";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = Omit<DpProfile, "id">;

interface DpSettingsModalProps {
  profiles: DpProfile[];
  activeProfileId: string;
  onSelectProfile: (id: string) => void;
  onAddProfile: (profile: Omit<DpProfile, "id">) => string;
  onUpdateProfile: (id: string, updates: Partial<Omit<DpProfile, "id">>) => void;
  onDeleteProfile: (id: string) => void;
}

// ─── Profile form (used for both "Add" and "Edit" modes) ─────────────────────

function ProfileForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial: FormState;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState<FormState>(initial);

  const setField = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Profile name */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground font-medium">
          Nama Web / Platform
        </Label>
        <Input
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="e.g. HOKI77, RATUKILAT"
          className="h-9 bg-background border-border focus-visible:ring-primary/40"
          autoFocus
        />
      </div>

      {/* Fixed output values */}
      <div className="grid grid-cols-1 gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Nilai Tetap
        </p>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">SUB</Label>
          <Input
            value={form.sub}
            onChange={(e) => setField("sub", e.target.value)}
            placeholder="BOT"
            className="h-8 text-sm bg-background border-border focus-visible:ring-primary/40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">
            KODE BANK (kolom 10)
          </Label>
          <Input
            value={form.kodeBank}
            onChange={(e) => setField("kodeBank", e.target.value)}
            placeholder="QRIS HOKI RATUKILAT 77"
            className="h-8 text-sm bg-background border-border focus-visible:ring-primary/40"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="flex-1">
          <Check size={14} className="mr-1.5" />
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="flex-1 text-muted-foreground"
        >
          Batal
        </Button>
      </div>
    </form>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export function DpSettingsModal({
  profiles,
  activeProfileId,
  onSelectProfile,
  onAddProfile,
  onUpdateProfile,
  onDeleteProfile,
}: DpSettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "add" | { editing: string }>("list");

  const editingProfile =
    typeof mode === "object"
      ? profiles.find((p) => p.id === mode.editing)
      : null;

  const handleAdd = (form: FormState) => {
    const id = onAddProfile(form);
    onSelectProfile(id);
    setMode("list");
  };

  const handleUpdate = (id: string, form: FormState) => {
    onUpdateProfile(id, form);
    setMode("list");
  };

  const modalTitle =
    mode === "add"
      ? "Tambah Web DP"
      : typeof mode === "object"
      ? "Edit Web DP"
      : "Profil DP";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          data-testid="button-open-dp-settings"
        >
          <Settings size={16} />
          <span className="hidden sm:inline">Pengaturan</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{modalTitle}</DialogTitle>
        </DialogHeader>

        {/* ── List mode ── */}
        {mode === "list" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Pilih profil DP aktif atau kelola daftar web yang tersedia.
            </p>

            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  onClick={() => onSelectProfile(profile.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group
                    ${profile.id === activeProfileId
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:border-primary/30 hover:bg-muted/30"
                    }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{profile.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{profile.kodeBank}</p>
                  </div>

                  {profile.id === activeProfileId && (
                    <span className="text-xs text-primary font-medium shrink-0">Aktif</span>
                  )}

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMode({ editing: profile.id }); }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Edit2 size={13} />
                    </button>
                    {profiles.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDeleteProfile(profile.id); }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
            >
              <Plus size={14} className="mr-1.5" />
              Tambah Web DP
            </Button>
          </div>
        )}

        {/* ── Add mode ── */}
        {mode === "add" && (
          <ProfileForm
            initial={{ name: "", ...DEFAULT_DP_PROFILE }}
            onSave={handleAdd}
            onCancel={() => setMode("list")}
            submitLabel="Simpan"
          />
        )}

        {/* ── Edit mode ── */}
        {typeof mode === "object" && editingProfile && (
          <ProfileForm
            initial={{
              name: editingProfile.name,
              sub: editingProfile.sub,
              kodeBank: editingProfile.kodeBank,
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
