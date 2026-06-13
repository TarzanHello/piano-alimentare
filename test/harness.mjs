// Harness di test — finto Supabase condiviso tra più "device" + utilità
// per montare l'app in jsdom. NON è codice di produzione: vive solo qui.

import { JSDOM } from 'jsdom';

// ─── Finto database Supabase condiviso da tutti i device del test ───
// Replica il sottoinsieme di API usato da cloud.js / sync.js:
//   from(table).select().eq().not().order().maybeSingle()/limit()
//   from(table).insert().select().single()
//   from(table).upsert(rows,{onConflict})
//   from(table).update().eq()
//   from(table).delete().eq().in()
//   rpc(name, params)
//   channel(name).on(...).subscribe()  → notifica i listener su ogni cambio
//   auth.getSession / onAuthStateChange / signInWithOAuth / signOut
export function makeFakeCloud() {
  const tables = { profili: [], famiglie: [], misure: [], profilo_dati: [], famiglia_dati: [], famiglia_spesa: [] };
  const listeners = [];                 // { table, cb }
  let uid = 0;
  const genId = (p='id') => `${p}-${++uid}`;

  function notify(table) { listeners.filter(l => l.table === table).forEach(l => l.cb({})); }

  function applyFilters(rows, filters) {
    return rows.filter(r => filters.every(f => {
      if (f.op === 'eq') return String(r[f.col]) === String(f.val);
      if (f.op === 'not_null') return r[f.col] != null;
      if (f.op === 'in') return f.val.includes(r[f.col]);
      return true;
    }));
  }

  function makeQuery(table) {
    const filters = [];
    const q = {
      _rows: null,
      select() { return q; },
      eq(col, val) { filters.push({ op:'eq', col, val }); return q; },
      not(col, _is, _null) { filters.push({ op:'not_null', col }); return q; },
      in(col, val) { filters.push({ op:'in', col, val }); return q; },
      order() { return q; },
      limit() { const rows = applyFilters(tables[table], filters); return Promise.resolve({ data: rows, error: null }); },
      maybeSingle() { const rows = applyFilters(tables[table], filters); return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { const rows = applyFilters(tables[table], filters); return Promise.resolve({ data: rows[0] || null, error: rows[0]?null:{message:'no row'} }); },
      then(res) { const rows = applyFilters(tables[table], filters); return Promise.resolve({ data: rows, error: null }).then(res); },
    };
    return q;
  }

  const supabase = {
    from(table) {
      return {
        select() { return makeQuery(table); },
        insert(row) {
          const r = { ...row };
          for (const k of ['id']) if (!r[k] && table!=='famiglia_spesa' && table!=='famiglia_dati' && table!=='misure' && table!=='profilo_dati') r[k] = genId(table);
          tables[table].push(r);
          notify(table);
          const api = { select(){ return api; }, single(){ return Promise.resolve({ data:r, error:null }); }, then(res){ return Promise.resolve({data:r,error:null}).then(res); } };
          return api;
        },
        upsert(rows, opts) {
          const arr = Array.isArray(rows) ? rows : [rows];
          const keys = (opts?.onConflict || 'id').split(',');
          for (const row of arr) {
            const idx = tables[table].findIndex(x => keys.every(k => String(x[k]) === String(row[k])));
            if (idx >= 0) tables[table][idx] = { ...tables[table][idx], ...row };
            else { const r = { ...row }; if (!r.id && table==='profili') r.id = genId('profili'); tables[table].push(r); }
          }
          notify(table);
          const api = { select(){return api;}, single(){return Promise.resolve({data:arr[0],error:null});}, then(res){return Promise.resolve({data:arr,error:null}).then(res);} };
          return api;
        },
        update(patch) {
          const filters = [];
          const api = {
            eq(col,val){ filters.push({op:'eq',col,val}); return api; },
            then(res){ const rows=applyFilters(tables[table],filters); rows.forEach(r=>Object.assign(r,patch)); notify(table); return Promise.resolve({data:rows,error:null}).then(res); },
          };
          return api;
        },
        delete() {
          const filters = [];
          const api = {
            eq(col,val){ filters.push({op:'eq',col,val}); return api; },
            in(col,val){ filters.push({op:'in',col,val}); return api; },
            then(res){ const toDel=new Set(applyFilters(tables[table],filters)); tables[table]=tables[table].filter(r=>!toDel.has(r)); notify(table); return Promise.resolve({data:null,error:null}).then(res); },
          };
          return api;
        },
      };
    },
    rpc(name, params) {
      // simula create_family / join_family / leave_family
      const session = supabase.__session;
      if (!session) return Promise.resolve({ data:null, error:{message:'Non autenticato'} });
      const myProf = tables.profili.find(p => p.user_id === session.user.id);
      if (name === 'create_family') {
        if (!myProf) return Promise.resolve({data:null,error:{message:'Profilo mancante'}});
        if (myProf.famiglia_id) return Promise.resolve({data:null,error:{message:'Fai già parte di una famiglia'}});
        const fam = { id: genId('fam'), nome: params.p_nome, invite_code: 'CODE-'+(++uid), created_by: session.user.id };
        tables.famiglie.push(fam);
        myProf.famiglia_id = fam.id;
        notify('profili'); notify('famiglie');
        return Promise.resolve({ data: fam, error: null });
      }
      if (name === 'join_family') {
        if (!myProf) return Promise.resolve({data:null,error:{message:'Profilo mancante'}});
        if (myProf.famiglia_id) return Promise.resolve({data:null,error:{message:'Fai già parte di una famiglia'}});
        const fam = tables.famiglie.find(f => f.invite_code === String(params.p_code).toUpperCase().trim());
        if (!fam) return Promise.resolve({data:null,error:{message:'Codice non valido'}});
        myProf.famiglia_id = fam.id;
        tables.profili.filter(p=>p.gestito_da===session.user.id&&!p.famiglia_id).forEach(p=>p.famiglia_id=fam.id);
        notify('profili');
        return Promise.resolve({ data: fam, error: null });
      }
      if (name === 'leave_family') {
        tables.profili.filter(p => p.user_id===session.user.id || p.gestito_da===session.user.id).forEach(p => p.famiglia_id = null);
        notify('profili');
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data:null, error:{message:'rpc sconosciuta '+name} });
    },
    channel(name) {
      const subs = [];
      const ch = {
        on(_evt, cfg, cb) { subs.push({ table: cfg.table, cb }); return ch; },
        subscribe() { subs.forEach(s => listeners.push(s)); return ch; },
        _subs: subs,
      };
      ch.__unsub = () => { for (const s of subs) { const i = listeners.indexOf(s); if (i>=0) listeners.splice(i,1); } };
      return ch;
    },
    removeChannel(ch) { ch?.__unsub?.(); },
    auth: {
      getSession() { return Promise.resolve({ data: { session: supabase.__session } }); },
      onAuthStateChange() { return { data: { subscription: { unsubscribe(){} } } }; },
      signInWithOAuth() { return Promise.resolve({ error: null }); },
      signOut() { return Promise.resolve(); },
    },
    __session: null,
    __tables: tables,
  };
  return supabase;
}

// ─── Crea un "device": ambiente jsdom isolato con storage proprio ───
// ma che condivide il finto cloud (e quindi il Realtime) con gli altri.
export function makeDevice(fakeCloud, session) {
  const dom = new JSDOM('<!DOCTYPE html><div id=root></div>', { url:'https://localhost/', pretendToBeVisual:true });
  const mem = {};
  const storage = {
    get: async k => { if (mem[k]===undefined) throw new Error('nf'); return { value: mem[k] }; },
    set: async (k,v) => { mem[k]=v; },
    delete: async k => { delete mem[k]; },
    list: async () => ({ keys:Object.keys(mem) }),
  };
  return { dom, mem, storage, session };
}
