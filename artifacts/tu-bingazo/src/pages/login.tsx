import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function LoginPage() {
  const [ci, setCi] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const [, navigate] = useLocation();

  const [showForgot, setShowForgot] = useState(false);
  const [forgotCi, setForgotCi] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotCi.trim()) return;
    setForgotLoading(true);
    try {
      await fetch(`${BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ci: forgotCi.trim() }),
      });
      setForgotSent(true);
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ci, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "CI o contraseña incorrectos"); return; }
      setAuth(data.token, data.user);
      if (data.user.must_change_password) {
        toast.warning("🔑 Tienes una contraseña temporal. Cámbiala ahora para continuar.", { duration: 6000 });
        navigate("/perfil");
      } else {
        toast.success(`¡Bienvenido, ${data.user.full_name.split(" ")[0]}! 🎉`);
        if (data.user.is_admin) navigate("/admin");
        else navigate("/");
      }
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--grad-hero)" }}>
      {/* Modal ¿Olvidaste tu contraseña? */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => { setShowForgot(false); setForgotSent(false); setForgotCi(""); }}>
          <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10"
            onClick={e => e.stopPropagation()}>
            {!forgotSent ? (
              <>
                <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-6" />
                <h3 className="font-black text-xl mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  🔑 Recuperar contraseña
                </h3>
                <p className="text-sm text-muted-foreground mb-5">
                  Ingresa tu CI y el administrador te enviará una contraseña temporal por WhatsApp.
                </p>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="text-sm font-bold block mb-1.5">Carnet de Identidad (CI)</label>
                    <input
                      className="input-field"
                      placeholder="Ej: 1234567"
                      inputMode="numeric"
                      value={forgotCi}
                      onChange={e => setForgotCi(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={forgotLoading || !forgotCi.trim()}>
                    {forgotLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Enviando...
                      </span>
                    ) : "Solicitar contraseña temporal"}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="font-black text-xl mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  ¡Solicitud enviada!
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  El administrador revisará tu solicitud y te enviará una contraseña temporal por <strong>WhatsApp</strong>.
                </p>
                <p className="text-xs text-muted-foreground mb-6">
                  Una vez que la recibas, inicia sesión y el sistema te pedirá cambiarla.
                </p>
                <button className="btn-primary" onClick={() => { setShowForgot(false); setForgotSent(false); setForgotCi(""); }}>
                  Entendido
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Decorative elements */}
      <div className="absolute top-10 left-6 text-6xl opacity-10 pointer-events-none select-none rotate-12">🎱</div>
      <div className="absolute top-24 right-4 text-4xl opacity-10 pointer-events-none select-none -rotate-6">⭐</div>
      <div className="absolute top-40 left-1/2 text-2xl opacity-10 pointer-events-none select-none">✦</div>

      {/* Top section */}
      <div className="flex-1 flex flex-col items-center justify-end px-4 pb-6 pt-16 relative z-10">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mb-5 shadow-2xl"
          style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)" }}
        >
          🎱
        </div>
        <h1 className="text-4xl font-black text-white text-center" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Tu Bingazo
        </h1>
        <p className="text-white/60 text-sm mt-1 text-center">Bingo en vivo desde Bolivia 🇧🇴</p>
      </div>

      {/* Form card */}
      <div
        className="px-5 pt-7 pb-10 relative z-10"
        style={{
          background: "white",
          borderRadius: "28px 28px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
        }}
      >
        <h2 className="font-black text-2xl mb-6" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Iniciar Sesión
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-bold block mb-1.5 text-foreground">Carnet de Identidad (CI)</label>
            <input
              className="input-field"
              placeholder="Ej: 1234567"
              value={ci}
              onChange={e => setCi(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-sm font-bold text-foreground">Contraseña</label>
              <span className="text-xs font-semibold cursor-pointer" style={{ color: "hsl(var(--primary))" }}
                onClick={() => setShowForgot(true)}>
                ¿Olvidaste tu contraseña?
              </span>
            </div>
            <input
              className="input-field"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="btn-primary mt-2" disabled={loading || !ci || !password}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Verificando...
              </span>
            ) : "Iniciar Sesión"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{" "}
          <Link href="/registro">
            <span className="font-bold cursor-pointer" style={{ color: "hsl(var(--primary))" }}>
              Crear cuenta gratis
            </span>
          </Link>
        </p>
      </div>
    </div>
  );
}
