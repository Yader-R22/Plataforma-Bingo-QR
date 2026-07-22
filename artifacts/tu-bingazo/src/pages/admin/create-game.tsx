import { useEffect, useState, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useSetLayoutConfig } from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

type RoundRow = {
  game_mode: string;
  max_winners: string;
  prize_amount: string;
  prize_physical_name: string;
  prize_physical_description: string;
  predefined_winner_user_id: number | null;
  predefined_winner_name: string;
  predefined_winner_ci: string;
};

type UserResult = { id: number; full_name: string; ci: string };

const MODE_OPTIONS = [
  { value: "full_card", label: "Cartón completo" },
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
  { value: "diagonal", label: "Diagonal" },
  { value: "quina", label: "Quina" },
];

function PredefinedWinnerPicker({
  roundIndex,
  value,
  name,
  ci,
  onSelect,
  onClear,
  token,
}: {
  roundIndex: number;
  value: number | null;
  name: string;
  ci: string;
  onSelect: (user: UserResult) => void;
  onClear: () => void;
  token: string | null;
}) {
  const [query, setQuery] = useState(ci || "");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) { setQuery(ci); setResults([]); return; }
    if (!query.trim() || query.trim().length < 3) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${BASE}/api/admin/users/search?ci=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.map((u: any) => ({ id: u.id, full_name: u.full_name, ci: u.ci })));
        }
      } catch { /* ignore */ } finally {
        setSearching(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, value]);

  if (value) {
    return (
      <div className="rounded-xl p-2.5 flex items-center justify-between gap-2"
        style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
        <div className="min-w-0">
          <p className="text-[11px] font-black text-green-600">✅ Ganador predefinido</p>
          <p className="text-xs font-bold truncate">{name}</p>
          <p className="text-[10px] text-muted-foreground">CI: {ci}</p>
        </div>
        <button type="button" onClick={onClear}
          className="text-xs font-bold text-red-500 shrink-0 cursor-pointer">
          ✕ Quitar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground font-medium">Ganador predefinido (opcional)</p>
      <div className="relative">
        <Input
          className="h-9 text-xs pr-8"
          placeholder="Buscar por CI (mín. 3 dígitos)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">⟳</span>
        )}
      </div>
      {results.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ background: "hsl(var(--background))" }}>
          {results.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onSelect(u); setResults([]); setQuery(u.ci); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors border-b last:border-b-0 cursor-pointer"
            >
              <span className="font-bold">{u.full_name}</span>
              <span className="text-muted-foreground ml-1.5">CI: {u.ci}</span>
            </button>
          ))}
        </div>
      )}
      {query.trim().length >= 3 && !searching && results.length === 0 && (
        <p className="text-[10px] text-muted-foreground px-1">Sin resultados para "{query}"</p>
      )}
    </div>
  );
}

export default function CreateGamePage() {
  useSetLayoutConfig({});
  const [, navigate] = useLocation();
  const [matchEdit, editParams] = useRoute("/admin/editar-juego/:id");
  const editId = matchEdit ? editParams?.id : undefined;
  const isEdit = !!editId;

  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [loading, setLoading] = useState(false);
  const [loadingGame, setLoadingGame] = useState(isEdit);

  const [form, setForm] = useState<{
    title: string;
    prize_amount: string;
    card_price: string;
    draw_date: string;
    stream_url_youtube: string;
    stream_url_tiktok: string;
    stream_url_facebook: string;
    game_mode: string;
    max_winners: string;
    predefined_winner_user_id: number | null;
    predefined_winner_name: string;
    predefined_winner_ci: string;
  }>({
    title: "",
    prize_amount: "",
    card_price: "",
    draw_date: "",
    stream_url_youtube: "",
    stream_url_tiktok: "",
    stream_url_facebook: "",
    game_mode: "full_card",
    max_winners: "1",
    predefined_winner_user_id: null,
    predefined_winner_name: "",
    predefined_winner_ci: "",
  });

  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [prizeImage, setPrizeImage] = useState<string | null>(null);
  const [prizeType, setPrizeType] = useState<"cash" | "physical" | "mixed">("cash");
  const [prizePhysicalName, setPrizePhysicalName] = useState("");
  const [prizePhysicalDesc, setPrizePhysicalDesc] = useState("");

  const [isPrivate, setIsPrivate] = useState(false);
  const [authorizedActivators, setAuthorizedActivators] = useState<UserResult[]>([]);
  const [activatorQuery, setActivatorQuery] = useState("");
  const [activatorResults, setActivatorResults] = useState<UserResult[]>([]);
  const [activatorSearching, setActivatorSearching] = useState(false);
  const activatorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [multiRound, setMultiRound] = useState(false);
  const emptyRound = (): RoundRow => ({
    game_mode: "full_card",
    max_winners: "1",
    prize_amount: "",
    prize_physical_name: "",
    prize_physical_description: "",
    predefined_winner_user_id: null,
    predefined_winner_name: "",
    predefined_winner_ci: "",
  });
  const [rounds, setRounds] = useState<RoundRow[]>([emptyRound(), emptyRound()]);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/games/${editId}`);
        if (!res.ok) { toast.error("No se pudo cargar el juego"); navigate("/admin"); return; }
        const g = await res.json();
        setForm({
          title: g.title ?? "",
          prize_amount: String(g.prize_amount ?? ""),
          card_price: String(g.card_price ?? ""),
          draw_date: g.draw_date ? toDatetimeLocal(g.draw_date) : "",
          stream_url_youtube: g.stream_url_youtube ?? "",
          stream_url_tiktok: g.stream_url_tiktok ?? "",
          stream_url_facebook: g.stream_url_facebook ?? "",
          game_mode: g.game_mode ?? "full_card",
          max_winners: String(g.max_winners ?? "1"),
          predefined_winner_user_id: null,
          predefined_winner_name: "",
          predefined_winner_ci: "",
        });
        setCoverImage(g.cover_image_url ?? null);
        setPrizeType(g.prize_type ?? "cash");
        setPrizePhysicalName(g.prize_physical_name ?? "");
        setPrizePhysicalDesc(g.prize_physical_description ?? "");
        if (g.prize_type && g.prize_type !== "cash") {
          setPrizeImage(g.id ? `/api/games/${g.id}/prize-image` : null);
        }
        setIsPrivate(g.is_private ?? false);
        if (g.is_private) {
          try {
            const aRes = await fetch(`${BASE}/api/admin/games/${editId}/authorized-activators`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (aRes.ok) {
              const aData = await aRes.json();
              setAuthorizedActivators(aData.map((u: any) => ({ id: u.id, full_name: u.full_name, ci: u.ci })));
            }
          } catch { /* ignore */ }
        }
        if (g.rounds?.length > 1) {
          setMultiRound(true);
          setRounds(g.rounds.map((r: any) => ({
            game_mode: r.game_mode,
            max_winners: String(r.max_winners),
            prize_amount: String(r.prize_amount),
            prize_physical_name: r.prize_physical_name ?? "",
            prize_physical_description: r.prize_physical_description ?? "",
            predefined_winner_user_id: r.predefined_winner_user_id ?? null,
            predefined_winner_name: "",
            predefined_winner_ci: "",
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

  function updateRound(i: number, k: keyof RoundRow, v: any) {
    setRounds(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  }

  function addRound() {
    setRounds(rs => [...rs, emptyRound()]);
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
            prize_amount: prizeType === "physical" ? 0 : (parseFloat(r.prize_amount) || 0),
            prize_physical_name: prizeType !== "cash" ? (r.prize_physical_name || null) : null,
            prize_physical_description: prizeType !== "cash" ? (r.prize_physical_description || null) : null,
            predefined_winner_user_id: r.predefined_winner_user_id ?? null,
          }))
        : null;

      const common: Record<string, unknown> = {
        title: form.title,
        prize_amount: prizeType === "physical" ? 0 : (parseFloat(form.prize_amount) || 0),
        card_price: parseFloat(form.card_price),
        max_winners: multiRound ? 1 : parseInt(form.max_winners),
        draw_date: new Date(form.draw_date).toISOString(),
        game_mode: form.game_mode,
        stream_url_youtube: form.stream_url_youtube || undefined,
        stream_url_tiktok: form.stream_url_tiktok || undefined,
        stream_url_facebook: form.stream_url_facebook || undefined,
        cover_image_url: coverImage ?? null,
        rounds: roundsPayload,
        is_private: isPrivate,
        authorized_activator_ids: isPrivate ? authorizedActivators.map(a => a.id) : [],
        prize_type: prizeType,
        prize_physical_name: prizeType !== "cash" ? prizePhysicalName || null : null,
        prize_physical_description: prizeType !== "cash" ? prizePhysicalDesc || null : null,
        prize_image_url: prizeType !== "cash" && prizeImage && !prizeImage.startsWith("/api/") ? prizeImage : undefined,
        predefined_winner_user_id: !multiRound ? (form.predefined_winner_user_id ?? null) : null,
      };
      const url = isEdit ? `${BASE}/api/games/${editId}` : `${BASE}/api/games`;
      const method = isEdit ? "PATCH" : "POST";
      const body = common;
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
    <>
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

          <div className="space-y-1.5">
            <Label>Fecha y hora del sorteo</Label>
            <Input type="datetime-local" value={form.draw_date} onChange={e => upd("draw_date", e.target.value)} required />
          </div>

          <div className="space-y-1.5">
            <Label>Precio cartón (Bs)</Label>
            <Input type="number" min="0.5" step="0.5" placeholder="5.00" value={form.card_price} onChange={e => upd("card_price", e.target.value)} required />
          </div>

          {/* ── Tipo de premio (va primero para condicionar el resto) ── */}
          <div className="space-y-2">
            <Label>Tipo de premio</Label>
            <Select value={prizeType} onValueChange={v => setPrizeType(v as "cash" | "physical" | "mixed")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">💰 Efectivo (acreditado en billetera)</SelectItem>
                <SelectItem value="physical">📦 Premio físico (objeto)</SelectItem>
                <SelectItem value="mixed">🎁 Mixto (efectivo + objeto)</SelectItem>
              </SelectContent>
            </Select>

            {/* Monto en efectivo — solo ronda única; en multi-ronda se configura por ronda */}
            {!multiRound && prizeType !== "physical" && (
              <div className="space-y-1.5">
                <Label>Premio en efectivo (Bs){prizeType === "mixed" ? <span className="font-normal text-muted-foreground ml-1">— porción en dinero</span> : ""}</Label>
                <Input type="number" min="0" step="0.01" placeholder="500.00" value={form.prize_amount} onChange={e => upd("prize_amount", e.target.value)} required />
              </div>
            )}

            {/* Nombre, descripción e imagen del objeto — compartidos para todas las rondas */}
            {prizeType !== "cash" && (
              <div className="rounded-xl border p-3 space-y-3"
                style={{ background: "hsl(var(--muted) / 0.4)" }}>
                {multiRound && (
                  <p className="text-xs text-muted-foreground">La imagen y descripción son compartidas. El nombre del premio se configura en cada ronda.</p>
                )}
                {!multiRound && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nombre del objeto <span className="text-muted-foreground font-normal">(requerido)</span></Label>
                    <Input
                      className="h-9 text-sm"
                      placeholder="Ej: Smart TV 50 pulgadas Samsung"
                      value={prizePhysicalName}
                      onChange={e => setPrizePhysicalName(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input
                    className="h-9 text-sm"
                    placeholder="Modelo, especificaciones, color…"
                    value={prizePhysicalDesc}
                    onChange={e => setPrizePhysicalDesc(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Foto del premio <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  {prizeImage && !prizeImage.startsWith("/api/") ? (
                    <div className="rounded-xl overflow-hidden border relative">
                      <img src={prizeImage} alt="Premio" className="w-full h-32 object-cover" />
                      <button
                        type="button"
                        onClick={() => setPrizeImage(null)}
                        className="absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-lg cursor-pointer"
                        style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-24 rounded-xl border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
                      style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))" }}>
                      <span className="text-xl mb-0.5">📷</span>
                      <span className="text-xs font-medium">Subir foto del premio</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setPrizeImage(await compressImage(file, 1200));
                        e.target.value = "";
                      }} />
                    </label>
                  )}
                </div>
              </div>
            )}
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

          {/* ── Juego privado toggle ── */}
          <div className="rounded-xl border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">🔒 Juego privado</p>
                <p className="text-xs text-muted-foreground">Solo activadores autorizados pueden vender cartones</p>
              </div>
              <button
                type="button"
                onClick={() => { setIsPrivate(v => !v); if (isPrivate) { setAuthorizedActivators([]); setActivatorQuery(""); setActivatorResults([]); } }}
                className="shrink-0 relative w-11 h-6 rounded-full transition-colors"
                style={{ background: isPrivate ? "hsl(var(--primary))" : "hsl(var(--muted))" }}>
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                  style={{ left: isPrivate ? "calc(100% - 22px)" : "2px" }} />
              </button>
            </div>

            {isPrivate && (
              <div className="space-y-2 pt-1 border-t" style={{ borderColor: "hsl(var(--border))" }}>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider pt-2">Activadores autorizados</p>

                {authorizedActivators.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {authorizedActivators.map(a => (
                      <span key={a.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                        style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
                        {a.full_name} <span className="opacity-60">CI:{a.ci}</span>
                        <button type="button" className="ml-0.5 hover:opacity-60 cursor-pointer"
                          onClick={() => setAuthorizedActivators(list => list.filter(x => x.id !== a.id))}>✕</button>
                      </span>
                    ))}
                  </div>
                )}

                <Input
                  placeholder="Buscar activador por CI…"
                  value={activatorQuery}
                  onChange={e => {
                    const q = e.target.value;
                    setActivatorQuery(q);
                    if (activatorDebounceRef.current) clearTimeout(activatorDebounceRef.current);
                    if (q.trim().length < 3) { setActivatorResults([]); return; }
                    activatorDebounceRef.current = setTimeout(async () => {
                      setActivatorSearching(true);
                      try {
                        const r = await fetch(`${BASE}/api/admin/activators/search?ci=${encodeURIComponent(q.trim())}`, {
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        if (r.ok) {
                          const d = await r.json();
                          setActivatorResults(
                            (d as any[]).map(u => ({ id: u.id, full_name: u.full_name, ci: u.ci }))
                              .filter(u => !authorizedActivators.some(a => a.id === u.id))
                          );
                        }
                      } catch { /* ignore */ } finally { setActivatorSearching(false); }
                    }, 350);
                  }}
                />

                {activatorSearching && <p className="text-[11px] text-muted-foreground px-1">Buscando…</p>}
                {!activatorSearching && activatorQuery.trim().length >= 3 && activatorResults.length === 0 && (
                  <p className="text-[11px] text-muted-foreground px-1">Sin activadores para "{activatorQuery}"</p>
                )}
                {activatorResults.map(u => (
                  <button key={u.id} type="button"
                    className="w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-muted/60 transition-colors cursor-pointer"
                    onClick={() => { setAuthorizedActivators(list => [...list, u]); setActivatorResults([]); setActivatorQuery(""); }}>
                    <span className="font-medium">{u.full_name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">CI: {u.ci}</span>
                  </button>
                ))}
              </div>
            )}
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
              <div className="pt-0.5 border-t" style={{ borderColor: "hsl(var(--border))" }}>
                <PredefinedWinnerPicker
                  roundIndex={0}
                  value={form.predefined_winner_user_id}
                  name={form.predefined_winner_name}
                  ci={form.predefined_winner_ci}
                  token={token}
                  onSelect={u => setForm(f => ({ ...f, predefined_winner_user_id: u.id, predefined_winner_name: u.full_name, predefined_winner_ci: u.ci }))}
                  onClear={() => setForm(f => ({ ...f, predefined_winner_user_id: null, predefined_winner_name: "", predefined_winner_ci: "" }))}
                />
              </div>
            </>
          )}

          {/* ── Multi-round config ── */}
          {multiRound && (
            <div className="space-y-2">
              <Label>Configuración de rondas</Label>
              <p className="text-xs text-muted-foreground -mt-1">Cada ronda tiene su propia modalidad y premio.</p>

              {rounds.map((r, i) => (
                <div key={i} className="rounded-xl border p-3 space-y-2.5"
                  style={{ background: "hsl(var(--muted) / 0.4)" }}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black">Ronda {i + 1}</p>
                    {rounds.length > 2 && (
                      <button type="button" onClick={() => removeRound(i)}
                        className="text-xs font-bold text-red-500 hover:text-red-400 cursor-pointer">
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
                    {prizeType !== "physical" && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">Premio (Bs)</p>
                      <Input className="h-9 text-xs" type="number" min="0" step="0.01" placeholder="250.00"
                        value={r.prize_amount} onChange={e => updateRound(i, "prize_amount", e.target.value)} required />
                    </div>
                  )}
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">Ganadores</p>
                      <Input className="h-9 text-xs" type="number" min="1" max="10" placeholder="1"
                        value={r.max_winners} onChange={e => updateRound(i, "max_winners", e.target.value)} />
                    </div>
                  </div>

                  {/* ── Nombre del premio físico por ronda ── */}
                  {prizeType !== "cash" && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground font-medium">Nombre del premio <span className="opacity-60">(ej: Celular Samsung A15)</span></p>
                      <Input className="h-9 text-xs" placeholder="Nombre del objeto para esta ronda"
                        value={r.prize_physical_name} onChange={e => updateRound(i, "prize_physical_name", e.target.value)} />
                    </div>
                  )}

                  {/* ── Ganador predefinido ── */}
                  <div className="pt-0.5 border-t" style={{ borderColor: "hsl(var(--border))" }}>
                    <PredefinedWinnerPicker
                      roundIndex={i}
                      value={r.predefined_winner_user_id}
                      name={r.predefined_winner_name}
                      ci={r.predefined_winner_ci}
                      token={token}
                      onSelect={u => {
                        setRounds(rs => rs.map((row, idx) => idx === i
                          ? { ...row, predefined_winner_user_id: u.id, predefined_winner_name: u.full_name, predefined_winner_ci: u.ci }
                          : row
                        ));
                      }}
                      onClear={() => {
                        setRounds(rs => rs.map((row, idx) => idx === i
                          ? { ...row, predefined_winner_user_id: null, predefined_winner_name: "", predefined_winner_ci: "" }
                          : row
                        ));
                      }}
                    />
                  </div>
                </div>
              ))}

              <button type="button" onClick={addRound}
                className="w-full py-2 rounded-xl border-2 border-dashed text-sm font-bold transition-colors hover:border-primary/60 cursor-pointer"
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
                  className="absolute top-2 right-2 text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer"
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
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setCoverImage(await compressImage(file, 1200));
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
            <Input type="url" placeholder="https://facebook.com/..." value={form.stream_url_facebook || ""} onChange={e => upd("stream_url_facebook", e.target.value)} />
          </div>

          <Button type="submit" className="w-full h-12 font-bold" disabled={loading}>
            {loading ? "Guardando..." : isEdit ? "💾 Guardar cambios" : "✅ Crear Juego"}
          </Button>
        </form>
        )}
      </div>
    </>
  );
}
