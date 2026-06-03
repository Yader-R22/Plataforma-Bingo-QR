import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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

export default function HomePage() {
  const [, navigate] = useLocation();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/feed/recent`).then(r => r.ok ? r.json() : null).then(d => d && setFeed(d.items ?? []));
    fetch(`${BASE}/api/feed/stats`).then(r => r.ok ? r.json() : null).then(d => d && setStats(d));
  }, []);

  return (
    <AppLayout>
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-white px-4 py-10 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 text-9xl flex items-center justify-center pointer-events-none">🎱</div>
        <div className="relative">
          <h1 className="text-4xl font-black tracking-tight mb-2">Tu Bingazo</h1>
          <p className="text-white/80 text-sm mb-1">El bingo en vivo más emocionante de Bolivia</p>
          <p className="text-secondary text-2xl font-black mb-6">¡Gana desde casa! 🎉</p>
          <div className="flex gap-3 justify-center">
            <Button
              className="bg-secondary text-secondary-foreground font-bold px-6 hover:bg-secondary/90"
              onClick={() => navigate("/juegos")}
            >
              🎯 Ver juegos
            </Button>
            <Button
              variant="outline"
              className="text-white border-white/40 hover:bg-white/10"
              onClick={() => navigate("/registro")}
            >
              Registrarse
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-4 py-4 grid grid-cols-2 gap-3">
          <div className="bg-card border rounded-2xl p-4 text-center">
            <p className="text-3xl font-black text-primary">{stats.active_players.toLocaleString("es-BO")}</p>
            <p className="text-xs text-muted-foreground">Jugadores activos</p>
          </div>
          <div className="bg-card border rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-secondary">Bs {stats.total_prizes_paid.toLocaleString("es-BO", { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">En premios pagados</p>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="px-4 py-2">
        <h2 className="text-xl font-black mb-4">¿Cómo jugar?</h2>
        <div className="space-y-3">
          {[
            { icon: "1️⃣", title: "Regístrate", desc: "Crea tu cuenta con tu Carnet de Identidad boliviano" },
            { icon: "2️⃣", title: "Compra cartones", desc: "Elige un juego y compra cartones con QR o PagosYa" },
            { icon: "3️⃣", title: "Juega en vivo", desc: "Sigue el sorteo en vivo y marca tus números" },
            { icon: "4️⃣", title: "¡Cobra tu premio!", desc: "Pulsa BINGO al completar el patrón y cobra a tu billetera" },
          ].map(step => (
            <div key={step.icon} className="flex items-start gap-3 bg-card border rounded-2xl p-4">
              <span className="text-2xl">{step.icon}</span>
              <div>
                <p className="font-bold">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live feed */}
      {feed.length > 0 && (
        <div className="px-4 py-4">
          <h2 className="text-xl font-black mb-3">Actividad reciente 🔥</h2>
          <div className="space-y-2">
            {feed.slice(0, 5).map(item => (
              <div key={item.id} className="bg-card border rounded-xl px-4 py-3 flex items-center gap-3 feed-item-enter">
                <span className="text-lg">{item.type === "winner" ? "🏆" : "💸"}</span>
                <p className="text-sm text-foreground">{item.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <Button className="w-full h-12 font-bold" onClick={() => navigate("/juegos")}>
          🎱 Ver todos los juegos
        </Button>
      </div>
    </AppLayout>
  );
}
