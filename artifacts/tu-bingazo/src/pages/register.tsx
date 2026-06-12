import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEPARTMENTS = [
  "Beni", "Chuquisaca", "Cochabamba", "La Paz",
  "Oruro", "Pando", "Potosí", "Santa Cruz", "Tarija",
];

function PhotoCapture({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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
      <div
        className="relative rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden"
        style={{
          borderColor: value ? "hsl(var(--primary))" : "hsl(var(--border))",
          background: value ? "transparent" : "hsl(var(--muted))",
          minHeight: 100,
        }}
        onClick={() => inputRef.current?.click()}
      >
        {value ? (
          <div className="relative">
            <img src={value} alt={label} className="w-full h-28 object-cover" />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <span className="text-white text-sm font-bold">Cambiar</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-24 gap-1.5">
            <span className="text-3xl">📷</span>
            <span className="text-xs font-semibold text-muted-foreground">Toca para tomar o subir foto</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [step, setStep] = useState(1); // 1=personal, 2=docs, 3=location
  const [form, setForm] = useState({
    full_name: "", ci: "", phone: "", department: "",
    password: "", confirmPassword: "",
    id_photo_front: "", id_photo_back: "",
  });
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const [, navigate] = useLocation();

  // Referral code: from URL (?ref=CODE) or typed manually in form
  const referralCode = new URLSearchParams(window.location.search).get("ref") ?? "";
  const [manualRefCode, setManualRefCode] = useState("");
  const [refInfo, setRefInfo] = useState<{ activator_name: string; bonus_amount: number; bonus_title: string } | null>(null);
  useEffect(() => {
    if (!referralCode) return;
    fetch(`${BASE}/api/referrals/validate/${encodeURIComponent(referralCode)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.valid) setRefInfo(d); })
      .catch(() => {});
  }, [referralCode]);

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  // Auto-detect department from geolocation
  async function detectDepartment() {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=es`
          );
          const data = await res.json();
          const state = data.address?.state ?? "";
          // Match against Bolivian departments
          const match = DEPARTMENTS.find(d =>
            state.toLowerCase().includes(d.toLowerCase()) ||
            d.toLowerCase().includes(state.toLowerCase().split(" ")[0])
          );
          if (match) {
            update("department", match);
            toast.success(`📍 Departamento detectado: ${match}`);
          } else {
            toast("No se pudo detectar tu departamento. Selecciónalo manualmente.", { icon: "📍" });
          }
        } catch {
          toast("No se pudo detectar ubicación. Selecciónalo manualmente.", { icon: "📍" });
        }
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
        toast("Permiso de ubicación denegado. Selecciona tu departamento.", { icon: "📍" });
      },
      { timeout: 8000 }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error("Las contraseñas no coinciden"); return; }
    if (form.password.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }
    if (!form.department) { toast.error("Selecciona tu departamento"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name, ci: form.ci, phone: `+591${form.phone}`,
          department: form.department, password: form.password,
          id_photo_front: form.id_photo_front || undefined,
          id_photo_back: form.id_photo_back || undefined,
          referral_code: manualRefCode || referralCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al registrarse"); return; }
      setAuth(data.token, data.user);
      toast.success("¡Cuenta creada! Ya puedes usar la plataforma.");
      navigate("/");
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const stepValid1 = form.full_name && form.ci && form.phone && form.password && form.confirmPassword;
  const stepValid2 = form.id_photo_front && form.id_photo_back;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--grad-hero)" }}>
      {/* Header */}
      <div className="px-4 pt-safe pt-6 pb-4 text-center relative">
        <Link href="/login">
          <button className="absolute left-4 top-6 text-white/70 hover:text-white p-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
        </Link>
        <span className="text-3xl">🎱</span>
        <h1 className="text-white font-black text-xl mt-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Crear Cuenta
        </h1>
        <p className="text-white/60 text-sm">Tu Bingazo · Bolivia</p>
      </div>

      {/* Referral banner */}
      {refInfo && (
        <div className="mx-4 mb-2 rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: "hsl(42 98% 52% / 0.18)", border: "1px solid hsl(42 98% 52% / 0.4)" }}>
          <span className="text-2xl">🎁</span>
          <div>
            <p className="text-white font-black text-sm">¡Tienes un bono!</p>
            <p className="text-white/80 text-xs">Referido por {refInfo.activator_name} · Recibirás Bs {refInfo.bonus_amount} en bono al registrarte</p>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex justify-center gap-2 pb-4">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: s === step ? 28 : 8,
              background: s <= step ? "hsl(42 98% 52%)" : "rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </div>

      {/* Form card */}
      <div className="flex-1 bg-background rounded-t-[28px] px-4 pt-6 pb-8">
        <form onSubmit={handleSubmit}>
          {/* Step 1: Personal data */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-black text-lg mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>Datos Personales</h2>
                <p className="text-muted-foreground text-sm">Completa tu información para crear la cuenta</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-bold block mb-1.5">Nombre completo</label>
                  <input className="input-field" placeholder="Juan Mamani Quispe" value={form.full_name} onChange={e => update("full_name", e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1.5">Carnet de Identidad (CI)</label>
                  <input className="input-field" placeholder="1234567" value={form.ci} onChange={e => update("ci", e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1.5">Teléfono / WhatsApp</label>
                  <div className="input-field flex items-center gap-1.5 py-0 px-4">
                    <span className="text-sm font-semibold shrink-0 select-none" style={{ color: "hsl(var(--muted-foreground))" }}>
                      🇧🇴 +591
                    </span>
                    <span className="text-sm shrink-0" style={{ color: "hsl(var(--border))" }}>|</span>
                    <input
                      className="flex-1 py-3 text-sm bg-transparent outline-none min-w-0"
                      type="tel"
                      inputMode="numeric"
                      placeholder="70000000"
                      maxLength={8}
                      value={form.phone}
                      onChange={e => update("phone", e.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1.5">Contraseña</label>
                  <input className="input-field" type="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={e => update("password", e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1.5">Confirmar contraseña</label>
                  <input className="input-field" type="password" placeholder="Repite la contraseña" value={form.confirmPassword} onChange={e => update("confirmPassword", e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1.5">
                    Código de activador <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <input
                    className="input-field uppercase tracking-widest"
                    placeholder="Ej: A3F2C9B1"
                    maxLength={8}
                    value={manualRefCode}
                    onChange={e => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                      setManualRefCode(val);
                      if (val.length === 8) {
                        fetch(`${BASE}/api/referrals/validate/${encodeURIComponent(val)}`)
                          .then(r => r.ok ? r.json() : null)
                          .then(d => { if (d?.valid) { setRefInfo(d); toast.success(`✅ Código válido · Activador: ${d.activator_name}`); } else if (val.length === 8) toast.error("Código de activador no válido"); })
                          .catch(() => {});
                      } else if (!val) setRefInfo(null);
                    }}
                  />
                  {refInfo && <p className="text-xs font-bold mt-1" style={{ color: "hsl(142 70% 35%)" }}>✅ Activador: {refInfo.activator_name} · Bono Bs {refInfo.bonus_amount}</p>}
                </div>
              </div>
              <button
                type="button"
                className="btn-primary mt-2"
                disabled={!stepValid1}
                onClick={() => {
                  if (form.password !== form.confirmPassword) { toast.error("Las contraseñas no coinciden"); return; }
                  if (form.password.length < 6) { toast.error("Contraseña muy corta"); return; }
                  setStep(2);
                }}
              >
                Continuar →
              </button>
            </div>
          )}

          {/* Step 2: Document photos */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-black text-lg mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>Fotos de tu CI</h2>
                <p className="text-muted-foreground text-sm">
                  Necesitamos verificar tu identidad con fotos claras de tu Carnet de Identidad
                </p>
              </div>
              <div
                className="rounded-2xl p-3 text-sm flex items-start gap-2"
                style={{ background: "hsl(42 98% 52% / 0.12)", border: "1px solid hsl(42 98% 52% / 0.3)" }}
              >
                <span>🔒</span>
                <span className="text-xs text-foreground/80">
                  Tus fotos se almacenan de forma segura y solo son usadas para verificación de identidad.
                </span>
              </div>
              <PhotoCapture label="Anverso del CI (foto frontal)" value={form.id_photo_front} onChange={v => update("id_photo_front", v)} />
              <PhotoCapture label="Reverso del CI (foto trasera)" value={form.id_photo_back} onChange={v => update("id_photo_back", v)} />
              <div className="flex gap-2">
                <button type="button" className="flex-1 font-bold rounded-[14px] border-2 py-3" style={{ borderColor: "hsl(var(--border))" }} onClick={() => setStep(1)}>
                  ← Volver
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1"
                  style={{ width: "auto" }}
                  disabled={!stepValid2}
                  onClick={() => setStep(3)}
                >
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Department */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-black text-lg mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>Tu Ubicación</h2>
                <p className="text-muted-foreground text-sm">¿En qué departamento de Bolivia te encuentras?</p>
              </div>

              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-bold text-sm transition-all"
                style={{
                  borderColor: "hsl(var(--primary))",
                  color: "hsl(var(--primary))",
                  background: geoLoading ? "hsl(var(--primary) / 0.05)" : "transparent",
                }}
                onClick={detectDepartment}
                disabled={geoLoading}
              >
                {geoLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "hsl(var(--primary))", borderTopColor: "transparent" }} />
                    Detectando ubicación...
                  </>
                ) : (
                  <>📍 Detectar mi departamento automáticamente</>
                )}
              </button>

              <div className="relative text-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                <span className="relative bg-background px-3 text-xs text-muted-foreground">o selecciona manualmente</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {DEPARTMENTS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update("department", d)}
                    className="py-2.5 px-2 rounded-xl text-xs font-bold border-2 transition-all"
                    style={{
                      borderColor: form.department === d ? "hsl(var(--primary))" : "hsl(var(--border))",
                      background: form.department === d ? "hsl(var(--primary) / 0.1)" : "transparent",
                      color: form.department === d ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {form.department && (
                <div
                  className="text-center py-2 rounded-xl text-sm font-bold"
                  style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
                >
                  ✓ {form.department} seleccionado
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" className="flex-1 font-bold rounded-[14px] border-2 py-3" style={{ borderColor: "hsl(var(--border))" }} onClick={() => setStep(2)}>
                  ← Volver
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  style={{ width: "auto" }}
                  disabled={loading || !form.department}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Creando...
                    </span>
                  ) : "🎉 Crear Cuenta"}
                </button>
              </div>
            </div>
          )}
        </form>

        {step === 1 && (
          <p className="mt-5 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-bold text-primary">Iniciar sesión</Link>
          </p>
        )}
      </div>
    </div>
  );
}
