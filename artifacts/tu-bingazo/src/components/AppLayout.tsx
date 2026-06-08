import { type ReactNode, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";

const BASE = "";

function PhotoCapture({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target?.result as string);
    reader.readAsDataURL(file);
  }
  return (
    <div>
      <p className="text-sm font-bold text-foreground mb-1.5">{label}</p>
      <div className="relative rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden"
        style={{ borderColor: value ? "hsl(var(--primary))" : "hsl(var(--border))", background: value ? "transparent" : "hsl(var(--muted))", minHeight: 100 }}
        onClick={() => inputRef.current?.click()}>
        {value ? (
          <div className="relative">
            <img src={value} alt={label} className="w-full h-32 object-cover" />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <span className="text-white text-sm font-bold">Cambiar foto</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-24 gap-1.5">
            <span className="text-3xl">📷</span>
            <span className="text-xs font-semibold text-muted-foreground">Toca para tomar o subir foto</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

function RejectedScreen({ reason }: { reason: string | null }) {
  const logout = useAuthStore(s => s.logout);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "hsl(var(--background))" }}>
      <div className="w-full max-w-sm space-y-5 text-center">
        <p className="text-5xl">❌</p>
        <div>
          <h1 className="font-black text-xl mb-1">Cuenta rechazada</h1>
          <p className="text-sm text-muted-foreground">Tu solicitud de verificación fue revisada por un administrador y no fue aprobada.</p>
        </div>

        {reason && (
          <div className="rounded-2xl p-4 text-left"
            style={{ background: "hsl(0 75% 52% / 0.07)", border: "1px solid hsl(0 75% 52% / 0.3)" }}>
            <p className="text-xs font-bold text-red-600 mb-1">Motivo del rechazo:</p>
            <p className="text-sm font-semibold">{reason}</p>
          </div>
        )}

        <div className="rounded-2xl p-4 space-y-1.5"
          style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
          <p className="text-xs font-bold text-muted-foreground">¿Qué puedes hacer?</p>
          <p className="text-xs text-muted-foreground">
            Comunícate con el administrador de Tu Bingazo para resolver el problema o solicitar una revisión de tu caso.
          </p>
        </div>

        <button onClick={logout}
          className="w-full py-3 rounded-2xl font-bold text-sm"
          style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function CiUploadScreen({ rejectionReason }: { rejectionReason?: string | null }) {
  const token = useAuthStore(s => s.token);
  const setUser = useAuthStore(s => s.setUser);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isResubmit = !!rejectionReason;

  async function submit() {
    if (!front || !back) { toast.error("Debes subir ambas fotos del CI"); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${BASE}/api/auth/upload-ci`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id_photo_front: front, id_photo_back: back }),
      });
      const d = await r.json();
      if (r.ok) {
        setUser(d);
        toast.success("✅ Documentos enviados. El admin verificará tu cuenta pronto.");
      } else {
        toast.error(d.error || "Error al enviar documentos");
      }
    } catch {
      toast.error("Error de conexión");
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--background))" }}>
      <div className="px-4 py-5 text-white text-center"
        style={{ background: isResubmit ? "linear-gradient(135deg, #5a0000, #b80000)" : "linear-gradient(135deg, #1a0050, #3b00b8)" }}>
        <p className="text-3xl mb-1">{isResubmit ? "⚠️" : "📄"}</p>
        <h1 className="font-black text-xl" style={{ fontFamily: "'Poppins', sans-serif" }}>
          {isResubmit ? "Documentos rechazados" : "Verificación de identidad"}
        </h1>
        <p className="text-white/70 text-sm mt-1">
          {isResubmit ? "Debes volver a enviar las fotos de tu CI" : "Para continuar debes subir las fotos de tu CI"}
        </p>
      </div>

      <div className="flex-1 px-4 py-6 space-y-5 max-w-sm mx-auto w-full">
        {/* Rejection reason — shown if this is a resubmit */}
        {isResubmit && (
          <div className="rounded-2xl p-4 space-y-1.5"
            style={{ background: "hsl(0 75% 52% / 0.07)", border: "1px solid hsl(0 75% 52% / 0.35)" }}>
            <p className="text-xs font-black text-red-600 uppercase tracking-wide">⛔ Motivo del rechazo:</p>
            <p className="text-sm font-semibold">{rejectionReason}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Asegúrate de que las nuevas fotos sean claras, legibles y sin reflejos.
            </p>
          </div>
        )}

        {/* Info box — shown only on first upload */}
        {!isResubmit && (
          <div className="rounded-2xl p-4 space-y-2"
            style={{ background: "hsl(var(--primary) / 0.06)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
            <p className="font-bold text-sm">¿Por qué necesitamos esto?</p>
            <p className="text-xs text-muted-foreground">
              Tu cuenta fue creada por un administrador. Necesitamos verificar tu identidad con tu Cédula de Identidad (CI) boliviana para activar tu cuenta completamente.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 mt-1">
              <li className="flex items-center gap-1.5"><span className="text-green-500">✓</span> Foto clara y legible</li>
              <li className="flex items-center gap-1.5"><span className="text-green-500">✓</span> Sin reflejos ni sombras</li>
              <li className="flex items-center gap-1.5"><span className="text-green-500">✓</span> CI vigente</li>
            </ul>
          </div>
        )}

        <PhotoCapture label="📷 Anverso del CI (parte delantera)" value={front} onChange={setFront} />
        <PhotoCapture label="📷 Reverso del CI (parte trasera)" value={back} onChange={setBack} />

        <button onClick={submit} disabled={submitting || !front || !back}
          className="w-full py-3.5 rounded-2xl font-black text-sm disabled:opacity-50 transition-all"
          style={{
            background: front && back ? (isResubmit ? "hsl(0 75% 45%)" : "hsl(var(--primary))") : "hsl(var(--muted))",
            color: front && back ? "white" : "hsl(var(--muted-foreground))",
          }}>
          {submitting ? "Enviando documentos..." : isResubmit ? "🔄 Reenviar documentos" : "✅ Enviar documentos para verificación"}
        </button>

        {!isResubmit && (
          <div className="rounded-2xl p-4 space-y-2"
            style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
            <p className="text-xs font-bold text-muted-foreground">¿Qué pasa después?</p>
            <div className="space-y-2">
              {[
                { step: "1", text: "El administrador revisará tus documentos" },
                { step: "2", text: "Recibirás acceso completo una vez aprobado" },
                { step: "3", text: "Podrás comprar cartones y participar en juegos" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                    style={{ background: "hsl(var(--primary))" }}>{step}</div>
                  <p className="text-xs text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingReviewScreen() {
  const token = useAuthStore(s => s.token);
  const setUser = useAuthStore(s => s.setUser);
  const logout = useAuthStore(s => s.logout);
  const [checking, setChecking] = useState(false);

  async function refresh() {
    setChecking(true);
    try {
      const r = await fetch(`${BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const d = await r.json();
        setUser(d);
        if (d.status === "active" && !d.needs_ci_upload) {
          toast.success("🎉 ¡Tu cuenta fue aprobada!");
        } else if (d.needs_ci_upload) {
          toast.info("Tus documentos fueron devueltos para corrección.");
        } else {
          toast.info("Tu cuenta todavía está en revisión.");
        }
      }
    } catch { /* ignore */ }
    setChecking(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "hsl(var(--background))" }}>
      <div className="w-full max-w-sm space-y-5 text-center">
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
            style={{ background: "hsl(42 98% 52% / 0.15)", border: "2px solid hsl(42 98% 52% / 0.4)" }}>
            ⏳
          </div>
        </div>

        <div>
          <h1 className="font-black text-xl mb-1">Verificación en proceso</h1>
          <p className="text-sm text-muted-foreground">
            El administrador está revisando los documentos que enviaste. Te avisaremos cuando tu cuenta esté activa.
          </p>
        </div>

        <div className="rounded-2xl p-4 space-y-3 text-left"
          style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
          <p className="text-xs font-bold text-muted-foreground text-center">Estado actual</p>
          {[
            { icon: "✅", text: "Documentos enviados", done: true },
            { icon: "🔍", text: "Revisión por el administrador", done: false, active: true },
            { icon: "🎉", text: "Activación de cuenta", done: false },
          ].map(({ icon, text, done, active }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-lg">{icon}</span>
              <p className="text-xs font-semibold flex-1"
                style={{ color: done ? "hsl(142 70% 35%)" : active ? "hsl(42 98% 35%)" : "hsl(var(--muted-foreground))" }}>
                {text}
              </p>
              {done && <span className="text-[10px] font-bold text-green-600">Listo</span>}
              {active && <span className="text-[10px] font-bold" style={{ color: "hsl(42 98% 35%)" }}>En curso</span>}
            </div>
          ))}
        </div>

        <button onClick={refresh} disabled={checking}
          className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-50"
          style={{ background: "hsl(var(--primary))", color: "white" }}>
          {checking ? "Verificando..." : "🔄 Actualizar estado"}
        </button>

        <button onClick={logout}
          className="w-full py-2.5 rounded-2xl font-bold text-sm"
          style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

interface AppLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

/* ---- Festive bingo-themed nav icons ---- */

function IconHome({ active }: { active: boolean }) {
  const c1 = active ? "#7c3aed" : "#a0a0b8";
  const c2 = active ? "#a855f7" : "#c0c0d0";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10.5z"
        fill={active ? c1 : "none"} stroke={c1} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 22V13h6v9" stroke={active ? "white" : c2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {active && <circle cx="12" cy="8" r="1.5" fill="#f59e0b" />}
    </svg>
  );
}

function IconGames({ active }: { active: boolean }) {
  const c = active ? "#7c3aed" : "#a0a0b8";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" fill={active ? c : "none"} stroke={c} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="9" fill={active ? c : "none"} stroke={c} strokeWidth="1.8" />
      {/* Bingo ball number lines */}
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke={active ? "rgba(255,255,255,0.5)" : "transparent"} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" fill={active ? "#f59e0b" : "none"} stroke={active ? "#f59e0b" : c} strokeWidth="1.5" />
      <text x="12" y="13" textAnchor="middle" fontSize="4" fontWeight="bold" fill={active ? "#1a0050" : "none"}>B</text>
    </svg>
  );
}

function IconCards({ active }: { active: boolean }) {
  const c = active ? "#7c3aed" : "#a0a0b8";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      {/* Bingo card shape */}
      <rect x="3" y="5" width="18" height="14" rx="3" fill={active ? c : "none"} stroke={c} strokeWidth="1.8" />
      {/* Grid dots representing bingo numbers */}
      {active && (
        <>
          {[6,9,12,15,18].map((x, i) => [5,8,11,14].map((y, j) => (
            <circle key={`${i}-${j}`} cx={x} cy={y} r="1.2" fill={i===2 && j===1 ? "#f59e0b" : "rgba(255,255,255,0.7)"} />
          )))}
        </>
      )}
      {!active && (
        <>
          <line x1="3" y1="9" x2="21" y2="9" stroke={c} strokeWidth="1.3" />
          <line x1="9" y1="9" x2="9" y2="19" stroke={c} strokeWidth="1.3" />
          <line x1="15" y1="9" x2="15" y2="19" stroke={c} strokeWidth="1.3" />
          <circle cx="12" cy="14" r="1.5" fill={c} />
        </>
      )}
    </svg>
  );
}

function IconWallet({ active }: { active: boolean }) {
  const c = active ? "#7c3aed" : "#a0a0b8";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="7" width="20" height="13" rx="3" fill={active ? c : "none"} stroke={c} strokeWidth="1.8" />
      <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="17" cy="13.5" r="2" fill={active ? "#f59e0b" : "none"} stroke={active ? "#f59e0b" : c} strokeWidth="1.6" />
      {active && <circle cx="17" cy="13.5" r="0.7" fill="#1a0050" />}
    </svg>
  );
}

function IconProfile({ active }: { active: boolean }) {
  const c = active ? "#7c3aed" : "#a0a0b8";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" fill={active ? c : "none"} stroke={c} strokeWidth="1.8" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      {active && <path d="M10 6.5l2 1.5 2-3" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function IconLogin({ active }: { active: boolean }) {
  const c = active ? "#7c3aed" : "#a0a0b8";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <polyline points="10 17 15 12 10 7" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="15" y1="12" x2="3" y2="12" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      {active && <circle cx="3" cy="12" r="2" fill="#f59e0b" />}
    </svg>
  );
}

function IconRegister({ active }: { active: boolean }) {
  const c = active ? "#7c3aed" : "#a0a0b8";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="4" fill={active ? c : "none"} stroke={c} strokeWidth="1.8" />
      <path d="M2 20c0-4 3.1-7 7-7" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="19" cy="17" r="4" fill={active ? "#f59e0b" : "none"} stroke={active ? "#f59e0b" : c} strokeWidth="1.8" />
      <line x1="19" y1="14.5" x2="19" y2="19.5" stroke={active ? "#1a0050" : c} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="16.5" y1="17" x2="21.5" y2="17" stroke={active ? "#1a0050" : c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function AppLayout({ children, hideNav, title, showBack, onBack }: AppLayoutProps) {
  const [location] = useLocation();
  const user = useAuthStore(s => s.user);

  // Guard: needs CI upload (first time or after rejection)
  if (user && user.needs_ci_upload) {
    return <CiUploadScreen rejectionReason={user.rejection_reason} />;
  }

  // Guard: CI submitted, waiting for admin approval
  if (user && user.status === "pending") {
    return <PendingReviewScreen />;
  }

  // Guard: rejected — same as needs_ci_upload: show reason + allow resubmit
  if (user && user.status === "rejected") {
    return <CiUploadScreen rejectionReason={user.rejection_reason} />;
  }

  const navItems = [
    { href: "/", icon: IconHome, label: "Inicio" },
    { href: "/juegos", icon: IconGames, label: "Juegos" },
    ...(user ? [
      { href: "/mis-cartones", icon: IconCards, label: "Cartones" },
      { href: "/billetera", icon: IconWallet, label: "Billetera" },
      { href: "/perfil", icon: IconProfile, label: "Perfil" },
    ] : [
      { href: "/login", icon: IconLogin, label: "Entrar" },
      { href: "/registro", icon: IconRegister, label: "Registro" },
    ]),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header
        className="sticky top-0 z-40 flex items-center px-4 gap-3"
        style={{
          background: "linear-gradient(135deg, #1a0050, #2d0082)",
          minHeight: 56,
          paddingTop: "max(12px, env(safe-area-inset-top))",
          paddingBottom: 12,
        }}
      >
        {showBack ? (
          <button onClick={onBack ?? (() => window.history.back())} className="text-white/80 hover:text-white p-1 -ml-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
        ) : (
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="text-2xl leading-none">🎱</span>
              <span className="font-black text-white" style={{ fontFamily: "'Poppins', sans-serif", fontSize: "1.15rem", letterSpacing: "-0.01em" }}>
                Tu Bingazo
              </span>
            </div>
          </Link>
        )}

        {title && !showBack && <h1 className="flex-1 text-center text-white font-bold text-base pr-8">{title}</h1>}
        {title && showBack && <h1 className="flex-1 text-center text-white font-bold text-base">{title}</h1>}
        {!title && <div className="flex-1" />}

        {user ? (
          <Link href="/perfil">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black cursor-pointer shrink-0 overflow-hidden"
              style={{ background: user.avatar_url ? "transparent" : "hsl(42 98% 52%)", color: "#1a0050" }}>
              {user.avatar_url
                ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : user.full_name.charAt(0).toUpperCase()}
            </div>
          </Link>
        ) : (
          <div className="flex gap-2 shrink-0">
            <Link href="/login">
              <span className="text-sm font-bold text-white/80 hover:text-white cursor-pointer">Entrar</span>
            </Link>
            <Link href="/registro">
              <span className="text-sm font-bold px-3 py-1.5 rounded-xl cursor-pointer"
                style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}>Registro</span>
            </Link>
          </div>
        )}
      </header>

      {/* Content */}
      <main className={hideNav ? "flex-1" : "flex-1 safe-pb"}>{children}</main>

      {/* Bottom navigation */}
      {!hideNav && (
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 grid nav-safe"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, 1fr)` }}>
          {navItems.map(item => {
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <button className="w-full flex flex-col items-center justify-center py-2 gap-0.5 transition-all relative">
                  {isActive && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                      style={{ background: "linear-gradient(90deg, #7c3aed, #a855f7)" }} />
                  )}
                  <div className={`transition-all ${isActive ? "scale-110 drop-shadow-sm" : "scale-100"}`}>
                    <Icon active={isActive} />
                  </div>
                  <span className="text-[9px] font-black tracking-wide transition-colors"
                    style={{ color: isActive ? "#7c3aed" : "#a0a0b8" }}>
                    {item.label.toUpperCase()}
                  </span>
                </button>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
