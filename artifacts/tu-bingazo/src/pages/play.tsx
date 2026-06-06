import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LETTERS = ["B", "I", "N", "G", "O"];
const LETTER_COLORS = ["#e53e3e", "#d69e2e", "#38a169", "#3182ce", "#805ad5"];

interface GameSession {
  game_id: number;
  called_numbers: number[];
  last_called_number: number | null;
  game_mode: string;
  updated_at: string;
}

interface BingoCard {
  id: number;
  numbers: number[][];
  marked_numbers: number[];
  status: string;
  payment_status: string;
}

export default function PlayPage() {
  const [, params] = useRoute("/juegos/:id/jugar");
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);

  const gameId = parseInt(params?.id ?? "0");
  const [session, setSession] = useState<GameSession | null>(null);
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [selectedCardIdx, setSelectedCardIdx] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [newNumberAlert, setNewNumberAlert] = useState<number | null>(null);
  const [showAllNumbers, setShowAllNumbers] = useState(false);

  const cardsRef = useRef<BingoCard[]>([]);
  const prevCalledRef = useRef<number[]>([]);
  const authHeader = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

  async function autoMarkOnCards(newNums: number[], currentCards: BingoCard[]) {
    for (const card of currentCards) {
      if (card.payment_status !== "paid") continue;
      const flat = card.numbers.flat();
      const toMark = newNums.filter(n => flat.includes(n) && !card.marked_numbers.includes(n));
      if (toMark.length === 0) continue;
      const newMarked = [...card.marked_numbers, ...toMark];
      try {
        const res = await fetch(`${BASE}/api/cards/${card.id}/mark`, {
          method: "PATCH",
          headers: authHeader,
          body: JSON.stringify({ marked_numbers: newMarked }),
        });
        if (res.ok) {
          const updated = await res.json();
          setCards(cs => {
            const next = cs.map(c => c.id === card.id ? updated : c);
            cardsRef.current = next;
            return next;
          });
        }
      } catch {}
    }
  }

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/games/${gameId}/session`, { headers: authHeader });
      if (res.ok) {
        const data: GameSession = await res.json();
        setSession(prev => {
          const prevSet = new Set(prevCalledRef.current);
          const newNums = data.called_numbers.filter(n => !prevSet.has(n));
          if (newNums.length > 0) {
            setNewNumberAlert(data.last_called_number);
            setTimeout(() => setNewNumberAlert(null), 4000);
            // Auto-mark on all cards
            autoMarkOnCards(newNums, cardsRef.current);
          }
          prevCalledRef.current = data.called_numbers;
          return data;
        });
      }
    } catch {}
  }, [gameId, token]);

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/cards?game_id=${gameId}`, { headers: authHeader });
      if (res.ok) {
        const data = await res.json();
        const active = data.filter((c: BingoCard) => c.payment_status === "paid");
        setCards(active);
        cardsRef.current = active;
      }
    } catch {}
  }, [gameId, token]);

  useEffect(() => {
    fetchSession();
    fetchCards();
    const iv = setInterval(fetchSession, 3000);
    return () => clearInterval(iv);
  }, [fetchSession, fetchCards]);

  const card = cards[selectedCardIdx];
  const calledSet = new Set(session?.called_numbers ?? []);
  const markedSet = new Set([...(card?.marked_numbers ?? []), 0]);

  async function toggleNumber(num: number) {
    if (!card || num === 0) return;
    if (!calledSet.has(num)) {
      toast.error("⚠️ Ese número todavía no fue cantado");
      return;
    }
    const marked = card.marked_numbers ?? [];
    const newMarked = marked.includes(num) ? marked.filter(n => n !== num) : [...marked, num];
    try {
      const res = await fetch(`${BASE}/api/cards/${card.id}/mark`, {
        method: "PATCH",
        headers: authHeader,
        body: JSON.stringify({ marked_numbers: newMarked }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCards(cs => {
          const next = cs.map(c => c.id === card.id ? updated : c);
          cardsRef.current = next;
          return next;
        });
      }
    } catch {}
  }

  async function claimBingo() {
    if (!card) return;
    setClaiming(true);
    try {
      const res = await fetch(`${BASE}/api/cards/${card.id}/claim-bingo`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({ marked_numbers: card.marked_numbers, claimed_at_ms: Date.now() }),
      });
      const data = await res.json();
      if (data.valid) {
        toast.success(`🎉 ${data.message}`, { duration: 10000 });
      } else {
        toast.error(data.message || "Reclamo inválido. Verifica tu cartón.");
      }
    } catch {
      toast.error("Error al reclamar. Intenta de nuevo.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0d0028" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <button onClick={() => navigate(`/juegos/${gameId}`)} className="text-white/70 text-sm flex items-center gap-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Salir
        </button>
        <div className="flex items-center gap-2">
          <div className="live-badge"><div className="live-dot" />EN VIVO</div>
          <span className="text-white/60 text-xs">Juego #{gameId}</span>
        </div>
        <span className="text-white/60 text-xs">{session?.called_numbers?.length ?? 0} 🎱</span>
      </div>

      {/* New number alert banner */}
      {newNumberAlert && (
        <div className="text-center py-2.5 text-sm font-black"
          style={{ background: "linear-gradient(90deg, hsl(42 98% 52%), hsl(38 98% 48%))", color: "#1a0050", animation: "feed-slide 0.3s ease-out" }}>
          🎱 ¡Nuevo número: <span className="text-xl">{newNumberAlert}</span> — marcado automáticamente!
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Last called + recent numbers */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-white/40 text-xs mb-1">Último</p>
            {session?.last_called_number ? (
              <div className="number-ball w-16 h-16 text-2xl"
                style={{ background: "linear-gradient(135deg, hsl(258 72% 35%), hsl(280 60% 50%))", boxShadow: "0 0 20px rgba(160, 60, 255, 0.5)" }}>
                {session.last_called_number}
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white/30 font-black text-xl"
                style={{ background: "rgba(255,255,255,0.06)" }}>—</div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-white/40 text-xs mb-1.5">Cantados</p>
            <div className="flex flex-wrap gap-1.5">
              {(session?.called_numbers ?? []).slice(-9).reverse().map((n, i) => (
                <div key={n} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: i === 0 ? "hsl(42 98% 52%)" : "rgba(255,255,255,0.12)", color: i === 0 ? "#1a0050" : "rgba(255,255,255,0.7)" }}>
                  {n}
                </div>
              ))}
              {(session?.called_numbers?.length ?? 0) > 9 && (
                <button className="text-xs text-white/40 underline" onClick={() => setShowAllNumbers(v => !v)}>
                  {showAllNumbers ? "menos" : `+${(session?.called_numbers?.length ?? 0) - 9}`}
                </button>
              )}
            </div>
          </div>
        </div>

        {showAllNumbers && session && session.called_numbers.length > 0 && (
          <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
            <p className="text-white/40 text-xs mb-2">Todos ({session.called_numbers.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {session.called_numbers.map(n => (
                <div key={n} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}>{n}</div>
              ))}
            </div>
          </div>
        )}

        {/* Auto-mark info */}
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <p className="text-white/40 text-xs">Los números se marcan automáticamente en tu cartón</p>
        </div>

        {/* Card selector */}
        {cards.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {cards.map((c, i) => (
              <button key={c.id} onClick={() => setSelectedCardIdx(i)}
                className="shrink-0 px-3 py-1.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: i === selectedCardIdx ? "hsl(var(--primary))" : "rgba(255,255,255,0.1)",
                  color: "white",
                  border: i === selectedCardIdx ? "none" : "1px solid rgba(255,255,255,0.15)",
                }}>
                Cartón {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Bingo Card */}
        {cards.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">🎱</p>
            <p className="text-white font-bold">No tienes cartones activos</p>
            <button className="mt-4 btn-primary max-w-xs mx-auto" onClick={() => navigate(`/juegos/${gameId}`)}>
              Comprar cartones
            </button>
          </div>
        ) : card ? (
          <>
            <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ border: "2px solid rgba(255,255,255,0.15)" }}>
              <div className="grid grid-cols-5">
                {LETTERS.map((l, i) => (
                  <div key={l} className="py-2.5 text-center font-black text-lg"
                    style={{ background: LETTER_COLORS[i], color: "white", fontFamily: "'Poppins', sans-serif" }}>
                    {l}
                  </div>
                ))}
              </div>
              {card.numbers.map((row, ri) => (
                <div key={ri} className="grid grid-cols-5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  {row.map((num, ci) => {
                    const isFree = num === 0;
                    const isMarked = markedSet.has(num);
                    const isCalled = !isFree && calledSet.has(num);
                    return (
                      <button key={`${ri}-${ci}`}
                        onClick={() => !isFree && toggleNumber(num)}
                        className={`bingo-cell ${isFree ? "free" : ""} ${isMarked && !isFree ? "marked" : ""}`}
                        style={{
                          minHeight: 52,
                          borderRight: ci < 4 ? "1px solid rgba(255,255,255,0.08)" : undefined,
                          background: isMarked && !isFree ? undefined : isFree ? undefined : isCalled ? "rgba(255,220,0,0.12)" : "rgba(255,255,255,0.04)",
                          color: isMarked && !isFree ? undefined : isCalled ? "hsl(42 98% 65%)" : "rgba(255,255,255,0.7)",
                          fontSize: "1rem",
                        }}>
                        {isFree ? "⭐" : num}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="text-center text-white/40 text-xs">
              Marcado automático activado · {markedSet.size - 1} marcados de {session?.called_numbers?.length ?? 0} cantados
            </p>
          </>
        ) : null}
      </div>

      {/* BINGO button */}
      {card && (
        <div className="shrink-0 px-4 pb-6 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button className="bingo-btn w-full h-16 rounded-2xl text-2xl disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={claimBingo} disabled={claiming}>
            {claiming ? (
              <span className="flex items-center justify-center gap-2 text-base">
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Verificando...
              </span>
            ) : "¡BINGO! 🎉"}
          </button>
          <p className="text-center text-white/30 text-xs mt-2">Solo presiona cuando completes el patrón ganador</p>
        </div>
      )}
    </div>
  );
}
