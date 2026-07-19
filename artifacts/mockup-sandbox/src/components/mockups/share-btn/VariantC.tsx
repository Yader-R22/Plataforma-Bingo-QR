import React from "react";

export function VariantC() {
  return (
    <div className="min-h-screen bg-[#0d001a] flex items-center justify-center p-4 font-sans text-white">
      <div 
        className="w-full max-w-sm rounded-3xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #3b0764 0%, #1e0036 100%)" }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col items-start gap-2">
            <span 
              className="text-xs font-bold px-2 py-1 rounded text-black"
              style={{ backgroundColor: "hsl(42 98% 65%)" }}
            >
              HOY
            </span>
            <h2 className="font-bold text-xl leading-tight" style={{ fontFamily: "Poppins, sans-serif" }}>
              Bingo Aniversario<br />de Pando
            </h2>
          </div>
          
          {/* Top Right - Variant C: Price and Share side by side */}
          <div className="flex flex-row gap-3 items-start shrink-0">
            <div className="text-right">
              <p className="font-black text-3xl leading-none" style={{ color: "hsl(42 98% 65%)", fontFamily: "Poppins, sans-serif" }}>
                Bs 500
              </p>
              <p className="text-white/60 text-xs mt-0.5 font-medium">Premio</p>
            </div>
            <button className="p-1.5 bg-white/15 hover:bg-white/20 transition-colors rounded-lg flex-shrink-0 text-white" aria-label="Compartir">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Info Rows */}
        <div className="space-y-3 mb-6 text-sm text-white/80">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
              <line x1="16" x2="16" y1="2" y2="6"></line>
              <line x1="8" x2="8" y1="2" y2="6"></line>
              <line x1="3" x2="21" y1="10" y2="10"></line>
            </svg>
            <span>Lunes 20 de julio, 8:00 PM</span>
          </div>
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>128 Participantes</span>
          </div>
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
              <rect width="20" height="14" x="2" y="5" rx="2"></rect>
              <line x1="2" x2="22" y1="10" y2="10"></line>
            </svg>
            <span>Cartón: Bs 5</span>
          </div>
        </div>

        {/* Action Button */}
        <button 
          className="w-full py-3.5 rounded-xl font-bold text-black flex items-center justify-center gap-2 transition-transform active:scale-95"
          style={{ backgroundColor: "hsl(42 98% 65%)" }}
        >
          Comprar
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"></path>
            <path d="m12 5 7 7-7 7"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default VariantC;
