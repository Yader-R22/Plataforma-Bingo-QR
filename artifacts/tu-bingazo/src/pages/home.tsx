import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useListGames } from "@workspace/api-client-react";
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

function GameTypeSection({
  type,
  label,
  emoji,
  gradient,
  games,
  onNavigate,
}: {
  type: string;
  label: string;
  emoji: string;
  gradient: string;
  games: any[];
  onNavigate: (path: string) => void;
}) {
  const game = games.find((g: any) => g.type === type && g.status !== "finished")
    ?? games.find((g: any) => g.type === type);

  if (!game) {
    return (
      <div
        className="rounded-3xl p-5 relative overflow-hidden cursor-pointer opacity-60"
        style={{ background: gradient }}
        onClick={() => onNavigate("/juegos")}
      >
        <div className="relative z-10 text-white">
          <p className="text-2xl mb-1">{emoji}</p>
          <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>{label}</p>
          <p className="text-white/70 text-sm mt-1">Próximamente...</p>
        </div>
      </div>
    );
  }

  const isLive = game.status === "active";

  return (
    <div
      className="rounded-3xl p-5 relative overflow-hidden cursor-pointer stars-bg"
      style={{ background: gradient }}
      onClick={() => onNavigate(`/juegos?type=${type}`)}
    >
      {/* Decorative circles */}
      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-20" style={{ background: "rgba(255,255,255,0.3)" }} />
      <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full opacity-10" style={{ background: "rgba(255,255,255,0.5)" }} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div>
            {isLive ? (
              <div className="live-badge mb-2">
                <div className="live-dot" />
                EN VIVO
              </div>
            ) : (
              <div className="mb-2">
                <span className="text-xs font-bold text-white/70 uppercase tracking-wider">PRÓXIMO</span>
              </div>
            )}
            <p className="font-black text-white text-lg leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {emoji} {label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 60%)", textShadow: "0 0 12px rgba(255,180,0,0.5)" }}>
              Bs {(game.prize_amount as number).toLocaleString("es-BO")}
            </p>
            <p className="text-white/60 text-xs">Premio</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-white/80 text-xs mt-3 pt-3 border-t border-white/20">
          <span>📅 {new Date(game.draw_date).toLocaleDateString("es-BO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          <span className="flex items-center gap-1">
            <span>👥 {game.participant_count}</span>
            <span className="mx-1">·</span>
            <span className="font-bold" style={{ color: "hsl(42 98% 65%)" }}>Bs {game.card_price as number} / cartón</span>
          </span>
        </div>

        {/* Stream icons */}
        {(game.stream_url_youtube || game.stream_url_tiktok || game.stream_url_facebook) && (
          <div className="flex gap-2 mt-2">
            {game.stream_url_youtube && (
              <a href={game.stream_url_youtube as string} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                <div className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">▶ YT</div>
              </a>
            )}
            {game.stream_url_tiktok && (
              <a href={game.stream_url_tiktok as string} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                <div className="bg-black text-white text-xs font-bold px-2 py-0.5 rounded-full">TikTok</div>
              </a>
            )}
            {game.stream_url_facebook && (
              <a href={game.stream_url_facebook as string} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                <div className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">fb</div>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [, navigate] = useLocation();
  const user = useAuthStore(s => s.user);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const { data: games = [] } = useListGames();

  useEffect(() => {
    const load = async () => {
      try {
        const [fr, sr] = await Promise.all([
          fetch(`${BASE}/api/feed/recent`),
          fetch(`${BASE}/api/feed/stats`),
        ]);
        if (fr.ok) { const d = await fr.json(); setFeed(d.items ?? []); }
        if (sr.ok) { const d = await sr.json(); setStats(d); }
      } catch {}
    };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  // Auto-scroll feed
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

  return (
    <AppLayout>
      {/* Hero */}
      <div className="hero-bg px-4 pt-5 pb-8 text-white relative">
        {/* Decorative balls */}
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
                  Bs {user.balance.toLocaleString("es-BO", { minimumFractionDigits: 2 })}
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
            { value: `Bs ${stats.total_prizes_paid.toLocaleString("es-BO", { maximumFractionDigits: 0 })}`, label: "En premios" },
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
        <div
          className="flex items-center gap-0 overflow-hidden"
          style={{ background: "linear-gradient(90deg, hsl(42 98% 52%), hsl(38 98% 48%))", padding: "8px 0" }}
        >
          <div className="shrink-0 px-3 text-xs font-black text-purple-900 uppercase tracking-wider">🔥 EN VIVO</div>
          <div
            ref={feedRef}
            className="flex gap-6 overflow-hidden whitespace-nowrap"
            style={{ scrollBehavior: "auto" }}
          >
            {[...feed, ...feed].map((item, i) => (
              <span key={i} className="text-xs font-bold text-purple-900 shrink-0">
                {item.type === "winner" ? "🏆" : "💸"} {item.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bingo type sections */}
      <div className="px-4 py-5 space-y-4">
        <h2 className="font-black text-lg text-foreground" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Sorteos Disponibles
        </h2>

        <GameTypeSection
          type="daily"
          label="Bingo Diario"
          emoji="🌅"
          gradient="var(--grad-daily)"
          games={gamesList}
          onNavigate={navigate}
        />
        <GameTypeSection
          type="weekly"
          label="Bingo Semanal"
          emoji="🏆"
          gradient="var(--grad-weekly)"
          games={gamesList}
          onNavigate={navigate}
        />
        <GameTypeSection
          type="monthly"
          label="Bingo Mensual"
          emoji="👑"
          gradient="var(--grad-monthly)"
          games={gamesList}
          onNavigate={navigate}
        />
        <Link href="/juegos">
          <button
            className="w-full py-3 rounded-2xl border-2 font-bold text-sm transition-all"
            style={{ borderColor: "hsl(var(--primary) / 0.3)", color: "hsl(var(--primary))" }}
          >
            Ver todos los sorteos →
          </button>
        </Link>
      </div>

      {/* How it works */}
      <div className="px-4 pb-6">
        <h2 className="font-black text-lg mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>¿Cómo funciona?</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: "📝", title: "Regístrate", desc: "Con tu CI boliviano" },
            { icon: "💳", title: "Compra cartones", desc: "Paga con QR PagosYa" },
            { icon: "🎱", title: "Juega en vivo", desc: "Marca números en vivo" },
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
