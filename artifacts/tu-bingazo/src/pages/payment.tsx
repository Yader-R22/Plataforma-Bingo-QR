import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useSetLayoutConfig } from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function PaymentPage() {
  useSetLayoutConfig({});
  const [, params] = useRoute("/pago/:checkoutId");
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);

  const checkoutId = params?.checkoutId ?? "";
  const [status, setStatus] = useState<"pending" | "completed" | "failed">("pending");
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!checkoutId || !token) return;

    let attempts = 0;
    const maxAttempts = 40; // Poll for ~2 minutes

    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/api/payments/${checkoutId}/status`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "completed") {
            setStatus("completed");
            setPolling(false);
            return;
          }
          if (data.status === "failed") {
            setStatus("failed");
            setPolling(false);
            return;
          }
        }
      } catch {}

      attempts++;
      if (attempts >= maxAttempts) {
        setPolling(false);
      }
    };

    poll();
    const interval = setInterval(() => {
      if (!polling) { clearInterval(interval); return; }
      poll();
    }, 3000);

    return () => clearInterval(interval);
  }, [checkoutId, token]);

  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          {status === "pending" && (
            <div className="bg-card border rounded-3xl p-8 shadow-lg">
              <div className="text-6xl mb-4 animate-bounce">⏳</div>
              <h2 className="text-xl font-black mb-2">Esperando tu pago</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Completa el pago en la ventana de PagosYa que se abrió. Tus cartones se activarán automáticamente.
              </p>
              <div className="flex justify-center mb-4">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Checkout ID: {checkoutId}</p>
              <div className="mt-6 space-y-2">
                <Button variant="outline" className="w-full" onClick={() => navigate("/mis-cartones")}>
                  Ver mis cartones
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => navigate("/juegos")}>
                  Volver a juegos
                </Button>
              </div>
            </div>
          )}

          {status === "completed" && (
            <div className="bg-card border rounded-3xl p-8 shadow-lg">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-black mb-2 text-green-600">¡Pago confirmado!</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Tus cartones están activos. ¡Buena suerte en el juego!
              </p>
              <Button className="w-full" onClick={() => navigate("/mis-cartones")}>
                Ver mis cartones 🎱
              </Button>
            </div>
          )}

          {status === "failed" && (
            <div className="bg-card border rounded-3xl p-8 shadow-lg">
              <div className="text-6xl mb-4">❌</div>
              <h2 className="text-xl font-black mb-2 text-destructive">Pago fallido</h2>
              <p className="text-muted-foreground text-sm mb-6">
                No pudimos confirmar tu pago. Intenta de nuevo.
              </p>
              <div className="space-y-2">
                <Button className="w-full" onClick={() => navigate("/juegos")}>
                  Volver a juegos
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
