import { useEffect, useState, useCallback } from "react";
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

export default function MyCardsPage() {
  const [, navigate] = useLocation();
  useSetLayoutConfig({ hideTopBar: true });
  const token = useAuthStore(s => s.token);
  const { data: rawCards, isLoading, refetch: refetchCards } = useListMyCards();
  const { data: games = [], refetch: refetchGames } = useListGames();
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const [verified, setVerified] = useState<Record<string, "paid" | "pending">>({});

  const hasUpcoming = (games as any[]).some((g: any) => g.status === "upcoming");
  const pollInterval = hasUpcoming ? 3_000 : 10_000;

  useEffect(() => {
    const iv = setInterval(() => { void refetchCards(); void refetchGames(); }, pollInterval);
    return () => clearInterval(iv);
  }, [pollInterval]);

  const allCards = (rawCards as any[] ?? []);
  const paidCards = allCards.filter((c: any) => c.payment_status === "paid");
  const pendingCards = allCards.filter((c: any) => c.payment_status === "pending" && c.checkout_id);

  // Auto-verify all pending cards on load
  const checkStatus = useCallback(async (checkoutId: string, silent = false) => {
    if (!token || !checkoutId) return;
    if (!silent) setVerifying(v => ({ ...v, [checkoutId]: true }));
    try {
      const res = await fetch(`${BASE}/api/payments/${checkoutId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "completed") {
          setVerified(v => ({ ...v, [checkoutId]: "paid" }));
          void refetchCards();
          void refetchGames();
        } else {
          if (!silent) setVerified(v => ({ ...v, [checkoutId]: "pending" }));
        }
      }
    } catch {}
    if (!silent) setVerifying(v => ({ ...v, [checkoutId]: false }));
  }, [token]);

  // Silent auto-check on mount for all pending cards
  useEffect(() => {
    for (const card of pendingCards) {
      if (card.checkout_id) void checkStatus(card.checkout_id, true);
    }
  }, [pendingCards.length]);

  const gamesById = new Map<number, any>((games as any[]).map((g: any) => [g.id, g]));

  // Group paid cards by game
  const groupsMap = new Map<number, { game: any; cards: any[]; hasWinner: boolean }>();
  for (const card of paidCards) {
    const game = gamesById.get(card.game_id);
    if (!groupsMap.has(card.game_id)) {
      groupsMap.set(card.game_id, { game, cards: [], hasWinner: false });
    }
    const grp = groupsMap.get(card.game_id)!;
    grp.cards.push(card);
    if (card.status === "winner") grp.hasWinner = true;
  }
  const groups = Array.from(groupsMap.values());

  // Group pending cards by checkout_id
  const pendingGroups = new Map<string, { checkoutId: string; game: any; cards: any[] }>();
  for (const card of pendingCards) {
    const id = card.checkout_id;
    if (!pendingGroups.has(id)) {
      pendingGroups.set(id, { checkoutId: id, game: gamesById.get(card.game_id), cards: [] });
    }
    pendingGroups.get(id)!.cards.push(card);
  }
  const pendingGroupList = Array.from(pendingGroups.values());

  return (
    <>
      <div className="hero-bg px-4 py-5 text-white">
        <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>🃏 Mis Cartones</h1>
        <p className="text-white/60 text-sm">
          {paidCards.length} cartón{paidCards.length !== 1 ? "es" : ""} en {groups.length} juego{groups.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="p-4 max-w-xl mx-auto space-y-4">

        {/* Pending payment section */}
        {pendingGroupList.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Pagos pendientes</p>
            {pendingGroupList.map(({ checkoutId, game, cards: pgCards }) => {
              const isVerifying = verifying[checkoutId];
              const result = verified[checkoutId];
              const title = game?.title ?? `Juego #${pgCards[0].game_id}`;
              return (
                <div key={checkoutId}
                  className="rounded-3xl border-2 overflow-hidden"
                  style={{ borderColor: "hsl(42 98% 52% / 0.5)", background: "hsl(42 98% 52% / 0.06)" }}>
                  <div className="px-4 py-4 flex items-start gap-3">
                    <div className="text-3xl shrink-0">⏳</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-base leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        {title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        🃏 {pgCards.length} cartón{pgCards.length !== 1 ? "es" : ""} — esperando confirmación de pago
                      </p>
                      {result === "pending" && (
                        <p className="text-xs mt-1" style={{ color: "hsl(36 80% 38%)" }}>
                          ⚠️ Pago aún no detectado. Si ya pagaste, espera unos minutos e intenta de nuevo.
                        </p>
                      )}
                      {result === "paid" && (
                        <p className="text-xs text-green-600 mt-1 font-bold">✅ ¡Pago confirmado! Actualizando...</p>
                      )}
                    </div>
                  </div>
                  <div className="px-4 pb-4">
                    <button
                      disabled={isVerifying || result === "paid"}
                      onClick={() => void checkStatus(checkoutId)}
                      className="w-full py-2.5 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ borderColor: "hsl(42 98% 52%)", color: "hsl(36 80% 38%)", background: "hsl(42 98% 52% / 0.1)" }}
                    >
                      {isVerifying ? (
                        <><span className="animate-spin">⏳</span> Verificando...</>
                      ) : (
                        <>✅ Verificar mi pago</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Paid cards */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-3xl" />)}
          </div>
        ) : groups.length === 0 && pendingGroupList.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-6xl mb-4">🎱</div>
            <p className="font-black text-lg">Sin cartones activos</p>
            <p className="text-sm mt-1 mb-6">Compra cartones en un juego para participar</p>
            <button className="btn-primary max-w-xs mx-auto" onClick={() => navigate("/juegos")}>
              Ver juegos disponibles
            </button>
          </div>
        ) : groups.length === 0 ? null : (
          <div className="space-y-4">
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
                        {game?.game_mode && (
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                            style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)", color: "hsl(var(--primary))" }}>
                            🎯 {MODE_LABEL[game.game_mode] ?? game.game_mode}
                          </span>
                        )}
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
