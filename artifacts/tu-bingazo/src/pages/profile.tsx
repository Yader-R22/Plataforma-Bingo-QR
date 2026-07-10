import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore, type AuthUser } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";
import { useSetLayoutConfig } from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEPARTMENTS = [
  "Beni", "Chuquisaca", "Cochabamba", "La Paz",
  "Oruro", "Pando", "Potosí", "Santa Cruz", "Tarija",
];

function statusConfig(status: string) {
  if (status === "active") return { label: "✓ Verificado", bg: "hsl(142 70% 38%)", border: "hsl(142 70% 28%)", color: "#fff" };
  if (status === "pending") return { label: "⏳ Pendiente", bg: "hsl(42 98% 48%)", border: "hsl(42 98% 35%)", color: "#fff" };
  return { label: "✖ Rechazado", bg: "hsl(0 75% 48%)", border: "hsl(0 75% 35%)", color: "#fff" };
}

function PushToggle() {
  const { status, loading, enable, disable, isDismissed, dismiss } = usePushNotifications();

  if (status === "unsupported") return null;
  if (status === "denied") return (
    <div className="rounded-2xl p-4 text-sm flex items-start gap-3"
      style={{ background: "hsl(0 75% 52% / 0.08)", border: "1px solid hsl(0 75% 52% / 0.25)" }}>
      <span className="text-xl">🔔</span>
      <div>
        <p className="font-bold">Notificaciones bloqueadas</p>
        <p className="text-muted-foreground text-xs mt-0.5">Actívalas desde la configuración de tu navegador para recibir avisos de juegos y premios.</p>
      </div>
    </div>
  );
  if (status === "loading") return null;
  if (status === "subscribed") return (
    <div className="flex items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔔</span>
        <div>
          <p className="font-bold text-sm">Notificaciones activadas</p>
          <p className="text-xs text-muted-foreground">Recibirás avisos de juegos, premios y retiros.</p>
        </div>
      </div>
      <button onClick={disable} disabled={loading}
        className="text-xs font-bold shrink-0"
        style={{ color: "hsl(0 75% 45%)" }}>
        {loading ? "..." : "Desactivar"}
      </button>
    </div>
  );
  // unsubscribed — el modal de bienvenida ya se encarga de pedirlo
  return null;
}

export default function ProfilePage() {
  useSetLayoutConfig({ hideTopBar: true });
  const site = useSiteSettings();
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

  // Requests status (polling)
  type ReqStatus = { id: number; status: "pending" | "approved" | "rejected"; admin_notes: string | null; created_at: string; resolved_at: string | null };
  type NameReq = ReqStatus & { requested_name: string };
  type CiReq = ReqStatus & { current_ci: string; requested_ci: string };
  const [nameReq, setNameReq] = useState<NameReq | null>(null);
  const [ciReq, setCiReq] = useState<CiReq | null>(null);
  const [reqStatusLoaded, setReqStatusLoaded] = useState(false);
  const [showChangeRequests, setShowChangeRequests] = useState(false);
  const RESOLUTION_VISIBLE_MS = 60 * 60 * 1000; // 1 hora
  function isRecentlyResolved(req: ReqStatus | null): boolean {
    if (!req || req.status === "pending" || !req.resolved_at) return false;
    return Date.now() - new Date(req.resolved_at).getTime() < RESOLUTION_VISIBLE_MS;
  }

  // Temp password change
  const [newPwd, setNewPwd] = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  // Activator / referral
  const queryClient = useQueryClient();
  const { data: activatorStatus = null } = useQuery({
    queryKey: ["activator-status", token],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/referrals/status`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : null;
    },
    enabled: !!token,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: false,
  });
  const [requestingActivator, setRequestingActivator] = useState(false);
  const [referralHistory, setReferralHistory] = useState<any>(null);
  const [showReferralHistory, setShowReferralHistory] = useState(false);

  // Auto-focus change password form when arriving with must_change_password
  useEffect(() => {
    if (user?.must_change_password) {
      document.getElementById("change-password-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [user?.must_change_password]);


  // Poll requests status every 10s
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    function fetchReqStatus() {
      fetch(`${BASE}/api/profile/requests-status`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d || cancelled) return;
          setNameReq(d.name_change ?? null);
          setCiReq(d.ci_change ?? null);
          setReqStatusLoaded(true);
          // If name change just got approved, refresh user profile
          if (d.name_change?.status === "approved") {
            fetch(`${BASE}/api/profile`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.json() : null)
              .then(u => { if (u && !cancelled) setUser(u); })
              .catch(() => {});
          }
        })
        .catch(() => { if (!cancelled) setReqStatusLoaded(true); });
    }
    fetchReqStatus();
    const interval = setInterval(fetchReqStatus, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  // Auto-expand change requests card if there's a pending request
  useEffect(() => {
    if (!reqStatusLoaded) return;
    if (nameReq?.status === "pending" || ciReq?.status === "pending") {
      setShowChangeRequests(true);
    }
  }, [reqStatusLoaded, nameReq?.status, ciReq?.status]);

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
      queryClient.invalidateQueries({ queryKey: ["activator-status", token] });
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
    setSavingAvatar(true);
    try {
      const base64 = await resizeImage(file, 300, 0.82);
      const res = await fetch(`${BASE}/api/profile/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ avatar_data: base64 }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al guardar avatar"); return; }
      setUser({ ...user!, avatar_url: data.avatar_url } as AuthUser);
      toast.success("Foto de perfil actualizada");
    } catch { toast.error("Error de conexión"); }
    finally { setSavingAvatar(false); }
  }

  function resizeImage(file: File, maxPx: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = url;
    });
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
      toast.success("✅ Solicitud enviada. El admin la revisará pronto.");
      setNameReq({ id: data.id, requested_name: data.requested_name, status: "pending", admin_notes: null, created_at: data.created_at, resolved_at: null });
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
      toast.success("✅ Solicitud enviada. El admin la revisará pronto.");
      setCiReq({ id: data.id, current_ci: data.current_ci, requested_ci: data.requested_ci, status: "pending", admin_notes: null, created_at: data.created_at, resolved_at: null });
      setShowCiForm(false); setNewCi("");
    } catch { toast.error("Error al procesar la solicitud"); }
    finally { setChangingCi(false); }
  }

  return (
    <>
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
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "1px solid #4f46e5", color: "#fff", boxShadow: "0 2px 8px rgba(99,102,241,0.45)" }}>
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

        {/* ── Notificaciones push ───────────────────────────────── */}
        <PushToggle />

        {/* Editable contact data */}
        <div className="bg-card border rounded-2xl p-5 space-y-4">
          <h2 className="font-black">Mis datos</h2>

          {/* Phone */}
          <div>
            {editPhone ? (
              <div className="space-y-2">
                <label className="text-sm font-bold">📱 Teléfono / WhatsApp</label>
                <div className="flex gap-2">
                  <input className="input-field flex-1" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+591 70000000" autoFocus />
                  <button onClick={savePhone} disabled={savingPhone}
                    className="px-4 py-2.5 rounded-xl font-bold text-sm text-white shrink-0"
                    style={{ background: "hsl(var(--primary))" }}>
                    {savingPhone ? "..." : "✓"}
                  </button>
                  <button onClick={() => setEditPhone(false)} className="px-3 py-2.5 rounded-xl font-bold text-sm border shrink-0">✕</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-muted-foreground shrink-0">📱 Teléfono</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{user.phone || "No registrado"}</span>
                  <button className="text-xs font-bold shrink-0" style={{ color: "hsl(var(--primary))" }}
                    onClick={() => { setPhone(user.phone); setEditPhone(true); }}>Editar</button>
                </div>
              </div>
            )}
          </div>

          {/* Department */}
          <div>
            {editDept ? (
              <div className="space-y-2">
                <label className="text-sm font-bold">📍 Departamento</label>
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-muted-foreground shrink-0">📍 Departamento</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{user.department || "No registrado"}</span>
                  <button className="text-xs font-bold shrink-0" style={{ color: "hsl(var(--primary))" }}
                    onClick={() => setEditDept(true)}>Editar</button>
                </div>
              </div>
            )}
          </div>

          {/* CI — read only */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-muted-foreground shrink-0">🪪 Carnet de Identidad</span>
            <span className="text-sm font-medium">{user.ci}</span>
          </div>

          {/* WhatsApp support button */}
          {site.support_whatsapp && (() => {
            const esActivador = activatorStatus?.status === "accepted";
            const mensaje = encodeURIComponent(
              `Hola, necesito soporte en ${site.site_name}.\n\n` +
              `👤 Nombre: ${user.full_name}\n` +
              `🪪 CI: ${user.ci}\n` +
              `📍 Departamento: ${user.department || "No registrado"}\n` +
              `📱 Teléfono: ${user.phone || "No registrado"}\n` +
              `🔗 Activador: ${esActivador ? "Sí" : "No"}`
            );
            return (
              <a
                href={`https://wa.me/${site.support_whatsapp}?text=${mensaje}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm text-white"
                style={{ background: "#25D366" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Contactar soporte
              </a>
            );
          })()}
        </div>

        {/* ── Activador section ──────────────────────────────────── */}
        <div className="bg-card border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔗</span>
            <h3 className="font-black">Programa de Activadores</h3>
          </div>

          {(!activatorStatus || !activatorStatus.has_request) && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Comparte {site.site_name} y gana comisiones cuando tus referidos ganen premios.</p>
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

          {activatorStatus?.status === "suspended" && (
            <div className="rounded-xl px-4 py-3 space-y-1.5"
              style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.3)" }}>
              <p className="font-bold text-sm" style={{ color: "#92400e" }}>⏸ Suspendido del programa de activadores</p>
              <p className="text-xs text-muted-foreground">Tu cuenta de activador fue suspendida temporalmente por el administrador.</p>
              {activatorStatus.notes && (
                <p className="text-xs italic mt-1" style={{ color: "#92400e" }}>💬 Motivo: {activatorStatus.notes}</p>
              )}
            </div>
          )}

          {activatorStatus?.status === "banned" && (
            <div className="rounded-xl px-4 py-3 space-y-1.5"
              style={{ background: "hsl(0 75% 52% / 0.08)", border: "1px solid hsl(0 75% 52% / 0.3)" }}>
              <p className="font-black text-sm" style={{ color: "hsl(0 75% 35%)" }}>🔴 Baneado del programa de activadores</p>
              <p className="text-xs text-muted-foreground">Tu acceso al Programa de Activadores fue revocado permanentemente.</p>
              {activatorStatus.notes && (
                <p className="text-xs italic mt-1" style={{ color: "hsl(0 75% 40%)" }}>💬 Motivo: {activatorStatus.notes}</p>
              )}
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
                    const msg = `¡Únete a ${site.site_name} y gana premios jugando bingo en vivo! 🎱\n\nRegístrate con mi enlace y recibirás un bono de bienvenida:\n${window.location.origin}/registro?ref=${activatorStatus.code}`;
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
                        +Bs {Number(tx.amount).toFixed(0)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Solicitudes de cambio */}
        <div className="bg-card border rounded-2xl overflow-hidden">
          {/* Header — siempre visible, clickeable */}
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left"
            onClick={() => setShowChangeRequests(v => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="font-black text-sm">✏️ Solicitudes de Cambio</span>
              {(nameReq?.status === "pending" || ciReq?.status === "pending") && (
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: "hsl(42 98% 48%)" }} />
              )}
            </div>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="text-muted-foreground shrink-0 transition-transform duration-200"
              style={{ transform: showChangeRequests ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Contenido colapsable */}
          {showChangeRequests && (
            <div className="px-5 pb-5 space-y-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
              <p className="text-xs text-muted-foreground pt-3">El nombre y CI requieren aprobación del administrador con verificación de identidad.</p>

          {/* ── Nombre ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">✏️ Nombre completo</p>

            {/* Pending */}
            {nameReq?.status === "pending" && (
              <div className="rounded-xl p-3 space-y-1" style={{ background: "hsl(42 98% 52% / 0.08)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "hsl(42 98% 52% / 0.15)", color: "hsl(42 98% 30%)" }}>⏳ En revisión</span>
                </div>
                <p className="text-sm font-medium mt-1">Nombre solicitado: <span className="font-bold">{nameReq.requested_name}</span></p>
                <p className="text-xs text-muted-foreground">El administrador revisará tu solicitud pronto.</p>
              </div>
            )}

            {/* Approved (visible solo 1h) */}
            {nameReq?.status === "approved" && isRecentlyResolved(nameReq) && (
              <div className="rounded-xl p-3 space-y-1" style={{ background: "hsl(142 70% 45% / 0.08)", border: "1px solid hsl(142 70% 45% / 0.3)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "hsl(142 70% 45% / 0.15)", color: "hsl(142 70% 28%)" }}>✓ Aprobado</span>
                </div>
                <p className="text-sm font-medium mt-1">Tu nombre fue actualizado a: <span className="font-bold">{nameReq.requested_name}</span></p>
                {nameReq.admin_notes && (
                  <div className="rounded-lg p-2 mt-1" style={{ background: "hsl(142 70% 45% / 0.08)" }}>
                    <p className="text-xs font-bold" style={{ color: "hsl(142 70% 28%)" }}>Nota del administrador:</p>
                    <p className="text-xs mt-0.5">{nameReq.admin_notes}</p>
                  </div>
                )}
                <button className="text-xs font-bold mt-1 underline" style={{ color: "hsl(var(--primary))" }}
                  onClick={() => { setNameReq(null); setShowNameForm(true); }}>
                  Hacer otra solicitud
                </button>
              </div>
            )}

            {/* Rejected (visible solo 1h) */}
            {nameReq?.status === "rejected" && isRecentlyResolved(nameReq) && (
              <div className="rounded-xl p-3 space-y-1.5" style={{ background: "hsl(0 75% 52% / 0.07)", border: "1px solid hsl(0 75% 52% / 0.3)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "hsl(0 75% 52% / 0.12)", color: "hsl(0 75% 38%)" }}>✗ Rechazado</span>
                </div>
                <p className="text-sm font-medium">Nombre solicitado: <span className="font-bold">{nameReq.requested_name}</span></p>
                {nameReq.admin_notes && (
                  <div className="rounded-lg p-2 mt-1" style={{ background: "hsl(0 75% 52% / 0.08)" }}>
                    <p className="text-xs font-bold" style={{ color: "hsl(0 75% 38%)" }}>Motivo del rechazo:</p>
                    <p className="text-xs mt-0.5">{nameReq.admin_notes}</p>
                  </div>
                )}
                {!showNameForm && (
                  <button className="text-xs font-bold mt-1 underline" style={{ color: "hsl(var(--primary))" }}
                    onClick={() => { setShowNameForm(true); }}>
                    Volver a solicitar
                  </button>
                )}
              </div>
            )}

            {/* Form */}
            {showNameForm ? (
              <form onSubmit={requestNameChange} className="space-y-3">
                <label className="text-sm font-bold block">Nuevo nombre completo</label>
                <input className="input-field" placeholder="Nombre completo correcto" value={newName} onChange={e => setNewName(e.target.value)} required autoFocus />
                <p className="text-xs text-muted-foreground">El admin revisará tu solicitud en 24-48h con tu CI.</p>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1" disabled={changingName}>{changingName ? "Enviando..." : "Solicitar cambio"}</button>
                  <button type="button" onClick={() => setShowNameForm(false)} className="px-4 py-3 rounded-[14px] border-2 font-bold text-sm" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
                </div>
              </form>
            ) : (!nameReq || (nameReq.status !== "pending" && !isRecentlyResolved(nameReq))) && !showNameForm && reqStatusLoaded && (
              <button className="w-full py-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2"
                style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
                onClick={() => setShowNameForm(true)}>
                ✏️ Solicitar corrección de nombre
              </button>
            )}
          </div>

          <div className="border-t" style={{ borderColor: "hsl(var(--border))" }} />

          {/* ── CI ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">🪪 Número de cédula</p>

            {/* Pending */}
            {ciReq?.status === "pending" && (
              <div className="rounded-xl p-3 space-y-1" style={{ background: "hsl(42 98% 52% / 0.08)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "hsl(42 98% 52% / 0.15)", color: "hsl(42 98% 30%)" }}>⏳ En revisión</span>
                </div>
                <p className="text-sm font-medium mt-1">CI solicitado: <span className="font-bold">{ciReq.requested_ci}</span></p>
                <p className="text-xs text-muted-foreground">El administrador verificará tu identidad pronto.</p>
              </div>
            )}

            {/* Approved (visible solo 1h) */}
            {ciReq?.status === "approved" && isRecentlyResolved(ciReq) && (
              <div className="rounded-xl p-3 space-y-1" style={{ background: "hsl(142 70% 45% / 0.08)", border: "1px solid hsl(142 70% 45% / 0.3)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "hsl(142 70% 45% / 0.15)", color: "hsl(142 70% 28%)" }}>✓ Aprobado</span>
                </div>
                <p className="text-sm font-medium mt-1">Tu CI fue actualizado a: <span className="font-bold">{ciReq.requested_ci}</span></p>
                {ciReq.admin_notes && (
                  <div className="rounded-lg p-2 mt-1" style={{ background: "hsl(142 70% 45% / 0.08)" }}>
                    <p className="text-xs font-bold" style={{ color: "hsl(142 70% 28%)" }}>Nota del administrador:</p>
                    <p className="text-xs mt-0.5">{ciReq.admin_notes}</p>
                  </div>
                )}
                <button className="text-xs font-bold mt-1 underline" style={{ color: "hsl(var(--primary))" }}
                  onClick={() => { setCiReq(null); setShowCiForm(true); }}>
                  Hacer otra solicitud
                </button>
              </div>
            )}

            {/* Rejected (visible solo 1h) */}
            {ciReq?.status === "rejected" && isRecentlyResolved(ciReq) && (
              <div className="rounded-xl p-3 space-y-1.5" style={{ background: "hsl(0 75% 52% / 0.07)", border: "1px solid hsl(0 75% 52% / 0.3)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "hsl(0 75% 52% / 0.12)", color: "hsl(0 75% 38%)" }}>✗ Rechazado</span>
                </div>
                <p className="text-sm font-medium">CI solicitado: <span className="font-bold">{ciReq.requested_ci}</span></p>
                {ciReq.admin_notes && (
                  <div className="rounded-lg p-2 mt-1" style={{ background: "hsl(0 75% 52% / 0.08)" }}>
                    <p className="text-xs font-bold" style={{ color: "hsl(0 75% 38%)" }}>Motivo del rechazo:</p>
                    <p className="text-xs mt-0.5">{ciReq.admin_notes}</p>
                  </div>
                )}
                {!showCiForm && (
                  <button className="text-xs font-bold mt-1 underline" style={{ color: "hsl(var(--primary))" }}
                    onClick={() => { setShowCiForm(true); }}>
                    Volver a solicitar
                  </button>
                )}
              </div>
            )}

            {/* Form */}
            {showCiForm ? (
              <form onSubmit={requestCiChange} className="space-y-3">
                <label className="text-sm font-bold block">Nuevo número de CI</label>
                <input className="input-field" placeholder="Nuevo número de carnet" value={newCi} onChange={e => setNewCi(e.target.value)} required autoFocus />
                <p className="text-xs text-muted-foreground">El admin verificará tu identidad antes de aplicar el cambio.</p>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1" disabled={changingCi}>{changingCi ? "Enviando..." : "Solicitar cambio"}</button>
                  <button type="button" onClick={() => setShowCiForm(false)} className="px-4 py-3 rounded-[14px] border-2 font-bold text-sm" style={{ borderColor: "hsl(var(--border))" }}>Cancelar</button>
                </div>
              </form>
            ) : (!ciReq || (ciReq.status !== "pending" && !isRecentlyResolved(ciReq))) && !showCiForm && reqStatusLoaded && (
              <button className="w-full py-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2"
                style={{ borderColor: "hsl(42 98% 52%)", color: "hsl(42 98% 35%)" }}
                onClick={() => setShowCiForm(true)}>
                🪪 Solicitar corrección de CI
              </button>
            )}
          </div>
            </div>
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
    </>
  );
}
