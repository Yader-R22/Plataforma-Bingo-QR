export function VariantC() {
  return (
    <div className="min-h-screen flex items-start justify-center" style={{ background: "#0f0030" }}>
      <div style={{ width: 390, overflow: "hidden" }}>
        {/* Hero card estilo premium */}
        <div style={{
          position: "relative",
          padding: "20px 20px 24px",
          background: "linear-gradient(150deg, #1a0050 0%, #2d0070 45%, #1a0050 100%)",
          overflow: "hidden",
        }}>
          {/* Círculo decorativo grande */}
          <div style={{
            position: "absolute", top: -60, right: -60,
            width: 220, height: 220, borderRadius: "50%",
            border: "1px solid rgba(245,196,0,0.15)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", top: -30, right: -30,
            width: 150, height: 150, borderRadius: "50%",
            border: "1px solid rgba(245,196,0,0.08)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: -20, left: -40,
            width: 160, height: 160, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          {/* Top row */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>← Volver</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 18 }}>⚙️</span>
          </div>

          {/* Avatar + Info horizontal */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {/* Outer glow ring */}
              <div style={{
                width: 88, height: 88, borderRadius: 24,
                background: "linear-gradient(135deg, #f5c400 0%, #ff6b00 40%, #7c3aed 100%)",
                padding: 2.5,
                boxShadow: "0 0 0 1px rgba(245,196,0,0.2), 0 8px 30px rgba(245,196,0,0.35), 0 0 50px rgba(124,58,237,0.2)",
              }}>
                <div style={{
                  width: "100%", height: "100%", borderRadius: 22,
                  background: "linear-gradient(135deg, #fbbf24, #d97706)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 34, fontWeight: 900, color: "#1a0050",
                  fontFamily: "'Poppins', sans-serif",
                }}>
                  J
                </div>
              </div>
              {/* Camera badge */}
              <div style={{
                position: "absolute", bottom: -4, right: -4,
                width: 30, height: 30, borderRadius: 10,
                background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                border: "2.5px solid #1a0050",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, cursor: "pointer",
                boxShadow: "0 4px 12px rgba(99,102,241,0.5)",
              }}>
                📷
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                fontFamily: "'Poppins', sans-serif", fontWeight: 900,
                fontSize: 20, color: "#fff", margin: "0 0 3px",
                lineHeight: 1.2, letterSpacing: "-0.2px",
              }}>
                Juan Mamani Quispe
              </h1>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "0 0 10px" }}>CI: 7654321 · Santa Cruz, BO</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{
                  background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.1))",
                  border: "1px solid rgba(34,197,94,0.4)",
                  color: "#6ee7b7", fontSize: 11, fontWeight: 700,
                  borderRadius: 8, padding: "3px 9px",
                }}>✓ Activo</span>
                <span style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))",
                  border: "1px solid rgba(139,92,246,0.45)",
                  color: "#c4b5fd", fontSize: 11, fontWeight: 700,
                  borderRadius: 8, padding: "3px 9px",
                }}>🔗 Activador</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)", marginBottom: 18 }} />

          {/* Stats row estilo pill */}
          <div style={{ display: "flex", gap: 0, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
            {[
              { label: "Saldo", value: "Bs 350", icon: "💰" },
              { label: "Cartones", value: "12", icon: "🎟️" },
              { label: "Premios", value: "Bs 1.2k", icon: "🏆" },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1, textAlign: "center", padding: "11px 6px",
                background: i === 0 ? "rgba(245,196,0,0.07)" : "rgba(255,255,255,0.04)",
                borderRight: i < 2 ? "1px solid rgba(255,255,255,0.07)" : "none",
              }}>
                <div style={{ fontSize: 14, marginBottom: 3 }}>{s.icon}</div>
                <p style={{
                  fontFamily: "'Poppins', sans-serif", fontWeight: 900,
                  fontSize: 14, color: i === 0 ? "hsl(42,98%,60%)" : "rgba(255,255,255,0.85)",
                  margin: "0 0 2px",
                }}>{s.value}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
