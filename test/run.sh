#!/usr/bin/env bash
# Suite di test completa. Uso: bash test/run.sh
# Richiede: node, esbuild (in node_modules). Esce con codice ≠0 se qualcosa fallisce.
set -e
cd "$(dirname "$0")/.."

ROOT="$(pwd)"
EB="$ROOT/node_modules/.bin/esbuild"
FAIL=0

echo "════════════════════════════════════════════"
echo " SUITE DI TEST — Piano Alimentare Familiare"
echo "════════════════════════════════════════════"

echo ""
echo "▸ TEST 1 — Montaggio pagine (no crash / no schermata bianca)"
"$EB" test/test_pages.mjs --bundle --format=esm --outfile=./.t1.mjs "--alias:@=$ROOT/src" --loader:.json=json --packages=external --log-level=error
node ./.t1.mjs || FAIL=1
rm -f ./.t1.mjs

echo ""
echo "▸ TEST 2 — Logica di sincronizzazione (race, anti-eco, merge)"
node test/test_sync_logic.mjs || FAIL=1

echo ""
echo "▸ TEST 2g — Allineamento ricette ↔ ingredienti (ID, porzioni, semantica)"
node test/test_allineamento.mjs || FAIL=1

echo ""
echo "▸ TEST 2h — Ricetta → ingrediente (nutriPer100DaQuantita)"
"$EB" test/test_ricetta_ingrediente.mjs --bundle --format=esm --outfile=./.tri.mjs "--alias:@=$ROOT/src" --loader:.json=json --packages=external --log-level=error
node ./.tri.mjs || FAIL=1
rm -f ./.tri.mjs

echo ""
echo "▸ TEST 2a — Scelta taglia base (raggiungibilità target)"
"$EB" test/test_taglia_base.mjs --bundle --format=esm --outfile=./.ttb.mjs "--alias:@=$ROOT/src" --loader:.json=json --packages=external --log-level=error
node ./.ttb.mjs || FAIL=1
rm -f ./.ttb.mjs

echo ""
echo "▸ TEST 2b — Spesa consumo-aware per persona"
"$EB" test/test_spesa_consumo.mjs --bundle --format=esm --outfile=./.tsp.mjs "--alias:@=$ROOT/src" --loader:.json=json --packages=external --log-level=error
node ./.tsp.mjs || FAIL=1
rm -f ./.tsp.mjs

echo ""
echo "▸ TEST 2c — Eco log pasti (race push/pull)"
node test/test_eco_log.mjs || FAIL=1

echo ""
echo "▸ TEST 2d — Resilienza ricette + canale realtime zombie"
"$EB" test/test_resilienza.mjs --bundle --format=esm --outfile=./.tr.mjs "--alias:@=$ROOT/src" --loader:.json=json --packages=external --log-level=error
node ./.tr.mjs || FAIL=1
rm -f ./.tr.mjs

echo ""
echo "▸ TEST 2e — Consenso privacy (versionamento e gate)"
"$EB" test/test_consenso.mjs --bundle --format=esm --outfile=./.tc.mjs "--alias:@=$ROOT/src" --loader:.jsx=jsx --loader:.json=json --packages=external --log-level=error
node ./.tc.mjs || FAIL=1
rm -f ./.tc.mjs

echo ""
echo "▸ TEST 2f — Pranzo e cena intercambiabili"
"$EB" test/test_pranzo_cena.mjs --bundle --format=esm --outfile=./.tpc.mjs "--alias:@=$ROOT/src" --loader:.json=json --packages=external --log-level=error
node ./.tpc.mjs || FAIL=1
rm -f ./.tpc.mjs

echo ""
echo "▸ TEST 3 — Due device + cloud (accoppiamento, propagazione, uscita)"
"$EB" test/test_two_devices.mjs --bundle --format=esm --outfile=./.t3.mjs "--alias:@=$ROOT/src" --loader:.json=json --packages=external --log-level=error
node ./.t3.mjs || FAIL=1
rm -f ./.t3.mjs

echo ""
echo "▸ BUILD — verifica che il progetto compili"
npm run build >/dev/null 2>&1 && echo "✓ build OK" || { echo "✗ build FALLITA"; FAIL=1; }

echo ""
echo "════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then echo " ✅ SUITE COMPLETA: TUTTO VERDE"; else echo " ❌ SUITE: CI SONO FALLIMENTI"; fi
echo "════════════════════════════════════════════"
exit $FAIL
