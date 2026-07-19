export function VarianteA() {
  const statusMap: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    pending:  { label: "Pendiente",  color: "#d97706", bg: "#fef3c7", dot: "#f59e0b" },
    accepted: { label: "Activo",     color: "#059669", bg: "#d1fae5", dot: "#10b981" },
    hold:     { label: "En espera",  color: "#7c3aed", bg: "#ede9fe", dot: "#8b5cf6" },
    suspended:{ label: "Suspendido", color: "#d97706", bg: "#fef3c7", dot: "#f59e0b" },
    banned:   { label: "Baneado",    color: "#dc2626", bg: "#fee2e2", dot: "#ef4444" },
    rejected: { label: "Rechazado",  color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" },
  };

  const req = {
    id: 1,
    user_full_name: "Carlos Mamani Flores",
    user_ci: "12345678",
    user_department: "La Paz",
    user_phone: "78012345",
    user_status: "active",
    status: "pending",
    created_at: "2026-07-12T14:30:00Z",
    notes: null,
  };

  const sc = statusMap[req.status];
  const initials = req.user_full_name.split(" ").slice(0,2).map(w => w[0]).join("");

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex items-start justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header strip */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-black shrink-0 text-white"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15px] text-gray-900 leading-tight truncate">{req.user_full_name}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">CI {req.user_ci} · {req.user_department}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
              style={{ color: sc.color, background: sc.bg }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
              {sc.label}
            </span>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100 mx-4" />

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Teléfono</p>
              <p className="text-[13px] font-semibold text-gray-700">+591 {req.user_phone}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Solicitud</p>
              <p className="text-[13px] font-semibold text-gray-700">{new Date(req.created_at).toLocaleDateString("es-BO")}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Departamento</p>
              <p className="text-[13px] font-semibold text-gray-700">{req.user_department}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Cuenta</p>
              <p className="text-[13px] font-semibold text-gray-700">{req.user_status === "active" ? "✅ Activa" : "⏳ Pendiente"}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100 mx-4" />

          {/* Actions */}
          <div className="flex gap-2 px-4 py-3">
            <button className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white"
              style={{ background: "#10b981" }}>
              ✓ Aceptar
            </button>
            <button className="px-3 py-2 rounded-xl text-[12px] font-bold border-2 border-purple-400 text-purple-600">
              ⏸
            </button>
            <button className="px-3 py-2 rounded-xl text-[12px] font-bold border-2 border-red-300 text-red-500">
              ✕
            </button>
            <button className="px-3 py-2 rounded-xl text-[12px] font-bold border-2 border-gray-200 text-gray-400">
              🗑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
