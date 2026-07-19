import React from "react";
import { Share2, Calendar, Users, ArrowRight } from "lucide-react";

export function VariantB() {
  return (
    <div className="min-h-screen bg-[#0d001a] flex items-center justify-center p-4 font-sans">
      <div 
        className="w-full max-w-sm rounded-3xl p-5 relative overflow-hidden shadow-2xl"
        style={{ background: "linear-gradient(135deg, #3b0764 0%, #1e0036 100%)", boxShadow: "0 25px 50px -12px rgba(59, 7, 100, 0.5)" }}
      >
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/20 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none" />
        
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="pr-4">
            <div className="inline-block px-2.5 py-1 rounded-full text-xs font-bold mb-3" style={{ backgroundColor: "hsl(42 98% 65% / 0.15)", color: "hsl(42 98% 65%)" }}>
              HOY
            </div>
            <h2 className="text-white font-bold text-xl leading-tight" style={{ fontFamily: "Poppins, sans-serif" }}>
              Bingo Aniversario<br/>de Pando
            </h2>
          </div>
          
          <div className="text-right shrink-0 flex flex-col items-end">
            <p className="font-black text-3xl leading-none" style={{ color: "hsl(42 98% 65%)" }}>
              Bs 500
            </p>
            <p className="text-white/60 text-xs mt-1 mb-2">Premio</p>
            
            <button className="flex items-center gap-1 bg-white/20 hover:bg-white/30 transition-colors text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10 mt-0.5">
              <Share2 className="w-3 h-3" />
              <span>Compartir</span>
            </button>
          </div>
        </div>

        <div className="space-y-2.5 mb-6 relative z-10">
          <div className="flex items-center text-white/90 text-sm bg-white/5 rounded-xl p-3 backdrop-blur-sm border border-white/5">
            <Calendar className="w-4 h-4 mr-3 text-white/50" />
            <span>Lunes 20 de julio, 8:00 PM</span>
          </div>
          <div className="flex items-center text-white/90 text-sm bg-white/5 rounded-xl p-3 backdrop-blur-sm border border-white/5">
            <Users className="w-4 h-4 mr-3 text-white/50" />
            <span>128 participantes</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 relative z-10">
          <div>
            <p className="text-white/60 text-xs mb-0.5">Precio cartón</p>
            <p className="text-white font-bold text-xl leading-none">Bs 5</p>
          </div>
          <button 
            className="flex items-center gap-2 font-bold px-6 py-3 rounded-xl text-[#1e0036] transition-transform hover:scale-105 active:scale-95 shadow-lg"
            style={{ backgroundColor: "hsl(42 98% 65%)", boxShadow: "0 4px 14px 0 hsl(42 98% 65% / 0.39)" }}
          >
            Comprar <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default VariantB;