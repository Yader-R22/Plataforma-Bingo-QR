import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetGame } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function gameModeLabel(mode: string) {
  const map: Record<string, string> = {
    full_card: "Cartón completo",
    horizontal: "Línea horizontal",
    vertical: "Línea vertical",
    diagonal: "Diagonal",
    quina: "Quina (5 en línea)",
  };
  return map[mode] ?? mode;
}

export default function GameDetailPage() {
  const [, params] = useRoute("/juegos/:id");
  const [, navigate] = useLocation();
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);

  const gameId = parseInt(params?.id ?? "0");
  const { data: game, isLoading } = useGetGame(gameId);

  async function handleBuy() {
    if (!user || user.status !== "active") {
      toast.error("Tu cuenta debe estar activa para comprar cartones");
      return;
    }
    setBuying(true);
    try {
      const res = await fetch(`${BASE}/api/cards/buy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ game_id: gameId, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al comprar cartones");
        return;
      }
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank");
      }
      toast.success(`${qty} cartón${qty > 1 ? "es" : ""} creado${qty > 1 ? "s" : ""}. Completa el pago para activarlos.`);
      navigate(`/pago/${data.checkout_id}`);
    } catch {
      toast.error("Error al procesar la compra");
    } finally {
      setBuying(false);
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 max-w-xl mx-auto space-y-3">
          <div className="h-8 bg-muted animate-pulse rounded-xl" />
          <div className="h-48 bg-muted animate-pulse rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (!game) {
    return (
      <AppLayout>
        <div className="p-4 text-center text-muted-foreground py-16">
          <p className="text-4xl">😕</p>
          <p className="mt-2 font-semibold">Juego no encontrado</p>
        </div>
      </AppLayout>
    );
  }

  const isActive = game.status === "active";
  const isFinished = game.status === "finished";

  return (
    <AppLayout>
      <div className="p-4 max-w-xl mx-auto">
        <div className="mb-4">
          <button onClick={() => navigate("/juegos")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            ← Volver
          </button>
        </div>

        {/* Hero */}
        <div className="bg-gradient-to-br from-primary to-primary/80 rounded-3xl p-6 text-white mb-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              {isActive && <span className="text-xs bg-green-400 text-green-900 font-bold px-2 py-0.5 rounded-full mb-2 inline-block animate-pulse">🔴 EN VIVO</span>}
              {!isActive && !isFinished && <span className="text-xs bg-white/20 text-white font-bold px-2 py-0.5 rounded-full mb-2 inline-block">PRÓXIMO</span>}
              {isFinished && <span className="text-xs bg-white/20 text-white font-bold px-2 py-0.5 rounded-full mb-2 inline-block">FINALIZADO</span>}
              <h1 className="text-2xl font-black leading-tight">{game.title}</h1>
              <p className="text-white/80 text-sm mt-1">
                {new Date(game.draw_date).toLocaleDateString("es-BO", {
                  weekday: "long", day: "numeric", month: "long",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black">Bs {(game.prize_amount as number).toLocaleString("es-BO")}</p>
              <p className="text-white/70 text-sm">Premio</p>
            </div>
          </div>
        </div>

        {/* Game details */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-card border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Precio cartón</p>
            <p className="text-xl font-black text-primary">Bs {game.card_price as number}</p>
          </div>
          <div className="bg-card border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Participantes</p>
            <p className="text-xl font-black">👥 {game.participant_count}</p>
          </div>
          <div className="bg-card border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Modalidad</p>
            <p className="text-sm font-bold">{gameModeLabel(game.game_mode)}</p>
          </div>
          <div className="bg-card border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Ganadores máx.</p>
            <p className="text-xl font-black">🏆 {game.max_winners}</p>
          </div>
        </div>

        {/* Streams */}
        {(game.stream_url_youtube || game.stream_url_tiktok || game.stream_url_facebook) && (
          <div className="bg-card border rounded-2xl p-4 mb-4">
            <p className="text-sm font-bold mb-3">📺 Ver en vivo</p>
            <div className="flex gap-2 flex-wrap">
              {game.stream_url_youtube && (
                <a href={game.stream_url_youtube as string} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-red-600 border-red-200">▶ YouTube</Button>
                </a>
              )}
              {game.stream_url_tiktok && (
                <a href={game.stream_url_tiktok as string} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">TikTok</Button>
                </a>
              )}
              {game.stream_url_facebook && (
                <a href={game.stream_url_facebook as string} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-blue-700 border-blue-200">Facebook</Button>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Buy or Play */}
        {!isFinished && isActive && (
          <div className="space-y-3">
            <Button
              className="w-full h-14 text-lg font-bold"
              onClick={() => navigate(`/juegos/${gameId}/jugar`)}
            >
              🎯 Ir a jugar ahora
            </Button>
          </div>
        )}

        {!isFinished && !isActive && (
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-lg">Comprar Cartones</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 border rounded-xl overflow-hidden">
                <button
                  className="px-4 py-2 text-lg font-bold hover:bg-muted transition-colors"
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                >−</button>
                <span className="px-4 py-2 font-bold text-lg w-10 text-center">{qty}</span>
                <button
                  className="px-4 py-2 text-lg font-bold hover:bg-muted transition-colors"
                  onClick={() => setQty(q => Math.min(10, q + 1))}
                >+</button>
              </div>
              <div>
                <p className="text-2xl font-black text-primary">
                  Bs {((game.card_price as number) * qty).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">{qty} cartón{qty > 1 ? "es" : ""}</p>
              </div>
            </div>
            <Button
              className="w-full h-12 font-bold"
              onClick={handleBuy}
              disabled={buying || !user}
            >
              {buying ? "Procesando..." : "💳 Comprar con QR / PagosYa"}
            </Button>
            {!user && (
              <p className="text-xs text-center text-muted-foreground">
                Debes <a href="/login" className="text-primary font-semibold">iniciar sesión</a> para comprar
              </p>
            )}
          </div>
        )}

        {isFinished && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-4xl mb-2">🏁</p>
            <p className="font-semibold">Este juego ya finalizó</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
