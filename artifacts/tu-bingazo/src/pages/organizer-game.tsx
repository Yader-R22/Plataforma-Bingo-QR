import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { useSetLayoutConfig } from "@/components/AppLayout";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const BINGO_COL_COLORS: Record<string, string> = {
  B: "#2563eb",
  I: "#16a34a",
  N: "#d97706",
  G: "#dc2626",
  O: "#7c3aed",
};

function bingoLetter(n: number): string {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}

function bingoLabel(n: number): string {
  return `${bingoLetter(n)}${n}`;
}

const GAME_MODE_LABELS: Record<string, string> = {
  full_card: "🃏 Cartón completo",
  horizontal: "➡ Línea horizontal",
  vertical: "⬇ Línea vertical",
  diagonal: "↗ Diagonal",
  quina: "📏 Quina",
  esquinas: "🔲 Esquinas",
  cruz: "✝ Cruz",
  x_doble: "✖ X doble",
};

interface GameData {
  id: number;
  title: string;
  status: string;
  game_mode: string;
  prize_amount: number;
  current_round: number;
  total_rounds: number;
  called_numbers: number[];
  round_history: Array<{ round: number; called_numbers: number[] }>;
  rounds?: Array<{ game_mode: string; max_winners: number; prize_amount: number }>;
  participant_count: number;
  online_count?: number;
  organizer_user_id?: number | null;
}

interface WinnerEntry {
  id: number;
  user_name: string;
  user_department: string;
  prize_amount: number;
  place: number;
  round: number;
}

export default function OrganizerGamePage() {
  const params = useParams<{ id: string }>();
  const gameId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const { token, user } = useAuthStore();
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [numberInput, setNumberInput] = useState("");
  const [winners, setWinners] = useState<Record<number, WinnerEntry[]>>({});
  const [finishing, setFinishing] = useState(false);

  useSetLayoutConfig({ title: "Conducir Bingo", hideNav: true });

  const authH = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const loadGame = useCallback(async () => {
    if (!gameId) return;
    const r = await fetch(`${BASE}/api/games/${gameId}`, { headers: authH() });
    if (!r.ok) { setLoading(false); return; }
    const data = await r.json();
    setGame(data);
    setLoading(false);
  }, [gameId, authH]);

  const loadWinners = useCallback(async () => {
    if (!gameId) return;
    const r = await fetch(`${BASE}/api/games/${gameId}/winners`, { headers: authH() });
    if (r.ok) {
      const data: WinnerEntry[] = await r.json();
      const byRound: Record<number, WinnerEntry[]> = {};
      for (const w of data) {
        if (!byRound[w.round]) byRound[w.round] = [];
        byRound[w.round].push(w);
      }
      setWinners(byRound);
    }
  }, [gameId, authH]);

  useEffect(() => {
    loadGame();
    loadWinners();
  }, [loadGame, loadWinners]);

  // Poll session (called numbers + online count) every 5s when active
  useEffect(() => {
    if (!game || game.status !== "active") return;
    const interval = setInterval(async () => {
      const r = await fetch(`${BASE}/api/games/${gameId}/session`, { headers: authH() });
      if (!r.ok) return;
      const s = await r.json();
      setGame(prev => prev ? {
        ...prev,
        called_numbers: s.called_numbers ?? prev.called_numbers,
        current_round: s.current_round ?? prev.current_round,
        total_rounds: s.total_rounds ?? prev.total_rounds,
        online_count: s.online_count ?? prev.online_count,
        status: s.game_status === "active" ? "active" : s.game_status === "finished" ? "finished" : prev.status,
      } : null);
    }, 5000);
    return () => clearInterval(interval);
  }, [game?.status, gameId, authH]);

  // Poll winners every 5s when active
  useEffect(() => {
    if (!game || game.status !== "active") return;
    const interval = setInterval(loadWinners, 5000);
    return () => clearInterval(interval);
  }, [game?.status, loadWinners]);

  async function callNumber() {
    if (!game) return;
    let num: number;
    if (numberInput) {
      num = parseInt(numberInput);
      if (num < 1 || num > 75) { toast.error("Número debe ser entre 1 y 75"); return; }
    } else {
      const called = new Set(game.called_numbers ?? []);
      const available = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !called.has(n));
      if (!available.length) { toast.error("Todos los números ya fueron cantados"); return; }
      num = available[Math.floor(Math.random() * available.length)];
    }
    const r = await fetch(`${BASE}/api/games/${gameId}/call-number`, {
      method: "POST", headers: authH(), body: JSON.stringify({ number: num }),
    });
    if (r.ok) {
      toast.success(`🎱 ${bingoLabel(num)} cantado`);
      setNumberInput("");
      setGame(prev => prev ? { ...prev, called_numbers: [...(prev.called_numbers ?? []), num] } : null);
    } else {
      const d = await r.json();
      toast.error(d.error || "Error al cantar número");
    }
  }

  async function doNextRound() {
    if (!game) return;
    const cr = game.current_round ?? 1;
    const nr = cr + 1;
    const total = game.total_rounds ?? 1;
    if (!confirm(`¿Completar la Ronda ${cr} y avanzar a la Ronda ${nr} de ${total}? Los bolillos actuales se guardarán en el historial.`)) return;
    const r = await fetch(`${BASE}/api/games/${gameId}/next-round`, { method: "POST", headers: authH() });
    if (r.ok) {
      const updated = await r.json();
      setGame(prev => prev ? { ...prev, ...updated } : null);
      loadWinners();
      toast.success(`🏁 Ronda ${cr} completada · Iniciando Ronda ${nr}`);
    } else {
      const d = await r.json();
      toast.error(d.error || "Error al avanzar ronda");
    }
  }

  async function doFinish() {
    if (!confirm("¿Finalizar este bingo? Esto cerrará el juego y terminarás tu rol de organizador.")) return;
    setFinishing(true);
    const r = await fetch(`${BASE}/api/games/${gameId}/finish`, { method: "POST", headers: authH() });
    if (r.ok) {
      toast.success("🏁 Bingo finalizado. ¡Gracias por organizarlo!");
      setTimeout(() => navigate("/perfil"), 2000);
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.error || "Error al finalizar");
    }
    setFinishing(false);
  }

  // Verify this organizer is actually assigned to this game
  useEffect(() => {
    if (!loading && game && game.organizer_user_id !== user?.id && !user?.is_admin) {
      toast.error("No estás asignado a este juego");
      navigate("/perfil");
    }
  }, [loading, game, user, navigate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
        <p className="text-2xl">⚠️</p>
        <p className="font-bold text-center">Juego no encontrado</p>
        <button onClick={() => navigate("/perfil")} className="btn-primary">Volver a mi perfil</button>
      </div>
    );
  }

  const calledNums = game.called_numbers ?? [];
  const currentRound = game.current_round ?? 1;
  const totalRounds = game.total_rounds ?? 1;
  const currentWinners = winners[currentRound] ?? [];
  const previewNum = numberInput && parseInt(numberInput) >= 1 && parseInt(numberInput) <= 75 ? parseInt(numberInput) : null;

  return (
    <div className="flex-1 flex flex-col pb-6" style={{ background: "linear-gradient(160deg, #0d0025 0%, #1a0050 40%, #0a0020 100%)", minHeight: "100dvh" }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="live-badge shrink-0"><div className="live-dot" />EN VIVO</div>
          <div className="min-w-0">
            <p className="text-white font-black text-sm leading-tight truncate">{game.title}</p>
            <p className="text-white/50 text-[11px] mt-0.5">
              {GAME_MODE_LABELS[game.game_mode] ?? game.game_mode}
              {totalRounds > 1 && ` · Ronda ${currentRound}/${totalRounds}`}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-white/50 text-[10px]">Bs</p>
          <p className="text-white font-black text-lg leading-none">{Number(game.prize_amount).toLocaleString("es-BO")}</p>
          <p className="text-white/40 text-[10px]">{game.participant_count} cartones</p>
        </div>
      </div>

      {/* Bolillero */}
      <div className="px-4 space-y-3">
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="p-4 space-y-3">
            {/* Input + cantar */}
            <div className="flex items-center gap-2">
              <div className="shrink-0 w-14 h-12 rounded-xl flex flex-col items-center justify-center font-black leading-none"
                style={{ background: previewNum ? BINGO_COL_COLORS[bingoLetter(previewNum)] : "rgba(255,255,255,0.1)" }}>
                <span className="text-white text-[11px] font-black">
                  {previewNum ? bingoLetter(previewNum) : "?"}
                </span>
                <span className="text-white/80 text-sm font-black leading-tight">
                  {previewNum ?? "—"}
                </span>
              </div>
              <input
                type="number" min="1" max="75" placeholder="Número 1–75 (vacío = aleatorio)"
                className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-3 py-3 text-sm font-bold border border-white/15 outline-none focus:border-white/40 transition-colors"
                value={numberInput}
                onChange={e => setNumberInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && callNumber()}
              />
            </div>
            <button
              onClick={callNumber}
              className="w-full py-3.5 rounded-xl font-black text-base transition-all active:scale-95"
              style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
              🎱 Cantar Número
            </button>
          </div>

          {/* Último número cantado */}
          {calledNums.length > 0 && (() => {
            const last = calledNums[calledNums.length - 1];
            return (
              <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-4 pt-3">
                  <div className="shrink-0 text-center">
                    <p className="text-white/40 text-[10px] mb-1.5">Último</p>
                    <div className="w-16 h-16 rounded-full flex flex-col items-center justify-center font-black leading-none"
                      style={{ background: BINGO_COL_COLORS[bingoLetter(last)], boxShadow: `0 0 20px ${BINGO_COL_COLORS[bingoLetter(last)]}60` }}>
                      <span className="text-white text-[11px] font-black">{bingoLetter(last)}</span>
                      <span className="text-white text-xl font-black leading-tight">{last}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/40 text-[10px] mb-2">Cantados ({calledNums.length}/75)</p>
                    <div className="flex flex-wrap gap-1">
                      {[...calledNums].reverse().slice(0, 20).map((n, i) => (
                        <span key={n}
                          className="h-6 px-1.5 rounded-full flex items-center text-[11px] font-black"
                          style={{
                            background: i === 0 ? BINGO_COL_COLORS[bingoLetter(n)] : "rgba(255,255,255,0.12)",
                            color: "rgba(255,255,255,0.9)",
                            minWidth: 32,
                            justifyContent: "center",
                          }}>
                          {bingoLabel(n)}
                        </span>
                      ))}
                      {calledNums.length > 20 && (
                        <span className="h-6 px-1.5 rounded-full flex items-center text-[11px] text-white/40"
                          style={{ background: "rgba(255,255,255,0.07)" }}>
                          +{calledNums.length - 20}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Historial de rondas anteriores */}
        {(game.round_history?.length ?? 0) > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-4 py-3">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Historial de rondas</p>
              <div className="space-y-2">
                {game.round_history.map(rh => {
                  const roundCfg = game.rounds?.[rh.round - 1];
                  const rhWinners = winners[rh.round] ?? [];
                  return (
                    <div key={rh.round} className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-white/80 text-[11px] font-black">
                          Ronda {rh.round}{roundCfg?.game_mode ? ` · ${GAME_MODE_LABELS[roundCfg.game_mode] ?? roundCfg.game_mode}` : ""}
                        </span>
                        <span className="text-white/40 text-[10px]">{rh.called_numbers.length} bolillos</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {rh.called_numbers.slice(0, 15).map(n => (
                          <span key={n} className="h-5 px-1 rounded-full flex items-center text-[10px] font-black"
                            style={{ background: BINGO_COL_COLORS[bingoLetter(n)], color: "white", minWidth: 26, justifyContent: "center" }}>
                            {bingoLabel(n)}
                          </span>
                        ))}
                        {rh.called_numbers.length > 15 && (
                          <span className="h-5 px-1 rounded-full flex items-center text-[10px] text-white/40"
                            style={{ background: "rgba(255,255,255,0.07)" }}>+{rh.called_numbers.length - 15}</span>
                        )}
                      </div>
                      {rhWinners.length > 0 && rhWinners.map(w => (
                        <div key={w.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 mt-1"
                          style={{ background: "hsl(42 98% 52% / 0.12)", border: "1px solid hsl(42 98% 52% / 0.2)" }}>
                          <p className="text-[11px] font-black" style={{ color: "hsl(42 98% 65%)" }}>🏆 {w.user_name}</p>
                          <p className="text-[11px] font-black" style={{ color: "hsl(42 98% 60%)" }}>Bs {parseFloat(String(w.prize_amount)).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Ganadores ronda actual */}
        {currentWinners.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(42 98% 52% / 0.08)", border: "1px solid hsl(42 98% 52% / 0.2)" }}>
            <div className="px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "hsl(42 98% 70%)" }}>
                🏆 Ganadores Ronda {currentRound}
              </p>
              <div className="space-y-2">
                {currentWinners.map(w => (
                  <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.25)" }}>
                    <div>
                      <p className="text-[13px] font-black leading-tight" style={{ color: "hsl(42 98% 70%)" }}>
                        🏆 {w.user_name}
                      </p>
                      <p className="text-[10px] text-white/50 mt-0.5">{w.user_department} · Puesto #{w.place}</p>
                    </div>
                    <p className="shrink-0 text-[14px] font-black" style={{ color: "hsl(42 98% 60%)" }}>
                      Bs {parseFloat(String(w.prize_amount)).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer: avanzar ronda o finalizar */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-white/40 text-xs">{calledNums.length} números cantados · {game.online_count ?? game.participant_count} en línea</span>
            <div className="flex items-center gap-2 shrink-0">
              {totalRounds > 1 && currentRound < totalRounds ? (
                <>
                  <button onClick={doNextRound}
                    className="text-sm font-black px-4 py-2 rounded-xl transition-all active:scale-95"
                    style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
                    🏁 Ronda {currentRound} →
                  </button>
                  <button onClick={doFinish} disabled={finishing} title="Finalizar juego"
                    className="text-[11px] font-bold transition-colors"
                    style={{ color: "hsl(0 75% 55%)" }}>⏹</button>
                </>
              ) : (
                <button onClick={doFinish} disabled={finishing}
                  className="text-sm font-black px-4 py-2 rounded-xl transition-all active:scale-95"
                  style={{ background: "hsl(0 75% 50% / 0.2)", color: "hsl(0 75% 70%)", border: "1px solid hsl(0 75% 50% / 0.3)" }}>
                  {finishing ? "Finalizando..." : "⏹ Finalizar Bingo"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
