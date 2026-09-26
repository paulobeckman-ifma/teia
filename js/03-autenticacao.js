// ══════════════════ AUTH ══════════════════
async function doLogin(){
  const u=document.getElementById('li-user').value.trim().toLowerCase();
  const p=document.getElementById('li-pass').value;
  const err=document.getElementById('login-err');
  err.classList.remove('show');
  if(err)err.style.display='';
  if(!u||!p){
    err.textContent='Preencha usuário e senha.';err.classList.add('show');return;
  }
  // Detecta servidor PRIMEIRO (precisamos antes do login para escolher o caminho)
  if(_usePhp===null) await detectarServidor();
  let found = null;
  if(_usePhp){
    // Login via API: cria sessão (cookie HttpOnly) e devolve dados do usuário.
    const resp = await phpPost('login', {user:u, pass:p});
    if(resp && resp.ok && resp.user){
      found = resp.user;
      // Garante que db.users contenha esse usuário (para permissões etc).
      // Como o cliente puxa o banco depois, isso é só fallback.
    } else {
      err.textContent = (resp && resp.erro) ? resp.erro : 'Usuário ou senha inválidos.';
      err.classList.add('show');
      const inp=document.getElementById('li-pass');inp.classList.add('error');
      setTimeout(()=>{inp.classList.remove('error');inp.value='';inp.focus();},700);
      return;
    }
  } else {
    // Modo offline (sem servidor) — fallback: valida no localStorage
    const local = db.users.find(x=>x.username===u && x.password===p);
    if(!local){
      err.textContent='Usuário ou senha inválidos (modo offline).';
      err.classList.add('show');
      const inp=document.getElementById('li-pass');inp.classList.add('error');
      setTimeout(()=>{inp.classList.remove('error');inp.value='';inp.focus();},700);
      return;
    }
    found = local;
  }
  curUser = found;
  // Guarda a senha digitada para usar no force-change (caso seja primeiro acesso).
  // Limpa logo após o overlay confirmar (ver confirmarForcePw).
  _loginPwForForceChange = p;
  _authFailureShown = false;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').style.display='flex';
  buildTabs();renderDashboard();
  document.getElementById('li-user').value='';
  document.getElementById('li-pass').value='';
  addActivityLog('login',`Login: ${found.username}`);
  if(_usePhp){
    pullFromServer().then(()=>{
      _initialPullDone = true;
      renderDashboard();
      renderAdmin&&renderAdmin();
      startPolling();
    });
  } else {
    _initialPullDone = true; // sem servidor não há pull
    startPolling();
  }
  // Força troca de senha quando:
  //   (a) login foi com senha == username  (heurística "senha padrão")  OU
  //   (b) usuário tem flag mustChangePassword=true no banco
  const forceChange = (p === found.username) || found.mustChangePassword === true;
  if(forceChange){
    setTimeout(()=>{
      const o=document.getElementById('force-pw-overlay');
      document.getElementById('force-pw-new').value='';
      document.getElementById('force-pw-confirm').value='';
      document.getElementById('force-pw-err').style.display='none';
      o.style.display='flex';
      setTimeout(()=>document.getElementById('force-pw-new').focus(),80);
    },350);
  }
}
async function doLogout(){
  if(typeof flushPendingSave==='function')flushPendingSave();
  stopPolling();
  // Avisa o servidor para destruir a sessão. Se falhar (offline), segue
  // local — o cookie eventualmente expira sozinho.
  try{ await phpPost('logout', {}); }catch(e){}
  curUser=null;
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').style.display='none';
  document.getElementById('hright').innerHTML='';
}
function confirmarForcePw(){
  const nw=document.getElementById('force-pw-new').value;
  const cf=document.getElementById('force-pw-confirm').value;
  const err=document.getElementById('force-pw-err');
  if(!nw||!cf){err.textContent='Preencha os dois campos.';err.style.display='block';return;}
  if(nw===curUser.username){err.textContent='A senha não pode ser igual ao usuário.';err.style.display='block';return;}
  if(nw!==cf){err.textContent='As senhas não coincidem.';err.style.display='block';return;}
  if(nw.length<4){err.textContent='Senha muito curta (mín. 4 caracteres).';err.style.display='block';return;}
  // Usa a senha digitada no login (em texto puro) como "currentPassword".
  // O endpoint change_password do PHP faz password_verify com o hash do banco.
  // Sem isso, currentPassword viria undefined (curUser.password não é exposto
  // pelo backend após o login) e a troca falharia com "senha atual incorreta".
  const oldPw = _loginPwForForceChange || curUser.password || '';
  (async ()=>{
    if(_usePhp){
      const r = await phpPost('change_password', {
        username: curUser.username,
        currentPassword: oldPw,
        newPassword: nw
      });
      if(!r || r.erro){
        err.textContent='Falha no servidor: '+(r?.erro||'sem conexão');
        err.style.display='block';
        return;
      }
    }
    const idx=db.users.findIndex(u=>u.username===curUser.username);
    if(idx>=0) db.users[idx].password=nw;
    curUser.password=nw;
    // Limpa a senha temporária — não precisamos mais dela
    _loginPwForForceChange='';
    // Só salva localmente — _NÃO_ chama saveDB() para evitar push desnecessário
    // de patch (senha não faz parte do patch do usuário).
    try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch(e){}
    document.getElementById('force-pw-overlay').style.display='none';
    toast('✅ Senha definida com sucesso!','ok');
    addActivityLog('password',`Senha alterada: ${curUser.username}`);
  })();
}
function changePassword(){
  const cur=document.getElementById('pw-current').value.trim();
  const nw=document.getElementById('pw-new').value.trim();
  const conf=document.getElementById('pw-confirm').value.trim();
  const msg=document.getElementById('pw-msg');
  function showMsg(txt,ok){
    msg.textContent=txt;
    msg.style.display='block';
    msg.style.background=ok?'#E8F5E9':'#FFEBEE';
    msg.style.color=ok?'#2E7D32':'#c62828';
    msg.style.border='1.5px solid '+(ok?'#C8E6C9':'#FFCDD2');
    if(ok)setTimeout(()=>{msg.style.display='none';},2800);
  }
  if(!cur||!nw||!conf){showMsg('⚠️ Preencha todos os campos.',false);return;}
  if(nw!==conf){showMsg('⚠️ As senhas não coincidem.',false);return;}
  if(nw.length<4){showMsg('⚠️ Senha muito curta (mín. 4 caracteres).',false);return;}
  // NÃO comparamos a senha atual localmente — db.users[idx].password é um
  // HASH bcrypt vindo do banco, jamais bate com texto puro. Quem valida é o
  // PHP via password_verify. Caso o servidor responda erro, mostramos.
  (async()=>{
    if(_usePhp){
      const r = await phpPost('change_password',{
        username: curUser.username,
        currentPassword: cur,
        newPassword: nw
      });
      if(!r || r.erro){
        showMsg('⚠️ '+(r?.erro||'Falha no servidor (sem conexão).'), false);
        return;
      }
    } else {
      // Modo offline: valida em texto puro contra o cache local
      const idx=db.users.findIndex(u=>u.username===curUser.username);
      if(idx<0||db.users[idx].password!==cur){
        showMsg('⚠️ Senha atual incorreta.', false);
        return;
      }
    }
    const idx=db.users.findIndex(u=>u.username===curUser.username);
    if(idx>=0) db.users[idx].password=nw;
    curUser.password=nw;
    try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch(e){}
    document.getElementById('pw-current').value='';
    document.getElementById('pw-new').value='';
    document.getElementById('pw-confirm').value='';
    showMsg('✅ Senha alterada com sucesso!',true);
    addActivityLog&&addActivityLog('password',`Senha alterada: ${curUser.username}`);
  })();
}

