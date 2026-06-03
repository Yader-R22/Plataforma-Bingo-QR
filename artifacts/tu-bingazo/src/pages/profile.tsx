import { useState } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ProfilePage() {
  const { user, setUser, logout, token } = useAuthStore();
  const [newName, setNewName] = useState("");
  const [changingName, setChangingName] = useState(false);
  const [showNameForm, setShowNameForm] = useState(false);

  if (!user) return null;

  function statusBadge(status: string) {
    if (status === "active") return <Badge className="bg-green-500 text-white">✅ Verificado</Badge>;
    if (status === "pending") return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">⏳ Pendiente</Badge>;
    return <Badge variant="destructive">❌ Rechazado</Badge>;
  }

  async function requestNameChange(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setChangingName(true);
    try {
      const res = await fetch(`${BASE}/api/profile/name-change-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ requested_name: newName }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al enviar solicitud"); return; }
      toast.success("Solicitud de cambio de nombre enviada. El administrador la revisará.");
      setShowNameForm(false);
      setNewName("");
    } catch {
      toast.error("Error al procesar la solicitud");
    } finally {
      setChangingName(false);
    }
  }

  function handleLogout() {
    logout();
    window.location.href = "/";
  }

  return (
    <AppLayout>
      <div className="p-4 max-w-xl mx-auto">
        <h1 className="text-2xl font-black mb-4">Mi Perfil</h1>

        {/* Avatar + name */}
        <div className="bg-card border rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl font-black text-primary">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-black">{user.full_name}</h2>
              <p className="text-muted-foreground text-sm">CI: {user.ci}</p>
              <div className="mt-1">{statusBadge(user.status)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs">Teléfono</p>
              <p className="font-semibold">{user.phone}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-muted-foreground text-xs">Departamento</p>
              <p className="font-semibold">{user.department}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 col-span-2">
              <p className="text-muted-foreground text-xs">Saldo</p>
              <p className="text-xl font-black text-primary">Bs {user.balance.toLocaleString("es-BO", { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>

        {/* Name change */}
        <div className="bg-card border rounded-2xl p-5 mb-4 shadow-sm">
          <h3 className="font-bold mb-3">Cambio de Nombre</h3>
          {!showNameForm ? (
            <Button variant="outline" className="w-full" onClick={() => setShowNameForm(true)}>
              ✏️ Solicitar cambio de nombre
            </Button>
          ) : (
            <form onSubmit={requestNameChange} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nuevo nombre completo</Label>
                <Input
                  placeholder="Nombre completo"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                El cambio requiere aprobación del administrador. Se actualizará en 24-48h.
              </p>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={changingName}>
                  {changingName ? "Enviando..." : "Solicitar"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowNameForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Admin link */}
        {user.is_admin && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-4">
            <p className="font-semibold text-primary mb-2">🛡️ Panel de Administración</p>
            <Button variant="outline" className="w-full" onClick={() => window.location.href = "/admin"}>
              Ir al panel admin
            </Button>
          </div>
        )}

        {/* Logout */}
        <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/5" onClick={handleLogout}>
          Cerrar Sesión
        </Button>
      </div>
    </AppLayout>
  );
}
