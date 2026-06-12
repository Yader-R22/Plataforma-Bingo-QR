import { useState, useRef, useEffect } from "react";
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
  const [editPhone, setEditPhone] = useState(false);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);

  const [editDept, setEditDept] = useState(false);
  const [department, setDepartment] = useState(user?.department ?? "");
  const [savingDept, setSavingDept] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // Name change
  const [showNameForm, setShowNameForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [changingName, setChangingName] = useState(false);

  // CI change
  const [showCiForm, setShowCiForm] = useState(false);
  const [newCi, setNewCi] = useState("");
  const [changingCi, setChangingCi] = useState(false);

  // Temp password change
  const [newPwd, setNewPwd] = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  // Activator / referral
  const [activatorStatus, setActivatorStatus] = useState<any>(null);
  const [requestingActivator, setRequestingActivator] = useState(false);
  const [referralHistory, setReferralHistory] = useState<any>(null);
  const [showReferralHistory, setShowReferralHistory] = useState(false);

  // Auto-focus change password form when arriving with must_change_password
  useEffect(() => {
    if (user?.must_change_password) {
      document.getElementById("change-password-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [user?.must_change_password]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    function fetchStatus() {
      fetch(`${BASE}/api/referrals/status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && !cancelled) setActivatorStatus(d); })
        .catch(() => {});
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  if (!user) return null;

  async function requestActivator() {
    setRequestingActivator(true);
    try {
      const r = await fetch(`${BASE}/api/referrals/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Error al enviar solicitud"); return; }
      setActivatorStatus({ has_request: true, status: "pending", code: null, link: null, created_at: new Date() });
      toast.success("✅ Solicitud enviada. El admin la revisará pronto.");
    } catch { toast.error("Error de conexión"); }
    finally { setRequestingActivator(false); }
  }

  async function loadReferralHistory() {
    if (referralHistory) { setShowReferralHistory(true); return; }
    try {
      const r = await fetch(`${BASE}/api/referrals/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { setReferralHistory(await r.json()); setShowReferralHistory(true); }
    } catch {}
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }
    if (newPwd !== newPwdConfirm) { toast.error("Las contraseñas no coinciden"); return; }
    setChangingPwd(true);
    try {
      const res = await fetch(`${BASE}/api/profile/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ new_password: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al cambiar contraseña"); return; }
      setUser(data as AuthUser);
      toast.success("✅ Contraseña actualizada correctamente. ¡Ya puedes jugar!");
      setNewPwd(""); setNewPwdConfirm("");
    } catch { toast.error("Error de conexión. Verifica tu conexión e intenta nuevamente."); }
    finally { setChangingPwd(false); }
  }
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
    } catch { toast.error("Error de conexión"); }
    finally { setSavingPhone(false); }
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
    } catch { toast.error("Error de conexión"); }
    finally { setSavingDept(false); }
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
      } catch { toast.error("Error de conexión"); }
      finally { setSavingAvatar(false); }
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
      toast.success("✅ Solicitud de nombre enviada. El admin la revisará pronto.");
      setShowNameForm(false); setNewName("");
    } catch { toast.error("Error al procesar la solicitud"); }
    finally { setChangingName(false); }
  }

  async function requestCiChange(e: React.FormEvent) {
    e.preventDefault();
    if (!newCi.trim()) return;
    setChangingCi(true);
    try {
      const res = await fetch(`${BASE}/api/profile/ci-change-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ requested_ci: newCi }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al enviar solicitud"); return; }
      toast.success("✅ Solicitud de cambio de CI enviada. El admin la revisará pronto.");
      setShowCiForm(false); setNewCi("");
    } catch { toast.error("Error al procesar la solicitud"); }
    finally { setChangingCi(false); }
  }

  return (
    <AppLayout>
      {/* Hero banner */}
      <div className="hero-bg px-4 py-6 text-white">
        <div className="flex items-center gap-4">
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
              {user.avatar_url
                ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center cursor-pointer"
              style={{ background: "hsl(var(--primary))", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
              onClick={() => avatarInputRef.current?.click()}>
              {savingAvatar
                ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <span className="text-xs">📷</span>}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <h1 className="font-black text-xl leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {user.full_name}
            </h1>
            <p className="text-white/60 text-sm mt-0.5">CI: {user.ci}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <div className="inline-block text-xs font-bold px-3 py-1 rounded-full"
                style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}>
                {sc.label}
              </div>
              {activatorStatus?.status === "accepted" && (
                <div className="inline-block text-xs font-bold px-3 py-1 rounded-full"
                  style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)", color: "#4f46e5" }}>
                  🔗 Activador
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 max-w-xl mx-auto space-y-4">
        {/* Temp password banner — shown prominently when must_change_password */}
        {user.must_change_password && (
          <div id="change-password-section" className="rounded-2xl overflow-hidden"
            style={{ border: "2px solid hsl(42 98% 52% / 0.6)", background: "hsl(42 98% 52% / 0.06)" }}>
            <div className="px-4 py-3 flex items-center gap-2"
              style={{ background: "hsl(42 98% 52% / 0.15)", borderBottom: "1px solid hsl(42 98% 52% / 0.3)" }}>
              <span className="text-xl">🔑</span>
              <div className="flex-1">
                <p className="font-bold text-sm" style={{ color: "hsl(42 98% 30%)" }}>Cambia tu contraseña temporal</p>
                {(user as any).temp_password_expires_at && (
                  <p className="text-[11px]" style={{ color: "hsl(42 98% 35%)" }}>
                    Vence el {new Date((user as any).temp_password_expires_at).toLocaleString("es-BO", {
                      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
            </div>
            <form onSubmit={changePassword} className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                El administrador estableció una contraseña temporal para tu cuenta. Elige una nueva contraseña personal para continuar.
              </p>
              <input
                id="new-password-input"
                type="password"
                className="input-field"
                placeholder="Nueva contraseña (mín. 6 caracteres)"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                autoComplete="new-password"
                required
                autoFocus
              />
              <input
                type="password"
                className="input-field"
                placeholder="Repetir nueva contraseña"
                value={newPwdConfirm}
                onChange={e => setNewPwdConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button type="submit" disabled={changingPwd || newPwd.length < 6 || newPwd !== newPwdConfirm}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
                style={{ background: "hsl(42 98% 40%)" }}>
                {changingPwd ? "Guardando..." : "✅ Establecer nueva contraseña"}
              </button>
              {newPwd.length >= 6 && newPwdConfirm.length >= 1 && newPwd !== newPwdConfirm && (
                <p className="text-xs font-bold text-center" style={{ color: "hsl(0 75% 45%)" }}>Las contraseñas no coinciden</p>
              )}
            </form>
          </div>
        )}

        {user.status === "pending" && (
          <div className="rounded-2xl p-4 text-sm flex items-start gap-3"
            style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
            <span className="text-xl">⏳</span>
            <div>
              <p className="font-bold">Verificación en proceso</p>
              <p className="text-muted-foreground text-xs mt-0.5">Estamos revisando tu CI. Una vez verificado, podrás comprar cartones.</p>
            </div>
          </div>
        )}

        {/* Editable contact data */}
        <div className="bg-card border rounded-2xl p-5 space-y-4">
          <h2 className="font-black">Mis datos</h2>

          {/* Phone */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold">📱 Teléfono / WhatsApp</label>
              {!editPhone && (
                <button className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}
                  onClick={() => { setPhone(user.phone); setEditPhone(true); }}>Editar</button>
              )}
            </div>
            {editPhone ? (
              <div className="flex gap-2">
                <input className="input-field flex-1" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+591 70000000" autoFocus />
                <button onClick={savePhone} disabled={savingPhone}
                  className="px-4 py-2.5 rounded-xl font-bold text-sm text-white shrink-0"
                  style={{ background: "hsl(var(--primary))" }}>
                  {savingPhone ? "..." : "✓"}
                </button>
                <button onClick={() => setEditPhone(false)} className="px-3 py-2.5 rounded-xl font-bold text-sm border shrink-0">✕</button>
              </div>
            ) : (
              <p className="text-foreground font-medium">{user.phone || "No registrado"}</p>
            )}
          </div>

          {/* Department */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold">📍 Departamento</label>
              {!editDept && (
                <button className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}
                  onClick={() => setEditDept(true)}>Editar</button>
              )}
            </div>
            {editDept ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {DEPARTMENTS.map(d => (
                    <button key={d} onClick={() => saveDepartment(d)} disabled={savingDept}
                      className="py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all"
                      style={{
                        borderColor: (user.department === d || department === d) ? "hsl(var(--primary))" : "hsl(var(--border))",
                        background: (user.department === d || department === d) ? "hsl(var(--primary) / 0.1)" : "transparent",
                        color: (user.department === d || department === d) ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                      }}>
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
          </div>
        </div>

        {/* ── Activador section ──────────────────────────────────── */}
        <div className="bg-card border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔗</span>
            <h3 className="font-black">Programa de Activadores</h3>
          </div>

          {(!activatorStatus || !activatorStatus.has_request) && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Comparte Tu Bingazo y gana comisiones cuando tus referidos ganen premios.</p>
              {activatorStatus?.program_enabled === false ? (
                <div className="rounded-xl px-4 py-3 text-center"
                  style={{ background: "hsl(0 75% 52% / 0.08)", border: "1px solid hsl(0 75% 52% / 0.25)" }}>
                  <p className="font-bold text-sm" style={{ color: "hsl(0 75% 40%)" }}>⛔ Programa temporalmente desactivado</p>
                  <p className="text-xs text-muted-foreground mt-1">El administrador ha pausado las solicitudes de activador.</p>
                </div>
              ) : (
                <button className="btn-primary" onClick={requestActivator} disabled={requestingActivator}>
                  {requestingActivator ? "Enviando..." : "✨ Volverme Activador"}
                </button>
              )}
            </div>
          )}

          {(activatorStatus?.status === "pending" || activatorStatus?.status === "hold") && (
            <div className="rounded-xl px-4 py-3 space-y-1"
              style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
              <p className="font-bold text-sm" style={{ color: "hsl(42 98% 35%)" }}>
                {activatorStatus.status === "pending" ? "⏳ Solicitud en revisión" : "⏸ Solicitud en espera"}
              </p>
              <p className="text-xs text-muted-foreground">El administrador revisará tu solicitud. Te notificamos cuando sea aprobada.</p>
              {activatorStatus.notes && <p className="text-xs italic text-muted-foreground">💬 {activatorStatus.notes}</p>}
            </div>
          )}

          {activatorStatus?.status === "rejected" && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3" style={{ background: "hsl(0 75% 52% / 0.08)", border: "1px solid hsl(0 75% 52% / 0.25)" }}>
                <p className="font-bold text-sm" style={{ color: "hsl(0 75% 40%)" }}>✖ Solicitud rechazada</p>
                {activatorStatus.notes && <p className="text-xs text-muted-foreground mt-1">💬 {activatorStatus.notes}</p>}
              </div>
              <button className="btn-primary" onClick={requestActivator} disabled={requestingActivator}>
                {requestingActivator ? "Enviando..." : "🔄 Volver a solicitar"}
              </button>
            </div>
          )}

          {activatorStatus?.status === "accepted" && activatorStatus?.code && (
            <div className="space-y-3">
              <div className="rounded-xl px-4 py-3 space-y-1"
                style={{ background: "hsl(142 70% 45% / 0.1)", border: "1px solid hsl(142 70% 45% / 0.3)" }}>
                <p className="font-bold text-sm" style={{ color: "hsl(142 70% 30%)" }}>✅ ¡Eres Activador!</p>
                <p className="text-xs text-muted-foreground">Tu código:</p>
                <div className="flex items-center gap-2">
                  <p className="font-black text-lg tracking-widest" style={{ color: "hsl(var(--primary))", fontFamily: "'Poppins', sans-serif" }}>
                    {activatorStatus.code}
                  </p>
                  <button
                    className="px-2 py-1 rounded-lg text-[11px] font-bold text-white shrink-0"
                    style={{ background: "hsl(var(--primary))" }}
                    onClick={() => { navigator.clipboard.writeText(activatorStatus.code ?? ""); toast.success("✅ Código copiado"); }}>
                    Copiar
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground">Enlace para compartir:</p>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-xl border px-3 py-2 text-xs font-mono truncate bg-muted"
                    style={{ borderColor: "hsl(var(--border))" }}>
                    {window.location.origin}/registro?ref={activatorStatus.code}
                  </div>
                  <button className="px-3 py-2 rounded-xl text-xs font-bold text-white shrink-0"
                    style={{ background: "hsl(var(--primary))" }}
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/registro?ref=${activatorStatus.code}`); toast.success("✅ Enlace copiado"); }}>
                    Copiar
                  </button>
                </div>
                <button className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: "#25D366", color: "white" }}
                  onClick={() => {
                    const msg = `¡Únete a Tu Bingazo y gana premios jugando bingo en vivo! 🎱\n\nRegístrate con mi enlace y recibirás un bono de bienvenida:\n${window.location.origin}/registro?ref=${activatorStatus.code}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                  }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  Compartir por WhatsApp
                </button>
                {activatorStatus.whatsapp_group_link && (
                  <a href={activatorStatus.whatsapp_group_link} target="_blank" rel="noopener noreferrer"
                    className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                    style={{ background: "#128C7E", color: "white" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                    Unirse al grupo de activadores
                  </a>
                )}
              </div>
              {referralHistory && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground">Total referidos: {referralHistory.total_referred}</p>
                  {referralHistory.transactions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Sin movimientos aún</p>
                  ) : referralHistory.transactions.slice(0, 10).map((tx: any) => (
                    <div key={tx.id} className="rounded-xl border px-3 py-2 flex items-center justify-between gap-3"
                      style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{tx.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {tx.type === "commission" ? "🔗 Comisión" : "🎁 Bono"} · {new Date(tx.created_at).toLocaleDateString("es-BO")}
                        </p>
                      </div>
                      <p className="font-black text-sm shrink-0" style={{ color: tx.activator_id === user.id ? "hsl(142 70% 35%)" : "hsl(42 98% 35%)" }}>
                        +Bs {Number(tx.amount).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Solicitudes de cambio */}
        <div className="bg-card border rounded-2xl p-5 space-y-4">
          <h3 className="font-black">Solicitudes de Cambio</h3>
          <p className="text-xs text-muted-foreground -mt-2">El nombre y CI requieren aprobación del administrador con verificación de identidad.</p>

          {!showNameForm && !showCiForm && (
            <div className="space-y-2">
              <button className="w-full py-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2"
                style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
                onClick={() => setShowNameForm(true)}>
                ✏️ Solicitar corrección de nombre
              </button>
              <button className="w-full py-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2"
                style={{ borderColor: "hsl(42 98% 52%)", color: "hsl(42 98% 35%)" }}
                onClick={() => setShowCiForm(true)}>
                🪪 Solicitar corrección de CI
              </button>
            </div>
          )}

          {showNameForm && (
            <form onSubmit={requestNameChange} className="space-y-3">
              <label className="text-sm font-bold block">Nuevo nombre completo</label>
              <input className="input-field" placeholder="Nombre completo correcto" value={newName} onChange={e => setNewName(e.target.value)} required autoFocus />
              <p className="text-xs text-muted-foreground">El admin revisará tu solicitud en 24-48h con tu CI.</p>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={changingName}>{changingName ? "Enviando..." : "Solicitar cambio"}</button>
                <button type="button" onClick={() => setShowNameForm(false)} className="px-4 py-3 rounded-[14px] border-2 font-bold text-sm" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              </div>
            </form>
          )}

          {showCiForm && (
            <form onSubmit={requestCiChange} className="space-y-3">
              <label className="text-sm font-bold block">Nuevo número de CI</label>
              <input className="input-field" placeholder="Nuevo número de carnet" value={newCi} onChange={e => setNewCi(e.target.value)} required autoFocus />
              <p className="text-xs text-muted-foreground">El admin verificará tu identidad antes de aplicar el cambio.</p>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={changingCi}>{changingCi ? "Enviando..." : "Solicitar cambio"}</button>
                <button type="button" onClick={() => setShowCiForm(false)} className="px-4 py-3 rounded-[14px] border-2 font-bold text-sm" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
              </div>
            </form>
          )}
        </div>

        {user.is_admin && (
          <div className="rounded-2xl p-4 cursor-pointer flex items-center justify-between"
            style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)" }}
            onClick={() => window.location.href = "/admin"}>
            <div>
              <p className="font-bold" style={{ color: "hsl(var(--primary))" }}>🛡️ Panel de Administración</p>
              <p className="text-xs text-muted-foreground mt-0.5">Gestionar juegos, usuarios y retiros</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "hsl(var(--primary))" }}><path d="M9 18l6-6-6-6"/></svg>
          </div>
        )}

        <button className="w-full py-3 rounded-xl border-2 font-bold text-sm"
          style={{ borderColor: "hsl(0 75% 52% / 0.4)", color: "hsl(0 75% 45%)" }}
          onClick={() => { logout(); window.location.href = "/"; }}>
          Cerrar Sesión
        </button>
      </div>
    </AppLayout>
  );
}
