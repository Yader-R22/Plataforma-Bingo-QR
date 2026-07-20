import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { toast } from "sonner";
import { useSetLayoutConfig } from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEPARTMENTS = [
  "Beni", "Chuquisaca", "Cochabamba", "La Paz",
  "Oruro", "Pando", "Potosí", "Santa Cruz", "Tarija",
];

const DEPT_CENTROIDS: Array<{ name: string; lat: number; lon: number }> = [
  { name: "Beni",       lat: -13.8, lon: -65.4 },
  { name: "Chuquisaca", lat: -20.1, lon: -64.3 },
  { name: "Cochabamba", lat: -17.0, lon: -65.9 },
  { name: "La Paz",     lat: -16.5, lon: -68.1 },
  { name: "Oruro",      lat: -18.5, lon: -67.2 },
  { name: "Pando",      lat: -11.0, lon: -67.6 },
  { name: "Potosí",     lat: -20.6, lon: -65.7 },
  { name: "Santa Cruz", lat: -17.0, lon: -61.8 },
  { name: "Tarija",     lat: -21.5, lon: -63.4 },
];

function detectDepartmentFromCoords(lat: number, lon: number): string | null {
  if (lat < -23 || lat > -9 || lon < -70 || lon > -57) return null;
  let nearest = DEPT_CENTROIDS[0];
  let minDist = Infinity;
  for (const dept of DEPT_CENTROIDS) {
    const dist = (lat - dept.lat) ** 2 + (lon - dept.lon) ** 2;
    if (dist < minDist) { minDist = dist; nearest = dept; }
  }
  return nearest!.name;
}

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
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        onChange(canvas.toDataURL("image/webp", 0.85));
      };
      img.src = ev.target?.result as string;
    };
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
  useSetLayoutConfig({ hideNav: true, hideTopBar: true });
  const site = useSiteSettings();
  const [step, setStep] = useState(1); // 1=personal, 2=docs, 3=location
  const [form, setForm] = useState({
    full_name: "", ci: "", phone: "", department: "",
    password: "", confirmPassword: "",
    id_photo_front: "", id_photo_back: "",
  });
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoAttempted, setGeoAttempted] = useState(false);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const hasTerms = !!(site.terms_and_conditions?.trim());
  const { setAuth } = useAuthStore();
  const [, navigate] = useLocation();

  // Referral code: from URL (?ref=CODE) or typed manually in form
  const referralCode = new URLSearchParams(window.location.search).get("ref") ?? "";
  const [manualRefCode, setManualRefCode] = useState(referralCode.toUpperCase());
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

  // No auto-trigger: geolocation must come from a direct user gesture
  // or iOS/Android silently blocks the permission prompt.

  // Auto-detect department from geolocation (local lookup, no external API)
  function detectDepartment() {
    if (!navigator.geolocation) {
      setGeoAttempted(true);
      setShowManualPicker(true);
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dept = detectDepartmentFromCoords(pos.coords.latitude, pos.coords.longitude);
        if (dept) {
          update("department", dept);
        } else {
          setShowManualPicker(true);
        }
        setGeoAttempted(true);
        setGeoLoading(false);
      },
      () => {
        setGeoAttempted(true);
        setGeoLoading(false);
        setShowManualPicker(true);
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
      if (!res.ok) {
        if (res.status === 409) {
          toast.error("Ya tenés una cuenta con ese CI. ¿Querés iniciar sesión?", {
            action: { label: "Iniciar sesión", onClick: () => navigate("/login") },
            duration: 6000,
          });
        } else {
          toast.error(data.error || "Error al registrarse");
        }
        return;
      }
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
        <span className="text-3xl">{site.site_emoji || "🎱"}</span>
        <h1 className="text-white font-black text-xl mt-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
          Crear Cuenta
        </h1>
        <p className="text-white/60 text-sm">{site.site_name ? `${site.site_name} · Bolivia` : "Bolivia"}</p>
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
                  <input className="input-field" placeholder="Helen Reyes Guzman" value={form.full_name} onChange={e => update("full_name", e.target.value.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s]/g, ""))} required />
                </div>
                <div>
                  <label className="text-sm font-bold block mb-1.5">Carnet de Identidad (CI)</label>
                  <input className="input-field" placeholder="1234567" inputMode="numeric" value={form.ci} onChange={e => update("ci", e.target.value.replace(/\D/g, ""))} required />
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
                <p className="text-muted-foreground text-sm">¿En qué departamento de Bolivia te encontrás?</p>
              </div>

              {/* Botón detectar — debe ser un gesto directo del usuario */}
              <button
                type="button"
                onClick={detectDepartment}
                disabled={geoLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95"
                style={{
                  borderColor: geoLoading ? "hsl(var(--border))" : "hsl(var(--primary) / 0.5)",
                  background: geoLoading ? "hsl(var(--muted))" : "hsl(var(--primary) / 0.06)",
                  color: geoLoading ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))",
                }}
              >
                {geoLoading
                  ? <><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "hsl(var(--primary))", borderTopColor: "transparent" }} /> Detectando...</>
                  : <>📍 Detectar mi ubicación automáticamente</>}
              </button>

              {/* Detectado con éxito */}
              {geoAttempted && !geoLoading && form.department && !showManualPicker && (
                <div
                  className="flex items-center justify-between px-4 py-3.5 rounded-2xl"
                  style={{ background: "hsl(var(--primary) / 0.1)", border: "2px solid hsl(var(--primary))" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📍</span>
                    <div>
                      <p className="text-xs text-muted-foreground leading-none mb-0.5">Departamento detectado</p>
                      <p className="font-black text-base" style={{ color: "hsl(var(--primary))" }}>{form.department}</p>
                    </div>
                  </div>
                  <button type="button" className="text-xs font-bold underline"
                    style={{ color: "hsl(var(--primary))" }}
                    onClick={() => setShowManualPicker(true)}>
                    Cambiar
                  </button>
                </div>
              )}

              {/* Falló detección o usuario quiere cambiar → mostrar grid */}
              {!geoLoading && (showManualPicker || (geoAttempted && !form.department)) && (
                <div className="space-y-3">
                  {geoAttempted && !form.department && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm"
                      style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                      <span>⚠️</span>
                      <span>No se pudo detectar. Seleccioná tu departamento:</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {DEPARTMENTS.map(d => (
                      <button key={d} type="button"
                        onClick={() => { update("department", d); setShowManualPicker(false); }}
                        className="py-2.5 px-2 rounded-xl text-xs font-bold border-2 transition-all"
                        style={{
                          borderColor: form.department === d ? "hsl(var(--primary))" : "hsl(var(--border))",
                          background: form.department === d ? "hsl(var(--primary) / 0.1)" : "transparent",
                          color: form.department === d ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                        }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* T&C checkbox — solo aparece si el admin definió los términos */}
              {hasTerms && (
                <div
                  className="rounded-2xl p-3 flex items-start gap-3 cursor-pointer select-none"
                  style={{
                    background: termsAccepted ? "hsl(var(--primary) / 0.08)" : "hsl(var(--muted))",
                    border: `1.5px solid ${termsAccepted ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                    transition: "all 0.2s",
                  }}
                  onClick={() => setTermsAccepted(v => !v)}
                >
                  <div
                    className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center mt-0.5"
                    style={{
                      background: termsAccepted ? "hsl(var(--primary))" : "transparent",
                      border: `2px solid ${termsAccepted ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    {termsAccepted && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <p className="text-sm leading-snug flex-1">
                    He leído y acepto los{" "}
                    <button
                      type="button"
                      className="font-black underline"
                      style={{ color: "hsl(var(--primary))" }}
                      onClick={e => { e.stopPropagation(); setShowTermsModal(true); }}
                    >
                      Términos y Condiciones
                    </button>
                  </p>
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
                  disabled={loading || !form.department || (hasTerms && !termsAccepted)}
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

      {/* Modal de Términos y Condiciones */}
      {showTermsModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowTermsModal(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-background rounded-t-[28px] sm:rounded-2xl flex flex-col"
            style={{ maxHeight: "85vh" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <h2 className="font-black text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  Términos y Condiciones
                </h2>
              </div>
              <button
                onClick={() => setShowTermsModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "hsl(var(--muted))" }}
                aria-label="Cerrar"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M1 1l12 12M13 1L1 13"/>
                </svg>
              </button>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                {site.terms_and_conditions}
              </p>
            </div>

            {/* Botones de acción */}
            <div className="px-5 pb-6 pt-3 flex gap-2 shrink-0" style={{ borderTop: "1px solid hsl(var(--border))" }}>
              <button
                type="button"
                className="flex-1 font-bold rounded-[14px] border-2 py-3 text-sm"
                style={{ borderColor: "hsl(var(--border))" }}
                onClick={() => setShowTermsModal(false)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                style={{ width: "auto" }}
                onClick={() => { setTermsAccepted(true); setShowTermsModal(false); }}
              >
                ✓ Acepto los términos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
