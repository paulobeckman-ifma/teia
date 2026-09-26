// ══════════════════ HELPERS ══════════════════
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function toTitleCase(s){return String(s||'').toLowerCase().replace(/(?:^|\s)\S/g,a=>a.toUpperCase()).trim();}
function genId(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36);}
function initials(nome){return String(nome||'').split(' ').filter(Boolean).map(w=>w[0].toUpperCase()).join('').substring(0,2);}
function findClass(clid){for(const c of db.courses){const cl=c.classes.find(x=>x.id===clid);if(cl)return{course:c,clase:cl};}return null;}
function findStudentById(id){for(const c of db.courses)for(const cl of c.classes){const s=cl.students.find(x=>x.id===id);if(s)return s;}return null;}
function isAdmin(){return curUser?.role==='admin';}
function canEdit(){
  if(_classLocked)return false;
  if(curUser?.role==='admin'||curUser?.role==='editor')return true;
  if(activeClassId&&classAllowed(activeClassId))return true;
  return false;
}
function _isAdmin(){return curUser?.role==='admin';}
// Diagnóstico IA: admin sempre pode; demais usuários precisam ter iaAccess=true
// definido pelo admin na aba Usuários.
function canUseIA(){
  if(!curUser) return false;
  if(curUser.role==='admin') return true;
  return !!curUser.iaAccess;
}
function _getLockBtn(){return document.getElementById('_lockBtn');}
function _updateLockBtn(){
  const btn=document.getElementById('_lockBtn');
  if(!btn)return;
  if(_classLocked){
    btn.title='Edição bloqueada — clique para desbloquear';
    btn.innerHTML='🔒 Bloqueado';
    btn.style.background='#c62828';
    btn.style.color='#fff';
    btn.style.boxShadow='0 1px 6px rgba(198,40,40,.4)';
  } else {
    btn.title='Edição desbloqueada — clique para bloquear';
    btn.innerHTML='🔓 Desbloqueado';
    btn.style.background='#2e7d32';
    btn.style.color='#fff';
    btn.style.boxShadow='0 1px 6px rgba(46,125,50,.4)';
  }
  // Atualizar disabled de todos os campos da ficha do aluno
  const _rows=['comp-desemp-row','obs-disc-row','encam-card-body'].map(id=>document.getElementById(id)).filter(Boolean);
  _rows.forEach(row=>{
    // Checkboxes
    row.querySelectorAll('input[type=checkbox]').forEach(cb=>{cb.disabled=_classLocked;});
    // Inputs de texto (obs bimestre, disc-add)
    row.querySelectorAll('input[type=text]').forEach(inp=>{inp.readOnly=_classLocked;inp.style.background=_classLocked?'var(--g6)':'';});
    // Botões de classificação
    row.querySelectorAll('.classif-btn').forEach(btn=>{
      btn.disabled=_classLocked;
      btn.style.opacity=_classLocked?'.5':'1';
      btn.style.cursor=_classLocked?'not-allowed':'pointer';
    });
    // Botões de ação (exceto lupa)
    row.querySelectorAll('button:not(.lupa-trigger)').forEach(b=>{
      b.disabled=_classLocked;
      b.style.opacity=_classLocked?'.4':'1';
    });
  });
}
function _toggleLock(){
  if(_classLocked){
    confirmAction('🔓 Desbloquear edição',
      'Deseja desbloquear a edição desta turma? Tome cuidado para não alterar informações por engano.',
      ()=>{
        _classLocked=false;
        // 1) Atualização VISUAL imediata do botão e dos campos (síncrono, rápido)
        _updateLockBtn();
        toast('Edição desbloqueada 🔓','ok');
        // 2) Re-render pesado (com botões condicionais ✏️ Editar, etc.) adiado para
        //    o próximo frame para que o usuário veja o cadeado mudar de cor NA HORA.
        requestAnimationFrame(()=>{
          if(activeStudentId)renderStudentDetail();
          else if(activeClassId)showClassOverview();
        });
      }
    );
  } else {
    _classLocked=true;
    _updateLockBtn();
    toast('Edição bloqueada 🔒');
    requestAnimationFrame(()=>{
      if(activeStudentId)renderStudentDetail();
      else if(activeClassId)showClassOverview();
    });
  }
}
function temAlerta(val){if(!val&&val!==0)return false;const v=String(val).trim().toLowerCase();if(!v||v==='0'||v==='-')return false;const neg=['não','nao','no','false','none','n/a','na','sem','nenhum'];return!neg.some(n=>v===n||v.startsWith(n+' '));}
function toast(msg,type=''){const t=document.createElement('div');t.style.cssText=`position:fixed;bottom:1.2rem;right:1.2rem;z-index:9999;background:${type==='ok'?'#2E7D32':type==='err'?'#C62828':'#333'};color:#fff;padding:.55rem 1.1rem;border-radius:8px;font-size:.78rem;font-weight:600;max-width:340px;box-shadow:0 4px 20px rgba(0,0,0,.25);animation:fadeIn .25s`;t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3200);}
function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function closeConfirm(){document.getElementById('confirm-bg').classList.remove('open');}
function confirmAction(title,msg,onOk){document.getElementById('confirm-title').textContent=title;document.getElementById('confirm-msg').textContent=msg;document.getElementById('confirm-bg').classList.add('open');document.getElementById('confirm-ok').onclick=()=>{closeConfirm();onOk();};}
document.addEventListener('click',e=>{if(e.target.id==='confirm-bg')closeConfirm();if(e.target.classList.contains('modal-bg'))e.target.classList.remove('open');if(e.target.id==='photo-popup')closePhotoPopup();});

// Tenta flush de save pendente antes da aba fechar ou recarregar.
// Uso sendBeacon — é o único método confiável em beforeunload (fetch normal
// é frequentemente abortado). O servidor aceita POST sem Content-Type especial.
window.addEventListener('beforeunload',()=>{
  try{
    if(typeof flushPendingSave==='function') flushPendingSave();
    if(_usePhp && curUser && typeof buildCurrentUserPatch==='function'){
      const patch = buildCurrentUserPatch();
      const body = JSON.stringify({ user: curUser.username, patch });
      if(body && typeof teiaEnvioFinal==='function') teiaEnvioFinal('save_user_patch', { user: curUser.username, patch });
    }
  }catch(e){/* silencioso — a aba está fechando mesmo */}
});


// ── Lazy-load photos ──
let _lazyObserver=null;
function lazyLoadPhotos(){
  // Load immediately any visible ones
  document.querySelectorAll('img.lazy-photo[data-src]').forEach(img=>{
    if(!img.src||img.src==='about:blank'||!img.getAttribute('data-src'))return;
    if(_lazyObserver){_lazyObserver.observe(img);}else{loadPhoto(img);}
  });
}
function loadPhoto(img){
  const src=img.getAttribute('data-src');if(!src)return;
  img.src=src;img.style.display='';img.removeAttribute('data-src');
  img.onerror=function(){this.style.display='none';};
}
function initLazyObserver(){
  if(!('IntersectionObserver' in window)){return;}
  _lazyObserver=new IntersectionObserver((entries)=>{
    entries.forEach(e=>{if(e.isIntersecting){loadPhoto(e.target);_lazyObserver.unobserve(e.target);}});
  },{rootMargin:'100px'});
}
document.addEventListener('DOMContentLoaded',initLazyObserver);
