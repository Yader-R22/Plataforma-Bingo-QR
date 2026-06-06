import { useLocation } from "wouter";
import { useListMyCards } from "@workspace/api-client-react";
import AppLayout from "@/components/AppLayout";

const LETTERS = ["B", "I", "N", "G", "O"];
const LETTER_COLORS = ["#e53e3e", "#d69e2e", "#38a169", "#3182ce", "#805ad5"];

function statusConfig(status: string, paymentStatus: string) {
  if (paymentStatus !== "paid") return null; // Hide unpaid
  if (status === "winner") return { label: "🏆 Ganador", bg: "hsl(42 98% 52% / 0.15)", border: "hsl(42 98% 52% / 0.4)", color: "hsl(42 98% 35%)" };
  if (status === "active") return { label: "✓ Activo", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" };
  if (status === "expired") return { label: "Expirado", bg: "hsl(var(--muted))", border: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" };
  return { label: status, bg: "hsl(var(--muted))", border: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" };
}

export default function MyCardsPage() {
  const [, navigate] = useLocation();
  const { data: rawCards, isLoading } = useListMyCards();

  // Only show cards that are paid
  const cards = (rawCards as any[] ?? []).filter((c: any) => c.payment_status === "paid");

  return (
    <AppLayout>
      {/* Header */}
      <div className="hero-bg px-4 py-5 text-white">
        <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>🃏 Mis Cartones</h1>
        <p className="text-white/60 text-sm">{cards.length} cartón{cards.length !== 1 ? "es" : ""} activo{cards.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="p-4 max-w-xl mx-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-64 bg-muted animate-pulse rounded-3xl" />)}
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="text-6xl mb-4">🎱</div>
            <p className="font-black text-lg">Sin cartones activos</p>
            <p className="text-sm mt-1 mb-6">Compra cartones en un juego para participar</p>
            <button
              className="btn-primary max-w-xs mx-auto"
              onClick={() => navigate("/juegos")}
            >Ver juegos disponibles</button>
          </div>
        ) : (
          <div className="space-y-6">
            {cards.map((card: any) => {
              const sc = statusConfig(card.status, card.payment_status);
              if (!sc) return null;
              return (
                <div key={card.id} className="bg-card border rounded-3xl overflow-hidden shadow-sm">
                  {/* Card header */}
                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{ background: "linear-gradient(135deg, #1a0050, #2d0082)" }}>
                    <div>
                      <p className="font-black text-white text-sm">Cartón #{card.id}</p>
                      <p className="text-white/50 text-xs">Juego #{card.game_id}</p>
                    </div>
                    <div className="text-xs font-bold px-3 py-1 rounded-full"
                      style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}>
                      {sc.label}
                    </div>
                  </div>

                  {/* Bingo card grid */}
                  <div className="p-4">
                    <div className="max-w-xs mx-auto">
                      {/* Headers */}
                      <div className="grid grid-cols-5 mb-1">
                        {LETTERS.map((l, i) => (
                          <div key={l} className="text-center text-sm font-black py-1.5 rounded-t-lg"
                            style={{ color: LETTER_COLORS[i] }}>{l}</div>
                        ))}
                      </div>
                      {/* Numbers */}
                      <div className="border rounded-2xl overflow-hidden">
                        {(card.numbers as number[][]).map((row: number[], ri: number) => (
                          <div key={ri} className="grid grid-cols-5"
                            style={{ borderTop: ri > 0 ? "1px solid hsl(var(--border))" : undefined }}>
                            {row.map((num: number, ci: number) => {
                              const isFree = num === 0;
                              const isMarked = (card.marked_numbers as number[]).includes(num);
                              return (
                                <div key={`${ri}-${ci}`}
                                  className="flex items-center justify-center text-xs font-bold py-2.5"
                                  style={{
                                    borderRight: ci < 4 ? "1px solid hsl(var(--border))" : undefined,
                                    background: isFree
                                      ? "hsl(var(--primary) / 0.08)"
                                      : isMarked
                                      ? "hsl(var(--primary))"
                                      : "transparent",
                                    color: isFree
                                      ? "hsl(var(--primary))"
                                      : isMarked
                                      ? "white"
                                      : "hsl(var(--foreground))",
                                    fontFamily: "'Poppins', sans-serif",
                                  }}>
                                  {isFree ? "★" : num}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {card.status === "active" && (
                    <div className="px-4 pb-4">
                      <button className="btn-primary" onClick={() => navigate(`/juegos/${card.game_id}/jugar`)}>
                        🎯 Ir a jugar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
