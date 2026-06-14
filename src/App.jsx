import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DAYS, DB, DEFAULT_NOTIF, DEFAULT_PERSONAS, ING_QTY, MEAL_KEYS, OBIETTIVI, normalizeAttivita, parseDataIT, SK_EXCL, SK_HISTORY, SK_MEALS_LOG, SK_MISURE, SK_MY_PERSONA, SK_NOTIF, SK_OVERRIDES, SK_PERSONAS, SK_PREFS, SK_SEED, SK_SPESA, buildShoppingForDays, applyOverrides, calcTargetAdattivo, classifySwap, computePrefScore, dateKeyForDayIdx, emojiBySesso, generateWeekPlan, getPrefEntry, hoursUntilMeal, meseCorrente, migrateIdList, migrateMealsLog, migrateOverrides, normalizePrefs, pianoPersonalizzato, restoreCustomING_QTY, ricalcolaMacroAdattati, scheduleNotifications, slotForPersona, todayDayIndex } from '@/core';
import { SwipeContainer } from '@/components/shared';
import { FamigliaPage } from '@/features/famiglia/FamigliaPage';
import { GustiPage } from '@/features/gusti/GustiPage';
import { IngredientiPage } from '@/features/ingredienti/IngredientiPage';
import { MisurePage } from '@/features/misure/MisurePage';
import { OpzioniPage } from '@/features/opzioni/OpzioniPage';
import { OggiPage } from '@/features/oggi/OggiPage';
import { MigrationWizard } from '@/features/famiglia/MigrationWizard';
import { UtentePage } from '@/features/utente/UtentePage';
import { startSync, autoClaimSingle } from '@/db/sync';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SyncTestPage } from '@/features/test/SyncTestPage';
import { SyncLogPage } from '@/features/log/SyncLogPage';
import { cloudEnabled } from '@/db/cloud';
import { MealCard, TotaleBar, WaterTracker } from '@/features/piano/MealParts';
import { ShoppingPage } from '@/features/spesa/ShoppingPage';

export function App() {
  const [page, setPage]               = useState("oggi");
  const [menuOpen, setMenuOpen]       = useState(false);  // bottom-sheet del menu secondario
  const [selDay, setSelDay]           = useState(todayDayIndex());
  const [selPersonaId, setSelPersonaId] = useState(null);
  const [myPersonaId, setMyPersonaId] = useState(null);
  const [seed, setSeed]               = useState(null);
  const [history, setHistory]         = useState([]);
  const [plan, setPlan]               = useState(null);
  const [excluded, setExcluded]       = useState([]);
  const [personas, setPersonas]       = useState([]);
  const [booted, setBooted]           = useState(false);
  const [spinning, setSpinning]       = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [regenNeeded, setRegenNeeded] = useState(false);
  const [spesaChecks, setSpesaChecks] = useState({});   // { [seed]: { [itemId]: true } }
  const [cloudStatus, setCloudStatus] = useState({ loggedIn:false, inFamily:false });
  const [cloudMigrated, setCloudMigrated] = useState(true); // finché non sappiamo, niente wizard
  const [misureApp, setMisureApp]     = useState({});
  const [overrides, setOverrides]     = useState({}); // { "dayIdx-mealKey": ricettaObj }
  const [prefs, setPrefs]             = useState({ recipes:{}, contextSwaps:[] });
  const [mealsLog, setMealsLog]       = useState({});
  const [notifSettings, setNotifSettings] = useState(DEFAULT_NOTIF);

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
    };
    const onUpdate = async (e)=>{
      const k = e.detail?.key;
      const read = async (sk, fb) => { try { const r = await window.storage.get(sk); return JSON.parse(r.value); } catch { return fb; } };
      switch(k){
        case "personas": { const v = await read(SK_PERSONAS, null); if (Array.isArray(v)&&v.length) setPersonas(v); break; }
        case "misure":   { const v = await read(SK_MISURE, null); if (v) setMisureApp(v); break; }
        case "mealsLog": { const v = await read(SK_MEALS_LOG, null); if (v) setMealsLog(v); break; }
        case "prefs":    { const v = await read(SK_PREFS, null); if (v) setPrefs(normalizePrefs(v)); break; }
        case "excluded": { const v = await read(SK_EXCL, null); if (Array.isArray(v)) { setExcluded(v); } break; }
        case "spesa":    { const v = await read(SK_SPESA, null); if (v) setSpesaChecks(v); break; }
        case "history":  { const v = await read(SK_HISTORY, null); if (Array.isArray(v)) setHistory(v); break; }
        case "piano":    {
          const seedCloud = parseInt(e.detail.seed, 10), ovrCloud = e.detail.overrides || {};
          if (isNaN(seedCloud) || seedCloud <= 0) break;
          const np = generateWeekPlan(seedCloud, excludedRef.current || []);
          setSeed(seedCloud); setPlan(np); setOverrides(ovrCloud); setRegenNeeded(false);
          break;
        }
      }
    };
    window.addEventListener("pf-cloud-status", onStatus);
    window.addEventListener("pf-cloud-update", onUpdate);
    return ()=>{ window.removeEventListener("pf-cloud-status", onStatus); window.removeEventListener("pf-cloud-update", onUpdate); };
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
    // Aggiornamento ottimistico immediato per la UI
    const nuovoStato = !((spesaChecks[String(seed)]||{})[itemId]);
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
    // Ottimistico
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
      try {
        const [sS,hS,eS,pS,mS,miS,ovS,prS,mlS,nfS,spS,cmS] = await Promise.allSettled([
          window.storage.get(SK_SEED), window.storage.get(SK_HISTORY), window.storage.get(SK_EXCL),
          window.storage.get(SK_PERSONAS), window.storage.get(SK_MY_PERSONA), window.storage.get(SK_MISURE),
          window.storage.get(SK_OVERRIDES), window.storage.get(SK_PREFS),
          window.storage.get(SK_MEALS_LOG), window.storage.get(SK_NOTIF),
          window.storage.get(SK_SPESA), window.storage.get("pf-cloud-migrated"),
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
        const loadedPers = loadedPersBase.map(p =>
          (p.lavoro !== undefined && p.allenamenti !== undefined) ? p : { ...p, ...normalizeAttivita(p) }
        );
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
        // Ripristina ING_QTY per ricette custom salvate negli overrides
        for (const ricetta of Object.values(loadedOvrd || {})) {
          restoreCustomING_QTY(ricetta);
        }
        setMisureApp(loadedMisu); setOverrides(loadedOvrd); setPrefs(loadedPrefs); setMealsLog(loadedMealsLog); setNotifSettings(loadedNotif);
        setPlan(generateWeekPlan(loadedSeed, loadedExcl));
        setBooted(true);
      } catch (err) {
        console.error("Errore caricamento dati:", err);
        // Fallback prudente: NON sovrascrivere il seed salvato (e quindi il
        // piano condiviso) per un errore transitorio di caricamento.
        let ns = Date.now();
        try { const r = await window.storage.get(SK_SEED); const p = parseInt(r.value,10); if (!isNaN(p)&&p>0) ns = p; } catch {}
        setSeed(ns); setPersonas([]);
        setPlan(generateWeekPlan(ns,[]));
        setBooted(true);
      }
    }
    load();
  },[]);

  const handleUpdatePersona = useCallback((updated)=>{
    setPersonas(prev=>{ const next=prev.map(p=>p.id===updated.id?updated:p); window.storage.set(SK_PERSONAS,JSON.stringify(next)).catch(()=>{}); return next; });
  },[]);

  const handleAddPersona = useCallback((p)=>{
    setPersonas(prev=>{ const next=[...prev,p]; window.storage.set(SK_PERSONAS,JSON.stringify(next)).catch(()=>{}); return next; });
    setSelPersonaId(p.id);
  },[]);

  const handleDeletePersona = useCallback((id)=>{
    setPersonas(prev=>{ const next=prev.filter(p=>p.id!==id); window.storage.set(SK_PERSONAS,JSON.stringify(next)).catch(()=>{}); if(selPersonaId===id) setSelPersonaId(next[0]?.id||null); return next; });
  },[selPersonaId]);

  const handleNotifChange = useCallback((next) => {
    setNotifSettings(next); window.storage.set(SK_NOTIF, JSON.stringify(next)).catch(()=>{});
  }, []);
  const handleToggleMealLog = useCallback((personaId, dateKey, mealKey, macros) => {
    setMealsLog(prev => {
      const pLog=prev[personaId]||{},dayLog=pLog[dateKey]||{},cur=dayLog[mealKey];
      let next;
      if (cur) {
        // Toggle consumed: mantieni le macro già salvate (non aggiornare con quelle correnti)
        next = {...dayLog, [mealKey]: {...cur, consumed: !cur.consumed}};
      } else {
        // Prima volta: salva le macro attuali e segna come consumato
        next = {...dayLog, [mealKey]: {consumed: true, ...macros}};
      }
      const nextFull={...prev,[personaId]:{...pLog,[dateKey]:next}};
      window.storage.set(SK_MEALS_LOG,JSON.stringify(nextFull)).catch(()=>{}); return nextFull;
    });
  }, []);

  // Aggiorna macro e ingredienti di un pasto già consumato con i valori reali
  const handleEditConsumedMeal = useCallback((personaId, dateKey, mealKey, data) => {
    // data = { kcal, p, c, g, _ingredienti: { ingId: {valore, unit} } }
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
  const handleSetMyPersona = useCallback((id)=>{
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
        ? { score:0, liked:false, swapsOut:0, swapsIn:0, ...recipes[recipeId] }
        : { score:0, liked:false, swapsOut:0, swapsIn:0 };
      const mutated = mutator(current);
      mutated.score = computePrefScore(mutated);
      mutated.updated = new Date().toLocaleDateString("it-IT");
      const next = { ...prev, recipes: { ...recipes, [recipeId]: mutated } };
      window.storage.set(SK_PREFS, JSON.stringify(next)).catch(()=>{});
      return next;
    });
  }, []);

  // Like esplicito: attiva/disattiva il cuore su una ricetta.
  const handleToggleLike = useCallback((recipeId) => {
    updatePref(recipeId, e => ({ ...e, liked: !e.liked }));
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

  const handleSwap = useCallback(async(dayIdx, mealKey, oldMeal, newMeal) => {
    // Se è una ricetta custom, assicura che ING_QTY sia aggiornato prima di salvare
    restoreCustomING_QTY(newMeal);
    const key = `${dayIdx}-${mealKey}`;
    setOverrides(prev => {
      const next = {...prev, [key]: newMeal};
      window.storage.set(SK_OVERRIDES, JSON.stringify(next)).catch(()=>{});
      return next;
    });
    if (!oldMeal || !newMeal || oldMeal.id === newMeal.id) return;

    // Classifica lo swap: contesto (fretta) o gusto (valutazione).
    const tipo = classifySwap(dayIdx, mealKey);
    if (tipo === "contesto") {
      // Vincolo pratico, non un giudizio: i gusti NON vengono toccati.
      // Registriamo il dato grezzo per analisi future sulle fasce orarie.
      logContextSwap(dayIdx, mealKey, oldMeal, newMeal, hoursUntilMeal(dayIdx, mealKey));
    } else {
      // Giudizio sulla ricetta: penalizza la scartata, premia la scelta.
      updatePref(oldMeal.id, e => ({ ...e, swapsOut: (e.swapsOut||0) + 1 }));
      updatePref(newMeal.id, e => ({ ...e, swapsIn:  (e.swapsIn ||0) + 1 }));
    }
  }, [updatePref, logContextSwap]);

  const handleResetSwap = useCallback(async(dayIdx, mealKey) => {
    const key = `${dayIdx}-${mealKey}`;
    setOverrides(prev => {
      const next = {...prev};
      delete next[key];
      window.storage.set(SK_OVERRIDES, JSON.stringify(next)).catch(()=>{});
      return next;
    });
  }, []);

  const handleApplySeed = useCallback(async(newSeed, newOverrides)=>{
    setSpinning(true); await new Promise(r=>setTimeout(r,400));
    const np=generateWeekPlan(newSeed,excluded);
    const nh=[{seed,date:new Date().toLocaleDateString("it-IT"),label:`Piano del ${new Date().toLocaleDateString("it-IT")}`},...history].slice(0,5);
    const resolvedOverrides = newOverrides || {};
    setSeed(newSeed); setPlan(np); setHistory(nh); setSelDay(0); setRegenNeeded(false); setOverrides(resolvedOverrides);
    try {
      await window.storage.set(SK_SEED,String(newSeed));
      await window.storage.set(SK_HISTORY,JSON.stringify(nh));
      await window.storage.set(SK_OVERRIDES,JSON.stringify(resolvedOverrides));
    } catch{}
    setSpinning(false);
  },[seed,history,excluded]);

  const regenerate = useCallback(async()=>{
    setSpinning(true); await new Promise(r=>setTimeout(r,500));
    const ns=Date.now(), np=generateWeekPlan(ns,excluded);
    const nh=[{seed,date:new Date().toLocaleDateString("it-IT"),label:`Piano del ${new Date().toLocaleDateString("it-IT")}`},...history].slice(0,5);
    setSeed(ns); setPlan(np); setHistory(nh); setSelDay(0); setRegenNeeded(false); setOverrides({});
    try {
      await window.storage.set(SK_SEED,String(ns));
      await window.storage.set(SK_HISTORY,JSON.stringify(nh));
      await window.storage.set(SK_OVERRIDES,"{}");
    } catch{}
    setSpinning(false);
  },[seed,history,excluded]);

  const loadHistory = useCallback(async(oldSeed)=>{
    setSpinning(true); await new Promise(r=>setTimeout(r,300));
    setSeed(oldSeed); setPlan(generateWeekPlan(oldSeed,excluded)); setSelDay(0); setShowHistory(false);
    setOverrides({});
    try {
      await window.storage.set(SK_SEED,String(oldSeed));
      await window.storage.set(SK_OVERRIDES,"{}");
    } catch{}
    setSpinning(false);
  },[excluded]);

  const toggleExcluded = useCallback(async(id)=>{
    setExcluded(prev=>{ const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]; window.storage.set(SK_EXCL,JSON.stringify(next)).catch(()=>{}); return next; });
    setRegenNeeded(true);
  },[]);

  if (!plan) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>
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
  const personaTarget = persona ? calcTargetAdattivo(persona, misureApp[persona?.id]) : null;
  const personaSlot = persona ? slotForPersona(persona) : "uomo";

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
    {key:"utente",      label:"Utente",      icon:"👤", desc:"Account, accesso e sincronizzazione"},
    {key:"famiglia",    label:"Famiglia",    icon:"👥", desc:"Crea e gestisci la famiglia, profili"},
    {key:"ingredienti", label:"Ingredienti", icon:"🥦", desc:"Cosa escludere dal piano"},
    {key:"gusti",       label:"Gusti",       icon:"❤️", desc:"Preferiti e non amati"},
    {key:"opzioni",     label:"Opzioni",     icon:"⚙️", desc:"Notifiche e promemoria pasti"},
  ];

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
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f1f5f9",fontSize:32}}>🥗</div>;
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%)",fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:80}}>
      {/* HEADER */}
      <div style={{background:"linear-gradient(90deg,#1e293b 0%,#334155 100%)",padding:"20px 20px 16px",paddingTop:"calc(20px + env(safe-area-inset-top,0px))"}}>
        <div style={{maxWidth:680,margin:"0 auto"}}>
          <div style={{fontSize:9,color:"#94a3b8",letterSpacing:2,textTransform:"uppercase",marginBottom:2}}>Piano Alimentare Familiare</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:14}}>
            <div style={{fontSize:19,fontWeight:800,color:"#f8fafc",letterSpacing:-0.5}}>
              {personas.length} {personas.length===1?"persona":"persone"} · 7 giorni
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {regenNeeded&&<span style={{fontSize:10,color:"#fbbf24",fontWeight:700,background:"#78350f40",borderRadius:5,padding:"2px 6px"}}>⚠ Rigenera</span>}
              <button onClick={regenerate} disabled={spinning} style={{display:"flex",alignItems:"center",gap:6,background:spinning?"#334155":"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",border:"none",borderRadius:9,padding:"8px 14px",fontWeight:700,fontSize:11,cursor:spinning?"not-allowed":"pointer",boxShadow:spinning?"none":"0 4px 14px #2563eb55",transition:"all 0.2s"}}>
                <span style={{display:"inline-block",animation:spinning?"spin 0.7s linear infinite":"none",fontSize:13}}>🔄</span>
                {spinning?"...":"Nuovo piano"}
              </button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
            <span style={{fontSize:13,color:"#e2e8f0",fontWeight:700}}>{(()=>{
              const main = TABS_MAIN.find(t=>t.key===page);
              if (main) return `${main.icon} ${main.short}`;
              const sub = SUBMENU.find(s=>s.key===page);
              if (sub) return `${sub.icon} ${sub.label}`;
              return "";
            })()}</span>
            {/* Badge stagione corrente */}
            {page==="piano"&&!showHistory&&(()=>{
              const m = meseCorrente();
              const nomiMesi = ["","Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
              const stagEmoji = m>=3&&m<=5?"🌸":m>=6&&m<=8?"☀️":m>=9&&m<=11?"🍂":"❄️";
              return (
                <span style={{marginLeft:4,fontSize:10,background:"rgba(255,255,255,0.15)",borderRadius:5,padding:"2px 8px",color:"#e2e8f0",fontWeight:600}}>
                  {stagEmoji} {nomiMesi[m]} · stagionale
                </span>
              );
            })()}
            {history.length>0&&<button onClick={()=>setShowHistory(h=>!h)} style={{marginLeft:"auto",flexShrink:0,padding:"4px 10px",borderRadius:6,border:"none",background:showHistory?"#fff":"rgba(255,255,255,0.15)",color:showHistory?"#1e293b":"#e2e8f0",fontWeight:700,fontSize:11,cursor:"pointer"}}>🕐 Storico</button>}
          </div>
          {page==="piano"&&!showHistory&&(
            <div style={{display:"flex",gap:7,marginTop:12,flexWrap:"wrap"}}>
              {personas.map(p=>{
                const t=calcTargetAdattivo(p, misureApp[p.id]);
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:"#ffffff12",borderRadius:7,padding:"3px 10px",border:`1px solid ${p.color}50`}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:p.color}}/>
                    <span style={{color:"#e2e8f0",fontSize:11}}>{emojiBySesso(p)} {p.nome}</span>
                    <span style={{color:p.color,fontSize:11,fontFamily:"monospace",fontWeight:700}}>{t.kcal}</span>
                    <span style={{fontSize:10}}>{t.confidenza.dot}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{maxWidth:680,margin:"0 auto",padding:"18px 16px 0"}}>
       <ErrorBoundary onReset={()=>{ setShowHistory(false); setPage("oggi"); }}>
       <div key={showHistory?"history":page} style={{animation:"pageIn 0.22s ease-out"}}>
        {/* STORICO */}
        {showHistory&&(
          <div>
            <div style={{fontWeight:800,fontSize:14,color:"#1e293b",marginBottom:12}}>🕐 Piani precedenti</div>
            {history.map((h,i)=>(
              <div key={i} onClick={()=>loadHistory(h.seed)} style={{background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",padding:"12px 16px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div><div style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>{h.label}</div><div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>seed: {h.seed}</div></div>
                <span style={{fontSize:12,color:"#2563eb",fontWeight:700}}>Ricarica →</span>
              </div>
            ))}
          </div>
        )}

        {/* PIANO */}
        {cloudStatus.inFamily && !cloudMigrated && personas.length>1 && (
          <MigrationWizard personas={personas} onDone={()=>setCloudMigrated(true)}/>
        )}
        {!showHistory&&page==="oggi"&&(
          <OggiPage
            personas={personas}
            selPersonaId={selPersonaId}
            onSelPersona={setSelPersonaId}
            persona={persona}
            personaSlot={personaSlot}
            target={personaTarget}
            effectivePlan={applyOverrides(plan, overrides)}
            misure={misureApp[persona?.id]}
            mealsLog={mealsLog}
            onToggleMeal={handleToggleMealLog}
            onGoPiano={()=>{ setSelDay(todayDayIndex()); setPage("piano"); }}
            onGoMisure={()=>setPage("misure")}
          />
        )}
        {!showHistory&&page==="piano"&&(
          <SwipeContainer onSwipeLeft={swipeAvanti} onSwipeRight={swipeIndietro} style={{touchAction:"pan-y"}}>
            <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
              {personas.map(p=>{
                const isMe=myPersonaId===p.id;
                return (
                  <button key={p.id} onClick={()=>setSelPersonaId(p.id)} style={{flexShrink:0,padding:"8px 14px",borderRadius:10,border:"2px solid",borderColor:selPersonaId===p.id?p.color:"#e2e8f0",background:selPersonaId===p.id?p.color+"12":"#fff",color:selPersonaId===p.id?p.color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}}>
                    {emojiBySesso(p)} {p.nome}
                    {isMe&&<span style={{fontSize:9,background:p.color,color:"#fff",borderRadius:4,padding:"1px 5px",fontWeight:900}}>IO</span>}
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",gap:5,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
              {DAYS.map((d,i)=>(
                <button key={d} onClick={()=>setSelDay(i)} style={{flexShrink:0,padding:"6px 10px",borderRadius:8,border:"2px solid",borderColor:selDay===i?persona.color:"#e2e8f0",background:selDay===i?persona.color:"#fff",color:selDay===i?"#fff":"#64748b",fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.2s"}}>
                  {d.slice(0,3)}
                </button>
              ))}
            </div>
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"7px 11px",marginBottom:12,fontSize:11,color:"#92400e"}}>
              💡 Tocca ogni pasto per le porzioni · <strong>Nuovo piano</strong> per variare
            </div>
            {spinning ? <div style={{textAlign:"center",padding:"40px 0",color:"#64748b"}}>🔄 Generando...</div> : (
              <>
                {(()=>{
                  // Piano effettivo: stessa fonte usata dalla scheda Spesa.
                  const effectivePlan = applyOverrides(plan, overrides);
                  // Set di tutti gli id ricette presenti nel piano questa
                  // settimana (override inclusi): evita di riproporre piatti
                  // già in calendario tra le alternative.
                  const weekMealIds = new Set(
                    effectivePlan.flatMap(d => MEAL_KEYS.map(mk => d[mk]?.id)).filter(Boolean)
                  );
                  const effectiveDay = effectivePlan[selDay];
                  // Piano personalizzato: se la persona ha misure, le
                  // porzioni vengono riscalate dal motore sul suo
                  // fabbisogno (LARN). Senza misure → taglie fisse.
                  const pianoPers = pianoPersonalizzato(effectiveDay, persona, misureApp[persona?.id]);
                  const selDayLog = (mealsLog[persona.id]||{})[dateKeyForDayIdx(selDay)]||{};
                  // macro base per ogni pasto (personalizzati o fissi)
                  const macroBase = {};
                  MEAL_KEYS.forEach(mk => {
                    macroBase[mk] = (pianoPers.personalizzato ? pianoPers.perPasto[mk] : null) || effectiveDay[mk]?.[personaSlot] || {kcal:0,p:0,c:0,g:0};
                  });
                  // ricalcolo proporzionale dei pasti non ancora consumati
                  const { adattato: macroAdattati, delta: kcalDelta, avviso: avvisoBilancio } = ricalcolaMacroAdattati(MEAL_KEYS, macroBase, selDayLog);
                  return (
                    <>
                      {avvisoBilancio && (
                        <div style={{background:"#fffbeb",border:"1.5px solid #fcd34d",borderRadius:10,padding:"10px 14px",marginBottom:8,fontSize:12,color:"#92400e",fontWeight:600,lineHeight:1.5}}>
                          {avvisoBilancio}
                        </div>
                      )}
                      {MEAL_KEYS.map(mk => {
                        const key = `${selDay}-${mk}`;
                        const isOverride = !!overrides[key];
                        const isConsumed = !!selDayLog[mk]?.consumed;
                        // Per i pasti non consumati usa i macro riadattati; per i consumati restano quelli reali del log
                        const macroEff = !isConsumed ? macroAdattati[mk] : macroBase[mk];
                        const isAdattato = !isConsumed && macroAdattati[mk]?._adattato;
                        return (
                          <MealCard
                            key={mk}
                            mealKey={mk}
                            dayIdx={selDay}
                            meal={effectiveDay[mk]}
                            personaKey={personaSlot}
                            color={persona.color}
                            isOverride={isOverride}
                            weekMealIds={weekMealIds}
                            excludedIds={excluded}
                            prefEntry={getPrefEntry(prefs, effectiveDay[mk]?.id)}
                            onToggleLike={() => handleToggleLike(effectiveDay[mk]?.id)}
                            onSwap={alt => handleSwap(selDay, mk, effectiveDay[mk], alt)}
                            onReset={() => handleResetSwap(selDay, mk)}
                            macroOverride={macroEff}
                            isAdattato={isAdattato}
                            quantitaOverride={pianoPers.personalizzato && effectiveDay[mk] && pianoPers.quantita && !isAdattato ? pianoPers.quantita[effectiveDay[mk].id] : null}
                            consumed={isConsumed}
                            onToggleConsumed={()=>handleToggleMealLog(persona.id,dateKeyForDayIdx(selDay),mk,macroBase[mk])}
                            onEdit={customRecipe => handleSwap(selDay, mk, effectiveDay[mk], customRecipe)}
                            loggedMacros={(()=>{const e=selDayLog[mk];return e?.consumed&&(e.kcal||e._ingredienti)?{kcal:e.kcal||0,p:e.p||0,c:e.c||0,g:e.g||0}:null;})()}
                            loggedIngs={selDayLog[mk]?._ingredienti||null}
                            onEditConsumed={data=>handleEditConsumedMeal(persona.id,dateKeyForDayIdx(selDay),mk,data)}
                          />
                        );
                      })}
                      <TotaleBar dayData={effectiveDay} personaKey={personaSlot} color={persona.color} target={personaTarget} macroPerPasto={macroAdattati} dayLog={selDayLog}/>
                      {/* ── Tracker idratazione ── */}
                      {(()=>{
                        // dayKey = "seedBase-dayIndex" → univoco per piano+giorno
                        const dayKey = `${seed}-${selDay}`;
                        return <WaterTracker key={dayKey} dayKey={dayKey} personaColor={persona.color}/>;
                      })()}
                    </>
                  );
                })()}
                <div style={{marginTop:14,background:"#fff",borderRadius:12,border:"1.5px solid #e2e8f0",padding:"12px 16px"}}>
                  {/* Intestazione con badge confidenza */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase"}}>
                      Target — {emojiBySesso(persona)} {persona.nome}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      {(()=>{
                        const ob = OBIETTIVI.find(o=>o.key===persona.obiettivo);
                        const obStyle = {
                          perdita:      {ic:"📉",bg:"#eff6ff",bd:"#bfdbfe",col:"#2563eb"},
                          mantenimento: {ic:"⚖️",bg:"#f0fdf4",bd:"#bbf7d0",col:"#16a34a"},
                          aumento:      {ic:"📈",bg:"#fef2f2",bd:"#fecaca",col:"#dc2626"},
                        }[persona.obiettivo] || {ic:"⚖️",bg:"#f1f5f9",bd:"#e2e8f0",col:"#64748b"};
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
                  </div>
                  {/* Macro grid */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    {[{label:"Calorie",val:personaTarget.kcal,unit:"kcal"},{label:"Proteine",val:personaTarget.p,unit:"g/die"},{label:"Carboidrati",val:personaTarget.c,unit:"g/die"},{label:"Grassi",val:personaTarget.g,unit:"g/die"}].map(({label,val,unit})=>(
                      <div key={label} style={{background:persona.color+"08",borderRadius:8,padding:"8px 12px",border:`1px solid ${persona.color}20`}}>
                        <div style={{fontSize:9,color:"#94a3b8",marginBottom:2,textTransform:"uppercase",letterSpacing:0.8}}>{label}</div>
                        <div style={{fontSize:16,fontWeight:800,color:persona.color,fontFamily:"monospace"}}>{val}<span style={{fontSize:10,fontWeight:400,marginLeft:2}}>{unit}</span></div>
                      </div>
                    ))}
                  </div>
                  {/* Dettagli algoritmo */}
                  <div style={{background:"#f8fafc",borderRadius:8,padding:"8px 12px",fontSize:10,color:"#64748b",lineHeight:1.8}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span>TDEE stimato</span>
                      <span style={{fontFamily:"monospace",fontWeight:700,color:"#1e293b"}}>{personaTarget.tdeeFinale} kcal</span>
                    </div>
                    {(()=>{
                      const d = personaTarget.kcal - personaTarget.tdeeFinale;
                      if (Math.abs(d) < 1) return null;
                      const txt = d < 0 ? `deficit ${-d} kcal` : `surplus +${d} kcal`;
                      const col = d < 0 ? "#2563eb" : "#dc2626";
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
                        <span style={{fontFamily:"monospace",fontWeight:700,color:"#1e293b"}}>{personaTarget.pctGrasso}%</span>
                      </div>
                    )}
                    {personaTarget.usaTDEEAdattivo&&personaTarget.adattivoInfo&&(
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span>Dati usati</span>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:"#1e293b"}}>{personaTarget.nMisure} misurazioni · {personaTarget.adattivoInfo.settimane.toFixed(1)} sett.</span>
                      </div>
                    )}
                    {personaTarget.noteObiettivo==="ricomposizione"&&(
                      <div style={{marginTop:4,color:"#0891b2",fontWeight:700}}>💪 Ricomposizione rilevata — deficit ridotto al minimo</div>
                    )}
                  </div>
                </div>
                <div style={{marginTop:14,fontSize:10,color:"#94a3b8",textAlign:"center",lineHeight:1.8}}>
                  DB: {DB.colazione.length} colazioni · {DB.pranzo.length} pranzi · {DB.cena.length} cene · {DB.spuntino.length} spuntini<br/>
                  Valori indicativi. Consulta un nutrizionista per un piano preciso.
                </div>
              </>
            )}
          </SwipeContainer>
        )}

        {!showHistory&&page==="spesa"&&<ShoppingPage plan={applyOverrides(plan, overrides)} checks={spesaChecks[String(seed)]||{}} onToggle={handleToggleSpesa} onReset={handleResetSpesa}/>}
        {!showHistory&&page==="ingredienti"&&<IngredientiPage excluded={excluded} onToggle={toggleExcluded}/>}
        {!showHistory&&page==="gusti"&&<GustiPage prefs={prefs} onToggleLike={handleToggleLike} onResetPrefs={handleResetPrefs}/>}
        {!showHistory&&page==="test-sync"&&<SyncTestPage/>}
        {!showHistory&&page==="synclog"&&<SyncLogPage cloudStatus={cloudStatus}/>}
        {!showHistory&&page==="opzioni"&&<OpzioniPage notifSettings={notifSettings} onNotifChange={handleNotifChange} plan={plan} personas={personas} myPersonaId={myPersonaId} currentSeed={seed} overrides={overrides} onApplySeed={handleApplySeed}/>}
        {!showHistory&&page==="misure"&&<MisurePage personas={personas} myPersonaId={myPersonaId} onMisureChange={setMisureApp} mealsLog={mealsLog}/>}
        {!showHistory&&page==="utente"&&(
          <UtentePage personas={personas} myPersonaId={myPersonaId} onSetMyPersona={handleSetMyPersona} onGoFamiglia={()=>setPage("famiglia")} onUpdatePersona={handleUpdatePersona} misureApp={misureApp} cloudStatus={cloudStatus}/>
        )}
        {!showHistory&&page==="famiglia"&&(
          <FamigliaPage onGoUtente={()=>setPage("utente")} personas={personas} onUpdate={handleUpdatePersona} onAdd={handleAddPersona} onDelete={handleDeletePersona}
            currentSeed={seed} overrides={overrides} onApplySeed={handleApplySeed} myPersonaId={myPersonaId} onSetMyPersona={handleSetMyPersona} misureApp={misureApp}/>
        )}
       </div>
       </ErrorBoundary>
      </div>

      {/* BOTTOM NAV — 3 voci principali */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:"#fff",borderTop:"1px solid #e2e8f0",display:"flex",alignItems:"stretch",boxShadow:"0 -4px 20px #0000001a",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {TABS_MAIN.map(tab=>{
          // "menu" è attivo se siamo in una delle 4 pagine secondarie
          const isSubPage = SUBMENU.some(s=>s.key===page);
          const active = tab.key==="menu"
            ? (isSubPage || menuOpen) && !showHistory
            : page===tab.key && !showHistory;
          // Badge "ingredienti esclusi" mostrato sulla voce Menu
          let badge = tab.key==="menu" && excluded.length>0 ? excluded.length : 0;
          // Badge spesa: articoli della settimana non ancora spuntati
          if (tab.key==="spesa") {
            try {
              const eff = applyOverrides(plan, overrides);
              const ids = Object.values(buildShoppingForDays(eff,[0,1,2,3,4,5,6])).flat().map(i=>i.id);
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
                setPage(tab.key); setShowHistory(false); setMenuOpen(false);
              }}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 2px 8px",border:"none",background:"transparent",color:active?"#2563eb":"#94a3b8",cursor:"pointer",position:"relative",transition:"color 0.15s",gap:3,minWidth:0}}>
              {active && <div style={{position:"absolute",top:0,left:"30%",right:"30%",height:2,background:"#2563eb",borderRadius:"0 0 3px 3px"}}/>}
              <span style={{fontSize:20,lineHeight:1}}>{tab.icon}</span>
              <span style={{fontSize:11,fontWeight:active?800:600,letterSpacing:0.1,whiteSpace:"nowrap"}}>{tab.short}</span>
              {badge>0 && (
                <div style={{position:"absolute",top:6,right:"calc(50% - 20px)",minWidth:16,height:16,background:"#ef4444",borderRadius:"50%",fontSize:9,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,padding:"0 4px"}}>{badge}</div>
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
            <div style={{width:40,height:4,background:"#cbd5e1",borderRadius:2,margin:"10px auto 8px"}}/>
            <div style={{padding:"4px 20px 16px",fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase"}}>Menu</div>
            <div style={{display:"flex",flexDirection:"column"}}>
              {SUBMENU.map(item=>{
                const isActive = page===item.key && !showHistory;
                const itemBadge = item.key==="ingredienti" && excluded.length>0 ? excluded.length : 0;
                return (
                  <button key={item.key}
                    onClick={()=>{ setPage(item.key); setShowHistory(false); setMenuOpen(false); }}
                    style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",border:"none",background:isActive?"#eff6ff":"transparent",cursor:"pointer",textAlign:"left",borderLeft:isActive?"3px solid #2563eb":"3px solid transparent",transition:"background 0.12s"}}>
                    <div style={{fontSize:24,width:36,textAlign:"center"}}>{item.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:15,fontWeight:700,color:isActive?"#2563eb":"#1e293b"}}>{item.label}</div>
                      <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{item.desc}</div>
                    </div>
                    {itemBadge>0 && (
                      <div style={{minWidth:22,height:22,padding:"0 6px",background:"#ef4444",borderRadius:11,fontSize:11,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900}}>{itemBadge}</div>
                    )}
                    <span style={{color:"#cbd5e1",fontSize:18}}>›</span>
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


