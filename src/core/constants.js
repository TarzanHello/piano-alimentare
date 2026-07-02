// ── Costanti dell'app ─────────────────────────────────────────────

export const LIMITI_SCALING = {
  // pasta e cereali (ID CRA-NUT post-unificazione; le voci ing_* sono integrazioni)
  ing_pasta:{min:35,max:180}, db_pasta_di_semola_cruda:{min:35,max:180},
  db_riso_integrale_crudo:{min:35,max:180}, db_riso_brillato_crudo:{min:35,max:180},
  ing_riso_venere:{min:35,max:180},
  db_farro:{min:35,max:170}, db_orzo_perlato:{min:35,max:170},
  ing_quinoa:{min:35,max:170}, ing_bulgur:{min:35,max:170},
  ing_couscous:{min:35,max:170}, db_fiocchi_d_avena:{min:20,max:150},
  db_pane_di_tipo_integrale:{min:20,max:160}, db_pane_di_segale:{min:20,max:160},
  db_farina_di_frumento_integrale:{min:20,max:150}, db_farina_di_frumento_tipo_0:{min:20,max:150},
  db_farina_di_mais:{min:30,max:150}, db_tortellini_freschi:{min:80,max:220},
  db_pasta_all_uovo_secca_cruda:{min:45,max:200},
  db_olio_di_oliva_extra_vergine:{min:4,max:30}, db_olii_vegetali_oliva_soia_mais:{min:4,max:30},
};

export const DAYS = ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];

export const MEAL_KEYS = ["colazione","spuntino_m","pranzo","spuntino_p","cena"];

export const PERSONAS_KEYS = ["uomo","donna","bimbo"];

export const COLORS = ["#2F6B3A","#db2777","#16a34a","#d97706","#7c3aed","#0891b2","#dc2626"];

export const STILI = [
  { key:"sedentario",   label:"Sedentario",     mult:1.2   },
  { key:"leggero",      label:"Lievemente att.", mult:1.375 },
  { key:"attivo",       label:"Attivo",          mult:1.55  },
  { key:"molto_attivo", label:"Molto attivo",    mult:1.725 },
  { key:"sportivo",     label:"Sportivo",        mult:1.9   },
];

export const OBIETTIVI = [
  { key:"perdita",      label:"Perdita di peso" },
  { key:"mantenimento", label:"Mantenimento"    },
  { key:"aumento",      label:"Aumento massa"   },
];

export const SESSI = [{ key:"M", label:"Maschio" },{ key:"F", label:"Femmina" }];

export const MEAL_META = {
  colazione:  { label:"☀️ Colazione",          isSnack:false },
  spuntino_m: { label:"🍎 Spuntino mattina",    isSnack:true  },
  pranzo:     { label:"🥗 Pranzo",              isSnack:false },
  spuntino_p: { label:"🫐 Spuntino pomeriggio", isSnack:true  },
  cena:       { label:"🍽️ Cena",               isSnack:false },
};

export const SK_SEED="pf-seed", SK_HISTORY="pf-history", SK_EXCL="pf-excluded", SK_PERSONAS="pf-personas", SK_MY_PERSONA="pf-my-persona", SK_MISURE="pf-misure", SK_OVERRIDES="pf-overrides", SK_WATER="pf-water", SK_PREFS="pf-prefs", SK_MEALS_LOG="pf-meals-log", SK_NOTIF="pf-notif", SK_SPESA="pf-spesa-checks", SK_TARGET_GIORNALIERO="pf-target-giornaliero", SK_FROZEN="pf-frozen-weeks";

// ═══════════════════════════════════════════════════════════════════
// SISTEMA PREFERENZE — accumulo segnali sui gusti
// ═══════════════════════════════════════════════════════════════════
// Uno swap NON è un segnale unico. Va distinto in due tipi:
//
//  • SWAP DI GUSTO   → fatto con anticipo (es. lunedì cambio il piatto
//                      di mercoledì). È un giudizio sulla ricetta.
//                      Penalizza/premia il punteggio gusti.
//  • SWAP DI CONTESTO→ fatto a ridosso del pasto (es. cambio la cena
//                      di stasera alle 19:30 perché è tardi). NON è un
//                      giudizio sul gusto: la ricetta resta amata.
//                      Si registra a parte come dato grezzo di fascia
//                      oraria, per analisi future.
//
// Il discriminante è quante ORE mancano dal momento dello swap al
// pasto bersaglio. Sotto la soglia = contesto, sopra = gusto.
//
// Struttura salvata in SK_PREFS:
// {
//   recipes: { "<id>": { score, liked, swapsOut, swapsIn, updated } },
//   contextSwaps: [ { ts, dayIdx, mealKey, hoursAhead,
//                      outId, outNome, outPrep, inId, inNome, inPrep } ]
// }

export const PREF_WEIGHTS = { like: 3, swapOut: -1, swapIn: 1, dislike: -4 };

// Soglia in ore: sotto questo valore lo swap è "di contesto".

export const SWAP_CONTEXT_HOURS = 18;

export const DEFAULT_NOTIF = {
  enabled: false,
  meals: {
    colazione:  { active: true,  hour: 7,  minute: 30 },
    spuntino_m: { active: false, hour: 10, minute: 30 },
    pranzo:     { active: true,  hour: 12, minute: 45 },
    spuntino_p: { active: false, hour: 16, minute: 30 },
    cena:       { active: true,  hour: 19, minute: 45 },
  }
};

// Orari convenzionali di consumo di ogni pasto (ora del giorno, 0-24).

export const MEAL_HOUR = {
  colazione: 8,
  spuntino_m: 10.5,
  pranzo: 13,
  spuntino_p: 16.5,
  cena: 20,
};

// Fasce orarie di ogni pasto (ore decimali, 0-24+).
//   inizio → da quando ha senso consumarlo (utile per modulare le push)
//   fine   → scadenza: oltre questa ora, se il pasto è ancora "in attesa"
//            OGGI, l'auto-flag lo marca come saltato (vedi autoFlagSaltati).
// Nota: la cena ha fine=26 (= 02:00 del giorno dopo) così non scade mai
// "intra-giornata"; di fatto resta in attesa fino a fine giornata, dove
// l'unica regola che può marcarla saltata è "pasto successivo consumato"
// (e dopo la cena non c'è nulla, quindi non si auto-salta mai da sola).
export const MEAL_FASCIA = {
  colazione:  { inizio: 5,    fine: 11 },
  spuntino_m: { inizio: 9.5,  fine: 13 },   // chiude all'ora di pranzo
  pranzo:     { inizio: 11.5, fine: 16 },
  spuntino_p: { inizio: 15,   fine: 19 },   // chiude all'ora di cena
  cena:       { inizio: 18.5, fine: 26 },
};

// ═══════════════════════════════════════════════════════════════════
// KILL-SWITCH RICALCOLI AUTOMATICI  (blocco temporaneo — 07/2026)
// ═══════════════════════════════════════════════════════════════════
// Interruttore unico per congelare OGNI ricalcolo automatico di piano,
// quantità e calorie. Con i flag a `false` l'app mostra e registra
// SEMPRE i valori PIANIFICATI/deterministici, senza adattamenti runtime.
// Le azioni MANUALI restano attive (✓ mangiato, ✗ saltato, campo grammi
// consumati, bottone "Genera piano"): il blocco riguarda solo l'automatismo.
//
//   • calorie : ridistribuzione delle calorie dei pasti saltati/consumati
//               sui pasti in attesa  →  ricalcolaMacroAdattati().
//               false ⇒ ogni pasto in attesa mostra il macro del piano;
//               segnare "mangiato" registra il macro del piano (non gonfiato).
//   • saltati : auto-marcatura "saltato" (regola A: pasto successivo
//               consumato · regola B: fascia oraria scaduta) → autoFlagSaltati().
//               false ⇒ un pasto diventa saltato SOLO col tap manuale ✗.
//   • piano   : riscalatura automatica delle porzioni per persona sul
//               fabbisogno LARN/TDEE  →  pianoPersonalizzato()/scalaPastiGiorno().
//               false ⇒ porzioni e macro = taglia fissa della ricetta
//               (uomo/donna/bimbo), deterministiche e verificabili a mano.
//
// Per riattivare: rimettere il singolo flag (o tutti) a `true`.
export const RICALCOLO_AUTO = {
  calorie: false,
  saltati: false,
  piano:   false,
};

// Quante ore mancano da "adesso" al pasto (dayIdx 0=Lun..6=Dom, mealKey).
// Usa todayDayIndex() per ancorare la settimana al giorno corrente.

export const TUTTI_FIELDS = [
  { key:"peso",     label:"Peso",         emoji:"⚖️",  color:"#15251C", unit:"kg" },
  { key:"collo",    label:"Collo",        emoji:"🔵",  color:"#0ea5e9", unit:"cm" },
  { key:"petto",    label:"Petto / Seno", emoji:"🫁",  color:"#db2777", unit:"cm" },
  { key:"vita",     label:"Vita",         emoji:"⌛",  color:"#d97706", unit:"cm" },
  { key:"fianchi",  label:"Fianchi",      emoji:"🍑",  color:"#7c3aed", unit:"cm" },
  { key:"coscia",   label:"Coscia",       emoji:"🦵",  color:"#0891b2", unit:"cm" },
  { key:"polpaccio",label:"Polpaccio",    emoji:"🦶",  color:"#16a34a", unit:"cm" },
];

export const DEFAULT_PERSONAS = [
  { id:"p1", nome:"Uomo",  sesso:"M", eta:38, peso:100, altezza:185, lavoro:"sedentario", allenamenti:3, obiettivo:"perdita",     color:"#2F6B3A" },
  { id:"p2", nome:"Donna", sesso:"F", eta:31, peso:65,  altezza:160, lavoro:"sedentario", allenamenti:3, obiettivo:"perdita",     color:"#db2777" },
  { id:"p3", nome:"Bimbo", sesso:"M", eta:2,  peso:13,  altezza:87,  lavoro:"sedentario", allenamenti:2, obiettivo:"mantenimento",color:"#16a34a" },
];

// ─── Utilities ───────────────────────────────────────────────────────

export const CONFIDENZA = {
  BASSA:  { key:"bassa",  label:"Formula base",    color:"#f59e0b", bg:"#fffbeb", border:"#fde68a", dot:"🟡" },
  MEDIA:  { key:"media",  label:"Composizione",    color:"#f97316", bg:"#fff7ed", border:"#fed7aa", dot:"🟠" },
  ALTA:   { key:"alta",   label:"TDEE adattivo",   color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", dot:"🟢" },
  OTTIMA: { key:"ottima", label:"Piena precisione", color:"#0891b2", bg:"#EEF7F0", border:"#A9DDB8", dot:"🔵" },
};

// Converte "gg/mm/aaaa" in Date

export const MB_COEFF_LARN = {
  F: [
    { maxEta: 29, c: 14.7, k: 496 },
    { maxEta: 59, c: 8.7,  k: 829 },
    { maxEta: 74, c: 9.2,  k: 688 },
    { maxEta: Infinity, c: 9.8, k: 624 },
  ],
  M: [
    { maxEta: 29, c: 15.3, k: 679 },
    { maxEta: 59, c: 11.6, k: 879 },
    { maxEta: 74, c: 11.9, k: 700 },
    { maxEta: Infinity, c: 8.4, k: 819 },
  ],
};

export const LAF_TAB_LARN = {
  F: {
    adulto: {
      leggero:  { si: 1.56, no: 1.42 },
      moderato: { si: 1.64, no: 1.56 },
      pesante:  { si: 1.82, no: 1.73 },
    },
    eta60_74: { si: 1.56, no: 1.44 },
    eta75:    { si: 1.56, no: 1.37 },
  },
  M: {
    adulto: {
      leggero:  { si: 1.55, no: 1.41 },
      moderato: { si: 1.78, no: 1.70 },
      pesante:  { si: 2.10, no: 2.01 },
    },
    eta60_74: { si: 1.51, no: 1.40 },
    eta75:    { si: 1.51, no: 1.33 },
  },
};

// Lo "stile" dell'app → (intensità lavoro, attività auspicabile).
// La tabella LARN richiede due dimensioni; l'app ha il solo `stile`,
// che esprime il livello di attività complessivo: lo scomponiamo.

export const STILE_TO_LARN = {
  sedentario:   { lavoro: "leggero",  auspicabile: false },
  leggero:      { lavoro: "leggero",  auspicabile: true  },
  attivo:       { lavoro: "moderato", auspicabile: true  },
  molto_attivo: { lavoro: "pesante",  auspicabile: false },
  sportivo:     { lavoro: "pesante",  auspicabile: true  },
};

// ── Doppia variabile attività: lavoro + giorni di allenamento ──────
// Il lavoro mappa sulle classi di intensità occupazionale LARN; i
// giorni di allenamento/settimana coprono la dimensione "attività
// fisica auspicabile" (0 gg = colonna "no", 4+ gg = colonna "sì",
// interpolazione lineare in mezzo, piccolo extra oltre i 4 giorni).

export const LAVORI = [
  { key:"sedentario", label:"Sedentario", larn:"leggero"  },
  { key:"attivo",     label:"Attivo",     larn:"moderato" },
  { key:"sportivo",   label:"Sportivo",   larn:"pesante"  },
];

// Migrazione del vecchio campo `stile` (adulti): coppie scelte per
// riprodurre ESATTAMENTE il LAF precedente, così i target non cambiano
// finché l'utente non tocca i nuovi controlli.
export const STILE_LEGACY_ADULTI = {
  sedentario:   { lavoro:"sedentario", allenamenti:0 }, // LAF M 1.41
  leggero:      { lavoro:"sedentario", allenamenti:4 }, // LAF M 1.55
  attivo:       { lavoro:"attivo",     allenamenti:4 }, // LAF M 1.78
  molto_attivo: { lavoro:"sportivo",   allenamenti:0 }, // LAF M 2.01
  sportivo:     { lavoro:"sportivo",   allenamenti:4 }, // LAF M 2.10
};

// Migrazione per i minori (il lavoro non si applica; il moltiplicatore
// Mifflin diventa 1.2 + 0.0875 × allenamenti, che riproduce i vecchi mult)
export const STILE_LEGACY_BAMBINI = {
  sedentario: 0, leggero: 2, attivo: 4, molto_attivo: 6, sportivo: 7,
};

export const UNIT_OPTIONS = ["g", "ml", "pz", "cucchiaio", "cucchiaino"];

export const WATER_ML   = 200;   // ml per bicchiere

export const WATER_GOAL = 2000;  // ml target giornaliero

export const WATER_MAX  = 14;    // bicchieri massimi visualizzati (2800ml)

// Fasce di tempo ESCLUSIVE: ogni ricetta appartiene a una sola fascia,
// così le alternative proposte non si ripetono tra un intervallo e l'altro.
export const PREP_SLOTS = [
  { label:"0–10'",  min:0,  max:10,       color:"#16a34a", bg:"#f0fdf4" },
  { label:"11–20'", min:11, max:20,       color:"#0891b2", bg:"#EEF7F0" },
  { label:"21–30'", min:21, max:30,       color:"#d97706", bg:"#fffbeb" },
  { label:"31'+",   min:31, max:Infinity, color:"#dc2626", bg:"#fef2f2" },
];

