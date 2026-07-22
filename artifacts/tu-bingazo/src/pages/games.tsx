import { useState, useEffect } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { useSetLayoutConfig } from "@/components/AppLayout";
import { toast } from "sonner";
import { Users } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  if (diffDays < 0) return 90;   // EN ESPERA (pasó su fecha, va al fondo)
  if (diffDays === 0) return 1;  // HOY
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
  if (d < 0) return "EN ESPERA";
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
  useSetLayoutConfig({ hideTopBar: true });
  const { data: allGames, isLoading } = useListGames(undefined, {
    query: {
      queryKey: getListGamesQueryKey(),
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  });
  const allGamesList = (allGames ?? []) as any[];
  const existingTypes = new Set(allGamesList.map((g: any) => g.type));
  const TYPE_FILTERS = ALL_TYPE_FILTERS.filter(f => f.value === "all" || existingTypes.has(f.value));
  const filtered = (filter === "all" ? allGamesList : allGamesList.filter((g: any) => g.type === filter))
    .slice()
    .sort((a: any, b: any) => {
      const pa = drawDatePriority(a);
      const pb = drawDatePriority(b);
      if (pa !== pb) return pa - pb;
      // EN ESPERA: más reciente primero (menor atraso arriba)
      if (pa === 90) return new Date(b.draw_date).getTime() - new Date(a.draw_date).getTime();
      return new Date(a.draw_date).getTime() - new Date(b.draw_date).getTime();
    });

  const typeTitle = filter === "daily" ? "Bingos Diarios" : filter === "weekly" ? "Bingos Semanales" : filter === "monthly" ? "Bingos Mensuales" : "Juegos Disponibles";

  return (
    <>
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
              const isPrivate = !!(game as any).is_private;
              const coverImg = game.cover_image_url as string | null | undefined;
              const cardIsPrivateBlocked = isPrivate && !isLive && !isFinished;
              const cardContent = (
                <div className={`rounded-3xl relative overflow-hidden stars-bg${cardIsPrivateBlocked ? "" : " cursor-pointer"}`}>

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
                            <p className="font-black text-white text-base leading-snug overflow-hidden" style={{ fontFamily: "'Poppins', sans-serif", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", wordBreak: "break-word", overflowWrap: "break-word" }}>
                              {cfg.emoji} {game.title}
                            </p>
                          </div>
                          <div className="flex flex-row gap-3 items-start shrink-0">
                            <div className="text-right">
                              {(game as any).total_rounds > 1 ? (
                                /* Multi-ronda: fotos a la izq, texto a la der */
                                (() => {
                                  const rounds = ((game as any).rounds as any[] | null) ?? [];
                                  const totalCash = rounds.reduce((s: number, r: any) => s + (r.prize_amount ?? 0), 0);
                                  const physicalRounds = rounds.filter((r: any) => r.prize_type !== "cash");
                                  const photoRounds = physicalRounds.filter((r: any) => r.prize_image_url);
                                  const allPhysicalNames = physicalRounds.map((r: any) => r.prize_physical_name).filter(Boolean);
                                  return (
                                    <div className="flex flex-row items-center gap-2">
                                      {/* Izquierda: monto + nombres + rondas */}
                                      <div className="flex flex-col items-end gap-0.5">
                                        {totalCash > 0 && (
                                          <p className="font-black text-xl leading-none" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 65%)", textShadow: "0 0 10px rgba(255,180,0,0.5)" }}>
                                            Bs {totalCash.toLocaleString("es-BO")}
                                          </p>
                                        )}
                                        {allPhysicalNames.length > 0 && (
                                          <p className="text-white text-[9px] font-black leading-tight text-right overflow-hidden" style={{ maxWidth: 80, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                            📦 {allPhysicalNames.join(", ")}
                                          </p>
                                        )}
                                        <p className="text-white/50 text-[9px] font-semibold">🎮 {(game as any).total_rounds} rondas</p>
                                      </div>
                                      {/* Fotos: 1→grande, 2→medianas, 3+→cuadrícula compacta */}
                                      {photoRounds.length === 1 && (
                                        <img
                                          src={`${BASE}${photoRounds[0].prize_image_url}`}
                                          alt={photoRounds[0].prize_physical_name ?? "Premio"}
                                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                          className="rounded-xl object-cover shadow-lg flex-shrink-0"
                                          style={{ width: 90, height: 90, border: "2px solid rgba(255,255,255,0.25)" }}
                                        />
                                      )}
                                      {photoRounds.length === 2 && (
                                        <div className="flex flex-col gap-1">
                                          {photoRounds.slice(0, 2).map((r: any, i: number) => (
                                            <img
                                              key={i}
                                              src={`${BASE}${r.prize_image_url}`}
                                              alt={r.prize_physical_name ?? "Premio"}
                                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                              className="rounded-lg object-cover shadow-lg"
                                              style={{ width: 52, height: 52, border: "2px solid rgba(255,255,255,0.25)", flexShrink: 0 }}
                                            />
                                          ))}
                                        </div>
                                      )}
                                      {photoRounds.length >= 3 && (
                                        <div className="flex flex-row gap-1">
                                          {[0, 2].filter(col => photoRounds[col]).map(col => (
                                            <div key={col} className="flex flex-col gap-1">
                                              {[col, col + 1].filter(i => photoRounds[i] && i < 4).map(i => (
                                                <img
                                                  key={i}
                                                  src={`${BASE}${photoRounds[i].prize_image_url}`}
                                                  alt={photoRounds[i].prize_physical_name ?? "Premio"}
                                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                  className="rounded-lg object-cover shadow-lg"
                                                  style={{ width: 36, height: 36, border: "2px solid rgba(255,255,255,0.25)", flexShrink: 0 }}
                                                />
                                              ))}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : (game as any).prize_type === "physical" ? (
                                /* Ronda única física: texto a la izq, foto grande a la der */
                                <div className="flex flex-row items-center gap-2">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <p className="text-white/60 text-[10px] font-bold">📦 Premio físico</p>
                                    {(game as any).prize_physical_name && (
                                      <p className="text-white text-[10px] font-black leading-tight text-right" style={{ maxWidth: 90 }}>
                                        {(game as any).prize_physical_name}
                                      </p>
                                    )}
                                  </div>
                                  {(game as any).prize_image_url && (
                                    <img
                                      src={`${BASE}${(game as any).prize_image_url}`}
                                      alt={(game as any).prize_physical_name ?? "Premio"}
                                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                      className="rounded-xl object-cover shadow-lg flex-shrink-0"
                                      style={{ width: 90, height: 90, border: "2px solid rgba(255,255,255,0.25)" }}
                                    />
                                  )}
                                </div>
                              ) : (game as any).prize_type === "mixed" ? (
                                <div>
                                  <p className="font-black text-3xl leading-none" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 65%)", textShadow: "0 0 12px rgba(255,180,0,0.5)" }}>
                                    Bs {(game.prize_amount as number).toLocaleString("es-BO")}
                                  </p>
                                  <p className="text-white/60 text-[10px] mt-0.5">+ Premio físico</p>
                                </div>
                              ) : (
                                <div>
                                  <p className="font-black text-3xl leading-none" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 65%)", textShadow: "0 0 12px rgba(255,180,0,0.5)" }}>
                                    Bs {(game.prize_amount as number).toLocaleString("es-BO")}
                                  </p>
                                  <p className="text-white/60 text-xs mt-0.5">Premio</p>
                                </div>
                              )}
                            </div>
                            <button
                              className="p-1.5 rounded-lg flex-shrink-0 text-white transition-colors"
                              style={{ background: "rgba(255,255,255,0.15)" }}
                              aria-label="Compartir"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                let url: string;
                                let text: string;
                                if (isPrivate) {
                                  url = window.location.origin;
                                  text = "¡Regístrate en El Bingote y gana premios en efectivo desde tu celular! La plataforma de bingo en vivo más grande de Bolivia. 🎱🇧🇴";
                                } else {
                                  const slug = (game as any).slug;
                                  url = slug
                                    ? `${window.location.origin}/juego/${game.id}/${slug}`
                                    : `${window.location.origin}/juego/${game.id}`;
                                  text = `¡Juega ${game.title} y gana Bs ${game.prize_amount}!`;
                                }
                                if (navigator.share) {
                                  navigator.share({ title: "El Bingote", text, url });
                                } else {
                                  navigator.clipboard.writeText(url).then(() => toast.success("¡Enlace copiado!"));
                                }
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                <polyline points="16 6 12 2 8 6" />
                                <line x1="12" y1="2" x2="12" y2="15" />
                              </svg>
                            </button>
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
                        <div className="flex items-center justify-between gap-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.2)" }}>
                          <div className="flex flex-nowrap items-center gap-x-3 min-w-0 text-sm text-white/80 overflow-hidden">
                            <span className="flex items-center gap-1 shrink-0"><Users size={13} className="opacity-70" />{game.unique_participants.toLocaleString("es-BO")} {game.unique_participants === 1 ? "participante" : "participantes"}</span>
                            <span className="font-bold shrink-0" style={{ color: "hsl(42 98% 65%)" }}>Bs {Number(game.card_price).toLocaleString("es-BO")}/cartón</span>
                          </div>
                          {isPrivate && !isLive && !isFinished ? (
                            <div
                              className="flex-shrink-0 text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap flex items-center gap-1.5"
                              style={{ background: "rgba(255,255,255,0.92)", color: "#1a0050" }}
                            >
                              🔒 Privado
                            </div>
                          ) : (
                            <div
                              className="flex-shrink-0 text-xs font-bold px-4 py-2 rounded-xl whitespace-nowrap"
                              style={isLive
                                ? { background: "#22c55e", color: "white" }
                                : isFinished
                                ? { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }
                                : { background: "hsl(42 98% 52%)", color: "#1a0050" }}
                              onClick={!isFinished && !user ? (e) => { e.preventDefault(); e.stopPropagation(); navigate("/login"); } : undefined}
                            >
                              {isLive ? "Jugar ahora →" : isFinished ? "Ver" : "Comprar →"}
                            </div>
                          )}
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
              );
              return cardIsPrivateBlocked
                ? <div key={game.id}>{cardContent}</div>
                : <Link key={game.id} href={`/juego/${game.id}`}>{cardContent}</Link>;
            })}
          </div>
        )}
      </div>
    </>
  );
}
