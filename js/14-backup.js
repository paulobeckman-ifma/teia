// ══════════════════ BACKUP NO GOOGLE DRIVE ══════════════════
// O Apps Script (conta institucional) guarda cópias completas do banco numa
// pasta do Drive. Toda semana roda sozinho; o admin também pode gerar um
// backup na hora. O mesmo script faz uma consulta leve por dia para o projeto
// gratuito do Supabase não ser pausado por inatividade (férias, recesso).
function _gasUrl(){ return (window.TEIA_CONFIG||{}).APPS_SCRIPT_URL || ''; }
async function teiaGas(acao, dados={}, timeout=90000){
  const url=_gasUrl(); if(!url) throw new Error('O endereço do Apps Script ainda não foi configurado.');
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(), timeout);
  let r;
  try{
    r=await fetch(url,{method:'POST',redirect:'follow',signal:ctrl.signal,headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({acao, token:teiaSessao.token, ...dados})});
  }catch(e){ throw new Error('Sem resposta do Apps Script.'); }
  finally{ clearTimeout(t); }
  let j; try{ j=await r.json(); }catch(e){ throw new Error('Resposta inválida do Apps Script (HTTP '+r.status+')'); }
  if(!j.ok) throw new Error(j.erro||'Falha no Apps Script');
  return j;
}
const _DIAS=['','Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
async function renderBackupConfig(){
  const panel=document.getElementById('cfg-backup'); if(!panel) return;
  if(!_isAdmin()){ panel.innerHTML='<div class="card"><div class="ct">💾 Backup</div><p style="font-size:.78rem">Apenas administradores.</p></div>'; return; }
  panel.innerHTML='<div class="card"><div class="ct">💾 Backup no Google Drive</div><p style="font-size:.76rem;color:var(--g3)">Carregando…</p></div>';
  let info={conectado:false,config:{},ultimos:[]};
  try{ info=await teiaApi('teia_backup_info'); }catch(e){}
  const cfg=Object.assign({automatico:true,dia_semana:5,hora:22,manter:26}, info.config||{});
  const temGas=!!_gasUrl();
  const sel=(id,opts,val)=>`<select id="${id}" style="font-size:.76rem;padding:.3rem;border:1.5px solid var(--g5);border-radius:6px">${opts.map(([v,l])=>`<option value="${v}"${String(v)===String(val)?' selected':''}>${l}</option>`).join('')}</select>`;
  const linhas=(info.ultimos||[]).map(b=>`<tr><td>${esc(fmtTs(b.em))}</td><td>${esc(b.tipo||'')}</td><td>${esc(b.detalhe||'')}</td><td>${b.arquivo_url?`<a href="${esc(b.arquivo_url)}" target="_blank" rel="noopener">abrir</a>`:''}</td></tr>`).join('');
  panel.innerHTML=`
  <div class="card">
    <div class="ct">💾 Backup no Google Drive</div>
    <p style="font-size:.74rem;color:var(--g2);line-height:1.7;margin-bottom:.6rem">
      Cada backup é um arquivo JSON completo (cursos, turmas, alunos, avaliações de todos os usuários e histórico), salvo numa pasta do Drive institucional.
      Serve para restaurar o sistema se algo der errado. Senhas não entram no backup.
    </p>
    <div id="bk-status" style="font-size:.76rem;padding:.55rem .8rem;border-radius:8px;margin-bottom:.7rem;background:${info.conectado?'#e8f5e9':'#fff3e0'};color:${info.conectado?'#2e7d32':'#e65100'};font-weight:600">
      ${!temGas?'⚠️ O endereço do Apps Script ainda não foi preenchido em config.js.':info.conectado?'✅ Drive conectado':'⚠️ Drive ainda não conectado'}
    </div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.8rem">
      <button class="btn-s" ${temGas?'':'disabled'} onclick="bkConectar(this)">🔗 ${info.conectado?'Reconectar':'Conectar'} ao Drive</button>
      <button class="btn-p" ${temGas&&info.conectado?'':'disabled'} onclick="bkAgora(this)">💾 Fazer backup agora</button>
    </div>
    <div style="display:flex;gap:.8rem;flex-wrap:wrap;align-items:end;font-size:.72rem">
      <label style="display:flex;gap:.3rem;align-items:center"><input type="checkbox" id="bk-auto" ${cfg.automatico!==false?'checked':''}> Backup automático semanal</label>
      <label>Dia<br>${sel('bk-dia',[1,2,3,4,5,6,7].map(d=>[d,_DIAS[d]]),cfg.dia_semana)}</label>
      <label>Hora<br>${sel('bk-hora',Array.from({length:24},(_,h)=>[h,String(h).padStart(2,'0')+'h']),cfg.hora)}</label>
      <label>Manter os últimos<br>${sel('bk-manter',[8,13,26,52,104].map(n=>[n,n+' backups']),cfg.manter)}</label>
      <button class="btn-s" ${temGas&&info.conectado?'':'disabled'} onclick="bkSalvarAgenda(this)">Salvar agendamento</button>
    </div>
  </div>
  <div class="card">
    <div class="ct">🗂️ Últimos backups</div>
    ${linhas?`<table style="width:100%;font-size:.72rem;border-collapse:collapse"><tr style="text-align:left;color:var(--g3)"><th>Data</th><th>Tipo</th><th>Detalhe</th><th>Arquivo</th></tr>${linhas}</table>`:'<p style="font-size:.74rem;color:var(--g3)">Nenhum backup ainda.</p>'}
    <p style="font-size:.7rem;color:var(--g3);margin-top:.6rem">Também é possível baixar uma cópia na hora em Importar → Exportar backup (arquivo no seu computador).</p>
  </div>`;
}
function _bkCfg(){ return { automatico: document.getElementById('bk-auto').checked, dia_semana: +document.getElementById('bk-dia').value, hora: +document.getElementById('bk-hora').value, manter: +document.getElementById('bk-manter').value }; }
async function bkConectar(btn){
  btn.disabled=true;
  try{ const r=await teiaGas('conectar',{backup:_bkCfg()},90000); toast('✅ Drive conectado','ok'); addActivityLog('edit','Backup: Drive conectado'); }
  catch(e){ toast('❌ '+e.message,'err'); }
  renderBackupConfig();
}
async function bkAgora(btn){
  btn.disabled=true; btn.textContent='⏳ Gerando backup…';
  try{ const r=await teiaGas('backup',{},330000); toast('✅ Backup concluído: '+(r.detalhe||''),'ok'); addActivityLog('edit','Backup manual no Drive'); }
  catch(e){ toast('❌ '+e.message,'err'); }
  renderBackupConfig();
}
async function bkSalvarAgenda(btn){
  btn.disabled=true;
  try{ await teiaGas('agendar_backup',{backup:_bkCfg()},90000); toast('Agendamento salvo','ok'); }
  catch(e){ toast('❌ '+e.message,'err'); }
  renderBackupConfig();
}
