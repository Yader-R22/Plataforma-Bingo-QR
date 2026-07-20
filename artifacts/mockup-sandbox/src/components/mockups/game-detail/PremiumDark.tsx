import { useState } from "react";

const GAME = {
  title: "Bingo Semanal",
  type: "weekly",
  status: "upcoming",
  draw_date: "2026-07-25T20:00:00",
  prize_amount: 800,
  card_price: 15,
  participant_count: 142,
  game_mode: "full_card",
  max_winners: 3,
  total_rounds: 2,
  stream_url_youtube: "#",
  stream_url_tiktok: "#",
  rounds: [
    { game_mode: "horizontal" },
    { game_mode: "full_card" },
  ],
};

function gameModeLabel(mode: string) {
  const map: Record<string, string> = {
    full_card: "Cartón completo",
    horizontal: "Línea horizontal",
    vertical: "Línea vertical",
    diagonal: "Diagonal",
    quina: "Quina",
  };
  return map[mode] ?? mode;
}

const GOLD = "hsl(42 98% 52%)";
const PURPLE = "#6d28d9";

export function PremiumDark() {
  const [qty, setQty] = useState(1);
  const [payWith, setPayWith] = useState<"qr" | "wallet">("qr");
  const totalPrice = GAME.card_price * qty;

  return (
    <div className="min-h-screen" style={{ background: "#0a0014", fontFamily: "'Inter', sans-serif", color: "#fff" }}>

      {/* HERO: full-bleed prize focus */}
      <div className="relative overflow-hidden" style={{ minHeight: 260 }}>
        {/* Background layers */}
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 120% 80% at 50% 0%, #2d0060 0%, #0a0014 70%)" }} />
        <div className="absolute inset-0 opacity-30"
          style={{ backgroundImage: "radial-gradient(circle at 15% 85%, rgba(109,40,217,0.6) 0px, transparent 40%), radial-gradient(circle at 85% 20%, rgba(212,170,0,0.25) 0px, transparent 35%)" }} />

        {/* Decorative bingo balls */}
        <div className="absolute right-4 top-8 opacity-10 text-8xl select-none pointer-events-none">🎱</div>

        <div className="relative z-10 px-5 pt-6 pb-5">
          {/* Date + type row */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest"
              style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
              🏆 Semanal
            </span>
            <span className="text-[10px] font-black px-2 py-1 rounded-full"
              style={{ background: GOLD, color: "#1a0050" }}>
              ESTA SEMANA
            </span>
          </div>

          {/* Prize — center stage */}
          <div className="mb-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-1"
              style={{ color: "rgba(255,255,255,0.35)" }}>Premio total</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold" style={{ color: GOLD }}>Bs</span>
              <span className="font-black leading-none" style={{ fontFamily: "'Poppins', sans-serif", fontSize: 64, color: GOLD, textShadow: "0 0 40px rgba(212,170,0,0.4)" }}>
                800
              </span>
            </div>
          </div>

          {/* Date */}
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
            📅 Sábado 25 de julio · 20:00
          </p>
        </div>
      </div>

      {/* Info section — horizontal list, no card wrappers */}
      <div className="px-5 pt-1 pb-5">
        <div className="flex items-center gap-0 text-xs overflow-hidden rounded-2xl"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {[
            { icon: "💳", val: "Bs 15", sub: "por cartón" },
            { icon: "👥", val: "142", sub: "jugadores" },
            { icon: "🎯", val: "2 rondas", sub: "modalidades" },
            { icon: "🏆", val: "6", sub: "ganadores" },
          ].map((item, i) => (
            <div key={i} className="flex-1 py-3 text-center"
              style={{ borderRight: i < 3 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
              <div className="text-base mb-0.5">{item.icon}</div>
              <div className="font-black text-xs text-white leading-none">{item.val}</div>
              <div className="text-[9px] leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Round details inline */}
        <div className="flex gap-2 mt-3">
          {GAME.rounds.map((r, i) => (
            <div key={i} className="flex-1 py-2 px-3 rounded-xl text-center"
              style={{ background: "rgba(109,40,217,0.2)", border: "1px solid rgba(109,40,217,0.3)" }}>
              <span className="text-[10px] font-bold" style={{ color: GOLD }}>Ronda {i + 1}</span>
              <p className="text-[10px] text-white/60 leading-tight mt-0.5">{gameModeLabel(r.game_mode)}</p>
            </div>
          ))}
        </div>

        {/* Ver en vivo */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>VER EN VIVO:</span>
          <a href="#" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold"
            style={{ background: "#FF0000" }}>
            <svg width="12" height="8" viewBox="0 0 24 17" fill="white">
              <path d="M23.495 2.656a3.01 3.01 0 0 0-2.117-2.13C19.483 0 12 0 12 0S4.517 0 2.622.526A3.01 3.01 0 0 0 .505 2.656C0 4.558 0 8.5 0 8.5s0 3.942.505 5.844a3.01 3.01 0 0 0 2.117 2.13C4.517 17 12 17 12 17s7.483 0 9.378-.526a3.01 3.01 0 0 0 2.117-2.13C24 12.442 24 8.5 24 8.5s0-3.942-.505-5.844z"/>
              <path d="M9.546 12.143V4.857L15.818 8.5l-6.272 3.643z"/>
            </svg>
            YouTube
          </a>
          <a href="#" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold"
            style={{ background: "#010101", border: "1px solid rgba(255,255,255,0.15)" }}>
            TikTok
          </a>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(109,40,217,0.4), transparent)", margin: "0 20px" }} />

      {/* Buy section */}
      <div className="px-5 pt-4 pb-6">
        <p className="font-black text-sm mb-4 uppercase tracking-wider" style={{ fontFamily: "'Poppins', sans-serif", color: "rgba(255,255,255,0.5)" }}>
          Comprar cartones
        </p>

        {/* Big price + qty on same level */}
        <div className="rounded-2xl p-4 mb-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Cantidad</p>
              <div className="flex items-center gap-0 rounded-xl overflow-hidden border"
                style={{ borderColor: "rgba(109,40,217,0.6)" }}>
                <button className="w-10 h-10 text-xl font-black flex items-center justify-center transition-all"
                  style={{ background: "rgba(109,40,217,0.15)", color: "#a78bfa" }}
                  onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                <span className="w-9 text-center font-black text-lg text-white">{qty}</span>
                <button className="w-10 h-10 text-xl font-black flex items-center justify-center transition-all"
                  style={{ background: "rgba(109,40,217,0.15)", color: "#a78bfa" }}
                  onClick={() => setQty(q => Math.min(10, q + 1))}>+</button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>Total</p>
              <p className="font-black text-4xl leading-none"
                style={{ fontFamily: "'Poppins', sans-serif", color: GOLD }}>
                Bs {totalPrice}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                {qty} × Bs {GAME.card_price}
              </p>
            </div>
          </div>
        </div>

        {/* Payment method */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setPayWith("qr")}
            className="py-3 rounded-xl text-sm font-bold transition-all"
            style={{
              background: payWith === "qr" ? "rgba(109,40,217,0.35)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${payWith === "qr" ? "rgba(109,40,217,0.8)" : "rgba(255,255,255,0.08)"}`,
              color: payWith === "qr" ? "#c4b5fd" : "rgba(255,255,255,0.4)",
            }}>
            📱 Pagar QR
          </button>
          <button onClick={() => setPayWith("wallet")}
            className="py-3 rounded-xl text-sm font-bold transition-all flex flex-col items-center gap-0.5"
            style={{
              background: payWith === "wallet" ? "rgba(212,170,0,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${payWith === "wallet" ? "rgba(212,170,0,0.5)" : "rgba(255,255,255,0.08)"}`,
              color: payWith === "wallet" ? GOLD : "rgba(255,255,255,0.4)",
            }}>
            <span>💰 Mi Saldo</span>
            <span className="text-[10px] opacity-60">Bs 50 disponible</span>
          </button>
        </div>

        {/* CTA — gold gradient */}
        <button className="w-full py-4 rounded-2xl font-black text-base"
          style={{
            fontFamily: "'Poppins', sans-serif",
            background: `linear-gradient(135deg, ${GOLD}, hsl(38 95% 45%))`,
            color: "#1a0050",
            boxShadow: "0 8px 28px rgba(212,170,0,0.35)",
          }}>
          ¡Comprar {qty} cartón{qty > 1 ? "es" : ""} ahora!
        </button>
        <p className="text-center text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>
          Pago seguro · Enlazo Bolivia
        </p>
      </div>
    </div>
  );
}
