import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";

interface AppLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "hsl(var(--primary))" : "none"} stroke={active ? "hsl(var(--primary))" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function IconGames({ active }: { active: boolean }) {
  const c = active ? "hsl(var(--primary))" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="9"/>
      <line x1="12" y1="15" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="9" y2="12"/>
      <line x1="15" y1="12" x2="22" y2="12"/>
    </svg>
  );
}

function IconCards({ active }: { active: boolean }) {
  const c = active ? "hsl(var(--primary))" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  );
}

function IconWallet({ active }: { active: boolean }) {
  const c = active ? "hsl(var(--primary))" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>
      <circle cx="17" cy="12" r="2"/>
    </svg>
  );
}

function IconProfile({ active }: { active: boolean }) {
  const c = active ? "hsl(var(--primary))" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IconLogin({ active }: { active: boolean }) {
  const c = active ? "hsl(var(--primary))" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
      <polyline points="10 17 15 12 10 7"/>
      <line x1="15" y1="12" x2="3" y2="12"/>
    </svg>
  );
}

function IconRegister({ active }: { active: boolean }) {
  const c = active ? "hsl(var(--primary))" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <line x1="19" y1="8" x2="19" y2="14"/>
      <line x1="22" y1="11" x2="16" y2="11"/>
    </svg>
  );
}

export default function AppLayout({ children, hideNav, title, showBack, onBack }: AppLayoutProps) {
  const [location] = useLocation();
  const user = useAuthStore(s => s.user);

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
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/perfil">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black cursor-pointer shrink-0 overflow-hidden"
                style={{ background: user.avatar_url ? "transparent" : "hsl(42 98% 52%)", color: "#1a0050" }}>
                {user.avatar_url
                  ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : user.full_name.charAt(0).toUpperCase()}
              </div>
            </Link>
          </div>
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
                <button className="w-full flex flex-col items-center justify-center py-2.5 gap-0.5 transition-all relative">
                  <div className={`transition-transform ${isActive ? "scale-110" : "scale-100"}`}
                    style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                    <Icon active={isActive} />
                  </div>
                  <span className="text-[9px] font-bold transition-colors"
                    style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                    {item.label}
                  </span>
                  {isActive && (
                    <div className="absolute bottom-0 w-6 h-0.5 rounded-full"
                      style={{ background: "hsl(var(--primary))" }} />
                  )}
                </button>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
