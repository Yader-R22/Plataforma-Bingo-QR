import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

type RoundRow = { game_mode: string; max_winners: string; prize_amount: string };

const MODE_OPTIONS = [
  { value: "full_card", label: "Cartón completo" },
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
  { value: "diagonal", label: "Diagonal" },
  { value: "quina", label: "Quina" },
];

export default function CreateGamePage() {
  const [, navigate] = useLocation();
  const [matchEdit, editParams] = useRoute("/admin/editar-juego/:id");
  const editId = matchEdit ? editParams?.id : undefined;
  const isEdit = !!editId;

  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [loading, setLoading] = useState(false);
  const [loadingGame, setLoadingGame] = useState(isEdit);

  const [form, setForm] = useState({
    title: "",
    type: "daily",
    prize_amount: "",
    card_price: "",
    draw_date: "",
    stream_url_youtube: "",
    stream_url_tiktok: "",
    stream_url_facebook: "",
    game_mode: "full_card",
    max_winners: "1",
  });

  const [coverImage, setCoverImage] = useState<string | null>(null);

  const [multiRound, setMultiRound] = useState(false);
  const [rounds, setRounds] = useState<RoundRow[]>([
    { game_mode: "full_card", max_winners: "1", prize_amount: "" },
    { game_mode: "full_card", max_winners: "1", prize_amount: "" },
  ]);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/games/${editId}`);
        if (!res.ok) { toast.error("No se pudo cargar el juego"); navigate("/admin"); return; }
        const g = await res.json();
        setForm({
          title: g.title ?? "",
          type: g.type ?? "daily",
          prize_amount: String(g.prize_amount ?? ""),
          card_price: String(g.card_price ?? ""),
          draw_date: g.draw_date ? toDatetimeLocal(g.draw_date) : "",
          stream_url_youtube: g.stream_url_youtube ?? "",
          stream_url_tiktok: g.stream_url_tiktok ?? "",
          stream_url_facebook: g.stream_url_facebook ?? "",
          game_mode: g.game_mode ?? "full_card",
          max_winners: String(g.max_winners ?? "1"),
        });
        setCoverImage(g.cover_image_url ?? null);
        if (g.rounds?.length > 1) {
          setMultiRound(true);
          setRounds(g.rounds.map((r: { game_mode: string; max_winners: number; prize_amount: number }) => ({
            game_mode: r.game_mode,
            max_winners: String(r.max_winners),
            prize_amount: String(r.prize_amount),
          })));
        }
      } catch {
        toast.error("Error al cargar el juego");
        navigate("/admin");
      } finally {
        setLoadingGame(false);
      }
    })();
  }, [isEdit, editId]);

  function upd(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function updateRound(i: number, k: keyof RoundRow, v: string) {
    setRounds(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  }

  function addRound() {
    setRounds(rs => [...rs, { game_mode: "full_card", max_winners: "1", prize_amount: "" }]);
  }

  function removeRound(i: number) {
    setRounds(rs => rs.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const roundsPayload = multiRound
        ? rounds.map(r => ({
            game_mode: r.game_mode,
            max_winners: parseInt(r.max_winners) || 1,
            prize_amount: parseFloat(r.prize_amount) || 0,
          }))
        : null;

      const common: Record<string, unknown> = {
        title: form.title,
        prize_amount: parseFloat(form.prize_amount),
        card_price: parseFloat(form.card_price),
        max_winners: multiRound ? 1 : parseInt(form.max_winners),
        draw_date: new Date(form.draw_date).toISOString(),
        game_mode: form.game_mode,
        stream_url_youtube: form.stream_url_youtube || undefined,
        stream_url_tiktok: form.stream_url_tiktok || undefined,
        stream_url_facebook: form.stream_url_facebook || undefined,
        cover_image_url: coverImage ?? null,
        rounds: roundsPayload,
      };
      const url = isEdit ? `${BASE}/api/games/${editId}` : `${BASE}/api/games`;
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit ? common : { ...common, type: form.type };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al guardar el juego"); return; }
      toast.success(isEdit ? "Juego actualizado correctamente" : "Juego creado correctamente");
      navigate("/admin");
    } catch {
      toast.error("Error al guardar el juego");
    } finally {
      setLoading(false);
    }
  }

  if (!user?.is_admin) return null;

  return (
    <AppLayout>
      <div className="p-4 max-w-lg mx-auto">
        <div className="mb-4">
          <button onClick={() => navigate("/admin")} className="text-sm text-muted-foreground hover:text-foreground">
            ← Volver
          </button>
        </div>
        <h1 className="text-2xl font-black mb-5">{isEdit ? "Editar Juego" : "Crear Nuevo Juego"}</h1>

        {loadingGame ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título del juego</Label>
            <Input placeholder="Ej: Bingo Martes — 3 Rondas" value={form.title} onChange={e => upd("title", e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo {isEdit && <span className="text-xs text-muted-foreground">(no editable)</span>}</Label>
              <Select value={form.type} onValueChange={v => upd("type", v)} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha y hora del sorteo</Label>
              <Input type="datetime-local" value={form.draw_date} onChange={e => upd("draw_date", e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Precio cartón (Bs)</Label>
            <Input type="number" min="0.5" step="0.5" placeholder="5.00" value={form.card_price} onChange={e => upd("card_price", e.target.value)} required />
          </div>

          {/* ── Multi-round toggle ── */}
          <div className="rounded-xl border p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Multi-ronda</p>
              <p className="text-xs text-muted-foreground">Varias rondas con diferente modalidad y premio cada una</p>
            </div>
            <button
              type="button"
              onClick={() => setMultiRound(v => !v)}
              className="shrink-0 relative w-11 h-6 rounded-full transition-colors"
              style={{ background: multiRound ? "hsl(var(--primary))" : "hsl(var(--muted))" }}>
              <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ left: multiRound ? "calc(100% - 22px)" : "2px" }} />
            </button>
          </div>

          {/* ── Single-round fields (shown when multi-round OFF) ── */}
          {!multiRound && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Modalidad</Label>
                  <Select value={form.game_mode} onValueChange={v => upd("game_mode", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Máx. ganadores</Label>
                  <Input type="number" min="1" max="10" value={form.max_winners} onChange={e => upd("max_winners", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Premio (Bs)</Label>
                <Input type="number" min="1" step="0.01" placeholder="500.00" value={form.prize_amount} onChange={e => upd("prize_amount", e.target.value)} required />
              </div>
            </>
          )}

          {/* ── Multi-round config ── */}
          {multiRound && (
            <div className="space-y-2">
              <Label>Configuración de rondas</Label>
              <p className="text-xs text-muted-foreground -mt-1">Premio total (campo arriba) es informativo. Cada ronda tiene su propio premio.</p>

              <div className="space-y-1.5">
                <Label>Premio total del juego (Bs) <span className="font-normal text-muted-foreground">(referencia)</span></Label>
                <Input type="number" min="1" step="0.01" placeholder="500.00" value={form.prize_amount} onChange={e => upd("prize_amount", e.target.value)} required />
              </div>

              {rounds.map((r, i) => (
                <div key={i} className="rounded-xl border p-3 space-y-2"
                  style={{ background: "hsl(var(--muted) / 0.4)" }}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black">Ronda {i + 1}</p>
                    {rounds.length > 2 && (
                      <button type="button" onClick={() => removeRound(i)}
                        className="text-xs font-bold text-red-500 hover:text-red-400">
                        ✕ Quitar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">Modalidad</p>
                      <Select value={r.game_mode} onValueChange={v => updateRound(i, "game_mode", v)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MODE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">Premio (Bs)</p>
                      <Input className="h-9 text-xs" type="number" min="1" step="0.01" placeholder="250.00"
                        value={r.prize_amount} onChange={e => updateRound(i, "prize_amount", e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">Ganadores</p>
                      <Input className="h-9 text-xs" type="number" min="1" max="10" placeholder="1"
                        value={r.max_winners} onChange={e => updateRound(i, "max_winners", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" onClick={addRound}
                className="w-full py-2 rounded-xl border-2 border-dashed text-sm font-bold transition-colors hover:border-primary/60"
                style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                + Agregar ronda
              </button>
            </div>
          )}

          {/* Cover image */}
          <div className="space-y-2">
            <Label>Imagen de portada <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
            {coverImage ? (
              <div className="rounded-2xl overflow-hidden border relative">
                <img src={coverImage} alt="portada" className="w-full h-40 object-cover" />
                <button
                  type="button"
                  onClick={() => setCoverImage(null)}
                  className="absolute top-2 right-2 text-xs font-bold px-3 py-1.5 rounded-xl"
                  style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>
                  ✕ Quitar
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
                style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}>
                <span className="text-2xl mb-1">🖼️</span>
                <span className="text-sm font-medium">Subir imagen de portada</span>
                <span className="text-xs text-muted-foreground mt-0.5">JPG, PNG, WebP — máx. 8 MB</span>
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 8 * 1024 * 1024) { toast.error("La imagen es demasiado grande (máx. 8 MB)"); return; }
                  const reader = new FileReader();
                  reader.onload = ev => setCoverImage(ev.target?.result as string);
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }} />
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>URL YouTube (opcional)</Label>
            <Input type="url" placeholder="https://youtube.com/live/..." value={form.stream_url_youtube} onChange={e => upd("stream_url_youtube", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>URL TikTok (opcional)</Label>
            <Input type="url" placeholder="https://tiktok.com/@..." value={form.stream_url_tiktok} onChange={e => upd("stream_url_tiktok", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>URL Facebook (opcional)</Label>
            <Input type="url" placeholder="https://facebook.com/..." value={form.stream_url_facebook} onChange={e => upd("stream_url_facebook", e.target.value)} />
          </div>

          <Button type="submit" className="w-full h-12 font-bold" disabled={loading}>
            {loading ? "Guardando..." : isEdit ? "💾 Guardar cambios" : "✅ Crear Juego"}
          </Button>
        </form>
        )}
      </div>
    </AppLayout>
  );
}
