import { useLocation } from "wouter";
import { useListMyCards } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";

const LETTERS = ["B", "I", "N", "G", "O"];

function statusBadge(status: string, paymentStatus: string) {
  if (paymentStatus === "pending") return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">Pendiente de pago</Badge>;
  if (status === "active") return <Badge className="bg-green-500 text-white">Activo</Badge>;
  if (status === "winner") return <Badge className="bg-yellow-500 text-white">🏆 Ganador</Badge>;
  if (status === "expired") return <Badge variant="outline">Expirado</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default function MyCardsPage() {
  const [, navigate] = useLocation();
  const { data: cards, isLoading } = useListMyCards();

  return (
    <AppLayout>
      <div className="p-4 max-w-xl mx-auto">
        <h1 className="text-2xl font-black mb-4">Mis Cartones</h1>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : !cards?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="text-5xl mb-3">🎱</div>
            <p className="font-semibold">No tienes cartones todavía</p>
            <p className="text-sm mt-1">Compra cartones en un juego disponible</p>
            <Button className="mt-4" onClick={() => navigate("/juegos")}>Ver juegos</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map((card: any) => (
              <div key={card.id} className="bg-card border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 flex items-center justify-between border-b">
                  <div>
                    <p className="font-semibold text-sm">Cartón #{card.id}</p>
                    <p className="text-xs text-muted-foreground">Juego #{card.game_id}</p>
                  </div>
                  {statusBadge(card.status, card.payment_status)}
                </div>

                {/* Mini card view */}
                <div className="p-3">
                  <div className="grid grid-cols-5 gap-0 max-w-[200px] mx-auto">
                    {LETTERS.map(l => (
                      <div key={l} className="text-center text-xs font-black text-primary py-0.5">{l}</div>
                    ))}
                    {(card.numbers as number[][]).map((row: number[], ri: number) =>
                      row.map((num: number, ci: number) => {
                        const isFree = num === 0;
                        const isMarked = (card.marked_numbers as number[]).includes(num);
                        return (
                          <div
                            key={`${ri}-${ci}`}
                            className={`
                              text-center text-xs font-semibold py-1 rounded-sm
                              ${isFree ? "bg-secondary/30 text-secondary-foreground font-black" : ""}
                              ${isMarked && !isFree ? "bg-primary text-white" : ""}
                              ${!isMarked && !isFree ? "text-foreground" : ""}
                            `}
                          >
                            {isFree ? "⭐" : num}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {card.status === "active" && (
                  <div className="px-4 py-3 border-t">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => navigate(`/juegos/${card.game_id}/jugar`)}
                    >
                      🎯 Jugar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
