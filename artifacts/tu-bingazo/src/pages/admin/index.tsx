import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { ADMIN_PERMS } from "./perms";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Returns true if the user has a permission. Empty array = super admin = all. */
function hasPermission(perms: string[], perm: string): boolean {
  return perms.length === 0 || perms.includes(perm);
}

const ALL_TABS = [
  { id: "overview",     label: "📊 Resumen",     perm: null },
  { id: "finance",      label: "💰 Finanzas",    perm: null },
  { id: "users",        label: "👥 Usuarios",    perm: "admin:users" },
  { id: "games",        label: "🎱 Juegos",       perm: "admin:games" },
  { id: "categories",   label: "🗂️ Categorías",  perm: "admin:games" },
  { id: "withdrawals",  label: "💸 Retiros",      perm: "admin:withdrawals" },
  { id: "winners",      label: "🏆 Ganadores",   perm: "admin:games" },
  { id: "referidos",    label: "🔗 Referidos",   perm: null },
  { id: "resets",       label: "🔑 Resets",       perm: "admin:resets" },
  { id: "sitio",        label: "🌐 Sitio Web",   perm: null },
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
    try {
      const r = await fetch(`${BASE}/api/admin/users/${userId}`, { method: "DELETE", headers: auth() });
      if (r.ok) {
        toast.success("🗑 Usuario eliminado");
        setConfirmDelete(false);
        onUserUpdated(null);
        onClose();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || "No se pudo eliminar el usuario");
        setConfirmDelete(false);
      }
    } catch {
      toast.error("Error de conexión al eliminar usuario");
      setConfirmDelete(false);
    }
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
                    { label: "Saldo actual", value: `Bs ${parseFloat(user.balance).toFixed(0)}` },
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
                  Bs {parseFloat(user.balance).toFixed(0)}
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
  const site = useSiteSettings();
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
  const [wdAction, setWdAction] = useState<{ id: number; mode: "approve" | "reject"; notes: string; proof: string | null; loading: boolean } | null>(null);
  const [viewQrModal, setViewQrModal] = useState<string | null>(null);
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
  const [winnersFrom, setWinnersFrom] = useState("");
  const [winnersTo, setWinnersTo] = useState("");
  const [deleteGameConfirm, setDeleteGameConfirm] = useState<number | null>(null);
  const [financeSummary, setFinanceSummary] = useState<any>(null);
  const [financeGames, setFinanceGames] = useState<any[]>([]);
  const [financeTransactions, setFinanceTransactions] = useState<any[]>([]);
  const [financePeriod, setFinancePeriod] = useState<string>("all");
  const [financeFrom, setFinanceFrom] = useState("");
  const [financeTo, setFinanceTo] = useState("");
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerPayments, setPartnerPayments] = useState<any[]>([]);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [partnerForm, setPartnerForm] = useState({ name: "", identifier: "", phone: "", sharePercentage: "", notes: "" });
  const [savingPartner, setSavingPartner] = useState(false);
  const [partnerPaymentNotes, setPartnerPaymentNotes] = useState("");
  const [savingPartnerPayment, setSavingPartnerPayment] = useState(false);
  const [showPartnerHistory, setShowPartnerHistory] = useState(false);
  const [ppFrom, setPpFrom] = useState("");
  const [ppTo, setPpTo] = useState("");
  const [financeTab, setFinanceTab] = useState<"resumen"|"juegos"|"movimientos"|"gastos"|"socios"|"historial">("resumen");
  const [txSearch, setTxSearch] = useState("");
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [expenseForm, setExpenseForm] = useState({ name: "", amount: "", frequency: "monthly", notes: "" });
  const [savingExpense, setSavingExpense] = useState(false);
  // gameId → round → winner[]
  const [gameWinners, setGameWinners] = useState<Record<number, Record<number, any[]>>>({});
  const [activatorRequests, setActivatorRequests] = useState<any[]>([]);
  const [activatorSettings, setActivatorSettings] = useState<any>(null);
  const [referralStats, setReferralStats] = useState<any>(null);
  const [activatorPerformance, setActivatorPerformance] = useState<any[]>([]);
  const [deptFilter, setDeptFilter] = useState<string>("__all__");
  const [savingActSettings, setSavingActSettings] = useState(false);
  const [actSettingsForm, setActSettingsForm] = useState({ is_enabled: true, whatsapp_group_link: "", bonus_amount: "5", bonus_title: "Bono de bienvenida por activador {activator}", commission_percentage: "5", commission_duration: "indefinite", commission_duration_months: "" });
  const [pendingActivatorCount, setPendingActivatorCount] = useState(0);
  const [reqNoteInput, setReqNoteInput] = useState<Record<number, string>>({});
  const [reqNoteOpen, setReqNoteOpen] = useState<Record<number, "reject" | "hold" | null>>({});
  const [reqFilter, setReqFilter] = useState<"all" | "pending" | "accepted" | "hold" | "suspended" | "banned">("all");
  const [banModal, setBanModal] = useState<{ id: number; name: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [togglingProgram, setTogglingProgram] = useState(false);
  const [siteSettingsData, setSiteSettingsData] = useState<any>(null);
  const [siteForm, setSiteForm] = useState({
    site_name: "Tu Bingazo",
    site_tagline: "Bingo en Vivo Bolivia",
    site_emoji: "🎱",
    favicon_url: "",
    logo_url: "",
    seo_title: "Tu Bingazo — Bingo en Vivo Bolivia",
    seo_description: "La plataforma de bingo en vivo más grande de Bolivia. Gana premios en efectivo desde tu celular.",
    seo_keywords: "bingo, bolivia, bingo en vivo, premios, dinero",
    primary_color: "#1a0050",
    qr_background_url: "",
  });
  const [savingSite, setSavingSite] = useState(false);

  const authH = useCallback(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  // Global poll for new winners — auto-refreshes the winners list when on that tab.
  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      if (tab !== "winners") return;
      try {
        const params = new URLSearchParams();
        if (winnersFrom) params.set("from", winnersFrom);
        if (winnersTo) params.set("to", winnersTo);
        const r = await fetch(`${BASE}/api/admin/winners?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          setWinners(d);
        }
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => clearInterval(iv);
  }, [token, tab, winnersFrom, winnersTo]);

  // Poll winners for every active game every 3s — real-time bingo claims in live cards.
  const activeGameIdsKey = games.filter(g => g.status === "active").map(g => g.id).join(",");
  useEffect(() => {
    if (!token || !activeGameIdsKey) return;
    const activeIds = activeGameIdsKey.split(",").map(Number);
    const iv = setInterval(async () => {
      for (const gameId of activeIds) {
        try {
          const r = await fetch(`${BASE}/api/games/${gameId}/winners`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (!r.ok) continue;
          const list: any[] = await r.json();
          const byRound: Record<number, any[]> = {};
          for (const w of list) { const rn = w.round ?? 1; if (!byRound[rn]) byRound[rn] = []; byRound[rn].push(w); }
          setGameWinners(prev => ({ ...prev, [gameId]: byRound }));
        } catch {}
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [token, activeGameIdsKey]);

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

  async function loadGameWinners(gameId: number) {
    try {
      const r = await fetch(`${BASE}/api/games/${gameId}/winners`, { headers: authH() });
      if (!r.ok) return;
      const list: any[] = await r.json();
      const byRound: Record<number, any[]> = {};
      for (const w of list) {
        const rn = w.round ?? 1;
        if (!byRound[rn]) byRound[rn] = [];
        byRound[rn].push(w);
      }
      setGameWinners(prev => ({ ...prev, [gameId]: byRound }));
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
        if (r.ok) {
          const gs: any[] = await r.json();
          setGames(gs);
          for (const g of gs) {
            if (g.status === "active") loadGameWinners(g.id);
          }
        }
      }
      if (t === "withdrawals") {
        const r = await fetch(`${BASE}/api/admin/withdrawals`, { headers: authH() });
        if (r.ok) setWithdrawals(await r.json());
      }
      if (t === "winners") {
        const r = await fetch(`${BASE}/api/admin/winners`, { headers: authH(), cache: "no-store" });
        if (r.ok) setWinners(await r.json());
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
      if (t === "referidos") {
        const [rR, sR, stR, perfR] = await Promise.all([
          fetch(`${BASE}/api/admin/activator-requests`, { headers: authH() }),
          fetch(`${BASE}/api/admin/activator-settings`, { headers: authH() }),
          fetch(`${BASE}/api/admin/referral-stats`, { headers: authH() }),
          fetch(`${BASE}/api/admin/activator-performance`, { headers: authH() }),
        ]);
        if (rR.ok) setActivatorRequests(await rR.json());
        if (sR.ok) {
          const s = await sR.json();
          setActivatorSettings(s);
          setActSettingsForm({
            is_enabled: s.is_enabled ?? true,
            whatsapp_group_link: s.whatsapp_group_link ?? "",
            bonus_amount: String(s.bonus_amount),
            bonus_title: s.bonus_title,
            commission_percentage: String(s.commission_percentage),
            commission_duration: s.commission_duration,
            commission_duration_months: s.commission_duration_months ? String(s.commission_duration_months) : "",
          });
        }
        if (stR.ok) setReferralStats(await stR.json());
        if (perfR.ok) setActivatorPerformance(await perfR.json());
      }
      if (t === "sitio") {
        const r = await fetch(`${BASE}/api/site-settings`);
        if (r.ok) {
          const s = await r.json();
          setSiteSettingsData(s);
          setSiteForm({
            site_name: s.site_name,
            site_tagline: s.site_tagline,
            site_emoji: s.site_emoji,
            favicon_url: s.favicon_url ?? "",
            logo_url: s.logo_url ?? "",
            qr_background_url: s.qr_background_url ?? "",
            seo_title: s.seo_title,
            seo_description: s.seo_description,
            seo_keywords: s.seo_keywords,
            primary_color: s.primary_color,
          });
        }
      }
      if (t === "finance") {
        const period = financePeriod;
        const [sR, gR, tR, pR, ppR, eR] = await Promise.all([
          fetch(`${BASE}/api/admin/finance/summary?period=${period}`, { headers: authH() }),
          fetch(`${BASE}/api/admin/finance/games`, { headers: authH() }),
          fetch(`${BASE}/api/admin/finance/transactions?limit=100`, { headers: authH() }),
          fetch(`${BASE}/api/admin/partners`, { headers: authH() }),
          fetch(`${BASE}/api/admin/partners/payments`, { headers: authH() }),
          fetch(`${BASE}/api/admin/expenses`, { headers: authH() }),
        ]);
        if (sR.ok) setFinanceSummary(await sR.json());
        if (gR.ok) setFinanceGames(await gR.json());
        if (tR.ok) setFinanceTransactions(await tR.json());
        if (pR.ok) setPartners(await pR.json());
        if (ppR.ok) setPartnerPayments(await ppR.json());
        if (eR.ok) setExpenses(await eR.json());
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
    const msg = `Hola! Tu contraseña temporal de ${site.site_name} es: *${tempPwd}*\nCámbiala inmediatamente después de iniciar sesión. 🔑`;
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

  async function submitWdAction() {
    if (!wdAction) return;
    setWdAction(a => a ? { ...a, loading: true } : null);
    const { id, mode, notes, proof } = wdAction;
    if (mode === "approve") {
      const body: any = {};
      if (proof) body.payment_proof_url = proof;
      if (notes.trim()) body.notes = notes.trim();
      const r = await fetch(`${BASE}/api/admin/withdrawals/${id}/mark-paid`, {
        method: "POST", headers: authH(), body: JSON.stringify(body),
      });
      if (r.ok) {
        const updated = await r.json();
        toast.success("✅ Retiro aprobado y pagado");
        setWithdrawals(ws => ws.map(w => w.id === id ? { ...w, status: "paid", payment_proof_url: updated.payment_proof_url, notes: updated.notes } : w));
        setWdAction(null);
        loadStats();
      } else {
        const d = await r.json();
        toast.error(d.error || "Error al aprobar");
        setWdAction(a => a ? { ...a, loading: false } : null);
      }
    } else {
      if (!notes.trim()) { toast.error("El motivo de rechazo es obligatorio"); setWdAction(a => a ? { ...a, loading: false } : null); return; }
      const r = await fetch(`${BASE}/api/admin/withdrawals/${id}/reject`, {
        method: "POST", headers: authH(), body: JSON.stringify({ notes }),
      });
      if (r.ok) {
        toast.success("❌ Retiro rechazado");
        setWithdrawals(ws => ws.map(w => w.id === id ? { ...w, status: "rejected", notes } : w));
        setWdAction(null);
      } else {
        const d = await r.json();
        toast.error(d.error || "Error al rechazar");
        setWdAction(a => a ? { ...a, loading: false } : null);
      }
    }
  }

  function exportWinnersJpg(winnersToExport: any[]) {
    const siteName = site.site_name;
    const today = new Date().toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" });
    const rows = winnersToExport.map((w, i) => `
      <tr style="background:${i % 2 === 0 ? "#1a1040" : "#150d35"}">
        <td style="padding:10px 14px;font-weight:900;color:#ffd700;font-size:15px">#${i + 1}</td>
        <td style="padding:10px 14px">
          <div style="font-weight:900;font-size:14px;color:#fff">${w.user_name ?? "Jugador"}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px">${w.user_department ?? "Bolivia"}</div>
        </td>
        <td style="padding:10px 14px;color:rgba(255,255,255,0.7);font-size:12px">${w.game_title ?? `Juego #${w.game_id}`}</td>
        <td style="padding:10px 14px;font-weight:900;font-size:16px;color:#ffd700;text-align:right">Bs ${parseFloat(w.prize_amount).toFixed(0)}</td>
        <td style="padding:10px 14px;color:rgba(255,255,255,0.5);font-size:11px">${new Date(w.created_at).toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d0028;font-family:'Segoe UI',Arial,sans-serif;padding:0}</style>
</head><body>
<div id="card" style="background:#0d0028;width:700px;padding:28px">
  <div style="background:linear-gradient(135deg,#7c3aed,#4c1d95);border-radius:16px;padding:22px 28px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:26px;font-weight:900;color:#ffd700;letter-spacing:-0.5px">🏆 Lista de Ganadores</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px">${siteName} · ${today}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:32px;font-weight:900;color:#fff">${winnersToExport.length}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.6)">ganador${winnersToExport.length !== 1 ? "es" : ""}</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden">
    <thead>
      <tr style="background:#7c3aed">
        <th style="padding:10px 14px;color:rgba(255,255,255,0.8);font-size:11px;text-align:left;font-weight:700;letter-spacing:0.5px">#</th>
        <th style="padding:10px 14px;color:rgba(255,255,255,0.8);font-size:11px;text-align:left;font-weight:700;letter-spacing:0.5px">JUGADOR</th>
        <th style="padding:10px 14px;color:rgba(255,255,255,0.8);font-size:11px;text-align:left;font-weight:700;letter-spacing:0.5px">SORTEO</th>
        <th style="padding:10px 14px;color:rgba(255,255,255,0.8);font-size:11px;text-align:right;font-weight:700;letter-spacing:0.5px">PREMIO</th>
        <th style="padding:10px 14px;color:rgba(255,255,255,0.8);font-size:11px;text-align:left;font-weight:700;letter-spacing:0.5px">FECHA</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:16px;text-align:center;font-size:10px;color:rgba(255,255,255,0.3)">${siteName} · Todos los montos en bolivianos (Bs) · Generado ${today}</div>
</div>
<script>
window.onload=function(){
  html2canvas(document.getElementById('card'),{scale:2,backgroundColor:'#0d0028',useCORS:true}).then(function(canvas){
    var a=document.createElement('a');
    a.href=canvas.toDataURL('image/jpeg',0.95);
    a.download='ganadores-${new Date().toISOString().split("T")[0]}.jpg';
    a.click();
    setTimeout(function(){window.close()},800);
  });
};
</script></body></html>`;
    const w = window.open("", "_blank", "width=750,height=600");
    if (w) { w.document.write(html); w.document.close(); }
  }

  async function callNumber(gameId: number) {
    const input = numberInput[gameId];
    const num = input ? parseInt(input) : Math.floor(Math.random() * 75) + 1;
    if (num < 1 || num > 75) { toast.error("Número debe ser entre 1 y 75"); return; }
    const r = await fetch(`${BASE}/api/games/${gameId}/call-number`, {
      method: "POST", headers: authH(), body: JSON.stringify({ number: num }),
    });
    if (r.ok) {
      toast.success(`🎱 ${bingoLabel(num)} cantado`);
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

  async function nextRound(gameId: number) {
    const game = games.find(g => g.id === gameId);
    const currentNum = game?.current_round ?? 1;
    const nextNum = currentNum + 1;
    const total = game?.total_rounds ?? 1;
    if (!confirm(`¿Completar la Ronda ${currentNum} y avanzar a la Ronda ${nextNum} de ${total}? Los bolillos actuales se guardarán en el historial.`)) return;
    const r = await fetch(`${BASE}/api/games/${gameId}/next-round`, { method: "POST", headers: authH() });
    if (r.ok) {
      const updated = await r.json();
      setGames(gs => gs.map(g => g.id === gameId ? { ...g, ...updated } : g));
      loadGameWinners(gameId);
      toast.success(`🏁 Ronda ${currentNum} completada · Iniciando Ronda ${nextNum}`);
    } else {
      const d = await r.json();
      toast.error(d.error || "Error al avanzar ronda");
    }
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

  async function resetGame(gameId: number) {
    if (!confirm(
      "¿Resetear este juego?\n\n" +
      "Esto ELIMINARÁ todos los cartones vendidos y ganadores de este juego para poder jugarlo de nuevo desde cero.\n\n" +
      "El juego en sí no se elimina — solo se limpian los datos de la partida anterior.\n\n" +
      "Esta acción no se puede deshacer."
    )) return;
    const r = await fetch(`${BASE}/api/games/${gameId}/reset`, { method: "POST", headers: authH() });
    if (r.ok) {
      const updated = await r.json();
      setGames(gs => gs.map(g => g.id === gameId ? { ...g, ...updated } : g));
      toast.success("🔄 Juego reseteado — listo para una nueva partida");
      loadStats();
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.error || "No se pudo resetear el juego");
    }
  }

  async function deleteGame(gameId: number) {
    const r = await fetch(`${BASE}/api/games/${gameId}`, { method: "DELETE", headers: authH() });
    if (r.ok) {
      setGames(gs => gs.filter(g => g.id !== gameId));
      setDeleteGameConfirm(null);
      toast.success("🗑 Juego eliminado");
      loadStats();
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.error || "No se pudo eliminar el juego");
      setDeleteGameConfirm(null);
    }
  }

  async function loadFinanceWithPeriod(period: string, from?: string, to?: string) {
    setFinancePeriod(period);
    setLoading(true);
    try {
      const params = period === "custom" && from
        ? `from=${encodeURIComponent(from)}${to ? `&to=${encodeURIComponent(to)}` : ""}`
        : `period=${period}`;
      const txParams = period === "custom" && from
        ? `from=${encodeURIComponent(from)}${to ? `&to=${encodeURIComponent(to)}` : ""}&limit=100`
        : `period=${period}&limit=100`;
      const [sR, gR, tR] = await Promise.all([
        fetch(`${BASE}/api/admin/finance/summary?${params}`, { headers: authH() }),
        fetch(`${BASE}/api/admin/finance/games`, { headers: authH() }),
        fetch(`${BASE}/api/admin/finance/transactions?${txParams}`, { headers: authH() }),
      ]);
      if (sR.ok) setFinanceSummary(await sR.json());
      if (gR.ok) setFinanceGames(await gR.json());
      if (tR.ok) setFinanceTransactions(await tR.json());
    } catch {}
    setLoading(false);
  }

  async function loadPartners() {
    const [pR, ppR, eR] = await Promise.all([
      fetch(`${BASE}/api/admin/partners`, { headers: authH() }),
      fetch(`${BASE}/api/admin/partners/payments`, { headers: authH() }),
      fetch(`${BASE}/api/admin/expenses`, { headers: authH() }),
    ]);
    if (pR.ok) setPartners(await pR.json());
    if (ppR.ok) setPartnerPayments(await ppR.json());
    if (eR.ok) setExpenses(await eR.json());
  }

  async function saveExpense() {
    if (!expenseForm.name.trim() || !expenseForm.amount) {
      toast.error("Nombre y monto son requeridos"); return;
    }
    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || amt < 0) { toast.error("Ingresa un monto válido"); return; }
    setSavingExpense(true);
    try {
      const url = editingExpense ? `${BASE}/api/admin/expenses/${editingExpense.id}` : `${BASE}/api/admin/expenses`;
      const method = editingExpense ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: authH(), body: JSON.stringify({
        name: expenseForm.name.trim(),
        amount: amt,
        frequency: expenseForm.frequency,
        notes: expenseForm.notes.trim() || null,
      })});
      if (r.ok) {
        toast.success(editingExpense ? "Gasto actualizado" : "Gasto agregado");
        setShowExpenseForm(false); setEditingExpense(null);
        setExpenseForm({ name: "", amount: "", frequency: "monthly", notes: "" });
        await loadPartners();
      } else {
        const d = await r.json();
        toast.error(d.error || "Error al guardar");
      }
    } catch { toast.error("Error de conexión"); }
    setSavingExpense(false);
  }

  async function deleteExpense(expense: any) {
    if (!confirm(`¿Desactivar el gasto "${expense.name}"?`)) return;
    const r = await fetch(`${BASE}/api/admin/expenses/${expense.id}`, { method: "DELETE", headers: authH() });
    if (r.ok) { toast.success("Gasto desactivado"); await loadPartners(); }
    else toast.error("No se pudo desactivar");
  }

  async function reactivateExpense(expense: any) {
    const r = await fetch(`${BASE}/api/admin/expenses/${expense.id}`, { method: "PATCH", headers: authH(), body: JSON.stringify({ isActive: true }) });
    if (r.ok) { toast.success("Gasto reactivado"); await loadPartners(); }
    else toast.error("No se pudo reactivar");
  }

  async function savePartner() {
    if (!partnerForm.name.trim() || !partnerForm.sharePercentage) {
      toast.error("Nombre y porcentaje son requeridos"); return;
    }
    setSavingPartner(true);
    try {
      const url = editingPartner ? `${BASE}/api/admin/partners/${editingPartner.id}` : `${BASE}/api/admin/partners`;
      const method = editingPartner ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: authH(), body: JSON.stringify({
        name: partnerForm.name.trim(),
        identifier: partnerForm.identifier.trim() || null,
        phone: partnerForm.phone.trim() || null,
        sharePercentage: parseFloat(partnerForm.sharePercentage),
        notes: partnerForm.notes.trim() || null,
      }) });
      if (r.ok) {
        toast.success(editingPartner ? "✅ Socio actualizado" : "✅ Socio agregado");
        setShowPartnerForm(false);
        setEditingPartner(null);
        setPartnerForm({ name: "", identifier: "", phone: "", sharePercentage: "", notes: "" });
        loadPartners();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || "No se pudo guardar el socio");
      }
    } catch { toast.error("Error al guardar socio"); }
    finally { setSavingPartner(false); }
  }

  async function deletePartner(partner: any) {
    if (!window.confirm(`¿Eliminar permanentemente al socio "${partner.name}"?\n\nEsta acción no se puede deshacer.`)) return;
    const r = await fetch(`${BASE}/api/admin/partners/${partner.id}`, {
      method: "DELETE", headers: authH(),
    });
    if (r.ok) {
      setPartners(ps => ps.filter(p => p.id !== partner.id));
      toast.success("🗑️ Socio eliminado");
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.error || "No se pudo eliminar el socio");
    }
  }

  async function togglePartnerActive(partner: any) {
    const r = await fetch(`${BASE}/api/admin/partners/${partner.id}`, {
      method: "PATCH", headers: authH(),
      body: JSON.stringify({ isActive: !partner.is_active }),
    });
    if (r.ok) setPartners(ps => ps.map(p => p.id === partner.id ? { ...p, is_active: !partner.is_active } : p));
    else toast.error("No se pudo actualizar");
  }

  async function registerPartnerPayment(snapshot: any[]) {
    if (!financeSummary) return;
    const totalPaid = snapshot.reduce((sum, p) => sum + p.amount, 0);
    if (totalPaid <= 0 && !confirm(`La ganancia neta del período es negativa o cero (Bs ${financeSummary.net_profit.toFixed(0)}). ¿Igual querés archivar este período como registro histórico?`)) return;
    const PERIOD_LABELS: Record<string, string> = { today: "Hoy", week: "Últimos 7 días", month: "Últimos 30 días", year: "Último año", all: "Todo el tiempo" };
    const periodLabel = financeSummary.period === "custom"
      ? `${financeFrom || "—"} al ${financeTo || "hoy"}`
      : PERIOD_LABELS[financeSummary.period] ?? financeSummary.period;
    setSavingPartnerPayment(true);
    try {
      const r = await fetch(`${BASE}/api/admin/partners/payments`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({
          periodLabel,
          periodFrom: financeSummary.from ?? new Date(0).toISOString(),
          periodTo:   financeSummary.to   ?? new Date().toISOString(),
          grossRevenue: financeSummary.gross_revenue,
          netProfit:    financeSummary.net_profit,
          totalPaid,
          partnersSnapshot: snapshot,
          financeSnapshot: { ...financeSummary, games: financeGames },
          adminNotes: partnerPaymentNotes.trim() || null,
        }),
      });
      if (r.ok) {
        toast.success("✅ Pago registrado y archivado");
        setPartnerPaymentNotes("");
        loadPartners();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || "No se pudo registrar el pago");
      }
    } catch { toast.error("Error al registrar pago"); }
    finally { setSavingPartnerPayment(false); }
  }

  function downloadFinancePDF(includeSnapshot?: any[]) {
    const s = financeSummary;
    const PERIOD_LABELS: Record<string, string> = { today: "Hoy", week: "Últimos 7 días", month: "Últimos 30 días", year: "Último año", all: "Todo el tiempo", custom: `${financeFrom || "—"} al ${financeTo || "hoy"}` };
    const fmt = (v: number) => `Bs ${v.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const typeColor: Record<string, string> = { ingreso: "#16a34a", premio: "#b45309", retiro: "#dc2626" };
    const typeLabel: Record<string, string> = { ingreso: "Ingreso", premio: "Premio", retiro: "Retiro" };
    const statusLabel: Record<string, string> = { upcoming: "Próximo", active: "Activo", finished: "Finalizado" };
    const typeGameLabel: Record<string, string> = { daily: "Diario", weekly: "Semanal", monthly: "Mensual" };
    const freqLabel: Record<string, string> = { daily: "Diario", weekly: "Semanal", monthly: "Mensual", yearly: "Anual", one_time: "Pago único" };

    const netProfit        = s?.net_profit ?? 0;
    const totalExpenses    = s?.total_expenses ?? 0;
    const committedPrizes  = s?.committed_prizes ?? 0;
    const commissionsTotal = s?.total_commissions_paid ?? 0;
    const bonusesTotal     = s?.total_bonuses_granted ?? 0;
    const distributable    = s?.distributable_profit ?? netProfit;
    const expensesDetail: any[] = s?.expenses_detail ?? [];
    const committedDetail: any[] = s?.committed_prizes_detail ?? [];

    // ── Deductions section ────────────────────────────────────────
    const hasDeductions = totalExpenses > 0 || committedPrizes > 0 || commissionsTotal > 0 || bonusesTotal > 0;
    const expenseRows = expensesDetail.map(e => `
      <tr>
        <td style="padding-left:20px">↳ ${e.name}</td>
        <td>${freqLabel[e.frequency] ?? e.frequency}</td>
        <td style="color:#64748b;font-size:10px">${fmt(e.amount_full)} / ${freqLabel[e.frequency] ?? e.frequency}</td>
        <td style="text-align:right;color:#dc2626;font-weight:bold">−${fmt(e.amount_prorated)}</td>
      </tr>`).join("");

    const committedRows2 = committedDetail.map(g => `
      <tr>
        <td style="padding-left:20px">↳ ${g.title}</td>
        <td>${typeGameLabel[g.type] ?? g.type}</td>
        <td style="color:#64748b;font-size:10px">Sorteo activo / próximo</td>
        <td style="text-align:right;color:#b45309;font-weight:bold">−${fmt(g.prize_amount)}</td>
      </tr>`).join("");

    const deductionsSection = hasDeductions ? `
<h2>📉 Deducciones sobre la Ganancia Neta</h2>
<p style="font-size:10px;color:#64748b;margin-bottom:8px">
  Estos montos se descuentan de la ganancia neta antes de calcular los dividendos a socios.
  Los gastos operativos se prorratean según la duración del período seleccionado.
  Los premios comprometidos corresponden a sorteos activos o próximos sin ganador validado aún — ese dinero debe permanecer reservado.
</p>
<table>
  <thead><tr><th>Concepto</th><th>Frecuencia / Estado</th><th>Referencia</th><th style="text-align:right">Descuento del período</th></tr></thead>
  <tbody>
    ${commissionsTotal > 0 ? `<tr style="background:#f5f3ff"><td colspan="3" style="font-weight:900;color:#6d28d9">🔗 Comisiones de Activadores</td><td style="text-align:right;font-weight:900;color:#6d28d9">−${fmt(commissionsTotal)}</td></tr><tr><td style="padding-left:20px">↳ ${s?.commissions_count ?? 0} pago${(s?.commissions_count ?? 0) !== 1 ? "s" : ""} de comisión</td><td>—</td><td style="color:#64748b;font-size:10px">Deducido en ganancia neta</td><td style="text-align:right;color:#6d28d9;font-weight:bold">−${fmt(commissionsTotal)}</td></tr>` : ""}
    ${bonusesTotal > 0 ? `<tr style="background:#fefce8"><td colspan="3" style="font-weight:900;color:#b45309">🎁 Bonos de Bienvenida</td><td style="text-align:right;font-weight:900;color:#b45309">−${fmt(bonusesTotal)}</td></tr><tr><td style="padding-left:20px">↳ ${s?.bonuses_count ?? 0} bono${(s?.bonuses_count ?? 0) !== 1 ? "s" : ""} otorgados</td><td>—</td><td style="color:#64748b;font-size:10px">Deducido en ganancia neta</td><td style="text-align:right;color:#b45309;font-weight:bold">−${fmt(bonusesTotal)}</td></tr>` : ""}
    ${totalExpenses > 0 ? `<tr style="background:#fff1f2"><td colspan="3" style="font-weight:900;color:#dc2626">🏭 Gastos Operativos</td><td style="text-align:right;font-weight:900;color:#dc2626">−${fmt(totalExpenses)}</td></tr>${expenseRows}` : ""}
    ${committedPrizes > 0 ? `<tr style="background:#fffbeb"><td colspan="3" style="font-weight:900;color:#b45309">🔒 Premios Comprometidos (reservados)</td><td style="text-align:right;font-weight:900;color:#b45309">−${fmt(committedPrizes)}</td></tr>${committedRows2}` : ""}
    <tr style="background:${distributable >= 0 ? "#f0fdf4" : "#fef2f2"}">
      <td colspan="3" style="font-weight:900;font-size:13px">💜 Monto Distribuible a Socios</td>
      <td style="text-align:right;font-weight:900;font-size:14px;color:${distributable >= 0 ? "#5b21b6" : "#dc2626"}">${fmt(distributable)}</td>
    </tr>
  </tbody>
</table>` : "";

    // ── Partners section ──────────────────────────────────────────
    const isDeficit = distributable <= 0;
    const deficitAmount = Math.abs(distributable);

    // Build deficit causes list for explanation
    const deficitCauses: string[] = [];
    if (netProfit < 0) deficitCauses.push(`la ganancia neta del período es negativa (${fmt(netProfit)}), lo que indica que los egresos superaron los ingresos`);
    if (totalExpenses > 0) deficitCauses.push(`los gastos operativos del período ascienden a ${fmt(totalExpenses)}`);
    if (committedPrizes > 0) deficitCauses.push(`existen premios reservados por ${fmt(committedPrizes)} correspondientes a sorteos activos o próximos que aún no tienen ganador validado y cuyo monto debe mantenerse en custodia`);

    const deficitNotice = isDeficit ? `
<div style="border:3px solid #dc2626;border-radius:12px;padding:20px;background:#fef2f2;margin:20px 0">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
    <span style="font-size:28px">🚫</span>
    <div>
      <p style="font-size:17px;font-weight:900;color:#dc2626;text-transform:uppercase;letter-spacing:0.03em">Pago de dividendos NO CORRESPONDE este período</p>
      <p style="font-size:11px;color:#7f1d1d;margin-top:2px">Estimado/a socio/a — por favor lea atentamente la siguiente comunicación</p>
    </div>
  </div>

  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:12px">
    Mediante el presente documento se le informa que, tras el análisis financiero correspondiente al período
    <b>${PERIOD_LABELS[s?.period ?? "all"] ?? s?.period}</b>, la plataforma <b>${site.site_name}</b> presenta un déficit
    en el monto distribuible de <b style="color:#dc2626">${fmt(deficitAmount)}</b>, por lo que
    <b>no se efectuará ningún pago de dividendos en este período</b>.
  </p>

  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:12px">
    <b>Causas del déficit:</b>
  </p>
  <ul style="font-size:11px;color:#374151;line-height:1.9;padding-left:20px;margin-bottom:12px">
    ${deficitCauses.map(c => `<li>${c.charAt(0).toUpperCase() + c.slice(1)}.</li>`).join("")}
  </ul>

  <div style="background:#fff;border-radius:8px;padding:14px;border:1px solid #fca5a5;margin-bottom:12px">
    <p style="font-size:11px;font-weight:900;color:#7f1d1d;margin-bottom:8px">Resumen de la situación:</p>
    <table style="width:100%;font-size:11px;border-collapse:collapse">
      <tr><td style="padding:3px 0;color:#64748b">Ganancia neta del período</td><td style="text-align:right;font-weight:bold;color:${netProfit >= 0 ? "#16a34a" : "#dc2626"}">${fmt(netProfit)}</td></tr>
      ${totalExpenses > 0 ? `<tr><td style="padding:3px 0;color:#64748b">Menos gastos operativos</td><td style="text-align:right;font-weight:bold;color:#dc2626">−${fmt(totalExpenses)}</td></tr>` : ""}
      ${committedPrizes > 0 ? `<tr><td style="padding:3px 0;color:#64748b">Menos premios comprometidos (reserva obligatoria)</td><td style="text-align:right;font-weight:bold;color:#b45309">−${fmt(committedPrizes)}</td></tr>` : ""}
      <tr style="border-top:2px solid #fca5a5"><td style="padding:6px 0 0;font-weight:900;color:#dc2626">Déficit resultante (monto no distribuible)</td><td style="text-align:right;font-weight:900;color:#dc2626;padding:6px 0 0">${fmt(deficitAmount)}</td></tr>
    </table>
  </div>

  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:10px">
    <b>¿Qué significa esto?</b> El déficit no implica una pérdida definitiva para los socios. Los compromisos de premios
    son obligaciones temporales que se resolverán cuando se validen los ganadores de los sorteos activos o cuando
    concluyan los juegos programados. Una vez liberados esos montos, la situación financiera podrá mejorar en
    períodos subsiguientes.
  </p>

  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:10px">
    <b>¿Qué se debe a cada socio en teoría (sin déficit)?</b> A modo informativo, si la plataforma
    hubiera generado un monto distribuible positivo en este período, cada socio habría recibido:
  </p>
  <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:10px">
    <thead><tr style="background:#fee2e2"><th style="padding:6px 10px;text-align:left">Socio</th><th style="padding:6px 10px;text-align:left">CI</th><th style="padding:6px 10px;text-align:right">Porcentaje</th><th style="padding:6px 10px;text-align:right">Monto teórico</th></tr></thead>
    <tbody>
      ${(includeSnapshot ?? []).map((p: any) => `<tr><td style="padding:4px 10px;color:#7f1d1d"><b>${p.name}</b></td><td style="padding:4px 10px;color:#64748b">${p.identifier || "—"}</td><td style="padding:4px 10px;text-align:right">${p.share_percentage}%</td><td style="padding:4px 10px;text-align:right;color:#dc2626;font-weight:bold">${fmt(p.amount)} <span style="font-size:9px;color:#94a3b8">(no pagado)</span></td></tr>`).join("")}
    </tbody>
  </table>

  <p style="font-size:10px;color:#7f1d1d;font-style:italic;line-height:1.6;padding:10px;background:#ffe4e6;border-radius:6px">
    ⚠️ Los montos indicados como "teóricos" <b>no serán abonados</b> en este período. Este documento es
    únicamente informativo y no genera obligación de pago. La distribución se efectuará cuando la plataforma
    acumule un saldo distribuible positivo en un período futuro.
  </p>

  <div style="margin-top:24px;padding-top:20px;border-top:2px dashed #fca5a5">
    <p style="font-size:11px;font-weight:900;color:#7f1d1d;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">✍️ Constancia de Notificación</p>
    <p style="font-size:10px;color:#374151;line-height:1.6;margin-bottom:18px">
      La firma en los espacios indicados a continuación certifica que el socio fue debidamente notificado
      de la situación financiera del período, del déficit registrado y de la razón por la que
      no corresponde efectuar pago de dividendos en este período. No implica acuerdo con el contenido,
      sino únicamente constancia de recepción del documento.
    </p>
    <div style="display:grid;grid-template-columns:repeat(${(includeSnapshot ?? []).length + 1},1fr);gap:16px">
      ${(includeSnapshot ?? []).map((p: any) => `
      <div style="border:2px solid #fca5a5;border-radius:10px;padding:14px;background:white">
        <p style="font-size:9px;font-weight:900;color:#dc2626;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Notificado conforme — Socio</p>
        <p style="font-size:12px;font-weight:700;color:#1a1a2e">${p.name}</p>
        <p style="font-size:10px;color:#64748b">${p.identifier ? "CI: " + p.identifier : ""}</p>
        <p style="font-size:10px;color:#64748b;margin-top:2px">${p.share_percentage}% de participación</p>
        <p style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic">Declaro haber recibido este informe y entiendo que no corresponde cobro alguno en este período.</p>
        <div style="margin-top:28px;border-top:1px solid #1a1a2e;padding-top:6px">
          <p style="font-size:9px;color:#64748b">Firma: ___________________________ Fecha: ___/___/______</p>
        </div>
        <div style="margin-top:12px;border-top:1px solid #fee2e2;padding-top:4px">
          <p style="font-size:9px;color:#94a3b8">Aclaración: ___________________________</p>
        </div>
      </div>`).join("")}
      <div style="border:2px solid #b45309;border-radius:10px;padding:14px;background:white">
        <p style="font-size:9px;font-weight:900;color:#b45309;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Notifiqué conforme — Administrador</p>
        <p style="font-size:12px;font-weight:700;color:#1a1a2e">${site.site_name}</p>
        <p style="font-size:10px;color:#64748b">Período: ${PERIOD_LABELS[s?.period ?? "all"] ?? s?.period}</p>
        <p style="font-size:10px;color:#64748b">Déficit: <b style="color:#dc2626">${fmt(deficitAmount)}</b></p>
        <p style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic">Certifico que la información financiera es veraz y fue entregada al socio.</p>
        <div style="margin-top:28px;border-top:1px solid #1a1a2e;padding-top:6px">
          <p style="font-size:9px;color:#64748b">Firma: ___________________________ Fecha: ___/___/______</p>
        </div>
        <div style="margin-top:12px;border-top:1px solid #fde68a;padding-top:4px">
          <p style="font-size:9px;color:#94a3b8">Aclaración: ___________________________</p>
        </div>
      </div>
    </div>
  </div>
</div>` : "";

    const signaturesSection = !isDeficit && includeSnapshot && includeSnapshot.length > 0 ? `
<div style="margin-top:32px;page-break-inside:avoid">
  <h2 style="font-size:14px;color:#5b21b6;margin-bottom:12px;border-bottom:2px solid #ede9fe;padding-bottom:4px">✍️ Constancia de Pago y Firmas</h2>
  <p style="font-size:10px;color:#64748b;margin-bottom:20px;line-height:1.6">
    El presente documento certifica que los montos detallados en la sección de distribución han sido calculados
    conforme a los porcentajes acordados entre las partes y a la información financiera del período indicado.
    La firma de cada socio en el espacio correspondiente constituye constancia de recepción conforme del monto
    indicado. La firma del administrador en el espacio "Entregué conforme" certifica la veracidad de la información
    y la entrega del pago.
  </p>

  <div style="display:grid;grid-template-columns:repeat(${includeSnapshot.length + 1},1fr);gap:16px">
    ${includeSnapshot.map((p: any) => `
    <div style="border:2px solid #ede9fe;border-radius:10px;padding:14px;background:#faf5ff">
      <p style="font-size:9px;font-weight:900;color:#5b21b6;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Recibí conforme — Socio</p>
      <p style="font-size:12px;font-weight:700;color:#1a1a2e">${p.name}</p>
      <p style="font-size:10px;color:#64748b">${p.identifier ? "CI: " + p.identifier : ""}</p>
      <p style="font-size:14px;font-weight:900;color:#5b21b6;margin:6px 0">${fmt(p.amount)}</p>
      <p style="font-size:9px;color:#94a3b8">${p.share_percentage}% del monto distribuible</p>
      <p style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic">Declaro haber recibido el monto indicado a mi entera conformidad.</p>
      <div style="margin-top:28px;border-top:1px solid #1a1a2e;padding-top:6px">
        <p style="font-size:9px;color:#64748b">Firma: ___________________________ Fecha: ___/___/______</p>
      </div>
      <div style="margin-top:12px;border-top:1px solid #ede9fe;padding-top:4px">
        <p style="font-size:9px;color:#94a3b8">Aclaración: ___________________________</p>
      </div>
    </div>`).join("")}
    <div style="border:2px solid #5b21b6;border-radius:10px;padding:14px;background:white">
      <p style="font-size:9px;font-weight:900;color:#5b21b6;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Entregué conforme — Administrador</p>
      <p style="font-size:12px;font-weight:700;color:#1a1a2e">${site.site_name}</p>
      <p style="font-size:10px;color:#64748b">Total: <b>${fmt(includeSnapshot.reduce((a: number, p: any) => a + p.amount, 0))}</b></p>
      <p style="font-size:10px;color:#64748b">Período: ${PERIOD_LABELS[s?.period ?? "all"] ?? s?.period}</p>
      <p style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic">Certifico haber entregado los montos indicados conforme a los acuerdos entre las partes.</p>
      <div style="margin-top:28px;border-top:1px solid #1a1a2e;padding-top:6px">
        <p style="font-size:9px;color:#64748b">Firma: ___________________________ Fecha: ___/___/______</p>
      </div>
      <div style="margin-top:12px;border-top:1px solid #ede9fe;padding-top:4px">
        <p style="font-size:9px;color:#94a3b8">Aclaración: ___________________________</p>
      </div>
    </div>
  </div>
</div>` : "";

    const partnerTableSection = !isDeficit && includeSnapshot && includeSnapshot.length > 0 ? `
<h2>🤝 Distribución a Socios</h2>
<p style="font-size:10px;color:#64748b;margin-bottom:8px">
  Calculado sobre el monto distribuible de <b style="color:#5b21b6">${fmt(distributable)}</b>,
  resultado de descontar de la ganancia neta los gastos operativos del período
  ${totalExpenses > 0 ? `(${fmt(totalExpenses)})` : ""}
  ${committedPrizes > 0 ? `y los premios comprometidos en sorteos activos/próximos (${fmt(committedPrizes)})` : ""}.
  Cada socio recibe el porcentaje pactado sobre dicha base.
</p>
<table>
  <thead><tr><th>Socio</th><th>CI / Identificador</th><th style="text-align:right">Porcentaje</th><th style="text-align:right">Base de cálculo</th><th style="text-align:right">Monto a cobrar</th></tr></thead>
  <tbody>
    ${includeSnapshot.map((p: any) => `
    <tr>
      <td><b>${p.name}</b></td>
      <td style="color:#64748b">${p.identifier || "—"}</td>
      <td style="text-align:right;font-weight:bold;color:#7c3aed">${p.share_percentage}%</td>
      <td style="text-align:right;color:#64748b">${fmt(distributable)}</td>
      <td style="text-align:right;font-weight:900;color:#5b21b6">${fmt(p.amount)}</td>
    </tr>`).join("")}
    <tr style="background:#ede9fe">
      <td colspan="4" style="text-align:right;font-weight:900">Total distribuido</td>
      <td style="text-align:right;font-weight:900;color:#5b21b6">${fmt(includeSnapshot.reduce((a: number, p: any) => a + p.amount, 0))}</td>
    </tr>
  </tbody>
</table>
${signaturesSection}` : "";

    const partnersSection = deficitNotice + partnerTableSection;

    // ── Games table ───────────────────────────────────────────────
    const gamesRows = financeGames.map(g => `
      <tr>
        <td>${g.title}</td>
        <td>${typeGameLabel[g.type] ?? g.type}</td>
        <td>${statusLabel[g.status] ?? g.status}</td>
        <td style="text-align:right">${g.cards_sold}</td>
        <td style="text-align:right;color:#16a34a;font-weight:bold">${fmt(g.revenue)}</td>
        <td style="text-align:right;color:#b45309">${fmt(g.prizes_paid)}</td>
        <td style="text-align:right;font-weight:bold;color:${g.net >= 0 ? "#16a34a" : "#dc2626"}">${fmt(g.net)}</td>
      </tr>`).join("");

    // ── Financial health summary ──────────────────────────────────
    const totalObligations = (s?.balance_in_circulation ?? 0) + (s?.pending_withdrawals ?? 0) + committedPrizes;
    const grossRev = s?.gross_revenue ?? 0;
    const marginPct = grossRev > 0 ? ((netProfit / grossRev) * 100).toFixed(1) : "N/A";
    const marginNum = grossRev > 0 ? (netProfit / grossRev) * 100 : null;

    const healthStatus = (() => {
      if (distributable > 0 && netProfit > 0 && (marginNum === null || marginNum >= 10))
        return {
          label: "✅ Estado: Saludable",
          color: "#16a34a", bg: "#f0fdf4", border: "#86efac",
          desc: `La plataforma opera con ganancias positivas en el período ${PERIOD_LABELS[s?.period ?? "all"] ?? s?.period}. El monto distribuible a socios es favorable (${fmt(distributable)}), lo que indica que la operación genera excedentes reales después de cubrir todos los compromisos.`,
          advice: "Los dividendos pueden ser distribuidos con normalidad. Se recomienda mantener el volumen de ventas actual y continuar monitoreando los gastos operativos para sostener este rendimiento."
        };
      if (distributable > 0 && netProfit > 0)
        return {
          label: "🟡 Estado: Aceptable",
          color: "#b45309", bg: "#fffbeb", border: "#fcd34d",
          desc: `La plataforma genera ganancia neta positiva (${fmt(netProfit)}), aunque el margen sobre ingresos es bajo (${marginPct}%). El monto distribuible (${fmt(distributable)}) es positivo, pero ajustado.`,
          advice: "Los dividendos pueden distribuirse, aunque se recomienda evaluar si reducir gastos operativos o incrementar el volumen de sorteos mejoraría el rendimiento en próximos períodos."
        };
      if (netProfit >= 0 && distributable <= 0)
        return {
          label: "⚠️ Estado: Precaución — Sin distribución este período",
          color: "#b45309", bg: "#fffbeb", border: "#fcd34d",
          desc: `La ganancia neta del período es positiva (${fmt(netProfit)}), pero los compromisos pendientes — principalmente premios reservados para sorteos activos o próximos (${fmt(committedPrizes)}) — superan el excedente disponible, generando un déficit distribuible de ${fmt(deficitAmount)}.`,
          advice: `No corresponde pagar dividendos en este período. El déficit es de naturaleza temporal: una vez que los sorteos activos concluyan y sus ganadores sean validados, los premios comprometidos pasarán a egresos reales y dejarán de contar como reserva, lo que liberará el saldo en períodos futuros. Se recomienda verificar el estado de los sorteos activos (${committedDetail.length} juego${committedDetail.length !== 1 ? "s" : ""} con premios reservados) y validar ganadores a la brevedad posible.`
        };
      return {
        label: "🔴 Estado: Déficit — Sin distribución este período",
        color: "#dc2626", bg: "#fef2f2", border: "#fca5a5",
        desc: `La ganancia neta del período es negativa (${fmt(netProfit)}), lo que indica que los egresos totales (premios pagados + retiros) superaron los ingresos por ventas de cartones. El déficit distribuible asciende a ${fmt(deficitAmount)}.`,
        advice: `No corresponde pagar dividendos en este período. Se recomienda revisar la estructura de precios de los cartones, el monto de los premios y el volumen de sorteos programados para los próximos períodos. ${grossRev === 0 ? "No se registraron ingresos en el período seleccionado — verificar que el período sea correcto." : `Los ingresos del período fueron ${fmt(grossRev)}, insuficientes para cubrir los egresos.`}`
      };
    })();

    const summarySection = `
<h2>📋 Estado Financiero de la Plataforma</h2>
<div style="border:2px solid ${healthStatus.border};border-radius:12px;padding:20px;background:${healthStatus.bg};margin-bottom:16px">

  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:16px">
    <span style="font-size:15px;font-weight:900;color:${healthStatus.color};flex:1">${healthStatus.label}</span>
    <span style="font-size:10px;color:#64748b;white-space:nowrap">Período: ${PERIOD_LABELS[s?.period ?? "all"] ?? s?.period}</span>
  </div>

  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:10px"><b>Diagnóstico:</b> ${healthStatus.desc}</p>
  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:16px"><b>Recomendación:</b> ${healthStatus.advice}</p>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:#16a34a">${fmt(grossRev)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Ingresos brutos</div>
      <div style="font-size:9px;color:#94a3b8">${s?.cards_sold ?? 0} cartones</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:#b45309">${fmt(s?.prizes_paid ?? 0)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Premios pagados</div>
      <div style="font-size:9px;color:#94a3b8">${s?.prizes_count ?? 0} ganadores validados</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:${netProfit >= 0 ? "#16a34a" : "#dc2626"}">${fmt(netProfit)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Ganancia neta</div>
      <div style="font-size:9px;color:#94a3b8">Margen: ${marginPct}${grossRev > 0 ? "%" : ""}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:#dc2626">${fmt(totalExpenses)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Gastos operativos</div>
      <div style="font-size:9px;color:#94a3b8">${expensesDetail.length} concepto${expensesDetail.length !== 1 ? "s" : ""} activo${expensesDetail.length !== 1 ? "s" : ""}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:#b45309">${fmt(committedPrizes)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Premios reservados</div>
      <div style="font-size:9px;color:#94a3b8">${committedDetail.length} sorteo${committedDetail.length !== 1 ? "s" : ""} pendiente${committedDetail.length !== 1 ? "s" : ""}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center;border:${isDeficit ? "2px solid #dc2626" : "2px solid #5b21b6"}">
      <div style="font-size:14px;font-weight:900;color:${isDeficit ? "#dc2626" : "#5b21b6"}">${isDeficit ? "−" : ""}${fmt(isDeficit ? deficitAmount : distributable)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">${isDeficit ? "Déficit" : "Monto distribuible"}</div>
      <div style="font-size:9px;color:${isDeficit ? "#dc2626" : "#5b21b6"};font-weight:bold">${isDeficit ? "Sin pago este período" : "Disponible para socios"}</div>
    </div>
  </div>

  <div style="padding:12px;background:white;border-radius:8px;border-left:4px solid ${healthStatus.color}">
    <p style="font-size:10px;font-weight:900;color:#374151;margin-bottom:6px">Obligaciones de la plataforma al cierre del período:</p>
    <table style="width:100%;font-size:10px;border-collapse:collapse">
      <tr><td style="padding:2px 0;color:#64748b">Saldo acumulado de usuarios (billeteras)</td><td style="text-align:right;font-weight:bold">${fmt(s?.balance_in_circulation ?? 0)}</td></tr>
      <tr><td style="padding:2px 0;color:#64748b">Solicitudes de retiro pendientes de pago</td><td style="text-align:right;font-weight:bold;color:#f59e0b">${fmt(s?.pending_withdrawals ?? 0)} <span style="font-weight:normal">(${s?.pending_withdrawals_count ?? 0} solicitudes)</span></td></tr>
      <tr><td style="padding:2px 0;color:#64748b">Premios en custodia (sorteos sin ganador validado)</td><td style="text-align:right;font-weight:bold;color:#b45309">${fmt(committedPrizes)}</td></tr>
      <tr style="border-top:1px solid #e2e8f0"><td style="padding:4px 0 0;font-weight:900">Total obligaciones</td><td style="text-align:right;font-weight:900;padding:4px 0 0">${fmt(totalObligations)}</td></tr>
    </table>
  </div>

</div>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Reporte Financiero — ${site.site_name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; padding: 32px; font-size: 12px; }
  h1 { font-size: 22px; color: #5b21b6; margin-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; text-align: center; }
  .kpi-value { font-size: 18px; font-weight: 900; }
  .kpi-label { font-size: 10px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi-sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  h2 { font-size: 14px; color: #5b21b6; margin: 24px 0 8px; border-bottom: 2px solid #ede9fe; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
  th { background: #5b21b6; color: white; padding: 7px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
  tr:nth-child(even) td { background: #faf5ff; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 10px; }
  @media print { body { padding: 16px; } .no-print { display: none; } }
</style></head><body>

<h1>💰 Reporte Financiero — ${site.site_name}</h1>
<p class="subtitle">Período: <b>${PERIOD_LABELS[s?.period ?? "all"] ?? s?.period}</b> &nbsp;·&nbsp; Generado el ${new Date().toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value" style="color:#16a34a">${fmt(s?.gross_revenue ?? 0)}</div><div class="kpi-label">Ingresos brutos</div><div class="kpi-sub">${s?.cards_sold ?? 0} cartones vendidos</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#b45309">${fmt(s?.prizes_paid ?? 0)}</div><div class="kpi-label">Premios pagados</div><div class="kpi-sub">${s?.prizes_count ?? 0} ganadores</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#dc2626">${fmt(s?.withdrawals_paid ?? 0)}</div><div class="kpi-label">Retiros pagados</div><div class="kpi-sub">${s?.withdrawals_count ?? 0} retiros</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#7c3aed">${fmt(s?.balance_in_circulation ?? 0)}</div><div class="kpi-label">Saldo en circulación</div><div class="kpi-sub">${s?.users_with_balance ?? 0} usuarios con saldo</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#f59e0b">${fmt(s?.pending_withdrawals ?? 0)}</div><div class="kpi-label">Retiros pendientes</div><div class="kpi-sub">${s?.pending_withdrawals_count ?? 0} solicitudes</div></div>
  <div class="kpi" style="background:${netProfit >= 0 ? "#f0fdf4" : "#fef2f2"};border-color:${netProfit >= 0 ? "#86efac" : "#fca5a5"}">
    <div class="kpi-value" style="color:${netProfit >= 0 ? "#16a34a" : "#dc2626"}">${fmt(netProfit)}</div>
    <div class="kpi-label">Ganancia neta</div>
    <div class="kpi-sub">Ingresos − Premios − Retiros</div>
  </div>
</div>

${deductionsSection}
${partnersSection}

<h2>📊 Desglose por Juego</h2>
<table>
  <thead><tr><th>Juego</th><th>Tipo</th><th>Estado</th><th style="text-align:right">Cartones</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Premios</th><th style="text-align:right">Ganancia</th></tr></thead>
  <tbody>${gamesRows || "<tr><td colspan='7' style='text-align:center;color:#94a3b8;padding:16px'>Sin juegos en este período</td></tr>"}</tbody>
</table>

${summarySection}

<div class="footer">
  ${site.site_name} &nbsp;·&nbsp; Reporte generado automáticamente &nbsp;·&nbsp; Todos los montos en bolivianos (Bs)<br>
  Este documento es de uso interno. La información contenida es confidencial.
</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { toast.error("Permite las ventanas emergentes para descargar el PDF"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  function downloadPartnerPaymentPDF(pp: any) {
    const fmt = (v: number) => `Bs ${Number(v).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const archiveDate = new Date(pp.created_at).toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const snap: any[] = Array.isArray(pp.partners_snapshot) ? pp.partners_snapshot : [];

    // ── Use stored finance_snapshot (complete data) when available ─
    const fs: any = pp.finance_snapshot ?? {};
    const s = { ...fs };

    const freqLabel: Record<string, string> = { daily: "Diario", weekly: "Semanal", monthly: "Mensual", yearly: "Anual", one_time: "Pago único" };
    const typeGameLabel: Record<string, string> = { daily: "Diario", weekly: "Semanal", monthly: "Mensual" };
    const statusLabel: Record<string, string> = { upcoming: "Próximo", active: "Activo", finished: "Finalizado" };

    const netProfit        = Number(s.net_profit        ?? pp.net_profit    ?? 0);
    const grossRev         = Number(s.gross_revenue     ?? pp.gross_revenue ?? 0);
    const totalPaid        = Number(pp.total_paid ?? 0);
    const totalExpenses    = Number(s.total_expenses    ?? 0);
    const committedPrizes  = Number(s.committed_prizes  ?? 0);
    const commissionsTotal = Number(s.total_commissions_paid ?? 0);
    const bonusesTotal     = Number(s.total_bonuses_granted  ?? 0);
    const distributable    = Number(s.distributable_profit ?? totalPaid);
    const expensesDetail: any[] = s.expenses_detail         ?? [];
    const committedDetail: any[] = s.committed_prizes_detail ?? [];
    const finGames: any[] = s.games ?? [];

    const marginPct = grossRev > 0 ? ((netProfit / grossRev) * 100).toFixed(1) : "N/A";
    const isDeficit = distributable <= 0;
    const deficitAmount = Math.abs(distributable);

    // ── Deductions section ─────────────────────────────────────────
    const hasDeductions = totalExpenses > 0 || committedPrizes > 0 || commissionsTotal > 0 || bonusesTotal > 0;
    const expenseRows = expensesDetail.map((e: any) => `
      <tr>
        <td style="padding-left:20px">↳ ${e.name}</td>
        <td>${freqLabel[e.frequency] ?? e.frequency}</td>
        <td style="color:#64748b;font-size:10px">${fmt(e.amount_full)} / ${freqLabel[e.frequency] ?? e.frequency}</td>
        <td style="text-align:right;color:#dc2626;font-weight:bold">−${fmt(e.amount_prorated)}</td>
      </tr>`).join("");
    const committedRows2 = committedDetail.map((g: any) => `
      <tr>
        <td style="padding-left:20px">↳ ${g.title}</td>
        <td>${typeGameLabel[g.type] ?? g.type}</td>
        <td style="color:#64748b;font-size:10px">Sorteo activo / próximo</td>
        <td style="text-align:right;color:#b45309;font-weight:bold">−${fmt(g.prize_amount)}</td>
      </tr>`).join("");
    const deductionsSection = hasDeductions ? `
<h2>📉 Deducciones sobre la Ganancia Neta</h2>
<p style="font-size:10px;color:#64748b;margin-bottom:8px">
  Estos montos se descuentan de la ganancia neta antes de calcular los dividendos a socios.
  Los gastos operativos se prorratean según la duración del período seleccionado.
  Los premios comprometidos corresponden a sorteos activos o próximos sin ganador validado aún — ese dinero debe permanecer reservado.
</p>
<table>
  <thead><tr><th>Concepto</th><th>Frecuencia / Estado</th><th>Referencia</th><th style="text-align:right">Descuento del período</th></tr></thead>
  <tbody>
    ${commissionsTotal > 0 ? `<tr style="background:#f5f3ff"><td colspan="3" style="font-weight:900;color:#6d28d9">🔗 Comisiones de Activadores</td><td style="text-align:right;font-weight:900;color:#6d28d9">−${fmt(commissionsTotal)}</td></tr><tr><td style="padding-left:20px">↳ ${s?.commissions_count ?? 0} pago${(s?.commissions_count ?? 0) !== 1 ? "s" : ""} de comisión</td><td>—</td><td style="color:#64748b;font-size:10px">Deducido en ganancia neta</td><td style="text-align:right;color:#6d28d9;font-weight:bold">−${fmt(commissionsTotal)}</td></tr>` : ""}
    ${bonusesTotal > 0 ? `<tr style="background:#fefce8"><td colspan="3" style="font-weight:900;color:#b45309">🎁 Bonos de Bienvenida</td><td style="text-align:right;font-weight:900;color:#b45309">−${fmt(bonusesTotal)}</td></tr><tr><td style="padding-left:20px">↳ ${s?.bonuses_count ?? 0} bono${(s?.bonuses_count ?? 0) !== 1 ? "s" : ""} otorgados</td><td>—</td><td style="color:#64748b;font-size:10px">Deducido en ganancia neta</td><td style="text-align:right;color:#b45309;font-weight:bold">−${fmt(bonusesTotal)}</td></tr>` : ""}
    ${totalExpenses > 0 ? `<tr style="background:#fff1f2"><td colspan="3" style="font-weight:900;color:#dc2626">🏭 Gastos Operativos</td><td style="text-align:right;font-weight:900;color:#dc2626">−${fmt(totalExpenses)}</td></tr>${expenseRows}` : ""}
    ${committedPrizes > 0 ? `<tr style="background:#fffbeb"><td colspan="3" style="font-weight:900;color:#b45309">🔒 Premios Comprometidos (reservados)</td><td style="text-align:right;font-weight:900;color:#b45309">−${fmt(committedPrizes)}</td></tr>${committedRows2}` : ""}
    <tr style="background:${distributable >= 0 ? "#f0fdf4" : "#fef2f2"}">
      <td colspan="3" style="font-weight:900;font-size:13px">💜 Monto Distribuible a Socios</td>
      <td style="text-align:right;font-weight:900;font-size:14px;color:${distributable >= 0 ? "#5b21b6" : "#dc2626"}">${fmt(distributable)}</td>
    </tr>
  </tbody>
</table>` : "";

    // ── Partners section ───────────────────────────────────────────
    const deficitCauses: string[] = [];
    if (netProfit < 0) deficitCauses.push(`la ganancia neta del período es negativa (${fmt(netProfit)}), lo que indica que los egresos superaron los ingresos`);
    if (totalExpenses > 0) deficitCauses.push(`los gastos operativos del período ascienden a ${fmt(totalExpenses)}`);
    if (committedPrizes > 0) deficitCauses.push(`existen premios reservados por ${fmt(committedPrizes)} correspondientes a sorteos activos o próximos que aún no tienen ganador validado y cuyo monto debe mantenerse en custodia`);

    const deficitNotice = isDeficit ? `
<div style="border:3px solid #dc2626;border-radius:12px;padding:20px;background:#fef2f2;margin:20px 0">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
    <span style="font-size:28px">🚫</span>
    <div>
      <p style="font-size:17px;font-weight:900;color:#dc2626;text-transform:uppercase;letter-spacing:0.03em">Pago de dividendos NO CORRESPONDE este período</p>
      <p style="font-size:11px;color:#7f1d1d;margin-top:2px">Estimado/a socio/a — por favor lea atentamente la siguiente comunicación</p>
    </div>
  </div>
  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:12px">
    Mediante el presente documento se le informa que, tras el análisis financiero correspondiente al período
    <b>${pp.period_label}</b>, la plataforma <b>${site.site_name}</b> presenta un déficit
    en el monto distribuible de <b style="color:#dc2626">${fmt(deficitAmount)}</b>, por lo que
    <b>no se efectuará ningún pago de dividendos en este período</b>.
  </p>
  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:12px"><b>Causas del déficit:</b></p>
  <ul style="font-size:11px;color:#374151;line-height:1.9;padding-left:20px;margin-bottom:12px">
    ${deficitCauses.map(c => `<li>${c.charAt(0).toUpperCase() + c.slice(1)}.</li>`).join("")}
  </ul>
  <div style="background:#fff;border-radius:8px;padding:14px;border:1px solid #fca5a5;margin-bottom:12px">
    <p style="font-size:11px;font-weight:900;color:#7f1d1d;margin-bottom:8px">Resumen de la situación:</p>
    <table style="width:100%;font-size:11px;border-collapse:collapse">
      <tr><td style="padding:3px 0;color:#64748b">Ganancia neta del período</td><td style="text-align:right;font-weight:bold;color:${netProfit >= 0 ? "#16a34a" : "#dc2626"}">${fmt(netProfit)}</td></tr>
      ${totalExpenses > 0 ? `<tr><td style="padding:3px 0;color:#64748b">Menos gastos operativos</td><td style="text-align:right;font-weight:bold;color:#dc2626">−${fmt(totalExpenses)}</td></tr>` : ""}
      ${committedPrizes > 0 ? `<tr><td style="padding:3px 0;color:#64748b">Menos premios comprometidos (reserva obligatoria)</td><td style="text-align:right;font-weight:bold;color:#b45309">−${fmt(committedPrizes)}</td></tr>` : ""}
      <tr style="border-top:2px solid #fca5a5"><td style="padding:6px 0 0;font-weight:900;color:#dc2626">Déficit resultante (monto no distribuible)</td><td style="text-align:right;font-weight:900;color:#dc2626;padding:6px 0 0">${fmt(deficitAmount)}</td></tr>
    </table>
  </div>
  <div style="margin-top:24px;padding-top:20px;border-top:2px dashed #fca5a5">
    <p style="font-size:11px;font-weight:900;color:#7f1d1d;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">✍️ Constancia de Notificación</p>
    <p style="font-size:10px;color:#374151;line-height:1.6;margin-bottom:18px">
      La firma en los espacios indicados a continuación certifica que el socio fue debidamente notificado
      de la situación financiera del período, del déficit registrado y de la razón por la que
      no corresponde efectuar pago de dividendos en este período.
    </p>
    <div style="display:grid;grid-template-columns:repeat(${snap.length + 1},1fr);gap:16px">
      ${snap.map((p: any) => `
      <div style="border:2px solid #fca5a5;border-radius:10px;padding:14px;background:white">
        <p style="font-size:9px;font-weight:900;color:#dc2626;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Notificado conforme — Socio</p>
        <p style="font-size:12px;font-weight:700;color:#1a1a2e">${p.name}</p>
        <p style="font-size:10px;color:#64748b">${p.identifier ? "CI: " + p.identifier : ""}</p>
        <p style="font-size:10px;color:#64748b;margin-top:2px">${p.share_percentage}% de participación</p>
        <div style="margin-top:28px;border-top:1px solid #1a1a2e;padding-top:6px">
          <p style="font-size:9px;color:#64748b">Firma: ___________________________ Fecha: ___/___/______</p>
        </div>
      </div>`).join("")}
      <div style="border:2px solid #b45309;border-radius:10px;padding:14px;background:white">
        <p style="font-size:9px;font-weight:900;color:#b45309;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Notifiqué conforme — Administrador</p>
        <p style="font-size:12px;font-weight:700;color:#1a1a2e">${site.site_name}</p>
        <p style="font-size:10px;color:#64748b">Período: ${pp.period_label}</p>
        <p style="font-size:10px;color:#64748b">Déficit: <b style="color:#dc2626">${fmt(deficitAmount)}</b></p>
        <div style="margin-top:28px;border-top:1px solid #1a1a2e;padding-top:6px">
          <p style="font-size:9px;color:#64748b">Firma: ___________________________ Fecha: ___/___/______</p>
        </div>
      </div>
    </div>
  </div>
</div>` : "";

    const signaturesSection = !isDeficit && snap.length > 0 ? `
<div style="margin-top:32px;page-break-inside:avoid">
  <h2 style="font-size:14px;color:#5b21b6;margin-bottom:12px;border-bottom:2px solid #ede9fe;padding-bottom:4px">✍️ Constancia de Pago y Firmas</h2>
  <p style="font-size:10px;color:#64748b;margin-bottom:20px;line-height:1.6">
    El presente documento certifica que los montos detallados en la sección de distribución han sido calculados
    conforme a los porcentajes acordados entre las partes y a la información financiera del período indicado.
    La firma de cada socio en el espacio correspondiente constituye constancia de recepción conforme del monto indicado.
    La firma del administrador en el espacio "Entregué conforme" certifica la veracidad de la información y la entrega del pago.
  </p>
  <div style="display:grid;grid-template-columns:repeat(${snap.length + 1},1fr);gap:16px">
    ${snap.map((p: any) => `
    <div style="border:2px solid #ede9fe;border-radius:10px;padding:14px;background:#faf5ff">
      <p style="font-size:9px;font-weight:900;color:#5b21b6;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Recibí conforme — Socio</p>
      <p style="font-size:12px;font-weight:700;color:#1a1a2e">${p.name}</p>
      <p style="font-size:10px;color:#64748b">${p.identifier ? "CI: " + p.identifier : ""}</p>
      <p style="font-size:14px;font-weight:900;color:#5b21b6;margin:6px 0">${fmt(p.amount)}</p>
      <p style="font-size:9px;color:#94a3b8">${p.share_percentage}% del monto distribuible</p>
      <p style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic">Declaro haber recibido el monto indicado a mi entera conformidad.</p>
      <div style="margin-top:28px;border-top:1px solid #1a1a2e;padding-top:6px">
        <p style="font-size:9px;color:#64748b">Firma: ___________________________ Fecha: ___/___/______</p>
      </div>
      <div style="margin-top:12px;border-top:1px solid #ede9fe;padding-top:4px">
        <p style="font-size:9px;color:#94a3b8">Aclaración: ___________________________</p>
      </div>
    </div>`).join("")}
    <div style="border:2px solid #5b21b6;border-radius:10px;padding:14px;background:white">
      <p style="font-size:9px;font-weight:900;color:#5b21b6;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Entregué conforme — Administrador</p>
      <p style="font-size:12px;font-weight:700;color:#1a1a2e">${site.site_name}</p>
      <p style="font-size:10px;color:#64748b">Total: <b>${fmt(totalPaid)}</b></p>
      <p style="font-size:10px;color:#64748b">Período: ${pp.period_label}</p>
      <p style="font-size:9px;color:#94a3b8;margin-top:4px;font-style:italic">Certifico haber entregado los montos indicados conforme a los acuerdos entre las partes.</p>
      <div style="margin-top:28px;border-top:1px solid #1a1a2e;padding-top:6px">
        <p style="font-size:9px;color:#64748b">Firma: ___________________________ Fecha: ___/___/______</p>
      </div>
      <div style="margin-top:12px;border-top:1px solid #ede9fe;padding-top:4px">
        <p style="font-size:9px;color:#94a3b8">Aclaración: ___________________________</p>
      </div>
    </div>
  </div>
</div>` : "";

    const partnerTableSection = !isDeficit && snap.length > 0 ? `
<h2>🤝 Distribución a Socios</h2>
<p style="font-size:10px;color:#64748b;margin-bottom:8px">
  Calculado sobre el monto distribuible de <b style="color:#5b21b6">${fmt(distributable)}</b>,
  resultado de descontar de la ganancia neta los gastos operativos del período
  ${totalExpenses > 0 ? `(${fmt(totalExpenses)})` : ""}
  ${committedPrizes > 0 ? `y los premios comprometidos en sorteos activos/próximos (${fmt(committedPrizes)})` : ""}.
  Cada socio recibe el porcentaje pactado sobre dicha base.
</p>
<table>
  <thead><tr><th>Socio</th><th>CI / Identificador</th><th style="text-align:right">Porcentaje</th><th style="text-align:right">Base de cálculo</th><th style="text-align:right">Monto a cobrar</th></tr></thead>
  <tbody>
    ${snap.map((p: any) => `
    <tr>
      <td><b>${p.name}</b></td>
      <td style="color:#64748b">${p.identifier || "—"}</td>
      <td style="text-align:right;font-weight:bold;color:#7c3aed">${p.share_percentage}%</td>
      <td style="text-align:right;color:#64748b">${fmt(distributable)}</td>
      <td style="text-align:right;font-weight:900;color:#5b21b6">${fmt(p.amount)}</td>
    </tr>`).join("")}
    <tr style="background:#ede9fe">
      <td colspan="4" style="text-align:right;font-weight:900">Total distribuido</td>
      <td style="text-align:right;font-weight:900;color:#5b21b6">${fmt(totalPaid)}</td>
    </tr>
  </tbody>
</table>
${signaturesSection}` : "";

    const partnersSection = deficitNotice + partnerTableSection;

    // ── Games table ────────────────────────────────────────────────
    const gamesRows = finGames.map((g: any) => `
      <tr>
        <td>${g.title}</td>
        <td>${typeGameLabel[g.type] ?? g.type}</td>
        <td>${statusLabel[g.status] ?? g.status}</td>
        <td style="text-align:right">${g.cards_sold}</td>
        <td style="text-align:right;color:#16a34a;font-weight:bold">${fmt(g.revenue)}</td>
        <td style="text-align:right;color:#b45309">${fmt(g.prizes_paid)}</td>
        <td style="text-align:right;font-weight:bold;color:${g.net >= 0 ? "#16a34a" : "#dc2626"}">${fmt(g.net)}</td>
      </tr>`).join("");

    // ── Financial health summary ───────────────────────────────────
    const totalObligations = (Number(s.balance_in_circulation ?? 0)) + (Number(s.pending_withdrawals ?? 0)) + committedPrizes;
    const marginNum = grossRev > 0 ? (netProfit / grossRev) * 100 : null;
    const healthStatus = (() => {
      if (distributable > 0 && netProfit > 0 && (marginNum === null || marginNum >= 10))
        return { label: "✅ Estado: Saludable", color: "#16a34a", bg: "#f0fdf4", border: "#86efac",
          desc: `La plataforma opera con ganancias positivas en el período ${pp.period_label}. El monto distribuible a socios es favorable (${fmt(distributable)}), lo que indica que la operación genera excedentes reales después de cubrir todos los compromisos.`,
          advice: "Los dividendos pueden ser distribuidos con normalidad. Se recomienda mantener el volumen de ventas actual y continuar monitoreando los gastos operativos para sostener este rendimiento." };
      if (distributable > 0 && netProfit > 0)
        return { label: "🟡 Estado: Aceptable", color: "#b45309", bg: "#fffbeb", border: "#fcd34d",
          desc: `La plataforma genera ganancia neta positiva (${fmt(netProfit)}), aunque el margen sobre ingresos es bajo (${marginPct}%). El monto distribuible (${fmt(distributable)}) es positivo, pero ajustado.`,
          advice: "Los dividendos pueden distribuirse, aunque se recomienda evaluar si reducir gastos operativos o incrementar el volumen de sorteos mejoraría el rendimiento en próximos períodos." };
      if (netProfit >= 0 && distributable <= 0)
        return { label: "⚠️ Estado: Precaución — Sin distribución este período", color: "#b45309", bg: "#fffbeb", border: "#fcd34d",
          desc: `La ganancia neta del período es positiva (${fmt(netProfit)}), pero los compromisos pendientes superan el excedente disponible, generando un déficit distribuible de ${fmt(deficitAmount)}.`,
          advice: "No corresponde pagar dividendos en este período. El déficit es de naturaleza temporal." };
      return { label: "🔴 Estado: Déficit — Sin distribución este período", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5",
        desc: `La ganancia neta del período es negativa (${fmt(netProfit)}), lo que indica que los egresos totales superaron los ingresos. El déficit distribuible asciende a ${fmt(deficitAmount)}.`,
        advice: `No corresponde pagar dividendos en este período. Se recomienda revisar la estructura de precios de los cartones y el volumen de sorteos programados.` };
    })();

    const summarySection = `
<h2>📋 Estado Financiero de la Plataforma</h2>
<div style="border:2px solid ${healthStatus.border};border-radius:12px;padding:20px;background:${healthStatus.bg};margin-bottom:16px">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:16px">
    <span style="font-size:15px;font-weight:900;color:${healthStatus.color};flex:1">${healthStatus.label}</span>
    <span style="font-size:10px;color:#64748b;white-space:nowrap">Período: ${pp.period_label}</span>
  </div>
  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:10px"><b>Diagnóstico:</b> ${healthStatus.desc}</p>
  <p style="font-size:11px;color:#374151;line-height:1.7;margin-bottom:16px"><b>Recomendación:</b> ${healthStatus.advice}</p>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:#16a34a">${fmt(grossRev)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Ingresos brutos</div>
      <div style="font-size:9px;color:#94a3b8">${s.cards_sold ?? 0} cartones</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:#b45309">${fmt(Number(s.prizes_paid ?? 0))}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Premios pagados</div>
      <div style="font-size:9px;color:#94a3b8">${s.prizes_count ?? 0} ganadores validados</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:${netProfit >= 0 ? "#16a34a" : "#dc2626"}">${fmt(netProfit)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Ganancia neta</div>
      <div style="font-size:9px;color:#94a3b8">Margen: ${marginPct}${grossRev > 0 ? "%" : ""}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:#dc2626">${fmt(totalExpenses)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Gastos operativos</div>
      <div style="font-size:9px;color:#94a3b8">${expensesDetail.length} concepto${expensesDetail.length !== 1 ? "s" : ""} activo${expensesDetail.length !== 1 ? "s" : ""}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:14px;font-weight:900;color:#b45309">${fmt(committedPrizes)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">Premios reservados</div>
      <div style="font-size:9px;color:#94a3b8">${committedDetail.length} sorteo${committedDetail.length !== 1 ? "s" : ""} pendiente${committedDetail.length !== 1 ? "s" : ""}</div>
    </div>
    <div style="background:white;border-radius:8px;padding:12px;text-align:center;border:${isDeficit ? "2px solid #dc2626" : "2px solid #5b21b6"}">
      <div style="font-size:14px;font-weight:900;color:${isDeficit ? "#dc2626" : "#5b21b6"}">${isDeficit ? "−" : ""}${fmt(isDeficit ? deficitAmount : distributable)}</div>
      <div style="font-size:9px;color:#64748b;margin-top:2px;text-transform:uppercase">${isDeficit ? "Déficit" : "Monto distribuible"}</div>
      <div style="font-size:9px;color:${isDeficit ? "#dc2626" : "#5b21b6"};font-weight:bold">${isDeficit ? "Sin pago este período" : "Disponible para socios"}</div>
    </div>
  </div>
  <div style="padding:12px;background:white;border-radius:8px;border-left:4px solid ${healthStatus.color}">
    <p style="font-size:10px;font-weight:900;color:#374151;margin-bottom:6px">Obligaciones de la plataforma al cierre del período:</p>
    <table style="width:100%;font-size:10px;border-collapse:collapse">
      <tr><td style="padding:2px 0;color:#64748b">Saldo acumulado de usuarios (billeteras)</td><td style="text-align:right;font-weight:bold">${fmt(Number(s.balance_in_circulation ?? 0))}</td></tr>
      <tr><td style="padding:2px 0;color:#64748b">Solicitudes de retiro pendientes de pago</td><td style="text-align:right;font-weight:bold;color:#f59e0b">${fmt(Number(s.pending_withdrawals ?? 0))} <span style="font-weight:normal">(${s.pending_withdrawals_count ?? 0} solicitudes)</span></td></tr>
      <tr><td style="padding:2px 0;color:#64748b">Premios en custodia (sorteos sin ganador validado)</td><td style="text-align:right;font-weight:bold;color:#b45309">${fmt(committedPrizes)}</td></tr>
      <tr style="border-top:1px solid #e2e8f0"><td style="padding:4px 0 0;font-weight:900">Total obligaciones</td><td style="text-align:right;font-weight:900;padding:4px 0 0">${fmt(totalObligations)}</td></tr>
    </table>
  </div>
</div>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Reporte Financiero — ${site.site_name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; padding: 32px; font-size: 12px; }
  h1 { font-size: 22px; color: #5b21b6; margin-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; text-align: center; }
  .kpi-value { font-size: 18px; font-weight: 900; }
  .kpi-label { font-size: 10px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi-sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  h2 { font-size: 14px; color: #5b21b6; margin: 24px 0 8px; border-bottom: 2px solid #ede9fe; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
  th { background: #5b21b6; color: white; padding: 7px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
  tr:nth-child(even) td { background: #faf5ff; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 10px; }
  @media print { body { padding: 16px; } .no-print { display: none; } }
</style></head><body>

<h1>💰 Reporte Financiero — ${site.site_name}</h1>
<p class="subtitle">Período: <b>${pp.period_label}</b> &nbsp;·&nbsp; Archivado el ${archiveDate} &nbsp;·&nbsp; Generado el ${new Date().toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value" style="color:#16a34a">${fmt(grossRev)}</div><div class="kpi-label">Ingresos brutos</div><div class="kpi-sub">${s.cards_sold ?? 0} cartones vendidos</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#b45309">${fmt(Number(s.prizes_paid ?? 0))}</div><div class="kpi-label">Premios pagados</div><div class="kpi-sub">${s.prizes_count ?? 0} ganadores</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#dc2626">${fmt(Number(s.withdrawals_paid ?? 0))}</div><div class="kpi-label">Retiros pagados</div><div class="kpi-sub">${s.withdrawals_count ?? 0} retiros</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#7c3aed">${fmt(Number(s.balance_in_circulation ?? 0))}</div><div class="kpi-label">Saldo en circulación</div><div class="kpi-sub">${s.users_with_balance ?? 0} usuarios con saldo</div></div>
  <div class="kpi"><div class="kpi-value" style="color:#f59e0b">${fmt(Number(s.pending_withdrawals ?? 0))}</div><div class="kpi-label">Retiros pendientes</div><div class="kpi-sub">${s.pending_withdrawals_count ?? 0} solicitudes</div></div>
  <div class="kpi" style="background:${netProfit >= 0 ? "#f0fdf4" : "#fef2f2"};border-color:${netProfit >= 0 ? "#86efac" : "#fca5a5"}">
    <div class="kpi-value" style="color:${netProfit >= 0 ? "#16a34a" : "#dc2626"}">${fmt(netProfit)}</div>
    <div class="kpi-label">Ganancia neta</div>
    <div class="kpi-sub">Ingresos − Premios − Retiros</div>
  </div>
</div>

${deductionsSection}
${partnersSection}

<h2>📊 Desglose por Juego</h2>
<table>
  <thead><tr><th>Juego</th><th>Tipo</th><th>Estado</th><th style="text-align:right">Cartones</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Premios</th><th style="text-align:right">Ganancia</th></tr></thead>
  <tbody>${gamesRows || "<tr><td colspan='7' style='text-align:center;color:#94a3b8;padding:16px'>Sin juegos en este período</td></tr>"}</tbody>
</table>

${summarySection}

${pp.admin_notes ? `<div style="margin-top:20px;padding:12px;background:#f8f7ff;border-radius:8px;border-left:4px solid #7c3aed;font-size:11px;color:#374151"><b>Nota del administrador:</b> ${pp.admin_notes}</div>` : ""}

<div class="footer">
  ${site.site_name} &nbsp;·&nbsp; Reporte generado automáticamente &nbsp;·&nbsp; Todos los montos en bolivianos (Bs)<br>
  Este documento es de uso interno. La información contenida es confidencial.
</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { toast.error("Permite las ventanas emergentes para descargar el PDF"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  async function sharePartnerPaymentWhatsApp(pp: any) {
    const fmt = (v: number) => `Bs ${Number(v).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const snapshot: any[] = Array.isArray(pp.partners_snapshot) ? pp.partners_snapshot : [];
    const dateStr = new Date(pp.created_at).toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric" });
    const waText = [
      `💜 *Pago a Socios — ${pp.period_label}*`,
      `📅 ${dateStr}`,
      ``,
      `📊 *Resumen del período:*`,
      `  • Ingresos brutos: ${fmt(Number(pp.gross_revenue))}`,
      `  • Ganancia neta: ${fmt(Number(pp.net_profit))}`,
      `  • Total distribuido: *${fmt(Number(pp.total_paid))}*`,
      ``,
      `👥 *Detalle por socio:*`,
      ...snapshot.map((ps: any) => `  • ${ps.name} (${ps.share_percentage}%): *${fmt(ps.amount)}*`),
      pp.admin_notes ? `\n📝 ${pp.admin_notes}` : "",
      ``,
      `_${site.site_name} — Plataforma de Bingo Bolivia_ 🇧🇴`,
    ].filter(Boolean).join("\n");

    // Build the same HTML used for the PDF so we can share an actual file
    const pdfHtml = (() => {
      const fmt2 = fmt;
      const archiveDate = new Date(pp.created_at).toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const fs: any = pp.finance_snapshot ?? {};
      const netProfit = Number(fs.net_profit ?? pp.net_profit ?? 0);
      const grossRev  = Number(fs.gross_revenue ?? pp.gross_revenue ?? 0);
      const totalPaid = Number(pp.total_paid ?? 0);
      const snap      = snapshot;
      const partnerRows = snap.map((p: any) => `<tr><td><b>${p.name}</b></td><td style="color:#64748b">${p.identifier || "—"}</td><td style="text-align:right;font-weight:bold;color:#7c3aed">${p.share_percentage}%</td><td style="text-align:right;font-weight:900;color:#5b21b6">${fmt2(p.amount)}</td></tr>`).join("");
      return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte — ${pp.period_label}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;padding:32px;font-size:12px}h1{font-size:22px;color:#5b21b6;margin-bottom:4px}.subtitle{color:#64748b;font-size:13px;margin-bottom:24px}table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}th{background:#5b21b6;color:white;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:6px 10px;border-bottom:1px solid #f1f5f9}tr:nth-child(even) td{background:#faf5ff}.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:10px}.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}.kpi{border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center}.kpi-value{font-size:18px;font-weight:900}.kpi-label{font-size:10px;color:#64748b;margin-top:4px;text-transform:uppercase}</style></head><body>
<h1>💰 Reporte Financiero — ${site.site_name}</h1>
<p class="subtitle">Período: <b>${pp.period_label}</b> · Archivado el ${archiveDate}</p>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value" style="color:#16a34a">${fmt2(grossRev)}</div><div class="kpi-label">Ingresos brutos</div></div>
  <div class="kpi" style="background:${netProfit>=0?"#f0fdf4":"#fef2f2"};border-color:${netProfit>=0?"#86efac":"#fca5a5"}"><div class="kpi-value" style="color:${netProfit>=0?"#16a34a":"#dc2626"}">${fmt2(netProfit)}</div><div class="kpi-label">Ganancia neta</div></div>
  <div class="kpi" style="border-color:#c4b5fd"><div class="kpi-value" style="color:#5b21b6">${fmt2(totalPaid)}</div><div class="kpi-label">Total distribuido</div></div>
</div>
${snap.length > 0 ? `<table><thead><tr><th>Socio</th><th>CI / Identificador</th><th style="text-align:right">Porcentaje</th><th style="text-align:right">Monto</th></tr></thead><tbody>${partnerRows}<tr style="background:#ede9fe"><td colspan="3" style="text-align:right;font-weight:900">Total distribuido</td><td style="text-align:right;font-weight:900;color:#5b21b6">${fmt2(totalPaid)}</td></tr></tbody></table>` : ""}
${pp.admin_notes ? `<p style="margin-top:16px;padding:10px;background:#f8f7ff;border-radius:8px;border-left:4px solid #7c3aed;font-size:11px"><b>Nota:</b> ${pp.admin_notes}</p>` : ""}
<div class="footer">${site.site_name} · Todos los montos en bolivianos (Bs) · Documento de uso interno</div>
</body></html>`;
    })();

    // Try Web Share API with file (works on mobile + some desktop browsers)
    const htmlBlob = new Blob([pdfHtml], { type: "text/html" });
    const fileName = `reporte-socios-${pp.period_label.replace(/[\s/]/g, "-")}.html`;
    const file = new File([htmlBlob], fileName, { type: "text/html" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Pago a Socios — ${pp.period_label}`, text: waText });
        return;
      } catch (e: any) {
        if (e?.name !== "AbortError") { /* fall through to manual flow */ }
        else return; // user cancelled
      }
    }

    // PC fallback: download the file + open WhatsApp Web
    const url = URL.createObjectURL(htmlBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    toast.info("📎 Archivo descargado. En WhatsApp Web, hacé clic en el ícono de adjunto (📎) y seleccioná el archivo.", { duration: 7000 });
    setTimeout(() => window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank"), 800);
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
      cash: "Efectivo", bank_transfer: "Transferencia", qr: "📱 QR",
      admin_credit: "✅ Crédito admin", admin_debit: "➖ Débito admin",
    };
    return map[method] ?? method;
  }

  function bingoLabel(n: number): string {
    if (n >= 1 && n <= 15) return `B${n}`;
    if (n >= 16 && n <= 30) return `I${n}`;
    if (n >= 31 && n <= 45) return `N${n}`;
    if (n >= 46 && n <= 60) return `G${n}`;
    return `O${n}`;
  }

  function bingoLetter(n: number): string {
    if (n >= 1 && n <= 15) return "B";
    if (n >= 16 && n <= 30) return "I";
    if (n >= 31 && n <= 45) return "N";
    if (n >= 46 && n <= 60) return "G";
    return "O";
  }

  const BINGO_COL_COLORS: Record<string, string> = {
    B: "#e53e3e", I: "#d69e2e", N: "#38a169", G: "#3182ce", O: "#805ad5",
  };

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

      {/* ── ADMIN HEADER ─────────────────────────────────────────── */}
      <div className="hero-bg px-4 pt-5 pb-0 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-0.5">Panel de Administración</p>
            <h1 className="text-2xl font-black leading-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
              Hola, {user?.full_name?.split(" ")[0] ?? "Admin"} 👋
            </h1>
            <p className="text-white/50 text-xs mt-0.5">{site.site_name} · {new Date().toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <button onClick={() => navigate("/admin/crear-juego")}
            className="shrink-0 flex items-center gap-1.5 text-sm font-black px-4 py-2.5 rounded-2xl transition-transform active:scale-95"
            style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
            <span className="text-base">＋</span> Nuevo juego
          </button>
        </div>

        {/* KPI cards inside header */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-4">
            {[
              { icon: "👥", label: "Usuarios registrados", value: stats.total_users, sub: pendingUsers > 0 ? `${pendingUsers} pendientes` : "al día", subOk: pendingUsers === 0, onClick: () => handleTab("users") },
              { icon: "🎱", label: "Sorteos en vivo", value: stats.active_games, sub: stats.active_games > 0 ? "activos ahora" : "sin actividad", subOk: stats.active_games > 0, onClick: () => handleTab("games") },
              { icon: "💸", label: "Retiros pendientes", value: stats.pending_withdrawals_count, sub: stats.pending_withdrawals_count > 0 ? "requieren acción" : "al día", subOk: stats.pending_withdrawals_count === 0, onClick: () => handleTab("withdrawals") },
              { icon: "💰", label: "Ingresos totales", value: `Bs ${(stats.total_revenue ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, sub: "histórico", subOk: true, onClick: () => handleTab("finance") },
            ].map(s => (
              <button key={s.label} onClick={s.onClick}
                className="text-left rounded-2xl px-3 py-3 transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: s.subOk ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)", color: s.subOk ? "#86efac" : "#fca5a5" }}>
                    {s.sub}
                  </span>
                </div>
                <p className="text-xl font-black leading-none" style={{ fontFamily: "'Poppins', sans-serif" }}>{s.value}</p>
                <p className="text-white/50 text-[10px] mt-1">{s.label}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── TAB NAVIGATION ─────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex overflow-x-auto scrollbar-none"
        style={{ background: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))" }}>
        {ALL_TABS.filter(t => !t.perm || hasPermission(user?.admin_permissions ?? [], t.perm)).map(t => (
          <button key={t.id} onClick={() => handleTab(t.id)}
            className="shrink-0 px-4 py-3 text-xs font-bold transition-colors whitespace-nowrap relative"
            style={{
              color: tab === t.id ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              borderBottom: tab === t.id ? "2px solid hsl(var(--primary))" : "2px solid transparent",
            }}>
            {t.label}
            {t.id === "winners" && winners.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-black text-white"
                style={{ background: "#16a34a" }}>
                {winners.length}
              </span>
            )}
            {t.id === "users" && pendingUsers > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-black text-white"
                style={{ background: "hsl(42 98% 40%)" }}>
                {pendingUsers}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 max-w-5xl mx-auto space-y-4 pb-24">
        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />Cargando...
          </div>
        )}

        {/* ── OVERVIEW ─────────────────────────────── */}
        {tab === "overview" && !loading && (
          <div className="space-y-4">

            {/* Alert banners */}
            <div className="space-y-2">
              {pendingUsers > 0 && (
                <button onClick={() => handleTab("users")} className="w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between gap-3 transition-all active:scale-[0.99]"
                  style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.35)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⏳</span>
                    <div>
                      <p className="font-bold text-sm">{pendingUsers} usuario{pendingUsers !== 1 ? "s" : ""} pendiente{pendingUsers !== 1 ? "s" : ""} de verificación</p>
                      <p className="text-xs text-muted-foreground">Revisar fotos de CI para aprobar o rechazar</p>
                    </div>
                  </div>
                  <span className="text-xs font-black px-3 py-1.5 rounded-xl text-white shrink-0" style={{ background: "hsl(42 98% 40%)" }}>Revisar →</span>
                </button>
              )}
              {pendingWithdrawals > 0 && (
                <button onClick={() => handleTab("withdrawals")} className="w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between gap-3 transition-all active:scale-[0.99]"
                  style={{ background: "hsl(0 75% 52% / 0.08)", border: "1px solid hsl(0 75% 52% / 0.3)" }}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💸</span>
                    <div>
                      <p className="font-bold text-sm">{pendingWithdrawals} retiro{pendingWithdrawals !== 1 ? "s" : ""} esperando pago</p>
                      <p className="text-xs text-muted-foreground">Jugadores esperando su cobro</p>
                    </div>
                  </div>
                  <span className="text-xs font-black px-3 py-1.5 rounded-xl text-white shrink-0" style={{ background: "hsl(0 75% 45%)" }}>Pagar →</span>
                </button>
              )}
            </div>

            {/* Active games — live controls */}
            {games.filter(g => g.status === "active").length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">🔴 Sorteos en vivo</p>
                {games.filter(g => g.status === "active").map(g => (
                  <div key={g.id} className="rounded-2xl overflow-hidden"
                    style={{ background: "linear-gradient(135deg, #1a0050 0%, #3b00b8 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="px-4 pt-4 pb-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="live-badge"><div className="live-dot" />EN VIVO</div>
                          <span className="text-white font-bold text-sm">{g.title}</span>
                          {g.is_featured && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "hsl(42 98% 52% / 0.15)", color: "hsl(42 98% 35%)" }}>⭐ Destacado</span>}
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }}>
                            {{
                              full_card: "🃏 Cartón completo",
                              horizontal: "➡ Línea horizontal",
                              vertical: "⬇ Línea vertical",
                              diagonal: "↗ Diagonal",
                              quina: "📏 Quina",
                              esquinas: "🔲 Esquinas",
                              cruz: "✝ Cruz",
                              x_doble: "✖ X doble",
                            }[g.game_mode as string] ?? g.game_mode}
                          </span>
                          {(g.total_rounds ?? 1) > 1 && (
                            <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                              style={{ background: "hsl(42 98% 52% / 0.2)", color: "hsl(42 98% 60%)" }}>
                              Ronda {g.current_round ?? 1}/{g.total_rounds}
                            </span>
                          )}
                        </div>
                        <span className="text-white/60 text-xs shrink-0">Bs {g.prize_amount} premio</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="shrink-0 w-12 h-10 rounded-xl flex flex-col items-center justify-center font-black leading-none transition-all"
                          style={{
                            background: numberInput[g.id] && parseInt(numberInput[g.id]) >= 1 && parseInt(numberInput[g.id]) <= 75
                              ? BINGO_COL_COLORS[bingoLetter(parseInt(numberInput[g.id]))]
                              : "rgba(255,255,255,0.1)",
                          }}>
                          <span className="text-white text-[11px] font-black">
                            {numberInput[g.id] && parseInt(numberInput[g.id]) >= 1 && parseInt(numberInput[g.id]) <= 75
                              ? bingoLetter(parseInt(numberInput[g.id])) : "?"}
                          </span>
                          <span className="text-white/70 text-[10px]">
                            {numberInput[g.id] && parseInt(numberInput[g.id]) >= 1 && parseInt(numberInput[g.id]) <= 75
                              ? parseInt(numberInput[g.id]) : "—"}
                          </span>
                        </div>
                        <input type="number" min="1" max="75" placeholder="Número 1–75"
                          className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm font-bold border border-white/15 outline-none focus:border-white/40 transition-colors"
                          value={numberInput[g.id] ?? ""}
                          onChange={e => setNumberInput(prev => ({ ...prev, [g.id]: e.target.value }))}
                          onKeyDown={e => e.key === "Enter" && callNumber(g.id)} />
                        <button onClick={() => callNumber(g.id)}
                          className="shrink-0 px-5 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
                          style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
                          🎱 Cantar
                        </button>
                      </div>
                    </div>

                    {/* Called numbers display */}
                    {(g.called_numbers?.length ?? 0) > 0 && (
                      <div className="px-4 pb-3"
                        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="flex items-center gap-3 pt-3">
                          <div className="shrink-0 text-center">
                            <p className="text-white/40 text-[10px] mb-1">Último</p>
                            {(() => {
                              const last = g.called_numbers[g.called_numbers.length - 1];
                              return (
                                <div className="w-12 h-12 rounded-full flex flex-col items-center justify-center font-black leading-none"
                                  style={{ background: BINGO_COL_COLORS[bingoLetter(last)], boxShadow: `0 0 12px ${BINGO_COL_COLORS[bingoLetter(last)]}80` }}>
                                  <span className="text-white text-[10px] font-black">{bingoLetter(last)}</span>
                                  <span className="text-white text-base font-black leading-tight">{last}</span>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white/40 text-[10px] mb-1.5">Cantados ({g.called_numbers.length}/75)</p>
                            <div className="flex flex-wrap gap-1">
                              {[...g.called_numbers].reverse().slice(0, 20).map((n, i) => (
                                <span key={n}
                                  className="h-6 px-1.5 rounded-full flex items-center text-[11px] font-black"
                                  style={{
                                    background: i === 0 ? BINGO_COL_COLORS[bingoLetter(n)] : "rgba(255,255,255,0.12)",
                                    color: "rgba(255,255,255,0.9)",
                                    minWidth: 32,
                                    justifyContent: "center",
                                  }}>
                                  {bingoLabel(n)}
                                </span>
                              ))}
                              {g.called_numbers.length > 20 && (
                                <span className="h-6 px-1.5 rounded-full flex items-center text-[11px] text-white/40"
                                  style={{ background: "rgba(255,255,255,0.07)" }}>
                                  +{g.called_numbers.length - 20}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Historial de rondas anteriores ── */}
                    {(g.round_history?.length ?? 0) > 0 && (() => {
                      const modeLabel: Record<string, string> = {
                        full_card: "Cartón completo", horizontal: "Línea horizontal",
                        vertical: "Línea vertical", diagonal: "Diagonal", quina: "Quina",
                        esquinas: "Esquinas", cruz: "Cruz", x_doble: "X doble",
                      };
                      return (
                        <div className="px-4 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <p className="text-white/40 text-[10px] pt-3 mb-2 font-bold uppercase tracking-widest">Historial de rondas</p>
                          <div className="space-y-2">
                            {g.round_history.map((rh: any) => {
                              const roundCfg = g.rounds?.[rh.round - 1] as any;
                              const roundWinnersForHistory = gameWinners[g.id]?.[rh.round] ?? [];
                              return (
                                <div key={rh.round} className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-white/80 text-[11px] font-black">
                                      Ronda {rh.round}{roundCfg?.game_mode ? ` · ${modeLabel[roundCfg.game_mode] ?? roundCfg.game_mode}` : ""}
                                    </span>
                                    <span className="text-white/40 text-[10px]">{rh.called_numbers.length} bolillos</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mb-1.5">
                                    {rh.called_numbers.slice(0, 15).map((n: number) => (
                                      <span key={n} className="h-5 px-1 rounded-full flex items-center text-[10px] font-black"
                                        style={{ background: BINGO_COL_COLORS[bingoLetter(n)], color: "white", minWidth: 26, justifyContent: "center" }}>
                                        {bingoLabel(n)}
                                      </span>
                                    ))}
                                    {rh.called_numbers.length > 15 && (
                                      <span className="h-5 px-1 rounded-full flex items-center text-[10px] text-white/40"
                                        style={{ background: "rgba(255,255,255,0.07)" }}>+{rh.called_numbers.length - 15}</span>
                                    )}
                                  </div>
                                  {roundWinnersForHistory.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {roundWinnersForHistory.map((w: any) => (
                                        <span key={w.id} className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                          style={{ background: "hsl(42 98% 52% / 0.2)", color: "hsl(42 98% 60%)" }}>
                                          🏆 {w.user_name ?? `#${w.user_id}`}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Ganadores ronda actual ── */}
                    {(() => {
                      const curWinners = gameWinners[g.id]?.[g.current_round ?? 1] ?? [];
                      if (curWinners.length === 0) return null;
                      return (
                        <div className="px-4 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <p className="text-white/40 text-[10px] pt-3 mb-2 font-bold uppercase tracking-widest">🏆 Ganadores ronda {g.current_round ?? 1}</p>
                          <div className="space-y-1.5">
                            {curWinners.map((w: any) => (
                              <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                                style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.25)" }}>
                                <div className="min-w-0">
                                  <p className="text-[12px] font-black leading-tight truncate" style={{ color: "hsl(42 98% 70%)" }}>
                                    🏆 {w.user_name ?? `#${w.user_id}`}
                                  </p>
                                  <p className="text-[10px] text-white/50 mt-0.5">
                                    {w.user_department ?? "Bolivia"} · Puesto #{w.place}
                                  </p>
                                </div>
                                <p className="shrink-0 text-[13px] font-black" style={{ color: "hsl(42 98% 60%)" }}>
                                  Bs {parseFloat(w.prize_amount).toFixed(0)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Footer bar */}
                    <div className="px-4 py-2.5 flex items-center justify-between"
                      style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                      <span className="text-white/50 text-xs">{g.called_numbers?.length ?? 0} números · {g.participant_count} jugadores</span>
                      <div className="flex items-center gap-3">
                        {(g.total_rounds ?? 1) > 1 && (g.current_round ?? 1) < (g.total_rounds ?? 1) ? (
                          <>
                            <button onClick={() => nextRound(g.id)}
                              className="text-sm font-black px-4 py-1.5 rounded-xl transition-all active:scale-95"
                              style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
                              🏁 Completar Ronda {g.current_round ?? 1} →
                            </button>
                            <button onClick={() => finishGame(g.id)} title="Finalizar juego de emergencia"
                              className="text-[11px] font-bold text-red-400/60 hover:text-red-300 transition-colors">⏹</button>
                          </>
                        ) : (
                          <button onClick={() => finishGame(g.id)}
                            className="text-sm font-black px-4 py-1.5 rounded-xl transition-all active:scale-95"
                            style={{ background: "hsl(0 75% 50% / 0.2)", color: "hsl(0 75% 70%)", border: "1px solid hsl(0 75% 50% / 0.3)" }}>
                            ⏹ Finalizar Juego
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Games status grid + financial quick view */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: "🟢", label: "En vivo", value: games.filter(g => g.status === "active").length, color: "#16a34a", bg: "hsl(142 70% 45% / 0.08)", border: "hsl(142 70% 45% / 0.2)", tab: "games" },
                { icon: "🕐", label: "Próximos", value: games.filter(g => g.status === "upcoming").length, color: "hsl(var(--primary))", bg: "hsl(var(--primary) / 0.06)", border: "hsl(var(--primary) / 0.2)", tab: "games" },
                { icon: "✅", label: "Finalizados", value: games.filter(g => g.status === "finished").length, color: "hsl(var(--muted-foreground))", bg: "hsl(var(--muted) / 0.5)", border: "hsl(var(--border))", tab: "games" },
                { icon: "🏆", label: "Ganadores totales", value: stats?.prizes_count ?? 0, color: "#16a34a", bg: "hsl(142 70% 45% / 0.06)", border: "hsl(142 70% 45% / 0.15)", tab: "winners" },
              ].map(s => (
                <button key={s.label} onClick={() => handleTab(s.tab as Tab)}
                  className="text-left rounded-2xl p-4 transition-all active:scale-95"
                  style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                  <p className="text-2xl mb-2">{s.icon}</p>
                  <p className="text-2xl font-black leading-none" style={{ color: s.color, fontFamily: "'Poppins', sans-serif" }}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </button>
              ))}
            </div>

            {/* Department breakdown */}
            {deptStats.length > 0 && (
              <div className="bg-card border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                  <p className="font-black text-sm">📍 Jugadores por departamento</p>
                  <div className="flex gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "hsl(var(--primary))" }} />Activos</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-amber-400" />Pend.</span>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {deptStats.map(d => (
                    <div key={d.department}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold">{d.department}</span>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-black">{d.total}</span>
                          {d.pending > 0 && <span className="px-1.5 py-0.5 rounded-full font-bold" style={{ background: "hsl(42 98% 52% / 0.15)", color: "hsl(42 98% 35%)" }}>{d.pending} pend.</span>}
                          {d.banned > 0 && <span className="px-1.5 py-0.5 rounded-full font-bold" style={{ background: "hsl(0 75% 52% / 0.12)", color: "hsl(0 75% 40%)" }}>{d.banned} ban.</span>}
                        </div>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${(d.total / maxDeptTotal) * 100}%`, background: "linear-gradient(90deg, hsl(var(--primary)), hsl(270 80% 70%))" }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 divide-x" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                  {[
                    { label: "Total", value: deptStats.reduce((s, d) => s + d.total, 0), color: "hsl(var(--primary))" },
                    { label: "Departamentos", value: deptStats.length, color: "hsl(var(--foreground))" },
                    { label: "Saldo total", value: `Bs ${deptStats.reduce((s, d) => s + d.total_balance, 0).toFixed(0)}`, color: "#16a34a" },
                  ].map(stat => (
                    <div key={stat.label} className="text-center py-3">
                      <p className="font-black text-lg" style={{ color: stat.color, fontFamily: "'Poppins', sans-serif" }}>{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
                    </div>
                  ))}
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
                          Bs {parseFloat(u.balance).toFixed(0)}
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
              <div key={g.id} className={`rounded-2xl overflow-hidden ${g.status === "active" ? "" : "bg-card border"}`}
                style={g.status === "active" ? { background: "linear-gradient(135deg, #1a0050 0%, #3b00b8 100%)", border: "1px solid rgba(255,255,255,0.1)" } : {}}>
                <div className={`flex items-start justify-between gap-3 ${g.status === "active" ? "px-4 pt-4 pb-3" : "p-4"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {g.status === "active" && <div className="live-badge"><div className="live-dot" />EN VIVO</div>}
                      <span className={`font-bold ${g.status === "active" ? "text-white text-sm" : ""}`}>{g.title}</span>
                      {g.is_featured && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "hsl(42 98% 52% / 0.15)", color: "hsl(42 98% 35%)" }}>⭐ Destacado</span>}
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={g.status === "active"
                          ? { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }
                          : { background: "hsl(var(--primary)/0.1)", color: "hsl(var(--primary))" }}>
                        {{
                          full_card: "🃏 Cartón completo",
                          horizontal: "➡ Línea horizontal",
                          vertical: "⬇ Línea vertical",
                          diagonal: "↗ Diagonal",
                          quina: "📏 Quina",
                          esquinas: "🔲 Esquinas",
                          cruz: "✝ Cruz",
                          x_doble: "✖ X doble",
                        }[g.game_mode as string] ?? g.game_mode}
                      </span>
                      {g.status === "active" && (g.total_rounds ?? 1) > 1 && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: "hsl(42 98% 52% / 0.2)", color: "hsl(42 98% 60%)" }}>
                          Ronda {g.current_round ?? 1}/{g.total_rounds}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${g.status === "active" ? "text-white/60" : "text-muted-foreground"}`}>
                      Bs {g.prize_amount} premio · {g.participant_count} participantes · {new Date(g.draw_date).toLocaleDateString("es-BO")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {g.status === "upcoming" && (
                      <>
                        <button onClick={() => startGame(g.id)} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: "#16a34a" }}>▶ Iniciar</button>
                        <button onClick={() => navigate(`/admin/editar-juego/${g.id}`)} className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>✏ Editar</button>
                        <button onClick={() => toggleFeatured(g.id, g.is_featured)} className="text-xs font-bold" style={{ color: "hsl(42 98% 40%)" }}>{g.is_featured ? "Quitar destacado" : "⭐ Destacar"}</button>
                        {deleteGameConfirm === g.id ? (
                          <div className="flex gap-1 items-center">
                            <button onClick={() => deleteGame(g.id)} className="px-2 py-1 rounded-lg text-xs font-black text-white" style={{ background: "hsl(0 75% 50%)" }}>Sí, borrar</button>
                            <button onClick={() => setDeleteGameConfirm(null)} className="px-2 py-1 rounded-lg text-xs font-bold border">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteGameConfirm(g.id)} className="text-xs font-bold text-red-500">🗑 Eliminar</button>
                        )}
                      </>
                    )}
                    {/* active: no right-side controls, input goes full-width below */}
                    {g.status === "finished" && (
                      <>
                        <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: "hsl(var(--muted-foreground))" }}>Finalizado</span>
                        <button onClick={() => resetGame(g.id)} className="text-xs font-bold" style={{ color: "#0ea5e9" }}>🔄 Resetear</button>
                        <button onClick={() => reactivateGame(g.id)} className="text-xs font-bold" style={{ color: "#16a34a" }}>♻ Reactivar</button>
                        {deleteGameConfirm === g.id ? (
                          <div className="flex gap-1 items-center">
                            <button onClick={() => deleteGame(g.id)} className="px-2 py-1 rounded-lg text-xs font-black text-white" style={{ background: "hsl(0 75% 50%)" }}>Sí, borrar</button>
                            <button onClick={() => setDeleteGameConfirm(null)} className="px-2 py-1 rounded-lg text-xs font-bold border">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteGameConfirm(g.id)} className="text-xs font-bold text-red-500">🗑 Eliminar</button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* ── Input ancho + cantar (solo juego activo) ── */}
                {g.status === "active" && (
                  <div className="px-4 pb-3"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-2 pt-3">
                      <div className="shrink-0 w-12 h-10 rounded-xl flex flex-col items-center justify-center font-black leading-none transition-all"
                        style={{
                          background: numberInput[g.id] && parseInt(numberInput[g.id]) >= 1 && parseInt(numberInput[g.id]) <= 75
                            ? BINGO_COL_COLORS[bingoLetter(parseInt(numberInput[g.id]))]
                            : "rgba(255,255,255,0.1)",
                        }}>
                        <span className="text-white text-[11px] font-black">
                          {numberInput[g.id] && parseInt(numberInput[g.id]) >= 1 && parseInt(numberInput[g.id]) <= 75
                            ? bingoLetter(parseInt(numberInput[g.id])) : "?"}
                        </span>
                        <span className="text-white/70 text-[10px]">
                          {numberInput[g.id] && parseInt(numberInput[g.id]) >= 1 && parseInt(numberInput[g.id]) <= 75
                            ? parseInt(numberInput[g.id]) : "—"}
                        </span>
                      </div>
                      <input type="number" min="1" max="75" placeholder="Número 1–75"
                        className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm font-bold border border-white/15 outline-none focus:border-white/40 transition-colors"
                        value={numberInput[g.id] ?? ""}
                        onChange={e => setNumberInput(prev => ({ ...prev, [g.id]: e.target.value }))}
                        onKeyDown={e => e.key === "Enter" && callNumber(g.id)} />
                      <button onClick={() => callNumber(g.id)}
                        className="shrink-0 px-5 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
                        style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
                        🎱 Cantar
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Bolillos cantados (solo juego activo) ── */}
                {g.status === "active" && (g.called_numbers?.length ?? 0) > 0 && (
                  <div className="px-4 pb-3"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-3 pt-3">
                      {/* Last called ball */}
                      <div className="shrink-0 text-center">
                        <p className="text-white/40 text-[10px] mb-1">Último</p>
                        {(() => {
                          const last = g.called_numbers[g.called_numbers.length - 1];
                          return (
                            <div className="w-12 h-12 rounded-full flex flex-col items-center justify-center font-black leading-none"
                              style={{ background: BINGO_COL_COLORS[bingoLetter(last)], boxShadow: `0 0 12px ${BINGO_COL_COLORS[bingoLetter(last)]}80` }}>
                              <span className="text-white text-[10px] font-black">{bingoLetter(last)}</span>
                              <span className="text-white text-base font-black leading-tight">{last}</span>
                            </div>
                          );
                        })()}
                      </div>
                      {/* Chips */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white/40 text-[10px] mb-1.5">Cantados ({g.called_numbers.length}/75)</p>
                        <div className="flex flex-wrap gap-1">
                          {[...g.called_numbers].reverse().slice(0, 20).map((n: number, i: number) => (
                            <span key={n}
                              className="h-6 px-1.5 rounded-full flex items-center text-[11px] font-black"
                              style={{
                                background: i === 0 ? BINGO_COL_COLORS[bingoLetter(n)] : "rgba(255,255,255,0.12)",
                                color: "rgba(255,255,255,0.9)",
                                minWidth: 32,
                                justifyContent: "center",
                              }}>
                              {bingoLabel(n)}
                            </span>
                          ))}
                          {g.called_numbers.length > 20 && (
                            <span className="h-6 px-1.5 rounded-full flex items-center text-[11px] text-white/40"
                              style={{ background: "rgba(255,255,255,0.07)" }}>
                              +{g.called_numbers.length - 20}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Historial de rondas anteriores (games tab) ── */}
                {g.status === "active" && (g.round_history?.length ?? 0) > 0 && (() => {
                  const modeLabel: Record<string, string> = {
                    full_card: "Cartón completo", horizontal: "Línea horizontal",
                    vertical: "Línea vertical", diagonal: "Diagonal", quina: "Quina",
                    esquinas: "Esquinas", cruz: "Cruz", x_doble: "X doble",
                  };
                  return (
                    <div className="px-4 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-white/40 text-[10px] pt-3 mb-2 font-bold uppercase tracking-widest">Historial de rondas</p>
                      <div className="space-y-2">
                        {g.round_history.map((rh: any) => {
                          const roundCfg = g.rounds?.[rh.round - 1] as any;
                          const roundWinnersForHistory = gameWinners[g.id]?.[rh.round] ?? [];
                          return (
                            <div key={rh.round} className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-white/80 text-[11px] font-black">
                                  Ronda {rh.round}{roundCfg?.game_mode ? ` · ${modeLabel[roundCfg.game_mode] ?? roundCfg.game_mode}` : ""}
                                </span>
                                <span className="text-white/40 text-[10px]">{rh.called_numbers.length} bolillos</span>
                              </div>
                              <div className="flex flex-wrap gap-1 mb-1.5">
                                {rh.called_numbers.slice(0, 15).map((n: number) => (
                                  <span key={n} className="h-5 px-1 rounded-full flex items-center text-[10px] font-black"
                                    style={{ background: BINGO_COL_COLORS[bingoLetter(n)], color: "white", minWidth: 26, justifyContent: "center" }}>
                                    {bingoLabel(n)}
                                  </span>
                                ))}
                                {rh.called_numbers.length > 15 && (
                                  <span className="h-5 px-1 rounded-full flex items-center text-[10px] text-white/40"
                                    style={{ background: "rgba(255,255,255,0.07)" }}>+{rh.called_numbers.length - 15}</span>
                                )}
                              </div>
                              {roundWinnersForHistory.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {roundWinnersForHistory.map((w: any) => (
                                    <span key={w.id} className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                      style={{ background: "hsl(42 98% 52% / 0.2)", color: "hsl(42 98% 60%)" }}>
                                      🏆 {w.user_name ?? `#${w.user_id}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Ganadores ronda actual (games tab) ── */}
                {g.status === "active" && (() => {
                  const curWinners = gameWinners[g.id]?.[g.current_round ?? 1] ?? [];
                  if (curWinners.length === 0) return null;
                  return (
                    <div className="px-4 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-white/40 text-[10px] pt-3 mb-2 font-bold uppercase tracking-widest">🏆 Ganadores ronda {g.current_round ?? 1}</p>
                      <div className="space-y-1.5">
                        {curWinners.map((w: any) => (
                          <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                            style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.25)" }}>
                            <div className="min-w-0">
                              <p className="text-[12px] font-black leading-tight truncate" style={{ color: "hsl(42 98% 70%)" }}>
                                🏆 {w.user_name ?? `#${w.user_id}`}
                              </p>
                              <p className="text-[10px] text-white/50 mt-0.5">
                                {w.user_department ?? "Bolivia"} · Puesto #{w.place}
                              </p>
                            </div>
                            <p className="shrink-0 text-[13px] font-black" style={{ color: "hsl(42 98% 60%)" }}>
                              Bs {parseFloat(w.prize_amount).toFixed(0)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Footer bar (games tab) */}
                {g.status === "active" && (
                  <div className="px-4 py-2.5 flex items-center justify-between"
                    style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <span className="text-white/50 text-xs">{g.called_numbers?.length ?? 0} números · {g.participant_count} jugadores</span>
                    <div className="flex items-center gap-3">
                      {(g.total_rounds ?? 1) > 1 && (g.current_round ?? 1) < (g.total_rounds ?? 1) ? (
                        <>
                          <button onClick={() => nextRound(g.id)}
                            className="text-sm font-black px-4 py-1.5 rounded-xl transition-all active:scale-95"
                            style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>
                            🏁 Completar Ronda {g.current_round ?? 1} →
                          </button>
                          <button onClick={() => finishGame(g.id)} title="Finalizar juego de emergencia"
                            className="text-[11px] font-bold text-red-400/60 hover:text-red-300 transition-colors">⏹</button>
                        </>
                      ) : (
                        <button onClick={() => finishGame(g.id)}
                          className="text-sm font-black px-4 py-1.5 rounded-xl transition-all active:scale-95"
                          style={{ background: "hsl(0 75% 50% / 0.2)", color: "hsl(0 75% 70%)", border: "1px solid hsl(0 75% 50% / 0.3)" }}>
                          ⏹ Finalizar Juego
                        </button>
                      )}
                    </div>
                  </div>
                )}

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
            {/* QR viewer modal */}
            {viewQrModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}
                onClick={() => setViewQrModal(null)}>
                <div className="bg-white rounded-3xl p-5 max-w-xs w-full" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-black">📱 Código QR del usuario</p>
                    <button onClick={() => setViewQrModal(null)} className="text-muted-foreground">✕</button>
                  </div>
                  <img src={viewQrModal} alt="QR" className="w-full rounded-2xl object-contain max-h-80" />
                </div>
              </div>
            )}

            {/* Approve/Reject action modal */}
            {wdAction && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
                onClick={() => !wdAction.loading && setWdAction(null)}>
                <div className="bg-card rounded-3xl p-5 max-w-sm w-full space-y-4 border" onClick={e => e.stopPropagation()}>
                  <p className="font-black text-base">
                    {wdAction.mode === "approve" ? "✅ Aprobar retiro" : "❌ Rechazar retiro"}
                  </p>

                  {wdAction.mode === "approve" && (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-bold text-muted-foreground mb-1">Comprobante de pago QR <span className="text-muted-foreground font-normal">(opcional)</span></p>
                        <label className="block cursor-pointer border-2 border-dashed rounded-2xl p-3 text-center text-xs text-muted-foreground hover:border-primary transition-colors"
                          style={{ borderColor: wdAction.proof ? "hsl(142 70% 45%)" : undefined }}>
                          {wdAction.proof
                            ? <img src={wdAction.proof} alt="Comprobante" className="w-full max-h-40 object-contain rounded-xl" />
                            : <span>📷 Subir imagen del comprobante</span>}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const reader = new FileReader();
                              reader.onload = ev => setWdAction(a => a ? { ...a, proof: ev.target?.result as string } : null);
                              reader.readAsDataURL(f);
                            }} />
                        </label>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-muted-foreground mb-1">Nota de aprobación <span className="text-muted-foreground font-normal">(opcional)</span></p>
                        <textarea rows={2} placeholder="Ej: Pago realizado el 8/06 a las 14:30" className="input-field text-xs w-full resize-none"
                          value={wdAction.notes}
                          onChange={e => setWdAction(a => a ? { ...a, notes: e.target.value } : null)} />
                      </div>
                    </div>
                  )}

                  {wdAction.mode === "reject" && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground mb-1">Motivo del rechazo <span className="text-red-500">*</span></p>
                      <textarea rows={3} placeholder="Ej: El código QR proporcionado no es válido" className="input-field text-xs w-full resize-none"
                        value={wdAction.notes}
                        onChange={e => setWdAction(a => a ? { ...a, notes: e.target.value } : null)} />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setWdAction(null)} disabled={wdAction.loading}
                      className="flex-1 py-2 rounded-xl text-sm font-bold border transition-all"
                      style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                      Cancelar
                    </button>
                    <button onClick={submitWdAction} disabled={wdAction.loading}
                      className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-all"
                      style={{ background: wdAction.mode === "approve" ? "#16a34a" : "#dc2626", opacity: wdAction.loading ? 0.7 : 1 }}>
                      {wdAction.loading ? "..." : wdAction.mode === "approve" ? "✓ Confirmar pago" : "✗ Rechazar"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {withdrawals.map(w => {
              const isPending = w.status === "pending";
              const isAdminAdj = w.method === "admin_credit" || w.method === "admin_debit";
              const isQr = w.method === "bank_transfer" && (() => { try { return JSON.parse(w.bank_account_info ?? "{}").method === "qr"; } catch { return false; } })();
              const bankInfo = (() => { try { return JSON.parse(w.bank_account_info ?? "{}"); } catch { return {}; } })();
              const statusStyle = w.status === "paid"
                ? { bg: "hsl(142 70% 45% / 0.1)", color: "hsl(142 70% 30%)", label: "✓ Pagado" }
                : w.status === "pending"
                ? { bg: "hsl(42 98% 52% / 0.1)", color: "hsl(42 98% 35%)", label: "⏳ Pendiente" }
                : { bg: "hsl(0 75% 52% / 0.1)", color: "hsl(0 75% 40%)", label: "✗ Rechazado" };

              return (
                <div key={w.id} className="bg-card border rounded-2xl overflow-hidden">
                  {/* Header */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-lg">Bs {parseFloat(w.amount).toFixed(0)}</p>
                          <span className="text-xs px-2.5 py-0.5 rounded-full font-bold"
                            style={{ background: statusStyle.bg, color: statusStyle.color }}>
                            {statusStyle.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Usuario #{w.user_id} · {isQr ? "📱 QR / PagosYa" : bankInfo.method === "bank" ? `🏧 ${bankInfo.bank ?? "Banco"}` : methodLabel(w.method)} · {new Date(w.created_at).toLocaleString("es-BO")}
                        </p>
                      </div>
                    </div>

                    {/* Bank transfer details */}
                    {bankInfo.method === "bank" && (
                      <div className="text-xs rounded-xl px-3 py-2 space-y-0.5"
                        style={{ background: "hsl(var(--muted))" }}>
                        <p><span className="text-muted-foreground">Banco:</span> {bankInfo.bank}</p>
                        {bankInfo.full_name && <p><span className="text-muted-foreground">Titular:</span> {bankInfo.full_name}</p>}
                        {bankInfo.ci && <p><span className="text-muted-foreground">CI:</span> {bankInfo.ci}</p>}
                        {bankInfo.whatsapp && <p><span className="text-muted-foreground">WhatsApp:</span> {bankInfo.whatsapp}</p>}
                      </div>
                    )}

                    {/* Notes */}
                    {w.notes && (
                      <div className="text-xs rounded-xl px-3 py-2"
                        style={{ background: w.status === "rejected" ? "hsl(0 75% 52% / 0.08)" : "hsl(var(--muted))", color: w.status === "rejected" ? "hsl(0 75% 40%)" : undefined }}>
                        {w.status === "rejected" ? "❌ Motivo: " : "📝 "}{w.notes}
                      </div>
                    )}
                  </div>

                  {/* Action row */}
                  {!isAdminAdj && (
                    <div className="px-4 pb-4 flex flex-wrap gap-2">
                      {/* View user QR */}
                      {isQr && w.bank_qr_url && (
                        <button onClick={() => setViewQrModal(w.bank_qr_url)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
                          style={{ borderColor: "hsl(var(--primary) / 0.3)", color: "hsl(var(--primary))" }}>
                          📱 Ver QR del usuario
                        </button>
                      )}

                      {/* View payment proof (if paid) */}
                      {w.status === "paid" && w.payment_proof_url && (
                        <button onClick={() => setViewQrModal(w.payment_proof_url)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
                          style={{ borderColor: "hsl(142 70% 45% / 0.4)", color: "hsl(142 70% 30%)" }}>
                          🧾 Ver comprobante enviado
                        </button>
                      )}

                      {/* Approve / Reject (pending only) */}
                      {isPending && (
                        <>
                          <button onClick={() => setWdAction({ id: w.id, mode: "approve", notes: "", proof: null, loading: false })}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                            style={{ background: "#16a34a" }}>
                            ✓ Aprobar
                          </button>
                          <button onClick={() => setWdAction({ id: w.id, mode: "reject", notes: "", proof: null, loading: false })}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                            style={{ background: "#dc2626" }}>
                            ✗ Rechazar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {withdrawals.length === 0 && <p className="text-center text-muted-foreground py-8">Sin retiros</p>}
          </div>
        )}

        {/* ── WINNERS ────────────────────────────────── */}
        {tab === "winners" && !loading && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-black text-lg">🏆 Ganadores</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {winners.length > 0 ? `${winners.length} ganador${winners.length !== 1 ? "es" : ""}` : "Sin ganadores en este período"}
                  <span className="ml-2 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" /> En tiempo real</span>
                </p>
              </div>
              <button
                onClick={() => { if (winners.length === 0) { toast.error("No hay ganadores para exportar"); return; } exportWinnersJpg(winners); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white shrink-0"
                style={{ background: "linear-gradient(135deg,#7c3aed,#4c1d95)" }}>
                📸 Exportar JPG
              </button>
            </div>

            {/* Date range filter */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
              <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">🔍 Filtrar por fecha</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Desde</label>
                  <input type="date" value={winnersFrom} onChange={e => setWinnersFrom(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm border"
                    style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Hasta</label>
                  <input type="date" value={winnersTo} onChange={e => setWinnersTo(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm"
                    style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                </div>
              </div>
              {(winnersFrom || winnersTo) && (
                <button onClick={() => { setWinnersFrom(""); setWinnersTo(""); }}
                  className="text-xs text-muted-foreground underline">
                  Limpiar filtro
                </button>
              )}
            </div>

            {/* Winners list */}
            {winners.map((w, i) => (
              <div key={w.id} className="bg-card rounded-2xl p-4" style={{ border: "1px solid hsl(var(--border))" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                      style={{ background: i < 3 ? "hsl(42 98% 52%)" : "hsl(var(--muted))", color: i < 3 ? "#1a0050" : "hsl(var(--foreground))" }}>
                      #{i + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-base leading-tight">{w.user_name ?? `Usuario #${w.user_id}`}</p>
                        {w.is_historical && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
                            style={{ background: "hsl(220 60% 50% / 0.12)", color: "hsl(220 60% 50%)", border: "1px solid hsl(220 60% 50% / 0.25)" }}>
                            🗂 Histórico
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        📍 {w.user_department ?? "Bolivia"} · Ronda {w.round}, Puesto #{w.place}
                      </p>
                      <p className="text-xs font-bold mt-1" style={{ color: "hsl(var(--primary))" }}>
                        🎱 {w.game_title ?? `Juego #${w.game_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(w.created_at).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" })}
                        {" · "}{new Date(w.created_at).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-black" style={{ color: "hsl(42 98% 35%)", fontFamily: "'Poppins', sans-serif" }}>
                      Bs {parseFloat(w.prize_amount).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">✅ Acreditado</p>
                  </div>
                </div>
              </div>
            ))}

            {winners.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-5xl mb-3">🏆</p>
                <p className="font-bold">Sin ganadores en este período</p>
                <p className="text-sm mt-1">Cuando un jugador grite BINGO y sea válido, aparecerá aquí automáticamente</p>
              </div>
            )}
          </div>
        )}

        {/* ── FINANCE ─────────────────────────────────── */}
        {tab === "finance" && !loading && (() => {
          const s = financeSummary;
          const fmt = (v: number) => `Bs ${v.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
          const PERIODS = [
            { id: "today", label: "Hoy" },
            { id: "week",  label: "7 días" },
            { id: "month", label: "30 días" },
            { id: "year",  label: "1 año" },
            { id: "all",   label: "Todo" },
          ];
          const typeLabel: Record<string, string> = { ingreso: "Ingreso", premio: "Premio", retiro: "Retiro" };
          const typeStyle: Record<string, string> = { ingreso: "#16a34a", premio: "#b45309", retiro: "#dc2626" };
          const statusLabel: Record<string, string> = { upcoming: "Próximo", active: "Activo", finished: "Finalizado" };
          const typeGameLabel: Record<string, string> = { daily: "Diario", weekly: "Semanal", monthly: "Mensual" };

          const activePartners = partners.filter(p => p.is_active);
          const activeExpensesList = expenses.filter(e => e.is_active);
          const totalPct = activePartners.reduce((sum, p) => sum + parseFloat(p.share_percentage), 0);
          const distributableProfit = s ? (s.distributable_profit ?? s.net_profit) : 0;
          const dividendSnapshot = s ? activePartners.map(p => ({
            partner_id: p.id,
            name: p.name,
            identifier: p.identifier ?? null,
            share_percentage: parseFloat(p.share_percentage),
            amount: Math.round(distributableProfit * parseFloat(p.share_percentage) / 100 * 100) / 100,
          })) : [];
          const FREQ_LABELS: Record<string, string> = { daily: "Diario", weekly: "Semanal", monthly: "Mensual", yearly: "Anual", one_time: "Único" };

          // ── Finance sub-tab helpers ──────────────
          const FTABS = [
            { id: "resumen",      label: "📊 Resumen" },
            { id: "juegos",       label: "🎮 Juegos" },
            { id: "movimientos",  label: "💸 Movimientos" },
            { id: "gastos",       label: "🏭 Gastos" },
            { id: "socios",       label: "🤝 Socios" },
            { id: "historial",    label: "📜 Historial" },
          ] as const;

          return (
            <div className="space-y-3">
              {/* ── Top header ── */}
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-black text-lg">💰 Finanzas</h2>
                <button onClick={() => downloadFinancePDF()}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shrink-0"
                  style={{ background: "#5b21b6" }}>
                  ⬇ PDF
                </button>
              </div>

              {/* ── Period selector (always visible) ── */}
              <div className="rounded-2xl p-3 space-y-2.5" style={{ background: "hsl(var(--muted)/0.4)", border: "1px solid hsl(var(--border))" }}>
                <div className="flex gap-1.5 flex-wrap">
                  {PERIODS.map(p => (
                    <button key={p.id} onClick={() => loadFinanceWithPeriod(p.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: financePeriod === p.id ? "hsl(var(--primary))" : "hsl(var(--background))",
                        color: financePeriod === p.id ? "white" : "hsl(var(--foreground))",
                        border: `1px solid ${financePeriod === p.id ? "transparent" : "hsl(var(--border))"}`,
                      }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-0.5">
                    <label className="text-[11px] text-muted-foreground font-medium">Desde</label>
                    <input type="date" className="input-field text-xs py-1.5" value={financeFrom}
                      onChange={e => setFinanceFrom(e.target.value)} />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <label className="text-[11px] text-muted-foreground font-medium">Hasta</label>
                    <input type="date" className="input-field text-xs py-1.5" value={financeTo}
                      onChange={e => setFinanceTo(e.target.value)} />
                  </div>
                  <button
                    onClick={() => { if (financeFrom) loadFinanceWithPeriod("custom", financeFrom, financeTo || undefined); else toast.error("Ingresa al menos la fecha de inicio"); }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                    style={{ background: financePeriod === "custom" ? "hsl(var(--primary))" : "#64748b" }}>
                    Buscar
                  </button>
                </div>
              </div>

              {/* ── Sub-tab nav ── */}
              <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                {FTABS.map(ft => (
                  <button key={ft.id} onClick={() => setFinanceTab(ft.id)}
                    className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
                    style={{
                      background: financeTab === ft.id ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      color: financeTab === ft.id ? "white" : "hsl(var(--muted-foreground))",
                    }}>
                    {ft.label}
                    {ft.id === "historial" && partnerPayments.length > 0 && (
                      <span className="ml-1 px-1 py-0.5 rounded-full text-[9px] font-black"
                        style={{ background: financeTab === ft.id ? "rgba(255,255,255,0.25)" : "hsl(var(--primary)/0.15)", color: financeTab === ft.id ? "white" : "hsl(var(--primary))" }}>
                        {partnerPayments.length}
                      </span>
                    )}
                    {ft.id === "gastos" && activeExpensesList.length > 0 && (
                      <span className="ml-1 px-1 py-0.5 rounded-full text-[9px] font-black"
                        style={{ background: financeTab === ft.id ? "rgba(255,255,255,0.25)" : "hsl(0 75% 50% / 0.15)", color: financeTab === ft.id ? "white" : "#dc2626" }}>
                        {activeExpensesList.length}
                      </span>
                    )}
                    {ft.id === "socios" && activePartners.length > 0 && (
                      <span className="ml-1 px-1 py-0.5 rounded-full text-[9px] font-black"
                        style={{ background: financeTab === ft.id ? "rgba(255,255,255,0.25)" : "hsl(var(--primary)/0.15)", color: financeTab === ft.id ? "white" : "hsl(var(--primary))" }}>
                        {activePartners.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ════════════════════════════════════════════
                  TAB: RESUMEN
              ════════════════════════════════════════════ */}
              {financeTab === "resumen" && (
                <div className="space-y-3">
                  {!s && <p className="text-center text-muted-foreground py-8">Sin datos para el período seleccionado</p>}
                  {s && (
                    <>
                      {/* KPI grid 2-col */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-card border rounded-2xl p-4">
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide">💰 Ingresos brutos</p>
                          <p className="text-xl font-black mt-1" style={{ color: "#16a34a" }}>{fmt(s.gross_revenue)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.cards_sold} cartones vendidos</p>
                        </div>
                        <div className="bg-card border rounded-2xl p-4">
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide">🏆 Premios pagados</p>
                          <p className="text-xl font-black mt-1" style={{ color: "#b45309" }}>{fmt(s.prizes_paid)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.prizes_count} ganador{s.prizes_count !== 1 ? "es" : ""}</p>
                        </div>
                        <div className="bg-card border rounded-2xl p-4">
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide">💸 Retiros pagados</p>
                          <p className="text-xl font-black mt-1" style={{ color: "#dc2626" }}>{fmt(s.withdrawals_paid)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.withdrawals_count} retiro{s.withdrawals_count !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="bg-card border rounded-2xl p-4" style={{ borderColor: s.pending_withdrawals_count > 0 ? "hsl(42 98% 52%)" : undefined }}>
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide">⏳ Retiros pendientes</p>
                          <p className="text-xl font-black mt-1" style={{ color: "#f59e0b" }}>{fmt(s.pending_withdrawals)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.pending_withdrawals_count} solicitud{s.pending_withdrawals_count !== 1 ? "es" : ""}</p>
                        </div>
                        <div className="bg-card border rounded-2xl p-4">
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide">🔗 Comisiones activadores</p>
                          <p className="text-xl font-black mt-1" style={{ color: "#6d28d9" }}>{fmt(s.total_commissions_paid ?? 0)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.commissions_count ?? 0} pago{(s.commissions_count ?? 0) !== 1 ? "s" : ""} de comisión</p>
                        </div>
                        <div className="bg-card border rounded-2xl p-4">
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide">🎁 Bonos otorgados</p>
                          <p className="text-xl font-black mt-1" style={{ color: "#b45309" }}>{fmt(s.total_bonuses_granted ?? 0)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.bonuses_count ?? 0} bono{(s.bonuses_count ?? 0) !== 1 ? "s" : ""} de bienvenida</p>
                        </div>
                        <div className="bg-card border rounded-2xl p-4">
                          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wide">👛 Saldo en circulación</p>
                          <p className="text-xl font-black mt-1" style={{ color: "#7c3aed" }}>{fmt(s.balance_in_circulation)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.users_with_balance} usuarios con saldo</p>
                        </div>
                        <div className="bg-card border-2 rounded-2xl p-4"
                          style={{ borderColor: s.net_profit >= 0 ? "#86efac" : "#fca5a5", background: s.net_profit >= 0 ? "hsl(142 70% 98%)" : "hsl(0 75% 98%)" }}>
                          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: s.net_profit >= 0 ? "#16a34a" : "#dc2626" }}>📈 Ganancia neta</p>
                          <p className="text-2xl font-black mt-1" style={{ color: s.net_profit >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(s.net_profit)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Ingresos − Premios − Retiros − Comisiones − Bonos</p>
                        </div>
                      </div>

                      {/* Quick nav hints */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { tab: "juegos" as const, label: "Ver juegos", count: financeGames.length, color: "#16a34a" },
                          { tab: "movimientos" as const, label: "Ver movimientos", count: financeTransactions.length, color: "#64748b" },
                          { tab: "socios" as const, label: "Ver dividendos", count: activePartners.length, color: "#7c3aed" },
                        ].map(q => (
                          <button key={q.tab} onClick={() => setFinanceTab(q.tab)}
                            className="rounded-xl py-2 px-2 text-center border transition-all"
                            style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
                            <p className="font-black text-sm" style={{ color: q.color }}>{q.count}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">{q.label}</p>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ════════════════════════════════════════════
                  TAB: JUEGOS
              ════════════════════════════════════════════ */}
              {financeTab === "juegos" && (
                <div className="space-y-2">
                  {financeGames.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 text-sm">Sin juegos en el período seleccionado</p>
                  )}
                  {financeGames.map(g => (
                    <div key={g.id} className="bg-card border rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{g.title}</p>
                          <p className="text-xs text-muted-foreground">{typeGameLabel[g.type] ?? g.type} · {statusLabel[g.status] ?? g.status} · {g.cards_sold} cartones</p>
                        </div>
                        <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: g.net >= 0 ? "hsl(142 70% 45% / 0.12)" : "hsl(0 75% 50% / 0.1)", color: g.net >= 0 ? "#16a34a" : "#dc2626" }}>
                          {g.net >= 0 ? "+" : ""}{fmt(g.net)}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                        <div className="text-center rounded-lg py-1.5" style={{ background: "hsl(142 70% 45% / 0.06)" }}>
                          <p className="font-bold" style={{ color: "#16a34a" }}>{fmt(g.revenue)}</p>
                          <p className="text-muted-foreground">Ingresos</p>
                        </div>
                        <div className="text-center rounded-lg py-1.5" style={{ background: "hsl(42 98% 52% / 0.06)" }}>
                          <p className="font-bold" style={{ color: "#b45309" }}>{fmt(g.prizes_paid)}</p>
                          <p className="text-muted-foreground">Premios</p>
                        </div>
                        <div className="text-center rounded-lg py-1.5" style={{ background: "hsl(var(--muted)/0.5)" }}>
                          <p className="font-bold">{fmt(g.card_price)}</p>
                          <p className="text-muted-foreground">Precio/cartón</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ════════════════════════════════════════════
                  TAB: MOVIMIENTOS
              ════════════════════════════════════════════ */}
              {financeTab === "movimientos" && (() => {
                const q = txSearch.trim().toLowerCase();
                const txFiltered = financeTransactions.filter(t =>
                  !q ||
                  t.user_name?.toLowerCase().includes(q) ||
                  t.description?.toLowerCase().includes(q) ||
                  t.game_title?.toLowerCase().includes(q) ||
                  (typeLabel[t.type] ?? t.type).toLowerCase().includes(q)
                );
                const txVisible = txFiltered.slice(0, 10);
                return (
                  <div className="space-y-2">
                    {/* Search */}
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">🔍</span>
                      <input
                        className="w-full border rounded-xl pl-7 pr-3 py-2 text-xs bg-background"
                        placeholder="Buscar por usuario, descripción, juego o tipo…"
                        value={txSearch}
                        onChange={e => setTxSearch(e.target.value)}
                      />
                      {txSearch && (
                        <button onClick={() => setTxSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold px-1">
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Count */}
                    {financeTransactions.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {q ? `${txFiltered.length} resultado${txFiltered.length !== 1 ? "s" : ""}` : `Últimos ${Math.min(10, financeTransactions.length)} de ${financeTransactions.length} movimiento${financeTransactions.length !== 1 ? "s" : ""}`}
                      </p>
                    )}

                    {financeTransactions.length === 0 && (
                      <p className="text-center text-muted-foreground py-8 text-sm">Sin movimientos en el período seleccionado</p>
                    )}
                    {txFiltered.length === 0 && financeTransactions.length > 0 && (
                      <p className="text-center text-muted-foreground py-6 text-sm">Sin resultados para "{txSearch}"</p>
                    )}

                    {/* List (max 10) */}
                    {txVisible.map((t, i) => (
                      <div key={i} className="bg-card border rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black px-2 py-0.5 rounded-full text-white"
                              style={{ background: typeStyle[t.type] ?? "#64748b" }}>
                              {typeLabel[t.type] ?? t.type}
                            </span>
                            <p className="text-xs font-bold truncate">{t.user_name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}{t.game_title ? ` · ${t.game_title}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <p className="shrink-0 font-black text-sm" style={{ color: typeStyle[t.type] ?? "#64748b" }}>
                          {t.type === "ingreso" ? "+" : "−"}{fmt(t.amount)}
                        </p>
                      </div>
                    ))}

                    {/* Note when truncated without search */}
                    {!q && financeTransactions.length > 10 && (
                      <p className="text-center text-xs text-muted-foreground pt-1">
                        Usa el buscador para encontrar movimientos específicos
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* ════════════════════════════════════════════
                  TAB: GASTOS
              ════════════════════════════════════════════ */}
              {financeTab === "gastos" && (
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
                  <div className="flex items-center justify-between px-4 py-3"
                    style={{ background: "hsl(0 75% 50% / 0.06)", borderBottom: "1px solid hsl(var(--border))" }}>
                    <div>
                      <p className="font-black text-sm">🏭 Gastos Operativos</p>
                      {s && (s.total_expenses ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Período: <span className="font-bold" style={{ color: "#dc2626" }}>−{fmt(s.total_expenses ?? 0)}</span>
                        </p>
                      )}
                    </div>
                    <button onClick={() => { setShowExpenseForm(true); setEditingExpense(null); setExpenseForm({ name: "", amount: "", frequency: "monthly", notes: "" }); }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold text-white"
                      style={{ background: "#dc2626" }}>
                      + Agregar gasto
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    {showExpenseForm && (
                      <div className="rounded-xl p-3 space-y-2" style={{ background: "hsl(0 75% 50% / 0.04)", border: "1px solid hsl(0 75% 50% / 0.2)" }}>
                        <p className="text-xs font-black">{editingExpense ? "Editar gasto" : "Nuevo gasto operativo"}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2 space-y-0.5">
                            <label className="text-[11px] text-muted-foreground">Nombre *</label>
                            <input className="input-field text-xs py-1.5" placeholder="Ej: Hosting web, Energía eléctrica" value={expenseForm.name}
                              onChange={e => setExpenseForm(f => ({ ...f, name: e.target.value }))} />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[11px] text-muted-foreground">Monto (Bs) *</label>
                            <input type="number" min="0" step="0.01" className="input-field text-xs py-1.5" placeholder="Ej: 211.50" value={expenseForm.amount}
                              onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[11px] text-muted-foreground">Frecuencia *</label>
                            <select className="input-field text-xs py-1.5" value={expenseForm.frequency}
                              onChange={e => setExpenseForm(f => ({ ...f, frequency: e.target.value }))}>
                              <option value="daily">Diario</option>
                              <option value="weekly">Semanal</option>
                              <option value="monthly">Mensual</option>
                              <option value="yearly">Anual</option>
                              <option value="one_time">Pago único</option>
                            </select>
                          </div>
                          <div className="col-span-2 space-y-0.5">
                            <label className="text-[11px] text-muted-foreground">Notas (opcional)</label>
                            <input className="input-field text-xs py-1.5" placeholder="Ej: USD 30 = Bs 211.50 al cambio de hoy" value={expenseForm.notes}
                              onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))} />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={saveExpense} disabled={savingExpense}
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                            style={{ background: "#dc2626" }}>
                            {savingExpense ? "..." : editingExpense ? "Guardar cambios" : "Agregar gasto"}
                          </button>
                          <button onClick={() => { setShowExpenseForm(false); setEditingExpense(null); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={{ background: "hsl(var(--muted))" }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {activeExpensesList.length === 0 && !showExpenseForm && (
                      <p className="text-xs text-center text-muted-foreground py-3">Sin gastos configurados. Los gastos se descuentan de la ganancia neta antes de calcular dividendos.</p>
                    )}

                    {activeExpensesList.map(exp => (
                      <div key={exp.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: "hsl(var(--muted)/0.5)", border: "1px solid hsl(var(--border))" }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm">{exp.name}</p>
                            <span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: "#dc2626" }}>
                              {FREQ_LABELS[exp.frequency] ?? exp.frequency}
                            </span>
                          </div>
                          <p className="text-xs font-bold mt-0.5" style={{ color: "#dc2626" }}>Bs {parseFloat(exp.amount).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                          {exp.notes && <p className="text-xs text-muted-foreground">{exp.notes}</p>}
                          {s && (s.expenses_detail ?? []).find((d: any) => d.id === exp.id) && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Este período: <span className="font-bold" style={{ color: "#dc2626" }}>
                                −{fmt((s.expenses_detail as any[]).find((d: any) => d.id === exp.id)?.amount_prorated ?? 0)}
                              </span>
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingExpense(exp); setExpenseForm({ name: exp.name, amount: String(parseFloat(exp.amount)), frequency: exp.frequency, notes: exp.notes ?? "" }); setShowExpenseForm(true); }}
                            className="text-[11px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: "hsl(var(--primary)/0.1)", color: "hsl(var(--primary))" }}>
                            Editar
                          </button>
                          <button onClick={() => deleteExpense(exp)}
                            className="text-[11px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: "hsl(0 75% 50% / 0.1)", color: "#dc2626" }}>
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}

                    {expenses.filter(e => !e.is_active).length > 0 && (
                      <details className="text-xs">
                        <summary className="text-muted-foreground cursor-pointer select-none">
                          {expenses.filter(e => !e.is_active).length} gasto(s) desactivado(s)
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          {expenses.filter(e => !e.is_active).map(exp => (
                            <div key={exp.id} className="flex items-center justify-between px-3 py-2 rounded-lg opacity-50"
                              style={{ background: "hsl(var(--muted)/0.3)", border: "1px solid hsl(var(--border))" }}>
                              <span>{exp.name} — {FREQ_LABELS[exp.frequency]} — Bs {parseFloat(exp.amount).toFixed(0)}</span>
                              <button onClick={() => reactivateExpense(exp)}
                                className="px-1.5 py-0.5 rounded text-[11px] font-bold"
                                style={{ background: "#16a34a", color: "white" }}>
                                Reactivar
                              </button>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════════════
                  TAB: SOCIOS
              ════════════════════════════════════════════ */}
              {financeTab === "socios" && (
                <div className="space-y-3">
                  {/* Partner list header */}
                  <div className="flex items-center justify-between">
                    <p className="font-black text-sm">🤝 Socios activos</p>
                    <button onClick={() => { setShowPartnerForm(true); setEditingPartner(null); setPartnerForm({ name: "", identifier: "", phone: "", sharePercentage: "", notes: "" }); }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold"
                      style={{ background: "hsl(var(--primary))", color: "white" }}>
                      + Agregar socio
                    </button>
                  </div>

                  {showPartnerForm && (
                    <div className="rounded-xl p-3 space-y-2" style={{ background: "hsl(var(--primary)/0.04)", border: "1px solid hsl(var(--primary)/0.2)" }}>
                      <p className="text-xs font-black">{editingPartner ? "Editar socio" : "Nuevo socio"}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2 space-y-0.5">
                          <label className="text-[11px] text-muted-foreground">Nombre completo *</label>
                          <input className="input-field text-xs py-1.5" placeholder="Ej: Juan Mamani" value={partnerForm.name}
                            onChange={e => setPartnerForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[11px] text-muted-foreground">CI / Email</label>
                          <input className="input-field text-xs py-1.5" placeholder="12345678" value={partnerForm.identifier}
                            onChange={e => setPartnerForm(f => ({ ...f, identifier: e.target.value }))} />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[11px] text-muted-foreground">Porcentaje (%) *</label>
                          <input type="number" min="0.01" max="100" step="0.01" className="input-field text-xs py-1.5" placeholder="Ej: 33.33" value={partnerForm.sharePercentage}
                            onChange={e => setPartnerForm(f => ({ ...f, sharePercentage: e.target.value }))} />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[11px] text-muted-foreground">Teléfono</label>
                          <input className="input-field text-xs py-1.5" placeholder="70012345" value={partnerForm.phone}
                            onChange={e => setPartnerForm(f => ({ ...f, phone: e.target.value }))} />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[11px] text-muted-foreground">Notas</label>
                          <input className="input-field text-xs py-1.5" placeholder="Opcional" value={partnerForm.notes}
                            onChange={e => setPartnerForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={savePartner} disabled={savingPartner}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                          style={{ background: "hsl(var(--primary))" }}>
                          {savingPartner ? "..." : editingPartner ? "Guardar cambios" : "Agregar socio"}
                        </button>
                        <button onClick={() => { setShowPartnerForm(false); setEditingPartner(null); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold"
                          style={{ background: "hsl(var(--muted))" }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {activePartners.length === 0 && !showPartnerForm && (
                    <p className="text-xs text-center text-muted-foreground py-4">Sin socios activos. Agrega uno para calcular dividendos.</p>
                  )}

                  {activePartners.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: "hsl(var(--muted)/0.5)", border: "1px solid hsl(var(--border))" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm">{p.name}</p>
                          <span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ background: "#7c3aed" }}>
                            {parseFloat(p.share_percentage)}%
                          </span>
                        </div>
                        {p.identifier && <p className="text-xs text-muted-foreground">CI: {p.identifier}</p>}
                        {p.phone && <p className="text-xs text-muted-foreground">📱 {p.phone}</p>}
                      </div>
                      <div className="text-right">
                        {s && <p className="font-black text-sm" style={{ color: "#7c3aed" }}>{fmt(distributableProfit * parseFloat(p.share_percentage) / 100)}</p>}
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => { setEditingPartner(p); setPartnerForm({ name: p.name, identifier: p.identifier ?? "", phone: p.phone ?? "", sharePercentage: String(parseFloat(p.share_percentage)), notes: p.notes ?? "" }); setShowPartnerForm(true); }}
                            className="text-[11px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: "hsl(var(--primary)/0.1)", color: "hsl(var(--primary))" }}>
                            Editar
                          </button>
                          <button onClick={() => deletePartner(p)}
                            className="text-[11px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: "hsl(0 75% 50% / 0.1)", color: "#dc2626" }}>
                            🗑️ Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {activePartners.length > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs"
                      style={{ background: Math.abs(totalPct - 100) < 0.01 ? "hsl(142 70% 45% / 0.08)" : "hsl(42 98% 52% / 0.1)", border: `1px solid ${Math.abs(totalPct - 100) < 0.01 ? "hsl(142 70% 45% / 0.3)" : "hsl(42 98% 52% / 0.4)"}` }}>
                      <span className="font-bold">Total porcentajes</span>
                      <span className="font-black" style={{ color: Math.abs(totalPct - 100) < 0.01 ? "#16a34a" : "#b45309" }}>{totalPct.toFixed(2)}%</span>
                    </div>
                  )}

                  {s && activePartners.length > 0 && (
                    <div className="rounded-xl p-3 space-y-2" style={{ background: "hsl(var(--primary)/0.04)", border: "1px solid hsl(var(--primary)/0.2)" }}>
                      <p className="text-xs font-black">📊 Calculadora de dividendos</p>

                      <div className="rounded-lg p-2 space-y-1 text-xs" style={{ background: "hsl(var(--muted)/0.5)" }}>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ganancia neta del período</span>
                          <span className="font-bold" style={{ color: s.net_profit >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(s.net_profit)}</span>
                        </div>
                        {((s.total_commissions_paid ?? 0) > 0 || (s.total_bonuses_granted ?? 0) > 0) && (
                          <div className="pl-3 space-y-0.5">
                            <p className="text-[10px] text-muted-foreground italic">Incluye costos del programa de activadores:</p>
                            {(s.total_commissions_paid ?? 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">↳ Comisiones activadores ({s.commissions_count ?? 0})</span>
                                <span style={{ color: "#6d28d9" }}>−{fmt(s.total_commissions_paid ?? 0)}</span>
                              </div>
                            )}
                            {(s.total_bonuses_granted ?? 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">↳ Bonos de bienvenida ({s.bonuses_count ?? 0})</span>
                                <span style={{ color: "#b45309" }}>−{fmt(s.total_bonuses_granted ?? 0)}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {(s.total_expenses ?? 0) > 0 && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground font-bold">Gastos operativos</span>
                              <span className="font-bold" style={{ color: "#dc2626" }}>−{fmt(s.total_expenses)}</span>
                            </div>
                            {(s.expenses_detail as any[]).map((ed: any) => (
                              <div key={ed.id} className="flex justify-between pl-3">
                                <span className="text-muted-foreground">↳ {ed.name} <span className="opacity-60">({FREQ_LABELS[ed.frequency]})</span></span>
                                <span className="font-bold" style={{ color: "#dc2626" }}>−{fmt(ed.amount_prorated)}</span>
                              </div>
                            ))}
                          </>
                        )}
                        {(s.committed_prizes ?? 0) > 0 && (
                          <>
                            <div className="flex justify-between">
                              <span className="font-bold" style={{ color: "#b45309" }}>🔒 Premios comprometidos</span>
                              <span className="font-bold" style={{ color: "#b45309" }}>−{fmt(s.committed_prizes)}</span>
                            </div>
                            {(s.committed_prizes_detail as any[]).map((g: any) => (
                              <div key={g.id} className="flex justify-between pl-3">
                                <span className="text-muted-foreground">↳ {g.title}</span>
                                <span className="font-bold" style={{ color: "#b45309" }}>−{fmt(g.prize_amount)}</span>
                              </div>
                            ))}
                            <p className="pl-3 text-[10px] text-muted-foreground italic">Reservado para sorteos activos/próximos sin ganador validado</p>
                          </>
                        )}
                        {((s.total_expenses ?? 0) > 0 || (s.committed_prizes ?? 0) > 0) && (
                          <div className="flex justify-between border-t pt-1 font-black">
                            <span>Monto distribuible</span>
                            <span style={{ color: distributableProfit >= 0 ? "#5b21b6" : "#dc2626" }}>{fmt(distributableProfit)}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {dividendSnapshot.map(ds => (
                          <div key={ds.partner_id} className="flex justify-between text-xs items-center">
                            <span className="font-bold">{ds.name} <span className="text-muted-foreground font-normal">({ds.share_percentage}%)</span></span>
                            <span className="font-black" style={{ color: "#7c3aed" }}>{fmt(ds.amount)}</span>
                          </div>
                        ))}
                        <div className="border-t pt-1 flex justify-between text-xs font-black">
                          <span>Total a distribuir</span>
                          <span style={{ color: "#5b21b6" }}>{fmt(dividendSnapshot.reduce((a, d) => a + d.amount, 0))}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Notas del pago (opcional)</label>
                        <input className="input-field text-xs py-1.5" placeholder="Ej: Pago correspondiente a junio 2026"
                          value={partnerPaymentNotes} onChange={e => setPartnerPaymentNotes(e.target.value)} />
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => registerPartnerPayment(dividendSnapshot)} disabled={savingPartnerPayment || activePartners.length === 0}
                          className="flex-1 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                          style={{ background: "#5b21b6" }}>
                          {savingPartnerPayment ? "Registrando..." : "✅ Registrar y archivar pago"}
                        </button>
                        <button onClick={() => downloadFinancePDF(dividendSnapshot)}
                          className="px-3 py-2 rounded-lg text-xs font-bold"
                          style={{ background: "hsl(var(--muted))" }}>
                          ⬇ PDF con socios
                        </button>
                      </div>
                    </div>
                  )}

                  {partners.filter(p => !p.is_active).length > 0 && (
                    <details className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
                      <summary className="px-4 py-2.5 text-xs font-bold text-muted-foreground cursor-pointer"
                        style={{ background: "hsl(var(--muted)/0.3)" }}>
                        Socios inactivos ({partners.filter(p => !p.is_active).length})
                      </summary>
                      <div className="p-3 space-y-2">
                        {partners.filter(p => !p.is_active).map(p => (
                          <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl opacity-60"
                            style={{ background: "hsl(var(--muted)/0.4)" }}>
                            <div>
                              <p className="font-bold text-xs">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{parseFloat(p.share_percentage)}%{p.identifier ? ` · ${p.identifier}` : ""}</p>
                            </div>
                            <button onClick={() => togglePartnerActive(p)}
                              className="text-[11px] px-2 py-0.5 rounded font-bold"
                              style={{ background: "hsl(142 70% 45% / 0.1)", color: "#16a34a" }}>
                              Reactivar
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* ════════════════════════════════════════════
                  TAB: HISTORIAL
              ════════════════════════════════════════════ */}
              {financeTab === "historial" && (() => {
                const hasFilter = !!(ppFrom || ppTo);
                const filtered = partnerPayments.filter(pp => {
                  const d = new Date(pp.created_at);
                  if (ppFrom && d < new Date(ppFrom)) return false;
                  if (ppTo) { const to = new Date(ppTo); to.setHours(23,59,59,999); if (d > to) return false; }
                  return true;
                });
                const visible = hasFilter ? filtered : filtered.slice(0, 6);
                return (
                  <div className="space-y-3">
                    {partnerPayments.length === 0 && (
                      <p className="text-center text-muted-foreground py-10 text-sm">Sin pagos a socios registrados aún</p>
                    )}

                    {partnerPayments.length > 0 && (
                      <>
                        {/* Date filter */}
                        <div className="rounded-xl p-3 space-y-2" style={{ background: "hsl(var(--muted)/0.4)", border: "1px solid hsl(var(--border))" }}>
                          <p className="text-xs font-bold text-muted-foreground">🔍 Filtrar por fecha</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[11px] text-muted-foreground mb-1">Desde</p>
                              <input type="date" value={ppFrom} onChange={e => setPpFrom(e.target.value)}
                                className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background" />
                            </div>
                            <div>
                              <p className="text-[11px] text-muted-foreground mb-1">Hasta</p>
                              <input type="date" value={ppTo} onChange={e => setPpTo(e.target.value)}
                                className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background" />
                            </div>
                          </div>
                          {hasFilter && (
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-muted-foreground">{filtered.length} registro{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}</p>
                              <button onClick={() => { setPpFrom(""); setPpTo(""); }} className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>
                                Limpiar
                              </button>
                            </div>
                          )}
                        </div>

                        {filtered.length === 0 && (
                          <p className="text-center text-muted-foreground text-sm py-6">Sin registros en ese rango de fechas</p>
                        )}

                        {/* Count hint */}
                        {filtered.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {hasFilter
                              ? `${filtered.length} registro${filtered.length !== 1 ? "s" : ""} en el rango`
                              : `Últimos ${visible.length} de ${partnerPayments.length} — usá el filtro para ver por fecha`}
                          </p>
                        )}

                        {visible.map(pp => (
                          <div key={pp.id} className="bg-card border rounded-xl p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-bold text-sm">{pp.period_label}</p>
                                <p className="text-xs text-muted-foreground">{new Date(pp.created_at).toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric" })}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-black text-sm" style={{ color: "#5b21b6" }}>{fmt(pp.total_paid)}</p>
                                <p className="text-xs text-muted-foreground">distribuido</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              <div className="rounded-lg px-2 py-1" style={{ background: "hsl(142 70% 45% / 0.08)" }}>
                                <p className="text-muted-foreground">Ingresos brutos</p>
                                <p className="font-bold" style={{ color: "#16a34a" }}>{fmt(pp.gross_revenue)}</p>
                              </div>
                              <div className="rounded-lg px-2 py-1" style={{ background: pp.net_profit < 0 ? "hsl(0 75% 52% / 0.08)" : "hsl(var(--primary)/0.06)" }}>
                                <p className="text-muted-foreground">Ganancia neta</p>
                                <p className="font-bold" style={{ color: pp.net_profit < 0 ? "#dc2626" : "#5b21b6" }}>{fmt(pp.net_profit)}</p>
                              </div>
                            </div>
                            {Array.isArray(pp.partners_snapshot) && pp.partners_snapshot.length > 0 && (
                              <div className="space-y-1 border-t pt-1.5">
                                {(pp.partners_snapshot as any[]).map((ps: any, i: number) => (
                                  <div key={i} className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">{ps.name} ({ps.share_percentage}%)</span>
                                    <span className="font-bold" style={{ color: "#7c3aed" }}>{fmt(ps.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {pp.admin_notes && <p className="text-xs text-muted-foreground italic border-t pt-1">{pp.admin_notes}</p>}
                            <div className="pt-1 border-t">
                              <button onClick={() => downloadPartnerPaymentPDF(pp)}
                                className="w-full py-1.5 rounded-lg text-xs font-bold border transition-all"
                                style={{ borderColor: "hsl(var(--primary)/0.3)", color: "hsl(var(--primary))", background: "hsl(var(--primary)/0.06)" }}>
                                ⬇ Descargar PDF
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}

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

        {/* ── REFERIDOS ───────────────────────────────── */}
        {tab === "referidos" && !loading && (() => {
          const pendingReqs = activatorRequests.filter(r => r.status === "pending");
          const acceptedReqs = activatorRequests.filter(r => r.status === "accepted");
          const rejectedReqs = activatorRequests.filter(r => r.status === "rejected" || r.status === "hold");

          async function reviewRequest(id: number, action: "accept" | "reject" | "hold" | "suspend", notes?: string) {
            const r = await fetch(`${BASE}/api/admin/activator-requests/${id}/review`, {
              method: "POST",
              headers: authH(),
              body: JSON.stringify({ action, notes }),
            });
            if (r.ok) {
              loadTab("referidos");
              toast.success(action === "accept" ? "✅ Activador aceptado" : action === "reject" ? "Solicitud rechazada" : "Solicitud en espera");
            } else {
              toast.error("Error al procesar la solicitud");
            }
          }

          async function saveActSettings() {
            setSavingActSettings(true);
            try {
              const r = await fetch(`${BASE}/api/admin/activator-settings`, {
                method: "PUT",
                headers: authH(),
                body: JSON.stringify({
                  is_enabled: actSettingsForm.is_enabled,
                  whatsapp_group_link: actSettingsForm.whatsapp_group_link.trim() || null,
                  bonus_amount: parseFloat(actSettingsForm.bonus_amount) || 5,
                  bonus_title: actSettingsForm.bonus_title,
                  commission_percentage: parseFloat(actSettingsForm.commission_percentage) || 5,
                  commission_duration: actSettingsForm.commission_duration,
                  commission_duration_months: actSettingsForm.commission_duration === "monthly" && actSettingsForm.commission_duration_months ? parseInt(actSettingsForm.commission_duration_months) : null,
                }),
              });
              if (r.ok) { setActivatorSettings(await r.json()); toast.success("Configuración guardada"); }
              else toast.error("Error al guardar");
            } finally { setSavingActSettings(false); }
          }

          const reqStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
            suspended: { label: "Suspendido", color: "#d97706", bg: "rgba(217,119,6,0.1)" },
            banned: { label: "Baneado", color: "hsl(0 75% 45%)", bg: "rgba(220,38,38,0.1)" },
            pending: { label: "Pendiente", color: "hsl(42 98% 35%)", bg: "hsl(42 98% 52% / 0.12)" },
            accepted: { label: "Aceptado", color: "hsl(142 70% 30%)", bg: "hsl(142 70% 45% / 0.12)" },
            rejected: { label: "Rechazado", color: "hsl(0 75% 40%)", bg: "hsl(0 75% 52% / 0.12)" },
            hold: { label: "En espera", color: "#7c3aed", bg: "rgba(124,58,237,0.1)" },
          };

          return (
            <div className="space-y-5">
              {/* Stats strip */}
              {referralStats && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Activadores activos", value: referralStats.active_activators, icon: "🔗" },
                    { label: "Usuarios referidos", value: referralStats.total_referred_users, icon: "👥" },
                    { label: "Comisiones pagadas", value: `Bs ${(referralStats.total_commissions_paid ?? 0).toFixed(0)}`, icon: "💰" },
                    { label: "Bonos otorgados", value: `Bs ${(referralStats.total_bonuses_granted ?? 0).toFixed(0)}`, icon: "🎁" },
                  ].map(item => (
                    <div key={item.label} className="bg-card border rounded-2xl p-4">
                      <p className="text-xl">{item.icon}</p>
                      <p className="font-black text-xl mt-1" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Activator performance: podium + full table with department filter */}
              {activatorPerformance.length > 0 && (() => {
                const podiumColors = [
                  { bg: "hsl(47 95% 52% / 0.15)", border: "hsl(47 95% 52% / 0.5)", text: "hsl(47 90% 30%)" },
                  { bg: "hsl(220 15% 60% / 0.15)", border: "hsl(220 15% 60% / 0.4)", text: "hsl(220 10% 35%)" },
                  { bg: "hsl(27 80% 55% / 0.15)", border: "hsl(27 80% 55% / 0.4)", text: "hsl(27 70% 30%)" },
                ];
                const podiumMedals = ["🥇","🥈","🥉"];

                // Unique departments sorted
                const departments = Array.from(new Set(activatorPerformance.map(a => a.department || "Sin depto."))).sort();

                // Filtered list: if dept selected, only that dept ordered by total; else global
                const filtered = deptFilter === "__all__"
                  ? [...activatorPerformance].sort((a, b) => b.total - a.total)
                  : [...activatorPerformance].filter(a => (a.department || "Sin depto.") === deptFilter).sort((a, b) => b.total - a.total);

                const top3 = filtered.slice(0, 3);

                return (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-black text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>🏆 Desempeño de Activadores</h3>
                      <span className="text-[11px] text-muted-foreground font-bold">{filtered.length} activador{filtered.length !== 1 ? "es" : ""}</span>
                    </div>

                    {/* Department filter pills */}
                    <div className="flex gap-1.5 flex-wrap mb-3">
                      {["__all__", ...departments].map(dept => {
                        const label = dept === "__all__" ? "🌐 Todos" : dept;
                        const count = dept === "__all__" ? activatorPerformance.length : activatorPerformance.filter(a => (a.department || "Sin depto.") === dept).length;
                        const active = deptFilter === dept;
                        return (
                          <button key={dept}
                            onClick={() => setDeptFilter(dept)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all"
                            style={{
                              background: active ? "hsl(var(--primary))" : "hsl(var(--muted))",
                              color: active ? "white" : "hsl(var(--muted-foreground))",
                              border: active ? "none" : "1px solid hsl(var(--border))",
                            }}>
                            {label} <span className="opacity-75">({count})</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Podium top 3 of current filter */}
                    {top3.length >= 1 && (
                      <div className={`grid gap-2 mb-3 ${top3.length === 1 ? "grid-cols-1" : top3.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                        {top3.map((a, i) => (
                          <div key={a.code} className="rounded-2xl p-3 text-center"
                            style={{ background: podiumColors[i].bg, border: `1px solid ${podiumColors[i].border}` }}>
                            <p className="text-2xl">{podiumMedals[i]}</p>
                            <p className="font-black text-xs mt-1 leading-tight truncate" style={{ color: podiumColors[i].text, fontFamily: "'Poppins', sans-serif" }}>
                              {a.full_name.split(" ")[0]}
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground">{a.code}</p>
                            {deptFilter === "__all__" && (
                              <p className="text-[10px] font-bold mt-0.5" style={{ color: "hsl(var(--primary))" }}>{a.department || "—"}</p>
                            )}
                            <p className="font-black text-lg mt-1" style={{ fontFamily: "'Poppins', sans-serif" }}>{a.total}</p>
                            <p className="text-[10px] text-muted-foreground">referidos</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Full table */}
                    <div className="rounded-2xl border overflow-hidden">
                      <div className="grid text-[10px] font-black text-muted-foreground px-3 py-2"
                        style={{ gridTemplateColumns: "1.5rem 1fr 2.5rem 2.5rem 3rem 3rem", gap: "0.25rem", background: "hsl(var(--muted)/0.4)" }}>
                        <span>#</span>
                        <span>Activador{deptFilter === "__all__" ? " / Depto." : ` · ${deptFilter}`}</span>
                        <span className="text-center">Hoy</span><span className="text-center">Sem.</span>
                        <span className="text-center">Mes</span><span className="text-center">Total</span>
                      </div>
                      {filtered.map((a, i) => (
                        <div key={a.code} className="grid items-center px-3 py-2.5 border-t text-xs"
                          style={{ gridTemplateColumns: "1.5rem 1fr 2.5rem 2.5rem 3rem 3rem", gap: "0.25rem", background: i === 0 ? "hsl(47 95% 52% / 0.06)" : undefined }}>
                          <span className="font-black text-[11px]">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}`}</span>
                          <div className="min-w-0">
                            <p className="font-bold truncate leading-tight">{a.full_name.split(" ").slice(0,2).join(" ")}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">
                              {a.code}{deptFilter === "__all__" ? ` · ${a.department || "—"}` : ""}
                            </p>
                          </div>
                          <span className="text-center font-bold" style={{ color: a.today > 0 ? "hsl(142 70% 30%)" : undefined }}>{a.today}</span>
                          <span className="text-center font-bold" style={{ color: a.this_week > 0 ? "hsl(142 70% 30%)" : undefined }}>{a.this_week}</span>
                          <span className="text-center font-bold">{a.this_month}</span>
                          <span className="text-center font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>{a.total}</span>
                        </div>
                      ))}
                      {filtered.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6">Sin activadores en {deptFilter === "__all__" ? "el sistema" : deptFilter}</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Requests — ordered: pending → accepted → hold → rejected */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    📋 Solicitudes de Activador
                    {pendingReqs.length > 0 && (
                      <span className="ml-2 bg-yellow-500 text-white text-xs font-black px-2 py-0.5 rounded-full">{pendingReqs.length}</span>
                    )}
                  </h3>
                  <button onClick={() => loadTab("referidos")} className="text-xs font-bold px-2.5 py-1 rounded-lg border"
                    style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>🔄</button>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {(["all", "pending", "accepted", "hold", "suspended", "banned"] as const).map(f => {
                    const labels: Record<string, string> = { all: "Todos", pending: "Pendientes", accepted: "Activos", hold: "En espera", suspended: "Suspendidos", banned: "Baneados" };
                    const counts: Record<string, number> = {
                      all: activatorRequests.length,
                      pending: activatorRequests.filter(r => r.status === "pending").length,
                      accepted: activatorRequests.filter(r => r.status === "accepted").length,
                      hold: activatorRequests.filter(r => r.status === "hold").length,
                      suspended: activatorRequests.filter(r => r.status === "suspended").length,
                      banned: activatorRequests.filter(r => r.status === "banned").length,
                    };
                    const active = reqFilter === f;
                    return (
                      <button key={f} onClick={() => setReqFilter(f)}
                        className="text-xs font-bold px-2.5 py-1 rounded-lg transition-all"
                        style={{
                          background: active ? "hsl(var(--primary))" : "hsl(var(--muted)/0.5)",
                          color: active ? "white" : "hsl(var(--muted-foreground))",
                          border: active ? "none" : "1px solid hsl(var(--border))",
                        }}>
                        {labels[f]}{counts[f] > 0 ? ` (${counts[f]})` : ""}
                      </button>
                    );
                  })}
                </div>

                {activatorRequests.filter(r => reqFilter === "all" || r.status === reqFilter).length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">No hay solicitudes en esta categoría</p>
                ) : (
                  <div className="space-y-2.5">
                    {[...activatorRequests]
                      .filter(r => reqFilter === "all" || r.status === reqFilter)
                      .sort((a, b) => {
                        const order: Record<string, number> = { pending: 0, accepted: 1, hold: 2, suspended: 3, banned: 4, rejected: 5 };
                        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
                      })
                      .map((req: any) => {
                      const sc = reqStatusConfig[req.status] ?? reqStatusConfig.pending;
                      const noteOpen = reqNoteOpen[req.id];
                      return (
                        <div key={req.id} className="bg-card border rounded-2xl p-3.5">
                          {/* Header row */}
                          <div className="flex items-center gap-2.5 mb-2">
                            <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-black shrink-0"
                              style={{ background: "hsl(var(--primary)/0.1)", color: "hsl(var(--primary))" }}>
                              {req.user_avatar_url
                                ? <img src={req.user_avatar_url} className="w-9 h-9 object-cover" />
                                : (req.user_full_name?.charAt(0) ?? "?")}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm truncate">{req.user_full_name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">CI: {req.user_ci} · {req.user_department} · {req.user_status === "active" ? "✅" : "⏳"}</p>
                            </div>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                          </div>

                          {/* Meta */}
                          <div className="flex gap-3 text-[11px] text-muted-foreground mb-2">
                            <span>📱 {req.user_phone}</span>
                            <span>📅 {new Date(req.created_at).toLocaleDateString("es-BO")}</span>
                          </div>

                          {/* Admin note (rejection/hold reason) */}
                          {req.notes && (
                            <div className="rounded-lg px-2.5 py-1.5 mb-2 text-[11px]"
                              style={{ background: "hsl(var(--muted)/0.5)", borderLeft: `2px solid ${sc.color}` }}>
                              💬 {req.notes}
                            </div>
                          )}

                          {/* Inline note input for reject/hold */}
                          {noteOpen && (
                            <div className="mb-2 space-y-1.5">
                              <textarea
                                className="w-full rounded-xl border px-3 py-2 text-xs resize-none"
                                rows={2}
                                placeholder={noteOpen === "reject" ? "Motivo del rechazo (visible para el usuario)..." : "Motivo de espera (visible para el usuario)..."}
                                value={reqNoteInput[req.id] ?? ""}
                                onChange={e => setReqNoteInput(n => ({ ...n, [req.id]: e.target.value }))}
                                style={{ borderColor: noteOpen === "reject" ? "hsl(0 75% 52%)" : "#7c3aed" }}
                                autoFocus
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => {
                                    reviewRequest(req.id, noteOpen, reqNoteInput[req.id] || undefined);
                                    setReqNoteOpen(o => ({ ...o, [req.id]: null }));
                                    setReqNoteInput(n => ({ ...n, [req.id]: "" }));
                                  }}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white"
                                  style={{ background: noteOpen === "reject" ? "hsl(0 75% 45%)" : "#7c3aed" }}>
                                  {noteOpen === "reject" ? "✖ Confirmar rechazo" : "⏸ Confirmar espera"}
                                </button>
                                <button
                                  onClick={() => setReqNoteOpen(o => ({ ...o, [req.id]: null }))}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold border"
                                  style={{ borderColor: "hsl(var(--border))" }}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Action buttons */}
                          {(req.status === "pending" || req.status === "hold") && !noteOpen && (
                            <div className="flex gap-1.5">
                              <button onClick={() => reviewRequest(req.id, "accept")}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white"
                                style={{ background: "hsl(142 70% 40%)" }}>✅ Aceptar</button>
                              <button onClick={() => setReqNoteOpen(o => ({ ...o, [req.id]: "hold" }))}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border-2"
                                style={{ borderColor: "#7c3aed", color: "#7c3aed" }}>⏸</button>
                              <button onClick={() => setReqNoteOpen(o => ({ ...o, [req.id]: "reject" }))}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border-2"
                                style={{ borderColor: "hsl(0 75% 52%)", color: "hsl(0 75% 40%)" }}>✖</button>
                              <button onClick={async () => {
                                if (!confirm(`¿Eliminar la solicitud de ${req.user_full_name}?`)) return;
                                const r = await fetch(`${BASE}/api/admin/activator-requests/${req.id}`, { method: "DELETE", headers: authH() });
                                if (r.ok) { loadTab("referidos"); toast.success("Solicitud eliminada"); }
                                else toast.error("Error al eliminar");
                              }} className="px-3 py-1.5 rounded-lg text-xs font-bold border-2"
                                style={{ borderColor: "hsl(0 75% 52%)", color: "hsl(0 75% 40%)" }}>🗑️</button>
                            </div>
                          )}
                          {req.status === "accepted" && (
                            <div className="flex gap-1.5">
                              <button onClick={async () => {
                                if (!confirm(`¿Eliminar a ${req.user_full_name} como activador?`)) return;
                                const r = await fetch(`${BASE}/api/admin/activator-requests/${req.id}`, { method: "DELETE", headers: authH() });
                                if (r.ok) { loadTab("referidos"); toast.success("Activador eliminado"); }
                                else toast.error("Error al eliminar");
                              }} className="px-3 py-1.5 rounded-lg text-xs font-bold border-2"
                                style={{ borderColor: "hsl(0 75% 52%)", color: "hsl(0 75% 40%)" }}
                                title="Eliminar activador">🗑️</button>
                              <button onClick={() => reviewRequest(req.id, "suspend")}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold border-2"
                                style={{ borderColor: "#d97706", color: "#d97706" }}>⏸ Suspender</button>
                              <button onClick={() => { setBanModal({ id: req.id, name: req.user_full_name }); setBanReason(""); }}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white"
                                style={{ background: "hsl(0 75% 45%)" }}>🔴 Banear</button>
                            </div>
                          )}
                          {req.status === "suspended" && (
                            <div className="flex gap-1.5">
                              <button onClick={() => reviewRequest(req.id, "accept")}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white"
                                style={{ background: "hsl(142 70% 40%)" }}>✅ Reactivar</button>
                              <button onClick={() => { setBanModal({ id: req.id, name: req.user_full_name }); setBanReason(""); }}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white"
                                style={{ background: "hsl(0 75% 45%)" }}>🔴 Banear</button>
                            </div>
                          )}
                          {req.status === "banned" && (
                            <button onClick={async () => {
                              if (!confirm(`¿Desbanear a ${req.user_full_name} del programa de activadores?`)) return;
                              const r = await fetch(`${BASE}/api/admin/activator-requests/${req.id}/unban`, { method: "POST", headers: authH() });
                              if (r.ok) { loadTab("referidos"); toast.success("✅ Activador desbaneado y reactivado"); }
                              else toast.error("Error al desbanear");
                            }} className="w-full py-1.5 rounded-lg text-xs font-bold border-2"
                              style={{ borderColor: "hsl(142 70% 45%)", color: "hsl(142 70% 30%)" }}>
                              ✅ Desbanear activador
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent referral transactions */}
              {referralStats?.recent_transactions?.length > 0 && (
                <div>
                  <h3 className="font-black text-base mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>📑 Movimientos recientes</h3>
                  <div className="space-y-2">
                    {referralStats.recent_transactions.slice(0, 20).map((tx: any) => (
                      <div key={tx.id} className="bg-card border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{tx.description}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {tx.type === "commission" ? "🔗 Comisión" : "🎁 Bono"} · {new Date(tx.created_at).toLocaleDateString("es-BO")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Activador: {tx.activator_name?.split(" ").slice(0,2).join(" ")} · Referido: {tx.referred_name?.split(" ").slice(0,2).join(" ")}</p>
                        </div>
                        <p className="font-black text-sm shrink-0" style={{ color: "hsl(142 70% 35%)" }}>+Bs {Number(tx.amount).toFixed(0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings */}
              <div className="bg-card border rounded-2xl p-4">
                <h3 className="font-black text-sm mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>⚙️ Configuración de Referidos</h3>

                {/* Enable / disable toggle */}
                <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-3"
                  style={{ background: actSettingsForm.is_enabled ? "hsl(142 70% 45% / 0.1)" : "hsl(0 75% 52% / 0.08)", border: `1px solid ${actSettingsForm.is_enabled ? "hsl(142 70% 45% / 0.35)" : "hsl(0 75% 52% / 0.25)"}` }}>
                  <div>
                    <p className="text-sm font-black" style={{ color: actSettingsForm.is_enabled ? "hsl(142 70% 30%)" : "hsl(0 75% 40%)" }}>
                      {actSettingsForm.is_enabled ? "✅ Programa activo" : "⛔ Programa desactivado"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {actSettingsForm.is_enabled ? "Los usuarios pueden solicitar ser activadores" : "No se aceptan nuevas solicitudes"}
                    </p>
                  </div>
                  <button
                    onClick={() => setActSettingsForm(f => ({ ...f, is_enabled: !f.is_enabled }))}
                    className="relative w-12 h-6 rounded-full transition-all shrink-0"
                    style={{ background: actSettingsForm.is_enabled ? "hsl(142 70% 40%)" : "hsl(0 75% 52%)" }}>
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                      style={{ left: actSettingsForm.is_enabled ? "calc(100% - 1.375rem)" : "0.125rem" }} />
                  </button>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] font-bold block mb-1">
                      <span style={{ color: "#25D366" }}>💬</span> Enlace grupo WhatsApp de activadores
                    </label>
                    <input
                      className="input-field text-sm py-2"
                      placeholder="https://chat.whatsapp.com/..."
                      value={actSettingsForm.whatsapp_group_link}
                      onChange={e => setActSettingsForm(f => ({ ...f, whatsapp_group_link: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Los activadores aceptados verán este botón en su perfil. Déjalo vacío para ocultarlo.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold block mb-1">Bono bienvenida (Bs)</label>
                      <input className="input-field text-sm py-2" type="number" min="0" step="0.50" value={actSettingsForm.bonus_amount}
                        onChange={e => setActSettingsForm(f => ({ ...f, bonus_amount: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold block mb-1">Comisión activador (%)</label>
                      <input className="input-field text-sm py-2" type="number" min="0" max="100" step="0.5" value={actSettingsForm.commission_percentage}
                        onChange={e => setActSettingsForm(f => ({ ...f, commission_percentage: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold block mb-1">Título del bono <span className="font-normal text-muted-foreground">(usa {"{activator}"} para el nombre)</span></label>
                    <input className="input-field text-sm py-2" placeholder="Bono de bienvenida por activador {activator}"
                      value={actSettingsForm.bonus_title}
                      onChange={e => setActSettingsForm(f => ({ ...f, bonus_title: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-bold block mb-1">Duración comisión</label>
                      <select className="input-field text-sm py-2" value={actSettingsForm.commission_duration}
                        onChange={e => setActSettingsForm(f => ({ ...f, commission_duration: e.target.value }))}>
                        <option value="once">Una vez</option>
                        <option value="monthly">Por meses</option>
                        <option value="indefinite">Indefinido</option>
                      </select>
                    </div>
                    {actSettingsForm.commission_duration === "monthly" && (
                      <div className="w-24">
                        <label className="text-[11px] font-bold block mb-1">Meses</label>
                        <input className="input-field text-sm py-2" type="number" min="1" max="120" value={actSettingsForm.commission_duration_months}
                          onChange={e => setActSettingsForm(f => ({ ...f, commission_duration_months: e.target.value }))} />
                      </div>
                    )}
                  </div>
                  <button className="btn-primary py-2 text-sm" onClick={saveActSettings} disabled={savingActSettings}>
                    {savingActSettings ? "Guardando..." : "💾 Guardar configuración"}
                  </button>
                </div>
              </div>

              {/* Ban modal */}
              {banModal && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
                  onClick={() => setBanModal(null)}>
                  <div className="bg-card w-full max-w-sm rounded-t-3xl p-5 space-y-3 shadow-2xl"
                    onClick={e => e.stopPropagation()}>
                    <p className="font-black text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      🔴 Banear a {banModal.name.split(" ").slice(0,2).join(" ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      El usuario será baneado de la plataforma y removido como activador. Esta acción desactiva su cuenta inmediatamente.
                    </p>
                    <textarea
                      className="w-full rounded-xl border px-3 py-2 text-xs resize-none"
                      rows={3}
                      placeholder="Motivo del baneo (visible en el sistema)..."
                      value={banReason}
                      onChange={e => setBanReason(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          const r = await fetch(`${BASE}/api/admin/activator-requests/${banModal.id}/ban`, {
                            method: "POST",
                            headers: authH(),
                            body: JSON.stringify({ reason: banReason || undefined }),
                          });
                          if (r.ok) {
                            setBanModal(null);
                            loadTab("referidos");
                            toast.success(`🔴 ${banModal.name.split(" ")[0]} baneado`);
                          } else {
                            toast.error("Error al banear");
                          }
                        }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-black text-white"
                        style={{ background: "hsl(0 75% 45%)" }}>
                        Confirmar baneo
                      </button>
                      <button
                        onClick={() => setBanModal(null)}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold border"
                        style={{ borderColor: "hsl(var(--border))" }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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

        {/* ── Sitio Web ───────────────────────────────────────────── */}
        {tab === "sitio" && !loading && (() => {
          const imgRef = { favicon: null as HTMLInputElement | null, logo: null as HTMLInputElement | null };

          function handleImgUpload(field: "favicon_url" | "logo_url" | "qr_background_url", e: React.ChangeEvent<HTMLInputElement>) {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => setSiteForm(f => ({ ...f, [field]: ev.target?.result as string }));
            reader.readAsDataURL(file);
          }

          async function saveSiteSettings() {
            setSavingSite(true);
            try {
              const body: Record<string, string | null> = {
                site_name: siteForm.site_name,
                site_tagline: siteForm.site_tagline,
                site_emoji: siteForm.site_emoji,
                favicon_url: siteForm.favicon_url || null,
                logo_url: siteForm.logo_url || null,
                seo_title: siteForm.seo_title,
                seo_description: siteForm.seo_description,
                seo_keywords: siteForm.seo_keywords,
                primary_color: siteForm.primary_color,
                qr_background_url: siteForm.qr_background_url || null,
              };
              const r = await fetch(`${BASE}/api/site-settings`, {
                method: "PUT",
                headers: authH(),
                body: JSON.stringify(body),
              });
              if (r.ok) {
                const updated = await r.json();
                setSiteSettingsData(updated);
                toast.success("✅ Configuración del sitio guardada");
              } else {
                const d = await r.json().catch(() => ({}));
                toast.error(d.error || "Error al guardar");
              }
            } catch {
              toast.error("Error de red");
            } finally {
              setSavingSite(false);
            }
          }

          const sf = siteForm;

          return (
            <div className="space-y-6">
              <div className="rounded-2xl p-5 space-y-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                <h2 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>🌐 Identidad del Sitio</h2>

                {/* Preview strip */}
                <div className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: "linear-gradient(135deg, " + (sf.primary_color || "#1a0050") + ", " + (sf.primary_color || "#1a0050") + "cc)" }}>
                  {sf.logo_url
                    ? <img src={sf.logo_url} alt="logo" className="h-8 w-auto object-contain" />
                    : <span className="text-2xl">{sf.site_emoji || "🎱"}</span>}
                  <div>
                    <p className="font-black text-white text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>{sf.site_name || "Tu Bingazo"}</p>
                    <p className="text-white/60 text-xs">{sf.site_tagline || "Bingo en Vivo Bolivia"}</p>
                  </div>
                </div>

                {/* Nombre + tagline */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Nombre del sitio</label>
                    <input className="w-full rounded-xl border px-3 py-2.5 text-sm font-bold bg-background"
                      value={sf.site_name} onChange={e => setSiteForm(f => ({ ...f, site_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Eslogan / Tagline</label>
                    <input className="w-full rounded-xl border px-3 py-2.5 text-sm bg-background"
                      value={sf.site_tagline} onChange={e => setSiteForm(f => ({ ...f, site_tagline: e.target.value }))} />
                  </div>
                </div>

                {/* Emoji + Color */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Emoji del logo (si no usas imagen)</label>
                    <input className="w-full rounded-xl border px-3 py-2.5 text-2xl bg-background"
                      value={sf.site_emoji} onChange={e => setSiteForm(f => ({ ...f, site_emoji: e.target.value }))} maxLength={4} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Color principal</label>
                    <div className="flex items-center gap-2">
                      <input type="color" className="w-10 h-10 rounded-lg border cursor-pointer"
                        value={sf.primary_color} onChange={e => setSiteForm(f => ({ ...f, primary_color: e.target.value }))} />
                      <input className="flex-1 rounded-xl border px-3 py-2.5 text-sm font-mono bg-background"
                        value={sf.primary_color} onChange={e => setSiteForm(f => ({ ...f, primary_color: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Logo image upload */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Logo (imagen) — se muestra en el encabezado</label>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex-1 border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all"
                      style={{ borderColor: sf.logo_url ? "hsl(var(--primary))" : "hsl(var(--border))" }}
                      onClick={() => {
                        const el = document.getElementById("admin-logo-upload") as HTMLInputElement;
                        el?.click();
                      }}>
                      {sf.logo_url ? (
                        <img src={sf.logo_url} alt="logo" className="max-h-16 mx-auto object-contain" />
                      ) : (
                        <p className="text-xs text-muted-foreground py-2">📁 Subir logo (PNG/SVG recomendado, fondo transparente)</p>
                      )}
                      <input id="admin-logo-upload" type="file" accept="image/*" className="hidden"
                        onChange={e => handleImgUpload("logo_url", e)} />
                    </div>
                    {sf.logo_url && (
                      <button onClick={() => setSiteForm(f => ({ ...f, logo_url: "" }))}
                        className="text-red-500 text-xs font-bold px-3 py-2 rounded-lg border border-red-200 hover:bg-red-50">
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Favicon */}
              <div className="rounded-2xl p-5 space-y-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                <h2 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>🔖 Favicon (icono del sitio)</h2>
                <p className="text-xs text-muted-foreground">El ícono que aparece en la pestaña del navegador, acceso directo al teléfono y en los resultados de búsqueda.</p>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl border-2 flex items-center justify-center overflow-hidden shrink-0"
                    style={{ borderColor: sf.favicon_url ? "hsl(var(--primary))" : "hsl(var(--border))", background: "hsl(var(--muted))" }}>
                    {sf.favicon_url
                      ? <img src={sf.favicon_url} alt="favicon" className="w-full h-full object-contain" />
                      : <span className="text-3xl">{sf.site_emoji || "🎱"}</span>}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div
                      className="border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all"
                      style={{ borderColor: "hsl(var(--border))" }}
                      onClick={() => {
                        const el = document.getElementById("admin-favicon-upload") as HTMLInputElement;
                        el?.click();
                      }}>
                      <p className="text-xs text-muted-foreground">📁 Subir favicon (PNG/ICO/SVG, mínimo 32×32px)</p>
                      <input id="admin-favicon-upload" type="file" accept="image/*" className="hidden"
                        onChange={e => handleImgUpload("favicon_url", e)} />
                    </div>
                    {sf.favicon_url && (
                      <button onClick={() => setSiteForm(f => ({ ...f, favicon_url: "" }))}
                        className="text-red-500 text-xs font-bold">
                        ✕ Quitar favicon personalizado (usar emoji)
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* QR Background */}
              <div className="rounded-2xl p-5 space-y-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                <h2 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>🖼️ Imagen de Fondo del QR</h2>
                <p className="text-xs text-muted-foreground">Esta imagen se usa como fondo cuando el usuario descarga el código QR de pago. Si no hay imagen, se usa el degradado morado por defecto.</p>

                <div className="flex items-center gap-4">
                  <div className="w-24 h-16 rounded-xl border-2 flex items-center justify-center overflow-hidden shrink-0"
                    style={{ borderColor: sf.qr_background_url ? "hsl(var(--primary))" : "hsl(var(--border))", background: "hsl(var(--muted))" }}>
                    {sf.qr_background_url
                      ? <img src={sf.qr_background_url} alt="qr bg" className="w-full h-full object-cover" />
                      : <span className="text-2xl">🟣</span>}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div
                      className="border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all"
                      style={{ borderColor: "hsl(var(--border))" }}
                      onClick={() => {
                        const el = document.getElementById("admin-qrbg-upload") as HTMLInputElement;
                        el?.click();
                      }}>
                      <p className="text-xs text-muted-foreground">📁 Subir imagen de fondo (JPG/PNG, proporción 2:3 recomendada)</p>
                      <input id="admin-qrbg-upload" type="file" accept="image/*" className="hidden"
                        onChange={e => handleImgUpload("qr_background_url", e)} />
                    </div>
                    {sf.qr_background_url && (
                      <button onClick={() => setSiteForm(f => ({ ...f, qr_background_url: "" }))}
                        className="text-red-500 text-xs font-bold">
                        ✕ Quitar imagen (usar degradado por defecto)
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* SEO */}
              <div className="rounded-2xl p-5 space-y-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                <h2 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>🔍 SEO & Metadatos</h2>
                <p className="text-xs text-muted-foreground">Controla cómo aparece el sitio en Google y qué ven los usuarios al compartir el enlace.</p>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Título de la pestaña / SEO</label>
                    <input className="w-full rounded-xl border px-3 py-2.5 text-sm bg-background"
                      value={sf.seo_title} onChange={e => setSiteForm(f => ({ ...f, seo_title: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground mt-1">Se muestra en la pestaña del navegador y en resultados de Google.</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Descripción SEO</label>
                    <textarea className="w-full rounded-xl border px-3 py-2.5 text-sm bg-background resize-none" rows={3}
                      value={sf.seo_description} onChange={e => setSiteForm(f => ({ ...f, seo_description: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground mt-1">Descripción corta (≤160 caracteres) para Google y redes sociales.</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Palabras clave (separadas por coma)</label>
                    <input className="w-full rounded-xl border px-3 py-2.5 text-sm bg-background"
                      value={sf.seo_keywords} onChange={e => setSiteForm(f => ({ ...f, seo_keywords: e.target.value }))} />
                  </div>
                </div>
              </div>

              <button onClick={saveSiteSettings} disabled={savingSite}
                className="btn-primary w-full">
                {savingSite ? "Guardando..." : "💾 Guardar configuración del sitio"}
              </button>
            </div>
          );
        })()}
      </div>
    </AppLayout>
  );
}
