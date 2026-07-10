import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { X, Download, Monitor } from "lucide-react";
import { useSiteSettings } from "../hooks/useSiteSettings";

type Platform = "android" | "desktop" | "ios" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

const DISMISSED_KEY = "pwa_install_dismissed_at";
const DISMISS_TTL = 24 * 60 * 60 * 1000;

export default function PWAInstallBanner() {
  const [location] = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const site = useSiteSettings();
  const appName = site.site_name;

  useEffect(() => {
    if (isStandalone()) return;
    if (location.startsWith("/admin")) return;

    const p = detectPlatform();
    setPlatform(p);
    if (p === "ios") return;

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed && Date.now() - parseInt(dismissed) < DISMISS_TTL) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShow(false);
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShow(false);
  }

  if (!show || !appName || location.startsWith("/admin")) return null;

  const isAndroid = platform === "android";

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-[9999]"
      style={{ animation: "slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
    >
      <div
        className="rounded-2xl p-4 flex items-center gap-3 shadow-2xl"
        style={{
          background: "linear-gradient(135deg, #1a0050, #2d0082)",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          {isAndroid
            ? <Download className="w-6 h-6 text-yellow-400" />
            : <Monitor className="w-6 h-6 text-yellow-400" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-sm leading-tight">
            {isAndroid ? `¡Instala ${appName}!` : `Instala ${appName} en tu PC`}
          </p>
          <p className="text-white/55 text-xs mt-0.5 leading-tight">
            {isAndroid
              ? "Juega más rápido directo desde tu celular"
              : "Abre la app sin navegador desde tu escritorio"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-2 rounded-xl text-xs font-black text-purple-950"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}
            aria-label="Cerrar"
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>
      </div>
    </div>
  );
}
