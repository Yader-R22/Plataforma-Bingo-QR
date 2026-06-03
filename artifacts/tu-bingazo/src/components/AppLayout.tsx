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

export default function AppLayout({ children, hideNav, title, showBack, onBack }: AppLayoutProps) {
  const [location, navigate] = useLocation();
  const user = useAuthStore(s => s.user);

  const navItems = [
    { href: "/", icon: "🏠", label: "Inicio" },
    { href: "/juegos", icon: "🎱", label: "Juegos" },
    ...(user ? [
      { href: "/mis-cartones", icon: "🃏", label: "Cartones" },
      { href: "/billetera", icon: "💰", label: "Billetera" },
      { href: "/perfil", icon: "👤", label: "Perfil" },
    ] : [
      { href: "/login", icon: "🔑", label: "Entrar" },
      { href: "/registro", icon: "✍️", label: "Registro" },
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
          <button
            onClick={onBack ?? (() => window.history.back())}
            className="text-white/80 hover:text-white p-1 -ml-1"
          >
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

        {title && !showBack && (
          <h1 className="flex-1 text-center text-white font-bold text-base pr-8">{title}</h1>
        )}
        {title && showBack && (
          <h1 className="flex-1 text-center text-white font-bold text-base">{title}</h1>
        )}

        {!title && (
          <div className="flex-1" />
        )}

        {user ? (
          <div className="flex items-center gap-2 shrink-0">
            {user.status === "active" && (
              <div
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,200,0,0.2)", color: "hsl(42 98% 60%)" }}
              >
                Bs {user.balance.toLocaleString("es-BO", { minimumFractionDigits: 2 })}
              </div>
            )}
            <Link href="/perfil">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black cursor-pointer shrink-0"
                style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}
              >
                {user.full_name.charAt(0).toUpperCase()}
              </div>
            </Link>
          </div>
        ) : (
          <div className="flex gap-2 shrink-0">
            <Link href="/login">
              <span className="text-sm font-bold text-white/80 hover:text-white cursor-pointer">Entrar</span>
            </Link>
            <Link href="/registro">
              <span
                className="text-sm font-bold px-3 py-1.5 rounded-xl cursor-pointer"
                style={{ background: "hsl(42 98% 52%)", color: "#1a0050" }}
              >Registro</span>
            </Link>
          </div>
        )}
      </header>

      {/* Content */}
      <main className={hideNav ? "flex-1" : "flex-1 safe-pb"}>{children}</main>

      {/* Bottom navigation */}
      {!hideNav && (
        <nav
          className="bottom-nav fixed bottom-0 left-0 right-0 z-40 grid nav-safe"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, 1fr)` }}
        >
          {navItems.map(item => {
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <button className="w-full flex flex-col items-center justify-center py-2 gap-0.5 transition-all">
                  <span className={`text-xl leading-none transition-transform ${isActive ? "scale-110" : "scale-100"}`}>
                    {item.icon}
                  </span>
                  <span
                    className="text-[9px] font-bold transition-colors"
                    style={{ color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                  >
                    {item.label}
                  </span>
                  {isActive && (
                    <div
                      className="absolute bottom-0 w-6 h-0.5 rounded-full"
                      style={{ background: "hsl(var(--primary))" }}
                    />
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
