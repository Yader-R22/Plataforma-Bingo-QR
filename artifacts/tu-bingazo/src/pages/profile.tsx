import { useState } from "react";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function statusConfig(status: string) {
  if (status === "active") return { label: "Verificado ✓", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" };
  if (status === "pending") return { label: "Pendiente de verificación", bg: "hsl(42 98% 52% / 0.12)", border: "hsl(42 98% 52% / 0.3)", color: "hsl(42 98% 35%)" };
  return { label: "Rechazado", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.3)", color: "hsl(0 75% 40%)" };
}

export default function ProfilePage() {
  const { user, logout, token } = useAuthStore();
  const [newName, setNewName] = useState("");
  const [changingName, setChangingName] = useState(false);
  const [showNameForm, setShowNameForm] = useState(false);

  if (!user) return null;

  const sc = statusConfig(user.status);

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
      toast.success("✅ Solicitud enviada. El administrador la revisará pronto.");
      setShowNameForm(false); setNewName("");
    } catch {
      toast.error("Error al procesar la solicitud");
    } finally {
      setChangingName(false);
    }
  }

  return (
    <AppLayout>
      {/* Hero banner */}
      <div className="hero-bg px-4 py-6 text-white">
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl font-black shrink-0"
            style={{
              background: "hsl(42 98% 52%)",
              color: "#1a0050",
              fontFamily: "'Poppins', sans-serif",
              boxShadow: "0 4px 20px rgba(255,180,0,0.4)",
            }}
          >
            {user.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-black text-xl leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {user.full_name}
            </h1>
            <p className="text-white/60 text-sm mt-0.5">CI: {user.ci}</p>
            <div
              className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full"
              style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}
            >
              {sc.label}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 max-w-xl mx-auto space-y-4">
        {user.status === "pending" && (
          <div
            className="rounded-2xl p-4 text-sm flex items-start gap-3"
            style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}
          >
            <span className="text-xl">⏳</span>
            <div>
              <p className="font-bold">Verificación en proceso</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Estamos revisando las fotos de tu CI. Una vez verificado, podrás comprar cartones y jugar.
              </p>
            </div>
          </div>
        )}

        {/* Info grid */}
        <div className="bg-card border rounded-2xl p-5">
          <h2 className="font-black mb-4">Mis datos</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "📱", label: "Teléfono", value: user.phone },
              { icon: "📍", label: "Departamento", value: user.department || "—" },
              { icon: "🎱", label: "Mis juegos", value: "Ver historial" },
              { icon: "💰", label: "Saldo", value: `Bs ${user.balance.toLocaleString("es-BO", { minimumFractionDigits: 2 })}` },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-3" style={{ background: "hsl(var(--muted))" }}>
                <span className="text-sm">{item.icon}</span>
                <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                <p className="font-bold text-sm mt-0.5 truncate">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Name change */}
        <div className="bg-card border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold">Cambio de Nombre</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            El nombre no se puede editar libremente. Solicita la corrección y el admin la aprobará.
          </p>
          {!showNameForm ? (
            <button
              className="w-full py-3 rounded-xl border-2 font-bold text-sm transition-all"
              style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
              onClick={() => setShowNameForm(true)}
            >
              ✏️ Solicitar corrección de nombre
            </button>
          ) : (
            <form onSubmit={requestNameChange} className="space-y-3">
              <div>
                <label className="text-sm font-bold block mb-1.5">Nombre correcto</label>
                <input
                  className="input-field"
                  placeholder="Nombre completo correcto"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                El admin revisará tu solicitud junto con las fotos de tu CI en 24-48 horas.
              </p>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={changingName}>
                  {changingName ? "Enviando..." : "Solicitar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNameForm(false)}
                  className="px-4 py-3 rounded-[14px] border-2 font-bold text-sm"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Admin panel link */}
        {user.is_admin && (
          <div
            className="rounded-2xl p-4 cursor-pointer flex items-center justify-between"
            style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)" }}
            onClick={() => window.location.href = "/admin"}
          >
            <div>
              <p className="font-bold" style={{ color: "hsl(var(--primary))" }}>🛡️ Panel de Administración</p>
              <p className="text-xs text-muted-foreground mt-0.5">Gestionar juegos, usuarios y retiros</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "hsl(var(--primary))" }}><path d="M9 18l6-6-6-6"/></svg>
          </div>
        )}

        {/* Logout */}
        <button
          className="w-full py-3 rounded-xl border-2 font-bold text-sm transition-all"
          style={{ borderColor: "hsl(0 75% 52% / 0.4)", color: "hsl(0 75% 45%)" }}
          onClick={() => { logout(); window.location.href = "/"; }}
        >
          Cerrar Sesión
        </button>
      </div>
    </AppLayout>
  );
}
