import React from 'react';
const { useState } = React;

// ═════════════════════════════════════════════════════════════════════
//  PRIVACY — informativa, versionamento del consenso e gate esplicito
//
//  ⚠️ NOTA LEGALE: questa informativa è cucita sui flussi dati REALI
//  dell'app (accertati sul codice e sullo schema DB), ma il Titolare è
//  responsabile della revisione finale — trattandosi di dati sulla
//  salute (art. 9 GDPR) e di possibili dati di minori, è consigliata
//  una revisione legale prima della pubblicazione.
//
//  Copia statica pubblicabile: public/privacy.html (tenere allineata!).
// ═════════════════════════════════════════════════════════════════════

// Versione dell'informativa: alzarla (nuova data) quando cambia la
// SOSTANZA del trattamento → il gate richiede un nuovo consenso a tutti.
export const PRIVACY_VERSIONE = "2026-07-04";

// Helper PURO (testabile): serve mostrare il gate di consenso?
// true se il record manca, è malformato, è stato revocato, o è di una
// versione precedente a quella corrente dell'informativa.
export function serveConsenso(record, versione = PRIVACY_VERSIONE) {
  if (!record || typeof record !== "object") return true;
  if (record.revocatoTs) return true;
  if (!record.salute) return true;                 // consenso art. 9 obbligatorio
  if (!record.versione || record.versione < versione) return true;
  return false;
}

// Costruisce un record di consenso completo (unico punto di verità sul formato)
export function nuovoConsenso() {
  return {
    versione: PRIVACY_VERSIONE,
    ts: new Date().toISOString(),
    salute: true,        // consenso esplicito art. 9 (misurazioni corporee)
    minori: true,        // dichiarazione di responsabilità genitoriale
  };
}

// ─── Contenuto dell'informativa ──────────────────────────────────────
const TITOLARE_NOME  = "Aureliano Procacci";
const TITOLARE_EMAIL = "aurelianoprocacci@gmail.com";
const RETENTION_INATTIVITA = "48 mesi";

const SEZIONI = [
  {
    t: "1. Titolare del trattamento",
    c: [
      `Il Titolare del trattamento è ${TITOLARE_NOME}, persona fisica, contattabile all'indirizzo email ${TITOLARE_EMAIL}.`,
      "Per qualsiasi richiesta relativa ai tuoi dati personali o all'esercizio dei tuoi diritti puoi scrivere a questo indirizzo.",
    ],
  },
  {
    t: "2. Quali dati trattiamo",
    c: [
      "Dati dell'account. Quando accedi tramite Google riceviamo il tuo indirizzo email e il tuo nome, e generiamo un identificativo utente interno. Non riceviamo né conserviamo la tua password Google.",
      "Dati del profilo. Nome, sesso, data di nascita, peso, altezza, livello di attività, numero di allenamenti, obiettivo, intensità della dieta e peso obiettivo: servono a calcolare il fabbisogno nutrizionale e a generare i piani alimentari.",
      "Dati relativi alla salute (categoria particolare — art. 9 GDPR). Le misurazioni corporee che inserisci volontariamente: peso nel tempo, circonferenze (collo, petto/seno, vita, fianchi, coscia, polpaccio) e le stime derivate (IMC, percentuale di massa grassa, massa magra). Per questi dati si applicano le tutele rafforzate descritte al punto 3.",
      "Dati d'uso dell'App. Piani dei pasti, lista della spesa, ricette create, registro dei pasti consumati, idratazione, preferenze e restrizioni alimentari.",
      "Dati di famiglia. Se crei o entri in una famiglia: il nome della famiglia, un codice di invito e l'associazione tra i membri. Un membro adulto può creare profili \u201ca carico\u201d per altre persone, inclusi minori (vedi punto 8).",
      "Non utilizziamo strumenti di analisi del comportamento, pubblicità o profilazione di terze parti.",
    ],
  },
  {
    t: "3. Basi giuridiche",
    c: [
      "Account e funzionamento dell'App: esecuzione del servizio che richiedi usando l'App (art. 6.1.b GDPR).",
      "Misurazioni corporee e dati sulla salute: tuo consenso esplicito (art. 9.2.a GDPR), raccolto al primo accesso e revocabile in ogni momento dalla sezione Opzioni. Senza questo consenso non è possibile usare le funzioni cloud dell'App; la revoca non pregiudica la liceità del trattamento già svolto.",
      "Profili a carico di minori: il consenso è prestato dall'adulto che esercita la responsabilità genitoriale (vedi punto 8).",
    ],
  },
  {
    t: "4. Finalità",
    c: [
      "I dati sono trattati esclusivamente per far funzionare l'App: calcolo del fabbisogno nutrizionale, generazione e personalizzazione dei piani alimentari, lista della spesa, tracciamento di pasti, idratazione e misurazioni, condivisione con i membri della tua famiglia e sincronizzazione tra i tuoi dispositivi.",
      "Nessun dato viene usato per marketing, venduto o ceduto a terzi.",
    ],
  },
  {
    t: "5. Dove sono i dati e per quanto tempo",
    c: [
      "I dati sincronizzati sono conservati su database Supabase ospitato a Francoforte (Unione Europea, regione eu-central-1). Una copia dei dati d'uso risiede sul tuo dispositivo per il funzionamento offline.",
      "Conservazione: i dati esistono solo per la durata del servizio. L'eliminazione dell'account (Opzioni → Elimina account) cancella in modo definitivo e totale tutti i dati dal cloud, in un'unica operazione. " +
      `Gli account inattivi da oltre ${RETENTION_INATTIVITA} potranno essere eliminati previa comunicazione all'indirizzo email dell'account.`,
    ],
  },
  {
    t: "6. Con chi condividiamo i dati",
    c: [
      "Supabase Inc. agisce come responsabile del trattamento (hosting del database in UE, accordo di trattamento dati sottoscritto).",
      "Google LLC interviene esclusivamente per l'autenticazione: quando scegli \u201cAccedi con Google\u201d, il flusso di login avviene sui sistemi di Google secondo la loro informativa.",
      "I membri della tua famiglia vedono i dati condivisi del nucleo (piano, spesa, ricette, profili) secondo il modello di accesso dell'App: ciascun membro può modificare solo i propri dati.",
      "Nessun altro soggetto riceve i tuoi dati. Nessun trasferimento extra-UE è effettuato dal Titolare.",
    ],
  },
  {
    t: "7. Cookie e archiviazione locale",
    c: [
      "L'App non usa cookie di profilazione, pubblicitari o di analisi: per questo non è mostrato alcun banner cookie.",
      "L'App usa esclusivamente archiviazione tecnica, strettamente necessaria al funzionamento: (a) il token di sessione Supabase (chiavi \u201csb-…\u201d nel localStorage) per mantenerti collegato; (b) i dati applicativi locali (chiavi \u201cpa__…\u201d) per il funzionamento offline: piano, log pasti, preferenze, impostazioni; (c) la cache del service worker con i file dell'App per l'uso senza connessione.",
      "Il login con Google può impostare cookie sui domini di Google durante il flusso di autenticazione: sono gestiti da Google secondo la loro informativa.",
      "I caratteri tipografici sono ospitati insieme all'App: aprendo Fitsy nessuna richiesta viene inviata a server di terze parti.",
    ],
  },
  {
    t: "8. Minori",
    c: [
      "L'App non è destinata all'uso autonomo da parte di minori di 14 anni.",
      "Un adulto può creare profili \u201ca carico\u201d per i minori del proprio nucleo familiare: in questo caso i dati del minore (incluse le misurazioni) sono inseriti e gestiti dall'adulto, che dichiara di esercitare la responsabilità genitoriale e presta il consenso per conto del minore.",
    ],
  },
  {
    t: "9. I tuoi diritti",
    c: [
      "Puoi esercitare in ogni momento i diritti previsti dagli artt. 15–22 GDPR: accesso, rettifica, cancellazione, limitazione, opposizione e portabilità.",
      "Direttamente dall'App: Opzioni → \u201c📦 I miei dati\u201d scarica una copia completa in formato JSON (portabilità); Opzioni → \u201cElimina account\u201d cancella definitivamente tutto; Opzioni → Privacy consente di revocare il consenso.",
      `Per tutto il resto scrivi a ${TITOLARE_EMAIL}. Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).`,
    ],
  },
  {
    t: "10. Sicurezza",
    c: [
      "Tutte le comunicazioni avvengono su canale cifrato (HTTPS). L'accesso ai dati nel database è vincolato da regole di sicurezza a livello di riga (Row Level Security): ogni utente può leggere solo i dati propri e della propria famiglia, e scrivere solo i propri.",
      "Non custodiamo password: l'autenticazione è delegata a Google.",
    ],
  },
  {
    t: "11. Modifiche a questa informativa",
    c: [
      "Questa informativa è versionata (data in testa). Se la sostanza del trattamento cambia, alla prima apertura successiva ti verrà chiesto di prendere visione della nuova versione e di rinnovare il consenso.",
    ],
  },
];

// ─── Pagina informativa (in-app, funziona anche offline) ─────────────
export function PrivacyPage({ onTorna }) {
  return (
    <div style={{padding:"18px 16px 30px",maxWidth:640,margin:"0 auto"}}>
      {onTorna && (
        <button onClick={onTorna}
          style={{border:"none",background:"transparent",color:"#2F6B3A",fontWeight:800,fontSize:13,cursor:"pointer",padding:"0 0 12px",display:"flex",alignItems:"center",gap:6}}>
          ← Torna
        </button>
      )}
      <h1 style={{fontSize:22,fontWeight:800,color:"#15251C",margin:"0 0 4px"}}>Informativa sulla privacy</h1>
      <div style={{fontSize:11,color:"#9DB1A2",marginBottom:6}}>Fitsy · versione {PRIVACY_VERSIONE}</div>
      <p style={{fontSize:13,color:"#3C5145",lineHeight:1.65,marginBottom:18}}>
        Questa informativa descrive come vengono trattati i dati personali degli utenti
        dell'applicazione <b>Fitsy</b> — pianificazione dei pasti, tracciamento nutrizionale
        e monitoraggio delle misurazioni corporee — ai sensi del Regolamento (UE) 2016/679 ("GDPR").
      </p>
      {SEZIONI.map(sec => (
        <div key={sec.t} style={{marginBottom:18}}>
          <h2 style={{fontSize:14.5,fontWeight:800,color:"#15251C",margin:"0 0 8px"}}>{sec.t}</h2>
          {sec.c.map((par, i) => (
            <p key={i} style={{fontSize:12.5,color:"#3C5145",lineHeight:1.65,margin:"0 0 8px"}}>{par}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Gate di consenso ────────────────────────────────────────────────
// Mostrato a schermo intero dopo il login finché serveConsenso() è true.
// Tre spunte obbligatorie: presa visione, consenso esplicito art. 9,
// dichiarazione di responsabilità genitoriale per eventuali profili minori.
export function ConsensoGate({ onAccetta, onRifiuta, onLeggiInformativa }) {
  const [visione, setVisione]   = useState(false);
  const [salute, setSalute]     = useState(false);
  const [minori, setMinori]     = useState(false);
  const [confermaRifiuto, setConfermaRifiuto] = useState(false);
  const tutte = visione && salute && minori;

  const Check = ({ on, set, children }) => (
    <label style={{display:"flex",gap:11,alignItems:"flex-start",padding:"11px 13px",background:on?"#F4FAEE":"#fff",border:`1.5px solid ${on?"#A9DDB8":"#E7EDE2"}`,borderRadius:12,cursor:"pointer",transition:"all 0.15s"}}>
      <input type="checkbox" checked={on} onChange={e=>set(e.target.checked)}
        style={{marginTop:2,width:17,height:17,accentColor:"#2F6B3A",flexShrink:0}}/>
      <span style={{fontSize:12.5,color:"#3C5145",lineHeight:1.55}}>{children}</span>
    </label>
  );

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(21,37,28,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#F7FAF3",width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto",borderRadius:"22px 22px 0 0",padding:"22px 18px calc(20px + env(safe-area-inset-bottom,0px))",boxShadow:"0 -18px 50px -20px rgba(0,0,0,0.5)"}}>
        <div style={{fontSize:26,marginBottom:6}}>🔒</div>
        <h2 style={{fontSize:19,fontWeight:800,color:"#15251C",margin:"0 0 6px"}}>La tua privacy, prima di tutto</h2>
        <p style={{fontSize:12.5,color:"#3C5145",lineHeight:1.6,margin:"0 0 14px"}}>
          Fitsy tratta dati sul tuo corpo e sulla tua alimentazione — anche dati
          relativi alla salute, che il GDPR protegge in modo rafforzato. Per usare
          le funzioni cloud serve il tuo consenso esplicito. Niente pubblicità,
          niente analytics, niente vendita di dati: solo il funzionamento dell'app.
        </p>
        <button onClick={onLeggiInformativa}
          style={{width:"100%",marginBottom:14,padding:"11px",borderRadius:12,border:"1.5px solid #CBE0B4",background:"#fff",color:"#2F6B3A",fontWeight:800,fontSize:13,cursor:"pointer"}}>
          📄 Leggi l'informativa completa
        </button>
        <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:16}}>
          <Check on={visione} set={setVisione}>
            Ho letto e compreso l'<b>informativa privacy</b> (versione {PRIVACY_VERSIONE}).
          </Check>
          <Check on={salute} set={setSalute}>
            <b>Acconsento espressamente</b> al trattamento dei miei dati relativi alla
            salute (peso, misurazioni corporee e stime derivate) per il calcolo del
            fabbisogno e la generazione dei piani — art. 9.2.a GDPR. Posso revocare
            il consenso in ogni momento da Opzioni.
          </Check>
          <Check on={minori} set={setMinori}>
            Se aggiungerò profili di <b>minori</b>, dichiaro di esercitare su di loro
            la responsabilità genitoriale e di prestare il consenso per loro conto.
          </Check>
        </div>
        <button disabled={!tutte} onClick={()=>onAccetta(nuovoConsenso())}
          style={{width:"100%",padding:"13px",borderRadius:13,border:"none",background:tutte?"#15251C":"#DDE6D6",color:tutte?"#C7F23E":"#9DB1A2",fontWeight:800,fontSize:14,cursor:tutte?"pointer":"default",transition:"all 0.2s",marginBottom:9}}>
          ✓ Accetto e continuo
        </button>
        <button onClick={()=>{ if (confermaRifiuto) onRifiuta(); else setConfermaRifiuto(true); }}
          style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid #E7EDE2",background:"transparent",color:confermaRifiuto?"#b91c1c":"#6E8576",fontWeight:700,fontSize:12.5,cursor:"pointer"}}>
          {confermaRifiuto
            ? "Confermi? Verrai disconnesso (i dati locali restano sul dispositivo)"
            : "Non accetto"}
        </button>
      </div>
    </div>
  );
}
