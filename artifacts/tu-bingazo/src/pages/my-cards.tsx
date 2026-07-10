import { useEffect, useCallback, useState } from "react";
import { useLocation } from "wouter";
import { useListMyCards, useListGames } from "@workspace/api-client-react";
import { useSetLayoutConfig } from "@/components/AppLayout";
import { useAuthStore } from "@/hooks/useAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TYPE_EMOJI: Record<string, string> = {
  daily: "📅",
  weekly: "🏆",
  monthly: "👑",
};

const MODE_LABEL: Record<string, string> = {
  full_card: "Cartón completo",
  horizontal: "Línea horizontal",
  vertical: "Línea vertical",
  diagonal: "Diagonal",
  quina: "Quina",
};

function gameStatusConfig(status: string) {
  if (status === "active") return { label: "🔴 En vivo", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.35)", color: "hsl(0 75% 42%)" };
  if (status === "upcoming") return { label: "⏳ Próximo", bg: "hsl(42 98% 52% / 0.15)", border: "hsl(42 98% 52% / 0.4)", color: "hsl(36 80% 38%)" };
  if (status === "finished") return { label: "Finalizado", bg: "hsl(var(--muted))", border: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" };
  return { label: status, bg: "hsl(var(--muted))", border: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" };
}

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
  const { data: rawCards, isLoading, refetch: refetchCards } = useListMyCards();
  const { data: games = [], refetch: refetchGames } = useListGames();
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

  // Adaptive polling: 8s when any of the user's games is upcoming (waiting to go live),
  // 20s when everything is active or finished (numbers already polled separately in /jugar).
  const hasUpcoming = (games as any[]).some((g: any) => g.status === "upcoming");
  const pollInterval = hasUpcoming ? 8_000 : 20_000;

  useEffect(() => {
    const iv = setInterval(() => {
      void refetchCards();
      void refetchGames();
      void fetchManualRequests();
    }, pollInterval);
    return () => clearInterval(iv);
  }, [pollInterval, fetchManualRequests]);

  // Only show cards that are paid
  const cards = (rawCards as any[] ?? []).filter((c: any) => c.payment_status === "paid");

  // Silent background verification for pending payment cards (Enlazo QR flow).
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

  // On mount: silently verify any cards still waiting for payment confirmation.
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

  // Group paid cards by game
  const groupsMap = new Map<number, { game: any; cards: any[]; hasWinner: boolean }>();
  for (const card of cards) {
    const game = gamesById.get(card.game_id);
    if (!groupsMap.has(card.game_id)) {
      groupsMap.set(card.game_id, { game, cards: [], hasWinner: false });
    }
    const grp = groupsMap.get(card.game_id)!;
    grp.cards.push(card);
    if (card.status === "winner") grp.hasWinner = true;
  }
  const groups = Array.from(groupsMap.values());

  // Manual QR payment requests: only show pending and rejected (approved activates cards → already in groups)
  const pendingManual = manualRequests.filter(r => r.status === "pending" || r.status === "rejected");

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
            {[1, 2].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-3xl" />)}
          </div>
        ) : isEmpty ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-6xl mb-4">🎱</div>
            <p className="font-black text-lg">Sin cartones activos</p>
            <p className="text-sm mt-1 mb-6">Compra cartones en un juego para participar</p>
            <button
              className="btn-primary max-w-xs mx-auto"
              onClick={() => navigate("/juegos")}
            >Ver juegos disponibles</button>
          </div>
        ) : (
          <div className="space-y-4">

            {/* ── Pagos QR pendientes de verificación ─────────────── */}
            {pendingManual.map((req) => {
              const isPending = req.status === "pending";
              const isRejected = req.status === "rejected";
              return (
                <div key={`mp-${req.id}`} className="rounded-3xl overflow-hidden shadow-sm border"
                  style={{
                    background: isRejected ? "hsl(0 75% 99%)" : "hsl(42 98% 98%)",
                    borderColor: isRejected ? "hsl(0 75% 85%)" : "hsl(42 98% 80%)",
                  }}>

                  {/* Status banner */}
                  <div className="px-4 py-2.5 flex items-center gap-2"
                    style={{ background: isRejected ? "hsl(0 75% 95%)" : "hsl(42 98% 93%)" }}>
                    <span className="text-base">{isRejected ? "❌" : "⏳"}</span>
                    <div className="flex-1">
                      <p className="text-xs font-black" style={{ color: isRejected ? "hsl(0 75% 38%)" : "hsl(36 80% 32%)" }}>
                        {isRejected ? "Pago rechazado" : "Pendiente de verificación"}
                      </p>
                      <p className="text-xs" style={{ color: isRejected ? "hsl(0 75% 50%)" : "hsl(36 80% 40%)" }}>
                        {isRejected
                          ? "El administrador rechazó este pago"
                          : "El administrador revisará tu comprobante pronto"}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* Info */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
                          {req.game_title ?? `Juego #${req.game_id}`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          🃏 {req.quantity} cartón{req.quantity !== 1 ? "es" : ""}
                          &nbsp;·&nbsp; <strong>Bs {req.expected_amount.toFixed(0)}</strong>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          📅 {new Date(req.created_at).toLocaleString("es-BO")}
                        </p>
                      </div>
                    </div>

                    {/* Comprobante adjunto */}
                    {req.receipt_url && (
                      <div className="rounded-xl overflow-hidden border cursor-zoom-in"
                        style={{ borderColor: "hsl(var(--border))" }}
                        onClick={() => setReceiptLightbox(`${BASE}${req.receipt_url}`)}>
                        <img
                          src={`${BASE}${req.receipt_url}`}
                          alt="Comprobante enviado"
                          className="w-full max-h-40 object-contain"
                          style={{ background: "hsl(var(--muted))", display: "block" }}
                        />
                        <p className="text-xs text-center py-1.5 text-muted-foreground bg-muted/50">
                          🔍 Toca para ampliar
                        </p>
                      </div>
                    )}

                    {!req.receipt_url && isPending && (
                      <div className="rounded-xl p-3 text-center text-xs text-muted-foreground border border-dashed"
                        style={{ borderColor: "hsl(42 98% 70%)" }}>
                        📭 Aún no enviaste el comprobante
                      </div>
                    )}

                    {/* Admin notes */}
                    {req.admin_notes && (
                      <div className="rounded-xl px-3 py-2.5 text-sm"
                        style={{
                          background: isRejected ? "hsl(0 75% 96%)" : "hsl(142 70% 97%)",
                          border: `1px solid ${isRejected ? "hsl(0 75% 85%)" : "hsl(142 70% 82%)"}`,
                        }}>
                        <p className="text-xs font-semibold mb-0.5"
                          style={{ color: isRejected ? "hsl(0 75% 40%)" : "hsl(142 70% 30%)" }}>
                          💬 Mensaje del administrador:
                        </p>
                        <p className="text-xs" style={{ color: isRejected ? "hsl(0 75% 38%)" : "hsl(142 70% 28%)" }}>
                          {req.admin_notes}
                        </p>
                      </div>
                    )}

                    {/* CTA */}
                    {isRejected && (
                      <button className="w-full py-2.5 rounded-xl text-sm font-bold text-white"
                        style={{ background: "hsl(var(--primary))" }}
                        onClick={() => navigate(`/juegos/${req.game_id}`)}>
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
              const status = game?.status ?? "finished";
              const sc = gameStatusConfig(status);
              return (
                <div key={gameId} className="bg-card border rounded-3xl overflow-hidden shadow-sm">
                  <div className="px-4 py-4 flex items-center gap-3">
                    <div className="text-3xl shrink-0">{emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-base leading-tight truncate" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        {title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                          style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}>
                          {sc.label}
                        </span>
                        <span className="text-xs text-muted-foreground font-semibold">
                          🃏 {gameCards.length} cartón{gameCards.length !== 1 ? "es" : ""}
                        </span>
                        {game?.game_mode && (() => {
                          const rounds = (game as any).rounds as Array<{ game_mode: string }> | null;
                          if (rounds && rounds.length > 1) {
                            return rounds.map((r, i) => (
                              <span key={i} className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                                style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))" }}>
                                🎯 R{i + 1}: {MODE_LABEL[r.game_mode] ?? r.game_mode}
                              </span>
                            ));
                          }
                          return (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                              style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))" }}>
                              🎯 {MODE_LABEL[game.game_mode] ?? game.game_mode}
                            </span>
                          );
                        })()}
                      </div>
                      {game?.draw_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          📅 {new Date(game.draw_date).toLocaleDateString("es-BO", {
                            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                    {hasWinner && (
                      <div className="text-xs font-black px-2.5 py-1 rounded-full shrink-0"
                        style={{ background: "hsl(42 98% 52% / 0.15)", border: "1px solid hsl(42 98% 52% / 0.4)", color: "hsl(42 98% 35%)" }}>
                        🏆 Ganador
                      </div>
                    )}
                  </div>

                  <div className="px-4 pb-4">
                    {status === "active" ? (
                      <button className="btn-primary" onClick={() => navigate(`/juegos/${gameId}/jugar`)}>
                        🎯 Ir a jugar
                      </button>
                    ) : (
                      <button
                        className="w-full py-2.5 rounded-xl text-sm font-bold border"
                        style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                        onClick={() => navigate(`/juegos/${gameId}/jugar`)}
                      >
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
