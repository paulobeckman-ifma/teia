// ══════════════════ KEYBOARD NAV ══════════════════
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
  if(curView==='alunos'){if(e.key==='ArrowLeft')navigateStudent(-1);if(e.key==='ArrowRight')navigateStudent(1);}
});

// Startup — detecta servidor (mas NÃO faz pullFromServer aqui).
// Antes esta função tentava puxar tudo antes do login, mas os endpoints
// autenticados exigem sessão — então 401 era certo e gerava 4-5 requests
// inúteis a cada carregamento. O pull real acontece dentro de doLogin().
document.addEventListener('DOMContentLoaded', async () => {
  const userInput = document.getElementById('li-user');
  try { await detectarServidor(); } catch(e){ /* offline */ }
  if(userInput) userInput.focus();
});
// Mantém o título da aba como "TeIA"
document.querySelector('title').textContent='TeIA';


// ── LUPA POPUP ──
let _lupaGridId=null,_lupaTipo=null,_lupaItems=null;
function openLupa(gridId,tipo,items,title){
  if(_classLocked){toast('Desbloqueie a edição primeiro 🔒','err');return;}
  _lupaGridId=gridId;_lupaTipo=tipo;_lupaItems=items;
  document.getElementById('lupa-title').textContent=title;
  const container=document.getElementById('lupa-items');
  container.innerHTML='';
  const grid=document.getElementById(gridId);
  const checks=grid?[...grid.querySelectorAll('input[type=checkbox]')]:[];
  items.forEach((item,i)=>{
    const checked=checks[i]?.checked||false;
    const cls=checked?(tipo==='pos'?'lupa-sel-pos':'lupa-sel-neg'):'';
    const div=document.createElement('div');
    div.className='lupa-item '+cls;
    div.dataset.idx=i;
    div.innerHTML=`<input type="checkbox" ${checked?'checked':''}><span>${item}</span>`;
    div.addEventListener('click',function(){
      const cb=this.querySelector('input');
      cb.checked=!cb.checked;
      this.className='lupa-item '+(cb.checked?(tipo==='pos'?'lupa-sel-pos':'lupa-sel-neg'):'');
      // Sincronizar com checkbox original
      if(checks[i])checks[i].checked=cb.checked;
      autoSaveDebounced();
    });
    container.appendChild(div);
  });
  const ov=document.getElementById('lupa-overlay');
  ov.style.display='flex';
  ov.style.animation='fadeIn .2s';
}
function closeLupa(){
  document.getElementById('lupa-overlay').style.display='none';
  _lupaGridId=null;
}
// Sincronizar popup → página: quando checkbox da página muda, atualizar popup se estiver aberto
document.addEventListener('change',function(e){
  if(!_lupaGridId||!e.target.matches('#'+_lupaGridId+' input[type=checkbox]'))return;
  const grid=document.getElementById(_lupaGridId);
  const checks=[...grid.querySelectorAll('input[type=checkbox]')];
  const idx=checks.indexOf(e.target);
  if(idx<0)return;
  const lupaItems=[...document.querySelectorAll('#lupa-items .lupa-item')];
  const div=lupaItems[idx];if(!div)return;
  const cb=div.querySelector('input');
  if(cb)cb.checked=e.target.checked;
  div.className='lupa-item '+(e.target.checked?(_lupaTipo==='pos'?'lupa-sel-pos':'lupa-sel-neg'):'');
});


// ── LUPA DISCIPLINAS COM DIFICULDADES ──
function openLupaDisc(){
  if(_classLocked){toast('Desbloqueie a edição primeiro 🔒','err');return;}
  const s=findStudentById(activeStudentId);if(!s)return;
  const _yr=activeYear||(new Date().getFullYear());
  const av=getAvYear(s,_yr,activeBim)||{};
  const discSaved=[...(av.disciplinas||[])];
  const discObsSaved={...(av.disciplinasObs||{})};
  const cl=findClass(activeClassId);
  const schedDiscs=(db.schedules&&cl?.clase?.name&&db.schedules[cl.clase.name])||[];
  const classDiscs=[...new Set([...schedDiscs.map(d=>d.disc),...(cl?.clase?.teachers||[]).map(t=>t.disc||'')])].filter(Boolean);
  // Inclui também as disciplinas externas já salvas para este aluno (texto livre)
  const classSet=new Set(classDiscs);
  const externasSalvas=discSaved.filter(d=>d!=='__todas__'&&!classSet.has(d));
  const allDiscs=[...classDiscs,...externasSalvas];

  document.getElementById('lupa-title').innerHTML='📚 Disciplinas com Dificuldades';
  const container=document.getElementById('lupa-items');
  container.innerHTML='';
  container.style.gridTemplateColumns='1fr';

  // ── Campo para adicionar disciplina externa (texto livre) ──
  const addExt=document.createElement('div');
  addExt.style.cssText='display:flex;gap:.35rem;margin-bottom:.5rem;padding:.55rem .7rem;background:#f5f9ff;border:1.5px dashed #90caf9;border-radius:10px;align-items:center;flex-wrap:wrap';
  addExt.innerHTML=
    '<div style="flex:1 1 100%;font-size:.7rem;font-weight:700;color:#1565c0;display:flex;align-items:center;gap:.35rem;margin-bottom:.1rem"><span>➕ Disciplina externa</span><span style="font-weight:500;color:#555;font-size:.65rem">(ex.: reprovada em outra turma)</span></div>'+
    '<input id="lupa-disc-ext-input" type="text" placeholder="Nome da disciplina" style="flex:1;min-width:140px;font-family:Sora,sans-serif;font-size:.85rem;border:1.5px solid #90caf9;border-radius:7px;padding:.4rem .55rem;background:#fff">'+
    '<button id="lupa-disc-ext-btn" style="background:#1565c0;color:#fff;border:none;border-radius:7px;padding:.4rem .9rem;font-weight:700;font-size:.8rem;cursor:pointer">Adicionar</button>';
  const addBtn=addExt.querySelector('#lupa-disc-ext-btn');
  const addInp=addExt.querySelector('#lupa-disc-ext-input');
  function addExternal(){
    const v=addInp.value.trim();if(!v)return;
    const _s=findStudentById(activeStudentId);if(!_s)return;
    const _curAv=getAvYear(_s,_yr,activeBim)||{};
    const _curDiscs=[...(_curAv.disciplinas||[])];
    const already=_curDiscs.some(d=>d.toLowerCase()===v.toLowerCase());
    if(already){toast('Disciplina já listada','');addInp.value='';return;}
    if(v==='__todas__'){addInp.value='';return;}
    // Se "Todas" estava marcada, desmarca para que a individual passe a valer
    const filtered=_curDiscs.filter(d=>d!=='__todas__');
    filtered.push(v);
    setAvYear(_s,_yr,activeBim,{..._curAv,disciplinas:filtered});
    saveDB();
    toast('✅ Disciplina adicionada','ok');
    addInp.value='';
    openLupaDisc(); // reabre com a disciplina nova já marcada
  }
  addBtn.addEventListener('click',addExternal);
  addInp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addExternal();}});
  container.appendChild(addExt);

  // ── "Todas" como opção exclusiva ──
  const TODAS_KEY='__todas__';
  const todasChecked=discSaved.includes(TODAS_KEY);

  function setIndividuaisEnabled(enabled){
    container.querySelectorAll('.disc-individual-wrap').forEach(w=>{
      w.style.opacity=enabled?'1':'0.35';
      w.style.pointerEvents=enabled?'':'none';
    });
  }

  const todasWrap=document.createElement('div');
  todasWrap.style.cssText='border:2px solid '+(todasChecked?'#c62828':'#ddd')+';border-radius:10px;padding:.55rem .75rem;background:'+(todasChecked?'#fff5f5':'#fafafa')+';transition:all .18s;margin-bottom:.3rem';
  const todasRow=document.createElement('div');
  todasRow.style.cssText='display:flex;align-items:center;gap:.6rem;cursor:pointer;user-select:none';
  const todasCb=document.createElement('input');
  todasCb.type='checkbox';todasCb.id='disc-todas-cb';todasCb.checked=todasChecked;
  todasCb.style.cssText='width:17px;height:17px;accent-color:#c62828;flex-shrink:0;cursor:pointer';
  const todasLbl=document.createElement('span');
  todasLbl.style.cssText='font-size:.95rem;font-weight:800;color:#c62828';
  todasLbl.textContent='Todas as disciplinas';
  function applyTodas(sel){
    todasCb.checked=sel;
    todasWrap.style.border='2px solid '+(sel?'#c62828':'#ddd');
    todasWrap.style.background=sel?'#fff5f5':'#fafafa';
    setIndividuaisEnabled(!sel);
    _saveLupaDisc();
  }
  todasRow.addEventListener('click',()=>applyTodas(!todasCb.checked));
  todasCb.addEventListener('click',e=>{e.stopPropagation();applyTodas(todasCb.checked);});
  todasRow.appendChild(todasCb);todasRow.appendChild(todasLbl);
  todasWrap.appendChild(todasRow);
  container.appendChild(todasWrap);

  const sep=document.createElement('div');
  sep.style.cssText='border-top:1px solid #e0e0e0;margin:.1rem 0 .35rem';
  container.appendChild(sep);

  if(!allDiscs.length){
    const empty=document.createElement('div');
    empty.style.cssText='padding:.8rem;text-align:center;color:var(--g3);font-size:.78rem;background:#fafafa;border-radius:8px;border:1px dashed #ddd;margin-top:.2rem';
    empty.innerHTML='📭 Nenhuma disciplina cadastrada ainda.<br><span style="font-size:.7rem">Use o campo azul acima para adicionar uma disciplina externa.</span>';
    container.appendChild(empty);
    document.getElementById('lupa-overlay').style.display='flex';
    return;
  }

  allDiscs.forEach(disc=>{
    const checked=discSaved.includes(disc);
    const obsVal=discObsSaved[disc]||'';
    const isExtra=!classSet.has(disc);
    const wrap=document.createElement('div');
    wrap.className='disc-individual-wrap';
    wrap.style.cssText='border:2px solid '+(checked?'#c62828':'#ddd')+';border-radius:10px;padding:.55rem .75rem;background:'+(checked?'#fff5f5':'#fafafa')+';transition:all .18s'+(todasChecked?';opacity:0.35;pointer-events:none':'');
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:.6rem;cursor:pointer;user-select:none';
    const cb=document.createElement('input');
    cb.type='checkbox';cb.checked=checked;
    cb.style.cssText='width:17px;height:17px;accent-color:#c62828;flex-shrink:0;cursor:pointer';
    const lbl=document.createElement('span');
    lbl.style.cssText='font-size:.95rem;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis';
    lbl.textContent=disc;
    row.appendChild(cb);row.appendChild(lbl);
    if(isExtra){
      const badge=document.createElement('span');
      badge.style.cssText='font-size:.6rem;font-weight:700;padding:.15rem .5rem;border-radius:10px;background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;flex-shrink:0;letter-spacing:.02em';
      badge.textContent='🔀 externa';
      badge.title='Disciplina não listada nos professores/horário desta turma';
      row.appendChild(badge);
      // Botão de excluir — só faz sentido para externas (da turma, basta desmarcar)
      const delBtn=document.createElement('button');
      delBtn.type='button';
      delBtn.textContent='✕';
      delBtn.title='Excluir esta disciplina externa';
      delBtn.style.cssText='background:none;border:1px solid #ef9a9a;color:#c62828;border-radius:6px;width:22px;height:22px;cursor:pointer;flex-shrink:0;font-weight:700;line-height:1;padding:0';
      delBtn.addEventListener('click',ev=>{
        ev.stopPropagation();
        confirmAction('🗑 Excluir disciplina',`Remover a disciplina externa "${disc}"? A observação associada também será apagada.`,()=>{
          const _s=findStudentById(activeStudentId);if(!_s)return;
          const _curAv=getAvYear(_s,_yr,activeBim)||{};
          const _nd=(_curAv.disciplinas||[]).filter(d=>d!==disc);
          const _no={...(_curAv.disciplinasObs||{})};delete _no[disc];
          setAvYear(_s,_yr,activeBim,{..._curAv,disciplinas:_nd,disciplinasObs:_no});
          saveDB();openLupaDisc();
        });
      });
      row.appendChild(delBtn);
    }
    const ta=document.createElement('textarea');
    ta.placeholder='Observação sobre esta disciplina...';
    ta.value=obsVal;
    ta.style.cssText='width:100%;margin-top:.4rem;font-family:Sora,sans-serif;font-size:.82rem;border:1.5px solid #ddd;border-radius:7px;padding:.4rem .55rem;resize:vertical;min-height:54px;box-sizing:border-box;line-height:1.4;display:'+(checked?'block':'none');
    ta.dataset.disc=disc;
    ta.addEventListener('click',e=>e.stopPropagation());
    ta.addEventListener('input',()=>_saveLupaDisc());
    function toggle(){
      cb.checked=!cb.checked;
      const sel=cb.checked;
      wrap.style.border='2px solid '+(sel?'#c62828':'#ddd');
      wrap.style.background=sel?'#fff5f5':'#fafafa';
      ta.style.display=sel?'block':'none';
      _saveLupaDisc();
    }
    row.addEventListener('click',toggle);
    cb.addEventListener('click',e=>{e.stopPropagation();const sel=cb.checked;wrap.style.border='2px solid '+(sel?'#c62828':'#ddd');wrap.style.background=sel?'#fff5f5':'#fafafa';ta.style.display=sel?'block':'none';_saveLupaDisc();});
    wrap.appendChild(row);wrap.appendChild(ta);
    container.appendChild(wrap);
  });
  document.getElementById('lupa-overlay').style.display='flex';
}

function _saveLupaDisc(){
  const s=findStudentById(activeStudentId);if(!s)return;
  const _yr=activeYear||(new Date().getFullYear());
  const av=getAvYear(s,_yr,activeBim)||{};
  const container=document.getElementById('lupa-items');if(!container)return;

  // ═══════════════════════════════════════════════════════════════════════
  // SAFETY: se o container da lupa está vazio ou sem textareas, NÃO salvar.
  // Isso impede que um chamada tardia (lupa já fechada, ou DOM reciclado)
  // apague silenciosamente todas as disciplinas do aluno. Só salva quando
  // temos certeza de que o DOM reflete o estado real da lupa aberta.
  // ═══════════════════════════════════════════════════════════════════════
  const overlay=document.getElementById('lupa-overlay');
  const lupaAberta = overlay && overlay.style.display!=='none';
  const todasCb=document.getElementById('disc-todas-cb');
  const textareas=container.querySelectorAll('textarea[data-disc]');
  if(!lupaAberta || !todasCb){
    // Lupa não está aberta — não confie no DOM.
    return;
  }
  // Se "Todas" não está marcada E não há textareas, o DOM está incompleto.
  // Pode acontecer se a lupa acabou de ser aberta mas ainda não foi
  // populada, ou se o container foi limpo pelo `openLupaDisc` antes do
  // repopulate concluir. Nesses casos, não salvar.
  if(!todasCb.checked && textareas.length===0){
    console.warn('_saveLupaDisc: DOM sem textareas e "Todas" não marcada — abortando save para preservar dados');
    return;
  }

  let newDiscs=[],newObs={};
  if(todasCb.checked){
    // Exclusivo: só salva "Todas", ignora individuais
    newDiscs=['__todas__'];
  } else {
    textareas.forEach(ta=>{
      const disc=ta.dataset.disc;
      const wrap=ta.parentElement;
      const cb=wrap?.querySelector('input[type=checkbox]');
      if(cb?.checked){newDiscs.push(disc);if(ta.value.trim())newObs[disc]=ta.value.trim();}
    });
  }
  setAvYear(s,_yr,activeBim,{...av,disciplinas:newDiscs,disciplinasObs:newObs});
  saveDB();
  _updateDiscList(newDiscs,newObs);
}

function _updateDiscList(discs,obsMap){
  const container=document.querySelector('#obs-disc-row .ev-card:last-child > div[style*="flex-direction:column"]');
  if(!container)return;
  const visDiscs=(discs||[]).filter(d=>d!=='__todas__');
  const temTodas=(discs||[]).includes('__todas__');
  if(!temTodas&&!visDiscs.length){
    container.innerHTML='<span style="font-size:.68rem;color:var(--g3)">Nenhuma disciplina marcada</span>';
    return;
  }
  let html='';
  if(temTodas)html+=`<div style="display:flex;flex-direction:column;gap:.08rem;background:#fff5f5;border-radius:6px;padding:.3rem .5rem;border-left:3px solid #c62828">
    <span style="font-size:.68rem;font-weight:700;color:#c62828">📌 Todas as disciplinas</span>
  </div>`;
  html+=visDiscs.map(d=>{
    const obs=(obsMap||{})[d]||'';
    return`<div style="display:flex;flex-direction:column;gap:.08rem;background:#e8f5e9;border-radius:6px;padding:.3rem .5rem;border-left:3px solid var(--green)">
      <span style="font-size:.68rem;font-weight:700;color:var(--green)">📌 ${esc(d)}</span>
      ${obs?`<span style="font-size:.6rem;color:var(--g2);font-style:italic">${esc(obs)}</span>`:''}
    </div>`;
  }).join('');
  container.innerHTML=html;
}

// ── LUPA OBSERVAÇÕES (bimestre ativo) ──
function openLupaObs(){
  if(_classLocked){toast('Desbloqueie a edição primeiro 🔒','err');return;}
  const s=findStudentById(activeStudentId);if(!s)return;
  const _yr=activeYear||(new Date().getFullYear());
  const av=getAvYear(s,_yr,activeBim)||{};
  const obsAtual=av.obs||'';

  document.getElementById('lupa-title').innerHTML=
    `✏️ Observação — ${activeBim}º Bimestre <span style="font-size:.75rem;font-weight:500;color:var(--g3)">· ${findStudentById(activeStudentId)?.nome||''}</span>`;
  const container=document.getElementById('lupa-items');
  container.style.gridTemplateColumns='1fr';
  container.innerHTML=`<textarea id="lupa-obs-area" placeholder="Digite a observação deste bimestre...">${obsAtual.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>`;

  // Sincronizar em tempo real com o campo da página
  setTimeout(()=>{
    const ta=document.getElementById('lupa-obs-area');
    if(!ta)return;
    ta.focus();
    ta.addEventListener('input',function(){
      const inp=document.getElementById('obs-bim-'+activeBim);
      if(inp){inp.value=this.value;autoSaveDebounced();}
    });
  },50);

  document.getElementById('lupa-overlay').style.display='flex';
}

// ── LUPA ENCAMINHAMENTOS ──
function openLupaEncam(){
  if(_classLocked){toast('Desbloqueie a edição primeiro 🔒','err');return;}
  const s=findStudentById(activeStudentId);if(!s)return;
  const _yr=activeYear||(new Date().getFullYear());
  const av=getAvYear(s,_yr,activeBim)||{};
  const encSaved=[...(av.encaminhamentos||[])];
  const encObsSaved={...(av.encaminhamentosObs||{})};

  document.getElementById('lupa-title').innerHTML='📋 Encaminhamentos';
  const container=document.getElementById('lupa-items');
  container.innerHTML='';
  container.style.gridTemplateColumns='1fr';

  const allEnc=[...ENCAMINHAMENTOS,'Outro'];
  allEnc.forEach(enc=>{
    const checked=enc==='Outro'?encSaved.includes(ENCAM_OUTRO_KEY):encSaved.includes(enc);
    const obsVal=enc==='Outro'?(av.encaminhamentosOutro||''):(encObsSaved[enc]||'');

    const wrap=document.createElement('div');
    wrap.style.cssText='border:2px solid '+(checked?'#1565c0':'#ddd')+';border-radius:10px;padding:.55rem .75rem;background:'+(checked?'#e3f2fd':'#fafafa')+';transition:all .18s';

    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:.6rem;cursor:pointer;user-select:none';

    const cb=document.createElement('input');
    cb.type='checkbox';
    cb.checked=checked;
    cb.style.cssText='width:17px;height:17px;accent-color:#1565c0;flex-shrink:0;cursor:pointer';

    const lbl=document.createElement('span');
    lbl.style.cssText='font-size:.95rem;font-weight:700';
    lbl.textContent=enc;

    const ta=document.createElement('textarea');
    ta.placeholder=enc==='Outro'?'Descreva o encaminhamento...':'Observação sobre este encaminhamento...';
    ta.value=obsVal;
    ta.style.cssText='width:100%;margin-top:.4rem;font-family:Sora,sans-serif;font-size:.82rem;border:1.5px solid #ddd;border-radius:7px;padding:.4rem .55rem;resize:vertical;min-height:54px;box-sizing:border-box;line-height:1.4;display:'+(checked?'block':'none');
    ta.dataset.enc=enc;
    ta.addEventListener('click',e=>e.stopPropagation());
    ta.addEventListener('input',()=>_saveLupaEncam());

    function toggle(){
      cb.checked=!cb.checked;
      const sel=cb.checked;
      wrap.style.border='2px solid '+(sel?'#1565c0':'#ddd');
      wrap.style.background=sel?'#e3f2fd':'#fafafa';
      ta.style.display=sel?'block':'none';
      _saveLupaEncam();
    }
    row.addEventListener('click',toggle);
    cb.addEventListener('click',e=>{e.stopPropagation();const sel=cb.checked;wrap.style.border='2px solid '+(sel?'#1565c0':'#ddd');wrap.style.background=sel?'#e3f2fd':'#fafafa';ta.style.display=sel?'block':'none';_saveLupaEncam();});

    row.appendChild(cb);
    row.appendChild(lbl);
    wrap.appendChild(row);
    wrap.appendChild(ta);
    container.appendChild(wrap);
  });

  document.getElementById('lupa-overlay').style.display='flex';
}

function _saveLupaEncam(){
  const s=findStudentById(activeStudentId);if(!s)return;
  const _yr=activeYear||(new Date().getFullYear());
  const av=getAvYear(s,_yr,activeBim)||{};
  const container=document.getElementById('lupa-items');if(!container)return;
  const newEnc=[],newObs={};
  let outroTxt='';
  container.querySelectorAll('textarea[data-enc]').forEach(ta=>{
    const enc=ta.dataset.enc;
    const wrap=ta.parentElement;
    const cb=wrap?.querySelector('input[type=checkbox]');
    if(cb?.checked){
      if(enc==='Outro'){newEnc.push(ENCAM_OUTRO_KEY);outroTxt=ta.value.trim();}
      else{newEnc.push(enc);if(ta.value.trim())newObs[enc]=ta.value.trim();}
    }
  });
  setAvYear(s,_yr,activeBim,{...av,encaminhamentos:newEnc,encaminhamentosObs:newObs,encaminhamentosOutro:outroTxt});
  saveDB();
  const _reloadS=findStudentById(activeStudentId);
  if(_reloadS)loadBimData(_reloadS,activeBim);
}

function _renderSidebarCursos(){
  const el=document.getElementById('sidebar-cursos');if(!el)return;

  // Agrupar por getCourseCode para evitar duplicatas
  const byCode=new Map();
  getVisibleCourses().forEach(c=>{
    const base=getNomeBase(c.name);
    const code=getCourseCode(base);
    if(!byCode.has(code))byCode.set(code,{base,courses:[],allClasses:[]});
    const g=byCode.get(code);g.courses.push(c);g.allClasses.push(...c.classes);
  });

  // Ordena pela mesma chave usada na tela inicial (Alimentos por último — depois
  // de Administração — em vez de aparecer primeiro por causa do código '0').
  const sorted=[...byCode.entries()].sort((a,b)=>{
    const ka=getCourseSortKey(a[1].base);
    const kb=getCourseSortKey(b[1].base);
    return ka.localeCompare(kb);
  });

  const abbrev=n=>{
    const s=(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(/adm/.test(s))return'Administração';
    if(/aliment/.test(s))return'Alimentos';
    if(/edif/.test(s))return'Edificações';
    if(/eletrom/.test(s)||(/eletr/.test(s)&&/mec/.test(s)))return'Eletromecânica';
    if(/eletrot/.test(s)||/eletro.*t/.test(s))return'Eletrotécnica';
    if(/autom/.test(s))return'Automação';
    if(/meio|ambient/.test(s))return'Meio Ambiente';
    if(/quim/.test(s))return'Química';
    if(/inform/.test(s)||/comput/.test(s))return'Informática';
    if(/segur/.test(s))return'Seg. Trabalho';
    return n;
  };

  el.style.display='flex';
  el.style.flexDirection='column';
  el.style.gap='.25rem';
  el.style.padding='.4rem .35rem';
  el.style.overflow='hidden';

  el.innerHTML=sorted.map(([code,g])=>{
    const allowed=isAdmin()||groupAllowed(g.allClasses);
    const opacity=allowed?'1':'.45';
    const cursor=allowed?'pointer':'default';
    const bg=allowed?'var(--green)':'#6b7280';
    const border=allowed?'1px solid rgba(255,255,255,.25)':'1px solid rgba(255,255,255,.08)';
    return `<div onclick="${allowed?`_jumpToCourse('${g.base}')`:''}" 
      style="flex:1;display:flex;align-items:center;gap:.4rem;padding:.3rem .5rem;
             border-radius:7px;cursor:${cursor};background:${bg};border:${border};
             opacity:${opacity};min-height:0;transition:filter .15s;overflow:hidden"
      ${allowed?`onmouseover="this.style.filter='brightness(1.15)'" onmouseout="this.style.filter=''"`:''}>
      <span style="font-size:.85rem;font-weight:900;color:rgba(255,255,255,.55);flex-shrink:0;width:14px;text-align:center">${code}</span>
      <span style="font-size:.67rem;font-weight:700;color:#fff;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${abbrev(g.base)}</span>
    </div>`;
  }).join('');
}

function _jumpToCourse(baseName){
  // Encontrar o grupo e abrir a seleção de turmas desse curso
  const courses=getVisibleCourses().filter(c=>getNomeBase(c.name)===baseName);
  if(!courses.length)return;
  const allClasses=courses.flatMap(c=>c.classes);
  if(allClasses.length===1){openClass(allClasses[0].id);return;}
  // Simular openGroup — abrir a seleção de turmas
  const firstClass=allClasses[0];
  if(firstClass){
    // Encontrar a chave do grupo no dashboard
    const gk=Object.keys(_dashGroups).find(k=>{
      return _dashGroups[k]&&allClasses.some(cl=>_dashGroups[k].includes(cl.id));
    });
    if(gk){_openGroup(gk);}
    else{
      // Fallback: abrir primeira turma
      openClass(firstClass.id);
    }
  }
}


// ── LUPA COMPORTAMENTO (positivos + negativos juntos) ──
function openLupaComp(){
  if(_classLocked){toast('Desbloqueie a edição primeiro 🔒','err');return;}
  const s=findStudentById(activeStudentId);if(!s)return;
  const _yr=activeYear||(new Date().getFullYear());
  const av=getAvYear(s,_yr,activeBim)||{};
  const posSaved=av.compPos||[];
  const negSaved=av.compIssues||[];

  document.getElementById('lupa-title').innerHTML='😊 Comportamento — Aspectos';
  const container=document.getElementById('lupa-items');
  container.innerHTML='';
  container.style.gridTemplateColumns='1fr 1fr 1fr';

  // Seção positivos
  const posHdr=document.createElement('div');
  posHdr.style.cssText='grid-column:1/-1;font-size:.75rem;font-weight:800;color:#2e7d32;text-transform:uppercase;letter-spacing:.06em;padding:.2rem 0;border-bottom:2px solid #2e7d32;margin-bottom:.2rem';
  posHdr.textContent='✅ Aspectos Positivos';
  container.appendChild(posHdr);

  COMP_POS.forEach((item,i)=>{
    const checked=posSaved.includes(item);
    const div=document.createElement('div');
    div.className='lupa-item '+(checked?'lupa-sel-pos':'');
    div.innerHTML=`<input type="checkbox" ${checked?'checked':''}><span>${item}</span>`;
    div.querySelector('input').style.accentColor='#2e7d32';
    div.addEventListener('click',function(){
      const cb=this.querySelector('input');cb.checked=!cb.checked;
      this.className='lupa-item '+(cb.checked?'lupa-sel-pos':'');
      const pgCb=document.querySelectorAll('#comp-pos-grid input')[i];
      if(pgCb){pgCb.checked=cb.checked;autoSaveDebounced();}
    });
    container.appendChild(div);
  });

  // Seção negativos
  const negHdr=document.createElement('div');
  negHdr.style.cssText='grid-column:1/-1;font-size:.75rem;font-weight:800;color:#c62828;text-transform:uppercase;letter-spacing:.06em;padding:.2rem 0;border-bottom:2px solid #c62828;margin:.6rem 0 .2rem';
  negHdr.textContent='⚠️ Aspectos Negativos';
  container.appendChild(negHdr);

  COMP_ISSUES.forEach((item,i)=>{
    const checked=negSaved.includes(item);
    const div=document.createElement('div');
    div.className='lupa-item '+(checked?'lupa-sel-neg':'');
    div.innerHTML=`<input type="checkbox" ${checked?'checked':''}><span>${item}</span>`;
    div.addEventListener('click',function(){
      const cb=this.querySelector('input');cb.checked=!cb.checked;
      this.className='lupa-item '+(cb.checked?'lupa-sel-neg':'');
      const pgCb=document.querySelectorAll('#comp-issues-grid input')[i];
      if(pgCb){pgCb.checked=cb.checked;autoSaveDebounced();}
    });
    container.appendChild(div);
  });

  document.getElementById('lupa-overlay').style.display='flex';
}

// ── LUPA DESEMPENHO (positivos + negativos juntos) ──
function openLupaDesemp(){
  if(_classLocked){toast('Desbloqueie a edição primeiro 🔒','err');return;}
  const s=findStudentById(activeStudentId);if(!s)return;
  const _yr=activeYear||(new Date().getFullYear());
  const av=getAvYear(s,_yr,activeBim)||{};
  const posSaved=av.despPos||[];
  const negSaved=av.despIssues||[];

  document.getElementById('lupa-title').innerHTML='📚 Desempenho — Aspectos';
  const container=document.getElementById('lupa-items');
  container.innerHTML='';
  container.style.gridTemplateColumns='1fr 1fr 1fr';

  const posHdr=document.createElement('div');
  posHdr.style.cssText='grid-column:1/-1;font-size:.75rem;font-weight:800;color:#2e7d32;text-transform:uppercase;letter-spacing:.06em;padding:.2rem 0;border-bottom:2px solid #2e7d32;margin-bottom:.2rem';
  posHdr.textContent='✅ Aspectos Positivos';
  container.appendChild(posHdr);

  DESEMP_POS.forEach((item,i)=>{
    const checked=posSaved.includes(item);
    const div=document.createElement('div');
    div.className='lupa-item '+(checked?'lupa-sel-pos':'');
    div.innerHTML=`<input type="checkbox" ${checked?'checked':''}><span>${item}</span>`;
    div.querySelector('input').style.accentColor='#2e7d32';
    div.addEventListener('click',function(){
      const cb=this.querySelector('input');cb.checked=!cb.checked;
      this.className='lupa-item '+(cb.checked?'lupa-sel-pos':'');
      const pgCb=document.querySelectorAll('#desemp-pos-grid input')[i];
      if(pgCb){pgCb.checked=cb.checked;autoSaveDebounced();}
    });
    container.appendChild(div);
  });

  const negHdr=document.createElement('div');
  negHdr.style.cssText='grid-column:1/-1;font-size:.75rem;font-weight:800;color:#c62828;text-transform:uppercase;letter-spacing:.06em;padding:.2rem 0;border-bottom:2px solid #c62828;margin:.6rem 0 .2rem';
  negHdr.textContent='⚠️ Aspectos Negativos';
  container.appendChild(negHdr);

  DESEMP_ISSUES.forEach((item,i)=>{
    const checked=negSaved.includes(item);
    const div=document.createElement('div');
    div.className='lupa-item '+(checked?'lupa-sel-neg':'');
    div.innerHTML=`<input type="checkbox" ${checked?'checked':''}><span>${item}</span>`;
    div.addEventListener('click',function(){
      const cb=this.querySelector('input');cb.checked=!cb.checked;
      this.className='lupa-item '+(cb.checked?'lupa-sel-neg':'');
      const pgCb=document.querySelectorAll('#desemp-issues-grid input')[i];
      if(pgCb){pgCb.checked=cb.checked;autoSaveDebounced();}
    });
    container.appendChild(div);
  });

  document.getElementById('lupa-overlay').style.display='flex';
}


// ── MÓDULO PROFESSORES (Admin) ──
function _getProfList(){
  if(!db.professors||!db.professors.length){
    db.professors=defaultDB().professors||[];
    saveDB();
  }
  return db.professors;
}

function renderProfAdmin(){
  const el=document.getElementById('prof-admin-list');if(!el)return;
  const profs=_getProfList().slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
  if(!profs.length){
    el.innerHTML='<div style="font-size:.72rem;color:var(--g3);padding:.3rem">Nenhum professor cadastrado.</div>';
    return;
  }
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 2fr 1fr auto auto;gap:.35rem;padding:.2rem .4rem;font-size:.6rem;font-weight:700;color:var(--g3);text-transform:uppercase;letter-spacing:.05em">
      <span>Abreviado</span><span>Nome Completo</span><span>Matrícula</span><span></span><span></span>
    </div>`+
  profs.map((p)=>{
    const i=db.professors.indexOf(p);
    return`<div style="display:grid;grid-template-columns:1fr 2fr 1fr auto auto;gap:.35rem;align-items:center;background:#fff;border:1px solid var(--g5);border-radius:7px;padding:.3rem .5rem">
      <span style="font-size:.72rem;font-weight:800;text-transform:uppercase">${esc(p.nome||'')}</span>
      <span style="font-size:.7rem;color:var(--g2)">${esc(p.nomeCompleto||'—')}</span>
      <span style="font-size:.68rem;font-family:'IBM Plex Mono',monospace;color:var(--g3)">${esc(p.matricula||'—')}</span>
      <button onclick="openProfModal(${i})" style="background:none;border:1px solid var(--g5);border-radius:5px;padding:.18rem .38rem;cursor:pointer;font-size:.72rem" title="Editar">✏️</button>
      <button onclick="deleteProfAdmin(${i})" style="background:none;border:1px solid #ef9a9a;border-radius:5px;padding:.18rem .38rem;cursor:pointer;font-size:.72rem;color:#c62828" title="Excluir">🗑</button>
    </div>`;
  }).join('');
}

function openProfModal(idx){
  const modal=document.getElementById('prof-modal');
  const p=idx!=null?db.professors[idx]:null;
  document.getElementById('prof-modal-title').textContent=p?'✏️ Editar Professor':'➕ Novo Professor';
  document.getElementById('prof-modal-abrev').value=p?.nome||'';
  document.getElementById('prof-modal-nome').value=p?.nomeCompleto||'';
  document.getElementById('prof-modal-mat').value=p?.matricula||'';
  document.getElementById('prof-modal-idx').value=idx!=null?idx:'';
  modal.style.display='flex';
  setTimeout(()=>document.getElementById('prof-modal-abrev').focus(),50);
}

function closeProfModal(){
  document.getElementById('prof-modal').style.display='none';
}

function saveProfModal(){
  const abrev=document.getElementById('prof-modal-abrev').value.trim().toUpperCase();
  const nome=document.getElementById('prof-modal-nome').value.trim();
  const mat=document.getElementById('prof-modal-mat').value.trim();
  if(!abrev){toast('Nome abreviado obrigatório','err');return;}
  if(!db.professors)db.professors=[];
  const idxStr=document.getElementById('prof-modal-idx').value;
  if(idxStr!==''){
    const i=parseInt(idxStr);
    db.professors[i]={...db.professors[i],nome:abrev,nomeCompleto:nome,matricula:mat};
    toast('Professor atualizado!','ok');
    addActivityLog('edit',`Professor atualizado: "${abrev}"`);
  } else {
    db.professors.push({id:genId(),nome:abrev,nomeCompleto:nome,matricula:mat});
    toast('Professor adicionado!','ok');
    addActivityLog('insert',`Professor adicionado: "${abrev}"`);
  }
  saveDB();
  closeProfModal();
  renderProfAdmin();
}

function deleteProfAdmin(i){
  const p=db.professors[i];if(!p)return;
  confirmAction(`🗑 Excluir "${p.nome}"?`,'Esta ação não pode ser desfeita.',()=>{
    db.professors.splice(i,1);
    saveDB();
    renderProfAdmin();
    addActivityLog('delete',`Professor removido: "${p.nome}"`);
    toast('Professor removido','warn');
  });
}


function _getProfsByCourse(allClasses){
  // Coletar professores (abreviados) que aparecem em turmas do curso.
  // Filtro: apenas turmas com alunos matriculados E não-evasão.
  // (Diários vazios — sem alunos — não devem listar o professor no curso,
  // já que aquele vínculo não representa uma turma ativa no conselho.)
  const countMap={};
  const turmasAtivas = allClasses.filter(cl =>
    !isEvasaoClass(cl) && (cl.students||[]).length > 0
  );
  turmasAtivas.forEach(cl=>{
    (cl.teachers||[]).forEach(t=>{
      const nome=(t.prof||t.nome||'').trim();
      if(!nome)return;
      if(!countMap[nome])countMap[nome]={count:0};
      countMap[nome].count++;
    });
  });
  // Pegar professores que aparecem em pelo menos 1 turma com alunos
  const abrevs=Object.keys(countMap).sort((a,b)=>a.localeCompare(b));
  // Cruzar com db.professors para nome completo
  return abrevs.map(abrev=>{
    const full=(db.professors||[]).find(p=>
      p.nome&&p.nome.trim().toUpperCase()===abrev.toUpperCase()
    );
    return{
      abrev,
      nomeCompleto:full?.nomeCompleto||'',
      matricula:full?.matricula||''
    };
  }).filter(p=>p.nomeCompleto||p.matricula);
}


// ── PROFESSORES — COPIAR E IMPRIMIR ──
function _copyProfTable(pid){
  const profs=(window[pid]||[]).slice().sort((a,b)=>(a.nomeCompleto||a.abrev).localeCompare(b.nomeCompleto||b.abrev));
  if(!profs.length){toast('Nenhum professor','err');return;}
  // HTML com tabela com bordas — o Word aceita HTML no clipboard
  const border='1px solid #000';
  const tdStyle=`border:${border};padding:5px 10px;font-family:Arial,sans-serif;font-size:11pt`;
  const thStyle=tdStyle+';font-weight:bold';
  const rows=profs.map(p=>`<tr><td style="${tdStyle}">${p.nomeCompleto||p.abrev}</td><td style="${tdStyle};font-family:Courier New,monospace">${p.matricula||'—'}</td></tr>`).join('');
  const html=`<table style="border-collapse:collapse;width:100%"><thead><tr><th style="${thStyle}">Nome</th><th style="${thStyle};width:120px">Matrícula</th></tr></thead><tbody>${rows}</tbody></table>`;
  // Copiar HTML para clipboard (Word interpreta como tabela com bordas)
  try{
    const blob=new Blob([html],{type:'text/html'});
    const item=new ClipboardItem({'text/html':blob});
    navigator.clipboard.write([item]).then(()=>toast('✅ Copiado! Cole no Word com Ctrl+V.','ok')).catch(()=>_copyProfFallback(profs));
  }catch(e){_copyProfFallback(profs);}
}
function _copyProfFallback(profs){
  // Fallback TSV para navegadores sem suporte a ClipboardItem
  const tsv='Nome\tMatrícula\n'+profs.map(p=>`${p.nomeCompleto||p.abrev}\t${p.matricula||'—'}`).join('\n');
  const ta=document.createElement('textarea');ta.value=tsv;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  toast('✅ Copiado (formato TSV)! Cole no Word.','ok');
}

function _printProfTable(pid){
  const profs=(window[pid]||[]).slice().sort((a,b)=>(a.nomeCompleto||a.abrev).localeCompare(b.nomeCompleto||b.abrev));
  if(!profs.length){toast('Nenhum professor','err');return;}
  const courseName=document.querySelector('.class-overview .dash-section-title')?.textContent||'Professores';
  const rows=profs.map((p,i)=>`<tr><td>${i+1}</td><td>${p.nomeCompleto||p.abrev}</td><td>${p.matricula||'—'}</td></tr>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Professores</title>
  <style>
    body{font-family:Arial,sans-serif;padding:24px;color:#111}
    h2{font-size:16px;margin-bottom:4px;color:#1a4a2e}
    p{font-size:11px;color:#666;margin:0 0 14px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#1a4a2e;color:#fff;text-align:left;padding:7px 10px;font-size:11px}
    td{padding:6px 10px;border-bottom:1px solid #e0e0e0}
    tr:nth-child(even) td{background:#f5f5f5}
    .num{width:40px;color:#999;text-align:center}
    .mat{width:110px;font-family:monospace;color:#555}
    @media print{body{padding:10px}}
  </style></head><body>
  <h2>👨‍🏫 Professores — ${courseName.replace('Selecione a Turma','Curso')}</h2>
  <p>Total: ${profs.length} professores · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
  <table><thead><tr><th class="num">#</th><th>Nome Completo</th><th class="mat">Matrícula</th></tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=()=>{window.print();}<\/script></body></html>`;
  const w=window.open('','_blank','width=800,height=600');
  w.document.write(html);w.document.close();
}


function switchCfgTab(tab){
  ['usuarios','professores','importar','ia','log','backup'].forEach(t=>{
    const el=document.getElementById('cfg-'+t);
    if(el)el.style.display=t===tab?'flex':'none';
    const btn=document.getElementById('cfg-tab-'+t);
    if(btn){btn.classList.toggle('cfg-tab-active',t===tab);}
  });
  if(tab==='log')renderLog();
  if(tab==='professores')renderProfAdmin();
  if(tab==='usuarios')renderAdmin();
  if(tab==='ia')renderIAConfig();
  if(tab==='backup')renderBackupConfig();
}

