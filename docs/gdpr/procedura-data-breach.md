# Procedura di gestione data breach — Fitsy
*Artt. 33–34 GDPR · Titolare: Aureliano Procacci · Ultimo aggiornamento: 11/07/2026*

## 1. Rilevazione
Fonti possibili: notifica di Supabase (status/security advisory), anomalie nel SyncLog, segnalazione utente via email, alert RLS (query negate anomale nei log Supabase).
→ Annotare subito: data/ora rilevazione, fonte, descrizione.

## 2. Contenimento (entro poche ore)
1. Se credenziali/API compromesse: **ruotare le chiavi** dal dashboard Supabase (anon + service_role) e ripubblicare il frontend
2. Se vulnerabilità RLS: applicare policy restrittiva d'emergenza (`REVOKE`/policy deny) e `NOTIFY pgrst, 'reload schema'`
3. Se dispositivo del titolare compromesso: revoca sessioni da Supabase Auth → utenti disconnessi

## 3. Valutazione del rischio (entro 24h)
Compilare: dati coinvolti (⚠️ salute = art. 9 → rischio alto quasi sempre), n. interessati, minori coinvolti?, dati cifrati/pseudonimizzati?, probabilità di abuso.
Esito: **rischio nullo/basso** → solo registro interno · **rischio** → notifica Garante · **rischio elevato** → anche comunicazione agli interessati.

## 4. Notifica al Garante (entro 72h dalla scoperta — art. 33)
Portale: https://servizi.gpdp.it → "Notifica violazione". Contenuto minimo: natura della violazione, categorie e n. approssimativo di interessati e record, conseguenze probabili, misure adottate, contatto (aurelianoprocacci@gmail.com). Se oltre 72h: motivare il ritardo.

## 5. Comunicazione agli interessati (art. 34, se rischio elevato)
Email diretta agli account coinvolti, linguaggio semplice: cosa è successo, quali dati, cosa è stato fatto, cosa può fare l'utente (cambio password, revoca consenso, cancellazione). I dati salute coinvolti rendono la comunicazione quasi sempre dovuta.

## 6. Registro delle violazioni (sempre, anche senza notifica)
Tenere in `docs/gdpr/registro-violazioni.md` (creare al primo evento): data, descrizione, valutazione, decisione notifica sì/no e perché, misure correttive, lezioni apprese.

## 7. Post-mortem
Entro 2 settimane: causa radice, fix permanente (test in suite se applicabile), aggiornamento di questa procedura.

## Contatti rapidi
- Supabase support: dashboard → Support (piano in uso)
- Garante Privacy: protocollo@gpdp.it · +39 06 696771
