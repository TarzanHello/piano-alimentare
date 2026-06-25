import React from 'react';
const { useState, useEffect, useCallback, useMemo, useRef } = React;
import { DAYS, DB, DEFAULT_NOTIF, DEFAULT_PERSONAS, ING_QTY, MEAL_KEYS, OBIETTIVI, normalizeAttivita, parseDataIT, SK_EXCL, SK_HISTORY, SK_MEALS_LOG, SK_MISURE, SK_MY_PERSONA, SK_NOTIF, SK_OVERRIDES, SK_PERSONAS, SK_PREFS, SK_SEED, SK_SPESA, SK_TARGET_GIORNALIERO, buildShoppingForDays, applyOverrides, calcTargetAdattivo, classifySwap, computePrefScore, dateKeyForDayIdx, emojiBySesso, generateWeekPlan, getPrefEntry, hoursUntilMeal, meseCorrente, migrateIdList, migrateMealsLog, migrateOverrides, normalizePrefs, pianoPersonalizzato, restoreCustomING_QTY, ricalcolaMacroAdattati, ricettaUtenteToMealObj, scheduleNotifications, slotForPersona, todayDayIndex } from '@/core';
import { SwipeContainer } from '@/components/shared';
import { FamigliaPage } from '@/features/famiglia/FamigliaPage';
import { GustiPage } from '@/features/gusti/GustiPage';
import { RicettePage } from '@/features/ricette/RicettePage';
import { IngredientiPage } from '@/features/ingredienti/IngredientiPage';
import { MisurePage } from '@/features/misure/MisurePage';
import { OpzioniPage } from '@/features/opzioni/OpzioniPage';
import { OggiPage } from '@/features/oggi/OggiPage';
import { MigrationWizard } from '@/features/famiglia/MigrationWizard';
import { UtentePage } from '@/features/utente/UtentePage';
import { startSync, autoClaimSingle, pushTargetGiornaliero } from '@/db/sync';
import { caricaRicette } from '@/db/ricetteCloud';
import { logSync } from '@/db/synclog';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SyncTestPage } from '@/features/test/SyncTestPage';
import { SyncLogPage } from '@/features/log/SyncLogPage';
import { cloudEnabled } from '@/db/cloud';
import { MealCard, TotaleBar, WaterTracker } from '@/features/piano/MealParts';
import { ShoppingPage } from '@/features/spesa/ShoppingPage';

// Rimappa i colori-profilo legacy sul nuovo sistema verde:
// il vecchio blu brand (#2563eb) diventa il verde brand (#2F6B3A).
// Gli altri colori-persona (rosa, ecc.) restano identificatori distinti.
const LEGACY_PERSONA_COLORS = { "#2563eb": "#2F6B3A" };
function remapPersonaColors(list) {
  if (!Array.isArray(list)) return list;
  return list.map(p => (p && LEGACY_PERSONA_COLORS[p.color]) ? { ...p, color: LEGACY_PERSONA_COLORS[p.color] } : p);
}

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
  const [swUpdate, setSwUpdate]       = useState(false); // nuova versione disponibile
  // Cache dei target giornalieri pushati dagli owner: { [profilo_id]: targetObj }
  // Usato da personaTarget per i profili non-propri (fonte di verità cloud).
  const [targetsCloud, setTargetsCloud] = useState({});
  // Ricette personali/famiglia caricate dal cloud — alimentano il pool del piano
  const [ricetteUtente, setRicetteUtente] = useState([]);
  // Set di id-ricetta esclusi dal piano: catalogo (localStorage cat-escluse) + utente (flag esclusa)
  const [ricetteEscluseIds, setRicetteEscluseIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cat-escluse")||"[]")); } catch { return new Set(); }
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
      // Carica le ricette utente non appena connesso (alimentano il pool del piano)
      if (s.loggedIn) {
        caricaRicette().then(rs => {
          setRicetteUtente(rs);
          aggiornaEscluse(rs);
        }).catch(()=>{});
      } else {
        setRicetteUtente([]);
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
          const np = generateWeekPlan(seedCloud, excludedRef.current || [], undefined, ricetteUtente, ricetteEscluseIds);
          setSeed(seedCloud); setPlan(np); setOverrides(ovrCloud); setRegenNeeded(false);
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
        // Ripristina ING_QTY per ricette custom salvate negli overrides
        for (const ricetta of Object.values(loadedOvrd || {})) {
          restoreCustomING_QTY(ricetta);
        }
        setMisureApp(loadedMisu); setOverrides(loadedOvrd); setPrefs(loadedPrefs); setMealsLog(loadedMealsLog); setNotifSettings(loadedNotif);
        setPlan(generateWeekPlan(loadedSeed, loadedExcl, undefined, ricetteUtente, ricetteEscluseIds));
        logSync("info", "App avviata", { profili: loadedPers.length, seed: String(loadedSeed), overrides: Object.keys(loadedOvrd||{}).length, esclusi: loadedExcl.length });
        setBooted(true);
      } catch (err) {
        logSync("error", "Errore caricamento dati locali", { error: err?.message });
        console.error("Errore caricamento dati:", err);
        let ns = Date.now();
        try { const r = await window.storage.get(SK_SEED); const p = parseInt(r.value,10); if (!isNaN(p)&&p>0) ns = p; } catch {}
        setSeed(ns); setPersonas([]);
        setPlan(generateWeekPlan(ns,[], undefined, ricetteUtente, ricetteEscluseIds));
        setBooted(true);
      }
    }
    load();
  },[]);

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
      const pLog=prev[personaId]||{},dayLog=pLog[dateKey]||{},cur=dayLog[mealKey];
      let next;
      if (cur) {
        next = {...dayLog, [mealKey]: {...cur, consumed: !cur.consumed}};
        logSync("pasto-log", `Pasto ${cur.consumed ? "non consumato" : "consumato"}: ${mealKey}`, { personaId: personaId?.slice(0,8), dateKey, mealKey });
      } else {
        next = {...dayLog, [mealKey]: {consumed: true, ...macros}};
        logSync("pasto-log", `Pasto consumato: ${mealKey}`, { personaId: personaId?.slice(0,8), dateKey, kcal: macros?.kcal });
      }
      const nextFull={...prev,[personaId]:{...pLog,[dateKey]:next}};
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
    logSync("swap", `Cambio pasto: ${mealKey} (giorno ${dayIdx})`, {
      da: oldMeal?.id, a: newMeal?.id, nomeA: newMeal?.nome?.slice(0,30),
      fonte: newMeal?.fonte || "catalogo",
    });
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
      logContextSwap(dayIdx, mealKey, oldMeal, newMeal, hoursUntilMeal(dayIdx, mealKey));
    } else {
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
    logSync("piano", `Piano applicato da storico`, { seed: String(newSeed) });
    setSpinning(true); await new Promise(r=>setTimeout(r,400));
    const np=generateWeekPlan(newSeed, excluded, undefined, ricetteUtente, ricetteEscluseIds);
    const nh=[{seed,date:new Date().toLocaleDateString("it-IT"),label:`Piano del ${new Date().toLocaleDateString("it-IT")}`},...history].slice(0,5);
    const resolvedOverrides = newOverrides || {};
    setSeed(newSeed); setPlan(np); setHistory(nh); setSelDay(0); setRegenNeeded(false); setOverrides(resolvedOverrides);
    try {
      await window.storage.set(SK_SEED,String(newSeed));
      await window.storage.set(SK_HISTORY,JSON.stringify(nh));
      await window.storage.set(SK_OVERRIDES,JSON.stringify(resolvedOverrides));
    } catch{}
    setSpinning(false);
  },[seed,history,excluded,ricetteUtente]);

  const regenerate = useCallback(async()=>{
    logSync("piano", "Piano rigenerato dall'utente", { ricetteUtente: ricetteUtente.length, esclusi: excluded.length });
    setSpinning(true); await new Promise(r=>setTimeout(r,500));
    const ns=Date.now(), np=generateWeekPlan(ns, excluded, undefined, ricetteUtente, ricetteEscluseIds);
    const nh=[{seed,date:new Date().toLocaleDateString("it-IT"),label:`Piano del ${new Date().toLocaleDateString("it-IT")}`},...history].slice(0,5);
    setSeed(ns); setPlan(np); setHistory(nh); setSelDay(0); setRegenNeeded(false); setOverrides({});
    try {
      await window.storage.set(SK_SEED,String(ns));
      await window.storage.set(SK_HISTORY,JSON.stringify(nh));
      await window.storage.set(SK_OVERRIDES,"{}");
    } catch{}
    setSpinning(false);
  },[seed,history,excluded,ricetteUtente]);

  const loadHistory = useCallback(async(oldSeed)=>{
    setSpinning(true); await new Promise(r=>setTimeout(r,300));
    setSeed(oldSeed); setPlan(generateWeekPlan(oldSeed, excluded, undefined, ricetteUtente, ricetteEscluseIds)); setSelDay(0); setShowHistory(false);
    setOverrides({});
    try {
      await window.storage.set(SK_SEED,String(oldSeed));
      await window.storage.set(SK_OVERRIDES,"{}");
    } catch{}
    setSpinning(false);
  },[excluded,ricetteUtente]);

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
    {key:"ricette",     label:"Ricette",     icon:"📖", desc:"Le tue ricette e quelle di famiglia"},
    {key:"opzioni",     label:"Opzioni",     icon:"⚙️", desc:"Notifiche e promemoria pasti"},
    {key:"test-sync",   label:"Test Sync",   icon:"🔬", desc:"Diagnostica sincronizzazione"},
    {key:"synclog",     label:"Log Sync",    icon:"📡", desc:"Registro sincronizzazione (copiabile)"},
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
    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#EFF3EC",fontSize:32}}>🥗</div>;
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#ECF1E2 0%,#E2EAD9 100%)",fontFamily:"'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif",paddingBottom:80}}>
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
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <div style={{width:34,height:34,borderRadius:10,background:"#0f1d15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
              <svg width="21" height="21" viewBox="0 0 21 21" style={{transform:"rotate(-90deg)",display:"block"}}><circle cx="10.5" cy="10.5" r="7.5" fill="none" stroke="#28412f" strokeWidth="3"/><circle cx="10.5" cy="10.5" r="7.5" fill="none" stroke="#C7F23E" strokeWidth="3" strokeLinecap="round" strokeDasharray="47.1" strokeDashoffset="13"/></svg>
              <div style={{position:"absolute",left:"50%",top:4,transform:"translateX(-50%)",width:3,height:3,borderRadius:"50%",background:"#C7F23E"}}/>
            </div>
            <div>
              <div style={{fontSize:19,fontWeight:800,color:"#F5F8F1",fontFamily:"'Outfit',sans-serif",lineHeight:1,letterSpacing:-0.6}}>f<span style={{color:"#C7F23E"}}>i</span>tsy</div>
              <div style={{fontSize:10.5,color:"#7FA890",fontWeight:600,marginTop:3}}>{personas.length} {personas.length===1?"persona":"persone"} · 7 giorni</div>
            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {regenNeeded&&<span style={{fontSize:11,color:"#fbbf24",fontWeight:800,background:"#78350f55",borderRadius:6,padding:"5px 7px"}}>⚠</span>}
            {history.length>0&&<button onClick={()=>setShowHistory(h=>!h)} title="Storico piani" style={{flexShrink:0,width:36,height:36,borderRadius:10,border:"none",background:showHistory?"#fff":"rgba(255,255,255,0.12)",color:showHistory?"#15251C":"#E7EDE2",fontWeight:700,fontSize:14,cursor:"pointer"}}>🕐</button>}
            <button onClick={regenerate} disabled={spinning} style={{display:"flex",alignItems:"center",gap:6,background:spinning?"#2F5547":"linear-gradient(135deg,#2F6B3A,#235029)",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontWeight:700,fontSize:12,cursor:spinning?"not-allowed":"pointer",boxShadow:spinning?"none":"0 6px 16px -4px #18A95599",transition:"all 0.2s"}}>
              <span style={{display:"inline-block",animation:spinning?"spin 0.7s linear infinite":"none",fontSize:13}}>🔄</span>
              {spinning?"...":"Nuovo piano"}
            </button>
          </div>
        </div>
        {page==="piano"&&!showHistory&&(
          <div style={{maxWidth:680,margin:"11px auto 0",display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
            {(()=>{
              const m = meseCorrente();
              const nomiMesi = ["","Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
              const stagEmoji = m>=3&&m<=5?"🌸":m>=6&&m<=8?"☀️":m>=9&&m<=11?"🍂":"❄️";
              return (<span style={{fontSize:10,background:"rgba(255,255,255,0.12)",borderRadius:6,padding:"4px 9px",color:"#E7EDE2",fontWeight:600}}>{stagEmoji} {nomiMesi[m]} · stagionale</span>);
            })()}
            {personas.map(p=>{
              const t=calcTargetAdattivo(p, misureApp[p.id]);
              return (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:"#ffffff12",borderRadius:7,padding:"4px 10px",border:`1px solid ${p.color}50`}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:p.color}}/>
                  <span style={{color:"#E7EDE2",fontSize:11}}>{p.nome}</span>
                  <span style={{color:p.color,fontSize:11,fontFamily:"monospace",fontWeight:700}}>{t.kcal}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{maxWidth:680,margin:"0 auto",padding:"18px 16px 0"}}>
       <ErrorBoundary onReset={()=>{ setShowHistory(false); setPage("oggi"); }}>
       <div key={showHistory?"history":page} style={{animation:"pageIn 0.22s ease-out"}}>
        {/* STORICO */}
        {showHistory&&(
          <div>
            <div style={{fontWeight:800,fontSize:14,color:"#15251C",marginBottom:12}}>🕐 Piani precedenti</div>
            {history.map((h,i)=>(
              <div key={i} onClick={()=>loadHistory(h.seed)} style={{background:"#fff",borderRadius:10,border:"1.5px solid #E7EDE2",padding:"12px 16px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div><div style={{fontWeight:700,fontSize:13,color:"#15251C"}}>{h.label}</div><div style={{fontSize:10,color:"#9DB1A2",fontFamily:"monospace"}}>seed: {h.seed}</div></div>
                <span style={{fontSize:12,color:"#2F6B3A",fontWeight:700}}>Ricarica →</span>
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
            readOnly={readOnlyPersona}
            onGoPiano={()=>{ setSelDay(todayDayIndex()); setPage("piano"); }}
            onGoMisure={()=>setPage("misure")}
          />
        )}
        {!showHistory&&page==="piano"&&(
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
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {DAYS.map((d,i)=>{
                const seld = selDay===i;
                const dn = (()=>{ try { return new Date(dateKeyForDayIdx(i)).getDate(); } catch { return i+1; } })();
                return (
                <button key={d} onClick={()=>setSelDay(i)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"9px 0",borderRadius:14,border:seld?"none":"1.5px solid #E7EDE2",background:seld?persona.color:"#fff",cursor:"pointer",transition:"all 0.2s",boxShadow:seld?`0 8px 16px -6px ${persona.color}88`:"none"}}>
                  <span style={{fontSize:9.5,fontWeight:700,color:seld?"#ffffffcc":"#9DB1A2",textTransform:"uppercase"}}>{d.slice(0,3)}</span>
                  <span style={{fontSize:16,fontWeight:800,color:seld?"#fff":"#4A6152",fontFamily:"'Outfit',sans-serif"}}>{dn}</span>
                </button>
              );})}
            </div>
            <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"7px 11px",marginBottom:12,fontSize:11,color:"#92400e"}}>
              💡 Tocca ogni pasto per le porzioni · <strong>Nuovo piano</strong> per variare
            </div>
            {spinning ? <div style={{textAlign:"center",padding:"40px 0",color:"#6E8576"}}>🔄 Generando...</div> : (
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
                            readOnly={readOnlyPersona}
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
                              };
                              navigaA("ricette");
                            }}
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
                <div style={{marginTop:14,background:"#fff",borderRadius:12,border:"1.5px solid #E7EDE2",padding:"12px 16px"}}>
                  {personaTarget && <>
                  {/* Intestazione con badge confidenza */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#6E8576",letterSpacing:1,textTransform:"uppercase"}}>
                      Target — {emojiBySesso(persona)} {persona.nome}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
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
                </div>
                <div style={{marginTop:14,fontSize:10,color:"#9DB1A2",textAlign:"center",lineHeight:1.8}}>
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
        {!showHistory&&page==="ricette"&&<RicettePage cloudStatus={cloudStatus} onRicetteChange={handleRicetteChange}/>}
        {!showHistory&&page==="test-sync"&&<SyncTestPage/>}
        {!showHistory&&page==="synclog"&&<SyncLogPage cloudStatus={cloudStatus}/>}
        {!showHistory&&page==="opzioni"&&<OpzioniPage notifSettings={notifSettings} onNotifChange={handleNotifChange} plan={plan} personas={personas} myPersonaId={myPersonaId} currentSeed={seed} overrides={overrides} onApplySeed={handleApplySeed}/>}
        {!showHistory&&page==="misure"&&<MisurePage personas={personas} myPersonaId={myPersonaId} onMisureChange={handleMisureChange} mealsLog={mealsLog} inFamily={cloudStatus.inFamily} myUid={myUid}/>}
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
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:"#fff",borderTop:"1px solid #E7EDE2",display:"flex",alignItems:"stretch",boxShadow:"0 -4px 20px #0000001a",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
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
                navigaA(tab.key); setShowHistory(false); setMenuOpen(false);
              }}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 2px 8px",border:"none",background:"transparent",color:active?"#2F6B3A":"#9DB1A2",cursor:"pointer",position:"relative",transition:"color 0.15s",gap:3,minWidth:0}}>
              {active && <div style={{position:"absolute",top:0,left:"30%",right:"30%",height:2,background:"#2F6B3A",borderRadius:"0 0 3px 3px"}}/>}
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
            <div style={{width:40,height:4,background:"#C2D0C6",borderRadius:2,margin:"10px auto 8px"}}/>
            <div style={{padding:"4px 20px 16px",fontSize:11,fontWeight:700,color:"#9DB1A2",letterSpacing:1,textTransform:"uppercase"}}>Menu</div>
            <div style={{display:"flex",flexDirection:"column"}}>
              {SUBMENU.map(item=>{
                const isActive = page===item.key && !showHistory;
                const itemBadge = item.key==="ingredienti" && excluded.length>0 ? excluded.length : 0;
                return (
                  <button key={item.key}
                    onClick={()=>{ navigaA(item.key); setShowHistory(false); setMenuOpen(false); }}
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


