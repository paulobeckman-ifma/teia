// ══════════════════ CLASS OVERVIEW ══════════════════
function openClass(clid){
  if(!clid)return;
  const found=findClass(clid);if(!found){toast('Turma não encontrada','err');return;}
  _classLocked=true;
  const _nb=document.getElementById('class-nav-bar');if(_nb)_nb.style.display='flex';
  {const _sc=document.getElementById('sidebar-cursos');if(_sc)_sc.style.display='none';}
  {const _snb=document.querySelector('.student-nav-bar');if(_snb)_snb.style.display='';}
  activeClassId=clid;listStudents=found.clase.students;
  activeStudentId=null;activeYear='';
  injectAlunosTab();
  // Show fast skeleton then render
  const det=document.getElementById('aluno-detail');
  const sb=document.getElementById('alunos-scroll');
  if(sb)sb.innerHTML='';
  const tc=document.getElementById('tab-alunos');
  if(tc&&!tc.classList.contains('active')){
    document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('.btn-tab').forEach(b=>b.classList.remove('active'));
    tc.classList.add('active');
    const tb=document.querySelector('.btn-tab[data-tab="alunos"]');
    if(tb)tb.classList.add('active');
  }
  document.getElementById('btn-back-to-class').style.display='flex';
  {const _bbc2=document.getElementById('btn-back-to-courses');if(_bbc2)_bbc2.style.display='none';}
  const _lb=document.getElementById('_lockBtn');if(_lb)_lb.style.display='flex';
  showClassOverview();
  renderList();
}

function backToClassList(){
  // Flush save pendente antes de sair da turma
  if(typeof flushPendingSave==='function') flushPendingSave();
  _classLocked=true;
  const _nb=document.getElementById('class-nav-bar');if(_nb)_nb.style.display='none';
  if(!activeClassId){switchTab('dashboard');return;}
  const found=findClass(activeClassId);if(!found){switchTab('dashboard');return;}
  // Delega para _openGroup para garantir UMA ÚNICA tela de seleção de turma
  // (evita duplicidade: antes havia uma tela ao vir do dashboard e outra, com
  // título diferente, ao voltar de dentro da turma).
  //
  // IMPORTANTE: _dashGroups é indexado por IDs sequenciais (g0, g1, g2...) e
  // NÃO por getGroupKey(). Por isso precisamos localizar qual g<N> contém a
  // activeClassId — NÃO dá para usar a chave derivada do nome do curso.
  const savedClassId=activeClassId;
  const findGroupIdForClass=(clid)=>Object.keys(_dashGroups||{}).find(k=>(_dashGroups[k]||[]).includes(clid));
  let gk=findGroupIdForClass(savedClassId);
  // Garante que _dashGroups esteja populado (pode acontecer de o usuário ter
  // entrado direto pela sidebar ou via link antes de o dashboard ser renderizado)
  if(!gk){
    renderDashboard();
    gk=findGroupIdForClass(savedClassId);
  }
  if(gk){
    // Limpa estado de turma/aluno antes de reabrir o grupo
    activeClassId=null;activeStudentId=null;
    _openGroup(gk);
    return;
  }
  // Fallback caso o grupo realmente não exista no mapa (curso removido, etc.)
  activeClassId=null;activeStudentId=null;
  switchTab('dashboard');
}

function _backToClassList_legacy_unused(){
  // Função substituída — agora backToClassList() delega para _openGroup()
  // para eliminar a duplicidade de telas de seleção de turma.
}

function buildScheduleGrid(schedDiscs){
  // schedDiscs entries: {disc, prof, slots:[{day,time}]}
  const DAYS=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const DAY_SHORT=['Seg','Ter','Qua','Qui','Sex','Sáb'];

  // Build grid: {time: {dayIndex: {disc, prof}}}
  const timeSet=new Set();
  const grid={};
  let hasSlots=false;

  schedDiscs.forEach(({disc,prof,slots=[]})=>{
    slots.forEach(({day,time})=>{
      if(!time)return;
      hasSlots=true;
      timeSet.add(time);
      if(!grid[time])grid[time]={};
      // Match day to index
      const di=DAYS.findIndex(d=>day.toLowerCase().startsWith(d.toLowerCase().substring(0,3)));
      if(di>=0)grid[time][di]={disc,prof};
    });
  });

  if(!hasSlots){
    // Fallback: just list disciplines
    const uniq=[...new Map(schedDiscs.map(d=>[d.disc,d])).values()];
    if(!uniq.length)return '<div style="font-size:.65rem;color:var(--g3)">Sem dados de horário</div>';
    return`<div style="display:flex;flex-direction:column;gap:.15rem">${uniq.map(({disc,prof})=>`<div style="display:flex;justify-content:space-between;font-size:.65rem;padding:.12rem .3rem;background:var(--gp);border-radius:4px"><strong>${esc(disc)}</strong><span style="color:var(--g3)">${esc(prof)}</span></div>`).join('')}</div>`;
  }

  // Sort times
  const times=[...timeSet].sort((a,b)=>{
    const toMin=t=>{ const p=t.match(/(\d+):(\d+)/); return p?+p[1]*60+ +p[2]:0; };
    return toMin(a)-toMin(b);
  });

  // Determine which days have at least one lesson
  const activeDays=DAYS.map((_,i)=>times.some(t=>grid[t]?.[i]));
  const showDays=DAYS.map((d,i)=>activeDays[i]?DAY_SHORT[i]:null).filter(Boolean);
  const showIdxs=DAYS.map((_,i)=>i).filter(i=>activeDays[i]);

  // Color palette for disciplines
  const colors=['#e8f5e9','#e3f2fd','#fff3e0','#fce4ec','#f3e5f5','#e0f7fa','#fff8e1','#fbe9e7'];
  const colorMap={};let ci=0;
  schedDiscs.forEach(({disc})=>{if(!colorMap[disc]){colorMap[disc]=colors[ci++%colors.length];}});

  return`<div style="overflow-x:auto;margin-top:.2rem">
    <table style="border-collapse:collapse;width:100%;font-size:.62rem;min-width:280px">
      <thead>
        <tr>
          <th style="padding:.18rem .3rem;background:var(--green);color:#fff;text-align:left;border:1px solid rgba(255,255,255,.3);white-space:nowrap;font-weight:700">Hora</th>
          ${showDays.map(d=>`<th style="padding:.18rem .3rem;background:var(--green);color:#fff;text-align:center;border:1px solid rgba(255,255,255,.3);font-weight:700">${d}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${times.map(t=>{
          const cells=showIdxs.map(i=>{
            const c=grid[t]?.[i];
            if(!c)return`<td style="border:1px solid var(--g5);padding:.12rem .18rem"></td>`;
            const bg=colorMap[c.disc]||'#e8f5e9';
            return`<td style="border:1px solid var(--g5);padding:.1rem .18rem;background:${bg};vertical-align:top">
              <div style="font-weight:700;color:var(--dk);line-height:1.2">${esc(c.disc)}</div>
              ${c.prof?`<div style="color:var(--g3);font-size:.56rem">${esc(c.prof)}</div>`:''}
            </td>`;
          }).join('');
          return`<tr><td style="border:1px solid var(--g5);padding:.12rem .3rem;font-weight:600;color:var(--g2);white-space:nowrap;background:var(--g6)">${t.substring(0,5)}</td>${cells}</tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function showClassOverview(){
  // Flush save pendente antes de sair da ficha do aluno
  if(typeof flushPendingSave==='function') flushPendingSave();
  const _bb=document.getElementById('btn-back-to-class');
  if(_bb){_bb.textContent='← Voltar às Turmas';_bb.onclick=backToClassList;}
  if(!activeClassId)return;
  const found=findClass(activeClassId);if(!found)return;
  const cl=found.clase;
  if(!cl.bimestres)cl.bimestres={};
  for(let b=1;b<=4;b++){if(!cl.bimestres[b])cl.bimestres[b]={positivos:'',negativos:''};}
  if(!cl.teachers)cl.teachers=[];
  const _anonTurma=!cl.name||/^-+$/.test(cl.name.trim())||cl.name.trim()===''||/ifem/i.test(cl.name)||/sem\s*turma/i.test(cl.name);
  let schedDiscs=[];
  if(!_anonTurma&&db.schedules){
    const norm=s=>String(s||'').toLowerCase().replace(/[\s\-_.()]/g,'');
    const clN=norm(cl.name);
    schedDiscs=db.schedules[cl.name]||
               Object.entries(db.schedules).find(([k])=>norm(k)===clN)?.[1]||
               Object.entries(db.schedules).find(([k])=>{const kN=norm(k);return clN.includes(kN)||kN.includes(clN);})?.[1]||[];
  }

  document.getElementById('btn-back-to-class').style.display='flex';
  {const _bbc2=document.getElementById('btn-back-to-courses');if(_bbc2)_bbc2.style.display='none';}
  const _lb=document.getElementById('_lockBtn');if(_lb)_lb.style.display='flex';
  document.getElementById('nav-pos').textContent='— / —';
  document.getElementById('nav-prev').disabled=true;
  document.getElementById('nav-next').disabled=true;
  // Populate student list in sidebar even on class overview
  renderList();
  updateClassNavBar();

  const det=document.getElementById('aluno-detail');
  det.style.overflow='hidden';

  // Compute averages per bimestre
  const _covYr=activeYear||(cl.students[0]?.anoIngresso?String(cl.students[0].anoIngresso):String(new Date().getFullYear()));
  function bimAvg(b){
    let sc=0,sd=0,n=0;
    cl.students.forEach(s=>{const av=s.avaliacoes?.[_covYr]?.[b];if(av&&(av.comp>0||av.desemp>0)){sc+=av.comp||0;sd+=av.desemp||0;n++;}});
    return n?{comp:(sc/n).toFixed(1),desemp:(sd/n).toFixed(1),n}:null;
  }
  const avg=bimAvg(_covBim);

  const allTeachers=[...cl.teachers,...schedDiscs.filter(d=>!cl.teachers.find(t=>t.disc===d.disc))];

  det.innerHTML=`<div class="class-overview">
    <div class="cov-header" style="position:relative">
      
      <div>
        <div class="cov-title">${esc(cl.name)}</div>
        <div class="cov-meta">${cl.students.length} aluno${cl.students.length!==1?'s':''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem;margin-left:auto">
        ${canUseIA()?`<button onclick="openDiagnosticoIA()" style="background:linear-gradient(135deg,#6B21A8,#4F46E5);color:#fff;border:none;border-radius:9px;padding:.42rem .9rem;font-size:.75rem;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(107,33,168,.35);display:flex;align-items:center;gap:.4rem;transition:all .18s" onmouseover="this.style.filter='brightness(1.12)'" onmouseout="this.style.filter=''">🤖 Diagnóstico IA</button>`:''}
        ${_isAdmin()?`<button class="cov-edit-btn" onclick="openRenameClass()" style="${_classLocked?'opacity:.4;pointer-events:none':''}" >✏️ Renomear</button><button class="cov-edit-btn" onclick="deleteClass('${esc(cl.id)}')" style="color:#c62828;border-color:#ef9a9a;margin-left:.3rem">🗑 Excluir Turma</button>`:canEdit()?`<button class="cov-edit-btn" onclick="openRenameClass()">✏️ Renomear</button>`:''}
      </div>
    </div>

    <div class="cov-grid">
      <div class="cov-card">
        <div class="cov-card-title">Alunos</div>
        <div style="text-align:center;padding:.8rem .5rem">
          <div style="font-size:1.6rem;font-weight:800;color:var(--green);line-height:1">${cl.students.length}</div>
          <div style="font-size:.65rem;color:var(--g3);margin:.2rem 0 .8rem;text-transform:uppercase;letter-spacing:.06em;font-weight:600">aluno${cl.students.length!==1?'s':''} matriculado${cl.students.length!==1?'s':''}</div>
          <button class="btn-p" style="width:100%;font-size:.76rem;padding:.45rem .9rem;margin-bottom:.4rem" onclick="selectStudent(listStudents[0]?.id)">
            Avaliar individualmente
          </button>
        </div>
      </div>
      ${!_anonTurma?`<div class="cov-card">
        <div class="cov-card-title">Professores / Disciplinas ${canEdit()?'<button onclick="openAddTeacher()" style="background:none;border:none;color:var(--green);cursor:pointer;font-size:.78rem;font-weight:700">+ Adicionar</button>':''}</div>
        ${allTeachers.length?`<div style="display:grid;grid-template-columns:${allTeachers.length>5?'1fr 1fr':'1fr'};gap:0">`+allTeachers.map((t,i)=>`<div style="display:flex;align-items:center;gap:.35rem;font-size:.72rem;padding:.18rem 0;border-bottom:1px solid var(--g5)">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><strong>${esc(t.prof||t.name||'—')}</strong> · <em>${esc(t.disc||'')}</em></span>
          ${canEdit()?`<button onclick="openEditTeacher(${i})" title="Editar" style="background:none;border:none;color:var(--green);cursor:pointer;font-size:.8rem;padding:0 .15rem;flex-shrink:0">✏️</button>
          <button onclick="removeTeacher(${i})" title="Remover" style="background:none;border:none;color:var(--g4);cursor:pointer;font-size:.8rem;padding:0 .1rem;flex-shrink:0">✕</button>`:''}
        </div>`).join('')+'</div>':'<div style="font-size:.72rem;color:var(--g3)">Nenhum professor cadastrado</div>'}
      </div>`:''}

    </div>

    <div class="cov-bim-tabs">
      ${[1,2,3,4].map(b=>`<button class="cov-bim-tab${_covBim===b?' active':''}" onclick="setCovBim(${b})">${b}º Bimestre</button>`).join('')}
    </div>

    <div class="cov-bim-content" style="flex-direction:row;gap:.5rem;overflow:hidden">
      <!-- esquerda 50%: médias + textareas + botões -->
      <div style="flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:.3rem">
        <div class="avg-grid" style="margin:0;flex-shrink:0">
          <div class="avg-box"><div class="avg-val" style="color:${CLASSIF_COLOR[Math.round(avg?.comp)]||'#aaa'}">${avg?CLASSIF_LABEL[Math.round(+avg.comp)]||avg.comp:'—'}</div><div class="avg-lbl">Méd. Comp.</div></div>
          <div class="avg-box"><div class="avg-val" style="color:${CLASSIF_COLOR[Math.round(avg?.desemp)]||'#aaa'}">${avg?CLASSIF_LABEL[Math.round(+avg.desemp)]||avg.desemp:'—'}</div><div class="avg-lbl">Méd. Desemp.</div></div>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:.28rem">
          <div style="display:flex;flex-direction:column;gap:.15rem;flex:1;min-height:0">
            <div class="eval-section-title" style="flex-shrink:0">✅ Aspectos Positivos</div>
            <textarea class="cov-textarea" id="cov-pos" placeholder="Aspectos positivos neste bimestre..." onchange="saveCovBim()" style="flex:1;min-height:2.5rem;max-height:5rem;resize:none">${esc(cl.bimestres[_covBim].positivos)}</textarea>
          </div>
          <div style="display:flex;flex-direction:column;gap:.15rem;flex:1;min-height:0">
            <div class="eval-section-title" style="flex-shrink:0">⚠️ Aspectos Negativos</div>
            <textarea class="cov-textarea" id="cov-neg" placeholder="Desafios e aspectos negativos..." onchange="saveCovBim()" style="flex:1;min-height:2.5rem;max-height:5rem;resize:none">${esc(cl.bimestres[_covBim].negativos)}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:.4rem;flex-shrink:0;justify-content:flex-end;flex-wrap:wrap">
          ${canEdit()?`<button class="btn-s" style="font-size:.68rem;padding:.28rem .65rem" onclick="printTurmaPDF()" title="Relatório resumido em tabela">🖨️ Imprimir</button>`:''}
          <button class="btn-s" style="font-size:.68rem;padding:.28rem .65rem;background:#e8f5e9;border-color:#81c784;color:#1b5e20" onclick="askBimAndPrintClass()" title="Gera um PDF com uma ficha Página Completa por aluno (todos os alunos da turma) para um bimestre escolhido">📋 Imprimir Avaliações</button>
          <button class="btn-p" style="font-size:.68rem;padding:.28rem .7rem" onclick="selectStudent(listStudents[0]?.id)">👨‍🎓 Ver Alunos →</button>
        </div>
      </div>
      <!-- direita 50%: dois mapas lado a lado -->
      <div style="flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:.25rem">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <span style="font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--g3)">🗺️ Calor</span>
          <div style="display:flex;gap:.3rem">
            <span style="display:flex;align-items:center;gap:2px;font-size:.52rem;font-weight:700"><span style="width:6px;height:6px;border-radius:50%;background:#c62828;display:inline-block"></span>Ruim</span>
            <span style="display:flex;align-items:center;gap:2px;font-size:.52rem;font-weight:700"><span style="width:6px;height:6px;border-radius:50%;background:#f9a825;display:inline-block"></span>Regular</span>
            <span style="display:flex;align-items:center;gap:2px;font-size:.52rem;font-weight:700"><span style="width:6px;height:6px;border-radius:50%;background:#2e7d32;display:inline-block"></span>Bom</span>
            <span style="display:flex;align-items:center;gap:2px;font-size:.52rem;font-weight:700"><span style="width:6px;height:6px;border-radius:50%;background:#1565c0;display:inline-block"></span>Exc.</span>
          </div>
        </div>
        <div style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:.4rem">
          <div style="display:flex;flex-direction:column;gap:.15rem;min-height:0">
            <div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--g2);flex-shrink:0">Comportamento</div>
            <div style="flex:1;min-height:0;position:relative;border-radius:6px;overflow:hidden;border:1px solid var(--g5)">
              <canvas id="heatmap-comp" width="320" height="420" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.15rem;min-height:0">
            <div style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--g2);flex-shrink:0">Desempenho</div>
            <div style="flex:1;min-height:0;position:relative;border-radius:6px;overflow:hidden;border:1px solid var(--g5)">
              <canvas id="heatmap-desemp" width="320" height="420" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  // Ensure alunos tab is active without triggering recursive showClassOverview
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.toggle('active',el.id==='tab-alunos'));
  document.querySelectorAll('.btn-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='alunos'));
  // Draw heatmaps — call directly (DOM is ready after innerHTML) + fallback
  _renderHeatmaps(_covYr,_covBim);
  setTimeout(()=>_renderHeatmaps(_covYr,_covBim),80);
}

function showStudentList(){
  if(!activeClassId)return;
  const found=findClass(activeClassId);if(!found)return;
  const cl=found.clase;
  const det=document.getElementById('aluno-detail');
  det.style.overflow='hidden auto';
  det.innerHTML=`<div class="class-overview">
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.5rem">
      <button class="back-btn" onclick="showClassOverview()">◀ Voltar</button>
      <span style="font-size:.88rem;font-weight:700">📋 Alunos — ${esc(cl.name)}</span>
    </div>
    <div style="background:#fff;border-radius:var(--r);box-shadow:var(--sh);overflow:hidden">
      <div style="padding:.5rem .7rem;background:var(--gp);border-bottom:1px solid var(--gm);font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--green);display:flex;gap:.5rem;align-items:center">
        <span style="flex:1">Nome</span><span style="width:130px">Matrícula</span>${canEdit()?'<span style="width:30px"></span>':''}
      </div>
      <div style="max-height:400px;overflow-y:auto">
        ${cl.students.map(s=>`<div class="student-mini-item" onclick="selectStudent('${s.id}')" style="cursor:pointer">
          <span class="smi-name">${esc(toTitleCase(s.nome))}</span>
          <span class="smi-mat">${esc(s.matricula||'—')}</span>
          ${canEdit()?`<button class="smi-del" onclick="event.stopPropagation();removeStudent('${s.id}')" title="Remover aluno">🗑</button>`:''}
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}
function saveCovBim(){
  const found=findClass(activeClassId);if(!found)return;
  const cl=found.clase;
  if(!cl.bimestres)cl.bimestres={};
  if(!cl.bimestres[_covBim])cl.bimestres[_covBim]={positivos:'',negativos:''};
  cl.bimestres[_covBim].positivos=document.getElementById('cov-pos')?.value||'';
  cl.bimestres[_covBim].negativos=document.getElementById('cov-neg')?.value||'';
  // Marca esta entrada (turma+bimestre) como dirty
  markClassBimDirty(cl.id, _covBim);
  saveDB();
}

function setCovBim(b){
  saveCovBim(); // save current before switching
  _covBim=b;
  showClassOverview();
}

function _renderHeatmaps(yr,bim){
  const cl=findClass(activeClassId);if(!cl)return;
  // Fallback: if yr/bim not passed, compute from class students
  const _yr=yr||(activeYear||
    (cl.clase.students[0]?.anoIngresso
      ?String(cl.clase.students[0].anoIngresso)
      :String(new Date().getFullYear())));
  const _bim=bim||_covBim||1;
  const students=cl.clase.students||[];
  const compPts=[],despPts=[];
  students.forEach(s=>{
    // Try exact year, then fall back to any year that has seating data
    let av=s.avaliacoes?.[_yr]?.[_bim];
    if(!av){
      // Search across all years for this bim
      const years=Object.keys(s.avaliacoes||{});
      for(const y of years){
        const candidate=s.avaliacoes[y]?.[_bim];
        if(candidate?.seating?.x>=0){av=candidate;break;}
      }
    }
    if(!av)return;
    const seat=av.seating;
    if(!seat||seat.x<0||seat.y<0)return;
    if(av.comp>0)compPts.push({x:seat.x,y:seat.y,v:av.comp});
    if(av.desemp>0)despPts.push({x:seat.x,y:seat.y,v:av.desemp});
  });
  _drawHeatmapCanvas('heatmap-comp',compPts);
  _drawHeatmapCanvas('heatmap-desemp',despPts);
}

function separableBoxBlur(field, W, H, radius){
  const tmp=new Float32Array(W*H);
  // horizontal pass
  for(let y=0;y<H;y++){
    let s=0,c=0;
    for(let x=0;x<=Math.min(radius,W-1);x++){s+=field[y*W+x];c++;}
    for(let x=0;x<W;x++){
      const a2=x+radius+1,r2=x-radius-1;
      if(a2<W){s+=field[y*W+a2];c++;}
      if(r2>=0){s-=field[y*W+r2];c--;}
      tmp[y*W+x]=s/c;
    }
  }
  // vertical pass
  for(let x=0;x<W;x++){
    let s=0,c=0;
    for(let y=0;y<=Math.min(radius,H-1);y++){s+=tmp[y*W+x];c++;}
    for(let y=0;y<H;y++){
      const a2=y+radius+1,r2=y-radius-1;
      if(a2<H){s+=tmp[a2*W+x];c++;}
      if(r2>=0){s-=tmp[r2*W+x];c--;}
      field[y*W+x]=s/c;
    }
  }
}

function _drawHeatmapCanvas(id,pts){
  const canvas=document.getElementById(id);if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;

  // 9-stop palette: vermelho → laranja → amarelo → lima → verde → ciano → azul
  const BANDS=[
    [220,25, 25],  // 1.00 ruim
    [245,75,  0],  // 1.5
    [255,165, 0],  // 2.00 regular
    [210,215, 5],  // 2.5
    [ 80,180,40],  // 3.00 bom
    [ 10,175,120], // 3.5
    [ 20, 95,205], // 4.00 excelente
  ];
  function bandColor(score){
    const t=Math.max(0,Math.min(1,(score-1)/3));
    const fi=t*6,lo=Math.floor(fi),hi=Math.min(6,lo+1),f=fi-lo;
    const a=BANDS[lo],b=BANDS[hi];
    return[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
  }

  // ── Pass 1: Gaussian weight field (no hard cutoff = smooth decay) ──
  const sigma=Math.min(W,H)*0.22;
  const sig2=2*sigma*sigma;
  const cutR=sigma*3.2;
  const cutR2=cutR*cutR;
  const wvF=new Float32Array(W*H);
  const twF=new Float32Array(W*H);

  if(pts.length>0){
    for(let py=0;py<H;py++){
      for(let px=0;px<W;px++){
        let tw=0,wv=0;
        for(let k=0;k<pts.length;k++){
          const sx=(pts[k].x/100)*W,sy=(pts[k].y/100)*H;
          const dx=px-sx,dy=py-sy,d2=dx*dx+dy*dy;
          if(d2>=cutR2)continue;
          const w=Math.exp(-d2/sig2);
          tw+=w;wv+=w*pts[k].v;
        }
        wvF[py*W+px]=wv;
        twF[py*W+px]=tw;
      }
    }
    // ── Pass 2: blur score fields → ultra-smooth color transitions ──
    const br=Math.max(2,Math.round(Math.min(W,H)*0.03));
    for(let p=0;p<4;p++){separableBoxBlur(wvF,W,H,br);separableBoxBlur(twF,W,H,br);}
  }

  // ── Pass 3: colorize ──
  const imageData=ctx.createImageData(W,H);
  const d=imageData.data;
  const THR=0.0004;
  for(let i=0;i<W*H;i++){
    const tw=twF[i];
    d[i*4]=255;d[i*4+1]=255;d[i*4+2]=255;d[i*4+3]=255; // white bg
    if(tw<THR)continue;
    const score=wvF[i]/tw;
    const[r,g,b]=bandColor(Math.max(1,Math.min(4,score)));
    const alpha=tw<THR*20?Math.floor((tw-THR)/(THR*19)*215):215;
    d[i*4]=r;d[i*4+1]=g;d[i*4+2]=b;d[i*4+3]=alpha;
  }
  ctx.putImageData(imageData,0,0);

  // ── Limpar faixa do QUADRO (branco puro, sem calor) ──
  const bx=W*.08,by=H*.02,bw=W*.84,bh=H*.08;
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,W,by+bh+W*.02);
  ctx.fillStyle='rgba(30,60,30,0.06)';
  ctx.strokeStyle='rgba(30,60,30,0.35)';
  ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(bx,by,bw,bh,3);ctx.fill();ctx.stroke();
  ctx.fillStyle='rgba(30,60,30,0.45)';
  ctx.font=`bold ${W*.046}px Sora,Arial`;ctx.textAlign='center';
  ctx.fillText('QUADRO',W/2,by+bh*.74);

  const cols=5,rows=6;
  const gx=W*.06,gy=H*.13,gw=W*.88,gh=H*.85;
  const cw=gw/cols,ch=gh/rows;
  for(let r=0;r<rows;r++){for(let c=0;c<cols;c++){
    const sx=gx+c*cw+cw*.12,sy=gy+r*ch+ch*.1,sw=cw*.76,sh=ch*.72;
    ctx.strokeStyle='rgba(30,60,30,0.15)';ctx.lineWidth=.6;
    ctx.beginPath();ctx.roundRect(sx,sy,sw,sh,2);ctx.stroke();
  }}

  const C={1:[220,25,25],2:[255,165,0],3:[80,180,40],4:[20,95,205]};
  pts.forEach(({x,y,v})=>{
    const px=(x/100)*W,py=(y/100)*H;
    const[r,g,b]=C[v]||[150,150,150];
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    ctx.strokeStyle='rgba(255,255,255,0.95)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(px,py,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();
  });

  if(pts.length===0){
    ctx.fillStyle='rgba(30,60,30,0.25)';
    ctx.font=`${W*.046}px Sora,Arial`;ctx.textAlign='center';
    ctx.fillText('Sem localizações',W/2,H*.46);
    ctx.fillText('registradas',W/2,H*.46+W*.06);
  }
}


function deleteClass(clid){
  const found=findClass(clid);if(!found)return;
  const cl=found.clase;
  const courseId=found.course.id;
  const hasStudents=cl.students&&cl.students.length>0;
  const msg=hasStudents
    ?`Tem certeza que deseja excluir a turma "${cl.name}"? Ela possui ${cl.students.length} aluno(s). Esta ação não pode ser desfeita.`
    :`Tem certeza que deseja excluir a turma "${cl.name}"? Esta ação não pode ser desfeita.`;
  confirmAction(`🗑 Excluir Turma "${cl.name}"`,msg,()=>{
    // Find the course directly from db to ensure we mutate the real object
    const course=db.courses.find(c=>c.id===courseId);
    if(!course)return;
    course.classes=course.classes.filter(c=>c.id!==clid);
    if(activeClassId===clid){activeClassId=null;activeStudentId=null;}
    saveDB();
    addActivityLog('delete',`Turma excluída: "${cl.name}"`);
    toast(`Turma "${cl.name}" excluída`,'warn');
    // Navigate back: if course still has classes, show picker; else go to dashboard
    const remaining=course.classes.filter(c=>!isEvasaoClass(c)||course.classes.length<=1);
    const det=document.getElementById('aluno-detail');
    if(det)det.innerHTML='';
    if(course.classes.length>0){
      // Show the group picker for this course
      const gk=Object.keys(_dashGroups).find(k=>_dashGroups[k].some(id=>course.classes.find(c=>c.id===id)));
      renderDashboard();
      if(gk)_openGroup(gk);
    } else {
      renderDashboard();
      switchTab('dashboard');
    }
  });
}

function openRenameClass(){
  const found=findClass(activeClassId);if(!found)return;
  document.getElementById('rename-class-input').value=found.clase.name;
  openModal('rename-class-modal');
  setTimeout(()=>document.getElementById('rename-class-input').focus(),80);
}
function saveRenameClass(){
  const newName=document.getElementById('rename-class-input').value.trim();
  if(!newName){toast('Nome não pode ser vazio','err');return;}
  const found=findClass(activeClassId);if(!found)return;
  found.clase.name=newName;
  saveDB();closeModal('rename-class-modal');showClassOverview();renderDashboard();
  toast('Turma renomeada!','ok');
}

function openAddTeacher(){
  document.getElementById('add-teacher-modal-title').textContent='👨‍🏫 Adicionar Professor';
  document.getElementById('teacher-save-btn').textContent='Adicionar';
  document.getElementById('teacher-save-btn').onclick=saveAddTeacher;
  document.getElementById('teacher-name-input').value='';
  document.getElementById('teacher-disc-input').value='';
  openModal('add-teacher-modal');
  setTimeout(()=>document.getElementById('teacher-name-input').focus(),80);
}

function openEditTeacher(i){
  if(!canEdit())return;
  const found=findClass(activeClassId);if(!found)return;
  const cl=found.clase;
  const schedDiscs2=(db.schedules&&db.schedules[cl.name])||[];
  const allT=[...cl.teachers,...schedDiscs2.filter(d=>!cl.teachers.find(t=>t.disc===d.disc))];
  const t=allT[i];if(!t)return;
  // If teacher is from schedule (not in cl.teachers), add to cl.teachers first
  if(!cl.teachers[i]&&t){cl.teachers.push({...t});saveDB();}
  const tIdx=cl.teachers.findIndex(x=>x.disc===t.disc&&x.prof===t.prof);
  document.getElementById('add-teacher-modal-title').textContent='✏️ Editar Professor';
  document.getElementById('teacher-save-btn').textContent='Salvar';
  document.getElementById('teacher-name-input').value=t.prof||t.name||'';
  document.getElementById('teacher-disc-input').value=t.disc||'';
  document.getElementById('teacher-save-btn').onclick=()=>{
    const name=document.getElementById('teacher-name-input').value.trim();
    const disc=document.getElementById('teacher-disc-input').value.trim();
    if(!name&&!disc){toast('Preencha ao menos um campo','err');return;}
    const idx=tIdx>=0?tIdx:cl.teachers.findIndex(x=>x.disc===t.disc&&x.prof===t.prof);
    if(idx>=0){cl.teachers[idx]={prof:name,disc,name};} else {cl.teachers.push({prof:name,disc,name});}
    saveDB();closeModal('add-teacher-modal');showClassOverview();toast('Professor atualizado!','ok');
  };
  openModal('add-teacher-modal');
  setTimeout(()=>document.getElementById('teacher-disc-input').focus(),80);
}
function saveAddTeacher(){
  const name=document.getElementById('teacher-name-input').value.trim();
  const disc=document.getElementById('teacher-disc-input').value.trim();
  if(!name){toast('Nome é obrigatório','err');return;}
  const found=findClass(activeClassId);if(!found)return;
  if(!found.clase.teachers)found.clase.teachers=[];
  found.clase.teachers.push({name,disc});
  saveDB();closeModal('add-teacher-modal');showClassOverview();toast('Professor adicionado!','ok');
}
function removeTeacher(i){
  const found=findClass(activeClassId);if(!found)return;
  found.clase.teachers.splice(i,1);saveDB();showClassOverview();
}
function removeStudent(sid){
  confirmAction('Remover Aluno?','O aluno será removido desta turma permanentemente.',()=>{
    const found=findClass(activeClassId);if(!found)return;
    found.clase.students=found.clase.students.filter(s=>s.id!==sid);
    listStudents=found.clase.students;
    saveDB();showClassOverview();toast('Aluno removido','warn');
  });
}

