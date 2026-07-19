import React from 'react';
import { Share2, Calendar, Users, Ticket } from 'lucide-react';

export default function VariantA() {
  return (
    <div className="min-h-screen bg-[#0d001a] flex items-center justify-center p-4 font-sans">
      <div 
        className="w-full max-w-sm rounded-3xl p-5 relative text-white shadow-2xl"
        style={{ background: "linear-gradient(135deg, #3b0764 0%, #1e0036 100%)" }}
      >
        {/* Floating Share Button */}
        <button 
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/15 border border-white/20 flex items-center justify-center hover:bg-white/25 transition-colors z-10"
          aria-label="Compartir"
        >
          <Share2 className="w-4 h-4 text-white" />
        </button>

        <div className="flex justify-between items-start mb-6 mt-1 relative">
          <div>
            <span 
              className="inline-block px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase mb-3"
              style={{ backgroundColor: "hsl(42 98% 65%)", color: "#3b0764" }}
            >
              HOY
            </span>
            <h2 className="font-black text-2xl leading-tight max-w-[180px]" style={{ fontFamily: "Poppins, sans-serif" }}>
              Bingo Aniversario de Pando
            </h2>
          </div>
          
          <div className="text-right shrink-0 mt-8">
            <p className="font-black text-3xl leading-none" style={{ color: "hsl(42 98% 65%)" }}>
              Bs 500
            </p>
            <p className="text-white/60 text-xs mt-0.5">Premio</p>
          </div>
        </div>

        <div className="space-y-3 mb-6 bg-black/20 rounded-2xl p-4">
          <div className="flex items-center text-sm">
            <Calendar className="w-4 h-4 mr-3 text-white/70" />
            <span className="text-white/90">Lunes 20 de julio, 8:00 PM</span>
          </div>
          <div className="flex items-center text-sm">
            <Users className="w-4 h-4 mr-3 text-white/70" />
            <span className="text-white/90">128 participantes</span>
          </div>
          <div className="flex items-center text-sm">
            <Ticket className="w-4 h-4 mr-3 text-white/70" />
            <span className="text-white/90">Precio del cartón: <strong className="text-white">Bs 5</strong></span>
          </div>
        </div>

        <button 
          className="w-full py-3.5 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "hsl(42 98% 65%)", color: "#3b0764" }}
        >
          Comprar <span className="text-xl leading-none">→</span>
        </button>
      </div>
    </div>
  );
}
