// ══════════════════ ADMIN ══════════════════
function renderAdmin(){
  renderProfAdmin();
  const list=document.getElementById('user-list');if(!list)return;
  list.innerHTML=db.users.map((u,i)=>{
    const pwId='pw-'+i;
    const badge=u.password===u.username?'<span style="font-size:.58rem;background:#FFF9C4;color:#827717;padding:.1rem .38rem;border-radius:8px;font-weight:600">⚠️ Padrão</span>':'<span style="font-size:.58rem;background:#E8F5E9;color:var(--green);padding:.1rem .38rem;border-radius:8px;font-weight:600">✅ Alterada</span>';
    const roleLbl=u.role==='admin'?'Admin':u.role==='editor'?'Editor':'Usuário';
    const roleCls=u.role==='admin'?'role-admin':u.role==='editor'?'role-editor':'role-user';
    const permCount=u.role==='admin'?'Acesso total':u.role==='editor'?'Editor':(u.permissions?.length||0)+' curso'+(u.permissions?.length!==1?'s':'');
    const chipColor=u.role==='admin'?'var(--ora)':u.role==='editor'?'#1565C0':(!u.permissions?.length?'var(--red)':'var(--green)');
    // Botão IA: admin sempre tem acesso (não mostra toggle, mostra rótulo).
    // Outros: toggle clicável que salva u.iaAccess.
    const iaToggle = u.role==='admin'
      ? '<span style="font-size:.6rem;background:#EDE7F6;color:#5E35B1;padding:.15rem .42rem;border-radius:8px;font-weight:700" title="Admin tem acesso à IA por padrão">🤖 IA</span>'
      : `<button onclick="toggleIaAccess(${i})" title="${u.iaAccess?'Clique para REVOGAR acesso ao Diagnóstico IA':'Clique para CONCEDER acesso ao Diagnóstico IA'}" style="font-size:.6rem;padding:.18rem .5rem;border-radius:8px;border:1.5px solid ${u.iaAccess?'#7E57C2':'#bdbdbd'};background:${u.iaAccess?'#EDE7F6':'#fafafa'};color:${u.iaAccess?'#5E35B1':'#777'};font-weight:700;cursor:pointer">🤖 IA ${u.iaAccess?'✓':'✕'}</button>`;
    return`<div class="user-card">
      <span class="uname">${esc(u.username)}</span>
      <span class="urole ${roleCls}">${roleLbl}</span>
      ${badge}
      <span id="${pwId}" class="pw-reveal" onclick="this.dataset.vis?(this.textContent='••••••',delete this.dataset.vis):(this.textContent='${esc(u.password)}',this.dataset.vis='1')">••••••</span>
      <span style="font-size:.62rem;font-weight:600;color:${chipColor}">${permCount}</span>
      ${iaToggle}
      ${u.role!=='admin'?`
        <select onchange="mudarRole(${i},this.value)" style="font-size:.62rem;border:1px solid var(--gm);border-radius:5px;padding:.15rem .3rem;cursor:pointer">
          <option value="user"${u.role==='user'?' selected':''}>👤 Usuário</option>
          <option value="editor"${u.role==='editor'?' selected':''}>✏️ Editor</option>
        </select>
        <button class="btn-s" style="font-size:.6rem;padding:.18rem .5rem" onclick="openPerms('${u.id}')">🔐 Turmas</button>
        <button class="btn-d" style="font-size:.6rem;padding:.18rem .5rem" onclick="removeUser(${i})">✕</button>
      `:''}
      ${u.username!==curUser?.username&&u.password!==u.username?`<button class="btn-s" style="font-size:.6rem;padding:.18rem .5rem" title="Voltar a senha para a provisória (igual ao login)" onclick="resetarSenhaUsuario(${i})">🔑 Resetar senha</button>`:''}
    </div>`;
  }).join('');
}
// Alterna o acesso ao Diagnóstico IA para um usuário não-admin.
// Admin sempre tem acesso e não pode ter o toggle alterado.
function toggleIaAccess(i){
  const u = db.users[i]; if(!u) return;
  if(u.role==='admin'){toast('Admin tem acesso por padrão','warn');return;}
  u.iaAccess = !u.iaAccess;
  saveDB();renderAdmin();
  addActivityLog('perm', `Diagnóstico IA ${u.iaAccess?'concedido a':'revogado de'} "${u.username}"`);
  toast(u.iaAccess?`🤖 Acesso à IA concedido a ${u.username}`:`🚫 Acesso à IA revogado de ${u.username}`, u.iaAccess?'ok':'warn');
}
function createUser(){
  const uname=document.getElementById('new-username').value.trim().toLowerCase();
  if(!uname||uname.length<2){toast('Nome inválido (mín. 2 chars)','err');return;}
  if(db.users.find(u=>u.username===uname)){toast('Usuário já existe','err');return;}
  db.users.push({id:genId(),username:uname,name:uname,password:uname,role:'user',permissions:[],createdAt:new Date().toISOString()});
  saveDB();document.getElementById('new-username').value='';renderAdmin();
  addActivityLog('insert',`Usuário criado: "${uname}"`);toast(`✅ Usuário "${uname}" criado! Senha = nome do usuário.`,'ok');
}
function mudarRole(i,role){if(!db.users[i]||db.users[i].role==='admin')return;db.users[i].role=role;saveDB();renderAdmin();toast(`Perfil: ${role==='editor'?'Editor':'Usuário'}`,'ok');}
function removeUser(i){
  if(db.users[i]?.role==='admin')return;
  const uname=db.users[i].username;
  confirmAction(`Remover "${uname}"?`,'Esta ação não pode ser desfeita.',()=>{db.users.splice(i,1);saveDB();renderAdmin();addActivityLog('delete',`Usuário removido: "${uname}"`);toast('Usuário removido','warn');});
}

// ══════════════════ EVASÃO ══════════════════
function getCourseAbbr(name){
  const n=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/admin/.test(n))return'AD';
  if(/autom/.test(n))return'AU';
  if(/edif/.test(n))return'ED';
  if(/eletrom/.test(n))return'EM';
  if(/eletrot/.test(n))return'EL';
  if(/inform/.test(n)||/comput/.test(n))return'IN';
  if(/meio|ambient/.test(n))return'MA';
  if(/seguran/.test(n))return'ST';
  if(/quim/.test(n))return'QM';
  if(/aliment/.test(n))return'AL';
  // Fallback genérico
  const m=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
              .match(/[Tt]ecnic[oa]\s+em\s+([A-Za-z]+)/);
  if(m&&m[1])return m[1].substring(0,2).toUpperCase();
  const skip=/^(tecnico|tecnica|em|de|do|da|e|para|com|no|na)$/i;
  const words=name.replace(/[^a-zA-ZÀ-ú\s]/g,'').split(/\s+/).filter(w=>w.length>1&&!skip.test(w));
  return(words[0]||name).substring(0,2).toUpperCase();
}

function isEvasaoClass(cl){
  return cl&&(cl.evasao===true||String(cl.name||'').toUpperCase().startsWith('EVASÃO'));
}

function getOrCreateEvasaoClass(courseId){
  const c=db.courses.find(x=>x.id===courseId);
  if(!c)return null;
  const existing=c.classes.find(isEvasaoClass);
  if(existing)return existing;
  const abbr=getCourseAbbr(c.name);
  const newCl={
    id:'evasao_'+courseId+'_'+Date.now(),
    name:'EVASÃO-'+abbr,
    evasao:true,
    students:[],
    teachers:[],
    bimestres:{}
  };
  c.classes.push(newCl);
  saveDB();
  return newCl;
}

function criarTodasEvasoes(){
  const tec=db.courses.filter(ehCursoTecnico);
  if(!tec.length){toast('Importe os dados primeiro','warn');return;}
  let criadas=0;
  // Agrupa por getGroupKey (Edificações Integrado + Edif. Subsequente = mesmo grupo)
  const groups=new Map();
  tec.forEach(c=>{
    const key=getGroupKey(c.name);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  });
  groups.forEach(coursesOfGroup=>{
    // Procura evasão em qualquer curso do grupo
    const hasAnyEvasao=coursesOfGroup.some(c=>c.classes.find(isEvasaoClass));
    if(!hasAnyEvasao){
      // Cria no primeiro curso do grupo
      getOrCreateEvasaoClass(coursesOfGroup[0].id);
      criadas++;
    }
  });
  saveDB();renderDashboard();
  toast(criadas>0?`${criadas} turma(s) EVASÃO criada(s)`:'Turmas EVASÃO já existem','ok');
  addActivityLog('admin',`Turmas EVASÃO criadas: ${criadas}`);
}

function moverParaEvasao(studentId){
  const s=findStudentById(studentId);
  if(!s){toast('Aluno não encontrado','err');return;}
  // Find current class
  let srcCourse=null,srcClass=null;
  for(const c of db.courses){
    for(const cl of c.classes){
      if(cl.students.find(x=>x.id===studentId)){srcCourse=c;srcClass=cl;break;}
    }
    if(srcClass)break;
  }
  if(!srcCourse||!srcClass){toast('Turma de origem não encontrada','err');return;}
  if(isEvasaoClass(srcClass)){toast('Aluno já está na turma de EVASÃO','warn');return;}
  // Procura turma de evasão em qualquer curso do MESMO GRUPO
  const srcGroupKey=getGroupKey(srcCourse.name);
  let evasao=null;
  for(const c of db.courses){
    if(getGroupKey(c.name)!==srcGroupKey)continue;
    const ev=c.classes.find(isEvasaoClass);
    if(ev){evasao=ev;break;}
  }
  if(!evasao) evasao=getOrCreateEvasaoClass(srcCourse.id);
  if(!evasao){toast('Não foi possível criar turma EVASÃO','err');return;}
  // Captura o ID da turma de origem ANTES de mover. O usuário continua
  // avaliando essa turma — não deve ser jogado para a turma de EVASÃO.
  const srcClassId = srcClass.id;
  confirmAction('🚪 Mover para EVASÃO',
    `Confirma transferir "${s.nome}" para a turma ${evasao.name}? Você continuará avaliando a turma ${srcClass.name}.`,
    ()=>{
      // Realiza a transferência
      srcClass.students=srcClass.students.filter(x=>x.id!==studentId);
      evasao.students.push(s);
      // CRÍTICO: mantém o usuário na turma de ORIGEM (de onde o aluno saiu).
      // Antes, este código mudava activeClassId=evasao.id, que causava o efeito
      // "todos os alunos da turma original aparecem como se estivessem na evasão"
      // porque a tela passava a mostrar o conteúdo da turma de evasão sob o
      // nome (ainda em cache de render) da turma de origem.
      activeClassId = srcClassId;
      // Aluno transferido: limpa o foco nele (não está mais nesta turma)
      activeStudentId = null;
      // Atualiza listStudents para refletir a turma origem sem o aluno transferido
      listStudents = (srcClass.students||[]).slice();
      saveDB();
      // Volta para a visão da turma de origem (sem ficha de aluno aberta)
      showClassOverview();
      renderList();
      toast(`${s.nome} movido para ${evasao.name}`,'ok');
      addActivityLog('admin',`Aluno "${s.nome}" movido para EVASÃO (origem: ${srcClass.name})`);
    }
  );
}

// ══════════════════ PERMS ══════════════════
let _permUserId=null;
function openPerms(uid){
  _permUserId=uid;
  const u=db.users.find(x=>x.id===uid);if(!u)return;
  document.getElementById('perm-user-name').textContent=u.name||u.username;
  const perms=u.permissions||[];
  const tree=document.getElementById('perm-tree');
  const tecCourses=db.courses.filter(ehCursoTecnico);
  if(!tecCourses.length){tree.innerHTML='<div style="font-size:.74rem;color:var(--g3);text-align:center;padding:1rem">Nenhum curso técnico importado ainda.</div>';openModal('perm-modal');return;}
  // Group by base name (ignore modality)
  const groups=new Map();
  tecCourses.forEach(c=>{
    const key=getGroupKey(c.name);
    if(!groups.has(key))groups.set(key,{base:getNomeBase(c.name),courses:[]});
    groups.get(key).courses.push(c);
  });
  _permGroups={};
  tree.innerHTML=[...groups.entries()].map(([key,g])=>{
    const gid='grp_'+key.replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const allCourseIds=g.courses.map(c=>c.id);
    _permGroups[gid]=allCourseIds;
    // Checked if ANY course in group is permitted
    const checked=allCourseIds.some(id=>perms.includes(id));
    const tot=g.courses.reduce((s,c)=>s+c.classes.filter(cl=>!isEvasaoClass(cl)).reduce((s2,cl)=>s2+cl.students.length,0),0);
    const turmas=g.courses.reduce((s,c)=>s+c.classes.filter(cl=>!isEvasaoClass(cl)).length,0);
    return`<label style="display:flex;align-items:flex-start;gap:.55rem;padding:.45rem .55rem;border-radius:6px;cursor:pointer;background:var(--gp);border:1px solid var(--gm);user-select:none">
      <input type="checkbox" id="pc-${gid}" ${checked?'checked':''} style="width:15px;height:15px;accent-color:var(--green);margin-top:.15rem;flex-shrink:0">
      <span style="flex:1;min-width:0">
        <span style="font-size:.78rem;font-weight:700;color:var(--dk);line-height:1.4;display:block;word-break:break-word">📘 ${esc(g.base)}</span>
        <span style="font-size:.64rem;color:var(--g3)">${turmas} turma${turmas!==1?'s':''}${tot?' · '+tot+' aluno'+(tot!==1?'s':''):''}</span>
      </span>
    </label>`;
  }).join('');
  openModal('perm-modal');
}
function togglePermGroup(gid){
  const ids=_permGroups[gid]||[];const cb=document.getElementById('pc-'+gid);
  ids.forEach(clid=>{const el=document.getElementById('pcl-'+clid);if(el)el.checked=cb.checked;});
}
function updatePermGroupCheck(gid){
  const ids=_permGroups[gid]||[];
  const all=ids.every(clid=>{const e=document.getElementById('pcl-'+clid);return e&&e.checked;});
  const some=ids.some(clid=>{const e=document.getElementById('pcl-'+clid);return e&&e.checked;});
  const cb=document.getElementById('pc-'+gid);if(cb){cb.checked=all;cb.style.outline=(!all&&some)?'2px solid var(--yel)':'';}
}
function toggleAllPerms(state){
  Object.keys(_permGroups).forEach(cid=>{const cb=document.getElementById('pc-'+cid);if(cb)cb.checked=state;});
}
function savePerms(){
  const u=db.users.find(x=>x.id===_permUserId);if(!u)return;
  const allowed=[];
  Object.keys(_permGroups).forEach(gid=>{const e=document.getElementById('pc-'+gid);if(e&&e.checked){_permGroups[gid].forEach(id=>allowed.push(id));}});
  u.permissions=allowed;saveDB();closeModal('perm-modal');renderAdmin();
  addActivityLog('perm',`Permissões de "${u.username}": ${allowed.length} curso(s)`);
  toast(`Permissões salvas: ${allowed.length} curso(s)`,'ok');
}


