import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Permission definitions ────────────────────────────────────────────────────
export const ADMIN_PERMS = [
  { id: "admin:users",       label: "👥 Usuarios",     desc: "Ver, verificar, banear y crear usuarios" },
  { id: "admin:games",       label: "🎱 Juegos",        desc: "Crear juegos, cantar números, validar ganadores" },
  { id: "admin:withdrawals", label: "💸 Retiros",       desc: "Ver y procesar solicitudes de retiro" },
  { id: "admin:resets",      label: "🔑 Reseteos",      desc: "Aprobar/rechazar reseteos de contraseña" },
  { id: "admin:logs",        label: "📋 Auditoría",     desc: "Ver logs de auditoría del sistema" },
] as const;

/** Returns true if the user has a permission. Empty array = super admin = all. */
function hasPermission(perms: string[], perm: string): boolean {
  return perms.length === 0 || perms.includes(perm);
}

const ALL_TABS = [
  { id: "overview",     label: "📊 Resumen",     perm: null },
  { id: "users",        label: "👥 Usuarios",    perm: "admin:users" },
  { id: "games",        label: "🎱 Juegos",       perm: "admin:games" },
  { id: "categories",   label: "🗂️ Categorías",  perm: "admin:games" },
  { id: "withdrawals",  label: "💸 Retiros",      perm: "admin:withdrawals" },
  { id: "winners",      label: "🏆 Ganadores",   perm: "admin:games" },
  { id: "resets",       label: "🔑 Resets",       perm: "admin:resets" },
  { id: "logs",         label: "📋 Auditoría",   perm: "admin:logs" },
] as const;

type Tab = typeof ALL_TABS[number]["id"];

const DEPTS = ["Beni","Chuquisaca","Cochabamba","La Paz","Oruro","Pando","Potosí","Santa Cruz","Tarija"];

// ── User Detail Modal ─────────────────────────────────────────────────────────
function UserDetailModal({ userId, token, onClose, onUserUpdated }: {
  userId: number;
  token: string;
  onClose: () => void;
  onUserUpdated: (u: any) => void;
}) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"verify" | "info" | "role" | "password" | "balance" | "danger">("info");

  const [tempPwd, setTempPwd] = useState("");
  const [tempPwdHours, setTempPwdHours] = useState(24);
  const [savingPwd, setSavingPwd] = useState(false);

  const [adjType, setAdjType] = useState<"credit" | "debit">("credit");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [savingAdj, setSavingAdj] = useState(false);

  const [banReason, setBanReason] = useState("");
  const [savingBan, setSavingBan] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingVerify, setSavingVerify] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const auth = useCallback(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  useEffect(() => {
    fetch(`${BASE}/api/admin/users/${userId}`, { headers: auth() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setUser(d);
        setLoading(false);
        if (d?.status === "pending") setSection("verify");
      })
      .catch(() => setLoading(false));
  }, [userId]);

  async function setTempPassword() {
    if (tempPwd.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    setSavingPwd(true);
    const r = await fetch(`${BASE}/api/admin/users/${userId}/set-temp-password`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ temp_password: tempPwd, expires_hours: tempPwdHours }),
    });
    setSavingPwd(false);
    if (r.ok) {
      const expiresAt = new Date(Date.now() + tempPwdHours * 3600000);
      toast.success(`✅ Contraseña temporal establecida. Vence en ${tempPwdHours}h (${expiresAt.toLocaleString("es-BO")})`);
      setTempPwd("");
      setUser((u: any) => ({ ...u, must_change_password: true }));
    } else { const d = await r.json(); toast.error(d.error || "Error"); }
  }

  async function adjustBalance() {
    const amount = parseFloat(adjAmount);
    if (!amount || amount <= 0) { toast.error("Monto inválido"); return; }
    setSavingAdj(true);
    const r = await fetch(`${BASE}/api/admin/users/${userId}/adjust-balance`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ amount, type: adjType, reason: adjReason || undefined }),
    });
    setSavingAdj(false);
    if (r.ok) {
      const d = await r.json();
      toast.success(`✅ ${adjType === "credit" ? "Crédito" : "Débito"} aplicado`);
      setUser((u: any) => ({ ...u, balance: d.new_balance }));
      onUserUpdated({ ...user, balance: d.new_balance });
      setAdjAmount(""); setAdjReason("");
    } else { const d = await r.json(); toast.error(d.error || "Error"); }
  }

  async function toggleBan() {
    const banning = !user.is_banned;
    if (banning && !banReason.trim()) { toast.error("Indica el motivo del baneo"); return; }
    setSavingBan(true);
    const r = await fetch(`${BASE}/api/admin/users/${userId}/ban`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ banned: banning, reason: banning ? banReason : undefined }),
    });
    setSavingBan(false);
    if (r.ok) {
      const d = await r.json();
      toast.success(banning ? "🔴 Usuario baneado" : "✅ Baneo levantado");
      setUser((u: any) => ({ ...u, is_banned: banning, ban_reason: banning ? banReason : null }));
      onUserUpdated(d.user);
      setBanReason("");
    } else { const d = await r.json(); toast.error(d.error || "Error"); }
  }

  async function deleteUser() {
    const r = await fetch(`${BASE}/api/admin/users/${userId}`, { method: "DELETE", headers: auth() });
    if (r.ok) {
      toast.success("🗑 Usuario eliminado");
      onUserUpdated(null);
      onClose();
    } else { const d = await r.json(); toast.error(d.error || "Error"); }
  }

  async function verifyAccount(approved: boolean) {
    if (!approved && !rejectReason.trim()) { toast.error("Indica el motivo del rechazo"); return; }
    setSavingVerify(true);
    const r = await fetch(`${BASE}/api/admin/users/${userId}/verify`, {
      method: "POST", headers: auth(),
      body: JSON.stringify({ approved, reason: approved ? undefined : rejectReason }),
    });
    setSavingVerify(false);
    if (r.ok) {
      const d = await r.json();
      toast.success(approved ? "✅ Cuenta aprobada — usuario activo" : "🔄 Documentos rechazados — el usuario deberá reenviarlos");
      setUser((u: any) => approved
        ? { ...u, status: d.status }
        : { ...u, status: d.status, needs_ci_upload: true, id_photo_front_url: null, id_photo_back_url: null });
      onUserUpdated(d);
      setSection("info");
    } else { const d = await r.json(); toast.error(d.error || "Error"); }
  }

  async function setUserRole(makeAdmin: boolean) {
    setSavingRole(true);
    const r = await fetch(`${BASE}/api/admin/users/${userId}/role`, {
      method: "PUT", headers: auth(),
      body: JSON.stringify({ is_admin: makeAdmin }),
    });
    setSavingRole(false);
    if (r.ok) {
      const d = await r.json();
      toast.success(makeAdmin ? "🛡️ Rol de administrador asignado" : "👤 Rol cambiado a jugador");
      setUser((u: any) => ({ ...u, is_admin: d.is_admin }));
      onUserUpdated({ ...user, is_admin: d.is_admin });
    } else { const d = await r.json(); toast.error(d.error || "Error"); }
  }

  function downloadUrl(url: string, name: string) {
    const a = document.createElement("a");
    a.href = url; a.download = name; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.click();
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
        <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  const whatsappUrl = `https://wa.me/${user.phone?.replace(/\D/g, "")}`;

  const sectionBtns = [
    ...(user.status === "pending" ? [{ id: "verify" as const, label: "✅ Verificar" }] : []),
    { id: "info" as const, label: "📋 Info" },
    { id: "role" as const, label: "🛡️ Rol" },
    { id: "password" as const, label: "🔑 Contraseña" },
    { id: "balance" as const, label: "💰 Saldo" },
    { id: "danger" as const, label: "⚠️ Acciones" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}>

        {/* Header */}
        <div className="p-4 flex items-center gap-3 sticky top-0 z-10"
          style={{ background: "hsl(var(--background))", borderBottom: "1px solid hsl(var(--border))" }}>
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="avatar" className="w-12 h-12 rounded-2xl object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shrink-0"
              style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
              {user.full_name?.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold truncate">{user.full_name}</p>
              {user.is_admin && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">🛡️ ADMIN</span>}
              {user.is_banned && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">BANEADO</span>}
              {user.must_change_password && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Debe cambiar pwd</span>}
            </div>
            <p className="text-xs text-muted-foreground">CI: {user.ci} · {user.department}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl font-bold p-1">✕</button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 px-4 py-2 overflow-x-auto" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          {sectionBtns.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
              style={{
                background: section === s.id ? "hsl(var(--primary))" : "hsl(var(--muted))",
                color: section === s.id ? "white" : "hsl(var(--foreground))",
              }}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4">

          {/* ── VERIFICAR IDENTIDAD ───────────────────── */}
          {section === "verify" && (
            <div className="space-y-4">
              {/* Status banner */}
              <div className="rounded-2xl p-4 text-center"
                style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.35)" }}>
                <p className="text-2xl mb-1">⏳</p>
                <p className="font-black">Cuenta pendiente de verificación</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Revisa los documentos enviados y aprueba o rechaza la cuenta.
                </p>
              </div>

              {/* Registration info summary */}
              <div className="rounded-2xl px-3 py-3 space-y-1.5"
                style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Datos de registro a verificar</p>
                {[
                  { label: "Nombre completo", value: user.full_name },
                  { label: "CI", value: user.ci },
                  { label: "Teléfono", value: user.phone },
                  { label: "Departamento", value: user.department },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center gap-3">
                    <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
                    <span className="text-xs font-bold text-right">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* CI photos */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">📄 Documentos del CI enviados</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { url: user.id_photo_front_url, label: "Anverso" },
                    { url: user.id_photo_back_url, label: "Reverso" },
                  ].map(({ url, label }) => (
                    <div key={label} className="space-y-1">
                      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
                      {url ? (
                        <img src={url} alt={label}
                          className="w-full rounded-xl object-cover cursor-zoom-in border hover:opacity-90 transition-opacity"
                          style={{ height: 140 }}
                          onClick={() => window.open(url, "_blank")} />
                      ) : (
                        <div className="w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground"
                          style={{ height: 140 }}>
                          <span className="text-2xl mb-1">📷</span>
                          <span className="text-[11px]">Aún no enviada</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {(!user.id_photo_front_url || !user.id_photo_back_url) && (
                  <p className="text-xs text-center text-muted-foreground">
                    ⚠️ El usuario aún no ha enviado todos los documentos.
                  </p>
                )}
              </div>

              {/* Only show approve/reject when photos are uploaded */}
              {user.id_photo_front_url && user.id_photo_back_url ? (
                <>
                  <button onClick={() => verifyAccount(true)} disabled={savingVerify}
                    className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-50"
                    style={{ background: "#16a34a" }}>
                    {savingVerify ? "Procesando..." : "✅ Aprobar cuenta — activar usuario"}
                  </button>
                  <div className="space-y-2">
                    <input type="text" className="input-field"
                      placeholder="Motivo del rechazo (obligatorio para rechazar)"
                      value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                    <button onClick={() => verifyAccount(false)} disabled={savingVerify || !rejectReason.trim()}
                      className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
                      style={{ background: "hsl(0 75% 50%)" }}>
                      {savingVerify ? "..." : "🔄 Rechazar — pedir reenvío de documentos"}
                    </button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      El usuario verá el motivo y deberá volver a enviar sus fotos de CI.
                    </p>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl p-4 text-center text-sm text-muted-foreground"
                  style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                  ⏳ Esperando que el usuario suba sus documentos de CI para poder verificar.
                </div>
              )}
            </div>
          )}

          {/* ── INFO ─────────────────────────────────── */}
          {section === "info" && (
            <div className="space-y-4">
              {/* Documentos de identidad — siempre visible */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">📄 Documentos de identidad (CI)</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { url: user.id_photo_front_url, label: "Anverso", filename: `CI_anverso_${user.ci}.jpg` },
                    { url: user.id_photo_back_url, label: "Reverso", filename: `CI_reverso_${user.ci}.jpg` },
                  ].map(({ url, label, filename }) => (
                    <div key={label} className="space-y-1">
                      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
                      {url ? (
                        <>
                          <img src={url} alt={label}
                            className="w-full rounded-xl object-cover cursor-zoom-in border hover:opacity-90 transition-opacity"
                            style={{ maxHeight: 130 }}
                            onClick={() => window.open(url, "_blank")} />
                          <button onClick={() => downloadUrl(url, filename)}
                            className="w-full text-xs font-bold py-1.5 rounded-lg"
                            style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
                            ⬇ Descargar
                          </button>
                        </>
                      ) : (
                        <div className="w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground"
                          style={{ height: 130, borderColor: "hsl(var(--border))" }}>
                          <span className="text-2xl mb-1">📷</span>
                          <span className="text-[11px] font-semibold">Sin foto</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Registration info */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Datos de registro</p>
                <div className="rounded-2xl divide-y" style={{ border: "1px solid hsl(var(--border))" }}>
                  {[
                    { label: "Nombre completo", value: user.full_name },
                    { label: "CI", value: user.ci },
                    { label: "Departamento", value: user.department },
                    { label: "Teléfono / WhatsApp", value: user.phone },
                    { label: "Estado", value: user.status === "active" ? "✅ Activo" : user.status === "pending" ? "⏳ Pendiente" : "❌ Rechazado" },
                    { label: "Saldo actual", value: `Bs ${parseFloat(user.balance).toFixed(2)}` },
                    { label: "Cartones comprados", value: user.cards_purchased ?? "—" },
                    { label: "Premios ganados", value: user.wins ?? "—" },
                    { label: "Miembro desde", value: new Date(user.created_at).toLocaleDateString("es-BO") },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center px-3 py-2 gap-3">
                      <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
                      <span className="text-xs font-bold text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* IP & last activity */}
              <div className="rounded-2xl px-3 py-3 space-y-1.5"
                style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Red / Actividad</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Última IP registrada</span>
                  <span className="font-mono font-bold">{user.last_known_ip ?? user.last_audit_ip ?? "—"}</span>
                </div>
                {user.last_audit_at && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Última actividad</span>
                    <span className="font-bold">{new Date(user.last_audit_at).toLocaleString("es-BO")}</span>
                  </div>
                )}
              </div>

              {/* WhatsApp button */}
              {user.phone && (
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-bold text-sm"
                  style={{ background: "#25d366", color: "white" }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.113.551 4.094 1.517 5.814L.057 23.57a.75.75 0 00.918.899l5.945-1.557A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.694 9.694 0 01-4.944-1.352l-.355-.211-3.678.963.981-3.59-.232-.37A9.694 9.694 0 012.25 12c0-5.376 4.374-9.75 9.75-9.75S21.75 6.624 21.75 12 17.376 21.75 12 21.75z"/>
                  </svg>
                  Enviar mensaje por WhatsApp
                </a>
              )}
            </div>
          )}

          {/* ── ROL ──────────────────────────────────── */}
          {section === "role" && (
            <div className="space-y-4">
              {/* Current role card */}
              <div className="rounded-2xl p-4 text-center"
                style={{
                  background: user.is_admin ? "hsl(270 60% 50% / 0.08)" : "hsl(var(--muted) / 0.5)",
                  border: `1px solid ${user.is_admin ? "hsl(270 60% 50% / 0.3)" : "hsl(var(--border))"}`,
                }}>
                <p className="text-3xl mb-1">{user.is_admin ? "🛡️" : "👤"}</p>
                <p className="font-black text-lg">{user.is_admin ? "Administrador" : "Jugador"}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {user.is_admin
                    ? "Tiene acceso completo al panel de administración"
                    : "Solo puede comprar cartones y participar en juegos"}
                </p>
              </div>

              {/* Admin permissions info */}
              {user.is_admin && (
                <div className="rounded-2xl p-3 space-y-1.5"
                  style={{ background: "hsl(270 60% 50% / 0.06)", border: "1px solid hsl(270 60% 50% / 0.2)" }}>
                  <p className="text-xs font-bold" style={{ color: "hsl(270 60% 40%)" }}>Permisos de administrador:</p>
                  {[
                    "Ver y gestionar todos los usuarios",
                    "Crear y administrar juegos de bingo",
                    "Cantar números en juegos en vivo",
                    "Validar ganadores y procesar retiros",
                    "Ver logs de auditoría",
                    "Crear nuevos usuarios y asignar roles",
                  ].map(p => (
                    <p key={p} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span style={{ color: "hsl(270 60% 50%)" }}>✓</span> {p}
                    </p>
                  ))}
                </div>
              )}

              {/* Toggle role button */}
              {user.is_admin ? (
                <button onClick={() => setUserRole(false)} disabled={savingRole}
                  className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-50"
                  style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
                  {savingRole ? "Cambiando..." : "👤 Quitar rol de administrador"}
                </button>
              ) : (
                <button onClick={() => setUserRole(true)} disabled={savingRole}
                  className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
                  style={{ background: "hsl(270 60% 50%)" }}>
                  {savingRole ? "Asignando..." : "🛡️ Hacer administrador"}
                </button>
              )}

              <p className="text-[11px] text-muted-foreground text-center">
                {user.is_admin
                  ? "Al quitar el rol, el usuario perderá acceso inmediato al panel de admin."
                  : "Al asignar el rol, el usuario tendrá acceso completo al panel de admin."}
              </p>
            </div>
          )}

          {/* ── CONTRASEÑA ───────────────────────────── */}
          {section === "password" && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: "hsl(42 98% 52% / 0.08)", border: "1px solid hsl(42 98% 52% / 0.25)" }}>
                <p className="text-sm font-bold">🔑 Establecer contraseña temporal</p>
                <p className="text-xs text-muted-foreground">El usuario deberá cambiar esta contraseña la próxima vez que ingrese al perfil.</p>
              </div>
              <input
                type="text"
                className="input-field"
                placeholder="Nueva contraseña temporal (mín. 6 caracteres)"
                value={tempPwd}
                onChange={e => setTempPwd(e.target.value)}
              />

              {/* Validity duration */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground">Validez de la contraseña temporal</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[6, 24, 48, 72].map(h => (
                    <button key={h} onClick={() => setTempPwdHours(h)}
                      className="py-2 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: tempPwdHours === h ? "hsl(var(--primary))" : "hsl(var(--muted))",
                        color: tempPwdHours === h ? "white" : "hsl(var(--foreground))",
                      }}>
                      {h}h
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">Personalizado:</span>
                  <input type="number" min="1" max="720"
                    className="input-field flex-1 text-center py-1.5"
                    value={tempPwdHours}
                    onChange={e => setTempPwdHours(Math.max(1, Math.min(720, parseInt(e.target.value) || 24)))}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">horas</span>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Vence el {new Date(Date.now() + tempPwdHours * 3600000).toLocaleString("es-BO", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>

              <button onClick={setTempPassword} disabled={savingPwd || tempPwd.length < 6}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
                style={{ background: "hsl(var(--primary))" }}>
                {savingPwd ? "Guardando..." : "Establecer contraseña temporal"}
              </button>
              {user.must_change_password && (
                <div className="rounded-2xl p-3 text-center"
                  style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
                  <p className="text-xs font-bold text-yellow-700">⚠️ Este usuario tiene una contraseña temporal pendiente de cambio</p>
                  {user.temp_password_expires_at && (
                    <p className="text-[11px] text-yellow-600 mt-0.5">
                      Vence: {new Date(user.temp_password_expires_at).toLocaleString("es-BO")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── SALDO ────────────────────────────────── */}
          {section === "balance" && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 text-center"
                style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
                <p className="text-xs text-muted-foreground">Saldo actual</p>
                <p className="text-3xl font-black" style={{ color: "hsl(var(--primary))" }}>
                  Bs {parseFloat(user.balance).toFixed(2)}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex rounded-2xl overflow-hidden border" style={{ borderColor: "hsl(var(--border))" }}>
                  <button onClick={() => setAdjType("credit")}
                    className="flex-1 py-2.5 text-sm font-bold transition-all"
                    style={{ background: adjType === "credit" ? "#16a34a" : "transparent", color: adjType === "credit" ? "white" : "hsl(var(--foreground))" }}>
                    ➕ Acreditar
                  </button>
                  <button onClick={() => setAdjType("debit")}
                    className="flex-1 py-2.5 text-sm font-bold transition-all"
                    style={{ background: adjType === "debit" ? "hsl(0 75% 50%)" : "transparent", color: adjType === "debit" ? "white" : "hsl(var(--foreground))" }}>
                    ➖ Debitar
                  </button>
                </div>

                <input type="number" min="0" step="0.01" className="input-field"
                  placeholder="Monto en Bs" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} />
                <input type="text" className="input-field"
                  placeholder="Motivo (visible en historial del usuario)"
                  value={adjReason} onChange={e => setAdjReason(e.target.value)} />
                <button onClick={adjustBalance} disabled={savingAdj || !adjAmount}
                  className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50"
                  style={{ background: adjType === "credit" ? "#16a34a" : "hsl(0 75% 50%)" }}>
                  {savingAdj ? "Procesando..." : adjType === "credit" ? "Acreditar saldo" : "Debitar saldo"}
                </button>

                <p className="text-[11px] text-muted-foreground text-center">
                  Este ajuste aparecerá en el Historial de Retiros del usuario como "{adjType === "credit" ? "Crédito de administrador" : "Débito de administrador"}".
                </p>
              </div>
            </div>
          )}

          {/* ── DANGER ZONE ──────────────────────────── */}
          {section === "danger" && (
            <div className="space-y-4">
              {/* Ban / Unban */}
              <div className="rounded-2xl p-4 space-y-3"
                style={{
                  border: `1px solid ${user.is_banned ? "hsl(0 75% 50% / 0.4)" : "hsl(var(--border))"}`,
                  background: user.is_banned ? "hsl(0 75% 52% / 0.06)" : "transparent",
                }}>
                <p className="font-bold text-sm">{user.is_banned ? "🔴 Usuario baneado" : "🔒 Banear usuario"}</p>
                {user.is_banned ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Motivo actual: <span className="font-bold">{user.ban_reason ?? "Sin motivo especificado"}</span></p>
                    <button onClick={toggleBan} disabled={savingBan}
                      className="w-full py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                      style={{ background: "#16a34a" }}>
                      {savingBan ? "..." : "✅ Levantar baneo"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input type="text" className="input-field" placeholder="Motivo del baneo (obligatorio)"
                      value={banReason} onChange={e => setBanReason(e.target.value)} />
                    <button onClick={toggleBan} disabled={savingBan || !banReason.trim()}
                      className="w-full py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                      style={{ background: "hsl(0 75% 50%)" }}>
                      {savingBan ? "..." : "🔴 Banear usuario"}
                    </button>
                    <p className="text-[11px] text-muted-foreground">El usuario no podrá iniciar sesión mientras esté baneado.</p>
                  </div>
                )}
              </div>

              {/* Delete */}
              <div className="rounded-2xl p-4 space-y-3"
                style={{ border: "1px solid hsl(0 75% 50% / 0.3)", background: "hsl(0 75% 52% / 0.04)" }}>
                <p className="font-bold text-sm">🗑 Eliminar cuenta</p>
                <p className="text-xs text-muted-foreground">Elimina permanentemente la cuenta del usuario. Esta acción no se puede deshacer.</p>
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)}
                    className="w-full py-2.5 rounded-xl font-bold text-sm"
                    style={{ background: "hsl(0 75% 50% / 0.12)", color: "hsl(0 75% 40%)", border: "1px solid hsl(0 75% 50% / 0.3)" }}>
                    Eliminar usuario
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-red-600">¿Estás seguro? Esta acción es IRREVERSIBLE.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-xl text-sm font-bold"
                        style={{ background: "hsl(var(--muted))" }}>
                        Cancelar
                      </button>
                      <button onClick={deleteUser}
                        className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                        style={{ background: "hsl(0 75% 50%)" }}>
                        Sí, eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState<Tab>("overview");

  const [stats, setStats] = useState<any>(null);
  const [deptStats, setDeptStats] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [winners, setWinners] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [catDraft, setCatDraft] = useState<Record<number, any>>({});
  const [savingCat, setSavingCat] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [numberInput, setNumberInput] = useState<Record<number, string>>({});
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [payForm, setPayForm] = useState<Record<number, { proof: string; pin: string; open: boolean }>>({});
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [pendingResets, setPendingResets] = useState<any[]>([]);
  const [approvedResets, setApprovedResets] = useState<any[]>([]);
  const [approvingReset, setApprovingReset] = useState<number | null>(null);
  const [rejectingReset, setRejectingReset] = useState<number | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: "", ci: "", phone: "", password: "", department: "", is_admin: false, permissions: [] as string[], skip_ci: false,
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [pendingWinnersCount, setPendingWinnersCount] = useState(0);

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  // Global poll for pending bingo claims — badge visible from any tab.
  // Also refreshes the winners list when the admin is already on that tab.
  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}/api/admin/winners/pending`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          setPendingWinnersCount(d.length);
          setWinners(prev => {
            // Only update when on winners tab to avoid stale-set overwriting active edits
            if (tab === "winners") return d;
            return prev;
          });
        }
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => clearInterval(iv);
  }, [token, tab]);

  async function loadStats() {
    try {
      const [sR, dR] = await Promise.all([
        fetch(`${BASE}/api/admin/stats`, { headers: authH() }),
        fetch(`${BASE}/api/admin/stats/departments`, { headers: authH() }),
      ]);
      if (sR.ok) setStats(await sR.json());
      if (dR.ok) setDeptStats(await dR.json());
    } catch {}
  }

  async function loadTab(t: Tab) {
    setLoading(true);
    try {
      if (t === "users" || t === "overview") {
        const r = await fetch(`${BASE}/api/admin/users`, { headers: authH() });
        if (r.ok) setUsers(await r.json());
      }
      if (t === "games" || t === "overview") {
        const r = await fetch(`${BASE}/api/games`, { headers: authH() });
        if (r.ok) setGames(await r.json());
      }
      if (t === "withdrawals") {
        const r = await fetch(`${BASE}/api/admin/withdrawals`, { headers: authH() });
        if (r.ok) setWithdrawals(await r.json());
      }
      if (t === "winners") {
        const r = await fetch(`${BASE}/api/admin/winners/pending`, { headers: authH(), cache: "no-store" });
        if (r.ok) { setWinners(await r.json()); setPendingWinnersCount(0); }
      }
      if (t === "logs") {
        const r = await fetch(`${BASE}/api/admin/audit-logs`, { headers: authH() });
        if (r.ok) setLogs(await r.json());
      }
      if (t === "categories") {
        const r = await fetch(`${BASE}/api/categories`, { headers: authH() });
        if (r.ok) {
          const cats = await r.json();
          setCategories(cats);
          const draft: Record<number, any> = {};
          for (const c of cats) draft[c.id] = { ...c };
          setCatDraft(draft);
        }
      }
      if (t === "resets") {
        const r = await fetch(`${BASE}/api/admin/password-resets`, { headers: authH() });
        if (r.ok) {
          const d = await r.json();
          setPendingResets(d.pending ?? []);
          setApprovedResets(d.approved ?? []);
        }
      }
    } catch {}
    setLoading(false);
  }

  async function approveReset(userId: number, phone: string | null) {
    setApprovingReset(userId);
    try {
      const r = await fetch(`${BASE}/api/admin/users/${userId}/approve-reset`, {
        method: "POST", headers: authH(),
      });
      if (r.ok) {
        const d = await r.json();
        toast.success("✅ Contraseña temporal generada");
        // Reload to get updated pending/approved lists
        const lr = await fetch(`${BASE}/api/admin/password-resets`, { headers: authH() });
        if (lr.ok) {
          const ld = await lr.json();
          setPendingResets(ld.pending ?? []);
          setApprovedResets(ld.approved ?? []);
        }
        if (phone) sendWhatsApp(phone, d.temp_password);
      } else {
        const d = await r.json();
        toast.error(d.error || "Error al generar contraseña");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setApprovingReset(null);
    }
  }

  function sendWhatsApp(phone: string, tempPwd: string) {
    const cleanPhone = phone.replace(/\D/g, "");
    const msg = `Hola! Tu contraseña temporal de Tu Bingazo es: *${tempPwd}*\nCámbiala inmediatamente después de iniciar sesión. 🔑`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function rejectReset(userId: number, ban = false) {
    const banReason = ban ? prompt("Motivo del baneo (opcional):") ?? "" : "";
    setRejectingReset(userId);
    try {
      const r = await fetch(`${BASE}/api/admin/users/${userId}/reject-reset`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ ban, ban_reason: banReason || undefined }),
      });
      if (r.ok) {
        toast.success(ban ? "🔴 Solicitud rechazada y usuario baneado" : "Solicitud rechazada");
        setPendingResets(prev => prev.filter(u => u.id !== userId));
      } else {
        const d = await r.json();
        toast.error(d.error || "Error");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setRejectingReset(null);
    }
  }

  useEffect(() => { loadStats(); loadTab("overview"); }, []);

  async function createUser() {
    const { full_name, ci, phone, password, department, is_admin, permissions, skip_ci } = createForm;
    if (!full_name.trim() || !ci.trim() || !phone.trim() || !password || !department.trim()) {
      toast.error("Completa todos los campos"); return;
    }
    if (password.length < 6) { toast.error("Contraseña mínimo 6 caracteres"); return; }
    if (is_admin && permissions.length === 0) {
      const proceed = window.confirm("¿Crear como super administrador con acceso total? Pulsa Cancelar para asignar permisos específicos.");
      if (!proceed) return;
    }
    setCreatingUser(true);
    const r = await fetch(`${BASE}/api/admin/users`, {
      method: "POST", headers: authH(),
      body: JSON.stringify({ full_name, ci, phone, password, department, is_admin, permissions, skip_ci }),
    });
    setCreatingUser(false);
    if (r.ok) {
      const newUser = await r.json();
      toast.success(`✅ Usuario ${newUser.full_name} creado`);
      setUsers(us => [newUser, ...us]);
      setShowCreateUser(false);
      setCreateForm({ full_name: "", ci: "", phone: "", password: "", department: "", is_admin: false, permissions: [], skip_ci: false });
      loadStats();
    } else { const d = await r.json(); toast.error(d.error || "Error al crear usuario"); }
  }

  function handleTab(t: Tab) { setTab(t); loadTab(t); }

  async function verifyUser(userId: number, approved: boolean) {
    const r = await fetch(`${BASE}/api/admin/users/${userId}/verify`, {
      method: "POST", headers: authH(), body: JSON.stringify({ approved }),
    });
    if (r.ok) {
      const d = await r.json();
      toast.success(approved ? "✅ Usuario aprobado" : "🔄 Documentos rechazados — el usuario deberá reenviarlos");
      setUsers(us => us.map(u => u.id === userId
        ? approved
          ? { ...u, status: "active" }
          : { ...u, status: "rejected", needs_ci_upload: true, id_photo_front_url: null, id_photo_back_url: null, rejection_reason: d.rejection_reason }
        : u));
      loadStats();
    }
  }

  function openPayForm(wId: number) {
    setPayForm(pf => ({ ...pf, [wId]: { proof: "", pin: "", open: true } }));
  }

  async function markWithdrawalPaid(wId: number, method: string) {
    const form = payForm[wId];
    const body: any = {};
    if (method === "qr" && form?.proof) body.payment_proof_url = form.proof;
    if (method === "bank_transfer" && form?.pin) body.withdrawal_pin = form.pin;
    const r = await fetch(`${BASE}/api/admin/withdrawals/${wId}/mark-paid`, {
      method: "POST", headers: authH(), body: JSON.stringify(body),
    });
    if (r.ok) {
      const updated = await r.json();
      toast.success("✅ Retiro marcado como pagado");
      setWithdrawals(ws => ws.map(w => w.id === wId ? { ...w, status: "paid", payment_proof_url: updated.payment_proof_url, withdrawal_pin: updated.withdrawal_pin } : w));
      setPayForm(pf => { const n = { ...pf }; delete n[wId]; return n; });
      loadStats();
    } else {
      const d = await r.json();
      toast.error(d.error || "Error");
    }
  }

  async function validateWinner(wId: number, approved: boolean) {
    const r = await fetch(`${BASE}/api/admin/winners/${wId}/validate`, {
      method: "POST", headers: authH(), body: JSON.stringify({ approved }),
    });
    if (r.ok) {
      toast.success(approved ? "🏆 Ganador validado y saldo acreditado" : "Reclamo rechazado");
      // Remove from pending list (both approved and rejected are no longer pending)
      setWinners(ws => ws.filter(w => w.id !== wId));
      setPendingWinnersCount(c => Math.max(0, c - 1));
    } else {
      const d = await r.json();
      toast.error(d.error || "Error");
    }
  }

  async function callNumber(gameId: number) {
    const input = numberInput[gameId];
    const num = input ? parseInt(input) : Math.floor(Math.random() * 75) + 1;
    if (num < 1 || num > 75) { toast.error("Número debe ser entre 1 y 75"); return; }
    const r = await fetch(`${BASE}/api/games/${gameId}/call-number`, {
      method: "POST", headers: authH(), body: JSON.stringify({ number: num }),
    });
    if (r.ok) {
      toast.success(`🎱 Número ${num} cantado`);
      setNumberInput(prev => ({ ...prev, [gameId]: "" }));
      setGames(gs => gs.map(g => g.id === gameId
        ? { ...g, called_numbers: [...(g.called_numbers ?? []), num] }
        : g));
    } else {
      const d = await r.json();
      toast.error(d.error || "Error");
    }
  }

  async function startGame(gameId: number) {
    const r = await fetch(`${BASE}/api/games/${gameId}/start`, { method: "POST", headers: authH() });
    if (r.ok) { toast.success("▶ Juego iniciado"); setGames(gs => gs.map(g => g.id === gameId ? { ...g, status: "active", called_numbers: [] } : g)); loadStats(); }
  }

  async function finishGame(gameId: number) {
    if (!confirm("¿Finalizar este juego?")) return;
    const r = await fetch(`${BASE}/api/games/${gameId}/finish`, { method: "POST", headers: authH() });
    if (r.ok) { toast.success("⏹ Juego finalizado"); setGames(gs => gs.map(g => g.id === gameId ? { ...g, status: "finished" } : g)); loadStats(); }
  }

  async function toggleFeatured(gameId: number, current: boolean) {
    const r = await fetch(`${BASE}/api/admin/games/${gameId}/featured`, {
      method: "PATCH", headers: authH(), body: JSON.stringify({ is_featured: !current }),
    });
    if (r.ok) {
      setGames(gs => gs.map(g => g.id === gameId ? { ...g, is_featured: !current } : g));
      toast.success(!current ? "⭐ Juego destacado en inicio" : "Juego removido de destacados");
    }
  }

  async function reactivateGame(gameId: number) {
    if (!confirm("¿Reactivar este juego? Volverá a estado 'Próximo' y los jugadores podrán comprar cartones.")) return;
    const r = await fetch(`${BASE}/api/games/${gameId}`, {
      method: "PATCH", headers: authH(), body: JSON.stringify({ status: "upcoming" }),
    });
    if (r.ok) {
      setGames(gs => gs.map(g => g.id === gameId ? { ...g, status: "upcoming" } : g));
      toast.success("♻ Juego reactivado");
      loadStats();
    } else { toast.error("No se pudo reactivar el juego"); }
  }

  async function deleteGame(gameId: number) {
    if (!confirm("¿ELIMINAR este juego de forma permanente? Se borrarán también todos sus cartones y ganadores. Esta acción no se puede deshacer.")) return;
    const r = await fetch(`${BASE}/api/games/${gameId}`, { method: "DELETE", headers: authH() });
    if (r.ok) { setGames(gs => gs.filter(g => g.id !== gameId)); toast.success("🗑 Juego eliminado"); loadStats(); }
    else { toast.error("No se pudo eliminar el juego"); }
  }

  function updCatDraft(id: number, field: string, value: any) {
    setCatDraft(d => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  async function saveCategory(id: number) {
    const d = catDraft[id];
    if (!d) return;
    setSavingCat(id);
    try {
      const r = await fetch(`${BASE}/api/categories/${id}`, {
        method: "PATCH", headers: authH(),
        body: JSON.stringify({
          label: d.label, emoji: d.emoji, description: d.description,
          color_from: d.color_from, color_to: d.color_to,
          background_image_url: d.background_image_url ?? null,
          sort_order: parseInt(String(d.sort_order)) || 0,
          is_active: d.is_active,
          stream_url_youtube: d.stream_url_youtube?.trim() || null,
          stream_url_tiktok: d.stream_url_tiktok?.trim() || null,
          stream_url_facebook: d.stream_url_facebook?.trim() || null,
        }),
      });
      if (r.ok) {
        const updated = await r.json();
        setCategories(cs => cs.map(c => c.id === id ? updated : c));
        setCatDraft(dr => ({ ...dr, [id]: { ...updated } }));
        toast.success("✅ Categoría actualizada");
      } else { toast.error("No se pudo guardar la categoría"); }
    } catch { toast.error("Error al guardar la categoría"); }
    finally { setSavingCat(null); }
  }

  if (!user?.is_admin) {
    return (
      <AppLayout>
        <div className="p-4 text-center py-20">
          <p className="text-5xl mb-3">🔒</p>
          <p className="font-bold text-xl">Acceso denegado</p>
          <button className="btn-primary mt-6 max-w-xs mx-auto" onClick={() => navigate("/juegos")}>Volver</button>
        </div>
      </AppLayout>
    );
  }

  const filteredUsers = users.filter(u => {
    const matchSearch = !userSearch ||
      u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.ci.includes(userSearch) ||
      u.phone?.includes(userSearch) ||
      u.department?.toLowerCase().includes(userSearch.toLowerCase());
    const matchStatus = userStatusFilter === "all" ||
      (userStatusFilter === "banned" ? u.is_banned :
       userStatusFilter === "pending" ? u.status === "pending" :
       userStatusFilter === "active" ? u.status === "active" && !u.is_banned :
       u.status === userStatusFilter);
    return matchSearch && matchStatus;
  });
  const pendingUsers = users.filter(u => u.status === "pending").length;
  const activeGames = games.filter(g => g.status === "active").length;
  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending").length;

  const maxDeptTotal = deptStats.length ? Math.max(...deptStats.map(d => d.total)) : 1;

  function statusColor(status: string, isBanned: boolean) {
    if (isBanned) return { bg: "hsl(0 75% 52% / 0.1)", text: "hsl(0 75% 40%)", label: "🔴 Baneado" };
    if (status === "active") return { bg: "hsl(142 70% 45% / 0.12)", text: "hsl(142 70% 30%)", label: "✓ Activo" };
    if (status === "pending") return { bg: "hsl(42 98% 52% / 0.12)", text: "hsl(42 98% 35%)", label: "⏳ Pendiente" };
    return { bg: "hsl(0 0% 50% / 0.1)", text: "hsl(0 0% 40%)", label: "Rechazado" };
  }

  function methodLabel(method: string) {
    const map: Record<string, string> = {
      cash: "Efectivo", bank_transfer: "Transferencia",
      admin_credit: "✅ Crédito admin", admin_debit: "➖ Débito admin",
    };
    return map[method] ?? method;
  }

  return (
    <AppLayout>
      {selectedUserId !== null && (
        <UserDetailModal
          userId={selectedUserId}
          token={token!}
          onClose={() => setSelectedUserId(null)}
          onUserUpdated={(updated) => {
            if (updated === null) {
              setUsers(us => us.filter(u => u.id !== selectedUserId));
              setSelectedUserId(null);
            } else {
              setUsers(us => us.map(u => u.id === selectedUserId ? { ...u, ...updated } : u));
            }
            loadStats();
          }}
        />
      )}

      {/* ── MODAL CREAR USUARIO ──────────────────────────── */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={e => e.target === e.currentTarget && setShowCreateUser(false)}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
            style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}>
            <div className="p-4 flex items-center justify-between sticky top-0 z-10"
              style={{ background: "hsl(var(--background))", borderBottom: "1px solid hsl(var(--border))" }}>
              <p className="font-black text-lg">➕ Crear usuario</p>
              <button onClick={() => setShowCreateUser(false)} className="text-muted-foreground hover:text-foreground text-xl font-bold p-1">✕</button>
            </div>

            <div className="p-4 space-y-3">
              <div className="rounded-2xl p-3 text-xs text-muted-foreground"
                style={{ background: "hsl(var(--primary) / 0.06)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
                El usuario se creará como <strong>activo</strong> directamente (sin verificación de CI).
              </div>

              {[
                { label: "Nombre completo", key: "full_name", type: "text", placeholder: "Ej: Juan Pérez Mamani" },
                { label: "CI (número)", key: "ci", type: "text", placeholder: "Ej: 12345678" },
                { label: "Teléfono / WhatsApp", key: "phone", type: "text", placeholder: "Ej: 70012345" },
                { label: "Contraseña (mín. 6 caracteres)", key: "password", type: "password", placeholder: "Contraseña inicial" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">{label}</label>
                  <input type={type} className="input-field"
                    placeholder={placeholder}
                    value={(createForm as any)[key]}
                    onChange={e => setCreateForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Departamento</label>
                <select className="input-field"
                  value={createForm.department}
                  onChange={e => setCreateForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="">Seleccionar departamento</option>
                  {["Beni","Chuquisaca","Cochabamba","La Paz","Oruro","Pando","Potosí","Santa Cruz","Tarija"].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Role toggle */}
              <button
                type="button"
                onClick={() => setCreateForm(f => ({ ...f, is_admin: !f.is_admin, permissions: [] }))}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-sm transition-all"
                style={{
                  background: createForm.is_admin ? "hsl(270 60% 50% / 0.1)" : "hsl(var(--muted))",
                  border: `1px solid ${createForm.is_admin ? "hsl(270 60% 50% / 0.4)" : "hsl(var(--border))"}`,
                  color: createForm.is_admin ? "hsl(270 60% 35%)" : "hsl(var(--foreground))",
                }}>
                <span>{createForm.is_admin ? "🛡️ Administrador" : "👤 Jugador"}</span>
                <span className="text-xs font-normal opacity-70">
                  {createForm.is_admin ? "Acceso al panel admin" : "Sin acceso al panel admin"}
                </span>
              </button>

              {/* Permissions — shown only when is_admin */}
              {createForm.is_admin && (
                <div className="rounded-2xl p-4 space-y-3"
                  style={{ background: "hsl(270 60% 50% / 0.05)", border: "1px solid hsl(270 60% 50% / 0.2)" }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-wide">Secciones que administrará</p>
                    <button type="button"
                      className="text-[11px] font-bold underline"
                      style={{ color: "hsl(270 60% 45%)" }}
                      onClick={() => setCreateForm(f => ({
                        ...f,
                        permissions: f.permissions.length === ADMIN_PERMS.length ? [] : ADMIN_PERMS.map(p => p.id),
                      }))}>
                      {createForm.permissions.length === ADMIN_PERMS.length ? "Quitar todos" : "Seleccionar todos"}
                    </button>
                  </div>

                  {createForm.permissions.length === 0 && (
                    <div className="rounded-xl px-3 py-2 text-xs text-center font-semibold"
                      style={{ background: "hsl(270 60% 50% / 0.1)", color: "hsl(270 60% 35%)" }}>
                      ⚡ Sin selección = Super admin (acceso total)
                    </div>
                  )}

                  <div className="space-y-2">
                    {ADMIN_PERMS.map(p => {
                      const active = createForm.permissions.includes(p.id);
                      return (
                        <button key={p.id} type="button"
                          onClick={() => setCreateForm(f => ({
                            ...f,
                            permissions: active
                              ? f.permissions.filter(x => x !== p.id)
                              : [...f.permissions, p.id],
                          }))}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                          style={{
                            background: active ? "hsl(270 60% 50% / 0.12)" : "hsl(var(--muted) / 0.5)",
                            border: `1px solid ${active ? "hsl(270 60% 50% / 0.4)" : "hsl(var(--border))"}`,
                          }}>
                          <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all"
                            style={{ background: active ? "hsl(270 60% 45%)" : "hsl(var(--border))" }}>
                            {active && <span className="text-white text-xs font-black">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold">{p.label}</p>
                            <p className="text-[11px] text-muted-foreground">{p.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Skip CI option */}
              <button type="button"
                onClick={() => setCreateForm(f => ({ ...f, skip_ci: !f.skip_ci }))}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all"
                style={{
                  background: createForm.skip_ci ? "hsl(142 70% 40% / 0.08)" : "hsl(var(--muted) / 0.5)",
                  border: `1px solid ${createForm.skip_ci ? "hsl(142 70% 40% / 0.35)" : "hsl(var(--border))"}`,
                }}>
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: createForm.skip_ci ? "hsl(142 70% 40%)" : "hsl(var(--border))" }}>
                  {createForm.skip_ci && <span className="text-white text-xs font-black">✓</span>}
                </div>
                <div>
                  <p className="text-xs font-bold">Omitir verificación de CI</p>
                  <p className="text-[11px] text-muted-foreground">El usuario entra directo sin subir fotos de documento</p>
                </div>
              </button>

              <button onClick={createUser} disabled={creatingUser}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50 mt-2"
                style={{ background: "hsl(var(--primary))" }}>
                {creatingUser ? "Creando..." : "✅ Crear usuario"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin header */}
      <div className="hero-bg px-4 py-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>🛡️ Panel Admin</h1>
            <p className="text-white/60 text-sm">Tu Bingazo — Control total</p>
          </div>
          <button onClick={() => navigate("/admin/crear-juego")}
            className="text-sm font-bold px-4 py-2 rounded-xl"
            style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
            + Crear juego
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 px-4 py-3"
          style={{ background: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))" }}>
          {[
            { label: "Usuarios", value: stats.total_users, color: "hsl(var(--primary))", alert: pendingUsers > 0 ? `${pendingUsers} pendientes` : null },
            { label: "En vivo", value: stats.active_games, color: "#16a34a" },
            { label: "Retiros pend.", value: stats.pending_withdrawals_count, color: "hsl(42 98% 40%)", alert: stats.pending_withdrawals_count > 0 ? "requieren acción" : null },
            { label: "Ingresos", value: `Bs ${(stats.total_revenue ?? 0).toFixed(0)}`, color: "hsl(var(--primary))" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="font-black text-xl" style={{ color: s.color, fontFamily: "'Poppins', sans-serif" }}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              {s.alert && <p className="text-[9px] font-bold" style={{ color: "hsl(0 75% 50%)" }}>{s.alert}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Tab navigation — filtered by current admin's permissions */}
      <div className="flex overflow-x-auto px-4 py-2 gap-1.5" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        {ALL_TABS.filter(t => !t.perm || hasPermission(user?.admin_permissions ?? [], t.perm)).map(t => (
          <button key={t.id} onClick={() => handleTab(t.id)}
            className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative"
            style={{
              background: tab === t.id ? "hsl(var(--primary))" : "transparent",
              color: tab === t.id ? "white" : "hsl(var(--foreground))",
            }}>
            {t.label}
            {t.id === "winners" && pendingWinnersCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center text-white"
                style={{ background: "hsl(0 75% 50%)" }}>
                {pendingWinnersCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-3 pb-24">
        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />Cargando...
          </div>
        )}

        {/* ── OVERVIEW ─────────────────────────────── */}
        {tab === "overview" && !loading && (
          <div className="space-y-4">
            {/* Active games */}
            {games.filter(g => g.status === "active").map(g => (
              <div key={g.id} className="rounded-2xl p-4 text-white"
                style={{ background: "linear-gradient(135deg, #1a0050, #3b00b8)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="live-badge"><div className="live-dot" />EN VIVO</div>
                  <span className="text-white/70 text-sm">{g.title}</span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <input type="number" min="1" max="75" placeholder="Número (1-75)"
                    className="flex-1 bg-white/10 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm font-bold border border-white/20 outline-none"
                    value={numberInput[g.id] ?? ""}
                    onChange={e => setNumberInput(prev => ({ ...prev, [g.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && callNumber(g.id)} />
                  <button onClick={() => callNumber(g.id)}
                    className="px-4 py-2 rounded-xl font-bold text-sm"
                    style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
                    🎱 Cantar
                  </button>
                </div>
                <div className="text-white/60 text-xs">
                  {g.called_numbers?.length ?? 0} números cantados · Bs {g.prize_amount} premio · {g.participant_count} jugadores
                </div>
                <button onClick={() => finishGame(g.id)} className="mt-2 text-xs text-red-300 underline">⏹ Finalizar juego</button>
              </div>
            ))}

            {/* Pending users alert */}
            {pendingUsers > 0 && (
              <div className="rounded-2xl p-4 flex items-center justify-between"
                style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
                <div>
                  <p className="font-bold">⏳ {pendingUsers} usuarios pendientes de verificación</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Revisa las fotos de CI para aprobar o rechazar</p>
                </div>
                <button onClick={() => handleTab("users")} className="text-xs font-bold px-3 py-1.5 rounded-xl"
                  style={{ background: "hsl(var(--primary))", color: "white" }}>Ver →</button>
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground">Próximos juegos</p>
                <p className="font-black text-2xl" style={{ color: "hsl(var(--primary))" }}>
                  {games.filter(g => g.status === "upcoming").length}
                </p>
              </div>
              <div className="bg-card border rounded-2xl p-4">
                <p className="text-xs text-muted-foreground">Juegos finalizados</p>
                <p className="font-black text-2xl">{games.filter(g => g.status === "finished").length}</p>
              </div>
            </div>

            {/* Department stats */}
            {deptStats.length > 0 && (
              <div className="bg-card border rounded-2xl p-4 space-y-3">
                <p className="font-bold text-sm">📍 Usuarios por departamento</p>
                <div className="space-y-2">
                  {deptStats.map(d => (
                    <div key={d.department}>
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-bold">{d.department}</span>
                        <div className="flex gap-2 text-[11px]">
                          <span className="font-black">{d.total}</span>
                          <span className="text-muted-foreground">({d.active} activos</span>
                          {d.pending > 0 && <span style={{ color: "hsl(42 98% 35%)" }}>{d.pending} pend.</span>}
                          {d.banned > 0 && <span style={{ color: "hsl(0 75% 45%)" }}>{d.banned} ban.</span>}
                          <span className="text-muted-foreground">)</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${(d.total / maxDeptTotal) * 100}%`, background: "hsl(var(--primary))" }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="text-center">
                    <p className="text-[11px] text-muted-foreground">Total usuarios</p>
                    <p className="font-black text-lg" style={{ color: "hsl(var(--primary))" }}>
                      {deptStats.reduce((s, d) => s + d.total, 0)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-muted-foreground">Departamentos</p>
                    <p className="font-black text-lg">{deptStats.length}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] text-muted-foreground">Saldo total</p>
                    <p className="font-black text-lg" style={{ color: "#16a34a" }}>
                      Bs {deptStats.reduce((s, d) => s + d.total_balance, 0).toFixed(0)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── USERS ─────────────────────────────────── */}
        {tab === "users" && !loading && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="input-field flex-1" placeholder="🔍 Buscar por nombre, CI, teléfono, departamento..."
                value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              <button onClick={() => setShowCreateUser(true)}
                className="shrink-0 px-4 py-2.5 rounded-2xl font-bold text-sm text-white whitespace-nowrap"
                style={{ background: "hsl(var(--primary))" }}>
                ➕ Crear
              </button>
            </div>

            {/* Status filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                { id: "all", label: `Todos (${users.length})` },
                { id: "pending", label: `Pendientes (${users.filter(u => u.status === "pending").length})` },
                { id: "active", label: `Activos (${users.filter(u => u.status === "active" && !u.is_banned).length})` },
                { id: "banned", label: `Baneados (${users.filter(u => u.is_banned).length})` },
                { id: "rejected", label: `Rechazados (${users.filter(u => u.status === "rejected" && !u.is_banned).length})` },
              ].map(f => (
                <button key={f.id} onClick={() => setUserStatusFilter(f.id)}
                  className="shrink-0 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                  style={{
                    background: userStatusFilter === f.id ? "hsl(var(--primary))" : "hsl(var(--muted))",
                    color: userStatusFilter === f.id ? "white" : "hsl(var(--foreground))",
                  }}>
                  {f.label}
                </button>
              ))}
            </div>

            {filteredUsers.map(u => {
              const sc = statusColor(u.status, u.is_banned);
              return (
                <div key={u.id} className="bg-card border rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="avatar" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0"
                          style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}>
                          {u.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground">CI: {u.ci}</p>
                        <p className="text-xs text-muted-foreground">{u.department} · {u.phone}</p>
                        <p className="text-xs font-bold mt-0.5" style={{ color: "hsl(var(--primary))" }}>
                          Bs {parseFloat(u.balance).toFixed(2)}
                        </p>
                        {u.is_banned && u.ban_reason && (
                          <p className="text-[11px] mt-0.5" style={{ color: "hsl(0 75% 45%)" }}>Motivo baneo: {u.ban_reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>

                      {/* Quick verify for pending — only when photos are uploaded */}
                      {u.status === "pending" && !u.is_banned && u.id_photo_front_url && u.id_photo_back_url && !u.needs_ci_upload && (
                        <div className="flex gap-1">
                          <button onClick={() => verifyUser(u.id, true)}
                            className="px-2 py-1 rounded-lg text-xs font-bold text-white"
                            style={{ background: "#16a34a" }}>✓</button>
                          <button onClick={() => verifyUser(u.id, false)}
                            className="px-2 py-1 rounded-lg text-xs font-bold text-white"
                            style={{ background: "hsl(0 75% 50%)" }}>✗</button>
                        </div>
                      )}

                      {/* Detail button */}
                      <button onClick={() => setSelectedUserId(u.id)}
                        className="text-xs font-bold px-3 py-1 rounded-lg"
                        style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}>
                        Ver detalle →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Sin usuarios encontrados</p>
            )}
          </div>
        )}

        {/* ── GAMES ──────────────────────────────────── */}
        {tab === "games" && !loading && (
          <div className="space-y-3">
            {games.map(g => (
              <div key={g.id} className="bg-card border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold">{g.title}</span>
                      {g.is_featured && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "hsl(42 98% 52% / 0.15)", color: "hsl(42 98% 35%)" }}>⭐ Destacado</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Bs {g.prize_amount} premio · {g.participant_count} participantes · {new Date(g.draw_date).toLocaleDateString("es-BO")}
                    </p>
                    {g.status === "active" && (
                      <p className="text-xs mt-1" style={{ color: "hsl(var(--primary))" }}>
                        {g.called_numbers?.length ?? 0} números cantados de 75
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {g.status === "upcoming" && (
                      <>
                        <button onClick={() => startGame(g.id)} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: "#16a34a" }}>▶ Iniciar</button>
                        <button onClick={() => navigate(`/admin/editar-juego/${g.id}`)} className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>✏ Editar</button>
                        <button onClick={() => toggleFeatured(g.id, g.is_featured)} className="text-xs font-bold" style={{ color: "hsl(42 98% 40%)" }}>{g.is_featured ? "Quitar destacado" : "⭐ Destacar"}</button>
                        <button onClick={() => deleteGame(g.id)} className="text-xs font-bold text-red-500">🗑 Eliminar</button>
                      </>
                    )}
                    {g.status === "active" && (
                      <div className="space-y-1.5">
                        <div className="live-badge"><div className="live-dot" />EN VIVO</div>
                        <div className="flex gap-1">
                          <input type="number" min="1" max="75" placeholder="1-75"
                            className="w-16 border rounded-lg px-2 py-1 text-xs font-bold text-center"
                            value={numberInput[g.id] ?? ""}
                            onChange={e => setNumberInput(prev => ({ ...prev, [g.id]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && callNumber(g.id)} />
                          <button onClick={() => callNumber(g.id)} className="px-2 py-1 rounded-lg text-xs font-bold text-white" style={{ background: "hsl(var(--primary))" }}>🎱</button>
                        </div>
                        <button onClick={() => finishGame(g.id)} className="text-xs text-red-500 underline">Finalizar</button>
                      </div>
                    )}
                    {g.status === "finished" && (
                      <>
                        <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: "hsl(var(--muted-foreground))" }}>Finalizado</span>
                        <button onClick={() => reactivateGame(g.id)} className="text-xs font-bold" style={{ color: "#16a34a" }}>♻ Reactivar</button>
                        <button onClick={() => deleteGame(g.id)} className="text-xs font-bold text-red-500">🗑 Eliminar</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {games.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">Sin juegos creados</p>
                <button className="btn-primary max-w-xs mx-auto" onClick={() => navigate("/admin/crear-juego")}>Crear primer juego</button>
              </div>
            )}
          </div>
        )}

        {/* ── CATEGORIES ─────────────────────────────── */}
        {tab === "categories" && !loading && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Personaliza las categorías que aparecen en la pantalla de Inicio.</p>
            {[...categories].sort((a, b) => a.sort_order - b.sort_order).map(c => {
              const d = catDraft[c.id] ?? c;
              const gradient = `linear-gradient(135deg, ${d.color_from}, ${d.color_to})`;
              const hasImage = !!d.background_image_url;
              const previewStyle = hasImage
                ? { backgroundImage: `url(${d.background_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                : { background: gradient };
              return (
                <div key={c.id} className="bg-card border rounded-2xl overflow-hidden">
                  <div className="p-4 relative" style={previewStyle}>
                    <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.25)" }} />
                    <div className="relative z-10 flex items-center justify-between">
                      <div>
                        <p className="font-black text-white text-lg leading-tight">{d.emoji} {d.label}</p>
                        {d.description && <p className="text-white/70 text-xs mt-0.5">{d.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {hasImage && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/50 text-white">🖼️ Imagen</span>}
                        {!d.is_active && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-white">Oculta</span>}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-[80px_1fr] gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground">Ícono</label>
                        <input value={d.emoji} onChange={e => updCatDraft(c.id, "emoji", e.target.value)}
                          className="w-full border rounded-xl px-3 py-2 text-center text-lg" maxLength={4} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground">Nombre</label>
                        <input value={d.label} onChange={e => updCatDraft(c.id, "label", e.target.value)} className="input-field" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground">Descripción</label>
                      <input value={d.description ?? ""} onChange={e => updCatDraft(c.id, "description", e.target.value)} className="input-field" placeholder="Descripción opcional" />
                    </div>

                    {/* Background: gradient OR image (optional) */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted-foreground">Fondo de la tarjeta</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updCatDraft(c.id, "background_image_url", null)}
                          className="py-2 px-3 rounded-xl border-2 text-xs font-bold transition-all"
                          style={{
                            borderColor: !hasImage ? "hsl(var(--primary))" : "hsl(var(--border))",
                            background: !hasImage ? "hsl(var(--primary) / 0.08)" : "transparent",
                            color: !hasImage ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                          }}>
                          🎨 Degradado
                        </button>
                        <label
                          className="py-2 px-3 rounded-xl border-2 text-xs font-bold transition-all text-center cursor-pointer"
                          style={{
                            borderColor: hasImage ? "hsl(var(--primary))" : "hsl(var(--border))",
                            background: hasImage ? "hsl(var(--primary) / 0.08)" : "transparent",
                            color: hasImage ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                          }}>
                          🖼️ Imagen
                          <input type="file" accept="image/*" className="hidden" onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => updCatDraft(c.id, "background_image_url", ev.target?.result as string);
                            reader.readAsDataURL(file);
                            e.target.value = "";
                          }} />
                        </label>
                      </div>

                      {/* Gradient pickers (shown when no image) */}
                      {!hasImage && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Color inicio</label>
                            <input type="color" value={d.color_from} onChange={e => updCatDraft(c.id, "color_from", e.target.value)} className="w-full h-10 rounded-xl border cursor-pointer" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Color fin</label>
                            <input type="color" value={d.color_to} onChange={e => updCatDraft(c.id, "color_to", e.target.value)} className="w-full h-10 rounded-xl border cursor-pointer" />
                          </div>
                        </div>
                      )}

                      {/* Image preview + clear (shown when image is set) */}
                      {hasImage && (
                        <div className="flex items-center gap-3 p-2 rounded-xl border" style={{ background: "hsl(var(--muted))" }}>
                          <img src={d.background_image_url} alt="preview" className="w-16 h-10 rounded-lg object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold">Imagen cargada</p>
                            <p className="text-xs text-muted-foreground truncate">Se usará como fondo de la tarjeta</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updCatDraft(c.id, "background_image_url", null)}
                            className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg"
                            style={{ background: "hsl(0 75% 52% / 0.12)", color: "hsl(0 75% 45%)" }}>
                            Quitar
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_80px] gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground">Orden</label>
                        <input type="number" value={d.sort_order} onChange={e => updCatDraft(c.id, "sort_order", e.target.value)} className="input-field" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground">Activa</label>
                        <button onClick={() => updCatDraft(c.id, "is_active", !d.is_active)}
                          className="w-full h-10 rounded-xl font-bold text-xs border"
                          style={{ background: d.is_active ? "#16a34a" : "transparent", color: d.is_active ? "white" : "hsl(var(--muted-foreground))" }}>
                          {d.is_active ? "Sí" : "No"}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground">Stream YouTube</label>
                      <input value={d.stream_url_youtube ?? ""} onChange={e => updCatDraft(c.id, "stream_url_youtube", e.target.value)} className="input-field" placeholder="https://youtube.com/watch?v=..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground">Stream TikTok</label>
                      <input value={d.stream_url_tiktok ?? ""} onChange={e => updCatDraft(c.id, "stream_url_tiktok", e.target.value)} className="input-field" placeholder="https://tiktok.com/..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground">Stream Facebook</label>
                      <input value={d.stream_url_facebook ?? ""} onChange={e => updCatDraft(c.id, "stream_url_facebook", e.target.value)} className="input-field" placeholder="https://facebook.com/..." />
                    </div>
                    <button onClick={() => saveCategory(c.id)} disabled={savingCat === c.id}
                      className="w-full py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                      style={{ background: "hsl(var(--primary))" }}>
                      {savingCat === c.id ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── WITHDRAWALS ────────────────────────────── */}
        {tab === "withdrawals" && !loading && (
          <div className="space-y-3">
            {withdrawals.map(w => {
              const isPending = w.status === "pending";
              const isAdminAdj = w.method === "admin_credit" || w.method === "admin_debit";
              return (
                <div key={w.id} className="bg-card border rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold">Bs {parseFloat(w.amount).toFixed(2)}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{
                            background: w.status === "paid" ? "hsl(142 70% 45% / 0.1)" : w.status === "pending" ? "hsl(42 98% 52% / 0.1)" : "hsl(var(--muted))",
                            color: w.status === "paid" ? "hsl(142 70% 30%)" : w.status === "pending" ? "hsl(42 98% 35%)" : "hsl(var(--muted-foreground))",
                          }}>
                          {w.status === "paid" ? "Pagado" : w.status === "pending" ? "Pendiente" : "Rechazado"}
                        </span>
                        <span className="text-xs text-muted-foreground">{methodLabel(w.method)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Usuario #{w.user_id}</p>
                      {w.notes && <p className="text-xs mt-0.5" style={{ color: "hsl(var(--primary))" }}>Motivo: {w.notes}</p>}
                      <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(w.created_at).toLocaleString("es-BO")}</p>
                    </div>
                    {isPending && !isAdminAdj && (
                      <div className="shrink-0">
                        {!payForm[w.id]?.open ? (
                          <button onClick={() => openPayForm(w.id)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                            style={{ background: "#16a34a" }}>
                            Marcar pagado
                          </button>
                        ) : (
                          <div className="space-y-2 min-w-36">
                            {w.method === "bank_transfer" && (
                              <input placeholder="PIN retiro" className="input-field text-xs py-1"
                                value={payForm[w.id]?.pin ?? ""}
                                onChange={e => setPayForm(pf => ({ ...pf, [w.id]: { ...pf[w.id], pin: e.target.value } }))} />
                            )}
                            <button onClick={() => markWithdrawalPaid(w.id, w.method)}
                              className="w-full px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                              style={{ background: "#16a34a" }}>✓ Confirmar</button>
                            <button onClick={() => setPayForm(pf => { const n = { ...pf }; delete n[w.id]; return n; })}
                              className="w-full text-xs text-muted-foreground">Cancelar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {withdrawals.length === 0 && <p className="text-center text-muted-foreground py-8">Sin retiros</p>}
          </div>
        )}

        {/* ── WINNERS ────────────────────────────────── */}
        {tab === "winners" && !loading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-muted-foreground">
                {winners.length > 0 ? `${winners.length} reclamo${winners.length !== 1 ? "s" : ""} pendiente${winners.length !== 1 ? "s" : ""}` : "Sin reclamos pendientes"}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Actualizando en tiempo real
              </div>
            </div>
            {winners.map(w => (
              <div key={w.id} className="bg-card border-2 rounded-2xl p-4" style={{ borderColor: "hsl(42 98% 52% / 0.5)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-base">{w.user_name ?? `Usuario #${w.user_id}`}</p>
                    <p className="text-xs font-bold mt-0.5" style={{ color: "hsl(var(--primary))" }}>
                      🎱 {w.game_title ?? `Juego #${w.game_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Cartón #{w.card_id} · Puesto #{w.place}</p>
                    <p className="text-lg font-black mt-1" style={{ color: "hsl(42 98% 35%)", fontFamily: "'Poppins', sans-serif" }}>
                      Bs {parseFloat(w.prize_amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reclamado {new Date(w.created_at).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1.5">
                    <button onClick={() => validateWinner(w.id, true)}
                      className="px-4 py-2 rounded-xl text-sm font-black text-white"
                      style={{ background: "#16a34a" }}>✓ Validar</button>
                    <button onClick={() => validateWinner(w.id, false)}
                      className="px-4 py-2 rounded-xl text-sm font-black text-white"
                      style={{ background: "hsl(0 75% 50%)" }}>✗ Rechazar</button>
                  </div>
                </div>
              </div>
            ))}
            {winners.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-4xl mb-3">🏆</p>
                <p className="font-bold">Sin reclamos pendientes</p>
                <p className="text-sm mt-1">Los reclamos de bingo aparecerán aquí en tiempo real</p>
              </div>
            )}
          </div>
        )}

        {/* ── PASSWORD RESETS ────────────────────────── */}
        {tab === "resets" && !loading && (
          <div className="space-y-5">

            {/* ── Aprobadas: pendientes de envío ── */}
            {approvedResets.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "hsl(142 70% 30%)" }}>
                  ✅ Aprobadas — pendientes de envío por WhatsApp ({approvedResets.length})
                </p>
                {approvedResets.map(u => (
                  <div key={u.id} className="rounded-2xl p-4 space-y-3"
                    style={{ background: "hsl(142 70% 45% / 0.06)", border: "1px solid hsl(142 70% 45% / 0.25)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground">CI: {u.ci} {u.department && `· ${u.department}`}</p>
                        {u.phone && (
                          <p className="text-xs font-semibold mt-0.5" style={{ color: "#25D366" }}>📱 {u.phone}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground">Contraseña:</span>
                          <span className="font-mono font-bold text-base tracking-wider">{u.temp_password_display}</span>
                          <button className="text-[11px] font-bold px-2 py-0.5 rounded-lg border"
                            style={{ color: "hsl(var(--primary))", borderColor: "hsl(var(--primary)/0.3)" }}
                            onClick={() => { navigator.clipboard.writeText(u.temp_password_display); toast.success("Copiado"); }}>
                            Copiar
                          </button>
                        </div>
                      </div>
                      <button
                        className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold text-white"
                        style={{ background: "#25D366" }}
                        onClick={() => u.phone && sendWhatsApp(u.phone, u.temp_password_display)}
                      >
                        📲 Reenviar
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button className="flex-1 py-1.5 rounded-xl text-xs font-bold border"
                        style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                        onClick={() => setSelectedUserId(u.id)}>
                        👤 Ver usuario
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Solicitudes pendientes ── */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                🕐 Solicitudes pendientes ({pendingResets.length})
              </p>

              {pendingResets.length === 0 && approvedResets.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="text-4xl mb-3">🔑</div>
                  <p className="font-bold">Sin solicitudes pendientes</p>
                  <p className="text-sm mt-1">Aquí aparecerán los usuarios que olvidaron su contraseña</p>
                </div>
              )}

              {pendingResets.length === 0 && approvedResets.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">Sin solicitudes pendientes</p>
              )}

              {pendingResets.map(u => (
                <div key={u.id} className="bg-card border rounded-2xl p-4 space-y-3">
                  {/* Info + acciones */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground">CI: {u.ci} {u.department && `· ${u.department}`}</p>
                      {u.phone && (
                        <a href={`https://wa.me/${u.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold mt-0.5 inline-block"
                          style={{ color: "#25D366" }}>
                          📱 {u.phone}
                        </a>
                      )}
                    </div>
                    <button
                      className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold text-white"
                      style={{ background: approvingReset === u.id ? "hsl(var(--muted))" : "hsl(var(--primary))" }}
                      disabled={approvingReset === u.id}
                      onClick={() => approveReset(u.id, u.phone)}
                    >
                      {approvingReset === u.id ? "..." : "✓ Aprobar"}
                    </button>
                  </div>

                  {/* Fotos de verificación */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { photo: u.photo_front, label: "Anverso" },
                      { photo: u.photo_back, label: "Reverso" },
                      { photo: u.photo_selfie, label: "Selfie c/CI" },
                    ].map(({ photo, label }) => (
                      <div key={label} className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground text-center">{label}</p>
                        {photo ? (
                          <a href={photo} target="_blank" rel="noopener noreferrer">
                            <img src={photo} alt={label}
                              className="w-full h-20 object-cover rounded-xl border cursor-zoom-in hover:opacity-90 transition-opacity" />
                          </a>
                        ) : (
                          <div className="w-full h-20 rounded-xl border-2 border-dashed flex items-center justify-center text-muted-foreground text-xs"
                            style={{ borderColor: "hsl(var(--border))" }}>
                            Sin foto
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Acciones secundarias */}
                  <div className="flex gap-2">
                    <button className="flex-1 py-1.5 rounded-xl text-xs font-bold border"
                      style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                      onClick={() => setSelectedUserId(u.id)}>
                      👤 Ver usuario
                    </button>
                    <button className="flex-1 py-1.5 rounded-xl text-xs font-bold border"
                      style={{ borderColor: "hsl(0 75% 50% / 0.4)", color: "hsl(0 75% 40%)" }}
                      disabled={rejectingReset === u.id}
                      onClick={() => rejectReset(u.id, false)}>
                      {rejectingReset === u.id ? "..." : "✗ Rechazar"}
                    </button>
                    <button className="flex-1 py-1.5 rounded-xl text-xs font-bold border"
                      style={{ borderColor: "hsl(0 75% 50% / 0.4)", background: "hsl(0 75% 50% / 0.08)", color: "hsl(0 75% 35%)" }}
                      disabled={rejectingReset === u.id}
                      onClick={() => rejectReset(u.id, true)}>
                      🔴 Rechazar + Banear
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="w-full py-2.5 rounded-xl text-sm font-bold border"
              style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
              onClick={() => loadTab("resets")}
            >
              🔄 Actualizar
            </button>
          </div>
        )}

        {/* ── AUDIT LOGS ─────────────────────────────── */}
        {tab === "logs" && !loading && (
          <div className="space-y-2">
            {logs.map(l => (
              <div key={l.id} className="bg-card border rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold font-mono truncate">{l.action}</p>
                    <div className="flex gap-3 mt-0.5">
                      {l.user_id && <span className="text-[11px] text-muted-foreground">Usuario #{l.user_id}</span>}
                      {l.ip_address && <span className="text-[11px] font-mono text-muted-foreground">{l.ip_address}</span>}
                    </div>
                    {l.details && Object.keys(l.details).length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {JSON.stringify(l.details)}
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleString("es-BO")}</p>
                </div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-center text-muted-foreground py-8">Sin registros de auditoría</p>}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
