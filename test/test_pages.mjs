// TEST 1 — Ogni pagina dell'app monta senza crashare.
// Intercetta i bug "schermata bianca" come quelli della pagina Opzioni.
import { JSDOM } from 'jsdom';

const results = [];
const ok = (name, cond) => { results.push({ name, pass: !!cond }); };

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><div id=root></div>', { url:'https://localhost/', pretendToBeVisual:true });
  global.window = dom.window; global.document = dom.window.document;
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
  window.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
  const mem = {
    'pf-personas': JSON.stringify([{ id:'p1', nome:'Test', sesso:'M', eta:40, peso:88, altezza:178, lavoro:'attivo', allenamenti:4, obiettivo:'perdita', color:'#2563eb' }]),
    'pf-my-persona': 'p1',
    'pf-seed': '123456',
  };
  window.storage = {
    get: async k => { if (mem[k]===undefined) throw new Error('nf'); return { value: mem[k] }; },
    set: async (k,v) => { mem[k]=v; }, delete: async k => { delete mem[k]; }, list: async () => ({ keys:Object.keys(mem) }),
  };
  return mem;
}

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');

// Monta l'App intera e naviga ogni voce di menu, raccogliendo errori React.
setupDom();
let reactErrors = [];
const origErr = console.error; console.error = (...a) => { const s=a.join(' '); if(/Error|undefined|not defined|Cannot read/.test(s)) reactErrors.push(s.slice(0,160)); };

const { App } = await import('@/App');
createRoot(document.getElementById('root')).render(React.createElement(App));
await new Promise(r => setTimeout(r, 800));

const clickByText = async (txt) => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(txt));
  if (b) { b.click(); await new Promise(r=>setTimeout(r,250)); }
  return !!b;
};

// NOTA: se il cloud è configurato (supabaseConfig.js presente) ma non c'è
// una sessione attiva — il caso normale in CI — l'app reindirizza al primo
// avvio sulla pagina "Utente" (è l'unico punto in cui un utente scollegato
// viene invitato ad accedere). Per verificare la home "Oggi" torniamo lì
// esplicitamente tramite la bottom nav: il test controlla che la home sia
// raggiungibile e si monti senza crash, non quale sia la pagina iniziale.
await clickByText('Oggi');

const html0 = document.body.innerHTML;
ok('app monta (home Oggi)', /Buongiorno|Buon pomeriggio|Buonasera/.test(html0));

// naviga le pagine della bottom nav
for (const [txt, marker] of [['Piano','piano'],['Spesa','Per quali giorni'],['Misure','isur']]) {
  await clickByText(txt);
  const h = document.body.innerHTML;
  ok(`pagina ${txt} non crasha`, !h.includes('Qualcosa si è inceppato') && h.length > 500);
}

// Piano: cliccare sul nome del piatto deve espandere la sezione "Porzione"
await clickByText('Piano');
await new Promise(r=>setTimeout(r,200));
const beforeClick = document.body.innerHTML;
const hadPorzioneBefore = /📏 Porzione/.test(beforeClick);
const nameDivs = [...document.querySelectorAll('div')].filter(d =>
  d.children.length === 0 && d.textContent.trim().length > 3 &&
  d.getAttribute('style') && d.getAttribute('style').includes('cursor: pointer') &&
  /font-weight: (600|700)/.test(d.getAttribute('style')) &&
  d.getAttribute('style').includes('line-height: 1.3')
);
if (nameDivs[0]) nameDivs[0].click();
await new Promise(r=>setTimeout(r,250));
const afterClick = document.body.innerHTML;
ok('click sul nome del piatto espande la porzione', !hadPorzioneBefore && /📏 Porzione/.test(afterClick) && nameDivs.length > 0);

// menu → opzioni
await clickByText('Menu');
await new Promise(r=>setTimeout(r,200));
const wentOpz = await clickByText('Opzioni') || await clickByText('Promemoria') || await clickByText('Notifiche');
const hOpz = document.body.innerHTML;
ok('pagina Opzioni non crasha', !hOpz.includes('Qualcosa si è inceppato'));

// menu → ricette → tab Catalogo → espandi una categoria
await clickByText('Menu');
await new Promise(r=>setTimeout(r,200));
const wentRicette = await clickByText('Ricette');
const hRicette = document.body.innerHTML;
ok('pagina Ricette non crasha', wentRicette && !hRicette.includes('Qualcosa si è inceppato'));

await clickByText('Catalogo');
await new Promise(r=>setTimeout(r,200));
const hCatalogo = document.body.innerHTML;
ok('tab Catalogo mostra le categorie', /Colazione|Pranzo|Cena|Spuntino/.test(hCatalogo) && !hCatalogo.includes('Qualcosa si è inceppato'));

await clickByText('Colazione');
await new Promise(r=>setTimeout(r,200));
const hCatExpanded = document.body.innerHTML;
ok('categoria Colazione del catalogo si espande con ricette', /kcal/.test(hCatExpanded) && !hCatExpanded.includes('Qualcosa si è inceppato'));

// menu → strumenti → tool equivalenze
await clickByText('Menu');
await new Promise(r=>setTimeout(r,200));
const wentStrumenti = await clickByText('Strumenti');
const hStrumenti = document.body.innerHTML;
ok('hub Strumenti si apre con le card', wentStrumenti && /Equivalenze cibi/.test(hStrumenti) && /Misure casalinghe/.test(hStrumenti) && /Stagionalità/.test(hStrumenti) && !hStrumenti.includes('Qualcosa si è inceppato'));
ok('hub Strumenti senza card-link duplicate', !/Editor ricette|Lista spesa smart|Tracker acqua|Peso forma &/.test(hStrumenti));
ok('tutti i 6 tool attivi (nessun IN ARRIVO)', !/IN ARRIVO/.test(hStrumenti) && /Fabbisogno energetico/.test(hStrumenti) && /Costituzione/.test(hStrumenti) && /Analizzatore ricetta/.test(hStrumenti));
await clickByText('Equivalenze cibi');
await new Promise(r=>setTimeout(r,200));
const hEquiv = document.body.innerHTML;
ok('tool Equivalenze si apre', /A parità di/.test(hEquiv) && !hEquiv.includes('Qualcosa si è inceppato'));
// torna all'hub e apri Fabbisogno
await clickByText('Strumenti');
await new Promise(r=>setTimeout(r,200));
await clickByText('Fabbisogno energetico');
await new Promise(r=>setTimeout(r,200));
const hFabb = document.body.innerHTML;
ok('tool Fabbisogno si apre', /Allenamenti a settimana/.test(hFabb) && !hFabb.includes('Qualcosa si è inceppato'));

console.error = origErr;
ok('nessun errore React durante la navigazione', reactErrors.length === 0);
if (reactErrors.length) reactErrors.slice(0,3).forEach(e=>console.log('   react-err:', e));

// report
let allPass = true;
for (const r of results) { console.log((r.pass?'✓':'✗')+' '+r.name); if(!r.pass) allPass=false; }
console.log(allPass ? '\nTEST 1: TUTTO OK' : '\nTEST 1: FALLITO');
process.exit(allPass ? 0 : 1);
