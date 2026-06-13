// ── Motore di sincronizzazione (Fasi S2+S3+S4) ───────────────
// Strategia: il localStorage resta la cache (l'app parte sempre,
// anche offline); Supabase è la fonte di verità condivisa.
//
//   PUSH:  intercetta window.storage.set → debounce → upsert cloud
//   PULL:  Supabase Realtime → scrive nello storage locale →
//          dispatch evento 'pf-cloud-update' che l'App ascolta
//
// Conflitti: last-write-wins. Echo soppresso confrontando l'ultimo
// JSON applicato/pushato per chiave.

import { SK_EXCL, SK_MEALS_LOG, SK_MISURE, SK_MY_PERSONA, SK_OVERRIDES, SK_PERSONAS, SK_PREFS, SK_SEED, SK_SPESA } from '@/core/constants';
import { dataNascitaToEta, etaToDataNascita, getSession, supabase } from './cloud';

const SK_CLOUD_ME = "pf-cloud-me"; // { userId, profiloId, famigliaId }

let started = false;
let me = null;                 // { userId, profiloId, famigliaId }
let applying = new Set();      // chiavi in applicazione remota (no re-push)
let lastJson = {};             // ultimo valore noto per chiave (anti-echo)
let timers = {};
let channel = null;

const emit = (key, detail = {}) =>
  window.dispatchEvent(new CustomEvent("pf-cloud-update", { detail: { key, ...detail } }));
const emitStatus = (s) =>
  window.dispatchEvent(new CustomEvent("pf-cloud-status", { detail: s }));

const getLocal = async (k, fb) => {
  try { const r = await window.storage.get(k); return JSON.parse(r.value); } catch { return fb; }
};
const getLocalRaw = async (k, fb) => {
  try { const r = await window.storage.get(k); return r.value; } catch { return fb; }
};
// Scrive in locale SENZA innescare il push (marca la chiave come "remota")
const setLocalQuiet = async (k, value) => {
  applying.add(k); lastJson[k] = value;
  try { await window.storage.set(k, value); } finally { applying.delete(k); }
};

const dataIT2ISO = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || "").trim());
  return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : null;
};
const dataISO2IT = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export const getCloudMe = () => me;

// ─── Mapping profilo cloud → persona locale ──────────────────
function profiloToPersona(p) {
  return {
    id: p.id, nome: p.nome, sesso: p.sesso,
    eta: dataNascitaToEta(p.data_nascita) ?? 30,
    dataNascita: p.data_nascita || null,
    peso: p.peso != null ? +p.peso : 70,
    altezza: p.altezza != null ? +p.altezza : 170,
    lavoro: p.lavoro || "sedentario",
    allenamenti: p.allenamenti ?? 3,
    obiettivo: p.obiettivo || "mantenimento",
    color: p.color || "#2563eb",
    _uid: p.user_id || null,
    _gestito: !p.user_id,
  };
}
function personaToProfilo(p) {
  return {
    nome: p.nome, sesso: p.sesso === "F" ? "F" : "M",
    data_nascita: p.dataNascita || etaToDataNascita(p.eta),
    peso: p.peso ?? null, altezza: p.altezza ?? null,
    lavoro: p.lavoro || "sedentario", allenamenti: p.allenamenti ?? 3,
    obiettivo: p.obiettivo || "mantenimento", color: p.color || "#2563eb",
  };
}
const editable = (p) => !p._uid || p.id === me?.profiloId;

// ═══ PULL: cloud → locale ════════════════════════════════════

async function pullProfili() {
  const { data, error } = await supabase.from("profili").select("*")
    .eq("famiglia_id", me.famigliaId).order("created_at");
  if (error || !data) return;
  // me prima, poi gli altri utenti, poi i profili a carico
  data.sort((a, b) =>
    (a.user_id === me.userId ? 0 : a.user_id ? 1 : 2) -
    (b.user_id === me.userId ? 0 : b.user_id ? 1 : 2));
  const locali = await getLocal(SK_PERSONAS, []);
  const localiById = Object.fromEntries(locali.map(p => [p.id, p]));
  // merge: i campi solo-locali (es. dietaIntensita) sopravvivono al pull
  const personas = data.map(c => ({ ...(localiById[c.id] || {}), ...profiloToPersona(c) }));
  if (!personas.length) return;
  // le persone marcate "solo su questo dispositivo" dal wizard restano in coda
  const soloLocali = await getLocal("pf-local-only", []);
  for (const p of locali) {
    if (soloLocali.includes(p.id) && !personas.some(x => x.id === p.id)) personas.push(p);
  }
  await setLocalQuiet(SK_PERSONAS, JSON.stringify(personas));
  emit("personas");
}

async function pullMisure() {
  const { data, error } = await supabase.from("misure").select("*");
  if (error || !data) return;
  const misureApp = {};
  for (const r of data) {
    (misureApp[r.profilo_id] = misureApp[r.profilo_id] || [])
      .push({ ...r.valori, date: r.valori?.date || dataISO2IT(r.data) });
  }
  for (const pid of Object.keys(misureApp)) {
    misureApp[pid].sort((a, b) => (dataIT2ISO(a.date) || "").localeCompare(dataIT2ISO(b.date) || ""));
  }
  // conserva eventuali profili locali non sincronizzati
  const locale = await getLocal(SK_MISURE, {});
  for (const k of Object.keys(locale)) if (!misureApp[k]) misureApp[k] = locale[k];
  await setLocalQuiet(SK_MISURE, JSON.stringify(misureApp));
  emit("misure");
}

async function pullMealsLog() {
  const { data, error } = await supabase.from("profilo_dati").select("*").eq("chiave", "meals_log");
  if (error || !data) return;
  const log = await getLocal(SK_MEALS_LOG, {});
  for (const r of data) log[r.profilo_id] = r.valore || {};
  await setLocalQuiet(SK_MEALS_LOG, JSON.stringify(log));
  emit("mealsLog");
}

async function pullFamigliaDati(soloChiave) {
  let q = supabase.from("famiglia_dati").select("*").eq("famiglia_id", me.famigliaId);
  if (soloChiave) q = q.eq("chiave", soloChiave);
  const { data, error } = await q;
  if (error || !data) return;
  for (const r of data) {
    if (r.chiave === "piano") {
      const { seed, overrides } = r.valore || {};
      if (seed != null) {
        const curSeed = await getLocalRaw(SK_SEED, null);
        const curOvr  = await getLocalRaw(SK_OVERRIDES, "{}");
        const newOvr  = JSON.stringify(overrides || {});
        if (String(seed) !== curSeed || newOvr !== curOvr) {
          // il piano locale che viene sostituito non si perde: va nello Storico
          if (curSeed && String(seed) !== curSeed) {
            try {
              const hist = await getLocal("pf-history", []);
              if (!hist.some(h => String(h.seed) === curSeed)) {
                hist.unshift({ seed: curSeed, date: new Date().toLocaleDateString("it-IT"), label: "Piano prima della famiglia" });
                await setLocalQuiet("pf-history", JSON.stringify(hist.slice(0, 5)));
                emit("history");
              }
            } catch {}
          }
          await setLocalQuiet(SK_SEED, String(seed));
          await setLocalQuiet(SK_OVERRIDES, newOvr);
          emit("piano", { seed: String(seed), overrides: overrides || {} });
        }
      }
    } else if (r.chiave === "gusti") {
      await setLocalQuiet(SK_PREFS, JSON.stringify(r.valore || {}));
      emit("prefs");
    } else if (r.chiave === "esclusioni") {
      await setLocalQuiet(SK_EXCL, JSON.stringify(r.valore || []));
      emit("excluded");
    }
  }
}

async function pullSpesa() {
  const seed = await getLocalRaw(SK_SEED, null);
  if (!seed) return;
  const { data, error } = await supabase.from("famiglia_spesa").select("*")
    .eq("famiglia_id", me.famigliaId).eq("settimana", String(seed));
  if (error || !data) return;
  const all = await getLocal(SK_SPESA, {});
  const wk = {};
  for (const r of data) if (r.checked) wk[r.item_id] = true;
  all[String(seed)] = wk;
  await setLocalQuiet(SK_SPESA, JSON.stringify(all));
  emit("spesa");
}

async function fullPull() {
  await pullProfili();
  await pullMisure();
  await pullMealsLog();
  await pullFamigliaDati();
  await pullSpesa();
}

// ═══ PUSH: locale → cloud ════════════════════════════════════

async function pushPersonas() {
  const personas = await getLocal(SK_PERSONAS, []);
  const { data: cloud } = await supabase.from("profili").select("*").eq("famiglia_id", me.famigliaId);
  if (!cloud) return;
  const cloudById = Object.fromEntries(cloud.map(c => [c.id, c]));
  let remapped = false;

  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    const c = cloudById[p.id];
    if (c) {
      if (!editable(profiloToPersona(c))) continue; // profili altrui: sola lettura
      const upd = personaToProfilo(p);
      const cambia = Object.keys(upd).some(k => String(c[k] ?? "") !== String(upd[k] ?? ""));
      if (cambia) await supabase.from("profili").update(upd).eq("id", p.id);
    } else if (!p._uid) {
      const soloLocali = await getLocal("pf-local-only", []);
      if (soloLocali.includes(p.id)) continue; // scelta esplicita del wizard
      // persona nuova creata in locale → diventa profilo a carico cloud
      const { data: nuovo } = await supabase.from("profili").insert({
        user_id: null, gestito_da: me.userId, famiglia_id: me.famigliaId,
        ...personaToProfilo(p),
      }).select().single();
      if (nuovo) {
        await remapPersonaId(p.id, nuovo.id);
        personas[i] = { ...p, id: nuovo.id, _gestito: true };
        remapped = true;
      }
    }
  }
  // NOTA DI SICUREZZA: il push NON elimina mai profili dal cloud.
  // Una lista locale incompleta (dispositivo nuovo, errore di caricamento)
  // non deve poter cancellare un profilo a carico e il suo storico.
  // L'eliminazione esplicita avviene solo dall'app (pulsante 🗑).
  if (remapped) {
    await setLocalQuiet(SK_PERSONAS, JSON.stringify(personas));
    emit("personas");
  }
}

async function pushMisure() {
  const misureApp = await getLocal(SK_MISURE, {});
  const personas = await getLocal(SK_PERSONAS, []);
  for (const p of personas) {
    if (!editable(p)) continue;
    const recs = misureApp[p.id] || [];
    const rows = recs
      .map(r => ({ profilo_id: p.id, data: dataIT2ISO(r.date), valori: r }))
      .filter(r => r.data);
    if (rows.length) {
      await supabase.from("misure").upsert(rows, { onConflict: "profilo_id,data" });
    }
    // NOTA SICUREZZA: nessuna cancellazione automatica dal cloud.
    // Un dispositivo con meno dati (es. appena entrato in famiglia)
    // NON deve mai poter cancellare lo storico degli altri. La
    // rimozione di una singola misura avviene solo dall'app, in modo
    // esplicito, tramite deleteMisuraCloud.
  }
}

async function pushMealsLog() {
  const log = await getLocal(SK_MEALS_LOG, {});
  const personas = await getLocal(SK_PERSONAS, []);
  const rows = personas
    .filter(p => editable(p) && log[p.id])
    .map(p => ({ profilo_id: p.id, chiave: "meals_log", valore: log[p.id] }));
  if (rows.length) {
    await supabase.from("profilo_dati").upsert(rows, { onConflict: "profilo_id,chiave" });
  }
}

async function pushFamigliaDato(chiave, valore) {
  await supabase.from("famiglia_dati").upsert(
    { famiglia_id: me.famigliaId, chiave, valore },
    { onConflict: "famiglia_id,chiave" }
  );
}

async function pushPiano() {
  const seed = await getLocalRaw(SK_SEED, null);
  if (seed == null) return;
  const overrides = await getLocal(SK_OVERRIDES, {});
  await pushFamigliaDato("piano", { seed: String(seed), overrides });
}

async function pushSpesa() {
  const seed = await getLocalRaw(SK_SEED, null);
  if (!seed) return;
  const all = await getLocal(SK_SPESA, {});
  const wk = all[String(seed)] || {};
  const { data: cloud } = await supabase.from("famiglia_spesa").select("item_id,checked")
    .eq("famiglia_id", me.famigliaId).eq("settimana", String(seed));
  const cloudMap = Object.fromEntries((cloud || []).map(r => [r.item_id, r.checked]));
  const upserts = [], dels = [];
  for (const [id, v] of Object.entries(wk)) {
    if (v && !cloudMap[id]) upserts.push({ famiglia_id: me.famigliaId, settimana: String(seed), item_id: id, checked: true });
  }
  for (const id of Object.keys(cloudMap)) {
    if (cloudMap[id] && !wk[id]) dels.push(id);
  }
  if (upserts.length) await supabase.from("famiglia_spesa").upsert(upserts, { onConflict: "famiglia_id,settimana,item_id" });
  if (dels.length) await supabase.from("famiglia_spesa").delete()
    .eq("famiglia_id", me.famigliaId).eq("settimana", String(seed)).in("item_id", dels);
}

// ─── Router del push, con debounce per chiave ────────────────
const PUSHERS = {
  [SK_PERSONAS]:  pushPersonas,
  [SK_MISURE]:    pushMisure,
  [SK_MEALS_LOG]: pushMealsLog,
  [SK_SEED]:      async () => { await pushPiano(); await pushSpesa(); },
  [SK_OVERRIDES]: pushPiano,
  [SK_PREFS]:     async () => pushFamigliaDato("gusti", await getLocal(SK_PREFS, {})),
  [SK_EXCL]:      async () => pushFamigliaDato("esclusioni", await getLocal(SK_EXCL, [])),
  [SK_SPESA]:     pushSpesa,
};

function schedulePush(key) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(async () => {
    try { await PUSHERS[key]?.(); } catch (e) { console.warn("sync push", key, e?.message); }
  }, 900);
}

// ─── Intercettazione di window.storage.set ───────────────────
function hookStorage() {
  const orig = window.storage.set.bind(window.storage);
  window.storage.set = async (key, value) => {
    const r = await orig(key, value);
    if (me && PUSHERS[key] && !applying.has(key) && lastJson[key] !== value) {
      lastJson[key] = value;
      schedulePush(key);
    }
    return r;
  };
}

// ─── Realtime ────────────────────────────────────────────────
function subscribeRealtime() {
  if (channel) { try { supabase.removeChannel(channel); } catch {} }
  channel = supabase.channel("famiglia-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "profili" },        () => { pullProfili(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "misure" },         () => { pullMisure(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "profilo_dati" },   () => { pullMealsLog(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "famiglia_dati" },  (p) => { pullFamigliaDati(p?.new?.chiave || p?.old?.chiave); })
    .on("postgres_changes", { event: "*", schema: "public", table: "famiglia_spesa" }, () => { pullSpesa(); })
    .subscribe();
}

// ═══ Avvio ═══════════════════════════════════════════════════

export async function startSync() {
  if (started || !supabase) { if (!supabase) emitStatus({ loggedIn: false, inFamily: false }); return; }
  started = true;
  hookStorage();

  const boot = async () => {
    const session = await getSession();
    if (!session) { me = null; emitStatus({ loggedIn: false, inFamily: false }); return; }
    const { data: mio } = await supabase.from("profili").select("id,famiglia_id")
      .eq("user_id", session.user.id).maybeSingle();
    if (!mio?.famiglia_id) {
      me = null;
      emitStatus({ loggedIn: true, inFamily: false });
      return;
    }
    me = { userId: session.user.id, profiloId: mio.id, famigliaId: mio.famiglia_id };
    await setLocalQuiet(SK_CLOUD_ME, JSON.stringify(me));
    emitStatus({ loggedIn: true, inFamily: true, me });

    const migrated = (await getLocalRaw("pf-cloud-migrated", "0")) === "1";
    if (migrated) {
      await reconcile();
      subscribeRealtime();
    }
    // se non migrato, l'App mostra il wizard; al termine chiamerà finishMigration()
  };

  await boot();
  supabase.auth.onAuthStateChange(() => boot());
  // i telefoni sospendono i websocket: al ritorno in primo piano, riallinea
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && me) { fullPull(); subscribeRealtime(); }
  });
}

// Riallineamento iniziale: il cloud, se popolato, vince; ciò che il
// cloud non ha viene caricato dal locale (primo dispositivo = seme).
async function reconcile() {
  // dati condivisi: cloud presente → pull; assente → push del locale
  const { data: fd } = await supabase.from("famiglia_dati").select("chiave").eq("famiglia_id", me.famigliaId);
  const chiaviCloud = new Set((fd || []).map(r => r.chiave));
  if (chiaviCloud.size) await pullFamigliaDati();
  if (!chiaviCloud.has("piano"))      await pushPiano();
  if (!chiaviCloud.has("gusti"))      await pushFamigliaDato("gusti", await getLocal(SK_PREFS, {}));
  if (!chiaviCloud.has("esclusioni")) await pushFamigliaDato("esclusioni", await getLocal(SK_EXCL, []));

  // PRIMA si scarica (il pull fa l'unione col locale), POI si carica:
  // un dispositivo con meno dati non deve mai impoverire il cloud.
  await pullProfili();
  await pullMisure();
  await pullMealsLog();
  await pushMisure();    // unione: upsert per (profilo, data), nessun delete
  await pushMealsLog();
  await pullSpesa();
  await pushSpesa();
}

// ─── Migrazione one-time (chiamata dal wizard) ───────────────

async function remapPersonaId(vecchioId, nuovoId) {
  if (vecchioId === nuovoId) return;
  const misure = await getLocal(SK_MISURE, {});
  if (misure[vecchioId]) { misure[nuovoId] = misure[vecchioId]; delete misure[vecchioId];
    await setLocalQuiet(SK_MISURE, JSON.stringify(misure)); }
  const log = await getLocal(SK_MEALS_LOG, {});
  if (log[vecchioId]) { log[nuovoId] = log[vecchioId]; delete log[vecchioId];
    await setLocalQuiet(SK_MEALS_LOG, JSON.stringify(log)); }
  const myP = await getLocalRaw(SK_MY_PERSONA, null);
  if (myP === vecchioId) await setLocalQuiet(SK_MY_PERSONA, nuovoId);
}

export async function finishMigration(mapping) {
  // mapping: [{ localId, cloudId }]
  for (const m of mapping) await remapPersonaId(m.localId, m.cloudId);
  await setLocalQuiet(SK_MY_PERSONA, me.profiloId);
  await window.storage.set("pf-cloud-migrated", "1");
  await reconcile();
  subscribeRealtime();
  emit("misure"); emit("mealsLog");
}

// Cancellazione esplicita di UNA misura dal cloud (mai automatica)
export async function deleteMisuraCloud(profiloId, dataISO) {
  if (!supabase || !me) return;
  try { await supabase.from("misure").delete().eq("profilo_id", profiloId).eq("data", dataISO); } catch {}
}

// Associazione automatica quando sul dispositivo c'è una sola persona
export async function autoClaimSingle(persona) {
  if (!supabase || !me) throw new Error("cloud non pronto");
  await supabase.from("profili").update({
    nome: persona.nome, sesso: persona.sesso === "F" ? "F" : "M",
    data_nascita: persona.dataNascita || etaToDataNascita(persona.eta),
    peso: persona.peso ?? null, altezza: persona.altezza ?? null,
    lavoro: persona.lavoro || "sedentario", allenamenti: persona.allenamenti ?? 3,
    obiettivo: persona.obiettivo || "mantenimento", color: persona.color || "#2563eb",
  }).eq("id", me.profiloId);
  await finishMigration([{ localId: persona.id, cloudId: me.profiloId }]);
}

export { remapPersonaId };
