import { useEffect, useCallback, useState } from "react";
import { useLocation } from "wouter";
import { useListMyCards, getListMyCardsQueryKey, useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { useSetLayoutConfig } from "@/components/AppLayout";
import { useAuthStore } from "@/hooks/useAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TYPE_EMOJI: Record<string, string> = {
  daily: "📅",
  weekly: "🏆",
  monthly: "👑",
};

const TYPE_LABEL: Record<string, string> = {
  daily: "Sorteo diario",
  weekly: "Sorteo semanal",
  monthly: "Sorteo mensual",
};

const MODE_LABEL: Record<string, string> = {
  full_card: "Cartón completo",
  horizontal: "Línea horizontal",
  vertical: "Línea vertical",
  diagonal: "Diagonal",
  quina: "Quina",
};

interface ManualPaymentRequest {
  id: number;
  game_id: number;
  game_title: string | null;
  quantity: number;
  expected_amount: number;
  receipt_url: string | null;
  status: "pending" | "approved" | "rejected";
  admin_notes: string | null;
  created_at: string;
}

export default function MyCardsPage() {
  const [, navigate] = useLocation();
  useSetLayoutConfig({ hideTopBar: true });
  const token = useAuthStore(s => s.token);
  const { data: rawCards, isLoading, refetch: refetchCards } = useListMyCards(undefined, {
    query: {
      queryKey: getListMyCardsQueryKey(),
      staleTime: 30_000,
      gcTime: 2 * 60 * 60 * 1000,
      refetchInterval: 8_000,
    },
  });
  const { data: games = [], refetch: refetchGames } = useListGames(undefined, {
    query: {
      queryKey: getListGamesQueryKey(),
      staleTime: 60_000,
      gcTime: 2 * 60 * 60 * 1000,
      refetchInterval: 8_000,
    },
  });
  const [manualRequests, setManualRequests] = useState<ManualPaymentRequest[]>([]);
  const [receiptLightbox, setReceiptLightbox] = useState<string | null>(null);

  const authH = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  const fetchManualRequests = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${BASE}/api/manual-payments/my`, { headers: authH() });
      if (r.ok) setManualRequests(await r.json());
    } catch {}
  }, [token]);

  useEffect(() => { void fetchManualRequests(); }, [fetchManualRequests]);

  useEffect(() => {
    const iv = setInterval(() => { void fetchManualRequests(); }, 15_000);
    return () => clearInterval(iv);
  }, [fetchManualRequests]);

  const cards = (rawCards as any[] ?? []).filter((c: any) =>
    c.payment_status === "paid" && c.status !== "expired"
  );

  const silentCheck = useCallback(async (checkoutId: string) => {
    if (!token || !checkoutId) return;
    try {
      const res = await fetch(`${BASE}/api/payments/${checkoutId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "completed") {
          void refetchCards();
          void refetchGames();
        }
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    const pending = (rawCards as any[] ?? []).filter(
      (c: any) => c.payment_status === "pending" && c.checkout_id
    );
    const seen = new Set<string>();
    pending.forEach((c: any, i: number) => {
      const id: string = c.checkout_id;
      if (seen.has(id)) return;
      seen.add(id);
      setTimeout(() => void silentCheck(id), i * 300);
    });
  }, [rawCards, silentCheck]);

  const gamesById = new Map<number, any>((games as any[]).map((g: any) => [g.id, g]));

  const groupsMap = new Map<number, { game: any; cards: any[]; hasWinner: boolean }>();
  for (const card of cards) {
    const game = gamesById.get(card.game_id);
    if (!game || game.status === "finished") continue;
    if (!groupsMap.has(card.game_id)) {
      groupsMap.set(card.game_id, { game, cards: [], hasWinner: false });
    }
    const grp = groupsMap.get(card.game_id)!;
    grp.cards.push(card);
    if (card.status === "winner") grp.hasWinner = true;
  }
  const groups = Array.from(groupsMap.values());

  const pendingManual = manualRequests.filter(r => {
    const game = gamesById.get(r.game_id);
    if (!game || game.status === "finished") return false;
    return r.status === "pending" || r.status === "rejected";
  });

  const isEmpty = !isLoading && groups.length === 0 && pendingManual.length === 0;

  return (
    <>
      {/* Receipt lightbox */}
      {receiptLightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={() => setReceiptLightbox(null)}>
          <button onClick={() => setReceiptLightbox(null)}
            className="absolute top-4 right-4 text-white text-3xl font-bold leading-none opacity-80">✕</button>
          <p className="absolute bottom-6 left-0 right-0 text-center text-white/50 text-xs">Toca fuera para cerrar</p>
          <img src={receiptLightbox} alt="Comprobante"
            className="rounded-2xl object-contain"
            style={{ maxHeight: "90vh", maxWidth: "90vw" }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Header */}
      <div className="hero-bg px-4 py-5 text-white">
        <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>🃏 Mis Cartones</h1>
        <p className="text-white/60 text-sm">
          {cards.length} cartón{cards.length !== 1 ? "es" : ""} en {groups.length} juego{groups.length !== 1 ? "s" : ""}
          {pendingManual.length > 0 && ` · ${pendingManual.length} pago${pendingManual.length !== 1 ? "s" : ""} pendiente${pendingManual.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      <div className="p-4 max-w-xl mx-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-36 bg-muted animate-pulse rounded-3xl" />)}
          </div>
        ) : isEmpty ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-6xl mb-4">🎱</div>
            <p className="font-black text-lg">Sin cartones activos</p>
            <p className="text-sm mt-1 mb-6">Compra cartones en un juego para participar</p>
            <button
              className="btn-primary max-w-xs mx-auto"
              onClick={() => navigate("/juego")}
            >Ver juegos disponibles</button>
          </div>
        ) : (
          <div className="space-y-4">

            {/* ── Pagos QR pendientes ───────────────────────────────── */}
            {pendingManual.map((req) => {
              const isRejected = req.status === "rejected";
              return (
                <div key={`mp-${req.id}`} className="rounded-3xl overflow-hidden shadow-md"
                  style={{
                    background: "hsl(var(--card))",
                    border: `1.5px solid ${isRejected ? "hsl(0 75% 78%)" : "hsl(42 98% 72%)"}`,
                  }}>

                  {/* Franja de estado */}
                  <div className="px-4 py-3 flex items-center gap-3"
                    style={{
                      background: isRejected
                        ? "linear-gradient(135deg, hsl(0 75% 96%), hsl(0 65% 93%))"
                        : "linear-gradient(135deg, hsl(42 98% 95%), hsl(36 90% 91%))",
                    }}>
                    <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-lg"
                      style={{
                        background: isRejected ? "hsl(0 75% 88%)" : "hsl(42 98% 85%)",
                      }}>
                      {isRejected ? "❌" : "⏳"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black leading-tight"
                        style={{ color: isRejected ? "hsl(0 75% 35%)" : "hsl(36 80% 30%)" }}>
                        {isRejected ? "Pago rechazado" : "En verificación"}
                      </p>
                      <p className="text-xs mt-0.5"
                        style={{ color: isRejected ? "hsl(0 75% 48%)" : "hsl(36 80% 40%)" }}>
                        {isRejected
                          ? "El administrador rechazó este pago"
                          : "Revisando tu comprobante..."}
                      </p>
                    </div>
                    {req.receipt_url && (
                      <button
                        className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1"
                        style={{
                          background: isRejected ? "hsl(0 75% 88%)" : "hsl(42 98% 85%)",
                          color: isRejected ? "hsl(0 75% 35%)" : "hsl(36 80% 28%)",
                        }}
                        onClick={() => setReceiptLightbox(`${BASE}${req.receipt_url}`)}>
                        📎 Comprobante
                      </button>
                    )}
                  </div>

                  {/* Cuerpo */}
                  <div className="px-4 py-3 space-y-3">
                    <div>
                      <p className="font-black text-base leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        {req.game_title ?? `Juego #${req.game_id}`}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          🃏 <span className="font-semibold">{req.quantity} cartón{req.quantity !== 1 ? "es" : ""}</span>
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          💵 <span className="font-bold" style={{ color: "hsl(var(--foreground))" }}>Bs {req.expected_amount.toFixed(0)}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          📅 {new Date(req.created_at).toLocaleDateString("es-BO")}
                        </span>
                      </div>
                    </div>

                    {!req.receipt_url && req.status === "pending" && (
                      <div className="rounded-2xl p-3 text-center text-xs text-muted-foreground border border-dashed"
                        style={{ borderColor: "hsl(42 98% 65%)" }}>
                        📭 Aún no enviaste el comprobante
                      </div>
                    )}

                    {req.admin_notes && (
                      <div className="rounded-2xl px-3.5 py-3 text-sm"
                        style={{
                          background: isRejected ? "hsl(0 75% 97%)" : "hsl(142 70% 97%)",
                          border: `1px solid ${isRejected ? "hsl(0 75% 84%)" : "hsl(142 70% 80%)"}`,
                        }}>
                        <p className="text-xs font-bold mb-1"
                          style={{ color: isRejected ? "hsl(0 75% 40%)" : "hsl(142 70% 30%)" }}>
                          💬 Mensaje del administrador
                        </p>
                        <p className="text-xs" style={{ color: isRejected ? "hsl(0 75% 38%)" : "hsl(142 70% 28%)" }}>
                          {req.admin_notes}
                        </p>
                      </div>
                    )}

                    {isRejected && (
                      <button
                        className="w-full py-3 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition-opacity active:opacity-80"
                        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(270 70% 45%))" }}
                        onClick={() => navigate(`/juego/${req.game_id}`)}>
                        🔁 Reintentar pago
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* ── Cartones activos / pagados ───────────────────────── */}
            {groups.map(({ game, cards: gameCards, hasWinner }) => {
              const gameId = gameCards[0].game_id;
              const title = game?.title ?? `Juego #${gameId}`;
              const emoji = game ? (TYPE_EMOJI[game.type] ?? "🎱") : "🎱";
              const typeLabel = game ? (TYPE_LABEL[game.type] ?? "") : "";
              const status: string = game?.status ?? "finished";
              const isActive = status === "active";
              const isUpcoming = status === "upcoming";

              const rounds = (game as any)?.rounds as Array<{ game_mode: string }> | null;
              const hasManyRounds = rounds && rounds.length > 1;

              return (
                <div key={gameId} className="rounded-3xl overflow-hidden shadow-md"
                  style={{
                    background: "hsl(var(--card))",
                    border: "1.5px solid hsl(var(--border))",
                  }}>

                  {/* Cabecera con gradiente */}
                  <div className="relative px-4 pt-4 pb-3 overflow-hidden"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, hsl(260 60% 14%), hsl(270 55% 22%))"
                        : isUpcoming
                        ? "linear-gradient(135deg, hsl(260 50% 16%), hsl(240 45% 24%))"
                        : "linear-gradient(135deg, hsl(240 15% 20%), hsl(240 12% 28%))",
                    }}>

                    {/* Emoji de fondo decorativo */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-6xl opacity-10 select-none pointer-events-none">
                      {emoji}
                    </div>

                    <div className="relative flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
                        style={{ background: "rgba(255,255,255,0.1)" }}>
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        {typeLabel && (
                          <p className="text-xs font-semibold uppercase tracking-wider mb-0.5"
                            style={{ color: "rgba(255,255,255,0.45)" }}>
                            {typeLabel}
                          </p>
                        )}
                        <p className="font-black text-white text-base leading-tight truncate"
                          style={{ fontFamily: "'Poppins', sans-serif" }}>
                          {title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {/* Badge estado */}
                          {isActive && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: "hsl(0 75% 52% / 0.25)", color: "hsl(0 85% 72%)", border: "1px solid hsl(0 75% 52% / 0.4)" }}>
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                              En vivo
                            </span>
                          )}
                          {isUpcoming && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: "hsl(42 98% 52% / 0.2)", color: "hsl(42 98% 72%)", border: "1px solid hsl(42 98% 52% / 0.35)" }}>
                              ⏳ Próximo
                            </span>
                          )}
                          {hasWinner && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: "hsl(42 98% 52% / 0.2)", color: "hsl(42 98% 72%)", border: "1px solid hsl(42 98% 52% / 0.35)" }}>
                              🏆 ¡Ganador!
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="px-4 py-3 space-y-2.5">
                    {/* Cartones + fecha */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">🃏</span>
                        <span className="text-sm font-black" style={{ color: "hsl(var(--foreground))" }}>
                          {gameCards.length}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          cartón{gameCards.length !== 1 ? "es" : ""} comprado{gameCards.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Fecha */}
                    {game?.draw_date && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">📅</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(game.draw_date).toLocaleDateString("es-BO", {
                            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}

                    {/* Rondas / modalidad */}
                    {game?.game_mode && (
                      <div className="flex flex-wrap gap-1.5">
                        {hasManyRounds ? (
                          rounds!.map((r, i) => (
                            <span key={i} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: "hsl(var(--primary) / 0.1)", border: "1px solid hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))" }}>
                              🎯 R{i + 1}: {MODE_LABEL[r.game_mode] ?? r.game_mode}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: "hsl(var(--primary) / 0.1)", border: "1px solid hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))" }}>
                            🎯 {MODE_LABEL[game.game_mode] ?? game.game_mode}
                          </span>
                        )}
                      </div>
                    )}

                    {/* CTA */}
                    {isActive ? (
                      <button
                        className="w-full py-3 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition-opacity active:opacity-80 mt-1"
                        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(270 70% 45%))" }}
                        onClick={() => navigate(`/juego/${gameId}/jugar`)}>
                        🎯 Ir a jugar ahora
                      </button>
                    ) : (
                      <button
                        className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity active:opacity-80 mt-1"
                        style={{
                          background: "hsl(var(--muted))",
                          border: "1.5px solid hsl(var(--border))",
                          color: "hsl(var(--foreground))",
                        }}
                        onClick={() => navigate(`/juego/${gameId}/jugar`)}>
                        🃏 Ver mis cartones
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
