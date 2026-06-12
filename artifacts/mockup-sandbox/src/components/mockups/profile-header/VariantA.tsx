export function VariantA() {
  return (
    <div className="min-h-screen flex items-start justify-center" style={{ background: "#0f0030" }}>
      <div style={{
        width: 390,
        background: "linear-gradient(160deg, #1a0050 0%, #2d0080 60%, #1a0050 100%)",
        paddingBottom: 28,
        overflow: "hidden",
        position: "relative",
      }}>
        {/* Glow orbs */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(120,40,255,0.35) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: -30, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,160,0,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 0" }}>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>← Volver</span>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 20 }}>⚙️</span>
        </div>

        {/* Avatar centrado */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20 }}>
          <div style={{ position: "relative", marginBottom: 14 }}>
            {/* Ring exterior dorado */}
            <div style={{
              width: 100, height: 100, borderRadius: "50%",
              padding: 3,
              background: "linear-gradient(135deg, #f5c400, #ff8c00, #a855f7, #6366f1)",
              boxShadow: "0 0 24px rgba(245,196,0,0.5), 0 0 48px rgba(168,85,247,0.2)",
            }}>
              <div style={{
                width: "100%", height: "100%", borderRadius: "50%",
                background: "linear-gradient(135deg, #f5c400, #d97706)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, fontWeight: 900, color: "#1a0050",
                fontFamily: "'Poppins', sans-serif",
                border: "3px solid #1a0050",
              }}>
                J
              </div>
            </div>
            {/* Botón cámara */}
            <div style={{
              position: "absolute", bottom: 2, right: 2,
              width: 28, height: 28, borderRadius: 10,
              background: "linear-gradient(135deg, #7c3aed, #6366f1)",
              border: "2px solid #1a0050",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(99,102,241,0.5)",
            }}>
              📷
            </div>
          </div>

          {/* Nombre */}
          <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 900, fontSize: 22, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.3px" }}>
            Juan Mamani Quispe
          </h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: "0 0 12px" }}>CI: 7654321</p>

          {/* Badges */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <span style={{
              background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)",
              color: "#86efac", fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "4px 12px",
            }}>✓ Activo</span>
            <span style={{
              background: "linear-gradient(135deg,rgba(99,102,241,0.25),rgba(139,92,246,0.25))",
              border: "1px solid rgba(99,102,241,0.5)",
              color: "#c4b5fd", fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "4px 12px",
            }}>🔗 Activador</span>
          </div>

          {/* Stats row */}
          <div style={{
            display: "flex", gap: 0,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 18, overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
            width: "calc(100% - 40px)",
          }}>
            {[
              { label: "Saldo", value: "Bs 350" },
              { label: "Cartones", value: "12" },
              { label: "Premios", value: "Bs 1.200" },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1, textAlign: "center", padding: "12px 8px",
                borderRight: i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 900, fontSize: 15, color: "hsl(42, 98%, 60%)", margin: 0 }}>{s.value}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
