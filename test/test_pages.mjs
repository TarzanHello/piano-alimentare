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
    'pf-personas': JSON.stringify([
      { id:'p1', nome:'Test', sesso:'M', eta:40, peso:88, altezza:178, lavoro:'attivo', allenamenti:4, obiettivo:'perdita', color:'#2563eb' },
      { id:'p2', nome:'Fede', sesso:'F', eta:38, peso:63, altezza:170, lavoro:'sedentario', allenamenti:2, obiettivo:'perdita', color:'#db2777' },
    ]),
    'pf-my-persona': 'p1',
    'pf-seed': '123456',
  };
  window.storage = {
    get: async k => { if (mem[k]===undefined) throw new Error('nf'); return { value: mem[k] }; },
    set: async (k,v) => { mem[k]=v; }, delete: async k => { delete mem[k]; }, list: async () => ({ keys:Object.keys(mem) }),
  };
  return mem;
}

const memGlobal = setupDom();

// Divergenza per il test adozione: Fede (p2) ha swappato il pranzo di oggi.
{
  const { weekIndexForDate, weekdayForDate } = await import('@/core');
  const wkT = weekIndexForDate(new Date()), wdT = weekdayForDate(new Date());
  const piattoFede = { id:'tst_adotta', nome:'Piatto di Fede (adozione)', ingredients:[], quantita:{},
    porzioni:{ uomo:'porzione test', donna:'porzione test', bimbo:'porzione test' },
    uomo:{kcal:500,p:30,c:50,g:15}, donna:{kcal:400,p:25,c:40,g:12}, bimbo:{kcal:250,p:15,c:25,g:8} };
  memGlobal['pf-overrides'] = JSON.stringify({ _v:2, condivisi:{}, perPersona:{ p2: { [`${wkT}:${wdT}-pranzo`]: piattoFede } } });
}

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');

// Monta l'App intera e naviga ogni voce di menu, raccogliendo errori React.
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

// menu → strumenti: flusso verticale, tutti i tool aperti senza click
await clickByText('Menu');
await new Promise(r=>setTimeout(r,200));
const wentStrumenti = await clickByText('Strumenti');
await new Promise(r=>setTimeout(r,200));
const hStrumenti = document.body.innerHTML;
ok('pagina Strumenti si apre', wentStrumenti && !hStrumenti.includes('Qualcosa si è inceppato'));
ok('tutti i 6 tool GIÀ aperti nel flusso (nessun click necessario)',
   /A parità di/.test(hStrumenti) &&                    // equivalenze
   /Cucchiaio ≈ 10g|equivalgono a circa|Alimento \(facoltativo/.test(hStrumenti) && // casalinghe
   /Gen<\/button>/.test(hStrumenti) &&                  // stagionalità (chip mesi)
   /Allenamenti a settimana/.test(hStrumenti) &&        // fabbisogno
   /Polso \(cm\)/.test(hStrumenti) &&                   // costituzione
   /Aggiungi ingrediente/.test(hStrumenti));            // analizzatore
ok('chip-nav presente', /Fabbisogno<\/button>|>Stagioni</.test(hStrumenti));
ok('nessuna card-link duplicata', !/Editor ricette|Lista spesa smart|Tracker acqua/.test(hStrumenti));

// piano del familiare → il pranzo divergente mostra Adotta, gli slot
// identici mostrano "Nel tuo piano"; il click scrive nel layer di chi guarda
await clickByText('Piano');
await new Promise(r=>setTimeout(r,300));
await clickByText('Fede');
await new Promise(r=>setTimeout(r,300));
const hFede = document.body.innerHTML;
ok('vista Fede: il suo swap è visibile', /Piatto di Fede/.test(hFede));
ok('slot divergente → Adotta; slot identici → Nel tuo piano', /Adotta/.test(hFede) && /Nel tuo piano/.test(hFede));
const btnAdotta = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Adotta'));
if (btnAdotta) {
  btnAdotta.click();
  await new Promise(r=>setTimeout(r,300));
  const ovr = JSON.parse(memGlobal['pf-overrides'] || '{}');
  const mieP1 = ovr.perPersona?.p1 || {};
  ok('adozione scrive nel layer di CHI GUARDA (p1) il piatto di Fede',
     Object.values(mieP1).some(m => m?.id === 'tst_adotta') && Object.keys(ovr.perPersona?.p2 || {}).length === 1);
  ok('dopo il click lo slot diventa Nel tuo piano', !/>Adotta</.test(document.body.innerHTML));
}

console.error = origErr;
ok('nessun errore React durante la navigazione', reactErrors.length === 0);
if (reactErrors.length) reactErrors.slice(0,3).forEach(e=>console.log('   react-err:', e));

// report
let allPass = true;
for (const r of results) { console.log((r.pass?'✓':'✗')+' '+r.name); if(!r.pass) allPass=false; }
console.log(allPass ? '\nTEST 1: TUTTO OK' : '\nTEST 1: FALLITO');
process.exit(allPass ? 0 : 1);
