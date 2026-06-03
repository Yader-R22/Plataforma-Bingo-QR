import { useState } from "react";
import { useGetWallet, useListWithdrawals } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function WalletPage() {
  const token = useAuthStore(s => s.token);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [bankInfo, setBankInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: wallet, refetch: refetchWallet } = useGetWallet();
  const { data: withdrawals, refetch: refetchWithdrawals } = useListWithdrawals();

  async function requestWithdrawal(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { toast.error("Ingresa un monto válido"); return; }
    if (wallet && numAmount > wallet.balance) { toast.error("Saldo insuficiente"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/wallet/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          amount: numAmount,
          method,
          bank_account_info: bankInfo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al solicitar retiro"); return; }
      toast.success("Solicitud de retiro enviada. El administrador procesará tu pago.");
      setShowForm(false);
      setAmount("");
      refetchWallet();
      refetchWithdrawals();
    } catch {
      toast.error("Error al procesar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  function withdrawalStatusBadge(status: string) {
    if (status === "pending") return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">Pendiente</Badge>;
    if (status === "paid") return <Badge className="bg-green-500 text-white">Pagado</Badge>;
    return <Badge variant="destructive">Rechazado</Badge>;
  }

  return (
    <AppLayout>
      <div className="p-4 max-w-xl mx-auto">
        <h1 className="text-2xl font-black mb-4">Mi Billetera</h1>

        {/* Balance card */}
        <div className="bg-gradient-to-br from-primary to-primary/80 rounded-3xl p-6 text-white mb-4 shadow-xl">
          <p className="text-white/70 text-sm mb-1">Saldo disponible</p>
          <p className="text-4xl font-black">
            Bs {(wallet?.balance ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
          </p>
          <div className="flex gap-4 mt-4 pt-4 border-t border-white/20">
            <div>
              <p className="text-white/60 text-xs">Ganado</p>
              <p className="font-bold">Bs {(wallet?.total_won ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-white/60 text-xs">Retirado</p>
              <p className="font-bold">Bs {(wallet?.total_withdrawn ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-white/60 text-xs">En proceso</p>
              <p className="font-bold">Bs {(wallet?.pending_withdrawals ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>

        {/* Withdrawal form */}
        {!showForm ? (
          <Button className="w-full mb-4" onClick={() => setShowForm(true)} disabled={!wallet || wallet.balance <= 0}>
            💸 Solicitar Retiro
          </Button>
        ) : (
          <div className="bg-card border rounded-2xl p-5 mb-4 shadow-sm">
            <h3 className="font-bold mb-4">Solicitar Retiro</h3>
            <form onSubmit={requestWithdrawal} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Monto (Bs)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  min="1"
                  step="0.01"
                  max={wallet?.balance ?? 0}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Método de pago</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="bank_transfer">Transferencia bancaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {method === "bank_transfer" && (
                <div className="space-y-1.5">
                  <Label>Datos de cuenta bancaria</Label>
                  <Input
                    placeholder="Banco / N° de cuenta / Titular"
                    value={bankInfo}
                    onChange={e => setBankInfo(e.target.value)}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? "Enviando..." : "Solicitar"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Withdrawal history */}
        <h2 className="text-lg font-bold mb-3">Historial de Retiros</h2>
        {!withdrawals?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-3xl mb-2">💸</p>
            <p className="text-sm">Sin retiros todavía</p>
          </div>
        ) : (
          <div className="space-y-2">
            {withdrawals.map((w: any) => (
              <div key={w.id} className="bg-card border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">Bs {parseFloat(w.amount).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.method === "cash" ? "Efectivo" : "Transferencia"} • {new Date(w.created_at).toLocaleDateString("es-BO")}
                  </p>
                </div>
                {withdrawalStatusBadge(w.status)}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
