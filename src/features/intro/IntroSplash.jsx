import React from 'react';
const { useEffect, useState } = React;

// Splash introduttivo Fitsy — animazione ~2s mostrata all'apertura dell'app.
// Grafica inversa (fondo Ink) + logo ad anello animato.
// Per mostrarlo SOLO alla primissima apertura, vedi la nota in main.jsx.
export function IntroSplash({ onDone }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setClosing(true), 2000);   // inizia il dissolvenza
    const t2 = setTimeout(() => onDone && onDone(), 2380);  // smonta
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg,#15251C 0%,#11201A 55%,#0d1813 100%)",
      opacity: closing ? 0 : 1, transition: "opacity 0.36s ease",
      pointerEvents: closing ? "none" : "auto", overflow: "hidden",
    }}>
      <style>{`
        @keyframes fy-pop{0%{transform:scale(.62);opacity:0}60%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes fy-draw{from{stroke-dashoffset:880}to{stroke-dashoffset:237}}
        @keyframes fy-dot{0%{transform:scale(0);opacity:0}70%{transform:scale(1.3);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes fy-rise{from{opacity:0;transform:translateY(5vmin)}to{opacity:1;transform:translateY(0)}}
        @keyframes fy-fade{from{opacity:0;transform:translateY(1.4vmin)}to{opacity:1;transform:translateY(0)}}
        @keyframes fy-glow{0%,100%{opacity:.10}50%{opacity:.18}}
        .fy-lw{animation:fy-pop .6s cubic-bezier(.2,.8,.3,1.15) both}
        .fy-arc{animation:fy-draw .9s .15s cubic-bezier(.3,.7,.2,1) both}
        .fy-dot{animation:fy-dot .4s .6s cubic-bezier(.2,.8,.3,1.5) both}
        .fy-wm{animation:fy-rise .55s .95s cubic-bezier(.2,.8,.3,1) both}
        .fy-tag{animation:fy-fade .55s 1.45s ease-out both}
        .fy-glow{animation:fy-glow 2.4s ease-in-out infinite}
      `}</style>

      {/* bagliori lime inversi */}
      <div className="fy-glow" style={{ position: "absolute", width: "100vmin", height: "100vmin", borderRadius: "50%", background: "radial-gradient(circle,#C7F23E 0%,transparent 62%)", opacity: .12, right: "-34vmin", top: "-30vmin", filter: "blur(6px)" }} />
      <div className="fy-glow" style={{ position: "absolute", width: "62vmin", height: "62vmin", borderRadius: "50%", background: "radial-gradient(circle,#2F6B3A 0%,transparent 65%)", opacity: .16, left: "-22vmin", bottom: "-20vmin" }} />

      {/* logo animato */}
      <div className="fy-lw" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "5.5vmin", zIndex: 2 }}>
        <div style={{ position: "relative", width: "46vmin", height: "46vmin" }}>
          <svg width="100%" height="100%" viewBox="0 0 360 360" style={{ transform: "rotate(-90deg)", display: "block" }}>
            <circle cx="180" cy="180" r="140" fill="none" stroke="#28412f" strokeWidth="30" />
            <circle className="fy-arc" cx="180" cy="180" r="140" fill="none" stroke="#C7F23E" strokeWidth="30" strokeLinecap="round" strokeDasharray="880" style={{ strokeDashoffset: 880 }} />
          </svg>
          <div style={{ position: "absolute", left: "50%", top: "7%", transform: "translateX(-50%)" }}>
            <div className="fy-dot" style={{ width: "3.8vmin", height: "3.8vmin", borderRadius: "50%", background: "#C7F23E", boxShadow: "0 0 4vmin 0.6vmin rgba(199,242,62,0.5)" }} />
          </div>
        </div>
        <div className="fy-wm" style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: "21vmin", letterSpacing: "-0.05em", lineHeight: 1, color: "#F4F7EF" }}>f<span style={{ color: "#C7F23E" }}>i</span>tsy</div>
        <div className="fy-tag" style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 500, fontSize: "4.3vmin", letterSpacing: "0.02em", color: "#7FA890", marginTop: "-2vmin" }}>Nutrizione intelligente</div>
      </div>
    </div>
  );
}
