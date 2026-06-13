-- ============================================================
-- RESET PULITO DELLE FAMIGLIE  (eseguire DOPO aver guardato la
-- diagnosi). Azzera appartenenze e doppioni SENZA toccare le
-- misure dei profili registrati. Da lanciare a blocchi numerati.
-- ============================================================

-- ── BLOCCO A — elimina i profili a carico DUPLICATI ──────────
-- Per ogni utente tutore, tiene il profilo a carico più recente per
-- ciascun nome e cancella gli altri (con le loro misure: sono copie).
-- Se NON vuoi perdere misure su un profilo a carico, salta questo
-- blocco e gestisci i doppioni a mano.
with ranked as (
  select id,
         row_number() over (
           partition by gestito_da, lower(nome)
           order by created_at desc
         ) as rn
  from public.profili
  where user_id is null            -- solo profili a carico
)
delete from public.profili
where id in (select id from ranked where rn > 1);

-- ── BLOCCO B — sgancia TUTTI da qualsiasi famiglia ───────────
-- Riporta tutti i profili a "senza famiglia". Le misure restano.
update public.profili set famiglia_id = null;

-- ── BLOCCO C — elimina TUTTE le famiglie ─────────────────────
-- Tabelle dati famiglia svuotate (piano/gusti/spesa condivisi):
-- verranno riseminati dal primo che ricrea la famiglia.
delete from public.famiglia_spesa;
delete from public.famiglia_dati;
delete from public.famiglie;

-- ── BLOCCO D — verifica: nessuna famiglia, nessuno agganciato ─
select
  (select count(*) from public.famiglie)                                  as famiglie_rimaste,
  (select count(*) from public.profili where famiglia_id is not null)     as profili_in_famiglia,
  (select count(*) from public.profili where user_id is not null)         as profili_registrati,
  (select count(*) from public.profili where user_id is null)             as profili_a_carico;
