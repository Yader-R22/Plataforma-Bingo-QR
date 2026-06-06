import { useState, useRef } from "react";
import { useAuthStore, type AuthUser } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEPARTMENTS = [
  "Beni", "Chuquisaca", "Cochabamba", "La Paz",
  "Oruro", "Pando", "Potosí", "Santa Cruz", "Tarija",
];

function statusConfig(status: string) {
  if (status === "active") return { label: "Verificado ✓", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" };
  if (status === "pending") return { label: "Pendiente de verificación", bg: "hsl(42 98% 52% / 0.12)", border: "hsl(42 98% 52% / 0.3)", color: "hsl(42 98% 35%)" };
  return { label: "Rechazado", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.3)", color: "hsl(0 75% 40%)" };
}

export default function ProfilePage() {
  const { user, setUser, logout, token } = useAuthStore();
  const [newName, setNewName] = useState("");
  const [changingName, setChangingName] = useState(false);
  const [showNameForm, setShowNameForm] = useState(false);

  // Editable fields
  const [editPhone, setEditPhone] = useState(false);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);

  const [editDept, setEditDept] = useState(false);
  const [department, setDepartment] = useState(user?.department ?? "");
  const [savingDept, setSavingDept] = useState(false);

  // Avatar
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  if (!user) return null;
  const sc = statusConfig(user.status);

  async function savePhone() {
    if (!phone.trim()) return;
    setSavingPhone(true);
    try {
      const res = await fetch(`${BASE}/api/profile/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al guardar"); return; }
      setUser({ ...user, phone: data.phone } as AuthUser);
      toast.success("Teléfono actualizado");
      setEditPhone(false);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSavingPhone(false);
    }
  }

  async function saveDepartment(dept: string) {
    setSavingDept(true);
    try {
      const res = await fetch(`${BASE}/api/profile/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ department: dept }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al guardar"); return; }
      setUser({ ...user, department: data.department } as AuthUser);
      setDepartment(dept);
      toast.success("Ubicación actualizada");
      setEditDept(false);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSavingDept(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setSavingAvatar(true);
      try {
        const res = await fetch(`${BASE}/api/profile/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ avatar_data: base64 }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || "Error al guardar avatar"); return; }
        setUser({ ...user, avatar_url: data.avatar_url } as AuthUser);
        toast.success("Foto de perfil actualizada");
      } catch {
        toast.error("Error de conexión");
      } finally {
        setSavingAvatar(false);
      }
    };
    reader.readAsDataURL(file);
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
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl font-black overflow-hidden cursor-pointer"
              style={{
                background: user.avatar_url ? "transparent" : "hsl(42 98% 52%)",
                color: "#1a0050",
                fontFamily: "'Poppins', sans-serif",
                boxShadow: "0 4px 20px rgba(255,180,0,0.4)",
              }}
              onClick={() => avatarInputRef.current?.click()}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                user.full_name.charAt(0).toUpperCase()
              )}
            </div>
            {/* Edit overlay */}
            <div
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center cursor-pointer"
              style={{ background: "hsl(var(--primary))", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
              onClick={() => avatarInputRef.current?.click()}
            >
              {savingAvatar ? (
                <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="text-xs">📷</span>
              )}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleAvatarChange} />
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
          <div className="rounded-2xl p-4 text-sm flex items-start gap-3" style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
            <span className="text-xl">⏳</span>
            <div>
              <p className="font-bold">Verificación en proceso</p>
              <p className="text-muted-foreground text-xs mt-0.5">Estamos revisando tu CI. Una vez verificado, podrás comprar cartones.</p>
            </div>
          </div>
        )}

        {/* Saldo */}
        <div className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1a0050, #3b00b8)" }}>
          <p className="text-white/60 text-sm">Saldo disponible</p>
          <p className="font-black text-3xl mt-1" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 60%)" }}>
            Bs {user.balance.toLocaleString("es-BO", { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Editable data */}
        <div className="bg-card border rounded-2xl p-5 space-y-4">
          <h2 className="font-black">Mis datos</h2>

          {/* Phone - editable */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold">📱 Teléfono / WhatsApp</label>
              {!editPhone && (
                <button className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }} onClick={() => { setPhone(user.phone); setEditPhone(true); }}>
                  Editar
                </button>
              )}
            </div>
            {editPhone ? (
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+591 70000000"
                  autoFocus
                />
                <button
                  onClick={savePhone}
                  disabled={savingPhone}
                  className="px-4 py-2.5 rounded-xl font-bold text-sm text-white shrink-0"
                  style={{ background: "hsl(var(--primary))" }}
                >
                  {savingPhone ? "..." : "Guardar"}
                </button>
                <button onClick={() => setEditPhone(false)} className="px-3 py-2.5 rounded-xl font-bold text-sm border shrink-0">
                  ✕
                </button>
              </div>
            ) : (
              <p className="text-foreground font-medium">{user.phone || "No registrado"}</p>
            )}
          </div>

          {/* Department - editable */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold">📍 Departamento</label>
              {!editDept && (
                <button className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }} onClick={() => setEditDept(true)}>
                  Editar
                </button>
              )}
            </div>
            {editDept ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {DEPARTMENTS.map(d => (
                    <button
                      key={d}
                      onClick={() => saveDepartment(d)}
                      disabled={savingDept}
                      className="py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all"
                      style={{
                        borderColor: (department === d || user.department === d) ? "hsl(var(--primary))" : "hsl(var(--border))",
                        background: (department === d || user.department === d) ? "hsl(var(--primary) / 0.1)" : "transparent",
                        color: (department === d || user.department === d) ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                      }}
                    >
                      {savingDept && department === d ? "..." : d}
                    </button>
                  ))}
                </div>
                <button onClick={() => setEditDept(false)} className="w-full py-2 rounded-xl text-sm text-muted-foreground border">Cancelar</button>
              </div>
            ) : (
              <p className="text-foreground font-medium">{user.department || "No registrado"}</p>
            )}
          </div>

          {/* CI — read only */}
          <div>
            <label className="text-sm font-bold block mb-1">🪪 Carnet de Identidad</label>
            <p className="text-foreground font-medium">{user.ci}</p>
            <p className="text-xs text-muted-foreground mt-0.5">El CI no se puede editar</p>
          </div>
        </div>

        {/* Name change */}
        <div className="bg-card border rounded-2xl p-5">
          <h3 className="font-bold mb-1">Cambio de Nombre</h3>
          <p className="text-xs text-muted-foreground mb-3">
            El nombre requiere aprobación del administrador con tu CI.
          </p>
          {!showNameForm ? (
            <button
              className="w-full py-3 rounded-xl border-2 font-bold text-sm"
              style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
              onClick={() => setShowNameForm(true)}
            >
              ✏️ Solicitar corrección de nombre
            </button>
          ) : (
            <form onSubmit={requestNameChange} className="space-y-3">
              <input className="input-field" placeholder="Nombre completo correcto" value={newName} onChange={e => setNewName(e.target.value)} required />
              <p className="text-xs text-muted-foreground">El admin revisará tu solicitud en 24-48h.</p>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={changingName}>
                  {changingName ? "Enviando..." : "Solicitar"}
                </button>
                <button type="button" onClick={() => setShowNameForm(false)} className="px-4 py-3 rounded-[14px] border-2 font-bold text-sm" style={{ borderColor: "hsl(var(--border))" }}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Admin panel */}
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
          className="w-full py-3 rounded-xl border-2 font-bold text-sm"
          style={{ borderColor: "hsl(0 75% 52% / 0.4)", color: "hsl(0 75% 45%)" }}
          onClick={() => { logout(); window.location.href = "/"; }}
        >
          Cerrar Sesión
        </button>
      </div>
    </AppLayout>
  );
}
