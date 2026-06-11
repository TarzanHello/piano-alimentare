// ── Migrazione ID legacy ────────────────────────────────────────────
// Il database unificato a 713 voci usa gli ID CRA-NUT (db_*). I dati
// salvati prima dell'unificazione (esclusioni, override del piano,
// log pasti, ricette custom) possono contenere i vecchi ID curati
// (ing_*). Questa mappa li traduce al caricamento. Le 27 voci di
// integrazione (assenti dal CRA-NUT) mantengono il loro ID ing_* e
// NON compaiono qui.
export const LEGACY_ING_MAP = {
  "ing_aglio": "db_aglio",
  "ing_agnello": "db_agnello_muscolo",
  "ing_albicocche": "db_albicocche",
  "ing_alici": "db_acciuga_o_alice_fresca",
  "ing_ananas": "db_ananas",
  "ing_anatra": "db_anatra_domestica",
  "ing_anguria": "db_cocomero_anguria",
  "ing_arancia": "db_arance",
  "ing_asparagi": "db_asparagi_di_campo_crudi",
  "ing_avena": "db_fiocchi_d_avena",
  "ing_baccala": "db_merluzzo_o_nasello_baccala_ammollato",
  "ing_banana": "db_banane",
  "ing_barbabietole": "db_barbabietole_rosse_crude",
  "ing_basilico": "db_basilico",
  "ing_broccoli": "db_broccolo_a_testa_crudo",
  "ing_burrata": "db_fior_di_latte",
  "ing_burro": "db_burro",
  "ing_cacao": "db_cacao_amaro_in_polvere",
  "ing_calamari": "db_calamaro_fresco",
  "ing_carciofi": "db_carciofi_crudi",
  "ing_carote": "db_carote_crude",
  "ing_castagne": "db_castagne",
  "ing_cavolfiore": "db_cavolfiore_crudo",
  "ing_cavolo": "db_cavolo_cappuccio_verde_crudo",
  "ing_ceci": "db_ceci_in_scatola_scolati",
  "ing_cetrioli": "db_cetrioli",
  "ing_ciliegie": "db_ciliege",
  "ing_cipolla": "db_cipolle_crude",
  "ing_concentrato": "db_pomodori_conserva",
  "ing_evo": "db_olio_di_oliva_extra_vergine",
  "ing_fagioli": "db_fagioli_cannellini_in_scatola_scolati",
  "ing_fagiolini": "db_fagiolini_freschi_crudi",
  "ing_farina": "db_farina_di_frumento_integrale",
  "ing_farina_00": "db_farina_di_frumento_tipo_00",
  "ing_farro": "db_farro",
  "ing_feta": "db_feta",
  "ing_finocchio": "db_finocchi_crudi",
  "ing_fiocchi_latte": "db_fiocchi_di_formaggio_magro",
  "ing_fragole": "db_fragole",
  "ing_funghi": "db_funghi_coltivati_prataioli_crudi",
  "ing_gamberi": "db_gamberi_freschi",
  "ing_germogli": "db_germogli_di_soia",
  "ing_grano_sarac": "db_grano_saraceno",
  "ing_insalata": "db_lattuga",
  "ing_kiwi": "db_kiwi",
  "ing_latte": "db_latte_di_vacca_pastorizzato_parzialmente_screm",
  "ing_lattuga": "db_lattuga",
  "ing_lenticchie": "db_lenticchie_in_scatola_scolate",
  "ing_lievito": "db_lievito_di_birra_compresso",
  "ing_limone": "db_limoni",
  "ing_maiale": "db_maiale_leggero_lombo",
  "ing_mais": "db_mais_dolce_in_scatola_sgocciolato",
  "ing_mandarino": "db_mandarini",
  "ing_mandorle": "db_mandorle_dolci_secche",
  "ing_mango": "db_mango",
  "ing_manzo": "db_bovino_adulto_spalla_muscolo_girello_fesone",
  "ing_manzo_tagliata": "db_bovino_adulto_filetto",
  "ing_mascarpone": "db_mascarpone",
  "ing_mela": "db_mele_fresche_senza_buccia",
  "ing_melanzane": "db_melanzane_crude",
  "ing_melograno": "db_melagrane",
  "ing_melone": "db_melone_d_estate",
  "ing_merluzzo": "db_merluzzo_o_nasello_crudo",
  "ing_miele": "db_miele",
  "ing_mirtilli": "db_mirtilli",
  "ing_mozzarella": "db_mozzarella_di_vacca",
  "ing_nocciole": "db_nocciole_secche",
  "ing_noci": "db_noci_secche",
  "ing_olio_semi": "db_olii_vegetali_oliva_soia_mais",
  "ing_olive": "db_olive_nere",
  "ing_ombrina": "db_dentice_fresco",
  "ing_orata": "db_orata_fresca_filetti",
  "ing_orzo": "db_orzo_perlato",
  "ing_pane": "db_pane_di_tipo_integrale",
  "ing_panko": "db_pangrattato",
  "ing_panna": "db_panna_o_crema_di_latte",
  "ing_parmigiano": "db_parmigiano",
  "ing_passata": "db_pomodori_passata",
  "ing_pasta_fresca": "db_pasta_all_uovo_secca_cruda",
  "ing_patate": "db_patate_crude",
  "ing_pecorino": "db_pecorino",
  "ing_peperoncino": "db_peperoncini_piccanti",
  "ing_peperone": "db_peperoni_crudi",
  "ing_pera": "db_pere_fresche_senza_buccia",
  "ing_pesche": "db_pesche_senza_buccia",
  "ing_philadelphia": "db_formaggio_cremoso_spalmabile",
  "ing_pinoli": "db_pinoli",
  "ing_piselli": "db_piselli_surgelati",
  "ing_pistacchi": "db_pistacchi",
  "ing_pollo": "db_pollo_petto_crudo",
  "ing_polpo": "db_polpo",
  "ing_pomodori": "db_pomodori_maturi",
  "ing_porri": "db_porri_crudi",
  "ing_prezzemolo": "db_prezzemolo",
  "ing_prosciutto": "db_prosciutto_crudo_di_parma_dop",
  "ing_radicchio": "db_radicchio_rosso",
  "ing_ricotta": "db_ricotta_di_vacca",
  "ing_riso": "db_riso_integrale_crudo",
  "ing_rosmarino": "db_rosmarino",
  "ing_salmone": "db_salmone_fresco",
  "ing_salmone_aff": "db_salmone_affumicato",
  "ing_salsa_soia": "db_soia_salsa",
  "ing_salsiccia": "db_salsiccia_di_suino_fresca_cruda",
  "ing_sedano": "db_sedano_crudo",
  "ing_sgombro": "db_sgombro_o_maccarello_in_salamoia",
  "ing_spinaci": "db_spinaci_crudi",
  "ing_tacchino": "db_tacchino_fesa_cruda",
  "ing_tacchino_fettine": "db_tacchino_fesa_cruda",
  "ing_tonno": "db_tonno_in_salamoia_sgocciolato",
  "ing_tonno_olio": "db_tonno_sott_olio_sgocciolato",
  "ing_uova": "db_uova_di_gallina_intero",
  "ing_uva": "db_uva",
  "ing_yogurt": "db_yogurt_greco_da_latte_intero",
  "ing_zucca": "db_zucca_gialla",
  "ing_zucchine": "db_zucchine_crude",
};

export const migrateIngId = (id) => LEGACY_ING_MAP[id] || id;

// Lista di ID (es. esclusioni) → tradotta e deduplicata.
export function migrateIdList(list) {
  if (!Array.isArray(list)) return list;
  return [...new Set(list.map(migrateIngId))];
}

// Oggetto con chiavi-ingrediente (es. _ingredienti, quantita) → chiavi tradotte.
export function migrateIngKeys(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[migrateIngId(k)] = v;
  return out;
}

// Ricetta salvata (override o custom): traduce ingredients, _ingredienti e quantita.
export function migrateRecipe(r) {
  if (!r || typeof r !== "object") return r;
  const out = { ...r };
  if (Array.isArray(out.ingredients)) out.ingredients = migrateIdList(out.ingredients);
  if (out._ingredienti) out._ingredienti = migrateIngKeys(out._ingredienti);
  if (out.quantita)     out.quantita     = migrateIngKeys(out.quantita);
  return out;
}

// Mappa di override { "day-meal": ricetta } → ricette migrate.
export function migrateOverrides(ovr) {
  if (!ovr || typeof ovr !== "object") return ovr;
  return Object.fromEntries(Object.entries(ovr).map(([k, r]) => [k, migrateRecipe(r)]));
}

// Log pasti: le voci possono contenere _ingredienti con vecchi ID.
export function migrateMealsLog(log) {
  if (!log || typeof log !== "object") return log;
  const out = {};
  for (const [k, v] of Object.entries(log)) {
    out[k] = (v && v._ingredienti) ? { ...v, _ingredienti: migrateIngKeys(v._ingredienti) } : v;
  }
  return out;
}
