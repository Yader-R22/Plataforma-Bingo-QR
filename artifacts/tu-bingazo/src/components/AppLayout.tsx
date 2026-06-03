import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface NavItem {
  href: string;
  icon: string;
  label: string;
  authRequired?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/juegos", icon: "🎱", label: "Juegos" },
  { href: "/mis-cartones", icon: "🃏", label: "Cartones", authRequired: true },
  { href: "/billetera", icon: "💰", label: "Billetera", authRequired: true },
  { href: "/perfil", icon: "👤", label: "Perfil", authRequired: true },
];

export default function AppLayout({
  children,
  hideNav,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  const [location] = useLocation();
  const user = useAuthStore(s => s.user);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <Link href="/juegos">
          <div className="flex items-center gap-2 cursor-pointer">
            <span className="text-xl">🎱</span>
            <span className="font-black text-lg text-foreground">Tu Bingazo</span>
          </div>
        </Link>
        {user ? (
          <div className="flex items-center gap-2">
            {user.status === "active" && (
              <span className="text-xs font-semibold text-primary bg-primary/10 rounded-full px-2.5 py-1">
                Bs {user.balance.toLocaleString("es-BO", { minimumFractionDigits: 2 })}
              </span>
            )}
            <Link href="/perfil">
              <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center text-sm font-bold cursor-pointer">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
            </Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link href="/login">
              <span className="text-sm font-semibold text-primary cursor-pointer hover:underline">Entrar</span>
            </Link>
            <Link href="/registro">
              <span className="text-sm font-semibold bg-primary text-white rounded-lg px-3 py-1.5 cursor-pointer">Registro</span>
            </Link>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 pb-20">{children}</main>

      {/* Bottom navigation */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t flex">
          {NAV_ITEMS.filter(item => !item.authRequired || user).map(item => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <button className={`flex-1 flex flex-col items-center justify-center py-2 px-1 transition-colors min-w-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  <span className="text-xl leading-none">{item.icon}</span>
                  <span className={`text-[10px] mt-0.5 font-semibold ${isActive ? "text-primary" : "text-muted-foreground"}`}>{item.label}</span>
                </button>
              </Link>
            );
          })}
          {!user && (
            <>
              <Link href="/login">
                <button className="flex-1 flex flex-col items-center justify-center py-2 px-1">
                  <span className="text-xl leading-none">🔑</span>
                  <span className="text-[10px] mt-0.5 font-semibold text-muted-foreground">Entrar</span>
                </button>
              </Link>
              <Link href="/registro">
                <button className="flex-1 flex flex-col items-center justify-center py-2 px-1">
                  <span className="text-xl leading-none">✍️</span>
                  <span className="text-[10px] mt-0.5 font-semibold text-muted-foreground">Registro</span>
                </button>
              </Link>
            </>
          )}
        </nav>
      )}
    </div>
  );
}
