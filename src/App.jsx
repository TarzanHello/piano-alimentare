import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DAYS, DB, DEFAULT_NOTIF, DEFAULT_PERSONAS, ING_QTY, MEAL_KEYS, MEAL_FASCIA, OBIETTIVI, normalizeAttivita, parseDataIT, SK_EXCL, SK_HISTORY, SK_MEALS_LOG, SK_MISURE, SK_MY_PERSONA, SK_NOTIF, SK_OVERRIDES, SK_PERSONAS, SK_PREFS, SK_SEED, SK_SPESA, SK_TARGET_GIORNALIERO, SK_FROZEN, buildShoppingForDayObjects, applyOverrides, applyOverridesWeek, buildShoppingPerPersona, contaOverrides, filtraOverrides, overridesForPersona, scriviOverride, tuttiOverrideMeals, autoFlagSaltati, calcTargetAdattivo, classifySwap, computePrefScore, dateForOffset, dateKeyForDayIdx, dateKeyForOffset, emojiBySesso, generateWeekPlan, getPrefEntry, grammiDaQuantita, grammiRicettaCalc, hoursUntilMeal, localDateKey, meseCorrente, migrateIdList, migrateMealsLog, migrateOverrides, migraOverridesASettimana, normalizePrefs, overrideKey, pianoPersonalizzato, planForWeek, regeneraPlanState, restoreCustomING_QTY, ricalcolaMacroAdattati, ricettaUtenteToMealObj, scheduleNotifications, seedForWeek, slotForPersona, todayDayIndex, weekIndexForDate, weekdayForDate } from '@/core';
import { SwipeContainer } from '@/components/shared';
import { FamigliaPage } from '@/features/famiglia/FamigliaPage';
import { GustiPage } from '@/features/gusti/GustiPage';
import { RicettePage } from '@/features/ricette/RicettePage';
import { IngredientiPage } from '@/features/ingredienti/IngredientiPage';
import { MisurePage } from '@/features/misure/MisurePage';
import { OpzioniPage } from '@/features/opzioni/OpzioniPage';
import { OggiPage } from '@/features/oggi/OggiPage';
import { StrumentiPage } from '@/features/strumenti/StrumentiPage';
import { MigrationWizard } from '@/features/famiglia/MigrationWizard';
import { UtentePage } from '@/features/utente/UtentePage';
import { startSync, autoClaimSingle, pushTargetGiornaliero } from '@/db/sync';
import { caricaRicette, ricetteCachePersistita } from '@/db/ricetteCloud';
import { logSync } from '@/db/synclog';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SyncTestPage } from '@/features/test/SyncTestPage';
import { SyncLogPage } from '@/features/log/SyncLogPage';
import { cloudEnabled } from '@/db/cloud';
import { MealCard, TotaleBar, WaterTracker } from '@/features/piano/MealParts';
import { ShoppingPage } from '@/features/spesa/ShoppingPage';
import { ToastHost, toast } from '@/components/toast';
import { PrivacyPage, ConsensoGate, PRIVACY_VERSIONE, serveConsenso } from '@/features/privacy/informativa';
import { leggiConsensoCloud, salvaConsensoCloud } from '@/db/consenso';
import { signOut } from '@/db/cloud';

// Rimappa i colori-profilo legacy sul nuovo sistema verde:
// il vecchio blu brand (#2563eb) diventa il verde brand (#2F6B3A).
// Gli altri colori-persona (rosa, ecc.) restano identificatori distinti.
const LEGACY_PERSONA_COLORS = { "#2563eb": "#2F6B3A" };
function remapPersonaColors(list) {
  if (!Array.isArray(list)) return list;
  return list.map(p => (p && LEGACY_PERSONA_COLORS[p.color]) ? { ...p, color: LEGACY_PERSONA_COLORS[p.color] } : p);
}

// Carosello giorni: finestra mobile [oggi−3 … oggi … oggi+3], oggi al centro,
// scorrevole col dito (scroll-snap), etichette a data reale. `selOffset` è
// l'offset in giorni rispetto a oggi (0 = oggi).
function DayCarousel({ selOffset, onSelect, color }) {
  const ref = useRef(null);
  // Finestra mobile: ±14 giorni = almeno 2 settimane avanti e 2 indietro da oggi.
  const offsets = Array.from({length:29}, (_,i)=>i-14);
  useEffect(() => {
    const el = ref.current && ref.current.querySelector(`[data-off="${selOffset}"]`);
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ inline:"center", block:"nearest", behavior:"smooth" }); } catch { el.scrollIntoView(); }
    }
  }, [selOffset]);
  return (
    <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"stretch"}}>
      {/* Chip "torna a oggi": appare solo quando il giorno selezionato non è oggi */}
      {selOffset!==0 && (
        <button onClick={()=>onSelect(0)} title="Torna a oggi"
          style={{flex:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:"9px 11px",borderRadius:14,border:"none",background:"#15251C",color:"#C7F23E",cursor:"pointer",boxShadow:"0 8px 16px -6px #15251C88"}}>
          <span style={{fontSize:13,lineHeight:1}}>⌂</span>
          <span style={{fontSize:9,fontWeight:800,letterSpacing:0.3}}>OGGI</span>
        </button>
      )}
      <div ref={ref}
      onTouchStart={e=>e.stopPropagation()}
      onTouchMove={e=>e.stopPropagation()}
      onTouchEnd={e=>e.stopPropagation()}
      style={{flex:1,minWidth:0,display:"flex",gap:8,overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",paddingBottom:4,scrollbarWidth:"none"}}>
      {offsets.map(off => {
        const d = dateForOffset(off);
        const sel = selOffset === off;
        const isToday = off === 0;
        const label = isToday ? "OGGI" : DAYS[(d.getDay()+6)%7].slice(0,3).toUpperCase();
        return (
          <button key={off} data-off={off} onClick={()=>onSelect(off)}
            style={{flex:"0 0 auto",minWidth:62,scrollSnapAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"9px 12px",borderRadius:14,border:sel?"none":(isToday?`1.5px solid ${color}`:"1.5px solid #E7EDE2"),background:sel?color:"#fff",cursor:"pointer",transition:"all 0.2s",boxShadow:sel?`0 8px 16px -6px ${color}88`:"none"}}>
            <span style={{fontSize:9.5,fontWeight:800,color:sel?"#ffffffcc":(isToday?color:"#9DB1A2")}}>{label}</span>
            <span style={{fontSize:16,fontWeight:800,color:sel?"#fff":"#4A6152",fontFamily:"'Outfit',sans-serif"}}>{d.getDate()}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}

export function App() {
  const [page, setPage]               = useState("oggi");
  const [menuOpen, setMenuOpen]       = useState(false);  // bottom-sheet del menu secondario
  const [selOffset, setSelOffset]     = useState(0);   // giorno selezionato relativo a OGGI (−14…+14, 0 = oggi)
  const [selPersonaId, setSelPersonaId] = useState(null);
  const [myPersonaId, setMyPersonaId] = useState(null);
  const [seed, setSeed]               = useState(null);  // = baseSeed della sequenza settimanale
  const [frozen, setFrozen]           = useState({});    // { [weekIndex]: seed } settimane passate congelate
  const [history, setHistory]         = useState([]);
  const [plan, setPlan]               = useState(null);
  const [excluded, setExcluded]       = useState([]);
  const [personas, setPersonas]       = useState([]);
  const [booted, setBooted]           = useState(false);
  const [spinning, setSpinning]       = useState(false);
  const [targetOpen, setTargetOpen]   = useState(false); // dettagli card Target (collassati di default)
  const [confermaRegen, setConfermaRegen] = useState(false); // doppio tap su "Genera nuovo piano"
  const regenTimerRef = useRef(null);
  // Hint "tocca ogni pasto" in Piano: dismissibile e persistito
  const [hintPiano, setHintPiano] = useState(()=>{ try { return localStorage.getItem("pa__hint-piano-ok")!=="1"; } catch { return true; } });
  // Spesa consumo-aware (per persona): default attivo, persistito
  const [spesaConsumo, setSpesaConsumo] = useState(()=>{ try { return localStorage.getItem("pa__spesa-consumo")!=="0"; } catch { return true; } });
  // ── Consenso privacy (GDPR) ──
  // Specchio locale per il check istantaneo; il cloud (profilo_dati,
  // chiave "consenso") è la fonte di verità cross-device. Il gate viene
  // mostrato solo quando la verifica è conclusa (consensoPronto) e il
  // record manca / è revocato / è di una versione precedente.
  const [consenso, setConsenso] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("pa__consenso")||"null"); } catch { return null; }
  });
  const [consensoPronto, setConsensoPronto] = useState(false);
  const consensoCheckRef = useRef(false); // verifica cloud one-shot per sessione
  // Strumenti di diagnostica (Test Sync / Log Sync) nel menu: nascosti di
  // default, attivabili con 7 tap sul footer di Opzioni (persistito)
  const [devMode, setDevMode] = useState(()=>{ try { return localStorage.getItem("pa__dev")==="1"; } catch { return false; } });
  // Salto "Oggi → Piano" con drawer di sostituzione già aperto sul pasto
  const [swapDaOggi, setSwapDaOggi] = useState(null); // mealKey | null
  const [regenNeeded, setRegenNeeded] = useState(false);
  const [spesaChecks, setSpesaChecks] = useState({});   // { [seed]: { [itemId]: true } }
  const [cloudStatus, setCloudStatus] = useState({ loggedIn:false, inFamily:false });
  const [cloudMigrated, setCloudMigrated] = useState(true); // finché non sappiamo, niente wizard
  const [misureApp, setMisureApp]     = useState({});
  const [overrides, setOverrides]     = useState({}); // { "dayIdx-mealKey": ricettaObj }
  const [prefs, setPrefs]             = useState({ recipes:{}, contextSwaps:[] });
  const [mealsLog, setMealsLog]       = useState({});
  const [notifSettings, setNotifSettings] = useState(DEFAULT_NOTIF);
  const [swUpdate, setSwUpdate]       = useState(false); // nuova versione disponibile
  // Cache dei target giornalieri pushati dagli owner: { [profilo_id]: targetObj }
  // Usato da personaTarget per i profili non-propri (fonte di verità cloud).
  const [targetsCloud, setTargetsCloud] = useState({});
  // Ricette personali/famiglia caricate dal cloud — alimentano il pool del piano.
  // FIX flash al boot: il primo piano veniva generato PRIMA del caricamento
  // cloud, quindi senza le ricette utente. Idratando lo stato dall'ultima
  // lista nota persistita, la prima generazione le include già.
  const [ricetteUtente, setRicetteUtente] = useState(() => ricetteCachePersistita() || []);
  // Set di id-ricetta esclusi dal piano: catalogo (localStorage cat-escluse) + utente (flag esclusa)
  const [ricetteEscluseIds, setRicetteEscluseIds] = useState(() => {
    try {
      const cat = JSON.parse(localStorage.getItem("cat-escluse")||"[]");
      // Anche le esclusioni delle ricette utente arrivano dalla cache,
      // così il primo piano rispetta subito i flag "esclusa"
      const usrEscluse = (ricetteCachePersistita() || []).filter(r => r.esclusa);
      return new Set([...cat, ...usrEscluse.map(r => "usr_" + r.id), ...usrEscluse.map(r => r.id)]);
    } catch { return new Set(); }
  });

  // ── Cloud sync: avvio, stato e applicazione degli aggiornamenti remoti ──
  useEffect(()=>{
    if (!cloudEnabled) return;
    startSync();
    let primoStatus = true;
    const onStatus = (e)=> {
      const s = e.detail||{};
      setCloudStatus(s);
      // A ogni avvio: se l'utente non è connesso, la prima pagina è Utente
      if (primoStatus) {
        primoStatus = false;
        if (!s.loggedIn) setPage("utente");
      }
      // Verifica del consenso privacy: cloud → specchio locale → gate.
      // In modalità locale (non collegato) il gate non serve: i dati non
      // lasciano il dispositivo e il Titolare non li tratta.
      if (s.loggedIn && s.me?.profiloId) {
        // onStatus scatta a ogni evento (anche realtime): la verifica
        // cloud del consenso è one-shot per sessione, non un loop.
        // NB: niente return anticipato — sotto c'è il caricamento ricette.
        if (!consensoCheckRef.current) {
          consensoCheckRef.current = true;
          leggiConsensoCloud().then(cloudRec => {
          let localRec = null;
          try { localRec = JSON.parse(localStorage.getItem("pa__consenso")||"null"); } catch {}
          if (cloudRec) {
            // Il cloud comanda: allinea lo specchio locale
            setConsenso(cloudRec);
            try { localStorage.setItem("pa__consenso", JSON.stringify(cloudRec)); } catch {}
          } else if (localRec && !serveConsenso(localRec, PRIVACY_VERSIONE)) {
            // Consenso valido solo in locale (es. dato offline): riportalo sul cloud
            setConsenso(localRec);
            salvaConsensoCloud(localRec);
          }
          setConsensoPronto(true);
        }).catch(()=>setConsensoPronto(true));
        }
      } else if (!s.loggedIn) {
        consensoCheckRef.current = false;
        setConsensoPronto(false);
      }
      // Carica le ricette utente non appena connesso (alimentano il pool del piano)
      if (s.loggedIn) {
        caricaRicette().then(rs => {
          setRicetteUtente(rs);
          aggiornaEscluse(rs);
        }).catch(()=>{});
      } else {
        // Sessione assente: al boot è spesso solo transitoria (nel log
        // reale "Nessuna sessione" 1s prima del ripristino). Non degradare
        // a lista vuota: il piano perderebbe le ricette utente e verrebbe
        // rigenerato "monco". Al logout con cambio account ci pensa il
        // wipe dei dati locali, che azzera anche la cache pa__ricette-cache.
      }
    };
    const onUpdate = async (e)=>{
      const k = e.detail?.key;
      const read = async (sk, fb) => { try { const r = await window.storage.get(sk); return JSON.parse(r.value); } catch { return fb; } };
      switch(k){
        case "personas": { const v = await read(SK_PERSONAS, null); if (Array.isArray(v)&&v.length) setPersonas(remapPersonaColors(v)); break; }
        case "misure":   { const v = await read(SK_MISURE, null); if (v) setMisureApp(v); break; }
        case "mealsLog": { const v = await read(SK_MEALS_LOG, null); if (v) setMealsLog(v); break; }
        case "prefs":    { const v = await read(SK_PREFS, null); if (v) setPrefs(normalizePrefs(v)); break; }
        case "excluded": { const v = await read(SK_EXCL, null); if (Array.isArray(v)) { setExcluded(v); } break; }
        case "spesa":    { const v = await read(SK_SPESA, null); if (v) setSpesaChecks(v); break; }
        case "history":  { const v = await read(SK_HISTORY, null); if (Array.isArray(v)) setHistory(v); break; }
        case "targetGiornaliero": { const v = await read(SK_TARGET_GIORNALIERO, null); if (v) setTargetsCloud(v); break; }
        case "cloudMe": {
          // Il cloud ha confermato l'identità dell'utente (profiloId corretto).
          // Aggiorna myPersonaId e selPersonaId subito, senza aspettare la fine
          // della reconcile: evita il "flash" del profilo default all'avvio.
          const pid = e.detail?.myPersonaId || e.detail?.profiloId;
          if (pid) {
            setMyPersonaId(pid);
            setSelPersonaId(prev => prev || pid); // non sovrascrive se già selezionato
          }
          break;
        }
        case "piano":    {
          const seedCloud = parseInt(e.detail.seed, 10), ovrCloud = e.detail.overrides || {};
          if (isNaN(seedCloud) || seedCloud <= 0) break;
          const frozenCloud = (e.detail.frozen && typeof e.detail.frozen==="object") ? e.detail.frozen : {};
          const cur = weekIndexForDate(new Date());
          const np = planForWeek({baseSeed:seedCloud, frozen:frozenCloud}, cur, { excludedIds: excludedRef.current || [], ricetteUtente, ricetteEscluseIds });
          setSeed(seedCloud); setFrozen(frozenCloud); setPlan(np); setOverrides(migraOverridesASettimana(ovrCloud, cur)); setRegenNeeded(false);
          break;
        }
      }
    };
    window.addEventListener("pf-cloud-status", onStatus);
    window.addEventListener("pf-cloud-update", onUpdate);
    return ()=>{ window.removeEventListener("pf-cloud-status", onStatus); window.removeEventListener("pf-cloud-update", onUpdate); };
  },[]);
  // Nuova versione del service worker pronta → mostra l'avviso "Aggiorna"
  useEffect(()=>{
    const onSwUpdate = ()=> setSwUpdate(true);
    window.addEventListener("pf-sw-update", onSwUpdate);
    return ()=> window.removeEventListener("pf-sw-update", onSwUpdate);
  },[]);
  // Auto-claim: se sul dispositivo c'è UNA sola persona, l'associazione
  // col profilo cloud avviene da sola, senza wizard
  useEffect(()=>{
    if (cloudStatus.inFamily && !cloudMigrated && personas.length === 1) {
      autoClaimSingle(personas[0]).then(()=>setCloudMigrated(true)).catch(()=>{});
    }
  },[cloudStatus.inFamily, cloudMigrated, personas]);

  // ref per leggere le esclusioni correnti dentro il listener stabile
  const excludedRef = useRef([]);
  useEffect(()=>{ excludedRef.current = excluded; },[excluded]);

  // ── Spunte lista spesa: persistenti per piano (seed) e sincronizzate ──
  // Spesa: aggiornamento ottimistico locale + scrittura cloud come fonte di verità.
  // Il cloud è authoritative: lo stato locale viene sempre sostitiuito dal pull.
  const handleToggleSpesa = useCallback(async (itemId)=>{
    const nuovoStato = !((spesaChecks[String(seed)]||{})[itemId]);
    logSync("spesa", `${nuovoStato ? "Articolo spuntato" : "Spunta rimossa"}: ${itemId}`, { itemId, seed: String(seed).slice(-6) });
    setSpesaChecks(prev=>{
      const wk = { ...(prev[String(seed)]||{}) };
      if (nuovoStato) wk[itemId]=true; else delete wk[itemId];
      return { ...prev, [String(seed)]: wk };
    });
    // Scrivi sul cloud (fonte di verità): il pull successivo aggiorna tutti i device
    if (cloudEnabled) {
      try {
        const { toggleSpesaItem } = await import('@/db/sync');
        await toggleSpesaItem(itemId, nuovoStato);
      } catch(e) {
        // se il cloud fallisce, ripristina lo stato precedente
        setSpesaChecks(prev=>{
          const wk = { ...(prev[String(seed)]||{}) };
          if (!nuovoStato) wk[itemId]=true; else delete wk[itemId];
          return { ...prev, [String(seed)]: wk };
        });
      }
    } else {
      // modalità locale: salva in storage
      setSpesaChecks(prev=>{
        const next = { ...prev };
        window.storage.set(SK_SPESA, JSON.stringify(next)).catch(()=>{});
        return next;
      });
    }
  },[seed, spesaChecks]);
  const handleResetSpesa = useCallback(async ()=>{
    logSync("spesa", "Lista spesa azzerata", { seed: String(seed).slice(-6) });
    setSpesaChecks(prev=>({ ...prev, [String(seed)]: {} }));
    if (cloudEnabled) {
      try {
        const { resetSpesaSeed } = await import('@/db/sync');
        await resetSpesaSeed(String(seed));
      } catch {}
    } else {
      setSpesaChecks(prev=>{
        const next = { ...prev, [String(seed)]: {} };
        window.storage.set(SK_SPESA, JSON.stringify(next)).catch(()=>{});
        return next;
      });
    }
  },[seed]);

  useEffect(()=>{
    async function load(){
      logSync("info", "Avvio app: caricamento dati locali");
      try {
        const [sS,hS,eS,pS,mS,miS,ovS,prS,mlS,nfS,spS,cmS,frS] = await Promise.allSettled([
          window.storage.get(SK_SEED), window.storage.get(SK_HISTORY), window.storage.get(SK_EXCL),
          window.storage.get(SK_PERSONAS), window.storage.get(SK_MY_PERSONA), window.storage.get(SK_MISURE),
          window.storage.get(SK_OVERRIDES), window.storage.get(SK_PREFS),
          window.storage.get(SK_MEALS_LOG), window.storage.get(SK_NOTIF),
          window.storage.get(SK_SPESA), window.storage.get("pf-cloud-migrated"),
          window.storage.get(SK_FROZEN),
        ]);
        const parsedSeed = sS.status==="fulfilled"&&sS.value ? parseInt(sS.value.value, 10) : NaN;
        const loadedSeed = (!isNaN(parsedSeed) && parsedSeed > 0) ? parsedSeed : Date.now();
        // FIX: persisti subito il seed se mancava, altrimenti ogni refresh
        // genererebbe un piano nuovo (Date.now() diverso a ogni avvio)
        if (isNaN(parsedSeed) || parsedSeed <= 0) {
          window.storage.set(SK_SEED, String(loadedSeed)).catch(()=>{});
        }
        const safeParse = (res, fallback) => {
          try {
            if (res.status==="fulfilled" && res.value) {
              const v = JSON.parse(res.value.value);
              return v;
            }
          } catch {}
          return fallback;
        };
        const loadedHist = (() => { const v = safeParse(hS, []); return Array.isArray(v) ? v : []; })();
        setSpesaChecks((() => { const v = safeParse(spS, {}); return (v && typeof v==="object" && !Array.isArray(v)) ? v : {}; })());
        setCloudMigrated(cmS.status==="fulfilled" && cmS.value && cmS.value.value === "1");
        // Migrazione ID legacy (database unificato CRA-NUT): traduce i vecchi
        // ID ing_* nei dati salvati e ri-persiste solo se qualcosa è cambiato.
        const rawExcl = (() => { const v = safeParse(eS, []); return Array.isArray(v) ? v : []; })();
        const loadedExcl = migrateIdList(rawExcl);
        if (JSON.stringify(loadedExcl) !== JSON.stringify(rawExcl)) {
          window.storage.set(SK_EXCL, JSON.stringify(loadedExcl)).catch(()=>{});
        }
        const loadedPersRaw = safeParse(pS, []);
        const loadedPersBase = Array.isArray(loadedPersRaw) ? loadedPersRaw : [];
        // Migrazione attività: deriva lavoro+allenamenti dal vecchio `stile`
        // (coppie equivalenti: stesso LAF, nessun cambio di target) e ri-persiste.
        const loadedPers = remapPersonaColors(loadedPersBase.map(p =>
          (p.lavoro !== undefined && p.allenamenti !== undefined) ? p : { ...p, ...normalizeAttivita(p) }
        ));
        if (JSON.stringify(loadedPers) !== JSON.stringify(loadedPersBase)) {
          window.storage.set(SK_PERSONAS, JSON.stringify(loadedPers)).catch(()=>{});
        }
        const loadedMyP  = mS.status==="fulfilled"&&mS.value ? mS.value.value : loadedPers[0]?.id;
        const loadedMisu = (() => { const v = safeParse(miS, {}); return (v && typeof v==="object" && !Array.isArray(v)) ? v : {}; })();
        const loadedOvrd = (() => {
          const v = safeParse(ovS, {});
          const raw = (v && typeof v==="object" && !Array.isArray(v)) ? v : {};
          const migrated = migrateOverrides(raw);
          if (JSON.stringify(migrated) !== JSON.stringify(raw)) {
            window.storage.set(SK_OVERRIDES, JSON.stringify(migrated)).catch(()=>{});
          }
          return migrated;
        })();
        const loadedPrefs = normalizePrefs(safeParse(prS, null));
        const loadedMealsLog = (() => {
          const v = safeParse(mlS, {});
          const raw = (v && typeof v==="object" && !Array.isArray(v)) ? v : {};
          const migrated = migrateMealsLog(raw);
          if (JSON.stringify(migrated) !== JSON.stringify(raw)) {
            window.storage.set(SK_MEALS_LOG, JSON.stringify(migrated)).catch(()=>{});
          }
          return migrated;
        })();
        const loadedNotif = (() => { const v = safeParse(nfS, null); return (v && typeof v==="object") ? { ...DEFAULT_NOTIF, ...v, meals: { ...DEFAULT_NOTIF.meals, ...(v.meals||{}) } } : DEFAULT_NOTIF; })();
        const validMyP   = loadedPers.find(p=>p.id===loadedMyP) ? loadedMyP : loadedPers[0]?.id;
        setSeed(loadedSeed); setHistory(loadedHist); setExcluded(loadedExcl);
        setPersonas(loadedPers);
        if (loadedPers.length > 0) { setSelPersonaId(loadedPers[0].id); setMyPersonaId(validMyP); }
        // ── Sequenza settimanale: frozen + migrazione override a chiave per-settimana ──
        const curWk = weekIndexForDate(new Date());
        let loadedFrozen = (() => { const v = safeParse(frS, {}); return (v && typeof v==="object" && !Array.isArray(v)) ? v : {}; })();
        // Migra gli override dal vecchio formato "weekday-mealKey" → "weekIndex:weekday-mealKey"
        // assegnandoli alla settimana corrente (idempotente sui già migrati).
        const ovWeek = migraOverridesASettimana(loadedOvrd, curWk);
        if (JSON.stringify(ovWeek) !== JSON.stringify(loadedOvrd)) {
          window.storage.set(SK_OVERRIDES, JSON.stringify(ovWeek)).catch(()=>{});
        }
        // Primo avvio sul modello a sequenza: congela la settimana CORRENTE col
        // seed legacy, così "questa settimana" resta identica a prima dell'update.
        if (Object.keys(loadedFrozen).length === 0) {
          loadedFrozen = { [curWk]: loadedSeed };
          window.storage.set(SK_FROZEN, JSON.stringify(loadedFrozen)).catch(()=>{});
        }
        // Ripristina ING_QTY per ricette custom salvate negli overrides
        for (const ricetta of tuttiOverrideMeals(ovWeek)) {
          restoreCustomING_QTY(ricetta);
        }
        setMisureApp(loadedMisu); setOverrides(ovWeek); setFrozen(loadedFrozen); setPrefs(loadedPrefs); setMealsLog(loadedMealsLog); setNotifSettings(loadedNotif);
        setPlan(planForWeek({baseSeed:loadedSeed, frozen:loadedFrozen}, curWk, { excludedIds: loadedExcl, ricetteUtente, ricetteEscluseIds }));
        logSync("info", "App avviata", { profili: loadedPers.length, seed: String(loadedSeed), overrides: contaOverrides(ovWeek), esclusi: loadedExcl.length });
        setBooted(true);
      } catch (err) {
        logSync("error", "Errore caricamento dati locali", { error: err?.message });
        console.error("Errore caricamento dati:", err);
        let ns = Date.now();
        try { const r = await window.storage.get(SK_SEED); const p = parseInt(r.value,10); if (!isNaN(p)&&p>0) ns = p; } catch {}
        setSeed(ns); setPersonas([]);
        setPlan(planForWeek({baseSeed:ns, frozen:{}}, weekIndexForDate(new Date()), { excludedIds: [], ricetteUtente, ricetteEscluseIds }));
        setBooted(true);
      }
    }
    load();
  },[]);

  const dismissHintPiano = useCallback(()=>{
    setHintPiano(false);
    try { localStorage.setItem("pa__hint-piano-ok","1"); } catch {}
  },[]);
  const toggleSpesaConsumo = useCallback(()=>{
    setSpesaConsumo(v=>{
      const n = !v;
      logSync("spesa", n ? "Spesa: esclusione pasti consumati ATTIVA" : "Spesa: esclusione pasti consumati disattivata");
      try { localStorage.setItem("pa__spesa-consumo", n?"1":"0"); } catch {}
      return n;
    });
  },[]);

  const toggleDevMode = useCallback(()=>{
    setDevMode(v=>{
      const n = !v;
      try { localStorage.setItem("pa__dev", n?"1":"0"); } catch {}
      toast(n ? "🔬 Strumenti di diagnostica attivati" : "Strumenti di diagnostica nascosti");
      return n;
    });
  },[]);

  const handleAccettaConsenso = useCallback((rec)=>{
    setConsenso(rec);
    try { localStorage.setItem("pa__consenso", JSON.stringify(rec)); } catch {}
    salvaConsensoCloud(rec);
    toast("✓ Consenso registrato");
  },[]);

  // Rifiuto dal gate e revoca da Opzioni: stessa conseguenza — le funzioni
  // cloud richiedono il consenso, quindi si registra la revoca (prova ai
  // fini di accountability) e si disconnette. I dati locali restano.
  const handleRevocaConsenso = useCallback(async ()=>{
    const rec = { ...(consenso||{}), versione: consenso?.versione||PRIVACY_VERSIONE, revocatoTs: new Date().toISOString() };
    try { localStorage.setItem("pa__consenso", JSON.stringify(rec)); } catch {}
    setConsenso(rec);
    try { await salvaConsensoCloud(rec); } catch {}
    await signOut();
    toast("Consenso revocato: sei stato disconnesso");
  },[consenso]);

  const navigaA = useCallback((p) => {
    logSync("nav", `Navigazione → ${p}`);
    setPage(p);
  }, []);

  // Combina le esclusioni catalogo (localStorage) con quelle utente (flag esclusa)
  // e aggiorna lo stato che alimenta il motore di generazione piano.
  const aggiornaEscluse = useCallback((ricette) => {
    let catEscluse = [];
    try { catEscluse = JSON.parse(localStorage.getItem("cat-escluse")||"[]"); } catch {}
    const utenteEscluse = (ricette||[]).filter(r => r.esclusa).map(r => "usr_" + r.id);
    const utenteEscluseRaw = (ricette||[]).filter(r => r.esclusa).map(r => r.id);
    setRicetteEscluseIds(new Set([...catEscluse, ...utenteEscluse, ...utenteEscluseRaw]));
  }, []);

  // Chiamato da RicettePage dopo ogni modifica: ricarica ricette + esclusioni + rigenera piano
  const handleRicetteChange = useCallback(async () => {
    try {
      const rs = await caricaRicette();
      setRicetteUtente(rs);
      aggiornaEscluse(rs);
      setRegenNeeded(true);  // segnala che il piano va rigenerato
    } catch {}
  }, [aggiornaEscluse]);

  const handleUpdatePersona = useCallback((updated)=>{
    logSync("persona", `Profilo aggiornato: ${updated.nome}`, { id: updated.id?.slice(0,8), peso: updated.peso, obiettivo: updated.obiettivo, dietaIntensita: updated.dietaIntensita, pesoTarget: updated.pesoTarget });
    setPersonas(prev=>{
      const next=prev.map(p=>p.id===updated.id?updated:p);
      window.storage.set(SK_PERSONAS,JSON.stringify(next)).catch(()=>{});
      // Push immediato del target se il profilo aggiornato è dell'owner:
      // evita la finestra di stale durante i drag in-flight (dietaIntensita, pesoTarget, ecc.)
      if (updated.id === myPersonaId) {
        try {
          const t = calcTargetAdattivo(updated, (misureApp||{})[updated.id]||[]);
          pushTargetGiornaliero(updated, t).catch(()=>{});
        } catch {}
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[myPersonaId, misureApp]);

  const handleAddPersona = useCallback((p)=>{
    logSync("persona", `Profilo aggiunto: ${p.nome}`, { id: p.id?.slice(0,8), sesso: p.sesso, eta: p.eta });
    setPersonas(prev=>{ const next=[...prev,p]; window.storage.set(SK_PERSONAS,JSON.stringify(next)).catch(()=>{}); return next; });
    setSelPersonaId(p.id);
  },[]);

  // Wrapper per setMisureApp: dopo ogni aggiornamento misure, ricalcola e
  // pusha il target dell'owner (le misure influenzano il TDEE adattivo).
  const handleMisureChange = useCallback((nextMisure)=>{
    // Conta le misurazioni totali per il log
    const nTot = Object.values(nextMisure||{}).reduce((s,r)=>s+(Array.isArray(r)?r.length:0),0);
    logSync("misure", `Misure aggiornate`, { profili: Object.keys(nextMisure||{}).length, righe: nTot });
    setMisureApp(nextMisure);
    if (myPersonaId) {
      setPersonas(prev=>{
        const owner=prev.find(p=>p.id===myPersonaId);
        if (owner) {
          try {
            const t=calcTargetAdattivo(owner,(nextMisure||{})[myPersonaId]||[]);
            pushTargetGiornaliero(owner,t).catch(()=>{});
          } catch {}
        }
        return prev;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[myPersonaId]);

  const handleDeletePersona = useCallback((id)=>{
    logSync("persona", `Profilo eliminato`, { id: id?.slice(0,8) });
    setPersonas(prev=>{ const next=prev.filter(p=>p.id!==id); window.storage.set(SK_PERSONAS,JSON.stringify(next)).catch(()=>{}); if(selPersonaId===id) setSelPersonaId(next[0]?.id||null); return next; });
  },[selPersonaId]);

  const handleNotifChange = useCallback((next) => {
    logSync("opzioni", "Impostazioni notifiche aggiornate");
    setNotifSettings(next); window.storage.set(SK_NOTIF, JSON.stringify(next)).catch(()=>{});
  }, []);
  const handleToggleMealLog = useCallback((personaId, dateKey, mealKey, macros) => {
    setMealsLog(prev => {
      const pLog=prev[personaId]||{}, dayLog=pLog[dateKey]||{}, cur=dayLog[mealKey];
      const day={...dayLog};
      if (cur?.consumed) {
        delete day[mealKey]; // consumato → torna "in attesa"
        logSync("pasto-log", `Pasto non consumato: ${mealKey}`, { personaId: personaId?.slice(0,8), dateKey, mealKey });
      } else {
        // preserva eventuali macro reali già registrate, altrimenti usa quelle del piano
        const reali = (cur && (cur.kcal || cur._ingredienti))
          ? { kcal:cur.kcal, p:cur.p, c:cur.c, g:cur.g, _ingredienti:cur._ingredienti }
          : macros;
        day[mealKey] = { consumed:true, saltato:false, _auto:false, ...reali };
        logSync("pasto-log", `Pasto consumato: ${mealKey}`, { personaId: personaId?.slice(0,8), dateKey, kcal: macros?.kcal });
      }
      // un consumo/annullamento può cambiare gli auto-saltati (regola A): ricalcolo
      const oggiKey = dateKeyForDayIdx(todayDayIndex());
      const nowH = new Date().getHours() + new Date().getMinutes()/60;
      const settled = autoFlagSaltati(MEAL_KEYS, MEAL_FASCIA, day, { isOggi: dateKey===oggiKey, nowH }).dayLog;
      const nextFull={...prev,[personaId]:{...pLog,[dateKey]:settled}};
      window.storage.set(SK_MEALS_LOG,JSON.stringify(nextFull)).catch(()=>{}); return nextFull;
    });
  }, []);

  // Pulsante ✗ "non mangiato": salta manualmente un pasto (o lo ripristina).
  // Il flag manuale (_auto:false) vince sempre sull'auto-flag.
  const handleToggleSaltato = useCallback((personaId, dateKey, mealKey) => {
    setMealsLog(prev => {
      const pLog=prev[personaId]||{}, dayLog=pLog[dateKey]||{}, cur=dayLog[mealKey];
      const day={...dayLog};
      if (cur?.saltato && !cur._auto) {
        delete day[mealKey]; // saltato manuale → torna in attesa
        logSync("pasto-log", `Pasto ripristinato: ${mealKey}`, { personaId: personaId?.slice(0,8), dateKey, mealKey });
      } else {
        day[mealKey] = { consumed:false, saltato:true, _auto:false };
        logSync("pasto-log", `Pasto saltato (manuale): ${mealKey}`, { personaId: personaId?.slice(0,8), dateKey, mealKey });
      }
      const nextFull={...prev,[personaId]:{...pLog,[dateKey]:day}};
      window.storage.set(SK_MEALS_LOG,JSON.stringify(nextFull)).catch(()=>{}); return nextFull;
    });
  }, []);

  // Aggiorna macro e ingredienti di un pasto già consumato con i valori reali
  const handleEditConsumedMeal = useCallback((personaId, dateKey, mealKey, data) => {
    logSync("pasto-log", `Pasto consumato modificato: ${mealKey}`, { personaId: personaId?.slice(0,8), dateKey, kcal: data?.kcal });
    setMealsLog(prev => {
      const pLog=prev[personaId]||{}, dayLog=pLog[dateKey]||{}, cur=dayLog[mealKey];
      const { _ingredienti, ...macros } = data;
      const updated = {
        ...(cur || {}),
        consumed: true,
        ...macros,
        _ingredienti: _ingredienti || null,
      };
      const next = {...dayLog, [mealKey]: updated};
      const nextFull = {...prev, [personaId]: {...pLog, [dateKey]: next}};
      window.storage.set(SK_MEALS_LOG, JSON.stringify(nextFull)).catch(()=>{});
      return nextFull;
    });
  }, []);
  useEffect(()=>{
    if (!plan||!notifSettings) return;
    const t=setTimeout(()=>{ scheduleNotifications(notifSettings,plan[todayDayIndex()],personas,myPersonaId); },800);
    return ()=>clearTimeout(t);
  },[notifSettings,plan,myPersonaId]);

  // ─── Auto-flag "saltato" per OGGI ─────────────────────────────────
  // Gira al mount e ogni 60s: marca saltati i pasti la cui fascia oraria
  // è scaduta (regola B) o che precedono un pasto già consumato (regola A).
  // Scrive solo quando qualcosa cambia davvero, così non intasa il sync.
  useEffect(()=>{
    if (!personas?.length) return;
    const run = () => {
      const oggiKey = dateKeyForDayIdx(todayDayIndex());
      const nowH = new Date().getHours() + new Date().getMinutes()/60;
      setMealsLog(prev => {
        let mutated = false;
        const next = {...prev};
        for (const p of personas) {
          const pLog = prev[p.id]; if (!pLog) continue;
          const dayLog = pLog[oggiKey]; if (!dayLog) continue;
          const { dayLog: settled, changed } = autoFlagSaltati(MEAL_KEYS, MEAL_FASCIA, dayLog, { isOggi:true, nowH });
          if (changed) { next[p.id] = {...pLog, [oggiKey]: settled}; mutated = true; }
        }
        if (!mutated) return prev;
        window.storage.set(SK_MEALS_LOG, JSON.stringify(next)).catch(()=>{});
        return next;
      });
    };
    run();
    const id = setInterval(run, 60000);
    return () => clearInterval(id);
  },[personas]);
  const handleSetMyPersona = useCallback((id)=>{
    logSync("persona", `Profilo selezionato come "mio"`, { id: id?.slice(0,8) });
    setMyPersonaId(id);
    setSelPersonaId(id);
    window.storage.set(SK_MY_PERSONA, id).catch(()=>{});
  },[]);

  // ─── Aggiorna la entry di una ricetta in modo persistente ────────
  // mutator: funzione che riceve la entry corrente e ne restituisce una nuova.
  // Opera solo sul ramo prefs.recipes; lascia intatto contextSwaps.
  const updatePref = useCallback((recipeId, mutator) => {
    if (!recipeId) return;
    setPrefs(prev => {
      const recipes = prev.recipes || {};
      const current = recipes[recipeId]
        ? { score:0, liked:false, disliked:false, swapsOut:0, swapsIn:0, ...recipes[recipeId] }
        : { score:0, liked:false, disliked:false, swapsOut:0, swapsIn:0 };
      const mutated = mutator(current);
      mutated.score = computePrefScore(mutated);
      mutated.updated = new Date().toLocaleDateString("it-IT");
      const next = { ...prev, recipes: { ...recipes, [recipeId]: mutated } };
      window.storage.set(SK_PREFS, JSON.stringify(next)).catch(()=>{});
      return next;
    });
  }, []);

  // Like esplicito: attiva/disattiva il cuore su una ricetta.
  // Mettere ❤️ toglie l'eventuale 👎 (segnali mutuamente esclusivi).
  const handleToggleLike = useCallback((recipeId) => {
    updatePref(recipeId, e => ({ ...e, liked: !e.liked, disliked: !e.liked ? false : e.disliked }));
  }, [updatePref]);

  // Dislike esplicito: "non proporla più / il meno possibile".
  // Mettere 👎 toglie l'eventuale ❤️.
  const handleToggleDislike = useCallback((recipeId) => {
    updatePref(recipeId, e => ({ ...e, disliked: !e.disliked, liked: !e.disliked ? false : e.liked }));
  }, [updatePref]);

  // Azzera tutti i dati sui gusti (ricette + registro contesto).
  const handleResetPrefs = useCallback(() => {
    const empty = { recipes:{}, contextSwaps:[] };
    setPrefs(empty);
    window.storage.set(SK_PREFS, JSON.stringify(empty)).catch(()=>{});
  }, []);

  // Registra uno swap di contesto nel registro grezzo (non tocca i gusti).
  const logContextSwap = useCallback((dayIdx, mealKey, oldMeal, newMeal, hoursAhead) => {
    setPrefs(prev => {
      const entry = {
        ts: Date.now(),
        dayIdx, mealKey,
        hoursAhead: Math.round(hoursAhead * 10) / 10,
        outId: oldMeal.id, outNome: oldMeal.nome, outPrep: oldMeal.prep || 0,
        inId:  newMeal.id, inNome:  newMeal.nome, inPrep:  newMeal.prep || 0,
      };
      // teniamo al massimo gli ultimi 200 eventi
      const list = [entry, ...(prev.contextSwaps || [])].slice(0, 200);
      const next = { ...prev, contextSwaps: list };
      window.storage.set(SK_PREFS, JSON.stringify(next)).catch(()=>{});
      return next;
    });
  }, []);

  const handleSwap = useCallback(async(weekIndex, weekday, mealKey, oldMeal, newMeal, targetPersonaId) => {
    logSync("swap", `Cambio pasto: ${mealKey} (sett. ${weekIndex}, giorno ${weekday})`, {
      da: oldMeal?.id, a: newMeal?.id, nomeA: newMeal?.nome?.slice(0,30),
      fonte: newMeal?.fonte || "catalogo",
    });
    restoreCustomING_QTY(newMeal);
    const key = overrideKey(weekIndex, weekday, mealKey);
    setOverrides(prev => {
      const next = scriviOverride(prev, targetPersonaId ?? myPersonaId, key, newMeal);
      window.storage.set(SK_OVERRIDES, JSON.stringify(next)).catch(()=>{});
      return next;
    });
    if (!oldMeal || !newMeal || oldMeal.id === newMeal.id) return;

    // Classifica lo swap: contesto (fretta) o gusto (valutazione).
    const tipo = classifySwap(weekday, mealKey);
    if (tipo === "contesto") {
      logContextSwap(weekday, mealKey, oldMeal, newMeal, hoursUntilMeal(weekday, mealKey));
    } else {
      updatePref(oldMeal.id, e => ({ ...e, swapsOut: (e.swapsOut||0) + 1 }));
      updatePref(newMeal.id, e => ({ ...e, swapsIn:  (e.swapsIn ||0) + 1 }));
    }
  }, [updatePref, logContextSwap]);

  const handleResetSwap = useCallback(async(weekIndex, weekday, mealKey, targetPersonaId) => {
    const key = overrideKey(weekIndex, weekday, mealKey);
    setOverrides(prev => {
      const next = scriviOverride(prev, targetPersonaId ?? myPersonaId, key, null);
      window.storage.set(SK_OVERRIDES, JSON.stringify(next)).catch(()=>{});
      return next;
    });
  }, [myPersonaId]);

  const handleApplySeed = useCallback(async(newSeed, newOverrides)=>{
    logSync("piano", `Piano applicato da storico`, { seed: String(newSeed) });
    setSpinning(true); await new Promise(r=>setTimeout(r,400));
    const cur = weekIndexForDate(new Date());
    const np=planForWeek({baseSeed:newSeed,frozen:{}}, cur, {excludedIds:excluded, ricetteUtente, ricetteEscluseIds});
    const nh=[{seed,date:new Date().toLocaleDateString("it-IT"),label:`Piano del ${new Date().toLocaleDateString("it-IT")}`},...history].slice(0,5);
    const resolvedOverrides = newOverrides || {};
    setSeed(newSeed); setFrozen({}); setPlan(np); setHistory(nh); setSelOffset(0); setRegenNeeded(false); setOverrides(resolvedOverrides);
    try {
      await window.storage.set(SK_SEED,String(newSeed));
      await window.storage.set(SK_FROZEN,"{}");
      await window.storage.set(SK_HISTORY,JSON.stringify(nh));
      await window.storage.set(SK_OVERRIDES,JSON.stringify(resolvedOverrides));
    } catch{}
    setSpinning(false);
    toast("✓ Piano ripristinato");
  },[seed,history,excluded,ricetteUtente,ricetteEscluseIds]);

  const regenerate = useCallback(async()=>{
    logSync("piano", "Piano rigenerato dall'utente", { ricetteUtente: ricetteUtente.length, esclusi: excluded.length });
    setSpinning(true); await new Promise(r=>setTimeout(r,500));
    const today = new Date();
    const cur = weekIndexForDate(today);
    const twd = weekdayForDate(today);           // 0..6, giorno di oggi nella settimana
    const todayKey = localDateKey(today);
    const oldState = { baseSeed: seed, frozen };
    // Ciò che l'utente vede ORA per la settimana corrente (base + override applicati)
    const oldWeek = applyOverridesWeek(plan || [], overrides, cur);
    // Consumato oggi a livello FAMIGLIA: se un qualsiasi membro ha consumato il pasto
    // lo preserviamo (il log consumato non memorizza la ricetta → non va orfanato).
    const consumatoOggi = (mk) => Object.values(mealsLog||{}).some(pl => !!((pl?.[todayKey]||{})[mk]?.consumed));
    // Nuovo stato: passate congelate col seed attuale, corrente + future riseminate.
    const newState = regeneraPlanState(oldState, {});
    const np = planForWeek(newState, cur, {excludedIds:excluded, ricetteUtente, ricetteEscluseIds});
    // Override: mantieni quelli delle settimane PASSATE...
    // Tieni: settimane passate (tutti i layer) + regione protetta della
    // corrente (giorni interi già passati e pasti di oggi consumati) — anche
    // per gli swap personali, che prima venivano buttati (field test 12/07).
    const nextOv = filtraOverrides(overrides, k => {
      const wk = parseInt(k, 10);
      if (!Number.isFinite(wk)) return false;
      if (wk < cur) return true;
      if (wk !== cur) return false;
      const m = k.match(/^-?\d+:(\d+)-(.+)$/);
      if (!m) return false;
      const wd = +m[1];
      return wd < twd || (wd === twd && consumatoOggi(m[2]));
    });
    // ...e RIPRISTINA la regione da preservare della settimana corrente:
    //    giorni < oggi (interi) + pasti di oggi già consumati.
    for (let wd=0; wd<=twd; wd++) {
      for (const mk of MEAL_KEYS) {
        const preserva = wd < twd || (wd === twd && consumatoOggi(mk));
        if (!preserva) continue;
        const meal = oldWeek[wd] && oldWeek[wd][mk];
        if (meal) nextOv.condivisi[overrideKey(cur, wd, mk)] = meal;
      }
    }
    const nh=[{seed,date:new Date().toLocaleDateString("it-IT"),label:`Piano del ${new Date().toLocaleDateString("it-IT")}`},...history].slice(0,5);
    // Carry-over spunte spesa: la regen non azzera la spesa già fatta
    const vecchioSeed = String(seed), nuovoSeed = String(newState.baseSeed);
    setSpesaChecks(prev => ({ ...prev, [nuovoSeed]: { ...(prev[nuovoSeed]||{}), ...(prev[vecchioSeed]||{}) } }));
    if (cloudEnabled) { import('@/db/sync').then(({migraSpesaSeed}) => migraSpesaSeed(vecchioSeed, nuovoSeed)).catch(()=>{}); }
    setSeed(newState.baseSeed); setFrozen(newState.frozen); setPlan(np); setHistory(nh); setSelOffset(0); setRegenNeeded(false); setOverrides(nextOv);
    try {
      await window.storage.set(SK_SEED,String(newState.baseSeed));
      await window.storage.set(SK_FROZEN,JSON.stringify(newState.frozen));
      await window.storage.set(SK_HISTORY,JSON.stringify(nh));
      await window.storage.set(SK_OVERRIDES,JSON.stringify(nextOv));
    } catch{}
    setSpinning(false);
    toast("✓ Nuovo piano generato");
  },[seed,frozen,overrides,history,excluded,ricetteUtente,ricetteEscluseIds,mealsLog,plan]);

  const loadHistory = useCallback(async(oldSeed)=>{
    setSpinning(true); await new Promise(r=>setTimeout(r,300));
    const cur = weekIndexForDate(new Date());
    setSeed(oldSeed); setFrozen({}); setPlan(planForWeek({baseSeed:oldSeed,frozen:{}}, cur, {excludedIds:excluded, ricetteUtente, ricetteEscluseIds})); setSelOffset(0);
    setOverrides({});
    try {
      await window.storage.set(SK_SEED,String(oldSeed));
      await window.storage.set(SK_FROZEN,"{}");
      await window.storage.set(SK_OVERRIDES,"{}");
    } catch{}
    setSpinning(false);
  },[excluded,ricetteUtente,ricetteEscluseIds]);

  const toggleExcluded = useCallback(async(id)=>{
    setExcluded(prev=>{
      const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id];
      logSync("esclusione", next.includes(id) ? `Ingrediente escluso: ${id}` : `Ingrediente riammesso: ${id}`, { ingrediente: id, totaleEsclusi: next.length });
      window.storage.set(SK_EXCL,JSON.stringify(next)).catch(()=>{}); return next;
    });
    setRegenNeeded(true);
  },[]);

  if (!plan) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#6E8576"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>🥗</div><div>Caricamento...</div></div>
    </div>
  );

  const persona = personas.find(p=>p.id===selPersonaId)||personas.find(p=>p.id===myPersonaId)||personas[0];

  // Helper per swipe orizzontale: passa alla persona successiva/precedente.
  // Wrap-around: dall'ultima si torna alla prima e viceversa.
  const cambiaPersona = (direzione) => {
    if (!personas.length) return;
    const idx = personas.findIndex(p=>p.id===persona.id);
    const nextIdx = (idx + direzione + personas.length) % personas.length;
    setSelPersonaId(personas[nextIdx].id);
  };
  const swipeAvanti   = () => cambiaPersona(+1);
  const swipeIndietro = () => cambiaPersona(-1);
  // Target calorico giornaliero:
  // - Per il profilo proprio (owner): sempre ricalcolato localmente → fonte di verità,
  //   pushato su cloud via pushTargetGiornaliero ogni volta che cambia.
  // - Per i profili altrui (non-owner): si legge prima dal cloud (pushato dall'owner),
  //   con fallback al calcolo locale (già corretto una volta che profili+misure sono
  //   sincronizzati, ma potenzialmente stale durante i drag in-flight dell'owner).
  const isOwnerPersona = persona?.id === myPersonaId;
  // Sola lettura STRETTA: ogni utente lavora SOLO sul proprio profilo (quello
  // con cui è identificato su questo dispositivo, myPersonaId). Tutti gli altri
  // profili della famiglia sono in sola lettura: niente log pasti, idratazione,
  // swap o misure. Fuori dalla famiglia (modalità locale) tutto è modificabile.
  const myUid = personas.find(p=>p.id===myPersonaId)?._uid || null;
  const personaEditabile = (p)=> !cloudStatus.inFamily ? true : (p?.id===myPersonaId);
  const readOnlyPersona = !personaEditabile(persona);
  const personaTargetLocale = persona ? calcTargetAdattivo(persona, misureApp[persona?.id]) : null;
  const personaTarget = persona
    ? (isOwnerPersona
        ? personaTargetLocale
        : (targetsCloud[persona.id] ?? personaTargetLocale))
    : null;
  const personaSlot = persona ? slotForPersona(persona) : "uomo";

  // ── Oggi è una schermata PERSONALE: usa sempre il profilo dell'utente ──
  const oggiPersona  = personas.find(p=>p.id===myPersonaId) || persona;
  const oggiSlot     = oggiPersona ? slotForPersona(oggiPersona) : "uomo";
  const oggiTarget   = oggiPersona ? calcTargetAdattivo(oggiPersona, misureApp[oggiPersona?.id]) : null;
  const oggiReadOnly = !personaEditabile(oggiPersona);
  const headerSaluto = (()=>{ const h=new Date().getHours(); return h<12?"Buongiorno":h<18?"Buon pomeriggio":"Buonasera"; })();

  // Navigazione: 3 voci principali nella bottom-nav (Piano · Spesa · Menu).
  // "Menu" apre un bottom-sheet con le 4 voci secondarie:
  // Ingredienti · Gusti · Misure · Famiglia.
  const TABS_MAIN = [
    {key:"oggi",   short:"Oggi",   icon:"🏠"},
    {key:"piano",  short:"Piano",  icon:"📋"},
    {key:"spesa",  short:"Spesa",  icon:"🛒"},
    {key:"misure", short:"Misure", icon:"📏"},
    {key:"menu",   short:"Menu",   icon:"☰"},
  ];
  const SUBMENU = [
    // "Famiglia" non è più una voce separata: si raggiunge da Account & Famiglia
    {key:"utente",      label:"Account & Famiglia", icon:"👤", desc:"Account, sincronizzazione, famiglia e profili"},
    {key:"ingredienti", label:"Ingredienti", icon:"🥦", desc:"Cosa escludere dal piano"},
    {key:"gusti",       label:"Gusti",       icon:"❤️", desc:"Preferiti e non amati"},
    {key:"ricette",     label:"Ricette",     icon:"📖", desc:"Le tue ricette e quelle di famiglia"},
    {key:"strumenti",   label:"Strumenti",   icon:"🧰", desc:"Convertitori e calcolatori"},
    {key:"opzioni",     label:"Opzioni",     icon:"⚙️", desc:"Notifiche, promemoria, dati e privacy"},
    // Strumenti diagnostici: visibili solo in modalità sviluppatore
    ...(devMode ? [
      {key:"test-sync", label:"Test Sync",   icon:"🔬", desc:"Diagnostica sincronizzazione"},
      {key:"synclog",   label:"Log Sync",    icon:"📡", desc:"Registro sincronizzazione (copiabile)"},
    ] : []),
  ];
  // Pagine "secondarie" per lo stato attivo della voce Menu: include anche
  // quelle raggiungibili senza voce dedicata (famiglia, diagnostica nascosta)
  const PAGINE_SECONDARIE = new Set([...SUBMENU.map(x=>x.key), "famiglia", "privacy", "test-sync", "synclog"]);

  // ── Primo accesso: nessuna persona → flusso di onboarding ──
  const completaOnboarding = async (p, session) => {
    // Guardia anti-sovrascrittura: se nello storage esistono già persone
    // (onboarding apparso per un errore transitorio), non tocco nulla.
    try {
      const r = await window.storage.get(SK_PERSONAS);
      const esistenti = JSON.parse(r.value);
      if (Array.isArray(esistenti) && esistenti.length > 0) { window.location.reload(); return; }
    } catch {}
    let nuova = { ...p };
    if (session) {
      // crea/aggiorna il profilo cloud con i dati della scheda e allinea gli ID:
      // niente wizard, l'utente nasce già sincronizzato
      try {
        const { ensureMyProfile, supabase } = await import('@/db/cloud');
        const prof = await ensureMyProfile(nuova);
        if (prof) {
          await supabase.from("profili").update({
            nome: nuova.nome, sesso: nuova.sesso==="F"?"F":"M",
            data_nascita: nuova.dataNascita || null,
            peso: nuova.peso ?? null, altezza: nuova.altezza ?? null,
            lavoro: nuova.lavoro, allenamenti: nuova.allenamenti,
            obiettivo: nuova.obiettivo, color: nuova.color,
          }).eq("id", prof.id);
          nuova = { ...nuova, id: prof.id, _uid: prof.user_id };
          await window.storage.set("pf-cloud-migrated", "1");
        }
      } catch (e) { console.warn("onboarding cloud:", e?.message); }
    }
    setPersonas([nuova]); setSelPersonaId(nuova.id); setMyPersonaId(nuova.id);
    try {
      await window.storage.set(SK_PERSONAS, JSON.stringify([nuova]));
      await window.storage.set(SK_MY_PERSONA, nuova.id);
    } catch {}
    setPage("oggi");
  };
  if (booted && personas.length === 0) {
    return <Onboarding onComplete={completaOnboarding}/>;
  }
  if (!booted) {
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#EFF3EC",fontSize:32}}>🥗</div>;
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#ECF1E2 0%,#E2EAD9 100%)",fontFamily:"'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif",paddingBottom:80}}>
      <ToastHost/>
      {/* ── Gate consenso privacy (GDPR, art. 9) ── */}
      {cloudEnabled && cloudStatus.loggedIn && consensoPronto
        && serveConsenso(consenso, PRIVACY_VERSIONE) && page!=="privacy" && (
        <ConsensoGate
          onAccetta={handleAccettaConsenso}
          onRifiuta={handleRevocaConsenso}
          onLeggiInformativa={()=>setPage("privacy")}
        />
      )}
      {/* AVVISO NUOVA VERSIONE */}
      {swUpdate && (
        <div style={{position:"sticky",top:0,zIndex:50,background:"#235029",color:"#fff",
                     padding:"calc(10px + env(safe-area-inset-top,0px)) 16px 10px",
                     display:"flex",alignItems:"center",justifyContent:"center",gap:12,fontSize:13}}>
          <span>✨ È disponibile una nuova versione.</span>
          <button
            onClick={()=>{
              try { window.__pfWaitingWorker?.postMessage({ type:"SKIP_WAITING" }); } catch {}
              // Fallback: se per qualche motivo non scatta il controllerchange,
              // ricarica comunque dopo un attimo.
              setTimeout(()=>{ try { window.location.reload(); } catch {} }, 1500);
            }}
            style={{background:"#fff",color:"#235029",border:"none",borderRadius:8,
                    padding:"6px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            Aggiorna
          </button>
        </div>
      )}
      {/* HEADER */}
      <div style={{background:"linear-gradient(120deg,#15251C 0%,#1D3A28 100%)",padding:"13px 18px",paddingTop:"calc(13px + env(safe-area-inset-top,0px))"}}>
        <div style={{maxWidth:680,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:11,flexShrink:0}}>
            <div style={{width:40,height:40,borderRadius:12,background:"#0f1d15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" style={{transform:"rotate(-90deg)",display:"block"}}><circle cx="12" cy="12" r="9" fill="none" stroke="#28412f" strokeWidth="3.4"/><circle cx="12" cy="12" r="9" fill="none" stroke="#C7F23E" strokeWidth="3.4" strokeLinecap="round" strokeDasharray="56.5" strokeDashoffset="16"/></svg>
              <div style={{position:"absolute",left:"50%",top:4,transform:"translateX(-50%)",width:3.4,height:3.4,borderRadius:"50%",background:"#C7F23E"}}/>
            </div>
            <div style={{fontSize:40,fontWeight:800,color:"#F5F8F1",fontFamily:"'Outfit',sans-serif",lineHeight:1,letterSpacing:-1.6}}>f<span style={{color:"#C7F23E"}}>i</span>tsy</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",lineHeight:1.15,minWidth:0}}>
            <div style={{fontFamily:"'Outfit',sans-serif",fontWeight:800,fontSize:16,letterSpacing:-0.3,color:"#F4F7EF",whiteSpace:"nowrap"}}>{headerSaluto}, {oggiPersona?.nome}</div>
            <div style={{fontSize:12,color:"#9DB1A2",fontWeight:600,textTransform:"capitalize",marginTop:3,whiteSpace:"nowrap"}}>{new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"})}</div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:680,margin:"0 auto",padding:"18px 16px 0"}}>
       <ErrorBoundary onReset={()=>setPage("oggi")}>
       <div key={page} style={{animation:"pageIn 0.22s ease-out"}}>

        {/* PIANO */}
        {cloudStatus.inFamily && !cloudMigrated && personas.length>1 && (
          <MigrationWizard personas={personas} onDone={()=>setCloudMigrated(true)}/>
        )}
        {page==="oggi"&&(
          <OggiPage
            personas={personas}
            persona={oggiPersona}
            personaSlot={oggiSlot}
            target={oggiTarget}
            effectivePlan={applyOverridesWeek(plan||[], overrides, weekIndexForDate(new Date()), oggiPersona?.id)}
            misure={misureApp[oggiPersona?.id]}
            mealsLog={mealsLog}
            onToggleMeal={handleToggleMealLog}
            onToggleSaltato={handleToggleSaltato}
            readOnly={oggiReadOnly}
            onGoPiano={()=>{ setSelOffset(0); setPage("piano"); }}
            onGoSwap={(mk)=>{
              // Salta al Piano di oggi (profilo proprio) con il drawer
              // di sostituzione già aperto sul pasto indicato
              logSync("nav", `Oggi → Piano: cambia ${mk}`);
              setSwapDaOggi(mk);
              if (myPersonaId) setSelPersonaId(myPersonaId);
              setSelOffset(0);
              setPage("piano");
            }}
            onGoMisure={()=>setPage("misure")}
          />
        )}
        {page==="piano"&&(
          <SwipeContainer onSwipeLeft={swipeAvanti} onSwipeRight={swipeIndietro} style={{touchAction:"pan-y"}}>
            <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
              {personas.map(p=>{
                const isMe=myPersonaId===p.id;
                const sel=selPersonaId===p.id;
                return (
                  <button key={p.id} onClick={()=>setSelPersonaId(p.id)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:7,padding:"8px 14px",borderRadius:999,border:sel?"none":"1.5px solid #E7EDE2",background:sel?p.color:"#fff",color:sel?"#fff":"#6E8576",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",boxShadow:sel?`0 6px 14px -5px ${p.color}99`:"none"}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:sel?"#fff":p.color}}/>
                    {p.nome}
                    {isMe&&<span style={{fontSize:8.5,background:sel?"#fff":p.color,color:sel?p.color:"#fff",borderRadius:5,padding:"1px 5px",fontWeight:900}}>IO</span>}
                  </button>
                );
              })}
            </div>
            <DayCarousel selOffset={selOffset} onSelect={setSelOffset} color={persona.color} />
            <button
              onClick={()=>{
                if (spinning) return;
                // Aggiornamento richiesto (regenNeeded): azione già "invitata" → diretta.
                // Rigenerazione spontanea: doppio tap di conferma (il piano futuro cambia tutto).
                if (regenNeeded || confermaRegen) {
                  if (regenTimerRef.current) { clearTimeout(regenTimerRef.current); regenTimerRef.current = null; }
                  setConfermaRegen(false);
                  regenerate();
                } else {
                  setConfermaRegen(true);
                  regenTimerRef.current = setTimeout(()=>setConfermaRegen(false), 4000);
                }
              }}
              disabled={spinning}
              style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:confermaRegen?"#fef2f2":regenNeeded?"#C7F23E":"#fff",color:confermaRegen?"#b91c1c":"#15251C",border:confermaRegen?"1.5px solid #fca5a5":regenNeeded?"none":"1.5px solid #CBE0B4",borderRadius:12,padding:"12px",fontWeight:700,fontSize:13,cursor:spinning?"not-allowed":"pointer",marginBottom:12,boxShadow:regenNeeded?"0 8px 18px -8px rgba(199,242,62,0.85)":"none",transition:"all 0.2s"}}>
              <span style={{display:"inline-block",animation:spinning?"spin 0.7s linear infinite":"none",fontSize:15}}>{confermaRegen?"⚠️":"🔄"}</span>
              {spinning?"Generando...":confermaRegen?"Sicuro? Tocca di nuovo per rigenerare":regenNeeded?"Aggiorna il piano":"Genera nuovo piano"}
            </button>
            {hintPiano && (
              <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"7px 11px",marginBottom:12,fontSize:11,color:"#92400e",display:"flex",alignItems:"center",gap:8}}>
                <span style={{flex:1}}>💡 Tocca ogni pasto per vederne le porzioni e personalizzarle</span>
                <button onClick={dismissHintPiano} title="Non mostrare più"
                  style={{flexShrink:0,border:"none",background:"transparent",color:"#b45309",fontWeight:900,fontSize:14,cursor:"pointer",padding:"0 2px",lineHeight:1}}>✕</button>
              </div>
            )}
            {spinning ? <div style={{textAlign:"center",padding:"40px 0",color:"#6E8576"}}>🔄 Generando...</div> : (
              <>
                {(()=>{
                  // Risoluzione giorno selezionato dalla finestra mobile (offset da oggi)
                  const planState = { baseSeed: seed, frozen };
                  const selDate = dateForOffset(selOffset);
                  const selWeekIndex = weekIndexForDate(selDate);
                  const selWeekday = weekdayForDate(selDate);
                  const selDateKey = dateKeyForOffset(selOffset);
                  // Piano della settimana del giorno scelto (può sforare la settimana corrente),
                  // con gli override per-settimana applicati.
                  const selWeek = applyOverridesWeek(
                    planForWeek(planState, selWeekIndex, { excludedIds: excluded, ricetteUtente, ricetteEscluseIds }),
                    overrides, selWeekIndex, persona?.id
                  );
                  const weekMealIds = new Set(
                    selWeek.flatMap(d => MEAL_KEYS.map(mk => d[mk]?.id)).filter(Boolean)
                  );
                  const effectiveDay = selWeek[selWeekday];
                  // Piano personalizzato: se la persona ha misure, le porzioni
                  // vengono riscalate dal motore sul suo fabbisogno (LARN).
                  const pianoPers = pianoPersonalizzato(effectiveDay, persona, misureApp[persona?.id]);
                  const selDayLog = (mealsLog[persona.id]||{})[selDateKey]||{};
                  // macro base per ogni pasto (personalizzati o fissi)
                  const macroBase = {};
                  // peso REALE (grammi) di ogni pasto, dalla stessa fonte dei macro
                  const pesoBase = {};
                  MEAL_KEYS.forEach(mk => {
                    macroBase[mk] = (pianoPers.personalizzato ? pianoPers.perPasto[mk] : null) || effectiveDay[mk]?.[personaSlot] || {kcal:0,p:0,c:0,g:0};
                    const rid = effectiveDay[mk]?.id;
                    pesoBase[mk] = (pianoPers.personalizzato && rid && pianoPers.quantita?.[rid])
                      ? grammiDaQuantita(pianoPers.quantita[rid])
                      : (rid ? grammiRicettaCalc(rid, personaSlot) : 0);
                  });
                  // ricalcolo proporzionale dei pasti non ancora consumati (pesato grammi+kcal)
                  const { adattato: macroAdattati, delta: kcalDelta, avviso: avvisoBilancio } = ricalcolaMacroAdattati(MEAL_KEYS, macroBase, selDayLog, pesoBase);
                  return (
                    <>
                      {avvisoBilancio && (
                        <div style={{background:"#fffbeb",border:"1.5px solid #fcd34d",borderRadius:10,padding:"10px 14px",marginBottom:8,fontSize:12,color:"#92400e",fontWeight:600,lineHeight:1.5}}>
                          {avvisoBilancio}
                        </div>
                      )}
                      {MEAL_KEYS.map(mk => {
                        const key = overrideKey(selWeekIndex, selWeekday, mk);
                        const isOverride = !!overridesForPersona(overrides, persona?.id)[key];
                        const isConsumed = !!selDayLog[mk]?.consumed;
                        const isSaltato  = !!selDayLog[mk]?.saltato;
                        // Per i pasti né consumati né saltati usa i macro riadattati; per i consumati restano quelli reali del log
                        const macroEff = (!isConsumed && !isSaltato) ? macroAdattati[mk] : macroBase[mk];
                        const isAdattato = !isConsumed && !isSaltato && macroAdattati[mk]?._adattato;
                        return (
                          <MealCard
                            key={mk}
                            mealKey={mk}
                            dayIdx={selWeekday}
                            readOnly={readOnlyPersona}
                            meal={effectiveDay[mk]}
                            personaKey={personaSlot}
                            color={persona.color}
                            isOverride={isOverride}
                            weekMealIds={weekMealIds}
                            excludedIds={excluded}
                            prefEntry={getPrefEntry(prefs, effectiveDay[mk]?.id)}
                            onToggleLike={() => handleToggleLike(effectiveDay[mk]?.id)}
                            onToggleDislike={() => handleToggleDislike(effectiveDay[mk]?.id)}
                            onSwap={alt => handleSwap(selWeekIndex, selWeekday, mk, effectiveDay[mk], alt, persona?.id)}
                            onReset={() => handleResetSwap(selWeekIndex, selWeekday, mk, persona?.id)}
                            macroOverride={macroEff}
                            isAdattato={isAdattato}
                            quantitaOverride={pianoPers.personalizzato && effectiveDay[mk] && pianoPers.quantita && !isAdattato ? pianoPers.quantita[effectiveDay[mk].id] : null}
                            consumed={isConsumed}
                            saltato={isSaltato}
                            saltatoAuto={!!selDayLog[mk]?._auto}
                            onToggleConsumed={()=>handleToggleMealLog(persona.id,selDateKey,mk,macroBase[mk])}
                            onToggleSaltato={()=>handleToggleSaltato(persona.id,selDateKey,mk)}
                            onEdit={customRecipe => handleSwap(selWeekIndex, selWeekday, mk, effectiveDay[mk], customRecipe, persona?.id)}
                            loggedMacros={(()=>{const e=selDayLog[mk];return e?.consumed&&(e.kcal||e._ingredienti)?{kcal:e.kcal||0,p:e.p||0,c:e.c||0,g:e.g||0}:null;})()}
                            loggedIngs={selDayLog[mk]?._ingredienti||null}
                            gPiano={pesoBase[mk]}
                            gConsumati={selDayLog[mk]?.gConsumati ?? null}
                            onEditConsumed={data=>handleEditConsumedMeal(persona.id,selDateKey,mk,data)}
                            autoApriSwap={swapDaOggi===mk}
                            onAutoSwapDone={()=>setSwapDaOggi(null)}
                            cloudStatus={cloudStatus}
                            ricetteUtente={ricetteUtente}
                            onSalvaRicetta={(meal) => {
                              // Converti il pasto modificato nel formato editor ricette
                              // e naviga alla pagina Ricette con l'editor pre-aperto
                              const quantita = {};
                              const qty = ING_QTY[meal.id];
                              if (qty) {
                                for (const [ingId, v] of Object.entries(qty)) {
                                  if (ingId === '_scaled') continue;
                                  quantita[ingId] = { g: v.uomo ?? v.g ?? 0, unit: v.unit || "g" };
                                }
                              }
                              window.__ricetteDaAprire = {
                                titolo: meal.nome || "",
                                categoria: meal.categoria || mk.split("_")[0],
                                prep: meal.prep || null,
                                scope: "famiglia",
                                quantita,
                                ingredienti: Object.entries(quantita).map(([ing,v])=>({ing,g:v.g,unit:v.unit})),
                                // FIX navigazione: arrivando dal Piano, dopo il
                                // salvataggio (o l'annullamento) si torna al Piano
                                // sul giorno selezionato, non alla lista Ricette.
                                _tornaAlPiano: true,
                              };
                              navigaA("ricette");
                            }}
                          />
                        );
                      })}
                      <TotaleBar dayData={effectiveDay} personaKey={personaSlot} color={persona.color} target={personaTarget} macroPerPasto={macroAdattati} dayLog={selDayLog}/>
                      {/* ── Tracker idratazione ── */}
                      {(()=>{
                        // Stessa chiave della pagina Oggi (`SK_WATER:{pid}:{data}`):
                        // personaId passato come prop separata, non incorporato nel dayKey.
                        // readOnly: in famiglia l'idratazione degli altri membri è sola lettura.
                        return <WaterTracker key={`${persona.id}-${selDateKey}`} dayKey={selDateKey} personaId={persona.id} personaColor={persona.color} readOnly={readOnlyPersona}/>;
                      })()}
                    </>
                  );
                })()}
                <div style={{marginTop:14,background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",padding:"12px 16px"}}>
                  {personaTarget && <>
                  {/* Intestazione compatta: kcal + chevron. I dettagli tecnici
                      (TDEE, deficit, massa grassa…) sono collassati di default:
                      utili a chi li conosce, densi per un familiare. */}
                  <div onClick={()=>setTargetOpen(o=>!o)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",marginBottom:targetOpen?10:0}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#6E8576",letterSpacing:1,textTransform:"uppercase"}}>
                      Target — {emojiBySesso(persona)} {persona.nome}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,fontWeight:900,color:persona.color,fontFamily:"monospace"}}>{personaTarget.kcal} kcal</span>
                      <span style={{fontSize:10,color:"#9DB1A2",fontWeight:800}}>{targetOpen?"▴ chiudi":"▾ dettagli"}</span>
                    </div>
                  </div>
                  {targetOpen && <>
                  <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:10}}>
                      {(()=>{
                        const ob = OBIETTIVI.find(o=>o.key===persona.obiettivo);
                        const obStyle = {
                          perdita:      {ic:"📉",bg:"#EDF7EF",bd:"#B7E0C4",col:"#2F6B3A"},
                          mantenimento: {ic:"⚖️",bg:"#f0fdf4",bd:"#bbf7d0",col:"#16a34a"},
                          aumento:      {ic:"📈",bg:"#fef2f2",bd:"#fecaca",col:"#dc2626"},
                        }[persona.obiettivo] || {ic:"⚖️",bg:"#EFF3EC",bd:"#E7EDE2",col:"#6E8576"};
                        return (
                          <div style={{display:"flex",alignItems:"center",gap:4,background:obStyle.bg,border:`1px solid ${obStyle.bd}`,borderRadius:6,padding:"3px 8px"}}>
                            <span style={{fontSize:10}}>{obStyle.ic}</span>
                            <span style={{fontSize:10,fontWeight:700,color:obStyle.col}}>{ob?ob.label:"—"}</span>
                          </div>
                        );
                      })()}
                      <div style={{display:"flex",alignItems:"center",gap:5,background:personaTarget.confidenza.bg,border:`1px solid ${personaTarget.confidenza.border}`,borderRadius:6,padding:"3px 8px"}}>
                        <span style={{fontSize:11}}>{personaTarget.confidenza.dot}</span>
                        <span style={{fontSize:10,fontWeight:700,color:personaTarget.confidenza.color}}>{personaTarget.confidenza.label}</span>
                      </div>
                  </div>
                  {/* Macro grid */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    {[{label:"Calorie",val:personaTarget.kcal,unit:"kcal"},{label:"Proteine",val:personaTarget.p,unit:"g/die"},{label:"Carboidrati",val:personaTarget.c,unit:"g/die"},{label:"Grassi",val:personaTarget.g,unit:"g/die"}].map(({label,val,unit})=>(
                      <div key={label} style={{background:persona.color+"08",borderRadius:8,padding:"8px 12px",border:`1px solid ${persona.color}20`}}>
                        <div style={{fontSize:9,color:"#9DB1A2",marginBottom:2,textTransform:"uppercase",letterSpacing:0.8}}>{label}</div>
                        <div style={{fontSize:16,fontWeight:800,color:persona.color,fontFamily:"monospace"}}>{val}<span style={{fontSize:10,fontWeight:400,marginLeft:2}}>{unit}</span></div>
                      </div>
                    ))}
                  </div>
                  {/* Dettagli algoritmo */}
                  <div style={{background:"#F5F8F1",borderRadius:8,padding:"8px 12px",fontSize:10,color:"#6E8576",lineHeight:1.8}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span>TDEE stimato</span>
                      <span style={{fontFamily:"monospace",fontWeight:700,color:"#15251C"}}>{personaTarget.tdeeFinale} kcal</span>
                    </div>
                    {(()=>{
                      const d = personaTarget.kcal - personaTarget.tdeeFinale;
                      if (Math.abs(d) < 1) return null;
                      const txt = d < 0 ? `deficit ${-d} kcal` : `surplus +${d} kcal`;
                      const col = d < 0 ? "#2F6B3A" : "#dc2626";
                      return (
                        <div style={{display:"flex",justifyContent:"space-between"}}>
                          <span>Aggiustamento obiettivo</span>
                          <span style={{fontFamily:"monospace",fontWeight:700,color:col}}>{txt}</span>
                        </div>
                      );
                    })()}
                    {personaTarget.pctGrasso!==null&&(
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span>Massa grassa stimata</span>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:"#15251C"}}>{personaTarget.pctGrasso}%</span>
                      </div>
                    )}
                    {personaTarget.usaTDEEAdattivo&&personaTarget.adattivoInfo&&(
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span>Dati usati</span>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:"#15251C"}}>{personaTarget.nMisure} misurazioni · {personaTarget.adattivoInfo.settimane.toFixed(1)} sett.</span>
                      </div>
                    )}
                    {personaTarget.noteObiettivo==="ricomposizione"&&(
                      <div style={{marginTop:4,color:"#0891b2",fontWeight:700}}>💪 Ricomposizione rilevata — deficit ridotto al minimo</div>
                    )}
                  </div>
                  </>}
                  </>}
                </div>
                <div style={{marginTop:14,fontSize:10,color:"#9DB1A2",textAlign:"center",lineHeight:1.8}}>
                  Valori indicativi. Consulta un nutrizionista per un piano preciso.
                </div>
              </>
            )}
          </SwipeContainer>
        )}

        {/* Banner rigenerazione: dopo modifiche a ricette/esclusioni il piano
            va aggiornato; senza questo invito inline l'utente lo scopre solo
            passando dal Piano */}
        {(page==="ricette"||page==="ingredienti") && regenNeeded && (
          <div style={{display:"flex",alignItems:"center",gap:10,background:"#15251C",borderRadius:12,padding:"11px 14px",marginBottom:12,boxShadow:"0 10px 24px -12px rgba(21,37,28,0.6)"}}>
            <span style={{fontSize:16,flexShrink:0}}>📋</span>
            <span style={{flex:1,fontSize:12,fontWeight:700,color:"#F4F7EF",lineHeight:1.4}}>Il piano non riflette ancora le ultime modifiche.</span>
            <button onClick={()=>{ navigaA("piano"); regenerate(); }}
              style={{flexShrink:0,border:"none",background:"#C7F23E",color:"#15251C",borderRadius:9,padding:"8px 13px",fontWeight:800,fontSize:12,cursor:"pointer"}}>
              Aggiorna ora
            </button>
          </div>
        )}
        {page==="spesa"&&<ShoppingPage planState={{baseSeed:seed, frozen}} overrides={overrides} genArgs={{excludedIds:excluded, ricetteUtente, ricetteEscluseIds}} checks={spesaChecks[String(seed)]||{}} onToggle={handleToggleSpesa} onReset={handleResetSpesa} personas={personas} mealsLog={mealsLog} consumoAttivo={spesaConsumo} onToggleConsumo={toggleSpesaConsumo}/>}
        {page==="ingredienti"&&<IngredientiPage excluded={excluded} onToggle={toggleExcluded}/>}
        {page==="strumenti"&&<StrumentiPage/>}
        {page==="gusti"&&<GustiPage prefs={prefs} onToggleLike={handleToggleLike} onToggleDislike={handleToggleDislike} onResetPrefs={handleResetPrefs}/>}
        {page==="ricette"&&<RicettePage cloudStatus={cloudStatus} onRicetteChange={handleRicetteChange} onTorna={()=>navigaA("piano")}/>}
        {page==="test-sync"&&<SyncTestPage/>}
        {page==="synclog"&&<SyncLogPage cloudStatus={cloudStatus}/>}
        {page==="privacy"&&<PrivacyPage onTorna={()=>navigaA("opzioni")}/>}
        {page==="opzioni"&&<OpzioniPage devMode={devMode} onToggleDev={toggleDevMode} consenso={consenso} onGoPrivacy={()=>navigaA("privacy")} onRevocaConsenso={handleRevocaConsenso} notifSettings={notifSettings} onNotifChange={handleNotifChange} plan={plan} personas={personas} myPersonaId={myPersonaId} currentSeed={seed} overrides={overrides} onApplySeed={handleApplySeed} history={history} onLoadHistory={(s)=>{ loadHistory(s); setPage("piano"); }}/>}
        {page==="misure"&&<MisurePage personas={personas} myPersonaId={myPersonaId} onMisureChange={handleMisureChange} mealsLog={mealsLog} inFamily={cloudStatus.inFamily} myUid={myUid}/>}
        {page==="utente"&&(
          <UtentePage
            onGoPrivacy={()=>navigaA("privacy")} personas={personas} myPersonaId={myPersonaId} onSetMyPersona={handleSetMyPersona} onGoFamiglia={()=>setPage("famiglia")} onUpdatePersona={handleUpdatePersona} misureApp={misureApp} cloudStatus={cloudStatus}/>
        )}
        {page==="famiglia"&&(
          <FamigliaPage onGoUtente={()=>setPage("utente")} personas={personas} onUpdate={handleUpdatePersona} onAdd={handleAddPersona} onDelete={handleDeletePersona}
            currentSeed={seed} overrides={overrides} onApplySeed={handleApplySeed} myPersonaId={myPersonaId} onSetMyPersona={handleSetMyPersona} misureApp={misureApp}/>
        )}
       </div>
       </ErrorBoundary>
      </div>

      {/* BOTTOM NAV — 3 voci principali */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:"#fff",borderTop:"1px solid #E7EDE2",display:"flex",alignItems:"stretch",boxShadow:"0 -4px 20px #0000001a",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {TABS_MAIN.map(tab=>{
          // "menu" è attivo se siamo in una delle pagine secondarie
          const isSubPage = PAGINE_SECONDARIE.has(page);
          const active = tab.key==="menu"
            ? (isSubPage || menuOpen)
            : page===tab.key;
          // Il conteggio "ingredienti esclusi" NON è più mostrato come badge
          // rosso sulla voce Menu (semantica d'allarme fuorviante per un dato
          // di configurazione): resta visibile dentro il bottom-sheet.
          let badge = 0;
          // Badge spesa: articoli non spuntati della STESSA finestra predefinita
          // della pagina Spesa (oggi + 2 giorni, finestra mobile). Prima contava
          // l'intera settimana di calendario e il numero non coincideva mai con
          // quello mostrato dentro la pagina.
          if (tab.key==="spesa") {
            try {
              const giorni = [], dateKeys = [];
              [0,1,2].forEach(off=>{
                const d = dateForOffset(off);
                const wk = weekIndexForDate(d), wd = weekdayForDate(d);
                const base = planForWeek({baseSeed:seed, frozen}, wk, { excludedIds: excluded, ricetteUtente, ricetteEscluseIds });
                const byPersona = Object.fromEntries(personas.map(p => [p.id, applyOverridesWeek(base, overrides, wk, p.id)[wd]]));
                if (base[wd]) { giorni.push({ dateKey: dateKeyForOffset(off), byPersona }); dateKeys.push(dateKeyForOffset(off)); }
              });
              const consumo = spesaConsumo ? { mealsLog } : null;
              const ids = Object.values(buildShoppingPerPersona(giorni, personas, consumo)).flat().map(i=>i.id);
              const wk = spesaChecks[String(seed)]||{};
              badge = ids.filter(id=>!wk[id]).length;
            } catch { badge = 0; }
          }
          // Pallino sulla tab Misure se l'ultima misurazione è datata (>7gg)
          const misureStale = tab.key==="misure" && (() => {
            const recs = (misureApp[myPersonaId]||[]).map(r=>parseDataIT(r.date)).filter(Boolean);
            if (!recs.length) return true;
            const last = Math.max(...recs.map(d=>d.getTime()));
            return (Date.now()-last)/86400000 > 7;
          })();
          return (
            <button key={tab.key}
              onClick={()=>{
                if (tab.key==="menu") { setMenuOpen(true); return; }
                navigaA(tab.key); setMenuOpen(false);
              }}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 2px 8px",border:"none",background:"transparent",color:active?"#2F6B3A":"#9DB1A2",cursor:"pointer",position:"relative",transition:"color 0.15s",gap:3,minWidth:0}}>
              {active && <div style={{position:"absolute",top:0,left:"30%",right:"30%",height:2,background:"#2F6B3A",borderRadius:"0 0 3px 3px"}}/>}
              <span style={{fontSize:20,lineHeight:1}}>{tab.icon}</span>
              <span style={{fontSize:11,fontWeight:active?800:600,letterSpacing:0.1,whiteSpace:"nowrap"}}>{tab.short}</span>
              {badge>0 && (
                <div style={{position:"absolute",top:6,right:"calc(50% - 20px)",minWidth:16,height:16,background:tab.key==="spesa"?"#2F6B3A":"#ef4444",borderRadius:"50%",fontSize:9,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,padding:"0 4px"}}>{badge}</div>
              )}
              {misureStale && (
                <div title="Misurazione datata" style={{position:"absolute",top:7,right:"calc(50% - 16px)",width:8,height:8,background:"#f59e0b",borderRadius:"50%",border:"1.5px solid #fff"}}/>
              )}
            </button>
          );
        })}
      </div>

      {/* BOTTOM SHEET — menu secondario */}
      {menuOpen && (
        <>
          {/* Overlay scuro: tap fuori per chiudere */}
          <div onClick={()=>setMenuOpen(false)}
            style={{position:"fixed",inset:0,zIndex:200,background:"rgba(15,23,42,0.45)",backdropFilter:"blur(2px)",animation:"fadeIn 0.18s ease-out"}}/>
          {/* Foglio */}
          <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:201,background:"#fff",borderTopLeftRadius:20,borderTopRightRadius:20,boxShadow:"0 -10px 40px rgba(0,0,0,0.2)",paddingBottom:"calc(20px + env(safe-area-inset-bottom,0px))",animation:"slideUp 0.22s cubic-bezier(0.2,0.9,0.3,1)"}}>
            {/* Maniglia */}
            <div style={{width:40,height:4,background:"#C2D0C6",borderRadius:2,margin:"10px auto 8px"}}/>
            <div style={{padding:"4px 20px 16px",fontSize:11,fontWeight:700,color:"#9DB1A2",letterSpacing:1,textTransform:"uppercase"}}>Menu</div>
            <div style={{display:"flex",flexDirection:"column"}}>
              {SUBMENU.map(item=>{
                const isActive = page===item.key;
                const itemBadge = item.key==="ingredienti" && excluded.length>0 ? excluded.length : 0;
                return (
                  <button key={item.key}
                    onClick={()=>{ navigaA(item.key); setMenuOpen(false); }}
                    style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",border:"none",background:isActive?"#EDF7EF":"transparent",cursor:"pointer",textAlign:"left",borderLeft:isActive?"3px solid #2F6B3A":"3px solid transparent",transition:"background 0.12s"}}>
                    <div style={{fontSize:24,width:36,textAlign:"center"}}>{item.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:15,fontWeight:700,color:isActive?"#2F6B3A":"#15251C"}}>{item.label}</div>
                      <div style={{fontSize:11,color:"#9DB1A2",marginTop:1}}>{item.desc}</div>
                    </div>
                    {itemBadge>0 && (
                      <div style={{minWidth:22,height:22,padding:"0 6px",background:"#ef4444",borderRadius:11,fontSize:11,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900}}>{itemBadge}</div>
                    )}
                    <span style={{color:"#C2D0C6",fontSize:18}}>›</span>
                  </button>
                );
              })}
            </div>
          </div>
          <style>{`
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          `}</style>
        </>
      )}
    </div>
  );
}


