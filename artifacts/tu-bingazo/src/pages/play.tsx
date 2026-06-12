import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LETTERS = ["B", "I", "N", "G", "O"];
const LETTER_COLORS = ["#e53e3e", "#d69e2e", "#38a169", "#3182ce", "#805ad5"];

function bingoLabel(n: number): string {
  if (n >= 1 && n <= 15) return `B${n}`;
  if (n >= 16 && n <= 30) return `I${n}`;
  if (n >= 31 && n <= 45) return `N${n}`;
  if (n >= 46 && n <= 60) return `G${n}`;
  return `O${n}`;
}

function bingoColor(n: number): string {
  const idx = Math.min(Math.floor((n - 1) / 15), 4);
  return LETTER_COLORS[idx];
}
const MODE_LABEL: Record<string, string> = {
  full_card: "Cartón completo",
  horizontal: "Línea horizontal",
  vertical: "Línea vertical",
  diagonal: "Diagonal",
  quina: "Quina",
};

const MODE_HINT: Record<string, string> = {
  full_card: "Marca todos los 24 números para ganar",
  horizontal: "Completa una fila completa para ganar",
  vertical: "Completa una columna completa para ganar",
  diagonal: "Completa una diagonal completa para ganar",
  quina: "Completa una fila completa para ganar",
};

function checkBingoPattern(
  matrix: number[][],
  markedSet: Set<number>,
  gameMode: string,
): { valid: boolean; winningCells: Set<string> } {
  const isHit = (r: number, c: number) => {
    const n = matrix[r][c];
    return n === 0 || markedSet.has(n);
  };
  const cellKey = (r: number, c: number) => `${r},${c}`;

  if (gameMode === "full_card") {
    const cells: Set<string> = new Set();
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (!isHit(r, c)) return { valid: false, winningCells: new Set() };
        cells.add(cellKey(r, c));
      }
    }
    return { valid: true, winningCells: cells };
  }

  if (gameMode === "horizontal" || gameMode === "quina") {
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every(c => isHit(r, c))) {
        return { valid: true, winningCells: new Set([0, 1, 2, 3, 4].map(c => cellKey(r, c))) };
      }
    }
  }

  if (gameMode === "vertical") {
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every(r => isHit(r, c))) {
        return { valid: true, winningCells: new Set([0, 1, 2, 3, 4].map(r => cellKey(r, c))) };
      }
    }
  }

  if (gameMode === "diagonal") {
    if ([0, 1, 2, 3, 4].every(i => isHit(i, i))) {
      return { valid: true, winningCells: new Set([0, 1, 2, 3, 4].map(i => cellKey(i, i))) };
    }
    if ([0, 1, 2, 3, 4].every(i => isHit(i, 4 - i))) {
      return { valid: true, winningCells: new Set([0, 1, 2, 3, 4].map(i => cellKey(i, 4 - i))) };
    }
  }

  return { valid: false, winningCells: new Set() };
}

interface GameSession {
  game_id: number;
  game_status: string;
  called_numbers: number[];
  last_called_number: number | null;
  game_mode: string;
  current_round: number;
  total_rounds: number;
  updated_at: string;
}

interface BingoCard {
  id: number;
  numbers: number[][];
  marked_numbers: number[];
  status: string;
  payment_status: string;
}

interface LiveWinner {
  id: number;
  user_name: string | null;
  user_department: string | null;
  round: number;
  place: number;
  prize_amount: number;
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
  const [gameTitle, setGameTitle] = useState<string | null>(null);
  const [liveWinners, setLiveWinners] = useState<LiveWinner[]>([]);

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

  const fetchWinners = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/games/${gameId}/winners`, { headers: authHeader });
      if (res.ok) setLiveWinners(await res.json());
    } catch {}
  }, [gameId, token]);

  useEffect(() => {
    fetch(`${BASE}/api/games/${gameId}`)
      .then(r => r.ok ? r.json() : null)
      .then(g => { if (g?.title) setGameTitle(g.title); })
      .catch(() => {});
    fetchSession();
    fetchCards();
    fetchWinners();
    const iv = setInterval(() => { fetchSession(); fetchWinners(); }, 3000);
    return () => clearInterval(iv);
  }, [fetchSession, fetchCards, fetchWinners]);

  const card = cards[selectedCardIdx];
  const calledSet = new Set(session?.called_numbers ?? []);
  const markedSet = new Set([...(card?.marked_numbers ?? []), 0]);

  const bingoResult = (card && session?.game_mode && session.game_status === "active")
    ? checkBingoPattern(card.numbers, markedSet, session.game_mode)
    : { valid: false, winningCells: new Set<string>() };
  const canClaimBingo = bingoResult.valid;

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
      } else if (data.expired) {
        toast.error(data.message, { duration: 8000, description: "Recuerda: debes gritar BINGO antes de que se cante el siguiente bolillo." });
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
        <div className="flex items-center gap-2 min-w-0">
          {session?.game_status === "active" && (
            <div className="live-badge shrink-0"><div className="live-dot" />EN VIVO</div>
          )}
          {session && session.game_status !== "active" && (
            <div className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
              {session.game_status === "finished" ? "FINALIZADO" : "EN ESPERA"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white text-xs font-black truncate leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {gameTitle ?? `Juego #${gameId}`}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {session?.game_mode && (
                <p className="text-white/50 text-[10px] leading-tight truncate">
                  {MODE_LABEL[session.game_mode] ?? session.game_mode}
                </p>
              )}
              {session && (session.total_rounds ?? 1) > 1 && (
                <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full leading-tight"
                  style={{ background: "hsl(42 98% 52% / 0.2)", color: "hsl(42 98% 60%)" }}>
                  Ronda {session.current_round}/{session.total_rounds}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="text-white/60 text-xs">{session?.called_numbers?.length ?? 0} 🎱</span>
      </div>

      {/* New number alert banner */}
      {newNumberAlert && (
        <div className="text-center py-2.5 text-sm font-black"
          style={{ background: "linear-gradient(90deg, hsl(42 98% 52%), hsl(38 98% 48%))", color: "#1a0050", animation: "feed-slide 0.3s ease-out" }}>
          🎱 ¡Nuevo bolillo: <span className="text-xl font-black">{newNumberAlert ? bingoLabel(newNumberAlert) : ""}</span> — marcado automáticamente!
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Last called + recent numbers */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-white/40 text-xs mb-1">Último bolillo</p>
            {session?.last_called_number ? (
              <div className="w-16 h-16 rounded-full flex flex-col items-center justify-center font-black leading-none"
                style={{ background: bingoColor(session.last_called_number), boxShadow: `0 0 20px ${bingoColor(session.last_called_number)}80` }}>
                <span className="text-white text-[11px] font-black uppercase tracking-wider">
                  {bingoLabel(session.last_called_number).replace(/\d+/, "")}
                </span>
                <span className="text-white text-xl font-black leading-tight">
                  {session.last_called_number}
                </span>
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
                <div key={n} className="h-7 px-2 rounded-full flex items-center justify-center text-[11px] font-black min-w-[32px]"
                  style={{
                    background: i === 0 ? bingoColor(n) : "rgba(255,255,255,0.12)",
                    color: i === 0 ? "white" : "rgba(255,255,255,0.7)",
                    boxShadow: i === 0 ? `0 0 8px ${bingoColor(n)}60` : "none",
                  }}>
                  {bingoLabel(n)}
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
                <div key={n} className="h-7 px-2 rounded-full flex items-center justify-center text-[11px] font-black min-w-[32px]"
                  style={{ background: bingoColor(n), color: "white" }}>
                  {bingoLabel(n)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Winners */}
        {liveWinners.length > 0 && (
          <div className="rounded-2xl p-4" style={{ background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.2)" }}>
            <p className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: "hsl(42 98% 60%)" }}>
              🏆 Ganadores del sorteo
            </p>
            <div className="space-y-2.5">
              {liveWinners.map(w => (
                <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-black px-1.5 py-0.5 rounded-full"
                        style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
                        #{w.place}
                      </span>
                      <p className="text-white font-black text-sm leading-tight truncate">
                        {w.user_name ?? "Jugador"}
                      </p>
                    </div>
                    <p className="text-white/50 text-xs pl-0.5">
                      {w.user_department ?? "Bolivia"} · Ronda {w.round}
                    </p>
                  </div>
                  <p className="shrink-0 font-black text-lg" style={{ color: "hsl(42 98% 60%)", fontFamily: "'Poppins', sans-serif" }}>
                    Bs {w.prize_amount.toFixed(0)}
                  </p>
                </div>
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
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
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
                    const isWinning = bingoResult.winningCells.has(`${ri},${ci}`);
                    return (
                      <button key={`${ri}-${ci}`}
                        onClick={() => !isFree && toggleNumber(num)}
                        className={`bingo-cell ${isFree ? "free" : ""} ${isMarked && !isFree ? "marked" : ""}`}
                        style={{
                          minHeight: 52,
                          borderRight: ci < 4 ? "1px solid rgba(255,255,255,0.08)" : undefined,
                          background: isWinning
                            ? "linear-gradient(135deg, hsl(42 98% 50%), hsl(38 98% 40%))"
                            : isMarked && !isFree ? undefined
                            : isFree ? undefined
                            : isCalled ? "rgba(255,220,0,0.12)"
                            : "rgba(255,255,255,0.04)",
                          color: isWinning ? "#1a0050"
                            : isMarked && !isFree ? undefined
                            : isCalled ? "hsl(42 98% 65%)"
                            : "rgba(255,255,255,0.7)",
                          fontSize: "1rem",
                          fontWeight: isWinning ? 900 : undefined,
                          boxShadow: isWinning ? "inset 0 0 12px rgba(255,200,0,0.4)" : undefined,
                          transform: isWinning ? "scale(1.04)" : undefined,
                          zIndex: isWinning ? 1 : undefined,
                          transition: "all 0.2s ease",
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
      {card && session?.game_status === "active" && (
        <div className="shrink-0 px-4 pb-6 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {canClaimBingo ? (
            <>
              <button className="bingo-btn w-full h-16 rounded-2xl text-2xl"
                onClick={claimBingo} disabled={claiming}
                style={{ animation: claiming ? undefined : "bingo-pulse 0.8s ease-in-out infinite" }}>
                {claiming ? (
                  <span className="flex items-center justify-center gap-2 text-base">
                    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Verificando...
                  </span>
                ) : "¡BINGO! 🎉"}
              </button>
              <p className="text-center text-green-400 text-xs font-bold mt-2">
                ✅ Tienes un {MODE_LABEL[session?.game_mode ?? ""] ?? "patrón"} válido — ¡presiona ya!
              </p>
            </>
          ) : (
            <>
              <button className="bingo-btn w-full h-16 rounded-2xl text-2xl opacity-30 cursor-not-allowed"
                disabled>
                BINGO
              </button>
              <p className="text-center text-white/40 text-xs mt-2">
                🎯 {session?.game_mode ? (MODE_HINT[session.game_mode] ?? "Completa el patrón requerido") : "Esperando modo de juego..."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
