import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const tabs = [
  { id: "overview", label: "📊 Resumen" },
  { id: "users", label: "👥 Usuarios" },
  { id: "games", label: "🎱 Juegos" },
  { id: "withdrawals", label: "💸 Retiros" },
  { id: "winners", label: "🏆 Ganadores" },
  { id: "logs", label: "📋 Auditoría" },
] as const;

type Tab = typeof tabs[number]["id"];

export default function AdminPage() {
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState<Tab>("overview");

  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [winners, setWinners] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [numberInput, setNumberInput] = useState<Record<number, string>>({});
  const [userSearch, setUserSearch] = useState("");
  const [payForm, setPayForm] = useState<Record<number, { proof: string; pin: string; open: boolean }>>({});

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  async function loadStats() {
    try {
      const r = await fetch(`${BASE}/api/admin/stats`, { headers: authH() });
      if (r.ok) setStats(await r.json());
    } catch {}
  }

  async function loadTab(t: Tab) {
    setLoading(true);
    try {
      if (t === "users" || t === "overview") {
        const r = await fetch(`${BASE}/api/admin/users`, { headers: authH() });
        if (r.ok) setUsers(await r.json());
      }
      if (t === "games" || t === "overview") {
        const r = await fetch(`${BASE}/api/games`, { headers: authH() });
        if (r.ok) setGames(await r.json());
      }
      if (t === "withdrawals") {
        const r = await fetch(`${BASE}/api/admin/withdrawals`, { headers: authH() });
        if (r.ok) setWithdrawals(await r.json());
      }
      if (t === "winners") {
        const r = await fetch(`${BASE}/api/games`, { headers: authH() });
        if (r.ok) {
          const gs = await r.json();
          setGames(gs);
          const g = gs.find((g: any) => g.status !== "upcoming");
          if (g) {
            const wr = await fetch(`${BASE}/api/games/${g.id}/winners`, { headers: authH() });
            if (wr.ok) setWinners(await wr.json());
          }
        }
      }
      if (t === "logs") {
        const r = await fetch(`${BASE}/api/admin/audit-logs`, { headers: authH() });
        if (r.ok) setLogs(await r.json());
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadStats(); loadTab("overview"); }, []);

  function handleTab(t: Tab) {
    setTab(t);
    loadTab(t);
  }

  async function verifyUser(userId: number, approved: boolean) {
    const r = await fetch(`${BASE}/api/admin/users/${userId}/verify`, {
      method: "POST", headers: authH(), body: JSON.stringify({ approved }),
    });
    if (r.ok) {
      toast.success(approved ? "✅ Usuario aprobado" : "Usuario rechazado");
      setUsers(us => us.map(u => u.id === userId ? { ...u, status: approved ? "active" : "rejected" } : u));
      loadStats();
    }
  }

  function openPayForm(wId: number) {
    setPayForm(pf => ({ ...pf, [wId]: { proof: "", pin: "", open: true } }));
  }

  async function markWithdrawalPaid(wId: number, method: string) {
    const form = payForm[wId];
    const body: any = {};
    if (method === "qr" && form?.proof) body.payment_proof_url = form.proof;
    if (method === "bank" && form?.pin) body.withdrawal_pin = form.pin;
    const r = await fetch(`${BASE}/api/admin/withdrawals/${wId}/mark-paid`, {
      method: "POST", headers: authH(), body: JSON.stringify(body),
    });
    if (r.ok) {
      const updated = await r.json();
      toast.success("✅ Retiro marcado como pagado");
      setWithdrawals(ws => ws.map(w => w.id === wId ? { ...w, status: "paid", payment_proof_url: updated.payment_proof_url, withdrawal_pin: updated.withdrawal_pin } : w));
      setPayForm(pf => { const n = { ...pf }; delete n[wId]; return n; });
      loadStats();
    } else {
      const d = await r.json();
      toast.error(d.error || "Error");
    }
  }

  async function validateWinner(wId: number, approved: boolean) {
    const r = await fetch(`${BASE}/api/admin/winners/${wId}/validate`, {
      method: "POST", headers: authH(), body: JSON.stringify({ approved }),
    });
    if (r.ok) {
      toast.success(approved ? "🏆 Ganador validado y saldo acreditado" : "Reclamo rechazado");
      setWinners(ws => ws.map(w => w.id === wId ? { ...w, validated: approved } : w));
    } else {
      const d = await r.json();
      toast.error(d.error || "Error");
    }
  }

  async function callNumber(gameId: number) {
    const input = numberInput[gameId];
    const num = input ? parseInt(input) : Math.floor(Math.random() * 75) + 1;
    if (num < 1 || num > 75) { toast.error("Número debe ser entre 1 y 75"); return; }
    const r = await fetch(`${BASE}/api/games/${gameId}/call-number`, {
      method: "POST", headers: authH(), body: JSON.stringify({ number: num }),
    });
    if (r.ok) {
      toast.success(`🎱 Número ${num} cantado`);
      setNumberInput(prev => ({ ...prev, [gameId]: "" }));
      setGames(gs => gs.map(g => g.id === gameId
        ? { ...g, called_numbers: [...(g.called_numbers ?? []), num] }
        : g));
    }
  }

  async function startGame(gameId: number) {
    const r = await fetch(`${BASE}/api/games/${gameId}/start`, { method: "POST", headers: authH() });
    if (r.ok) { toast.success("▶ Juego iniciado"); setGames(gs => gs.map(g => g.id === gameId ? { ...g, status: "active", called_numbers: [] } : g)); loadStats(); }
  }

  async function finishGame(gameId: number) {
    if (!confirm("¿Finalizar este juego?")) return;
    const r = await fetch(`${BASE}/api/games/${gameId}/finish`, { method: "POST", headers: authH() });
    if (r.ok) { toast.success("⏹ Juego finalizado"); setGames(gs => gs.map(g => g.id === gameId ? { ...g, status: "finished" } : g)); loadStats(); }
  }

  async function toggleFeatured(gameId: number, current: boolean) {
    const r = await fetch(`${BASE}/api/admin/games/${gameId}/featured`, {
      method: "PATCH", headers: authH(), body: JSON.stringify({ is_featured: !current }),
    });
    if (r.ok) {
      setGames(gs => gs.map(g => g.id === gameId ? { ...g, is_featured: !current } : g));
      toast.success(!current ? "⭐ Juego destacado en inicio" : "Juego removido de destacados");
    }
  }

  async function reactivateGame(gameId: number) {
    if (!confirm("¿Reactivar este juego? Volverá a estado 'Próximo' y los jugadores podrán comprar cartones.")) return;
    const r = await fetch(`${BASE}/api/games/${gameId}`, {
      method: "PATCH", headers: authH(), body: JSON.stringify({ status: "upcoming" }),
    });
    if (r.ok) {
      setGames(gs => gs.map(g => g.id === gameId ? { ...g, status: "upcoming" } : g));
      toast.success("♻ Juego reactivado");
      loadStats();
    } else {
      toast.error("No se pudo reactivar el juego");
    }
  }

  async function deleteGame(gameId: number) {
    if (!confirm("¿ELIMINAR este juego de forma permanente? Se borrarán también todos sus cartones y ganadores. Esta acción no se puede deshacer.")) return;
    const r = await fetch(`${BASE}/api/games/${gameId}`, { method: "DELETE", headers: authH() });
    if (r.ok) {
      setGames(gs => gs.filter(g => g.id !== gameId));
      toast.success("🗑 Juego eliminado");
      loadStats();
    } else {
      toast.error("No se pudo eliminar el juego");
    }
  }

  if (!user?.is_admin) {
    return (
      <AppLayout>
        <div className="p-4 text-center py-20">
          <p className="text-5xl mb-3">🔒</p>
          <p className="font-bold text-xl">Acceso denegado</p>
          <button className="btn-primary mt-6 max-w-xs mx-auto" onClick={() => navigate("/juegos")}>Volver</button>
        </div>
      </AppLayout>
    );
  }

  const filteredUsers = users.filter(u =>
    !userSearch || u.full_name.toLowerCase().includes(userSearch.toLowerCase()) || u.ci.includes(userSearch)
  );
  const pendingUsers = users.filter(u => u.status === "pending").length;
  const activeGames = games.filter(g => g.status === "active").length;
  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending").length;

  return (
    <AppLayout>
      {/* Admin header */}
      <div className="hero-bg px-4 py-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>🛡️ Panel Admin</h1>
            <p className="text-white/60 text-sm">Tu Bingazo — Control total</p>
          </div>
          <button
            onClick={() => navigate("/admin/crear-juego")}
            className="text-sm font-bold px-4 py-2 rounded-xl"
            style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
            + Crear juego
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 px-4 py-3" style={{ background: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))" }}>
          {[
            { label: "Usuarios", value: stats.total_users, color: "hsl(var(--primary))", alert: pendingUsers > 0 ? `${pendingUsers} pendientes` : null },
            { label: "En vivo", value: stats.active_games, color: "#16a34a" },
            { label: "Retiros pend.", value: stats.pending_withdrawals_count, color: "hsl(42 98% 40%)", alert: pendingWithdrawals > 0 ? "requieren acción" : null },
            { label: "Ingresos", value: `Bs ${(stats.total_revenue ?? 0).toFixed(0)}`, color: "hsl(var(--primary))" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="font-black text-xl" style={{ color: s.color, fontFamily: "'Poppins', sans-serif" }}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              {s.alert && <p className="text-[9px] font-bold" style={{ color: "hsl(0 75% 50%)" }}>{s.alert}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex overflow-x-auto px-4 py-2 gap-1.5" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => handleTab(t.id)}
            className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
            style={{
              background: tab === t.id ? "hsl(var(--primary))" : "transparent",
              color: tab === t.id ? "white" : "hsl(var(--foreground))",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-3 pb-24">
        {loading && <div className="flex items-center justify-center py-10 text-muted-foreground"><div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />Cargando...</div>}

        {/* OVERVIEW */}
        {tab === "overview" && !loading && (
          <div className="space-y-4">
            {/* Active games */}
            {games.filter(g => g.status === "active").map(g => (
              <div key={g.id} className="rounded-2xl p-4 text-white"
                style={{ background: "linear-gradient(135deg, #1a0050, #3b00b8)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="live-badge"><div className="live-dot" />EN VIVO</div>
                  <span className="text-white/70 text-sm">{g.title}</span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="number" min="1" max="75" placeholder="Número (1-75)"
                    className="flex-1 bg-white/10 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm font-bold border border-white/20 outline-none"
                    value={numberInput[g.id] ?? ""}
                    onChange={e => setNumberInput(prev => ({ ...prev, [g.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && callNumber(g.id)}
                  />
                  <button onClick={() => callNumber(g.id)}
                    className="px-4 py-2 rounded-xl font-bold text-sm"
                    style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
                    🎱 Cantar
                  </button>
                </div>
                <div className="text-white/60 text-xs">
                  {g.called_numbers?.length ?? 0} números cantados · Bs {g.prize_amount} premio · {g.participant_count} jugadores
                </div>
                <button onClick={() => finishGame(g.id)} className="mt-2 text-xs text-red-300 underline">⏹ Finalizar juego</button>
              </div>
            ))}

            {/* Pending users alert */}
            {users.filter(u => u.status === "pending").length > 0 && (
              <div className="rounded-2xl p-4 flex items-center justify-between"
                style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
                <div>
                  <p className="font-bold">⏳ {users.filter(u => u.status === "pending").length} usuarios pendientes de verificación</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Revisa las fotos de CI para aprobar o rechazar</p>
                </div>
                <button onClick={() => handleTab("users")} className="text-xs font-bold px-3 py-1.5 rounded-xl"
                  style={{ background: "hsl(var(--primary))", color: "white" }}>Ver →</button>
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground">Próximos juegos</p>
                <p className="font-black text-2xl" style={{ color: "hsl(var(--primary))" }}>
                  {games.filter(g => g.status === "upcoming").length}
                </p>
              </div>
              <div className="bg-card border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground">Juegos finalizados</p>
                <p className="font-black text-2xl" style={{ color: "hsl(var(--foreground))" }}>
                  {games.filter(g => g.status === "finished").length}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* USERS */}
        {tab === "users" && !loading && (
          <div className="space-y-3">
            <input className="input-field" placeholder="🔍 Buscar por nombre o CI..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            {filteredUsers.map(u => (
              <div key={u.id} className="bg-card border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="avatar" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0"
                        style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}>
                        {u.full_name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-bold">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground">CI: {u.ci}</p>
                      <p className="text-xs text-muted-foreground">{u.department} · {u.phone}</p>
                      <p className="text-xs font-bold mt-0.5" style={{ color: "hsl(var(--primary))" }}>Saldo: Bs {parseFloat(u.balance).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {u.status === "pending" && (
                      <>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "hsl(42 98% 52% / 0.12)", color: "hsl(42 98% 35%)" }}>Pendiente</span>
                        {(u.id_photo_front_url || u.id_photo_back_url) && (
                          <div className="flex gap-1">
                            {u.id_photo_front_url && <a href={u.id_photo_front_url} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "hsl(var(--primary))" }}>CI anv.</a>}
                            {u.id_photo_back_url && <a href={u.id_photo_back_url} target="_blank" rel="noopener noreferrer" className="text-xs underline ml-1" style={{ color: "hsl(var(--primary))" }}>CI rev.</a>}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <button onClick={() => verifyUser(u.id, true)}
                            className="px-3 py-1 rounded-xl text-xs font-bold text-white"
                            style={{ background: "#16a34a" }}>✓ Aprobar</button>
                          <button onClick={() => verifyUser(u.id, false)}
                            className="px-3 py-1 rounded-xl text-xs font-bold text-white"
                            style={{ background: "hsl(0 75% 50%)" }}>✗ Rechazar</button>
                        </div>
                      </>
                    )}
                    {u.status === "active" && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "hsl(142 70% 45% / 0.12)", color: "hsl(142 70% 30%)" }}>✓ Activo</span>
                        <button onClick={() => verifyUser(u.id, false)}
                          className="text-xs text-muted-foreground underline">Suspender</button>
                      </div>
                    )}
                    {u.status === "rejected" && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "hsl(0 75% 52% / 0.12)", color: "hsl(0 75% 40%)" }}>Rechazado</span>
                        <button onClick={() => verifyUser(u.id, true)}
                          className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>Reactivar</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && <p className="text-center text-muted-foreground py-8">Sin usuarios encontrados</p>}
          </div>
        )}

        {/* GAMES */}
        {tab === "games" && !loading && (
          <div className="space-y-3">
            {games.map(g => (
              <div key={g.id} className="bg-card border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold">{g.title}</span>
                      {g.is_featured && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "hsl(42 98% 52% / 0.15)", color: "hsl(42 98% 35%)" }}>⭐ Destacado</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Bs {g.prize_amount} premio · {g.participant_count} participantes · {new Date(g.draw_date).toLocaleDateString("es-BO")}
                    </p>
                    {g.status === "active" && (
                      <p className="text-xs mt-1" style={{ color: "hsl(var(--primary))" }}>
                        {g.called_numbers?.length ?? 0} números cantados de 75
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {g.status === "upcoming" && (
                      <>
                        <button onClick={() => startGame(g.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                          style={{ background: "#16a34a" }}>▶ Iniciar</button>
                        <button onClick={() => navigate(`/admin/editar-juego/${g.id}`)}
                          className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>✏ Editar</button>
                        <button onClick={() => toggleFeatured(g.id, g.is_featured)}
                          className="text-xs font-bold" style={{ color: "hsl(42 98% 40%)" }}>
                          {g.is_featured ? "Quitar destacado" : "⭐ Destacar"}
                        </button>
                        <button onClick={() => deleteGame(g.id)}
                          className="text-xs font-bold text-red-500">🗑 Eliminar</button>
                      </>
                    )}
                    {g.status === "active" && (
                      <div className="space-y-1.5">
                        <div className="live-badge"><div className="live-dot" />EN VIVO</div>
                        <div className="flex gap-1">
                          <input type="number" min="1" max="75" placeholder="1-75"
                            className="w-16 border rounded-lg px-2 py-1 text-xs font-bold text-center"
                            value={numberInput[g.id] ?? ""}
                            onChange={e => setNumberInput(prev => ({ ...prev, [g.id]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && callNumber(g.id)}
                          />
                          <button onClick={() => callNumber(g.id)}
                            className="px-2 py-1 rounded-lg text-xs font-bold text-white"
                            style={{ background: "hsl(var(--primary))" }}>🎱</button>
                        </div>
                        <button onClick={() => finishGame(g.id)}
                          className="text-xs text-red-500 underline">Finalizar</button>
                      </div>
                    )}
                    {g.status === "finished" && (
                      <>
                        <span className="text-xs px-2 py-0.5 rounded-full border"
                          style={{ color: "hsl(var(--muted-foreground))" }}>Finalizado</span>
                        <button onClick={() => reactivateGame(g.id)}
                          className="text-xs font-bold" style={{ color: "#16a34a" }}>♻ Reactivar</button>
                        <button onClick={() => deleteGame(g.id)}
                          className="text-xs font-bold text-red-500">🗑 Eliminar</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {games.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">Sin juegos creados</p>
                <button className="btn-primary max-w-xs mx-auto" onClick={() => navigate("/admin/crear-juego")}>Crear primer juego</button>
              </div>
            )}
          </div>
        )}

        {/* WITHDRAWALS */}
        {tab === "withdrawals" && !loading && (
          <div className="space-y-3">
            {withdrawals.map(w => {
              let methodInfo: any = {};
              try { methodInfo = JSON.parse(w.bank_account_info ?? "{}"); } catch {}
              return (
                <div key={w.id} className="bg-card border rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-xl" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        Bs {parseFloat(w.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(w.created_at).toLocaleDateString("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {w.status === "pending" ? (
                      <span className="text-xs font-bold px-3 py-1 rounded-full shrink-0"
                        style={{ background: "hsl(42 98% 50% / 0.15)", color: "hsl(36 80% 38%)" }}>⏳ Pendiente</span>
                    ) : w.status === "paid" ? (
                      <span className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{ background: "hsl(142 70% 45% / 0.12)", color: "hsl(142 70% 30%)" }}>✓ Pagado</span>
                    ) : (
                      <span className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{ background: "hsl(0 75% 52% / 0.12)", color: "hsl(0 75% 40%)" }}>Rechazado</span>
                    )}
                  </div>

                  {/* Method details */}
                  {methodInfo.method === "qr" ? (
                    <div className="space-y-2">
                      <p className="text-xs font-bold">📱 Retiro por QR — escanea para pagar</p>
                      {w.bank_qr_url && (
                        <img src={w.bank_qr_url} alt="QR pago" className="max-w-[180px] rounded-xl border" />
                      )}
                      {w.status === "pending" && (
                        payForm[w.id]?.open ? (
                          <div className="space-y-2 pt-1">
                            <p className="text-xs font-bold text-muted-foreground">URL del comprobante (opcional)</p>
                            <input className="input-field text-xs py-2"
                              placeholder="https://... o pega imagen base64"
                              value={payForm[w.id]?.proof ?? ""}
                              onChange={e => setPayForm(pf => ({ ...pf, [w.id]: { ...pf[w.id], proof: e.target.value } }))} />
                            <div className="flex gap-2">
                              <button onClick={() => markWithdrawalPaid(w.id, "qr")}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                                style={{ background: "#16a34a" }}>✓ Confirmar pago</button>
                              <button onClick={() => setPayForm(pf => { const n = { ...pf }; delete n[w.id]; return n; })}
                                className="px-3 py-2 rounded-xl text-xs font-bold border">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => openPayForm(w.id)}
                            className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                            style={{ background: "#16a34a" }}>✓ Marcar pagado</button>
                        )
                      )}
                      {w.status === "paid" && w.payment_proof_url && (
                        <a href={w.payment_proof_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs underline" style={{ color: "hsl(var(--primary))" }}>
                          🧾 Ver comprobante
                        </a>
                      )}
                    </div>
                  ) : methodInfo.bank ? (
                    <div className="space-y-2">
                      <div className="rounded-xl p-3 space-y-1" style={{ background: "hsl(var(--muted))" }}>
                        <p className="text-xs font-bold">🏧 Cajero — {methodInfo.bank}</p>
                        <p className="text-xs"><strong>Nombre:</strong> {methodInfo.full_name}</p>
                        <p className="text-xs"><strong>CI:</strong> {methodInfo.ci}</p>
                        {methodInfo.whatsapp && <p className="text-xs"><strong>WhatsApp:</strong> {methodInfo.whatsapp}</p>}
                      </div>
                      {w.status === "pending" && (
                        payForm[w.id]?.open ? (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-muted-foreground">🔑 PIN de retiro para el usuario</p>
                            <input className="input-field text-sm font-mono text-center tracking-[0.2em]"
                              placeholder="Ej: 7482"
                              value={payForm[w.id]?.pin ?? ""}
                              onChange={e => setPayForm(pf => ({ ...pf, [w.id]: { ...pf[w.id], pin: e.target.value } }))} />
                            <div className="flex gap-2">
                              <button onClick={() => markWithdrawalPaid(w.id, "bank")}
                                className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                                style={{ background: "#16a34a" }}>✓ Confirmar + enviar PIN</button>
                              <button onClick={() => setPayForm(pf => { const n = { ...pf }; delete n[w.id]; return n; })}
                                className="px-3 py-2 rounded-xl text-xs font-bold border">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => openPayForm(w.id)}
                            className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                            style={{ background: "#16a34a" }}>✓ Marcar pagado + dar PIN</button>
                        )
                      )}
                      {w.status === "paid" && w.withdrawal_pin && (
                        <div className="flex items-center gap-2 rounded-xl px-3 py-2"
                          style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
                          <span>🔑</span>
                          <span className="text-xs text-muted-foreground">PIN enviado:</span>
                          <span className="font-black tracking-widest" style={{ color: "hsl(var(--primary))" }}>{w.withdrawal_pin}</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {withdrawals.length === 0 && <p className="text-center text-muted-foreground py-8">Sin solicitudes de retiro</p>}
          </div>
        )}

        {/* WINNERS */}
        {tab === "winners" && !loading && (
          <div className="space-y-3">
            {winners.map(w => (
              <div key={w.id} className="bg-card border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{w.user_name}</p>
                    <p className="text-xs text-muted-foreground">Lugar #{w.place} · Cartón #{w.card_id} · Juego #{w.game_id}</p>
                    <p className="font-black text-xl mt-1 prize-text" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      Bs {parseFloat(w.prize_amount).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    {w.validated ? (
                      <span className="text-xs font-bold px-2 py-1 rounded-full"
                        style={{ background: "hsl(142 70% 45% / 0.12)", color: "hsl(142 70% 30%)" }}>✅ Validado</span>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={() => validateWinner(w.id, true)}
                          className="px-3 py-1 rounded-xl text-xs font-bold text-white"
                          style={{ background: "#16a34a" }}>✓ Validar</button>
                        <button onClick={() => validateWinner(w.id, false)}
                          className="px-3 py-1 rounded-xl text-xs font-bold text-white"
                          style={{ background: "hsl(0 75% 50%)" }}>✗</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {winners.length === 0 && <p className="text-center text-muted-foreground py-8">Sin ganadores registrados aún</p>}
          </div>
        )}

        {/* AUDIT LOGS */}
        {tab === "logs" && !loading && (
          <div className="space-y-2">
            {logs.map(l => (
              <div key={l.id} className="bg-card border rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <code className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}>
                      {l.action}
                    </code>
                    <p className="text-xs text-muted-foreground mt-1">
                      Usuario #{l.user_id ?? "—"} · {l.ip_address ?? "—"}
                    </p>
                    {l.details && (
                      <p className="text-xs text-muted-foreground truncate max-w-[220px] mt-0.5">
                        {JSON.stringify(l.details)}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    {new Date(l.created_at).toLocaleTimeString("es-BO")}
                  </p>
                </div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-center text-muted-foreground py-8">Sin registros de auditoría</p>}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
