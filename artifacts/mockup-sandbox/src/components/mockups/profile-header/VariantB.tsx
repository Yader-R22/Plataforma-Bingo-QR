export function VariantB() {
  return (
    <div className="min-h-screen flex items-start justify-center" style={{ background: "#0f0030" }}>
      <div style={{ width: 390, overflow: "hidden", position: "relative" }}>
        {/* Cover band */}
        <div style={{
          height: 110,
          background: "linear-gradient(135deg, #3b0764 0%, #1e1b4b 50%, #1a0050 100%)",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 50%, rgba(168,85,247,0.4) 0%, transparent 70%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 80%, rgba(245,196,0,0.1) 0%, transparent 60%)" }} />
          {/* Pattern dots */}
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              width: 3, height: 3, borderRadius: "50%",
              background: "rgba(255,255,255,0.07)",
              left: `${(i % 8) * 14 + 5}%`,
              top: `${Math.floor(i / 8) * 38 + 12}%`,
            }} />
          ))}
          {/* Back + Settings */}
          <div style={{ position: "absolute", top: 14, left: 16, right: 16, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>← Volver</span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 18 }}>⚙️</span>
          </div>
        </div>

        {/* Avatar flotando sobre el cover */}
        <div style={{
          background: "linear-gradient(180deg, #1a0050 0%, #160040 100%)",
          padding: "0 20px 24px",
          position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: -40, marginBottom: 14 }}>
            {/* Avatar con doble ring */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                width: 82, height: 82, borderRadius: "50%",
                background: "linear-gradient(135deg, #f5c400, #ff7f00, #7c3aed)",
                padding: 3,
                boxShadow: "0 8px 32px rgba(245,196,0,0.4), 0 0 0 3px #1a0050",
              }}>
                <div style={{
                  width: "100%", height: "100%", borderRadius: "50%",
                  background: "linear-gradient(135deg, #fbbf24, #d97706)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 30, fontWeight: 900, color: "#1a0050",
                  fontFamily: "'Poppins', sans-serif",
                }}>
                  J
                </div>
              </div>
              {/* Botón cámara */}
              <div style={{
                position: "absolute", bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: 9,
                background: "#7c3aed",
                border: "2.5px solid #1a0050",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12,
              }}>
                📷
              </div>
            </div>

            {/* Nombre y CI */}
            <div style={{ paddingTop: 44 }}>
              <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 900, fontSize: 19, color: "#fff", margin: "0 0 2px", lineHeight: 1.2 }}>
                Juan Mamani
              </h1>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>CI: 7654321 · Santa Cruz</p>
            </div>

            {/* Spacer + Editar */}
            <div style={{ marginLeft: "auto", paddingTop: 44 }}>
              <button style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10, padding: "6px 14px",
                color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>
                Editar
              </button>
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            <span style={{
              background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)",
              color: "#86efac", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px",
            }}>✓ Activo</span>
            <span style={{
              background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.4)",
              color: "#c4b5fd", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px",
            }}>🔗 Activador</span>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { icon: "💰", label: "Saldo", value: "Bs 350" },
              { icon: "🎟️", label: "Cartones", value: "12" },
              { icon: "🏆", label: "Premios", value: "Bs 1.2k" },
            ].map((s, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14, padding: "12px 10px", textAlign: "center",
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 900, fontSize: 14, color: "hsl(42,98%,60%)", margin: "0 0 2px" }}>{s.value}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
