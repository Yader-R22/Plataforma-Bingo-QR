import { useState } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useAdminData(endpoint: string) {
  const token = useAuthStore(s => s.token);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  return { data, loading, load };
}

export default function AdminPage() {
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState<"users" | "withdrawals" | "games" | "winners" | "logs">("users");
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [winners, setWinners] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState<Record<string, boolean>>({});

  const authH = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function loadTab(t: typeof tab) {
    if (dataLoaded[t]) return;
    setLoading(true);
    try {
      if (t === "users") {
        const r = await fetch(`${BASE}/api/admin/users`, { headers: authH });
        if (r.ok) setUsers(await r.json());
      } else if (t === "withdrawals") {
        const r = await fetch(`${BASE}/api/admin/withdrawals`, { headers: authH });
        if (r.ok) setWithdrawals(await r.json());
      } else if (t === "winners") {
        const r = await fetch(`${BASE}/api/games`, { headers: authH });
        if (r.ok) {
          const gs = await r.json();
          setGames(gs);
          // Load winners for first active/finished game
          const g = gs.find((g: any) => g.status !== "upcoming");
          if (g) {
            const wr = await fetch(`${BASE}/api/games/${g.id}/winners`, { headers: authH });
            if (wr.ok) setWinners(await wr.json());
          }
        }
      } else if (t === "games") {
        const r = await fetch(`${BASE}/api/games`, { headers: authH });
        if (r.ok) setGames(await r.json());
      } else if (t === "logs") {
        const r = await fetch(`${BASE}/api/admin/audit-logs`, { headers: authH });
        if (r.ok) setLogs(await r.json());
      }
      setDataLoaded(d => ({ ...d, [t]: true }));
    } catch {}
    setLoading(false);
  }

  async function verifyUser(userId: number, approved: boolean) {
    const r = await fetch(`${BASE}/api/admin/users/${userId}/verify`, {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ approved }),
    });
    if (r.ok) {
      toast.success(approved ? "Usuario aprobado" : "Usuario rechazado");
      setUsers(us => us.map(u => u.id === userId ? { ...u, status: approved ? "active" : "rejected" } : u));
    }
  }

  async function markWithdrawalPaid(wId: number) {
    const r = await fetch(`${BASE}/api/admin/withdrawals/${wId}/mark-paid`, {
      method: "POST",
      headers: authH,
    });
    if (r.ok) {
      toast.success("Retiro marcado como pagado");
      setWithdrawals(ws => ws.map(w => w.id === wId ? { ...w, status: "paid" } : w));
    } else {
      const d = await r.json();
      toast.error(d.error || "Error");
    }
  }

  async function validateWinner(wId: number, approved: boolean) {
    const r = await fetch(`${BASE}/api/admin/winners/${wId}/validate`, {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ approved }),
    });
    if (r.ok) {
      toast.success(approved ? "Ganador validado y saldo acreditado" : "Reclamo rechazado");
    } else {
      const d = await r.json();
      toast.error(d.error || "Error");
    }
  }

  async function callNumber(gameId: number) {
    const num = Math.floor(Math.random() * 75) + 1;
    const r = await fetch(`${BASE}/api/games/${gameId}/call-number`, {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ number: num }),
    });
    if (r.ok) toast.success(`Número ${num} cantado`);
  }

  async function startGame(gameId: number) {
    const r = await fetch(`${BASE}/api/games/${gameId}/start`, { method: "POST", headers: authH });
    if (r.ok) {
      toast.success("Juego iniciado");
      setGames(gs => gs.map(g => g.id === gameId ? { ...g, status: "active" } : g));
    }
  }

  async function finishGame(gameId: number) {
    const r = await fetch(`${BASE}/api/games/${gameId}/finish`, { method: "POST", headers: authH });
    if (r.ok) {
      toast.success("Juego finalizado");
      setGames(gs => gs.map(g => g.id === gameId ? { ...g, status: "finished" } : g));
    }
  }

  async function loadStats() {
    const r = await fetch(`${BASE}/api/admin/stats`, { headers: authH });
    if (r.ok) setStats(await r.json());
  }

  // Load stats on mount
  if (!stats && !loading) loadStats();

  function handleTabChange(t: typeof tab) {
    setTab(t);
    loadTab(t);
  }

  if (!user?.is_admin) {
    return (
      <AppLayout>
        <div className="p-4 text-center py-16">
          <p className="text-4xl mb-2">🔒</p>
          <p className="font-semibold">Acceso denegado</p>
          <Button className="mt-4" onClick={() => navigate("/juegos")}>Volver</Button>
        </div>
      </AppLayout>
    );
  }

  const tabs = [
    { id: "users", label: "Usuarios" },
    { id: "withdrawals", label: "Retiros" },
    { id: "games", label: "Juegos" },
    { id: "winners", label: "Ganadores" },
    { id: "logs", label: "Auditoría" },
  ] as const;

  return (
    <AppLayout>
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black">Panel Admin</h1>
          <Button size="sm" variant="outline" onClick={() => navigate("/admin/crear-juego")}>+ Juego</Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-card border rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-primary">{stats.total_users}</p>
              <p className="text-xs text-muted-foreground">Usuarios</p>
            </div>
            <div className="bg-card border rounded-2xl p-3 text-center">
              <p className="text-2xl font-black text-green-600">{stats.active_games}</p>
              <p className="text-xs text-muted-foreground">En vivo</p>
            </div>
            <div className="bg-card border rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-secondary">{stats.pending_withdrawals_count}</p>
              <p className="text-xs text-muted-foreground">Retiros pend.</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto mb-4 pb-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
                tab === t.id ? "bg-primary text-white border-primary" : "bg-card border text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Users */}
        {tab === "users" && (
          <div className="space-y-2">
            {loading && <div className="h-20 bg-muted animate-pulse rounded-xl" />}
            {users.map(u => (
              <div key={u.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground">CI: {u.ci} • {u.department} • {u.phone}</p>
                    <p className="text-xs text-muted-foreground">Saldo: Bs {u.balance}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {u.status === "pending" && (
                      <>
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">Pendiente</Badge>
                        <div className="flex gap-1 mt-1">
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => verifyUser(u.id, true)}>✓</Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => verifyUser(u.id, false)}>✗</Button>
                        </div>
                      </>
                    )}
                    {u.status === "active" && <Badge className="bg-green-500 text-white">Activo</Badge>}
                    {u.status === "rejected" && <Badge variant="destructive">Rechazado</Badge>}
                  </div>
                </div>
              </div>
            ))}
            {!loading && users.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Sin usuarios</p>
            )}
          </div>
        )}

        {/* Withdrawals */}
        {tab === "withdrawals" && (
          <div className="space-y-2">
            {loading && <div className="h-20 bg-muted animate-pulse rounded-xl" />}
            {withdrawals.map(w => (
              <div key={w.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-lg">Bs {parseFloat(w.amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Usuario #{w.user_id} • {w.method === "cash" ? "Efectivo" : "Transferencia"}</p>
                    {w.bank_account_info && <p className="text-xs text-muted-foreground">{w.bank_account_info}</p>}
                    <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString("es-BO")}</p>
                  </div>
                  <div>
                    {w.status === "pending" ? (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => markWithdrawalPaid(w.id)}>
                        Marcar pagado
                      </Button>
                    ) : w.status === "paid" ? (
                      <Badge className="bg-green-500 text-white">Pagado</Badge>
                    ) : (
                      <Badge variant="destructive">Rechazado</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!loading && withdrawals.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Sin retiros</p>
            )}
          </div>
        )}

        {/* Games */}
        {tab === "games" && (
          <div className="space-y-2">
            {loading && <div className="h-20 bg-muted animate-pulse rounded-xl" />}
            {games.map(g => (
              <div key={g.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{g.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Bs {g.prize_amount} • {g.participant_count} participantes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(g.draw_date).toLocaleDateString("es-BO")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {g.status === "upcoming" && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => startGame(g.id)}>
                        ▶ Iniciar
                      </Button>
                    )}
                    {g.status === "active" && (
                      <div className="flex flex-col gap-1">
                        <Badge className="bg-green-500 text-white animate-pulse">EN VIVO</Badge>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => callNumber(g.id)}>
                          🎱 Cantar nº
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => finishGame(g.id)}>
                          ⏹ Finalizar
                        </Button>
                      </div>
                    )}
                    {g.status === "finished" && <Badge variant="outline">Finalizado</Badge>}
                  </div>
                </div>
              </div>
            ))}
            {!loading && games.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-3">Sin juegos creados</p>
                <Button onClick={() => navigate("/admin/crear-juego")}>Crear primer juego</Button>
              </div>
            )}
          </div>
        )}

        {/* Winners */}
        {tab === "winners" && (
          <div className="space-y-2">
            {loading && <div className="h-20 bg-muted animate-pulse rounded-xl" />}
            {winners.map(w => (
              <div key={w.id} className="bg-card border rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{w.user_name} #{w.place}°</p>
                    <p className="text-lg font-black text-secondary">Bs {parseFloat(w.prize_amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Cartón #{w.card_id} • Juego #{w.game_id}</p>
                  </div>
                  <div>
                    {w.validated ? (
                      <Badge className="bg-green-500 text-white">✅ Validado</Badge>
                    ) : (
                      <div className="flex gap-1">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => validateWinner(w.id, true)}>✓</Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => validateWinner(w.id, false)}>✗</Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!loading && winners.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Sin ganadores registrados</p>
            )}
          </div>
        )}

        {/* Audit logs */}
        {tab === "logs" && (
          <div className="space-y-2">
            {loading && <div className="h-20 bg-muted animate-pulse rounded-xl" />}
            {logs.map(l => (
              <div key={l.id} className="bg-card border rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <code className="text-xs font-mono text-primary">{l.action}</code>
                    <p className="text-xs text-muted-foreground">
                      Usuario #{l.user_id ?? "—"} • {l.ip_address ?? "—"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    {new Date(l.created_at).toLocaleTimeString("es-BO")}
                  </p>
                </div>
              </div>
            ))}
            {!loading && logs.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Sin registros</p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
