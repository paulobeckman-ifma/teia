// ══════════════════ TABS ══════════════════
function buildTabs(){
  const hright=document.getElementById('hright');
  hright.innerHTML='';
  const tabs=[{id:'dashboard',label:'🏠 Cursos'}];
  if(isAdmin())tabs.push({id:'config',label:'⚙️ Configurações'});
  tabs.push({id:'perfil',label:'🔑 Senha'});
  tabs.forEach(t=>{const btn=document.createElement('button');btn.className='btn-tab';btn.textContent=t.label;btn.dataset.tab=t.id;btn.onclick=()=>switchTab(t.id);hright.appendChild(btn);});
  switchTab('dashboard');
}
function switchTab(t){
  curView=t;
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.toggle('active',el.id==='tab-'+t));
  document.querySelectorAll('.btn-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  if(t==='dashboard')renderDashboard();
  if(t==='perfil'){const lbl=document.getElementById('senha-usuario-label');if(lbl&&curUser)lbl.textContent='Usuário: '+curUser.username;}
  if(t==='config'){renderAdmin();initSbFields();switchCfgTab('usuarios');}
  if(t==='log')renderLog();
  // Don't auto-call showClassOverview here — causes infinite loop when called from showClassOverview
}
function injectAlunosTab(){
  const hright=document.getElementById('hright');
  if(hright.querySelector('[data-tab="alunos"]'))return;
  const dashBtn=hright.querySelector('[data-tab="dashboard"]');
  const btn=document.createElement('button');btn.className='btn-tab';btn.textContent='📋 TeIA';btn.dataset.tab='alunos';btn.onclick=()=>switchTab('alunos');
  dashBtn.after(btn);
}

// ══════════════════ GROUPING HELPERS ══════════════════
function getNomeBase(name){return name.replace(/\s*[-–]\s*(itz|imperatriz|sub\.?|conc\.?)\b.*/i,'').replace(/\b(integrado|subsequente|subsequ\.?|sub\b|concomitante|conc\b|proeja|conc\.)\b/gi,'').replace(/[.\-–]+$/,'').replace(/\s+/g,' ').trim();}
function getGroupKey(name){return getNomeBase(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();}
function ehCursoTecnico(c){const n=(c.name||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');return n.startsWith('tecnico');}
function getAllowedCourseIds(){if(isAdmin())return null;return curUser?.permissions||[];}
function classAllowed(clid){
  if(isAdmin())return true;
  const allowed=curUser?.permissions||[];
  if(!allowed.length)return false;
  const found=findClass(clid);
  if(!found)return false;
  const myKey=getGroupKey(found.course.name);
  return allowed.some(permId=>{
    const pc=db.courses.find(c=>c.id===permId);
    return pc&&getGroupKey(pc.name)===myKey;
  });
}
function getVisibleCourses(){
  return db.courses.filter(ehCursoTecnico);
}
function getAccessibleCourseIds(){
  if(isAdmin())return null; // null = all
  return curUser?.permissions||[];
}
function groupAllowed(allClasses){
  if(isAdmin())return true;
  const allowed=curUser?.permissions||[];
  if(!allowed.length)return false;
  // Check by getNomeBase matching — ignore modality
  return allClasses.some(cl=>{
    const f=findClass(cl.id);
    if(!f)return false;
    // Check if any permitted course has same base name
    return allowed.some(permId=>{
      const pc=db.courses.find(c=>c.id===permId);
      if(!pc)return false;
      return getGroupKey(pc.name)===getGroupKey(f.course.name);
    });
  });
}
const sortTurmas=arr=>arr.sort((a,b)=>{
  const isEv=cl=>cl&&(cl.evasao===true||/^EVASÃO/i.test(cl.name||''));
  const anon=n=>!n||/^-+$/.test((n||'').trim())||n.trim()===''||n.trim().toLowerCase()==='ifma'||/sem\s*turma/i.test(n||'');
  if(isEv(a)&&!isEv(b))return 1;if(!isEv(a)&&isEv(b))return -1;if(isEv(a)&&isEv(b))return 0;
  if(anon(a.name)&&!anon(b.name))return 1;if(!anon(a.name)&&anon(b.name))return -1;if(anon(a.name)&&anon(b.name))return 0;
  const modalPrio=n=>{const s=(n||'').trim();if(/-I$/i.test(s))return 0;if(/-S$/i.test(s))return 1;if(/-C$/i.test(s))return 2;return 3;};
  const mp=modalPrio(a.name)-modalPrio(b.name);if(mp!==0)return mp;
  const numA=parseInt((a.name||'').match(/\d+/)?.[0])||9999;
  const numB=parseInt((b.name||'').match(/\d+/)?.[0])||9999;
  if(numA!==numB)return numA-numB;
  return a.name.localeCompare(b.name,undefined,{sensitivity:'base'});
});


// ══════════════════ COURSE IMAGES ══════════════════

function getCourseCode(name){
  const n=(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/aliment/.test(n))return'0';
  if(/edif/.test(n))return'1';
  if(/eletrom/.test(n)||(/eletr/.test(n)&&/mec/.test(n)))return'2';
  if(/eletrot/.test(n)||/eletro.*t/.test(n))return'3';
  if(/autom/.test(n))return'4';
  if(/meio|ambient/.test(n))return'5';
  if(/quim/.test(n))return'6';
  if(/inform/.test(n)||/comput/.test(n))return'7';
  if(/segur/.test(n))return'8';
  if(/adm/.test(n))return'9';
  return'';
}
// Chave de ordenação dos cursos na tela inicial e afins.
// Ordem desejada: 1,2,3,4,5,6,7,8,9,0,(sem código) — Alimentos (0) vai para o final, depois de Administração (9).
// '9' é 0x39 e ':' é 0x3A, então ':' ordena logo após '9' por localeCompare.
function getCourseSortKey(name){
  const code=getCourseCode(name);
  if(code==='0')return':'; // joga Alimentos para depois do 9
  if(!code)return'Z';      // cursos sem código reconhecido vão por último
  return code;
}
function renderDashboard(){
  // Ensure EVASÃO class exists for all technical courses (idempotent)
  // Também consolida evasões duplicadas no mesmo GRUPO (ex.: Edificações Integrado +
  // Edificações Subsequente compartilham o mesmo grupo de evasão).
  if(db&&db.courses){
    // Primeiro passo: dedup dentro de cada curso (já existia)
    db.courses.filter(ehCursoTecnico).forEach(c=>{
      const evs=c.classes.filter(isEvasaoClass);
      if(evs.length>1){
        // Mantém a primeira e move alunos das outras pra ela
        const keep=evs[0];
        for(let i=1;i<evs.length;i++){
          keep.students.push(...evs[i].students);
        }
        c.classes=c.classes.filter(cl=>!isEvasaoClass(cl)||cl.id===keep.id);
      }
    });
    // Segundo passo: dedup entre cursos do mesmo GRUPO
    // Para cada grupo, se houver evasões em mais de um curso, consolida no primeiro
    const groupEvasoes=new Map(); // key = getGroupKey(courseName) → {keepCourse, keepClass}
    db.courses.filter(ehCursoTecnico).forEach(c=>{
      const key=getGroupKey(c.name);
      const evasao=c.classes.find(isEvasaoClass);
      if(!evasao)return;
      if(!groupEvasoes.has(key)){
        groupEvasoes.set(key,{keepCourse:c,keepClass:evasao});
      } else {
        // Já existe uma evasão neste grupo em outro curso — migra alunos e remove
        const {keepClass}=groupEvasoes.get(key);
        keepClass.students.push(...evasao.students);
        c.classes=c.classes.filter(cl=>cl.id!==evasao.id);
      }
    });
  }
  const visible=getVisibleCourses();
  _dashGroups={};
  const groups=new Map();
  visible.forEach(c=>{const key=getGroupKey(c.name);if(!groups.has(key))groups.set(key,{base:getNomeBase(c.name),courses:[],allClasses:[]});const g=groups.get(key);g.courses.push(c);g.allClasses.push(...c.classes);});
  groups.forEach(g=>sortTurmas(g.allClasses));
  const accessibleGroups=[...groups.values()].filter(g=>groupAllowed(g.allClasses));const tc=isAdmin()?groups.size:accessibleGroups.length,tl=visible.reduce((s,c)=>s+c.classes.filter(cl=>!isEvasaoClass(cl)).length,0),ts=visible.reduce((s,c)=>s+c.classes.reduce((s2,cl)=>s2+cl.students.length,0),0);
  let ev=0;db.courses.forEach(c=>c.classes.forEach(cl=>cl.students.forEach(s=>{Object.values(s.avaliacoes||{}).forEach(yrData=>{if(typeof yrData==='object'&&yrData!==null){for(let b=1;b<=4;b++){const av=yrData[b];if(av&&(av.comp>0||av.desemp>0))ev++;}}})})));
  document.getElementById('dash-stats').innerHTML=`<div class="stat-box"><div class="stat-val">${tc}</div><div class="stat-lbl">Cursos</div></div><div class="stat-box"><div class="stat-val">${tl}</div><div class="stat-lbl">Turmas</div></div><div class="stat-box"><div class="stat-val">${ts}</div><div class="stat-lbl">Alunos</div></div><div class="stat-box"><div class="stat-val">${ev}</div><div class="stat-lbl">Avaliações</div></div>`;
  const body=document.getElementById('dash-body');
  if(!db.courses.length){body.innerHTML=`<div class="empty-st"><div class="ei">📊</div><h3>Nenhum dado importado</h3><p>${isAdmin()?'Vá em Importar para carregar alunos':'Aguarde o administrador'}</p>${isAdmin()?'<br><button class="btn-p" onclick="switchTab(\'import\')">📥 Importar agora</button>':''}</div>`;return;}
  if(!groups.size&&db.courses.length){body.innerHTML=`<div class="empty-st"><div class="ei">🔒</div><h3>Sem turmas liberadas</h3><p>Solicite permissão ao administrador.</p></div>`;return;}
  // Ordenar grupos pelo código do curso (1-9, depois 0=Alimentos, depois sem código)
  const sortedGroups=[...groups.entries()].sort((a,b)=>{
    const ca=getCourseSortKey(a[1].base);
    const cb=getCourseSortKey(b[1].base);
    return ca<cb?-1:ca>cb?1:0;
  });
  let html='<div class="dash-section-title">Cursos disponíveis</div><div class="dash-grid">';
  let gi=0;
  for(const[key,g] of sortedGroups){
    const gk='g'+(gi++);_dashGroups[gk]=g.allClasses.map(cl=>cl.id);
    const allowed=groupAllowed(g.allClasses);
    const tot=g.allClasses.filter(cl=>!isEvasaoClass(cl)).reduce((s,cl)=>s+cl.students.length,0);
    const mods=[...new Set(g.courses.map(c=>{const n=c.name.toLowerCase();return n.includes('integrado')?'Integrado':/\bsub/.test(n)?'Subsequente':n.includes('concomitante')?'Concomitante':n.includes('proeja')?'PROEJA':'';}).filter(Boolean))];
    const _ccode=getCourseCode(g.base);
    const dimStyle=allowed?'':`opacity:.35;pointer-events:none;filter:grayscale(.6);`;
    html+=`<div class="course-card" onclick="${allowed?`_openGroup('${gk}')`:''}" style="${dimStyle}background:linear-gradient(to bottom,#1a4a2e 0%,#0d2b1a 55%,#050f08 100%)">
      <div style="position:relative;display:flex;flex-direction:column;height:100%;min-height:720px">
        <div style="flex:1;display:flex;align-items:center;justify-content:center">
          <span style="font-size:clamp(4rem,8vw,9rem);font-weight:900;color:rgba(255,255,255,.13);line-height:1;user-select:none;font-family:'Sora',sans-serif;letter-spacing:-.02em">${_ccode}</span>
        </div>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:.4rem">
          <div class="cc-name">${esc(g.base)}</div>
          <div class="cc-meta">🏫 ${g.allClasses.filter(cl=>!isEvasaoClass(cl)).length} turma${g.allClasses.filter(cl=>!isEvasaoClass(cl)).length!==1?'s':''} &nbsp;·&nbsp; 👥 ${tot} aluno${tot!==1?'s':''}</div>
          <div class="cc-tags">${mods.map(m=>`<span class="cc-tag">${m}</span>`).join('')}</div>
        </div>
      </div>
    </div>`;
  }
  html+='</div>';
  body.innerHTML=html;
}

function _openGroup(key){
  const ids=_dashGroups[key]||[];if(!ids.length)return;
  const vis=[];ids.forEach(clid=>{if(!classAllowed(clid))return;const f=findClass(clid);if(f)vis.push({id:clid,name:f.clase.name,count:f.clase.students.length,courseId:f.course.id});});
  if(!vis.length){toast('Sem turmas liberadas neste curso','err');return;}
  if(vis.length===1){openClass(vis[0].id);return;}
  // Sort by class name (111-I, 211-I, 311-I...)
  vis.sort((a,b)=>{
    const isEv=cl=>cl&&(cl.evasao===true||/^EVASÃO/i.test(cl.name||''));
    const isAnon=n=>!n||/^-+$/.test((n||'').trim())||n.trim()===''||/sem\s*turma/i.test(n||'');
    const modalPrio=n=>{const s=(n||'').trim();if(/-I$/i.test(s))return 0;if(/-S$/i.test(s))return 1;if(/-C$/i.test(s))return 2;return 3;};
    if(isEv(a)&&!isEv(b))return 1;if(!isEv(a)&&isEv(b))return -1;if(isEv(a)&&isEv(b))return 0;
    if(isAnon(a.name)&&!isAnon(b.name))return 1;if(!isAnon(a.name)&&isAnon(b.name))return -1;if(isAnon(a.name)&&isAnon(b.name))return 0;
    const mp=modalPrio(a.name)-modalPrio(b.name);if(mp!==0)return mp;
    return (a.name||'').localeCompare(b.name||'',undefined,{numeric:true,sensitivity:'base'});
  });
  injectAlunosTab();
  const det=document.getElementById('aluno-detail');
  det.style.overflow='hidden auto';
  det.innerHTML='<div class="class-overview"><div class="dash-section-title">Selecione a Turma</div><div class="dash-grid">'+
    vis.map(cl=>{const co=db.courses.find(c=>c.id===cl.courseId);const n=(co?.name||'').toLowerCase();const mod=n.includes('integrado')?'Integrado':/\bsub/.test(n)?'Subsequente':n.includes('concomitante')?'Concomitante':n.includes('proeja')?'PROEJA':'';
      const _clDisplayName=/sem\s*turma/i.test(cl.name||'')?'—':cl.name;
      const isEv=cl.evasao||String(cl.name||'').toUpperCase().startsWith('EVASÃO');
      return`<div class="course-card" onclick="openClass('${cl.id}')" style="cursor:pointer;padding:1.2rem .9rem;text-align:center${isEv?';border-color:#ef9a9a;background:#fff5f5':''}">${isEv?`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:.35rem;padding:.3rem"><div style="font-size:clamp(.6rem,2vw,2.2rem);font-weight:900;letter-spacing:.02em;line-height:1;color:#c62828;text-align:center;white-space:nowrap">EVASÃO</div><div style="font-size:clamp(.75rem,1.5vw,1.1rem);font-weight:700;color:#c62828;opacity:.75;text-align:center">${esc(cl.name.replace(/^EVASÃO[-–\s]*/i,''))}</div><div style="font-size:.62rem;color:#c62828;font-weight:600;margin-top:.1rem">🚪 ${cl.count} aluno${cl.count!==1?'s':''}</div></div>`:`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:.35rem;text-align:center"><div class="cc-name" style="font-size:clamp(.9rem,2.2vw,2.6rem);font-weight:900;letter-spacing:.02em;line-height:1;text-align:center;word-break:break-word">${esc(_clDisplayName)}</div>${mod?`<div class="cc-meta">${mod}</div>`:''}<div class="cc-meta">${cl.count} aluno${cl.count!==1?'s':''}</div></div>`}</div>`;
    }).join('')+'</div></div>';
  // Adicionar professores abaixo dos cards
  const _allCls=ids.map(id=>findClass(id)?.clase).filter(Boolean);
  const _profs=_getProfsByCourse(_allCls);
  if(_profs.length){
    const _pid='pd'+Date.now();
    window['_pd'+_pid]=_profs;
    const profHtml='<div style="margin-top:1.2rem"><div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--g3);margin-bottom:.5rem;display:flex;align-items:center;gap:.5rem">'+
      '<span>👨‍🏫 Professores</span>'+
      '<span style="flex:1;height:1px;background:var(--g5)"></span>'+
      '<button onclick="_copyProfTable(\'_pd'+_pid+'\')" style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;padding:.2rem .5rem;cursor:pointer;font-size:.68rem;color:#2e7d32;font-weight:600">📋 Copiar</button>'+
      '<button onclick="_printProfTable(\'_pd'+_pid+'\')" style="background:#e3f2fd;border:1px solid #90caf9;border-radius:6px;padding:.2rem .5rem;cursor:pointer;font-size:.68rem;color:#1565c0;font-weight:600">🖨️ PDF</button>'+
      '</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.3rem">'+
      _profs.map(p=>'<div style="display:flex;align-items:center;gap:.5rem;padding:.3rem .5rem;background:#f8fdf9;border:1px solid #c8e6c9;border-radius:7px"><span style="font-family:\'IBM Plex Mono\',monospace;font-size:.62rem;color:var(--g3);flex-shrink:0">'+esc(p.matricula||'—')+'</span><span style="font-size:.7rem;font-weight:600;color:var(--dk)">'+esc(p.nomeCompleto||p.abrev)+'</span></div>').join('')+
    '</div></div>';
    det.querySelector('.class-overview').insertAdjacentHTML('beforeend',profHtml);
  }
  document.getElementById('alunos-scroll').innerHTML='';
  document.getElementById('nav-pos').textContent='— / —';
  document.getElementById('btn-back-to-class').style.display='none';
  const _bbc=document.getElementById('btn-back-to-courses');if(_bbc)_bbc.style.display='block';
  const _lb2=document.getElementById('_lockBtn');if(_lb2)_lb2.style.display='none';
  // Mostrar sidebar de cursos e ocultar busca
  _renderSidebarCursos();
  {const _sc=document.getElementById('sidebar-cursos');if(_sc)_sc.style.display='flex';}
  {const _snb=document.querySelector('.student-nav-bar');if(_snb)_snb.style.display='none';}
  // Ocultar class-nav-bar (setas de turma)
  {const _cnb=document.getElementById('class-nav-bar');if(_cnb)_cnb.style.display='none';}
  // Limpar activeClassId para que o título não fique com o nome anterior
  activeClassId=null;activeStudentId=null;
  // Don't call switchTab here — already on alunos, would re-render and wipe content
  const tabAlunos=document.getElementById('tab-alunos');
  if(tabAlunos&&!tabAlunos.classList.contains('active')){switchTab('alunos');}
}

