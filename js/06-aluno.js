// ══════════════════ STUDENT DETAIL ══════════════════
function renderList(){
  const q=(document.getElementById('search-input')?.value||'').toLowerCase();
  const filtered=(listStudents||[]).filter(s=>toTitleCase(s.nome).toLowerCase().includes(q)||(s.matricula||'').toLowerCase().includes(q)||(s.siglaTurma||'').toLowerCase().includes(q));
  const scroll=document.getElementById('alunos-scroll');
  scroll.innerHTML=filtered.map(s=>{
    const ini=initials(s.nome);
    const temFoto=s.foto&&s.foto.trim();
    const av=temFoto?`<img src="${esc(s.foto)}" alt="" onerror="this.style.display='none'">`:`<span>${ini}</span>`;
    const _dotYear=activeYear||getActiveYear(s);
    const dots=[1,2,3,4].map(b=>{const av2=s.avaliacoes?.[_dotYear]?.[b];const cls=av2&&(av2.comp>0||av2.desemp>0)?'done':(av2?.obs?'partial':'');return`<div class="dot-b ${cls}"></div>`;}).join('');
    const hasTrans=temAlerta(s.transtorno),hasDef=temAlerta(s.deficiencia);
    const alertIco=hasTrans?' ⚠️':hasDef?' ♿':'';
    const sit=(s.situacao||'').toLowerCase();
    return`<div class="aluno-item${s.id===activeStudentId?' active':''}" onclick="selectStudent('${s.id}')" style="${sit.includes('inativo')||sit.includes('cancel')?'opacity:.55':''}"><div class="ai-avatar">${av}</div><div class="ai-info"><div class="ai-name">${esc(toTitleCase(s.nome))}${alertIco}</div><div class="ai-sub">${esc(s.matricula||s.siglaTurma||'—')}</div></div><div class="ai-dots">${dots}</div></div>`;
  }).join('');
  const idx=filtered.findIndex(s=>s.id===activeStudentId);
  document.getElementById('nav-pos').textContent=filtered.length?`${Math.max(idx+1,0)}/${filtered.length}`:'0/0';
  document.getElementById('nav-prev').disabled=idx<=0;
  document.getElementById('nav-next').disabled=idx>=filtered.length-1||filtered.length===0;
  requestAnimationFrame(()=>lazyLoadPhotos());
  setTimeout(_updateLockBtn,10);
}

function navigateStudent(d){
  const q=(document.getElementById('search-input')?.value||'').toLowerCase();
  const filtered=(listStudents||[]).filter(s=>toTitleCase(s.nome).toLowerCase().includes(q)||(s.matricula||'').toLowerCase().includes(q));
  const idx=filtered.findIndex(s=>s.id===activeStudentId);
  const newIdx=idx+d;if(newIdx<0||newIdx>=filtered.length)return;
  selectStudent(filtered[newIdx].id);
}

function selectStudent(sid){
  if(!sid)return;
  // IMPORTANTE: antes de trocar de aluno, flush qualquer save pendente do
  // aluno atual. Sem isso, o timer do autoSave pode disparar DEPOIS da troca
  // e acabar lendo os checkboxes do novo aluno ou gravando com id trocado.
  if(typeof flushPendingSave==='function') flushPendingSave();
  const s=findStudentById(sid);if(!s)return;
  activeStudentId=sid;
  // PRESERVA o bimestre que o avaliador estava trabalhando. Antes:
  //   activeBim=1;
  // gerava reset toda vez que o avaliador pulava de aluno em aluno e tinha
  // que clicar no bimestre desejado de novo. Agora só ajustamos se estiver
  // em estado inválido (fora de 1-4).
  if(!Number.isInteger(activeBim) || activeBim<1 || activeBim>4) activeBim=1;
  _curComp=0;_curDesemp=0;
  if(!activeYear||!getStudentYears(s).includes(activeYear))activeYear=getActiveYear(s);
  document.getElementById('btn-back-to-class').style.display='flex';
  {const _bbc2=document.getElementById('btn-back-to-courses');if(_bbc2)_bbc2.style.display='none';}
  const _lb=document.getElementById('_lockBtn');if(_lb)_lb.style.display='flex';
  renderList();
  // Show loading skeleton immediately, render detail on next frame
  const det=document.getElementById('aluno-detail');
  renderStudentDetail();
  requestAnimationFrame(()=>lazyLoadPhotos());
  switchTab('alunos');
}


// ══ YEAR-BASED AVALIAÇÕES HELPERS ══
let activeYear=''; // currently selected year/module

function getStudentYears(s){
  // Check modalidade field AND course name for concomitante/subsequente
  const mod=(s.modalidade||s.descricaoCurso||s.curso||'').toLowerCase();
  const cl=findClass(activeClassId);
  const courseName=(cl?.course?.name||'').toLowerCase();
  const combined=mod+' '+courseName;
  const isConc=combined.includes('concomitante')||combined.includes('subsequente')||/\bsub\b/.test(combined)||combined.includes('subsequ');
  const base=parseInt(s.anoIngresso)||new Date().getFullYear();
  if(isConc){
    // 2 anos letivos: base e base+1
    return[`${base}`,`${base+1}`];
  } else {
    // 3 anos: base, base+1, base+2
    return[`${base}`,`${base+1}`,`${base+2}`];
  }
}

function getAvYear(s,year,bim){
  const existing=s.avaliacoes?.[year]?.[bim];
  if(existing)return existing;
  // No data yet: inherit previous bimester's seating for display reference only.
  // When user clicks the map, it saves independently to THIS bimester (prev unaffected).
  let prevSeat={x:-1,y:-1};
  for(let b=bim-1;b>=1;b--){const prev=s.avaliacoes?.[year]?.[b];if(prev?.seating?.x>=0){prevSeat=prev.seating;break;}}
  return{comp:0,desemp:0,obs:'',compPos:[],compIssues:[],despPos:[],despIssues:[],encaminhamentos:[],encaminhamentosObs:{},encaminhamentosOutro:'',disciplinas:[],disciplinasObs:{},seating:prevSeat};
}

function setAvYear(s,year,bim,data){
  if(!s.avaliacoes)s.avaliacoes={};
  if(!s.avaliacoes[year])s.avaliacoes[year]={};
  s.avaliacoes[year][bim]={...getAvYear(s,year,bim),...data};
  // Marca como dirty — esta entrada será enviada ao servidor no próximo save
  markStudentAvDirty(s.id, year, bim);
}

function getActiveYear(s){
  if(activeYear)return activeYear;
  const yrs=getStudentYears(s);
  // Default to current real year or first match
  const now=new Date().getFullYear();
  const found=yrs.find(y=>y.startsWith(String(now)));
  return found||yrs[0]||String(now);
}

function renderStudentDetail(){
  const _bb=document.getElementById('btn-back-to-class');
  if(_bb){_bb.textContent='← Voltar à Turma';_bb.onclick=showClassOverview;}
  try{
    const s=findStudentById(activeStudentId);if(!s)return;
    const det=document.getElementById('aluno-detail');if(!det)return;

    const ini=initials(s.nome);
    const temFoto=s.foto&&s.foto.trim();
    const mat=s.matricula||'';
    const sit=(s.situacao||'').toLowerCase();
    const sitCls=sit.includes('ativo')&&!sit.includes('in')?'sit-ativo':sit.includes('inativo')||sit.includes('cancel')?'sit-inativo':'sit-outro';
    const _bYear=activeYear||getActiveYear(s)||String(new Date().getFullYear());
    const _bPeriod=_bYear.includes('.')?_bYear.replace('.','_'):_bYear+'_1';
    const boletimUrl=mat?`https://suap.ifma.edu.br/edu/aluno/${mat}/?tab=boletim&ano_periodo=${_bPeriod}&etapa=`:'';
    // Check if student belongs to an anon/IFEM turma
    const _clFound=findClass(activeClassId);
    const _clName=_clFound?.clase?.name||'';
    const _isAnonStudent=!_clName||/ifem/i.test(_clName)||/^-+$/.test(_clName.trim())||/sem\s*turma/i.test(_clName);

    let alertHtml='';
    if(temAlerta(s.transtorno))alertHtml+=`<span class="alert-badge alert-transtorno">⚠️ ${esc(String(s.transtorno))}</span>`;
    if(temAlerta(s.deficiencia))alertHtml+=`<span class="alert-badge alert-deficiencia">♿ ${esc(String(s.deficiencia))}</span>`;
    if(temAlerta(s.superdotacao))alertHtml+=`<span class="alert-badge alert-superdotacao">⭐ ${esc(String(s.superdotacao))}</span>`;

    // Classroom grid: 8 rows × 5 cols = 40 seats
    const av=getAvYear(s,activeYear||getActiveYear(s),activeBim);
    const myPos=av.seating&&typeof av.seating==='object'?av.seating:{x:-1,y:-1};

    // Bim buttons
    const bimBtns=[1,2,3,4].map(b=>`<button class="sd-bim-btn${b===activeBim?' active':''}" onclick="selectBim(${b})">${b}º Bimestre</button>`).join('');

    // Year buttons (from existing data + fixed set)
    const yrs=getStudentYears(s);
    if(!activeYear||!yrs.includes(activeYear)){activeYear=getActiveYear(s);}
    const yearBtns=yrs.map(y=>`<button class="sd-year-btn${y===activeYear?' active':''}" onclick="setStudentYear('${y}')">${esc(y)}</button>`).join('');

    det.innerHTML=`
      <div class="sd-left-col">
        <div class="sd-avatar" onclick="openPhotoPopup('${esc(s.foto||'')}','${esc(toTitleCase(s.nome))}')" title="Clique para ampliar">
          ${temFoto?`<img src="${esc(s.foto)}" alt="" onerror="this.style.display='none'">`:`<span style="font-size:2rem">${ini}</span>`}
        </div>
        <div class="sd-year-badge" id="sd-year-badge-display">${esc(activeYear)}</div>
        <div class="sd-mapa-box">
          <div class="sd-mapa-title">Mapa da Sala</div>
          <div class="classroom-label" style="margin-bottom:2px;font-size:.43rem">Toque onde o aluno senta</div>
          <div class="classroom-wrap">
            <div class="classroom-map" id="classroom-map" onclick="handleClassroomClick(event)">
              <!-- Background: visual guide only -->
              <div class="classroom-map-bg">
                <div class="cm-board-row">QUADRO</div>
                <div class="cm-seats-area">
                  ${Array.from({length:30},(_,i)=>'<div class="cm-desk"></div>').join('')}
                </div>
              </div>
              <!-- Position marker -->
              ${myPos.x>=0&&myPos.y>=0?`<div class="classroom-marker" style="left:${myPos.x}%;top:${myPos.y}%">★</div>`:''}
            </div>
          </div>
        </div>
        <div class="sd-sec-label">Bimestres</div>
        <div style="display:flex;flex-direction:column;gap:.18rem" id="bim-tabs">${bimBtns}</div>
        <div class="sd-sec-label">Anos Letivos</div>
        <div style="display:flex;flex-direction:column;gap:.15rem">${yearBtns}</div>
        ${canEdit()?`<button class="btn-s" style="font-size:.65rem;padding:.28rem;width:100%" onclick="openEditStudent()">✏️ Editar</button>`:''}
      </div>

      <div class="sd-main-col" style="position:relative">
        <div style="position:absolute;top:.35rem;right:.35rem;z-index:10;display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          <button id="_lockBtn" onclick="_toggleLock()" title="Edição bloqueada" style="background:#c62828;color:#fff;border:none;border-radius:20px;font-size:.7rem;font-weight:700;padding:.22rem .65rem;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.18);display:flex;align-items:center;gap:.3rem;transition:all .22s">🔒 Bloqueado</button>
          ${(()=>{const _clFound=findClass(activeClassId);const _isEv=_clFound&&(isEvasaoClass(_clFound.clase));return canEdit()&&!_isEv?`<button onclick="moverParaEvasao('${esc(s.id)}')" title="Mover para turma de Evasão" style="background:#fff5f5;border:1.5px solid #ef9a9a;border-radius:6px;color:#c62828;font-size:.62rem;font-weight:700;padding:.22rem .55rem;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.12)">🚪 Evasão</button>`:''})()}
          ${(()=>{
            // Mostra o botão SEMPRE que houver bimestre anterior com dados,
            // independente de a turma estar bloqueada — assim o usuário VÊ que
            // a função existe. Se estiver bloqueada e ele clicar, avisamos.
            const ref=_getReplicateSource(s, activeYear||getActiveYear(s), activeBim);
            if(!ref)return '';
            const lbl = ref.bim===4 && ref.year!==(activeYear||getActiveYear(s))
              ? `📋 Replicar 4º Bim de ${esc(ref.year)}`
              : `📋 Replicar ${ref.bim}º Bim`;
            const tooltip = `Copia todas as avaliações do ${ref.bim}º Bim de ${ref.year} para o ${activeBim}º Bim. Útil quando o aluno teve comportamento/desempenho parecido — você só edita o que mudou.`;
            return `<button data-replicate-btn="1" onclick="confirmReplicateBim()" title="${esc(tooltip)}" style="background:#fff3e0;border:1.5px solid #ffb74d;border-radius:6px;color:#e65100;font-size:.65rem;font-weight:700;padding:.28rem .7rem;cursor:pointer;box-shadow:0 1px 6px rgba(245,124,0,.2);display:flex;align-items:center;gap:.25rem">${lbl}</button>`;
          })()}
          <button onclick="confirmClearBim()" title="Limpar avaliações deste bimestre" style="background:#fff;border:1.5px solid #ef9a9a;border-radius:6px;color:#c62828;font-size:.62rem;font-weight:700;padding:.22rem .55rem;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.12)">🗑 Limpar Bimestre</button>
        </div>
        <div class="sd-student-header" style="position:relative">
          <div class="sd-name-big">${esc(toTitleCase(s.nome))}</div>
          <div class="sd-mat-line">
            ${mat?`<span style="font-family:'IBM Plex Mono',monospace">(${mat})</span>`:''}
            ${s.situacao?`<span class="situacao-badge ${sitCls}">${esc(s.situacao)}</span>`:''}
            ${boletimUrl?`<a href="${boletimUrl}" target="_blank" style="font-size:.7rem;font-weight:600;color:var(--blue);text-decoration:none">📊 Boletim SUAP →</a>`:''}
          </div>
          ${alertHtml?`<div class="alert-row">${alertHtml}</div>`:''}
        </div>
        <div class="sd-fields-bar">
          ${s.descricaoCurso||s.curso?`<div><div class="sd-field-lbl">Curso</div><div class="sd-field-val" title="${esc(s.descricaoCurso||s.curso||'')}">${esc(s.descricaoCurso||s.curso||'—')}</div></div>`:'<div></div>'}
          <div><div class="sd-field-lbl">Turma</div><div class="sd-field-val">${esc(s.siglaTurma||s.turma||'—')}</div></div>
          <div><div class="sd-field-lbl">Ano de Ingresso</div><div class="sd-field-val">${esc(s.anoIngresso||'—')}</div></div>
        </div>
        <div class="sd-2col" id="comp-desemp-row"></div>
        <div class="sd-2col" id="obs-disc-row" style="${_isAnonStudent?'display:none':''}" ></div>
        <div class="sd-2col" style="min-height:170px">
          <div class="ev-card">
            <div class="ev-card-title">Gráfico Bimestres</div>
            <div class="sd-chart-wrap"><canvas id="evol-chart"></canvas></div>
          </div>
          <div class="ev-card">
            <div class="ev-card-title" style="display:flex;align-items:center;gap:.35rem">Encaminhamentos <button class="lupa-trigger" onclick="openLupaEncam()" title="Ver/editar encaminhamentos">🔍</button></div>
            <div id="encam-card-body" style="display:flex;flex-direction:column;gap:.18rem;flex:1"></div>
            <div style="margin-top:auto;padding-top:.35rem;display:flex;justify-content:flex-end;gap:.3rem;flex-wrap:wrap">
              <button class="btn-s" style="font-size:.62rem;padding:.3rem .55rem;display:flex;align-items:center;gap:.25rem" onclick="printStudentPDF()" title="Resumo dos 4 bimestres, apenas com itens marcados">
                📄 Simplificado
              </button>
              <button class="btn-p" style="font-size:.62rem;padding:.3rem .55rem;display:flex;align-items:center;gap:.25rem" onclick="printStudentFullPDF()" title="Cópia da ficha do bimestre ativo, com todos os campos (para preencher à mão)">
                📋 Página Completa
              </button>
            </div>
          </div>
        </div>
      </div>`;

    loadBimData(s,activeBim);
    renderEvolChart(s);
    updateClassNavBar();
  }catch(e){toast('Erro: '+e.message,'err');console.error(e);}
}

function setStudentYear(y){
  const s=findStudentById(activeStudentId);if(!s)return;
  activeYear=y;
  activeBim=1;
  document.querySelectorAll('.sd-year-btn').forEach(b=>b.classList.toggle('active',b.textContent.trim()===y));
  const badge=document.getElementById('sd-year-badge-display');
  if(badge)badge.textContent=y;
  // Re-aplica o active no botão do bim 1 (sem isso, se você estava no 3º bim
  // do 2026 e troca pro 2025, o botão "3º Bimestre" continua azul/ativo)
  document.querySelectorAll('.sd-bim-btn').forEach(t=>{
    const n=+t.textContent.match(/\d+/)?.[0];
    t.classList.toggle('active', n===1);
  });
  loadBimData(s,1);
  // Re-pinta cores dos bim buttons baseado no ano novo + atualiza botão Replicar
  renderBimDots(s);
  _updateReplicateBtn(s);
  try{renderEvolChart(s);}catch(e){}
}

// renderYearChart removed — replaced by Encaminhamentos card

function updateClassNavBar(){
  const found=findClass(activeClassId);if(!found)return;
  const el=document.getElementById('class-nav-name');
  if(el)el.textContent='TURMA '+found.clase.name;
  // Update class nav arrows
  const allClasses=_getSortedAllClasses();
  const idx=allClasses.findIndex(cl=>cl.id===activeClassId);
  const pBtn=document.getElementById('class-prev-btn');
  const nBtn=document.getElementById('class-next-btn');
  if(pBtn)pBtn.disabled=false;
  if(nBtn)nBtn.disabled=false;
}

function _getSortedAllClasses(){
  // Mesma ordenação do sortTurmas: por curso (código) → nomeadas → anon → evasão
  const visible=getVisibleCourses();
  // Ordenar cursos pela chave de ordenação (Alimentos por último, depois de Administração)
  visible.sort((a,b)=>{
    const ca=getCourseSortKey(getNomeBase(a.name));
    const cb=getCourseSortKey(getNomeBase(b.name));
    return ca<cb?-1:ca>cb?1:0;
  });
  const all=[];
  visible.forEach(c=>{
    const sorted=[...c.classes];
    sortTurmas(sorted);
    all.push(...sorted);
  });
  return all;
}
function navigateClass(dir){
  const found=findClass(activeClassId);if(!found)return;
  const _baseName=getNomeBase(found.course.name);
  const courseClasses=getVisibleCourses()
    .filter(c=>getNomeBase(c.name)===_baseName)
    .flatMap(c=>c.classes);
  sortTurmas(courseClasses);
  const idx=courseClasses.findIndex(cl=>cl.id===activeClassId);
  const newIdx=(idx+dir+courseClasses.length)%courseClasses.length;
  openClass(courseClasses[newIdx].id);
}


function selectBim(b){
  // Flush save pendente do bimestre atual ANTES de trocar para outro.
  // Evita que o timer dispare depois e leia checkboxes já do bimestre novo.
  if(typeof flushPendingSave==='function') flushPendingSave();
  activeBim=b;
  document.querySelectorAll('.sd-bim-btn').forEach(t=>{
    const n=+t.textContent.match(/\d+/)?.[0];
    t.classList.toggle('active',n===b);
  });
  const s=findStudentById(activeStudentId);if(!s)return;
  loadBimData(s,b);
  // Re-pinta os botões de bimestre: limpa o style inline `color` (que ficava
  // `#fff` herdado do estado ativo anterior, deixando botões inativos brancos
  // sobre fundo branco = invisíveis) e re-aplica baseado no estado atual.
  renderBimDots(s);
  // Atualiza o botão "Replicar Xº Bim" para refletir o NOVO bimestre.
  // Sem isso, mudar do 2º para o 3º bim mantinha "Replicar 1º Bim" (errado).
  _updateReplicateBtn(s);
  try{renderEvolChart(s);}catch(e){}
}

// Atualiza in-place o botão "📋 Replicar Xº Bim" do cabeçalho da ficha.
// Reflete o estado atual (activeBim/activeYear) e o conteúdo do bimestre
// anterior. Removeu/criar dinâmico em vez de re-renderizar a ficha inteira.
function _updateReplicateBtn(s){
  const lockBtn = document.getElementById('_lockBtn');
  if(!lockBtn) return;
  const container = lockBtn.parentElement;
  if(!container) return;
  // Remove botão antigo (se existir)
  const old = container.querySelector('button[data-replicate-btn="1"]');
  if(old) old.remove();
  // Calcula o novo
  if(!s) return;
  const ref = _getReplicateSource(s, activeYear||getActiveYear(s), activeBim);
  if(!ref) return;
  const lbl = ref.bim===4 && ref.year!==(activeYear||getActiveYear(s))
    ? `📋 Replicar 4º Bim de ${esc(ref.year)}`
    : `📋 Replicar ${ref.bim}º Bim`;
  const tooltip = `Copia todas as avaliações do ${ref.bim}º Bim de ${ref.year} para o ${activeBim}º Bim. Útil quando o aluno teve comportamento/desempenho parecido — você só edita o que mudou.`;
  const btn = document.createElement('button');
  btn.setAttribute('data-replicate-btn','1');
  btn.onclick = confirmReplicateBim;
  btn.title = tooltip;
  btn.style.cssText = 'background:#fff3e0;border:1.5px solid #ffb74d;border-radius:6px;color:#e65100;font-size:.65rem;font-weight:700;padding:.28rem .7rem;cursor:pointer;box-shadow:0 1px 6px rgba(245,124,0,.2);display:flex;align-items:center;gap:.25rem';
  btn.textContent = lbl;
  // Insere ANTES do botão Limpar Bimestre, se existir; senão no fim
  const limparBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Limpar'));
  if(limparBtn) container.insertBefore(btn, limparBtn);
  else container.appendChild(btn);
}

function loadBimData(s,b){
  if(!s)return;
  const _yr=activeYear||getActiveYear(s);
  const av=getAvYear(s,_yr,b);
  _curComp=av.comp||0;_curDesemp=av.desemp||0;

  const cl=findClass(activeClassId);
  const schedDiscs=(db.schedules&&cl?.clase?.name&&db.schedules[cl.clase.name])||[];
  const allDiscs=[...new Set([...schedDiscs.map(d=>d.disc),...(cl?.clase?.teachers||[]).map(t=>t.disc||'')])].filter(Boolean);
  const disabled=canEdit()?'':' disabled';

  // Update bim tab active state
  document.querySelectorAll('.sd-bim-btn').forEach(btn=>{
    const n=+btn.textContent.trim().match(/\d+/)?.[0];
    btn.classList.toggle('active',n===b);
  });

  // ── COMPORTAMENTO + DESEMPENHO ──
  const row=document.getElementById('comp-desemp-row');
  if(row){
    row.innerHTML=`
    <div class="ev-card">
      <div class="ev-card-title" style="display:flex;align-items:center;gap:.35rem">Comportamento <button class="lupa-trigger" onclick="openLupaComp()" title="Aspectos positivos e negativos">🔍</button></div>
      <div class="classif-row" id="cl-comp" style="margin-bottom:.2rem">
        ${[1,2,3,4].map(v=>`<button class="classif-btn${_curComp===v?' sel-'+CLASSIF[v].cls:''}" data-val="${v}" onclick="setClassif('comp',${v})"${disabled}>${CLASSIF[v].label}</button>`).join('')}
      </div>
      <div style="font-size:.56rem;color:var(--green);font-weight:700;margin:.12rem 0 .08rem;text-transform:uppercase;letter-spacing:.05em">Aspectos Positivos</div>
      <div class="check-grid" style="grid-template-columns:repeat(3,1fr);gap:.08rem .2rem" id="comp-pos-grid" onchange="autoSaveDebounced()">
        ${COMP_POS.map(iss=>`<label class="check-item"><input type="checkbox" ${(av.compPos||[]).includes(iss)?'checked':''}${disabled}><span>${esc(iss)}</span></label>`).join('')}
      </div>
      <div style="border-top:1px solid var(--g5);margin:.18rem 0 .1rem"></div>
      <div style="font-size:.56rem;color:var(--red);font-weight:700;margin:0 0 .08rem;text-transform:uppercase;letter-spacing:.05em">Aspectos Negativos</div>
      <div class="check-grid" style="grid-template-columns:repeat(3,1fr);gap:.08rem .2rem" id="comp-issues-grid" onchange="autoSaveDebounced()">
        ${COMP_ISSUES.map(iss=>`<label class="check-item"><input type="checkbox" ${(av.compIssues||[]).includes(iss)?'checked':''}${disabled}><span>${esc(iss)}</span></label>`).join('')}
      </div>
    </div>
    <div class="ev-card">
      <div class="ev-card-title" style="display:flex;align-items:center;gap:.35rem">Desempenho <button class="lupa-trigger" onclick="openLupaDesemp()" title="Aspectos positivos e negativos">🔍</button></div>
      <div class="classif-row" id="cl-desemp" style="margin-bottom:.2rem">
        ${[1,2,3,4].map(v=>`<button class="classif-btn${_curDesemp===v?' sel-'+CLASSIF[v].cls:''}" data-val="${v}" onclick="setClassif('desemp',${v})"${disabled}>${CLASSIF[v].label}</button>`).join('')}
      </div>
      <div style="font-size:.56rem;color:var(--green);font-weight:700;margin:.12rem 0 .08rem;text-transform:uppercase;letter-spacing:.05em">Aspectos Positivos</div>
      <div class="check-grid" style="grid-template-columns:repeat(3,1fr);gap:.08rem .2rem" id="desemp-pos-grid" onchange="autoSaveDebounced()">
        ${DESEMP_POS.map(iss=>`<label class="check-item"><input type="checkbox" ${(av.despPos||[]).includes(iss)?'checked':''}${disabled}><span>${esc(iss)}</span></label>`).join('')}
      </div>
      <div style="border-top:1px solid var(--g5);margin:.18rem 0 .1rem"></div>
      <div style="font-size:.56rem;color:var(--red);font-weight:700;margin:0 0 .08rem;text-transform:uppercase;letter-spacing:.05em">Aspectos Negativos</div>
      <div class="check-grid" style="grid-template-columns:repeat(3,1fr);gap:.08rem .2rem" id="desemp-issues-grid" onchange="autoSaveDebounced()">
        ${DESEMP_ISSUES.map(iss=>`<label class="check-item"><input type="checkbox" ${(av.despIssues||[]).includes(iss)?'checked':''}${disabled}><span>${esc(iss)}</span></label>`).join('')}
      </div>
    </div>`;
  }

  // ── OBSERVAÇÕES + DISCIPLINAS ──
  const row2=document.getElementById('obs-disc-row');
  if(row2){
    // Apenas a observação do bimestre ativo
    const obsAtual=getAvYear(s,_yr,b)?.obs||'';
    const rdOnly=(!canEdit())?'readonly':disabled;
    const obsRow=`<div class="obs-bim-row" style="flex:1">
      <textarea class="obs-bim-input" rows="3"
        placeholder="Observação do ${b}º bimestre..."
        id="obs-bim-${b}" ${rdOnly}
        style="width:100%;resize:none;line-height:1.45;${canEdit()?'border-color:var(--green);background:#fff;':'background:var(--g6);color:var(--g3);'}cursor:${canEdit()?'text':'default'}"
        ${canEdit()?'oninput="autoSaveDebounced()"':''}
      >${esc(obsAtual)}</textarea>
    </div>`;

    const discSaved=av.disciplinas||[];
    const discObsSaved=av.disciplinasObs||{};
    const temTodas=discSaved.includes('__todas__');
    const visDiscs=discSaved.filter(d=>d!=='__todas__');
    const discItems=(temTodas||visDiscs.length)
      ? (temTodas?`<div style="display:flex;flex-direction:column;gap:.08rem;background:#fff5f5;border-radius:6px;padding:.3rem .5rem;border-left:3px solid #c62828"><span style="font-size:.68rem;font-weight:700;color:#c62828">📌 Todas as disciplinas</span></div>`:'')
        +visDiscs.map(d=>{
          const obs=discObsSaved[d]||'';
          return `<div style="display:flex;flex-direction:column;gap:.08rem;background:#e8f5e9;border-radius:6px;padding:.3rem .5rem;border-left:3px solid var(--green)">
            <span style="font-size:.68rem;font-weight:700;color:var(--green)">📌 ${esc(d)}</span>
            ${obs?`<span style="font-size:.6rem;color:var(--g2);font-style:italic">${esc(obs)}</span>`:''}
          </div>`;
        }).join('')
      : '';
    // Grid oculto para compatibilidade com autoSave (sem checkboxes visíveis)
    const discChecks=`<div id="disc-issues-grid" style="display:none">${allDiscs.map(d=>`<label class="check-item"><input type="checkbox" ${discSaved.includes(d)?'checked':''}><span>${esc(d)}</span></label>`).join('')}</div>`;

    row2.innerHTML=`
    <div class="ev-card">
      <div class="ev-card-title" style="display:flex;align-items:center;gap:.35rem">Observações <button class="lupa-trigger" onclick="openLupaObs()" title="Editar observação do bimestre atual">🔍</button></div>
      <div style="display:flex;flex-direction:column;gap:.18rem;flex:1">${obsRow}</div>
    </div>
    <div class="ev-card">
      <div class="ev-card-title" style="display:flex;align-items:center;gap:.35rem">Disciplinas com Dificuldades <button class="lupa-trigger" onclick="openLupaDisc()" title="Ver/editar disciplinas marcadas">🔍</button></div>
      ${canEdit()?`<div style="display:flex;gap:.3rem;margin-bottom:.25rem"><input id="disc-add-input" type="text" style="flex:1;font-family:Sora,sans-serif;font-size:.7rem;border:1.5px solid var(--g5);border-radius:var(--rs);padding:.22rem .4rem" placeholder="+ Qualquer disciplina (ex: de outra turma)" title="Você pode cadastrar qualquer disciplina, inclusive de outras turmas que o aluno esteja cursando" onkeydown="if(event.key==='Enter')addCustomDisc()"><button class="btn-p" style="font-size:.6rem;padding:.22rem .45rem" onclick="addCustomDisc()">+</button></div>`:''}
      <div style="display:flex;flex-direction:column;gap:.18rem">${discItems||'<span style="font-size:.68rem;color:var(--g3)">Nenhuma disciplina marcada</span>'}</div>
      ${discChecks}
      
    </div>`;
  }

  // ── ENCAMINHAMENTOS ──
  const encCard=document.getElementById('encam-card-body');
  if(encCard){
    const encSaved=av.encaminhamentos||[];
    const encObsSaved=av.encaminhamentosObs||{};
    const outroPrev=av.encaminhamentosOutro||'';
    // Lista verde dos marcados
    const encItems=encSaved.filter(e=>e!==ENCAM_OUTRO_KEY).map(e=>{
      const obs=encObsSaved[e]||'';
      return `<div style="display:flex;flex-direction:column;gap:.08rem;background:#e8f5e9;border-radius:6px;padding:.3rem .5rem;border-left:3px solid var(--green)">
        <span style="font-size:.68rem;font-weight:700;color:var(--green)">📋 ${esc(e)}</span>
        ${obs?`<span style="font-size:.6rem;color:var(--g2);font-style:italic">${esc(obs)}</span>`:''}
      </div>`;
    }).join('');
    const outroPrevHtml=outroPrev?`<div style="display:flex;flex-direction:column;gap:.08rem;background:#e8f5e9;border-radius:6px;padding:.3rem .5rem;border-left:3px solid var(--green)"><span style="font-size:.68rem;font-weight:700;color:var(--green)">📋 Outro</span><span style="font-size:.6rem;color:var(--g2);font-style:italic">${esc(outroPrev)}</span></div>`:'' ;
    // Grid oculto para autoSave
    encCard.innerHTML=`
      <div style="display:flex;flex-direction:column;gap:.25rem;flex:1">
        ${encItems+outroPrevHtml||'<span style="font-size:.65rem;color:var(--g3);font-style:italic">Nenhum marcado — clique em 🔍</span>'}
      </div>
      <div id="encam-grid" style="display:none" onchange="autoSaveDebounced()">
        ${ENCAMINHAMENTOS.map(e=>`<label class="check-item"><input type="checkbox" ${encSaved.includes(e)?'checked':''}><span>${esc(e)}</span></label>`).join('')}
        <label class="check-item"><input type="checkbox" id="encam-outro-cb" ${encSaved.includes(ENCAM_OUTRO_KEY)?'checked':''}><span>Outro</span></label>
        <input type="text" id="encam-outro-txt" value="${esc(outroPrev)}" oninput="autoSaveDebounced()">
      </div>
    `;}

  // Hidden compat textarea
  let obsT=document.getElementById('obs-txt');
  if(!obsT){obsT=document.createElement('textarea');obsT.id='obs-txt';obsT.style.display='none';document.body.appendChild(obsT);}
  obsT.value=av.obs||'';

  // ── Update classroom map marker for this bimester ──
  const map=document.getElementById('classroom-map');
  if(map){
    let marker=map.querySelector('.classroom-marker');
    const seat=av.seating&&typeof av.seating==='object'?av.seating:{x:-1,y:-1};
    if(seat.x>=0&&seat.y>=0){
      if(!marker){marker=document.createElement('div');marker.className='classroom-marker';map.appendChild(marker);}
      marker.style.left=seat.x+'%';
      marker.style.top=seat.y+'%';
      marker.textContent='★';
      marker.style.display='';
    } else {
      if(marker)marker.style.display='none';
    }
  }
}

function addCustomDisc(){
  const inp=document.getElementById('disc-add-input');if(!inp)return;
  const val=inp.value.trim();if(!val)return;
  const s=findStudentById(activeStudentId);if(!s)return;
  const _discYr=activeYear||getActiveYear(s);
  const prevDisc=getAvYear(s,_discYr,activeBim);
  const d=[...(prevDisc.disciplinas||[])];
  if(!d.includes(val)){d.push(val);setAvYear(s,_discYr,activeBim,{...prevDisc,disciplinas:d});saveDB();loadBimData(s,activeBim);}
  inp.value='';
}

function removeDisc(idx){
  const s=findStudentById(activeStudentId);if(!s)return;
  const _remYr=activeYear||getActiveYear(s);
  const prev=getAvYear(s,_remYr,activeBim);
  const d=[...(prev.disciplinas||[])];
  d.splice(idx,1);
  setAvYear(s,_remYr,activeBim,{...prev,disciplinas:d});
  saveDB();loadBimData(s,activeBim);
}

function saveAllObs(){
  const s=findStudentById(activeStudentId);if(!s)return;
  if(!s.avaliacoes)s.avaliacoes={};
  // Save only the active bimester obs
  const obsInput=document.getElementById('obs-bim-'+activeBim);
  const val=(obsInput?.value||'').trim();
  const _obsYr=activeYear||getActiveYear(s);
  const prevObs=getAvYear(s,_obsYr,activeBim);
  setAvYear(s,_obsYr,activeBim,{...prevObs,obs:val});
  // Update hidden compat field
  const obsT=document.getElementById('obs-txt');if(obsT)obsT.value=val;
  saveDB();renderBimDots(s);
  toast('✅ Observação salva!','ok');
}

function setClassif(field,val){
  if(!canEdit())return;
  // Toggle: clicar no MESMO valor já selecionado desmarca (volta a 0)
  if(field==='comp'){
    _curComp = (_curComp===val ? 0 : val);
  } else {
    _curDesemp = (_curDesemp===val ? 0 : val);
  }
  ['comp','desemp'].forEach(f=>{
    const cur=f==='comp'?_curComp:_curDesemp;
    document.getElementById('cl-'+f)?.querySelectorAll('.classif-btn').forEach(btn=>{
      const v=+btn.dataset.val;btn.className='classif-btn'+(cur===v?' sel-'+CLASSIF[v].cls:'');
    });
  });
  saveEval(true);
}

function handleClassroomClick(e){
  e.preventDefault();e.stopPropagation();
  const s=findStudentById(activeStudentId);if(!s)return;
  const map=document.getElementById('classroom-map');if(!map)return;
  // Use offsetX/offsetY if available (more accurate), fallback to clientX
  let rx,ry;
  if(e.offsetX!==undefined&&e.offsetX>=0&&e.offsetY!==undefined){
    rx=(e.offsetX/map.offsetWidth)*100;
    ry=(e.offsetY/map.offsetHeight)*100;
  } else {
    const rect=map.getBoundingClientRect();
    rx=((e.clientX-rect.left)/rect.width)*100;
    ry=((e.clientY-rect.top)/rect.height)*100;
  }
  const xC=Math.max(1,Math.min(99,Math.round(rx)));
  const yC=Math.max(1,Math.min(99,Math.round(ry)));
  const _seatYr=activeYear||getActiveYear(s);
  const prev=getAvYear(s,_seatYr,activeBim);
  const existing=prev.seating&&typeof prev.seating==='object'?prev.seating:{x:-1,y:-1};
  const dist=existing.x>=0?Math.sqrt(Math.pow(xC-existing.x,2)+Math.pow(yC-existing.y,2)):999;
  const newSeat=dist<10&&existing.x>=0?{x:-1,y:-1}:{x:xC,y:yC};
  // Save immediately — full object copy to avoid reference sharing
  const newAv={...JSON.parse(JSON.stringify(prev)),seating:newSeat};
  if(!s.avaliacoes)s.avaliacoes={};
  if(!s.avaliacoes[_seatYr])s.avaliacoes[_seatYr]={};
  s.avaliacoes[_seatYr][activeBim]=newAv;
  saveDB();
  // Update marker in DOM immediately
  let marker=map.querySelector('.classroom-marker');
  if(newSeat.x>=0){
    if(!marker){marker=document.createElement('div');marker.className='classroom-marker';map.appendChild(marker);}
    marker.style.left=newSeat.x+'%';
    marker.style.top=newSeat.y+'%';
    marker.textContent='★';
    marker.style.display='';
    // Flash feedback
    marker.style.transform='translate(-50%,-50%) scale(1.4)';
    setTimeout(()=>{marker.style.transform='translate(-50%,-50%) scale(1)';},150);
  } else {
    if(marker){marker.style.display='none';}
  }
}

function setSeating(pos){}  // legacy stub

let _autoSaveTimer=null;
let _autoSaveUpdateChart=false;

// Save imediato, sem debounce (regra SGA).
// Qualquer mudança em checkbox/texto dispara gravação na hora.
// O saveDB() já envia ao servidor via schedulePatchSave (também imediato).
function autoSaveDebounced(){
  if(!canEdit())return;
  if(_autoSaveTimer){ clearTimeout(_autoSaveTimer); _autoSaveTimer=null; }
  saveEval(false);
}

function autoSaveDebouncedWithChart(){
  if(!canEdit())return;
  if(_autoSaveTimer){ clearTimeout(_autoSaveTimer); _autoSaveTimer=null; }
  saveEval(true);
}

// Força a gravação imediata de qualquer save pendente no timer (se houver).
// Deve ser chamado antes de qualquer navegação que desmonte a ficha atual
// (trocar de aluno, bimestre, turma, ou sair da tela).
// Fluxes tanto o timer do saveEval quanto os timers de debounce de rede.
function flushPendingSave(){
  if(_autoSaveTimer){
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer=null;
    try{ saveEval(false); }catch(e){ console.warn('flushPendingSave saveEval:', e); }
  }
  // Não força save até o primeiro pull pós-login completar (evita overwrite
  // com cache velho). Mesmo se houver timers pendentes, eles serão re-agendados
  // quando _initialPullDone virar true.
  if(!_initialPullDone) return;
  // Força envio imediato se há um save debounced pendente (em vez de esperar
  // os 1.5s). Navegar embora de uma ficha deve gravar AGORA, não depois.
  if(_saveDebounceTimer){
    clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer=null;
    if(_saveInFlight) _saveQueued = true;
    else _doSave();
  }
  // Mesma coisa para o save do núcleo (admin)
  if(_coreSaveDebounceTimer){
    clearTimeout(_coreSaveDebounceTimer);
    _coreSaveDebounceTimer=null;
    // Força execução imediata: chama scheduleCoreSave de novo num fluxo síncrono.
    // Como o timer foi limpo, ele vai cair direto na execução agendada.
    try{
      if(curUser?.role==='admin'){
        buildCoreSnapshotAsync().then(core=>phpPost('save_core', core).catch(()=>{}));
      }
    }catch(e){ console.warn('flushPendingSave core:', e); }
  }
}

function saveEval(updateChart=false){
  if(!canEdit()){toast('Sem permissão para avaliar','err');return;}
  try{
    const s=findStudentById(activeStudentId);if(!s)return;
    if(!s.avaliacoes)s.avaliacoes={};
    // obs from active bim input
    const obsInput=document.getElementById('obs-bim-'+activeBim);
    const obs=(obsInput?.value??document.getElementById('obs-txt')?.value??'').trim();
    const compPos=COMP_POS.filter((_,i)=>document.querySelectorAll('#comp-pos-grid input')[i]?.checked);
    const compIssues=COMP_ISSUES.filter((_,i)=>document.querySelectorAll('#comp-issues-grid input')[i]?.checked);
    const despPos=DESEMP_POS.filter((_,i)=>document.querySelectorAll('#desemp-pos-grid input')[i]?.checked);
    const despIssues=DESEMP_ISSUES.filter((_,i)=>document.querySelectorAll('#desemp-issues-grid input')[i]?.checked);
    // disc: combine checked from schedule + custom saved items
    const discInputs=document.querySelectorAll('#disc-issues-grid input');
    const cl=findClass(activeClassId);
    const schedDiscs=(db.schedules&&cl?.clase?.name&&db.schedules[cl.clase.name])||[];
    const allDiscs=[...new Set([...schedDiscs.map(d=>d.disc),...(cl?.clase?.teachers||[]).map(t=>t.disc||'')])].filter(Boolean);
    const checkedDiscs=allDiscs.filter((_,i)=>discInputs[i]?.checked);
    // Keep custom discs (those not in schedule list) already saved
    const _saveYr=activeYear||getActiveYear(s);
    const prevData=getAvYear(s,_saveYr,activeBim);
    const prevDiscs=prevData.disciplinas||[];
    const customDiscs=prevDiscs.filter(d=>!allDiscs.includes(d));
    const disciplinas=[...new Set([...checkedDiscs,...customDiscs])];
    const encaminhamentos=ENCAMINHAMENTOS.filter(e=>document.querySelector(`#encam-grid input[type=checkbox]`+`[data-encam='${e}']`)?.checked||
      [...document.querySelectorAll('#encam-grid input[type=checkbox]')].find(cb=>cb.closest('label')?.textContent.trim().startsWith(e.substring(0,8)))?.checked||false);
    // Simpler: read in order
    const _encamCbs=[...document.querySelectorAll('#encam-grid input[type=checkbox]')];
    const encaminhamentosClean=ENCAMINHAMENTOS.filter((_,i)=>_encamCbs[i]?.checked);
    const outroCb=document.getElementById('encam-outro-cb');
    const outroTxt=(document.getElementById('encam-outro-txt')?.value||'').trim();
    if(outroCb?.checked)encaminhamentosClean.push(ENCAM_OUTRO_KEY);
    const encaminhamentosOutro=outroTxt;
    const prevSeating=prevData.seating&&typeof prevData.seating==='object'?prevData.seating:{x:-1,y:-1};
    const _discObsCurr=getAvYear(s,_saveYr,activeBim)?.disciplinasObs||{};
    const _encamObsCurr=getAvYear(s,_saveYr,activeBim)?.encaminhamentosObs||{};
    setAvYear(s,_saveYr,activeBim,{comp:_curComp,desemp:_curDesemp,obs,compPos,compIssues,despPos,despIssues,encaminhamentos:encaminhamentosClean,encaminhamentosOutro,disciplinas,disciplinasObs:_discObsCurr,encaminhamentosObs:_encamObsCurr,seating:prevSeating});
    saveDB();
    renderBimDots(s);
    renderList();
    // Only re-render chart when comp/desemp rating changed
    if(updateChart){try{renderEvolChart(s);}catch(e2){console.warn('evol chart:',e2);}}

    addActivityLog('edit',`Avaliação ${activeBim}º bim — ${toTitleCase(s.nome)}: Comp=${CLASSIF_LABEL[_curComp]}, Desemp=${CLASSIF_LABEL[_curDesemp]}`);
    toast('✅ Avaliação salva!','ok');
  }catch(e){toast('Erro: '+e.message,'err');console.error(e);}
}

function confirmClearBim(){
  const s=findStudentById(activeStudentId);if(!s)return;
  const nome=toTitleCase(s.nome).split(' ')[0];
  confirmAction(
    'Limpar avaliação',
    `Apagar todos os dados do ${activeBim}º Bimestre de ${nome} (${activeYear||getActiveYear(s)})? Esta ação não pode ser desfeita.`,
    ()=>{
      const _clrYr=activeYear||getActiveYear(s);
      if(s.avaliacoes?.[_clrYr]?.[activeBim]){
        s.avaliacoes[_clrYr][activeBim]={comp:0,desemp:0,obs:'',compPos:[],compIssues:[],despPos:[],despIssues:[],encaminhamentos:[],encaminhamentosOutro:'',disciplinas:[],seating:{x:-1,y:-1}};
      }
      _curComp=0;_curDesemp=0;
      saveDB();
      loadBimData(s,activeBim);
      renderBimDots(s);
      try{renderEvolChart(s);}catch(e){}
      toast('🗑 Bimestre limpo','warn');
    }
  );
}

// Determina qual bimestre e ano serve de FONTE para replicar no bimestre atual.
// Regras:
//   - 2º, 3º, 4º bim → bimestre anterior do MESMO ano
//   - 1º bim         → 4º bim do ANO ANTERIOR (se houver dados)
// Retorna { year: 'YYYY', bim: 1..4 } ou null se não há fonte preenchida.
//
// Importante: o aluno pode estar em uma turma diferente do ano anterior
// (transição natural — ex: 111-I em 2025 → 211-I em 2026). Por isso a busca
// é direta em `s.avaliacoes` (struct do aluno), independente da turma onde
// ele está agora. Avaliações ficam atreladas ao aluno, não à turma.
function _getReplicateSource(s, currentYear, currentBim){
  if(!s || !currentYear || !currentBim) return null;
  // Helper: retorna true se o objeto de avaliação tem qualquer dado preenchido
  const hasData = av => !!av && (
    av.comp>0 || av.desemp>0 ||
    (av.compPos||[]).length || (av.compIssues||[]).length ||
    (av.despPos||[]).length || (av.despIssues||[]).length ||
    (av.disciplinas||[]).length || (av.encaminhamentos||[]).length ||
    (av.obs||'').trim() || (av.encaminhamentosOutro||'').trim()
  );
  if(currentBim>1){
    const prevBim = currentBim-1;
    const prev = s.avaliacoes?.[currentYear]?.[prevBim];
    return hasData(prev) ? { year: currentYear, bim: prevBim } : null;
  }
  // currentBim === 1: tenta o 4º bim do ano anterior
  const prevYear = String(parseInt(currentYear,10)-1);
  const prev = s.avaliacoes?.[prevYear]?.[4];
  return hasData(prev) ? { year: prevYear, bim: 4 } : null;
}

// Copia todas as avaliações do bimestre de REFERÊNCIA para o bimestre atual.
// Referência: ver _getReplicateSource (bimestre anterior do mesmo ano, ou
// 4º bim do ano anterior quando estamos no 1º bim).
// Se o bimestre atual já tem dados, pede confirmação antes de sobrescrever.
function confirmReplicateBim(){
  if(!canEdit()){
    if(_classLocked){
      toast('🔒 Desbloqueie a edição primeiro (clique no cadeado vermelho no topo)','warn');
    } else {
      toast('Sem permissão para editar esta turma','err');
    }
    return;
  }
  const s=findStudentById(activeStudentId);if(!s)return;
  const _yr=activeYear||getActiveYear(s);
  const ref = _getReplicateSource(s, _yr, activeBim);
  if(!ref){
    if(activeBim===1){
      toast('Sem registros do 4º Bimestre do ano anterior para replicar','warn');
    } else {
      toast(`O ${activeBim-1}º Bimestre está vazio — nada a replicar`,'warn');
    }
    return;
  }
  const prev = s.avaliacoes[ref.year][ref.bim];
  const cur=s.avaliacoes?.[_yr]?.[activeBim];
  const curHasData = cur && (
    cur.comp>0 || cur.desemp>0 ||
    (cur.compPos||[]).length || (cur.compIssues||[]).length ||
    (cur.despPos||[]).length || (cur.despIssues||[]).length ||
    (cur.disciplinas||[]).length || (cur.encaminhamentos||[]).length ||
    (cur.obs||'').trim() || (cur.encaminhamentosOutro||'').trim()
  );
  const nome=toTitleCase(s.nome).split(' ')[0];
  const refLabel = ref.year === _yr
    ? `${ref.bim}º Bimestre`
    : `${ref.bim}º Bimestre de ${ref.year}`;
  const msg = curHasData
    ? `O ${activeBim}º Bimestre de ${nome} já tem dados preenchidos. Deseja SOBRESCREVER com a cópia do ${refLabel}? Esta ação não pode ser desfeita.`
    : `Copiar todas as avaliações do ${refLabel} de ${nome} para o ${activeBim}º Bimestre? Você poderá editar livremente depois.`;
  confirmAction(
    `📋 Replicar ${refLabel}`,
    msg,
    ()=>{
      // Cópia profunda dos campos (não compartilha referências de arrays/objetos)
      const copia = {
        comp: prev.comp || 0,
        desemp: prev.desemp || 0,
        obs: prev.obs || '',
        compPos: [...(prev.compPos||[])],
        compIssues: [...(prev.compIssues||[])],
        despPos: [...(prev.despPos||[])],
        despIssues: [...(prev.despIssues||[])],
        disciplinas: [...(prev.disciplinas||[])],
        disciplinasObs: {...(prev.disciplinasObs||{})},
        encaminhamentos: [...(prev.encaminhamentos||[])],
        encaminhamentosObs: {...(prev.encaminhamentosObs||{})},
        encaminhamentosOutro: prev.encaminhamentosOutro || '',
        seating: prev.seating ? {...prev.seating} : {x:-1,y:-1}
      };
      setAvYear(s, _yr, activeBim, copia);
      _curComp = copia.comp;
      _curDesemp = copia.desemp;
      saveDB();
      loadBimData(s, activeBim);
      renderBimDots(s);
      try{renderEvolChart(s);}catch(e){}
      toast(`📋 ${refLabel} replicado para o ${activeBim}º`,'ok');
      addActivityLog('replicate',`Replicou ${refLabel}→${activeBim}º Bim de ${toTitleCase(s.nome)}`);
    }
  );
}

function clearEval(){
  _curComp=0;_curDesemp=0;
  ['comp','desemp'].forEach(f=>{document.getElementById('cl-'+f)?.querySelectorAll('.classif-btn').forEach(btn=>btn.className='classif-btn');});
  document.getElementById('obs-txt') && (document.getElementById('obs-txt').value='');
  document.querySelectorAll('#eval-card input[type=checkbox]').forEach(cb=>cb.checked=false);
}

function renderBimDots(s){
  const _dotYr=activeYear||getActiveYear(s);
  document.querySelectorAll('.sd-bim-btn').forEach(btn=>{
    const n=+btn.textContent.trim().match(/\d+/)?.[0];if(!n)return;
    const av=s.avaliacoes?.[_dotYr]?.[n];
    const hasDone=av&&(av.comp>0||av.desemp>0);
    const hasPartial=av?.obs&&!hasDone;
    // Update button text with indicator
    const base=n+'º Bimestre';
    btn.textContent=base+(hasDone?' ●':hasPartial?' ◐':'');
    // SEMPRE define cor explícita. Antes deixávamos `''` (vazio) quando o
    // bimestre estava sem dados, mas se o botão TINHA sido ativo (color:#fff
    // inline) e foi desativado, o inline persistia e o texto sumia (branco
    // sobre fundo branco). Agora limpamos com removeProperty.
    if(btn.classList.contains('active')){
      btn.style.color = '#fff';
    } else if(hasDone){
      btn.style.color = 'var(--green)';
    } else if(hasPartial){
      btn.style.color = 'var(--yel)';
    } else {
      // remove o inline para o CSS base (.sd-bim-btn { color: var(--g2) }) valer
      btn.style.removeProperty('color');
    }
  });
}

// ══════════════════ CHART ══════════════════
function renderEvolChart(s){
  const canvas=document.getElementById('evol-chart');if(!canvas)return;
  if(evolChart){evolChart.destroy();evolChart=null;}
  const _eYr=activeYear||getActiveYear(s);
  const labels=['1º Bim','2º Bim','3º Bim','4º Bim'];
  const comp=labels.map((_,i)=>{const v=s.avaliacoes?.[_eYr]?.[i+1]?.comp;return(v&&v>0)?v:null;});
  const desemp=labels.map((_,i)=>{const v=s.avaliacoes?.[_eYr]?.[i+1]?.desemp;return(v&&v>0)?v:null;});
  const obsTexts=labels.map((_,i)=>s.avaliacoes?.[_eYr]?.[i+1]?.obs||'');
  evolChart=new Chart(canvas.getContext('2d'),{
    type:'line',
    data:{labels,datasets:[
      {label:'Comportamento',data:comp,borderColor:'#2E7D32',backgroundColor:'rgba(46,125,50,.1)',tension:.35,pointRadius:5,pointHoverRadius:7,fill:true,spanGaps:false,borderWidth:2,pointBackgroundColor:comp.map(v=>({1:'#E65100',2:'#F9A825',3:'#2E7D32',4:'#1565C0'})[v]||'#2E7D32'),pointBorderColor:'#fff',pointBorderWidth:1.5,clip:false},
      {label:'Desempenho',data:desemp,borderColor:'#C8960C',backgroundColor:'rgba(200,150,12,.08)',tension:.35,pointRadius:5,pointHoverRadius:7,fill:true,spanGaps:false,borderWidth:2,pointBackgroundColor:desemp.map(v=>({1:'#E65100',2:'#F9A825',3:'#2E7D32',4:'#1565C0'})[v]||'#C8960C'),pointBorderColor:'#fff',pointBorderWidth:1.5,clip:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      clip:false,
      layout:{padding:{top:16,bottom:4,left:2,right:8}},
      plugins:{legend:{labels:{font:{family:'Sora',size:9},usePointStyle:true}},
        tooltip:{callbacks:{label(c){const lbs=['','Ruim','Regular','Bom','Excelente'];return ' '+c.dataset.label+': '+(lbs[Math.round(c.parsed.y)]||'—');}}}
      },
      scales:{
        y:{
          min:0,max:4,
          afterBuildTicks(ax){ax.ticks=[{value:1},{value:2},{value:3},{value:4}];},
          ticks:{font:{size:9},padding:4,callback(v){const lbs=['','Ruim','Regular','Bom','Excelente'];return lbs[Math.round(v)]||'';}},
          grid:{color:'rgba(0,0,0,.06)'}
        },
        x:{ticks:{font:{size:9}},grid:{display:false}}
      }
    }
  });
}

// ══════════════════ PHOTO ══════════════════
function openPhotoPopup(url,nome){
  if(url){const p=document.getElementById('photo-popup');document.getElementById('photo-popup-img').src=url;p.classList.add('show');}
  else if(canEdit()){document.getElementById('photo-input').click();}
}
function closePhotoPopup(){document.getElementById('photo-popup').classList.remove('show');}
function handlePhotoUpload(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{const s=findStudentById(activeStudentId);if(!s)return;s.foto=ev.target.result;saveDB();renderStudentDetail();toast('Foto atualizada!','ok');};
  r.readAsDataURL(f);e.target.value='';
}

// ══════════════════ EDIT STUDENT ══════════════════
function openEditStudent(){
  if(!canEdit()){toast('Sem permissão','err');return;}
  const s=findStudentById(activeStudentId);if(!s)return;
  document.getElementById('em-nome').value=toTitleCase(s.nome);
  document.getElementById('em-matricula').value=s.matricula||'';
  document.getElementById('em-campus').value=s.campus||'';
  document.getElementById('em-nascimento').value=s.dataNascimento||'';
  document.getElementById('em-deficiencia').value=s.deficiencia||'';
  document.getElementById('em-transtorno').value=s.transtorno||'';
  document.getElementById('em-superdotacao').value=s.superdotacao||'';
  document.getElementById('em-foto').value=s.foto&&s.foto.startsWith('http')?s.foto:'';
  // Resetar checkbox de "outros cursos" e popular dropdown de turma
  const otherCb=document.getElementById('em-other-courses-cb');
  if(otherCb)otherCb.checked=false;
  populateEmTurmaSelect();
  openModal('edit-student-modal');
}

// Popula o dropdown de turma no modal de editar aluno.
// Por padrão: apenas turmas do mesmo curso do aluno (mesmo getGroupKey — inclui todas as modalidades).
// Com o checkbox marcado: todas as turmas de todos os cursos técnicos, agrupadas por curso (optgroup)
// e ordenadas pelo código de curso (0-9).
function populateEmTurmaSelect(){
  const sel=document.getElementById('em-turma-select');if(!sel)return;
  const showAll=document.getElementById('em-other-courses-cb')?.checked;
  sel.innerHTML='';
  const curCl=findClass(activeClassId);if(!curCl)return;
  const curGroupKey=getGroupKey(curCl.course.name);

  // Filtra cursos técnicos, aplicando o filtro de mesmo curso quando não estiver mostrando todos
  let courses=db.courses.filter(c=>{
    if(!ehCursoTecnico(c))return false;
    if(showAll)return true;
    return getGroupKey(c.name)===curGroupKey;
  });
  // Ordena por código de curso (1-9, depois 0=Alimentos, depois sem código)
  courses=[...courses].sort((a,b)=>{
    const ca=getCourseSortKey(a.name);
    const cb=getCourseSortKey(b.name);
    if(ca!==cb)return ca<cb?-1:1;
    return a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'});
  });

  if(showAll){
    // Agrupa por curso — cada curso vira um <optgroup>
    courses.forEach(c=>{
      const og=document.createElement('optgroup');
      og.label=c.name;
      const sorted=[...c.classes];
      sortTurmas(sorted);
      sorted.forEach(cl=>{
        const opt=document.createElement('option');
        opt.value=cl.id;
        opt.textContent=cl.name+(cl.id===activeClassId?'  (atual)':'');
        opt.selected=cl.id===activeClassId;
        og.appendChild(opt);
      });
      if(og.children.length)sel.appendChild(og);
    });
  } else {
    // Lista única — todas as turmas do mesmo curso, ordenadas por modalidade/ano
    const allClasses=courses.flatMap(c=>c.classes);
    sortTurmas(allClasses);
    allClasses.forEach(cl=>{
      const opt=document.createElement('option');
      opt.value=cl.id;
      opt.textContent=cl.name+(cl.id===activeClassId?'  (atual)':'');
      opt.selected=cl.id===activeClassId;
      sel.appendChild(opt);
    });
  }
}
function saveEditStudent(){
  const s=findStudentById(activeStudentId);if(!s)return;
  s.nome=document.getElementById('em-nome').value.trim()||s.nome;
  s.matricula=document.getElementById('em-matricula').value.trim();
  s.campus=document.getElementById('em-campus').value.trim();
  s.dataNascimento=document.getElementById('em-nascimento').value.trim();
  s.deficiencia=document.getElementById('em-deficiencia').value.trim();
  s.transtorno=document.getElementById('em-transtorno').value.trim();
  s.superdotacao=document.getElementById('em-superdotacao').value.trim();
  const novaFoto=document.getElementById('em-foto').value.trim();
  if(novaFoto)s.foto=novaFoto;
  // Move to different class if needed.
  // Comportamento: o usuário PERMANECE na turma de origem (estava avaliando
  // aluno por aluno daquela turma). O aluno transferido é simplesmente
  // removido da lista de alunos visíveis. Para acessá-lo depois, basta
  // navegar até a turma de destino.
  const newClid=document.getElementById('em-turma-select').value;
  let foiTransferido = false;
  if(newClid&&newClid!==activeClassId){
    const oldCl=findClass(activeClassId);if(oldCl){oldCl.clase.students=oldCl.clase.students.filter(st=>st.id!==s.id);}
    const newCl=findClass(newClid);if(newCl){newCl.clase.students.push(s);}
    foiTransferido = true;
  }
  saveDB();
  closeModal('edit-student-modal');
  if(foiTransferido){
    // Aluno saiu desta turma — volta para a visão geral da turma de origem
    activeStudentId = null;
    const cur = findClass(activeClassId);
    listStudents = cur ? (cur.clase.students||[]).slice() : [];
    showClassOverview();
    renderList();
    toast(`Aluno transferido. Você continua na turma atual.`,'ok');
  } else {
    renderStudentDetail();
    renderList();
    toast('Dados atualizados!','ok');
  }
  addActivityLog('edit',`Aluno editado: ${toTitleCase(s.nome)}${foiTransferido?' (transferido)':''}`);
}


