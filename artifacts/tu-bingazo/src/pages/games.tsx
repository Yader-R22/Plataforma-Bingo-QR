import { useState } from "react";
import { Link } from "wouter";
import { useListGames } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppLayout from "@/components/AppLayout";

function statusLabel(status: string) {
  if (status === "active") return { label: "EN VIVO", color: "bg-green-500 text-white animate-pulse" };
  if (status === "upcoming") return { label: "PRÓXIMO", color: "bg-primary/20 text-primary" };
  return { label: "FINALIZADO", color: "bg-muted text-muted-foreground" };
}

function typeLabel(type: string) {
  if (type === "daily") return "Diario";
  if (type === "weekly") return "Semanal";
  return "Mensual";
}

function typeClass(type: string) {
  if (type === "daily") return "game-card-daily";
  if (type === "weekly") return "game-card-weekly";
  return "game-card-monthly";
}

export default function GamesPage() {
  const [filter, setFilter] = useState<string>("all");
  const user = useAuthStore(s => s.user);

  const queryParams = filter !== "all" ? { type: filter as "daily" | "weekly" | "monthly" } : undefined;
  const { data: games, isLoading } = useListGames(queryParams as any);

  const filtered = games ?? [];

  return (
    <AppLayout>
      <div className="p-4 max-w-xl mx-auto">
        {user?.status === "pending" && (
          <div className="mb-4 rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 flex items-center gap-2">
            <span>⏳</span>
            <span>Tu cuenta está pendiente de verificación. Podrás comprar cartones una vez activada.</span>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black">Juegos de Bingo</h1>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="mb-4">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">Todos</TabsTrigger>
            <TabsTrigger value="daily" className="flex-1">Diarios</TabsTrigger>
            <TabsTrigger value="weekly" className="flex-1">Semanales</TabsTrigger>
            <TabsTrigger value="monthly" className="flex-1">Mensuales</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="text-5xl mb-3">🎱</div>
            <p className="font-semibold">No hay juegos disponibles</p>
            <p className="text-sm mt-1">Vuelve pronto para nuevos sorteos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((game: any) => {
              const s = statusLabel(game.status);
              return (
                <Link key={game.id} href={`/juegos/${game.id}`}>
                  <div className={`bg-card border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${typeClass(game.type)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                          <span className="text-xs text-muted-foreground">{typeLabel(game.type)}</span>
                        </div>
                        <h3 className="font-bold text-foreground leading-tight">{game.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(game.draw_date).toLocaleDateString("es-BO", {
                            weekday: "short", day: "numeric", month: "short",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-black text-secondary prize-glow">
                          Bs {game.prize_amount.toLocaleString("es-BO")}
                        </p>
                        <p className="text-xs text-muted-foreground">Premio</p>
                        <p className="text-xs text-primary font-semibold mt-1">
                          Bs {game.card_price} / cartón
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <span className="text-xs text-muted-foreground">👥 {game.participant_count} participantes</span>
                      <Button size="sm" variant={game.status === "active" ? "default" : "outline"}>
                        {game.status === "active" ? "🎯 Jugar ahora" : "Ver detalles"}
                      </Button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
