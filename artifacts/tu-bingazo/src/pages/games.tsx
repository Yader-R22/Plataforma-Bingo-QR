import { useState, useEffect } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useListGames } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";

const ALL_TYPE_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "daily", label: "🌅 Diario" },
  { value: "weekly", label: "🏆 Semanal" },
  { value: "monthly", label: "👑 Mensual" },
];

function drawDatePriority(game: any): number {
  if (game.status === "active") return 0;
  if (game.status === "finished") return 99;
  const now = new Date();
  const draw = new Date(game.draw_date);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const drawStart = new Date(draw.getFullYear(), draw.getMonth(), draw.getDate());
  const diffDays = Math.round((drawStart.getTime() - todayStart.getTime()) / 86400000);
  if (diffDays <= 0) return 1;   // HOY
  if (diffDays === 1) return 2;  // MAÑANA
  if (diffDays <= 6) return 3;   // ESTA SEMANA
  if (diffDays <= 13) return 4;  // LA OTRA SEMANA
  return 5;                      // PRÓXIMO
}

function drawDateDiffDays(drawDate: string): number {
  const now = new Date();
  const draw = new Date(drawDate);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const drawStart = new Date(draw.getFullYear(), draw.getMonth(), draw.getDate());
  return Math.round((drawStart.getTime() - todayStart.getTime()) / 86400000);
}

function drawDateLabel(drawDate: string): string {
  const d = drawDateDiffDays(drawDate);
  if (d < 0) return "PASADO";
  if (d === 0) return "HOY";
  if (d === 1) return "MAÑANA";
  if (d <= 6) return "ESTA SEMANA";
  if (d <= 13) return "LA OTRA SEMANA";
  return "PRÓXIMO";
}

function drawDateBadgeStyle(drawDate: string): React.CSSProperties {
  if (drawDateDiffDays(drawDate) < 0)
    return { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" };
  return { background: "hsl(42 98% 52%)", color: "#1a0050" };
}

function typeConfig(type: string) {
  if (type === "daily") return { gradient: "var(--grad-daily)", emoji: "🌅", label: "Bingo Diario" };
  if (type === "weekly") return { gradient: "var(--grad-weekly)", emoji: "🏆", label: "Bingo Semanal" };
  return { gradient: "var(--grad-monthly)", emoji: "👑", label: "Bingo Mensual" };
}

export default function GamesPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialType = params.get("type") ?? "all";
  const [filter, setFilter] = useState(initialType);
  const [, navigate] = useLocation();

  useEffect(() => {
    const p = new URLSearchParams(search);
    const t = p.get("type") ?? "all";
    setFilter(t);
  }, [search]);

  const user = useAuthStore(s => s.user);
  const { data: allGames, isLoading, refetch: refetchGames } = useListGames();

  // Poll game list every 8s so status changes from admin are reflected immediately
  useEffect(() => {
    const iv = setInterval(() => { void refetchGames(); }, 8000);
    return () => clearInterval(iv);
  }, []);
  const allGamesList = (allGames ?? []) as any[];
  const existingTypes = new Set(allGamesList.map((g: any) => g.type));
  const TYPE_FILTERS = ALL_TYPE_FILTERS.filter(f => f.value === "all" || existingTypes.has(f.value));
  const filtered = (filter === "all" ? allGamesList : allGamesList.filter((g: any) => g.type === filter))
    .slice()
    .sort((a: any, b: any) => drawDatePriority(a) - drawDatePriority(b));

  const typeTitle = filter === "daily" ? "Bingos Diarios" : filter === "weekly" ? "Bingos Semanales" : filter === "monthly" ? "Bingos Mensuales" : "Juegos Disponibles";

  return (
    <AppLayout hideTopBar>
      {/* Header */}
      <div className="hero-bg px-4 py-5 text-white">
        <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>
          🎱 {typeTitle}
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

        {/* Filter tabs — only show types that exist */}
        <div className={`grid gap-1.5 mb-5`} style={{ gridTemplateColumns: `repeat(${TYPE_FILTERS.length}, 1fr)` }}>
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="py-2 rounded-xl text-xs font-bold transition-all border text-center"
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
          <div className="space-y-5">
            {[1, 2, 3].map(i => <div key={i} className="h-44 rounded-3xl bg-muted animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-5xl mb-3">🎱</div>
            <p className="font-bold">No hay juegos disponibles</p>
            <p className="text-sm mt-1">Vuelve pronto para nuevos sorteos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {filtered.map((game: any) => {
              const cfg = typeConfig(game.type);
              const isLive = game.status === "active";
              const isFinished = game.status === "finished";
              const coverImg = game.cover_image_url as string | null | undefined;
              return (
                <Link key={game.id} href={`/juegos/${game.id}`}>
                  {/* Outer wrapper: positioning context for the FINALIZADO badge — NO filter here */}
                  <div className="rounded-3xl cursor-pointer relative overflow-hidden stars-bg">

                    {/* Inner wrapper: grayscale applies to background + all content except badge */}
                    <div className="relative" style={isFinished ? { filter: "grayscale(100%)", opacity: 0.75 } : undefined}>
                      {/* Background */}
                      <div
                        className="absolute inset-0"
                        style={coverImg
                          ? { backgroundImage: `url(${coverImg})`, backgroundSize: "cover", backgroundPosition: "center" }
                          : { background: cfg.gradient }}
                      />
                      {coverImg && <div className="absolute inset-0 rounded-3xl" style={{ background: "rgba(0,0,0,0.45)" }} />}
                      <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full opacity-15" style={{ background: "rgba(255,255,255,0.4)" }} />
                      <div className="absolute -left-4 -bottom-6 w-24 h-24 rounded-full opacity-10" style={{ background: "rgba(255,255,255,0.3)" }} />

                      <div className="relative z-10 p-5">
                        {/* Status badge row */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex-1 min-w-0">
                            {isLive && <div className="live-badge mb-2 inline-flex"><div className="live-dot" />EN VIVO</div>}
                            {!isLive && !isFinished && (
                              <div className="mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                  style={drawDateBadgeStyle(game.draw_date)}>
                                  {drawDateLabel(game.draw_date)}
                                </span>
                              </div>
                            )}
                            {/* Spacer so layout matches when badge is rendered outside */}
                            {isFinished && <div className="mb-2 h-[22px]" />}
                            <p className="font-black text-white text-xl leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
                              {cfg.emoji} {game.title}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-3xl leading-none" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 65%)", textShadow: "0 0 12px rgba(255,180,0,0.5)" }}>
                              Bs {(game.prize_amount as number).toLocaleString("es-BO")}
                            </p>
                            <p className="text-white/60 text-xs mt-0.5">Premio</p>
                          </div>
                        </div>

                        {/* Date row */}
                        <p className="text-white/70 text-sm mb-4">
                          📅 {new Date(game.draw_date).toLocaleDateString("es-BO", {
                            weekday: "long", day: "numeric", month: "long",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>

                        {/* Footer row */}
                        <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}>
                          <div className="flex items-center gap-3 text-white/80 text-sm">
                            <span>👥 {game.participant_count} participantes</span>
                            <span className="font-bold" style={{ color: "hsl(42 98% 65%)" }}>Bs {game.card_price as number}/cartón</span>
                          </div>
                          <div
                            className="text-xs font-bold px-4 py-2 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
                            onClick={!isFinished && !user ? (e) => { e.preventDefault(); e.stopPropagation(); navigate("/login"); } : undefined}
                          >
                            {isLive ? "🎯 Jugar" : isFinished ? "Ver" : "Comprar →"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* FINALIZADO badge — outside the grayscale wrapper, keeps original color */}
                    {isFinished && (
                      <div className="absolute top-5 left-5 z-20">
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>FINALIZADO</span>
                      </div>
                    )}
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
