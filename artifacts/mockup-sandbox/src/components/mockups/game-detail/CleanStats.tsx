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
  stream_url_facebook: null,
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

export function CleanStats() {
  const [qty, setQty] = useState(1);
  const [payWith, setPayWith] = useState<"qr" | "wallet">("qr");
  const totalPrice = GAME.card_price * qty;

  const gradient = "linear-gradient(135deg, #1a0050 0%, #4a0080 50%, #7b00d4 100%)";

  return (
    <div className="min-h-screen" style={{ background: "hsl(222 47% 4%)", fontFamily: "'Inter', sans-serif" }}>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: gradient }}>
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #fff 0px, transparent 50%)" }} />
        <div className="relative z-10 px-5 pt-5 pb-6">

          {/* Badge + date */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-black px-2.5 py-1 rounded-full"
              style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
              ESTA SEMANA
            </span>
            <span className="text-white/60 text-xs">
              📅 sáb 25 de julio · 20:00
            </span>
          </div>

          {/* Title + Prize side by side */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-white/70 text-xs font-medium mb-0.5 uppercase tracking-widest">Bingo Semanal 🏆</p>
              <p className="text-white font-black text-2xl leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Pozo de la semana
              </p>
              <div className="flex gap-1 mt-2">
                {GAME.rounds.map((r, i) => (
                  <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)" }}>
                    R{i + 1}: {gameModeLabel(r.game_mode)}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="font-black text-5xl leading-none"
                style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 52%)" }}>
                800
              </p>
              <p className="text-white/50 text-xs font-bold tracking-wider">BS PREMIO</p>
            </div>
          </div>
        </div>

        {/* Stats strip — replaces the 2x2 card grid */}
        <div className="relative z-10 px-5 pb-5">
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.07)", backdropFilter: "blur(8px)" }}>
            <div className="grid grid-cols-4 divide-x divide-white/10">
              {[
                { icon: "💳", label: "Cartón", value: "Bs 15" },
                { icon: "👥", label: "Jugadores", value: "142" },
                { icon: "🏆", label: "Ganadores", value: "6" },
                { icon: "🎱", label: "Rondas", value: "2" },
              ].map(item => (
                <div key={item.label} className="py-3 px-2 text-center">
                  <p className="text-base leading-none mb-1">{item.icon}</p>
                  <p className="font-black text-sm text-white leading-none">{item.value}</p>
                  <p className="text-[9px] text-white/40 mt-0.5 leading-none">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Ver en vivo — sin card wrapper, solo botones inline */}
        <div>
          <p className="text-xs font-bold mb-2 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            📺 Ver en vivo
          </p>
          <div className="flex gap-2">
            <a href="#" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-bold"
              style={{ background: "#FF0000" }}>
              <svg width="13" height="9" viewBox="0 0 24 17" fill="white">
                <path d="M23.495 2.656a3.01 3.01 0 0 0-2.117-2.13C19.483 0 12 0 12 0S4.517 0 2.622.526A3.01 3.01 0 0 0 .505 2.656C0 4.558 0 8.5 0 8.5s0 3.942.505 5.844a3.01 3.01 0 0 0 2.117 2.13C4.517 17 12 17 12 17s7.483 0 9.378-.526a3.01 3.01 0 0 0 2.117-2.13C24 12.442 24 8.5 24 8.5s0-3.942-.505-5.844z"/>
                <path d="M9.546 12.143V4.857L15.818 8.5l-6.272 3.643z" fill="white" style={{mixBlendMode:"multiply"}}/>
              </svg>
              YouTube
            </a>
            <a href="#" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-bold"
              style={{ background: "#010101", border: "1px solid rgba(255,255,255,0.15)" }}>
              TikTok
            </a>
          </div>
        </div>

        {/* Separator */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

        {/* Buy section — sin card dentro de card */}
        <div>
          <p className="font-black text-base text-white mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>
            🃏 Comprar cartones
          </p>

          {/* Qty + price in one clean row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-0 rounded-2xl overflow-hidden border"
              style={{ borderColor: "hsl(42 98% 52%)" }}>
              <button className="w-11 h-11 text-xl font-black text-white flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.05)" }}
                onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <span className="w-10 text-center font-black text-lg text-white">{qty}</span>
              <button className="w-11 h-11 text-xl font-black text-white flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.05)" }}
                onClick={() => setQty(q => Math.min(10, q + 1))}>+</button>
            </div>
            <div className="text-right">
              <p className="font-black text-3xl leading-none" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 52%)" }}>
                Bs {totalPrice}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{qty} cartón{qty > 1 ? "es" : ""}</p>
            </div>
          </div>

          {/* Payment method — pill toggle */}
          <div className="flex gap-2 mb-4">
            {[
              { id: "qr" as const, label: "📱 QR Enlazo", accent: "hsl(264 80% 60%)" },
              { id: "wallet" as const, label: "💰 Mi Saldo · Bs 50", accent: "hsl(42 98% 52%)" },
            ].map(opt => (
              <button key={opt.id}
                onClick={() => setPayWith(opt.id)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: payWith === opt.id ? opt.accent : "rgba(255,255,255,0.06)",
                  color: payWith === opt.id ? "#fff" : "rgba(255,255,255,0.5)",
                  border: payWith === opt.id ? "none" : "1px solid rgba(255,255,255,0.1)",
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* CTA */}
          <button className="w-full py-4 rounded-2xl font-black text-base transition-all"
            style={{ background: "linear-gradient(135deg, #7b00d4, #4a0080)", color: "#fff", fontFamily: "'Poppins', sans-serif", boxShadow: "0 8px 24px rgba(123,0,212,0.4)" }}>
            Comprar {qty} cartón{qty > 1 ? "es" : ""}  →
          </button>
          <p className="text-center text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.3)" }}>
            Pago seguro vía Enlazo
          </p>
        </div>
      </div>
    </div>
  );
}
