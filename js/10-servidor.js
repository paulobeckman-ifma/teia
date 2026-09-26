// ══════════════════ SERVIDOR (Supabase) ══════════════════
// Até a versão 2 o TeIA gravava em arquivos JSON no HostGator (api.php).
// Agora o banco é o Supabase. Para não mexer no resto do sistema, as funções
// phpGet/phpPost continuam existindo com os mesmos nomes e as mesmas
// respostas; por dentro, cada "action" antiga vira uma função (RPC) no banco.
//
//   action antiga            função no Supabase
//   status                   teia_status
//   login / logout           teia_login / teia_logout
//   get_core / save_core     teia_get_core / teia_save_core
//   list_user_patches        teia_list_user_patches
//   get_user_patch           teia_get_user_patch (em lote: teia_get_user_patches)
//   save_user_patch          teia_save_user_patch
//   get_log / save_log       teia_get_log / teia_save_log (+ teia_add_log)
//   get_ts                   teia_get_ts
//   change_password          teia_change_password
//
// A sessão deixou de ser cookie PHP: o login devolve um token que fica no
// navegador e vai junto em cada chamada.
function hashStr(s){let h=0;for(let i=0;i<s.length;i++){h=(Math.imul(31,h)+s.charCodeAt(i))|0;}return h.toString(36);}

const TEIA_CFG = window.TEIA_CONFIG || {};
const _TEIA_TOKEN_KEY = 'teia_sessao_token';
const teiaSessao = {
  get token(){ try{ return localStorage.getItem(_TEIA_TOKEN_KEY)||''; }catch(e){ return this._t||''; } },
  set token(v){ this._t=v||''; try{ if(v) localStorage.setItem(_TEIA_TOKEN_KEY,v); else localStorage.removeItem(_TEIA_TOKEN_KEY); }catch(e){} }
};

// Chamada crua a uma função do banco. Lança erro com .status e .codigo.
async function teiaRpc(fn, args, {timeout=45000, keepalive=false}={}){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), timeout);
  const headers = {'Content-Type':'application/json', apikey: TEIA_CFG.SUPABASE_KEY};
  if(/^eyJ/.test(TEIA_CFG.SUPABASE_KEY||'')) headers.Authorization = 'Bearer '+TEIA_CFG.SUPABASE_KEY;
  let r;
  try{
    r = await fetch(`${TEIA_CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method:'POST', headers, body: JSON.stringify(args||{}), signal: ctrl.signal, cache:'no-store', keepalive
    });
  }catch(e){ const er=new Error('REDE'); er.status=0; throw er; }
  finally{ clearTimeout(t); }
  const txt = await r.text();
  let corpo=null; try{ corpo = txt ? JSON.parse(txt) : null; }catch(e){ corpo = txt; }
  if(!r.ok){
    const cod = (corpo && corpo.message) || ('HTTP_'+r.status);
    const er = new Error(cod); er.status = r.status; er.codigo = cod; throw er;
  }
  return corpo;
}
const teiaApi = (fn, args={}, op) => teiaRpc(fn, {p_token: teiaSessao.token, ...args}, op);

// ── Cache local do núcleo e dos patches ──────────────────────────────────
// O núcleo tem alguns MB. Em vez de baixar tudo a cada sincronização, o
// cliente guarda a última versão e só baixa de novo o que mudou (compara o
// carimbo de hora de cada parte). Isso reduz muito o tráfego no Supabase.
const _teiaCache = { core:null, coreTs:null, patches:{}, lastTs:null, lastTsAt:0 };
const _clone = (o) => (typeof structuredClone==='function') ? structuredClone(o) : JSON.parse(JSON.stringify(o));

async function _teiaTs(maxIdadeMs=0){
  if(maxIdadeMs && _teiaCache.lastTs && Date.now()-_teiaCache.lastTsAt < maxIdadeMs) return _teiaCache.lastTs;
  const ts = await teiaApi('teia_get_ts');
  _teiaCache.lastTs = ts; _teiaCache.lastTsAt = Date.now();
  return ts;
}

// Traduz uma "action" antiga (GET) para o Supabase. Mantém o formato de resposta.
async function _teiaGet(action){
  const [nome, qs] = String(action).split('&');
  const params = new URLSearchParams(qs||'');
  switch(nome){
    case 'status': return await teiaRpc('teia_status', {});
    case 'get_ts': return await _teiaTs();
    case 'get_core': {
      const ts = await _teiaTs(5000);
      if(!_teiaCache.core || _teiaCache.coreTs !== ts.banco_ts){
        _teiaCache.core = await teiaApi('teia_get_core', {}, {timeout:90000});
        _teiaCache.coreTs = ts.banco_ts;
      }
      return _clone(_teiaCache.core);
    }
    case 'list_user_patches': {
      const lista = await teiaApi('teia_list_user_patches');
      _teiaCache.patchList = lista;
      return lista;
    }
    case 'get_user_patch': {
      const u = (params.get('user')||'').toLowerCase();
      const it = (_teiaCache.patchList||[]).find(x=>x.user===u);
      const c = _teiaCache.patches[u];
      if(c && it && c.ts===it.ts) return _clone(c.dados);
      const d = await teiaApi('teia_get_user_patch', {p_user:u});
      if(it) _teiaCache.patches[u] = {ts:it.ts, dados:d};
      return _clone(d);
    }
    case 'get_log': return await teiaApi('teia_get_log');
    default: throw new Error('Ação desconhecida: '+nome);
  }
}

// Baixa de uma vez só os patches que mudaram desde a última sincronização.
async function _teiaPrefetchPatches(lista){
  const falta = (lista||[]).filter(it=>{ const c=_teiaCache.patches[it.user]; return !c || c.ts!==it.ts; }).map(it=>it.user);
  if(!falta.length) return;
  const r = await teiaApi('teia_get_user_patches', {p_users: falta}, {timeout:90000});
  for(const [u,v] of Object.entries(r||{})) _teiaCache.patches[u] = {ts:v.ts, dados:v.dados};
}

async function _teiaPost(action, data){
  switch(action){
    case 'login': {
      const r = await teiaRpc('teia_login', {p_user:data.user, p_pass:data.pass});
      if(r && r.ok && r.token) teiaSessao.token = r.token;
      return r;
    }
    case 'logout': {
      const tk = teiaSessao.token; teiaSessao.token = '';
      _teiaCache.core=null; _teiaCache.coreTs=null; _teiaCache.patches={}; _teiaCache.lastTs=null;
      if(tk) await teiaRpc('teia_logout', {p_token:tk}).catch(()=>{});
      return {ok:true};
    }
    case 'save_core': {
      const r = await teiaApi('teia_save_core', {p_core:data}, {timeout:90000});
      if(r && r.ok){ _teiaCache.core=null; _teiaCache.coreTs=null; }
      return r;
    }
    case 'save_user_patch':
      return await teiaApi('teia_save_user_patch', {p_user:data.user, p_patch:data.patch});
    case 'save_log':
      return await teiaApi('teia_save_log', {p_log:data});
    case 'change_password':
      return await teiaApi('teia_change_password', {p_current:data.currentPassword, p_new:data.newPassword});
    default: throw new Error('Ação desconhecida: '+action);
  }
}

// Mesma assinatura da versão PHP: devolve null em falha de rede/servidor.
async function phpGet(action){
  try{
    const r = await _teiaGet(action);
    _serverOk = true;
    return r;
  }catch(e){
    if(e && e.codigo==='SESSAO_INVALIDA'){ handleAuthFailure(); return null; }
    _serverOk = false;
    console.warn('[TeIA] leitura falhou:', action, e && e.message);
    return null;
  }
}
// phpPost com RETRY exponencial (falhas de rede e 5xx); erros lógicos voltam como {erro}.
async function phpPost(action,data){
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const delays = [0, 600, 1500, 3000];
  let lastErr = null;
  for(let attempt=0; attempt<delays.length; attempt++){
    if(delays[attempt]>0) await sleep(delays[attempt]);
    try{
      const r = await _teiaPost(action, data);
      _serverOk = true;
      return r;
    }catch(e){
      if(e && e.codigo==='SESSAO_INVALIDA'){ handleAuthFailure(); return null; }
      if(e && e.status>=400 && e.status<500){ _serverOk = true; return {erro: e.message}; }
      lastErr = e;
    }
  }
  _serverOk=false;
  console.warn('[TeIA] envio falhou após novas tentativas:', action, lastErr?.message);
  return null;
}
// Envio garantido ao fechar a aba (substitui o sendBeacon do PHP).
function teiaEnvioFinal(action, data){
  if(action!=='save_user_patch' || !teiaSessao.token) return;
  const p = data && data.patch || {};
  if(!Object.keys(p.studentAvaliacoes||{}).length && !Object.keys(p.classBimestres||{}).length) return;
  teiaRpc('teia_save_user_patch', {p_token:teiaSessao.token, p_user:data.user, p_patch:data.patch}, {keepalive:true}).catch(()=>{});
}

// Chamado quando a sessão expira ou o cliente nunca fez login válido.
// Não recarrega a página para preservar dados não-salvos no localStorage,
// mas mostra a tela de login novamente.
let _authFailureShown = false;
function handleAuthFailure(){
  if(_authFailureShown) return; // evita avalanche de avisos
  _authFailureShown = true;
  stopPolling();
  curUser = null;
  teiaSessao.token = '';
  try{
    const ls = document.getElementById('login-screen');
    const ap = document.getElementById('app');
    if(ls) ls.classList.remove('hidden');
    if(ap) ap.style.display='none';
    const hr = document.getElementById('hright');
    if(hr) hr.innerHTML='';
    const err = document.getElementById('login-err');
    if(err){err.textContent='Sua sessão expirou. Faça login novamente.';err.style.display='block';}
  }catch(e){}
  setTimeout(()=>{_authFailureShown=false;}, 2000);
}
function updateSyncStatus(state){const m={ok:['sync-ok','🟢'],off:['sync-off','⚫'],warn:['sync-warn','🟡']};const[cls,txt]=m[state]||m.off;['sb-status','sync-status'].forEach(id=>{const el=document.getElementById(id);if(el){el.className='sync-badge '+cls;el.textContent=txt;}});}
async function detectarServidor(){if(_usePhp!==null)return _usePhp;updateSyncStatus('warn');const r=await phpGet('status');if(r&&r.ok){_usePhp=true;_serverOk=true;updateSyncStatus('ok');}else{_usePhp=false;_serverOk=false;updateSyncStatus('off');}return _usePhp;}
async function pullFromServer(){
  // Primeiro, baixa o núcleo
  const core = await phpGet('get_core');
  if(!core) return;
  db = { ...defaultDB(), ...core };
  if(!db.schedules) db.schedules = {};
  // CRÍTICO: db foi recriado, então curUser (que era referência a um objeto
  // do db antigo) agora aponta pra um objeto órfão. Re-vincula curUser ao
  // objeto correspondente no novo db.users — assim mudanças remotas (ex.:
  // admin alterou iaAccess, role, perms) chegam ao usuário sem precisar
  // relogar.
  if(curUser && Array.isArray(db.users)){
    const fresh = db.users.find(u => u.username === curUser.username);
    if(fresh){
      Object.keys(curUser).forEach(k => { delete curUser[k]; });
      Object.assign(curUser, fresh);
      const idx = db.users.indexOf(fresh);
      if(idx>=0) db.users[idx] = curUser;
    }
  }
  // ── MIGRAÇÃO ONE-SHOT v1 → v2 ────────────────────────────────────────
  const migrated = await _maybeMigrateV1ToV2(core);
  if(migrated) _corePullTs = Date.now();
  // Depois, lista os patches e baixa (em lote) só os que mudaram
  const list = await phpGet('list_user_patches');
  if(Array.isArray(list) && list.length){
    try{ await _teiaPrefetchPatches(list); }catch(e){ console.warn('[TeIA] lote de patches falhou, baixando um a um', e); }
    const patches = await Promise.all(list.map(async it=>{
      const p = await phpGet('get_user_patch&user='+encodeURIComponent(it.user));
      return p;
    }));
    applyPatchesToDb(patches);
  }
  _corePullTs = Date.now();
  try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch(e){ console.warn('[TeIA] cache local cheio, seguindo só com o servidor'); }
  updateSyncStatus('ok');
}

// Detecta se o núcleo baixado ainda tem avaliações embutidas (estrutura antiga)
// e, se tiver, move tudo para um patch do admin e regrava o núcleo limpo.
async function _maybeMigrateV1ToV2(core){
  if(!core||!core.courses) return false;
  let hasLegacyData = false;
  const legacyPatch = { studentAvaliacoes:{}, classBimestres:{} };
  for(const c of core.courses){
    for(const cl of (c.classes||[])){
      if(cl.bimestres && typeof cl.bimestres==='object'){
        let has = false;
        const bk = {};
        for(const b of [1,2,3,4]){
          const bv = cl.bimestres[b];
          if(bv && ((bv.positivos||'').trim() || (bv.negativos||'').trim())){
            bk[b] = { positivos: bv.positivos||'', negativos: bv.negativos||'' };
            has = true;
          }
        }
        if(has){ legacyPatch.classBimestres[cl.id] = bk; hasLegacyData = true; }
      }
      for(const s of (cl.students||[])){
        if(!s.avaliacoes || typeof s.avaliacoes!=='object') continue;
        const keep = {};
        let any = false;
        for(const[yr,bims] of Object.entries(s.avaliacoes)){
          if(!bims||typeof bims!=='object') continue;
          const ykept = {};
          for(const b of [1,2,3,4]){
            const av = bims[b];
            if(!av||typeof av!=='object') continue;
            const isEmpty = !av.comp && !av.desemp && !(av.obs||'').trim()
              && !(av.compPos||[]).length && !(av.compIssues||[]).length
              && !(av.despPos||[]).length && !(av.despIssues||[]).length
              && !(av.disciplinas||[]).length && !(av.encaminhamentos||[]).length
              && !(av.encaminhamentosOutro||'').trim()
              && !(av.seating && av.seating.x>=0 && av.seating.y>=0);
            if(!isEmpty){ ykept[b] = av; any = true; }
          }
          if(Object.keys(ykept).length) keep[yr] = ykept;
        }
        if(any){ legacyPatch.studentAvaliacoes[s.id] = keep; hasLegacyData = true; }
      }
    }
  }
  if(!hasLegacyData) return false;
  if(curUser?.role !== 'admin'){
    applyPatchesToDb([legacyPatch]);
    return true;
  }
  console.log('[TeIA] Detectado banco no formato v1 — migrando para v2...');
  applyPatchesToDb([legacyPatch]);
  const r = await phpPost('save_user_patch', { user:'admin', patch: legacyPatch });
  if(r && r.ok){
    const cleanCore = buildCoreSnapshot();
    await phpPost('save_core', cleanCore);
    toast('✅ Banco migrado para o formato v2 (multi-usuário)','ok');
    console.log('[TeIA] Migração concluída.');
  }
  return true;
}
async function pushToServer(){
  if(!_usePhp){toast('Servidor offline','err');return;}
  if(curUser?.role==='admin'){
    await phpPost('save_core', await buildCoreSnapshotAsync());
  }
  const patch = buildCurrentUserPatch();
  await phpPost('save_user_patch', { user: curUser.username, patch });
  await phpPost('save_log', getLogs());
  toast('✅ Dados enviados!','ok');
}
async function testServerConnection(){updateSyncStatus('warn');_usePhp=null;const ok=await detectarServidor();if(ok)toast('✅ Servidor (Supabase) OK!','ok');else toast('❌ Sem conexão com o servidor','err');}
function startPolling(){
  stopPolling();
  if(!_usePhp) return;
  let lastCoreTs = 0;
  const lastUserTs = {};
  _pollingTimer = setInterval(async ()=>{
    if(!curUser||!_usePhp) return;
    // Não puxa do servidor enquanto há saves em andamento — senão um pull
    // pode trazer dados antigos e sobrescrever as edições locais ainda não
    // confirmadas pelo servidor.
    if(_pollingPaused || _saveInFlight || _saveQueued) return;
    if(document.hidden) return; // aba em segundo plano não consulta o servidor
    const ts = await phpGet('get_ts');
    if(!ts) return;
    const coreChanged = ts.banco_ts && ts.banco_ts !== lastCoreTs;
    let someoneElseUpdated = false;
    const others = ts.users_ts || {};
    for(const[u,t] of Object.entries(others)){
      if(u===curUser.username) continue; // mudanças nossas vêm do save local
      if(lastUserTs[u]!==t){ someoneElseUpdated = true; break; }
    }
    if(coreChanged || someoneElseUpdated){
      if(_pollingPaused || _saveInFlight || _saveQueued) return;
      lastCoreTs = ts.banco_ts;
      Object.assign(lastUserTs, others);
      const myPatch = buildCurrentUserPatch();
      myPatch._savedAt = new Date().toISOString();
      await pullFromServer();
      applyPatchesToDb([myPatch]);
      try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch(e){}
      if(curView==='dashboard') renderDashboard();
      if(curUser?.role==='admin' && curView==='config') renderAdmin();
    } else {
      lastCoreTs = ts.banco_ts;
      Object.assign(lastUserTs, others);
    }
  }, 60000); // 60s: o Supabase aguenta bem mais que a hospedagem compartilhada
}
function stopPolling(){if(_pollingTimer){clearInterval(_pollingTimer);_pollingTimer=null;}}
function initSbFields(){if(!_usePhp&&_usePhp!==false)detectarServidor();}

// ── Admin: devolver a senha de um usuário para a provisória (= login) ──
async function resetarSenhaUsuario(i){
  const u = db.users[i]; if(!u) return;
  confirmAction(`Resetar a senha de "${u.username}"?`,
    `A senha volta a ser igual ao login ("${u.username}") e a pessoa terá que criar uma nova no próximo acesso.`,
    async ()=>{
      try{
        const r = await teiaApi('teia_reset_password', {p_user:u.username});
        if(r && r.ok){ u.password = u.username; renderAdmin(); toast(`Senha de ${u.username} resetada`,'ok'); addActivityLog('password',`Senha resetada pelo admin: ${u.username}`); }
        else toast('❌ '+((r&&r.erro)||'Falha ao resetar'),'err');
      }catch(e){ toast('❌ '+e.message,'err'); }
    });
}
