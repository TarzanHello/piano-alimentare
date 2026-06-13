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

const html0 = document.body.innerHTML;
ok('app monta (home Oggi)', /Buongiorno|Buon pomeriggio|Buonasera/.test(html0));

// naviga le pagine della bottom nav
for (const [txt, marker] of [['Piano','piano'],['Spesa','Per quali giorni'],['Misure','isur']]) {
  await clickByText(txt);
  const h = document.body.innerHTML;
  ok(`pagina ${txt} non crasha`, !h.includes('Qualcosa si è inceppato') && h.length > 500);
}
// menu → opzioni
await clickByText('Menu');
await new Promise(r=>setTimeout(r,200));
const wentOpz = await clickByText('Opzioni') || await clickByText('Promemoria') || await clickByText('Notifiche');
const hOpz = document.body.innerHTML;
ok('pagina Opzioni non crasha', !hOpz.includes('Qualcosa si è inceppato'));

console.error = origErr;
ok('nessun errore React durante la navigazione', reactErrors.length === 0);
if (reactErrors.length) reactErrors.slice(0,3).forEach(e=>console.log('   react-err:', e));

// report
let allPass = true;
for (const r of results) { console.log((r.pass?'✓':'✗')+' '+r.name); if(!r.pass) allPass=false; }
console.log(allPass ? '\nTEST 1: TUTTO OK' : '\nTEST 1: FALLITO');
process.exit(allPass ? 0 : 1);
