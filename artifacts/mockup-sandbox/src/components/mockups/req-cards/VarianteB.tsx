export function VarianteB() {
  const req = {
    user_full_name: "Carlos Mamani Flores",
    user_ci: "12345678",
    user_department: "La Paz",
    user_phone: "78012345",
    user_status: "active",
    status: "pending",
    created_at: "2026-07-12T14:30:00Z",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex items-start justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Colored top bar */}
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #f59e0b, #fbbf24)" }} />

          <div className="px-4 py-3.5">
            {/* Top row: avatar + name + badge */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
                  CM
                </div>
                <div>
                  <p className="font-bold text-[14px] text-gray-900 leading-snug">{req.user_full_name}</p>
                  <p className="text-[11px] text-gray-400">Solicitud #{12}</p>
                </div>
              </div>
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                🕐 Pendiente
              </span>
            </div>

            {/* Info chips */}
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {[
                { icon: "🪪", text: `CI ${req.user_ci}` },
                { icon: "📍", text: req.user_department },
                { icon: "📱", text: `+591 ${req.user_phone}` },
                { icon: "📅", text: new Date(req.created_at).toLocaleDateString("es-BO") },
                { icon: "👤", text: req.user_status === "active" ? "Cuenta activa" : "Cuenta pendiente" },
              ].map(chip => (
                <span key={chip.text}
                  className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                  {chip.icon} {chip.text}
                </span>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-100 mb-3" />

            {/* Actions — two rows */}
            <div className="space-y-2">
              <button className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-1.5"
                style={{ background: "linear-gradient(90deg, #10b981, #059669)" }}>
                ✓ Aceptar solicitud
              </button>
              <div className="grid grid-cols-3 gap-1.5">
                <button className="py-2 rounded-xl text-[11px] font-bold border-2 border-purple-300 text-purple-600 flex items-center justify-center gap-1">
                  ⏸ Espera
                </button>
                <button className="py-2 rounded-xl text-[11px] font-bold border-2 border-red-200 text-red-500 flex items-center justify-center gap-1">
                  ✕ Rechazar
                </button>
                <button className="py-2 rounded-xl text-[11px] font-bold border-2 border-gray-200 text-gray-400 flex items-center justify-center gap-1">
                  🗑 Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
