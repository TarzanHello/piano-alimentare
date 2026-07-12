# PATCH.md — Changelog cumulativo

## v9 — 11/07/2026 · Chiusura backlog
- **Override per-membro (fix isolamento)**: gli swap non sporcano più i piani degli altri membri. Container v2 `{condivisi, perPersona}` retrocompatibile col formato flat legacy; scrittura nel layer del membro (`myPersonaId`); Oggi/Piano per persona selezionata; spesa riscritta per-persona (`buildShoppingPerPersona`: ogni membro contribuisce col SUO piatto e col suo slot). Test 2i dedicato.
- **+30 ricette dietetiche** (196 totali) e **+10 ingredienti** (skyr, kefir, tempeh, chia, gallette, yogurt di soia, farina di ceci, cime di rapa, marmellata, orecchiette). Macro calcolate dai nutrienti; porzioni derivate dai nomi ingrediente → allineamento garantito.
- **Costituzione nel piano**: campo Polso nelle misure; `indiceGrant` spostata nel core; `calcPesoObiettivo` corregge il ramo Hamwi (±7,5%) e riporta la costituzione anche nel ramo LBM (senza correggerlo: misura la composizione reale).
- **Tool 💧 Fabbisogno idrico** (7° strumento nel flusso).
- **docs/sql/audit_rls.sql**: audit helper functions + policy + copertura `pesi_pezzo`, con hardening commentati. Da eseguire nel SQL Editor.
- **docs/gdpr/**: registro dei trattamenti (art. 30) e procedura data breach (artt. 33–34) — Fase 4.

## v8 — 11/07/2026 · Strumenti a flusso verticale
Tutti i tool aperti in un flusso scroll-down, chip-nav sticky con sezione attiva, bande d'accento per tool.

## v7 — 11/07/2026 · Tools completi + peso/pezzo nel form
Fabbisogno energetico (ospite, LARN/Mifflin spiegati), Costituzione (Grant), Analizzatore ricetta (con 🧪 salva come ingrediente). Campo peso/pezzo facoltativo nel form ingrediente custom con rimando alla taratura.

## v6 — 11/07/2026 · Calibri e tarature
`pesoPezzoRange` su 11 alimenti; `pesoPezzoInfo` (taratura famiglia > mediana DB > mediana range, flag `incerto`); niente decimali fasulli (range onesti); wizard taratura gamificato 🎯 con sync famiglia (`famiglia_dati:pesi_pezzo`); hub ripulito + Stagionalità.

## v5 — 11/07/2026 · Hub Strumenti
Pagina 🧰 con Equivalenze cibi e Misure casalinghe funzionanti.

## v4 — 11/07/2026 · Ricetta → ingrediente
`nutriPer100DaQuantita` nel core; bottone 🧪 sulle card ricetta (famiglia e catalogo); `AddIngredientModal` esportato con prefill; conteggio catalogo dinamico. Test 2h.

## v3 — 11/07/2026 · Allineamento ricette ↔ ingredienti
3 nuovi ingredienti (piadina/wrap, hummus, teriyaki); 13 ricette corrette con macro ricalcolate; campo `preparazione` per 9 ricette (porzioni solo-quantità); test 2g permanente (ID, porzioni, semantica).

## v2 — 10/07/2026 · Schede pasto + modifica ingredienti
Card pasto ridisegnate (nome a riga piena, barra ripartizione P/C/G, action bar etichettata); modifica ingredienti custom (modale add/edit, bottone ✏️).
