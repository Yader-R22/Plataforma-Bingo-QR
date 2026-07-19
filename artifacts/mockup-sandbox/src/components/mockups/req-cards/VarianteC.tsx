export function VarianteC() {
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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex">

          {/* Left accent bar */}
          <div className="w-1 shrink-0" style={{ background: "#f59e0b" }} />

          <div className="flex-1 px-3.5 py-3.5">
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                  style={{ background: "#f59e0b" }}>
                  CM
                </div>
                <div>
                  <p className="font-bold text-[14px] text-gray-900 leading-tight">{req.user_full_name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(req.created_at).toLocaleDateString("es-BO")} · {req.user_department}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">
                  PENDIENTE
                </span>
                <span className="text-[10px] text-gray-400 font-medium">#{12}</span>
              </div>
            </div>

            {/* Info row — compact tags */}
            <div className="bg-gray-50 rounded-xl px-3 py-2 mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase w-5">CI</span>
                <span className="text-[12px] font-semibold text-gray-700">{req.user_ci}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase w-5">Tel</span>
                <span className="text-[12px] font-semibold text-gray-700">+591 {req.user_phone}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase w-5">Dpto</span>
                <span className="text-[12px] font-semibold text-gray-700">{req.user_department}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase w-5">Cta</span>
                <span className="text-[12px] font-semibold text-emerald-600">Activa ✓</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-1.5">
              <button className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white"
                style={{ background: "#10b981" }}>
                ✓ Aceptar
              </button>
              <button className="flex-1 py-2 rounded-xl text-[12px] font-bold text-purple-600 border-2 border-purple-300">
                ⏸ Espera
              </button>
              <button className="px-2.5 py-2 rounded-xl text-[12px] font-bold text-red-500 border-2 border-red-200">
                ✕
              </button>
              <button className="px-2.5 py-2 rounded-xl text-[12px] font-bold text-gray-400 border-2 border-gray-200">
                🗑
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
