import { useState } from "react";
import { useLocation } from "wouter";
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

export default function CreateGamePage() {
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [loading, setLoading] = useState(false);

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

  function upd(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = {
        ...form,
        prize_amount: parseFloat(form.prize_amount),
        card_price: parseFloat(form.card_price),
        max_winners: parseInt(form.max_winners),
        draw_date: new Date(form.draw_date).toISOString(),
        stream_url_youtube: form.stream_url_youtube || undefined,
        stream_url_tiktok: form.stream_url_tiktok || undefined,
        stream_url_facebook: form.stream_url_facebook || undefined,
      };
      const res = await fetch(`${BASE}/api/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al crear juego"); return; }
      toast.success("Juego creado correctamente");
      navigate("/admin");
    } catch {
      toast.error("Error al crear el juego");
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
        <h1 className="text-2xl font-black mb-5">Crear Nuevo Juego</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título del juego</Label>
            <Input placeholder="Ej: Bingo Diario — Miércoles" value={form.title} onChange={e => upd("title", e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => upd("type", v)}>
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
            {loading ? "Creando..." : "✅ Crear Juego"}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
