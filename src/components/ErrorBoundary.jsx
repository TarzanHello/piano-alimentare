import React from 'react';

// ── Rete di sicurezza globale ─────────────────────────────────
// Cattura QUALSIASI errore di rendering in un punto qualunque dell'app
// e, invece della schermata bianca, mostra un messaggio con azioni di
// recupero. Un dato malformato o un bug in una pagina non può più
// abbattere l'intera applicazione.
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary:", error, info); }

  render() {
    if (!this.state.error) return this.props.children;
    const reset = () => { this.setState({ error: null }); try { this.props.onReset && this.props.onReset(); } catch {} };
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"#EFF3EC"}}>
        <div style={{maxWidth:440,width:"100%",background:"#fff",border:"1.5px solid #E7EDE2",borderRadius:18,padding:"26px 22px",boxShadow:"0 8px 30px #00000012",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:8}}>🛠️</div>
          <div style={{fontSize:17,fontWeight:900,color:"#15251C",marginBottom:6}}>Qualcosa si è inceppato</div>
          <div style={{fontSize:12,color:"#6E8576",lineHeight:1.6,marginBottom:18}}>
            Si è verificato un problema in questa schermata, ma i tuoi dati sono al sicuro. Puoi tornare alla schermata principale o ricaricare l'app.
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={()=>{ reset(); }} style={{padding:"11px 18px",borderRadius:11,border:"none",background:"#2F6B3A",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>
              ← Torna alla home
            </button>
            <button onClick={()=>window.location.reload()} style={{padding:"11px 18px",borderRadius:11,border:"1.5px solid #E7EDE2",background:"#fff",color:"#4A6152",fontWeight:800,fontSize:13,cursor:"pointer"}}>
              Ricarica l'app
            </button>
          </div>
          <details style={{marginTop:16,textAlign:"left"}}>
            <summary style={{fontSize:10,color:"#9DB1A2",cursor:"pointer"}}>Dettagli tecnici</summary>
            <pre style={{marginTop:6,background:"#0f172a",color:"#fca5a5",fontSize:9,lineHeight:1.4,padding:"8px 10px",borderRadius:8,overflowX:"auto",whiteSpace:"pre-wrap"}}>{String(this.state.error?.message || this.state.error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
