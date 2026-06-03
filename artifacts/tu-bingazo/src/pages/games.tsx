import { useState } from "react";
import { Link } from "wouter";
import { useListGames } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";

const TYPE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "daily", label: "🌅 Diario" },
  { value: "weekly", label: "🏆 Semanal" },
  { value: "monthly", label: "👑 Mensual" },
];

function typeConfig(type: string) {
  if (type === "daily") return { gradient: "var(--grad-daily)", emoji: "🌅", label: "Bingo Diario" };
  if (type === "weekly") return { gradient: "var(--grad-weekly)", emoji: "🏆", label: "Bingo Semanal" };
  return { gradient: "var(--grad-monthly)", emoji: "👑", label: "Bingo Mensual" };
}

export default function GamesPage() {
  const [filter, setFilter] = useState("all");
  const user = useAuthStore(s => s.user);

  const queryParams = filter !== "all" ? { type: filter as "daily" | "weekly" | "monthly" } : undefined;
  const { data: games, isLoading } = useListGames(queryParams as any);
  const filtered = (games ?? []) as any[];

  return (
    <AppLayout>
      {/* Header */}
      <div className="hero-bg px-4 py-5 text-white">
        <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>
          🎱 Juegos Disponibles
        </h1>
        <p className="text-white/60 text-sm">Elige tu sorteo y gana</p>
      </div>

      <div className="px-4 py-4">
        {user?.status === "pending" && (
          <div className="mb-4 rounded-2xl p-3 flex items-start gap-2 text-sm"
            style={{ background: "hsl(42 98% 52% / 0.12)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
            <span className="text-lg">⏳</span>
            <span>Tu cuenta está siendo verificada. Pronto podrás comprar cartones.</span>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all border"
              style={{
                background: filter === f.value ? "hsl(var(--primary))" : "white",
                color: filter === f.value ? "white" : "hsl(var(--foreground))",
                borderColor: filter === f.value ? "transparent" : "hsl(var(--border))",
                boxShadow: filter === f.value ? "0 2px 10px hsl(var(--primary) / 0.3)" : "none",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-40 rounded-3xl bg-muted animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-5xl mb-3">🎱</div>
            <p className="font-bold">No hay juegos disponibles</p>
            <p className="text-sm mt-1">Vuelve pronto para nuevos sorteos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((game: any) => {
              const cfg = typeConfig(game.type);
              const isLive = game.status === "active";
              const isFinished = game.status === "finished";
              return (
                <Link key={game.id} href={`/juegos/${game.id}`}>
                  <div
                    className="rounded-3xl p-5 cursor-pointer relative overflow-hidden stars-bg"
                    style={{
                      background: cfg.gradient,
                      opacity: isFinished ? 0.75 : 1,
                    }}
                  >
                    {/* Decorative circle */}
                    <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-15" style={{ background: "rgba(255,255,255,0.4)" }} />

                    <div className="relative z-10">
                      <div className="flex items-start justify-between">
                        <div>
                          {isLive && <div className="live-badge mb-2"><div className="live-dot" />EN VIVO</div>}
                          {!isLive && !isFinished && (
                            <div className="mb-2">
                              <span className="text-xs font-bold text-white/70 uppercase tracking-wider">PRÓXIMO</span>
                            </div>
                          )}
                          {isFinished && (
                            <div className="mb-2">
                              <span className="text-xs font-bold text-white/50 uppercase tracking-wider">FINALIZADO</span>
                            </div>
                          )}
                          <p className="font-black text-white text-xl leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
                            {cfg.emoji} {game.title}
                          </p>
                          <p className="text-white/70 text-xs mt-1">
                            {new Date(game.draw_date).toLocaleDateString("es-BO", {
                              weekday: "long", day: "numeric", month: "long",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="font-black text-3xl leading-none" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 65%)", textShadow: "0 0 12px rgba(255,180,0,0.5)" }}>
                            Bs {(game.prize_amount as number).toLocaleString("es-BO")}
                          </p>
                          <p className="text-white/60 text-xs mt-0.5">Premio</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
                        <div className="flex items-center gap-3 text-white/80 text-xs">
                          <span>👥 {game.participant_count}</span>
                          <span>·</span>
                          <span className="font-bold" style={{ color: "hsl(42 98% 65%)" }}>Bs {game.card_price as number} / cartón</span>
                        </div>
                        <div
                          className="text-xs font-bold px-3 py-1.5 rounded-xl"
                          style={{
                            background: isLive ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)",
                            color: "white",
                          }}
                        >
                          {isLive ? "🎯 Jugar" : "Ver →"}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
