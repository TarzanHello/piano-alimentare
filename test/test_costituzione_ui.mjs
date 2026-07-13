// Verifica interattiva del tool Costituzione (segnalato rotto su device):
// digita altezza e polso come farebbe l'utente e controlla il risultato.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><div id=root></div>', { url:'https://localhost/', pretendToBeVisual:true });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
window.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
const mem = {
  'pf-personas': JSON.stringify([{ id:'p1', nome:'Test', sesso:'M', eta:40, peso:88, altezza:178, lavoro:'attivo', allenamenti:4, obiettivo:'perdita', color:'#2563eb' }]),
  'pf-my-persona': 'p1', 'pf-seed': '123456',
};
window.storage = {
  get: async k => { if (mem[k]===undefined) throw new Error('nf'); return { value: mem[k] }; },
  set: async (k,v) => { mem[k]=v; }, delete: async k => { delete mem[k]; }, list: async () => ({ keys:Object.keys(mem) }),
};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');

let reactErrors = [];
const origErr = console.error;
console.error = (...a) => { const s = a.join(' '); if (/Error|undefined|not defined|Cannot read/.test(s)) reactErrors.push(s.slice(0, 200)); };

const { App } = await import('@/App');
createRoot(document.getElementById('root')).render(React.createElement(App));
await new Promise(r => setTimeout(r, 800));

const clickByText = async (txt) => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(txt));
  if (b) { b.click(); await new Promise(r => setTimeout(r, 250)); }
  return !!b;
};

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) { fail++; } };

await clickByText('Menu');
await clickByText('Strumenti');
await new Promise(r => setTimeout(r, 300));

// individua gli input del tool Costituzione risalendo dalle label
const inputDaLabel = (label) => {
  const l = [...document.querySelectorAll('div')].find(d => d.textContent === label && d.children.length === 0);
  return l ? l.parentElement.querySelector('input') : null;
};
const inAltezza = inputDaLabel('Altezza (cm)');   // il PRIMO "Altezza (cm)" è del Fabbisogno…
// …quindi prendo quello adiacente a "Polso (cm)": stessa griglia
const inPolso = inputDaLabel('Polso (cm)');
const inAltezzaCost = inPolso ? inPolso.closest('div[style*="grid"]')?.querySelector('input') : null;
ok(!!inPolso && !!inAltezzaCost, `campi trovati (polso: ${!!inPolso}, altezza: ${!!inAltezzaCost})`);

// digitazione realistica su input controllati React
const digita = async (input, val) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, val);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 120));
};
if (inAltezzaCost && inPolso) {
  // valori ESATTI del bug report 13/07: polso con la virgola italiana
  await digita(inAltezzaCost, '185');
  await digita(inPolso, '19,7');
  const html = document.body.innerHTML;
  ok(/Indice di Grant/.test(html), 'il risultato appare anche con la VIRGOLA decimale (185 / 19,7)');
  ok(/Robusta/.test(html), `costituzione robusta per 185/19,7 — trovato: ${/Esile|Normale|Robusta/.exec(html)?.[0] || 'NIENTE'}`);
  ok(/Peso forma indicativo/.test(html), 'range peso forma mostrato');
  // cambio sesso: 178/19 resta robusta anche per F (soglia 9.9 > 9.37)
  const btnF = [...document.querySelectorAll('button')].filter(b => /^F$|Donna/.test(b.textContent.trim()));
  if (btnF.length) { btnF[btnF.length - 1].click(); await new Promise(r => setTimeout(r, 150)); }
  ok(!document.body.innerHTML.includes('Qualcosa si è inceppato'), 'nessun crash cambiando sesso');
}
ok(reactErrors.length === 0, `nessun errore React (${reactErrors[0] || 'ok'})`);

console.error = origErr;
console.log(fail === 0 ? 'COSTITUZIONE INTERATTIVO: TUTTO OK' : `COSTITUZIONE INTERATTIVO: ${fail} FALLIMENTI`);
process.exit(fail === 0 ? 0 : 1);
