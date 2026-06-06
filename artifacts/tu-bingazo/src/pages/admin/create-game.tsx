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
      } catch {
        toast.error("Error al cargar el juego");
        navigate("/admin");
      } finally {
        setLoadingGame(false);
      }
    })();
  }, [isEdit, editId]);

  function upd(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const common = {
        title: form.title,
        prize_amount: parseFloat(form.prize_amount),
        card_price: parseFloat(form.card_price),
        max_winners: parseInt(form.max_winners),
        draw_date: new Date(form.draw_date).toISOString(),
        game_mode: form.game_mode,
        stream_url_youtube: form.stream_url_youtube || undefined,
        stream_url_tiktok: form.stream_url_tiktok || undefined,
        stream_url_facebook: form.stream_url_facebook || undefined,
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
            <Input placeholder="Ej: Bingo Diario — Miércoles" value={form.title} onChange={e => upd("title", e.target.value)} required />
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
              <Label>Modalidad</Label>
              <Select value={form.game_mode} onValueChange={v => upd("game_mode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_card">Cartón completo</SelectItem>
                  <SelectItem value="horizontal">Horizontal</SelectItem>
                  <SelectItem value="vertical">Vertical</SelectItem>
                  <SelectItem value="diagonal">Diagonal</SelectItem>
                  <SelectItem value="quina">Quina</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Premio (Bs)</Label>
              <Input type="number" min="1" step="0.01" placeholder="500.00" value={form.prize_amount} onChange={e => upd("prize_amount", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Precio cartón (Bs)</Label>
              <Input type="number" min="0.5" step="0.5" placeholder="5.00" value={form.card_price} onChange={e => upd("card_price", e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha y hora del sorteo</Label>
              <Input type="datetime-local" value={form.draw_date} onChange={e => upd("draw_date", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Máx. ganadores</Label>
              <Input type="number" min="1" max="10" value={form.max_winners} onChange={e => upd("max_winners", e.target.value)} />
            </div>
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
