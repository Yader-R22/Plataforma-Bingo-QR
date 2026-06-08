import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useListGames, useGetWallet, getGetWalletQueryKey, useListCategories } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface FeedItem {
  id: number;
  type: string;
  message: string;
  amount: number | null;
  user_display_name: string | null;
  created_at: string;
}

interface Stats {
  total_winners: number;
  total_prizes_paid: number;
  active_players: number;
  upcoming_games: number;
}

interface UserStats {
  total_won: number;
  wins_count: number;
}

// Official social media SVG icons
function YouTubeIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 24 17" fill="none">
      <path d="M23.495 2.656a3.01 3.01 0 0 0-2.117-2.13C19.483 0 12 0 12 0S4.517 0 2.622.526A3.01 3.01 0 0 0 .505 2.656C0 4.558 0 8.5 0 8.5s0 3.942.505 5.844a3.01 3.01 0 0 0 2.117 2.13C4.517 17 12 17 12 17s7.483 0 9.378-.526a3.01 3.01 0 0 0 2.117-2.13C24 12.442 24 8.5 24 8.5s0-3.942-.505-5.844z" fill="#FF0000"/>
      <path d="M9.546 12.143V4.857L15.818 8.5l-6.272 3.643z" fill="white"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="13" height="15" viewBox="0 0 24 27" fill="none">
      <path d="M17.526 0c.347 3.674 2.65 5.853 6.474 6.107v4.151c-2.213.217-4.15-.51-6.386-1.838v8.14c0 10.34-11.276 13.575-15.8 6.16C-.248 17.78.86 10.82 8.48 10.514v4.374c-.576.094-1.19.237-1.75.429-1.677.57-2.623 1.66-2.356 3.532.516 3.6 7.207 4.67 6.646-2.93V.001h6.506z" fill="white"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="10" height="18" viewBox="0 0 10 19" fill="none">
      <path d="M9.293.004L6.974 0C4.368 0 2.686 1.73 2.686 4.41V6.43H.354A.356.356 0 0 0 0 6.787v2.929c0 .197.159.356.354.356H2.686v7.394c0 .197.158.356.353.356H5.98c.195 0 .354-.16.354-.356v-7.394h2.693c.195 0 .354-.16.354-.356l.001-2.929a.357.357 0 0 0-.354-.357H6.334V4.714c0-.823.196-1.24 1.268-1.24H9.293C9.487 3.474 9.647 3.314 9.647 3.118V.36A.356.356 0 0 0 9.293.004z" fill="white"/>
    </svg>
  );
}

function GameTypeSection({
  category,
  games,
  onNavigate,
}: {
  category: any;
  games: any[];
  onNavigate: (path: string) => void;
}) {
  const type = category.type as string;
  const label = category.label as string;
  const emoji = category.emoji as string;
  const description = category.description as string;
  const gradient = `linear-gradient(135deg, ${category.color_from}, ${category.color_to})`;
  const bgImageUrl = category.background_image_url as string | null | undefined;
  const cardStyle = bgImageUrl
    ? { backgroundImage: `url(${bgImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: gradient };

  const game = games.find((g: any) => g.type === type && g.status !== "finished")
    ?? games.find((g: any) => g.type === type);

  const ytUrl = (category.stream_url_youtube || undefined) as string | undefined;
  const ttUrl = (category.stream_url_tiktok || undefined) as string | undefined;
  const fbUrl = (category.stream_url_facebook || undefined) as string | undefined;

  if (!game) {
    return (
      <div className="rounded-3xl p-5 relative overflow-hidden cursor-pointer opacity-60"
        style={cardStyle} onClick={() => onNavigate(`/juegos?type=${type}`)}>
        {bgImageUrl && <div className="absolute inset-0 rounded-3xl" style={{ background: "rgba(0,0,0,0.35)" }} />}
        <div className="relative z-10 text-white">
          <p className="text-2xl mb-1">{emoji}</p>
          <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>{label}</p>
          <p className="text-white/70 text-sm mt-1">{description || "Próximamente..."}</p>
          {(ytUrl || ttUrl || fbUrl) && (
            <div className="flex gap-2 mt-3">
              {ytUrl && (
                <a href={ytUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold text-xs" style={{ background: "#FF0000" }}>
                    <YouTubeIcon /><span className="text-white text-[11px]">YouTube</span>
                  </div>
                </a>
              )}
              {ttUrl && (
                <a href={ttUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold text-xs" style={{ background: "#010101" }}>
                    <TikTokIcon /><span className="text-white text-[11px]">TikTok</span>
                  </div>
                </a>
              )}
              {fbUrl && (
                <a href={fbUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold text-xs" style={{ background: "#1877F2" }}>
                    <FacebookIcon /><span className="text-white text-[11px]">Facebook</span>
                  </div>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isLive = game.status === "active";

  return (
    <div className="rounded-3xl p-5 relative overflow-hidden cursor-pointer stars-bg"
      style={cardStyle} onClick={() => onNavigate(`/juegos?type=${type}`)}>
      {bgImageUrl && <div className="absolute inset-0 rounded-3xl" style={{ background: "rgba(0,0,0,0.40)" }} />}
      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-20" style={{ background: "rgba(255,255,255,0.3)" }} />
      <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full opacity-10" style={{ background: "rgba(255,255,255,0.5)" }} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div>
            {isLive ? (
              <div className="live-badge mb-2"><div className="live-dot" />EN VIVO</div>
            ) : (
              <div className="mb-2">
                <span className="text-xs font-bold text-white/70 uppercase tracking-wider">PRÓXIMO</span>
              </div>
            )}
            <p className="font-black text-white text-lg leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {emoji} {label}
            </p>
            {description && (
              <p className="text-white/60 text-xs mt-1">{description}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-3xl font-black" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 60%)", textShadow: "0 0 12px rgba(255,180,0,0.5)" }}>
              Bs {(game.prize_amount as number).toLocaleString("es-BO")}
            </p>
            <p className="text-white/60 text-xs">Premio</p>
          </div>
        </div>

        {/* Official social icons (canales de la categoría, con respaldo al juego) */}
        {(ytUrl || ttUrl || fbUrl) && (
          <div className="flex gap-2 mt-3">
            {ytUrl && (
              <a href={ytUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold text-xs" style={{ background: "#FF0000" }}>
                  <YouTubeIcon />
                  <span className="text-white text-[11px]">YouTube</span>
                </div>
              </a>
            )}
            {ttUrl && (
              <a href={ttUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold text-xs" style={{ background: "#010101" }}>
                  <TikTokIcon />
                  <span className="text-white text-[11px]">TikTok</span>
                </div>
              </a>
            )}
            {fbUrl && (
              <a href={fbUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold text-xs" style={{ background: "#1877F2" }}>
                  <FacebookIcon />
                  <span className="text-white text-[11px]">Facebook</span>
                </div>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedGameSection({ game, onNavigate }: { game: any; onNavigate: (p: string) => void }) {
  const isLive = game.status === "active";
  return (
    <div className="rounded-3xl p-5 relative overflow-hidden cursor-pointer stars-bg"
      style={{ background: "linear-gradient(135deg, #b8500a, #e88c2a)" }}
      onClick={() => onNavigate(`/juegos/${game.id}`)}>
      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-20" style={{ background: "rgba(255,255,255,0.3)" }} />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>⭐ ESPECIAL</span>
          {isLive && <div className="live-badge"><div className="live-dot" />EN VIVO</div>}
        </div>
        <div className="flex items-start justify-between">
          <p className="font-black text-white text-lg leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
            🎉 {game.title}
          </p>
          <p className="text-3xl font-black shrink-0" style={{ fontFamily: "'Poppins', sans-serif", color: "white", textShadow: "0 0 12px rgba(255,255,255,0.4)" }}>
            Bs {(game.prize_amount as number).toLocaleString("es-BO")}
          </p>
        </div>
        <p className="text-white/80 text-xs mt-2">
          📅 {new Date(game.draw_date).toLocaleDateString("es-BO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · Bs {game.card_price}/cartón
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [, navigate] = useLocation();
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const { data: games = [] } = useListGames();
  const { data: categories = [] } = useListCategories();
  const { data: wallet } = useGetWallet({
    query: {
      queryKey: getGetWalletQueryKey(),
      enabled: !!user && user.status === "active",
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
    },
  });
  const balance = wallet?.balance ?? user?.balance ?? 0;

  useEffect(() => {
    const load = async () => {
      try {
        const fetches: Promise<Response>[] = [
          fetch(`${BASE}/api/feed/recent`),
          fetch(`${BASE}/api/feed/stats`),
        ];
        if (token) fetches.push(fetch(`${BASE}/api/auth/me/stats`, { headers: { Authorization: `Bearer ${token}` } }));
        const [fr, sr, ur] = await Promise.all(fetches);
        if (fr.ok) { const d = await fr.json(); setFeed(d.items ?? []); }
        if (sr.ok) { const d = await sr.json(); setStats(d); }
        if (ur && ur.ok) { const d = await ur.json(); setUserStats(d); }
        else if (!token) setUserStats(null);
      } catch {}
    };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [token]);

  useEffect(() => {
    if (!feed.length || !feedRef.current) return;
    const el = feedRef.current;
    let pos = 0;
    const scroll = () => {
      pos += 0.5;
      if (pos >= el.scrollWidth / 2) pos = 0;
      el.scrollLeft = pos;
    };
    const id = setInterval(scroll, 30);
    return () => clearInterval(id);
  }, [feed]);

  const gamesList = games as any[];
  const featuredGame = gamesList.find((g: any) => g.is_featured && g.status !== "finished");

  return (
    <AppLayout>
      {/* Hero */}
      <div className="hero-bg px-4 pt-5 pb-8 text-white relative">
        <div className="absolute top-3 right-4 text-5xl opacity-10 pointer-events-none select-none">🎱</div>
        <div className="absolute bottom-4 left-4 text-3xl opacity-10 pointer-events-none select-none rotate-12">⭐</div>

        {user ? (
          <div className="relative z-10">
            <p className="text-white/70 text-sm">¡Hola, {user.full_name.split(" ")[0]}! 👋</p>
            <h1 className="text-2xl font-black mt-0.5" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {user.status === "active" ? "¡A ganar hoy! 🎉" : "Bienvenido a Tu Bingazo"}
            </h1>
            {user.status === "active" && (
              <div className="mt-3 inline-flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
                <span className="text-xs text-white/70">Saldo disponible</span>
                <span className="font-black text-lg" style={{ color: "hsl(42 98% 60%)" }}>
                  Bs {balance.toLocaleString("es-BO", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {user.status === "pending" && (
              <div className="mt-3 bg-yellow-500/20 border border-yellow-400/30 rounded-xl px-3 py-2 text-xs text-yellow-200">
                ⏳ Tu cuenta está siendo verificada. Pronto podrás jugar.
              </div>
            )}
          </div>
        ) : (
          <div className="relative z-10 text-center py-4">
            <p className="text-white/70 text-sm mb-1">La plataforma de bingo más grande de</p>
            <h1 className="text-4xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>🇧🇴 Bolivia</h1>
            <p className="text-white/60 text-sm mt-1 mb-5">¡Gana premios en efectivo desde tu celular!</p>
            <div className="flex gap-3 justify-center">
              <button className="btn-gold flex-1 max-w-36" style={{ padding: "12px 16px" }} onClick={() => navigate("/registro")}>
                ✍️ Registrarse
              </button>
              <button
                className="flex-1 max-w-36 font-bold rounded-[14px] border-2 border-white/40 text-white"
                style={{ padding: "12px 16px", background: "rgba(255,255,255,0.1)" }}
                onClick={() => navigate("/login")}
              >
                Iniciar Sesión
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-3 gap-0 border-b" style={{ background: "#1a0050" }}>
          {[
            { value: stats.active_players, label: "Jugadores" },
            {
              value: `Bs ${(user && userStats ? userStats.total_won : stats.total_prizes_paid).toLocaleString("es-BO", { maximumFractionDigits: 0 })}`,
              label: user && userStats ? "Mis premios" : "En premios",
            },
            { value: stats.total_winners, label: "Ganadores" },
          ].map((s, i) => (
            <div key={i} className="text-center py-3 px-2" style={{ borderRight: i < 2 ? "1px solid rgba(255,255,255,0.1)" : undefined }}>
              <p className="font-black text-lg leading-none" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 60%)" }}>
                {s.value}
              </p>
              <p className="text-xs text-white/50 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Live feed ticker */}
      {feed.length > 0 && (
        <div className="flex items-center gap-0 overflow-hidden"
          style={{ background: "linear-gradient(90deg, hsl(42 98% 52%), hsl(38 98% 48%))", padding: "8px 0" }}>
          <div className="shrink-0 px-3 text-xs font-black text-purple-900 uppercase tracking-wider">🔥 EN VIVO</div>
          <div ref={feedRef} className="flex gap-6 overflow-hidden whitespace-nowrap" style={{ scrollBehavior: "auto" }}>
            {[...feed, ...feed].map((item, i) => (
              <span key={i} className="text-xs font-bold text-purple-900 shrink-0">
                {item.type === "winner" ? "🏆" : item.type === "new_user" ? "🙋" : item.type === "card_purchase" ? "🎟️" : "💸"} {item.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bingo type sections */}
      <div className="px-4 py-5 space-y-5">
        <h2 className="font-black text-lg text-foreground" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Sorteos Disponibles
        </h2>

        {(categories as any[]).filter((c: any) => c.is_active).map((c: any) => (
          <GameTypeSection key={c.id} category={c} games={gamesList} onNavigate={navigate} />
        ))}

        {featuredGame && (
          <FeaturedGameSection game={featuredGame} onNavigate={navigate} />
        )}

      </div>

      {/* How it works */}
      <div className="px-4 pb-8">
        <h2 className="font-black text-lg mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>¿Cómo funciona?</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: "📝", title: "Regístrate", desc: "Con tu CI boliviano" },
            { icon: "💳", title: "Compra cartones", desc: "Paga con QR PagosYa" },
            { icon: "🎱", title: "Juega en vivo", desc: "Marcado automático" },
            { icon: "💸", title: "Cobra tu premio", desc: "Directo a tu billetera" },
          ].map(s => (
            <div key={s.icon} className="bg-card border rounded-2xl p-4">
              <span className="text-2xl">{s.icon}</span>
              <p className="font-bold text-sm mt-2">{s.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
