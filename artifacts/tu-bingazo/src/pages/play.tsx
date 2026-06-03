import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LETTERS = ["B", "I", "N", "G", "O"];

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

function colLetter(col: number) { return LETTERS[col]; }

export default function PlayPage() {
  const [, params] = useRoute("/juegos/:id/jugar");
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);

  const gameId = parseInt(params?.id ?? "0");
  const [session, setSession] = useState<GameSession | null>(null);
  const [cards, setCards] = useState<BingoCard[]>([]);
  const [selectedCardIdx, setSelectedCardIdx] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [lastCalledAnimation, setLastCalledAnimation] = useState<number | null>(null);

  const authHeader = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/games/${gameId}/session`, { headers: authHeader });
      if (res.ok) {
        const data = await res.json();
        setSession(prev => {
          if (prev && data.last_called_number && data.last_called_number !== prev.last_called_number) {
            setLastCalledAnimation(data.last_called_number);
            setTimeout(() => setLastCalledAnimation(null), 1200);
          }
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
        setCards(data.filter((c: BingoCard) => c.payment_status === "paid"));
      }
    } catch {}
  }, [gameId, token]);

  useEffect(() => {
    fetchSession();
    fetchCards();
    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, [fetchSession, fetchCards]);

  const card = cards[selectedCardIdx];
  const calledSet = new Set(session?.called_numbers ?? []);

  async function toggleNumber(num: number) {
    if (!card || num === 0) return;
    if (!calledSet.has(num)) {
      toast.error("Este número todavía no fue cantado");
      return;
    }
    const marked = card.marked_numbers ?? [];
    const newMarked = marked.includes(num)
      ? marked.filter(n => n !== num)
      : [...marked, num];
    try {
      const res = await fetch(`${BASE}/api/cards/${card.id}/mark`, {
        method: "PATCH",
        headers: authHeader,
        body: JSON.stringify({ marked_numbers: newMarked }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCards(cs => cs.map(c => c.id === card.id ? updated : c));
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
        body: JSON.stringify({
          marked_numbers: card.marked_numbers,
          claimed_at_ms: Date.now(),
        }),
      });
      const data = await res.json();
      if (data.valid) {
        toast.success(`🎉 ¡${data.message}`, { duration: 8000 });
      } else {
        toast.error(data.message || "Reclamo inválido");
      }
    } catch {
      toast.error("Error al reclamar bingo");
    } finally {
      setClaiming(false);
    }
  }

  const markedSet = new Set([...(card?.marked_numbers ?? []), 0]);

  return (
    <AppLayout hideNav>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5">
        {/* Header */}
        <div className="bg-primary text-white px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(`/juegos/${gameId}`)} className="text-white/80 hover:text-white text-sm">← Salir</button>
          <span className="font-bold text-sm">Juego #{gameId}</span>
          <span className="text-xs bg-green-400/30 text-green-100 px-2 py-0.5 rounded-full">🔴 EN VIVO</span>
        </div>

        <div className="p-4 max-w-md mx-auto">
          {/* Last called number */}
          <div className="text-center mb-4">
            <p className="text-xs text-muted-foreground mb-1">Último número</p>
            {session?.last_called_number ? (
              <div className={`inline-flex items-center justify-center w-20 h-20 number-ball text-3xl font-black mx-auto ${lastCalledAnimation === session.last_called_number ? "called-highlight" : ""}`}>
                {session.last_called_number}
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted text-muted-foreground text-2xl font-black mx-auto">
                —
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {(session?.called_numbers?.length ?? 0)} números cantados
            </p>
          </div>

          {/* Called numbers mini-track */}
          {session && session.called_numbers.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center mb-4">
              {session.called_numbers.slice(-10).map(n => (
                <span key={n} className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                  {n}
                </span>
              ))}
            </div>
          )}

          {/* Card selector */}
          {cards.length > 1 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {cards.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCardIdx(i)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
                    i === selectedCardIdx
                      ? "bg-primary text-white border-primary"
                      : "bg-card border text-foreground"
                  }`}
                >
                  Cartón {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Bingo Card */}
          {cards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-4xl mb-2">🎱</p>
              <p className="font-semibold">No tienes cartones activos para este juego</p>
              <Button className="mt-3" onClick={() => navigate(`/juegos/${gameId}`)}>
                Comprar cartones
              </Button>
            </div>
          ) : card ? (
            <>
              <div className="bg-card border-2 border-primary/20 rounded-2xl overflow-hidden shadow-lg mb-4">
                {/* Column headers */}
                <div className="grid grid-cols-5 bg-primary">
                  {LETTERS.map(l => (
                    <div key={l} className="text-white font-black text-lg text-center py-2">{l}</div>
                  ))}
                </div>
                {/* Numbers grid */}
                {card.numbers.map((row, ri) => (
                  <div key={ri} className="grid grid-cols-5 divide-x divide-border border-t border-border">
                    {row.map((num, ci) => {
                      const isFree = num === 0;
                      const isMarked = markedSet.has(num);
                      const isCalled = calledSet.has(num) && !isFree;
                      return (
                        <button
                          key={`${ri}-${ci}`}
                          onClick={() => !isFree && toggleNumber(num)}
                          className={`
                            bingo-number aspect-square flex items-center justify-center font-bold text-base
                            ${isFree ? "bingo-number free text-xl" : ""}
                            ${isMarked && !isFree ? "bingo-number marked" : ""}
                            ${!isMarked && isCalled && !isFree ? "bg-secondary/15 text-secondary-foreground" : ""}
                            ${!isMarked && !isCalled && !isFree ? "hover:bg-muted" : ""}
                          `}
                        >
                          {isFree ? "⭐" : num}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Claim button */}
              <button
                onClick={claimBingo}
                disabled={claiming}
                className="bingo-claim-btn w-full h-14 rounded-2xl text-white text-xl font-black tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claiming ? "Verificando..." : "¡BINGO! 🎉"}
              </button>
              <p className="text-center text-xs text-muted-foreground mt-2">
                Solo toca cuando hayas completado el patrón ganador
              </p>
            </>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}
