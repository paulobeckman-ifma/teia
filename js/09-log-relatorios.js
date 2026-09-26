// ══════════════════ LOG ══════════════════
// ═══════════════════════ LOG DE ATIVIDADES ═══════════════════════
// O log fica em conselho_dados/log.json (no servidor) e também em localStorage
// (para operação offline). O servidor é a fonte de verdade quando online; o
// localStorage funciona como cache e fallback.
function _getLogsLocal(){try{return JSON.parse(localStorage.getItem(LOG_KEY)||'[]');}catch{return[];}}
function _saveLogsLocal(l){try{localStorage.setItem(LOG_KEY,JSON.stringify(l));}catch{}}

// Lê do servidor quando possível; senão, cai no cache local.
async function getLogsAsync(){
  if(_usePhp){
    const srv = await phpGet('get_log');
    if(Array.isArray(srv)){
      _saveLogsLocal(srv); // atualiza cache
      return srv;
    }
  }
  return _getLogsLocal();
}

// Mantido para compatibilidade (usos internos que não podem ser async).
// Retorna o cache local — pode estar desatualizado se o servidor tiver logs mais novos.
function getLogs(){return _getLogsLocal();}

function saveLogs(l){
  _saveLogsLocal(l);
  if(_usePhp) phpPost('save_log', l).catch(()=>{});
}

// Adiciona um novo log. Se estiver online, lê o log atual do servidor primeiro
// para não sobrescrever entradas de outros usuários gravadas em paralelo.
async function addActivityLog(action,detail){
  const entry = {logId:genId(), action, detail, user:curUser?.username||'?', ts:new Date().toISOString()};
  // Supabase: acrescenta a entrada direto no servidor (sem baixar o log inteiro)
  const local = _getLogsLocal(); local.unshift(entry); _saveLogsLocal(local.slice(0,500));
  if(_usePhp && curUser && typeof teiaApi==='function'){
    try{ await teiaApi('teia_add_log', {p_entry: entry}); }catch(e){ /* log é secundário */ }
  }
}

function fmtTs(iso){try{const d=new Date(iso);return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR').slice(0,5);}catch{return iso;}}

async function renderLog(){
  const ll=document.getElementById('log-list');if(!ll)return;
  // Enquanto carrega, mostra indicador para o caso do servidor demorar
  if(_usePhp){
    ll.innerHTML='<div style="color:var(--g3);font-size:.72rem;text-align:center;padding:.8rem">⏳ Carregando histórico...</div>';
  }
  const logs = await getLogsAsync();
  if(!logs.length){ll.innerHTML='<div style="color:var(--g3);font-size:.76rem;text-align:center;padding:1rem">Nenhuma atividade registrada.</div>';return;}
  const clsMap={insert:'log-ins',delete:'log-del',clear:'log-del',edit:'log-edit',login:'',import:'log-ins',perm:'',password:''};
  ll.innerHTML=logs.map(l=>`<div class="log-entry ${clsMap[l.action]||''}">
    <div class="log-entry-text"><strong>${esc(l.user||'?')}</strong> · ${fmtTs(l.ts)}<br>${esc(l.detail||'')}</div>
    <button class="log-del-btn" onclick="deleteLogEntry('${l.logId}')">✕</button>
  </div>`).join('');
}

async function deleteLogEntry(logId){
  let logs;
  if(_usePhp){
    const srv = await phpGet('get_log');
    logs = Array.isArray(srv) ? srv : _getLogsLocal();
  } else {
    logs = _getLogsLocal();
  }
  logs = logs.filter(l=>l.logId!==logId);
  saveLogs(logs);
  renderLog();
}

function clearLog(){confirmAction('Limpar Log','Remove todo o histórico de atividades.',()=>{saveLogs([]);renderLog();toast('Log limpo','warn');});}

// ══════════════════ RELATÓRIO ══════════════════
let _relBim=1,_relFilter='comp';
function renderRelatorio(){
  // Bim tabs
  document.getElementById('rel-bim-tabs').innerHTML=[1,2,3,4].map(b=>`<button class="rel-bim-tab${_relBim===b?' active':''}" onclick="setRelBim(${b})">${b}º Bimestre</button>`).join('');
  // Filter tabs
  const filters=[{id:'comp',label:'😊 Comportamento'},{id:'desemp',label:'📚 Desempenho'},{id:'disciplinas',label:'📖 Disciplinas'},{id:'encaminhamentos',label:'📤 Encaminhamentos'}];
  document.getElementById('rel-filter-tabs').innerHTML=filters.map(f=>`<button class="rel-filter-tab${_relFilter===f.id?' active':''}" onclick="setRelFilter('${f.id}')">${f.label}</button>`).join('');
  // Content
  const rc=document.getElementById('rel-content');
  const allStudents=[];
  getVisibleCourses().forEach(c=>c.classes.forEach(cl=>cl.students.forEach(s=>allStudents.push({...s,className:cl.name,courseName:c.name}))));
  if(!allStudents.length){rc.innerHTML='<div style="color:var(--g3);text-align:center;padding:2rem">Nenhum aluno encontrado.</div>';return;}
  if(_relFilter==='comp'){
    const rows=allStudents.map(s=>{const av=s.avaliacoes?.[_relBim];const v=av?.comp||0;return`<tr><td>${esc(toTitleCase(s.nome))}</td><td class="mono">${esc(s.matricula||'—')}</td><td>${esc(s.className)}</td><td><span class="classif-chip chip-${CLASSIF[v]?.cls||'none'}">${CLASSIF_LABEL[v]}</span></td><td style="font-size:.68rem;color:var(--g3)">${(av?.compIssues||[]).join(', ')||'—'}</td></tr>`;}).join('');
    rc.innerHTML=`<table class="rel-table"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Turma</th><th>Comportamento</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table>`;
  }else if(_relFilter==='desemp'){
    const rows=allStudents.map(s=>{const av=s.avaliacoes?.[_relBim];const v=av?.desemp||0;return`<tr><td>${esc(toTitleCase(s.nome))}</td><td class="mono">${esc(s.matricula||'—')}</td><td>${esc(s.className)}</td><td><span class="classif-chip chip-${CLASSIF[v]?.cls||'none'}">${CLASSIF_LABEL[v]}</span></td><td style="font-size:.68rem;color:var(--g3)">${(av?.despIssues||[]).join(', ')||'—'}</td></tr>`;}).join('');
    rc.innerHTML=`<table class="rel-table"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Turma</th><th>Desempenho</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table>`;
  }else if(_relFilter==='disciplinas'){
    const rows=allStudents.filter(s=>(s.avaliacoes?.[_relBim]?.disciplinas||[]).length).map(s=>{const av=s.avaliacoes?.[_relBim];return`<tr><td>${esc(toTitleCase(s.nome))}</td><td class="mono">${esc(s.matricula||'—')}</td><td>${esc(s.className)}</td><td style="font-size:.68rem">${(av?.disciplinas||[]).map(d=>`<span class="classif-chip chip-ruim">${esc(d)}</span>`).join(' ')}</td></tr>`;}).join('');
    rc.innerHTML=rows?`<table class="rel-table"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Turma</th><th>Disciplinas com Dificuldades</th></tr></thead><tbody>${rows}</tbody></table>`:'<div style="color:var(--g3);text-align:center;padding:1.5rem">Nenhum aluno com dificuldades em disciplinas neste bimestre.</div>';
  }else{
    const rows=allStudents.filter(s=>(s.avaliacoes?.[_relBim]?.encaminhamentos||[]).length).map(s=>{const av=s.avaliacoes?.[_relBim];return`<tr><td>${esc(toTitleCase(s.nome))}</td><td class="mono">${esc(s.matricula||'—')}</td><td>${esc(s.className)}</td><td style="font-size:.68rem">${(av?.encaminhamentos||[]).map(e=>`<span class="classif-chip chip-regular">${esc(e)}</span>`).join(' ')}</td></tr>`;}).join('');
    rc.innerHTML=rows?`<table class="rel-table"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Turma</th><th>Encaminhamentos</th></tr></thead><tbody>${rows}</tbody></table>`:'<div style="color:var(--g3);text-align:center;padding:1.5rem">Nenhum encaminhamento neste bimestre.</div>';
  }
}
function setRelBim(b){_relBim=b;renderRelatorio();}
function setRelFilter(f){_relFilter=f;renderRelatorio();}

// ══════════════════ PDF ══════════════════
function printStudentPDF(){
  const s=findStudentById(activeStudentId);if(!s)return;
  const cl=findClass(activeClassId);
  const _yr=activeYear||getActiveYear(s);
  const mat=s.matricula||'';
  const boletimUrl=mat?`https://suap.ifma.edu.br/edu/aluno/${mat}/?tab=boletim`:'';
  const C_LABEL={0:'—',1:'Ruim',2:'Regular',3:'Bom',4:'Excelente'};
  const C_COLOR={0:'#999',1:'#E65100',2:'#c8960c',3:'#2E7D32',4:'#1565C0'};
  const C_BG   ={0:'#f5f5f5',1:'#fff3e0',2:'#fffde7',3:'#e8f5e9',4:'#e3f2fd'};

  /* ── helpers ── */
  function tagList(arr,color){
    if(!arr||!arr.length)return'';
    return`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">${arr.map(i=>`<span style="background:${color}18;border:1px solid ${color}55;border-radius:4px;padding:1px 6px;font-size:9px;color:${color};font-weight:600">${esc(i)}</span>`).join('')}</div>`;
  }
  function aspectBlock(pos,neg){
    const p=tagList(pos,'#2E7D32');
    const n=tagList(neg,'#C62828');
    if(!p&&!n)return'<span style="font-size:9px;color:#aaa">Nenhum aspecto marcado</span>';
    return(p?`<div style="margin-bottom:4px"><span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#2E7D32">✔ Positivos</span>${p}</div>`:'')
          +(n?`<div><span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#C62828">✖ Negativos</span>${n}</div>`:'');
  }
  function itemCards(arr,obsMap,icon){
    if(!arr||!arr.length)return'<span style="font-size:9px;color:#aaa">Nenhum</span>';
    return arr.map(e=>{const ob=(obsMap||{})[e]||'';
      return`<div style="display:flex;flex-direction:column;gap:1px;background:#f0faf2;border:1px solid #c8e6c9;border-left:3px solid #2E7D32;border-radius:5px;padding:3px 6px;margin-bottom:3px">
        <span style="font-size:9.5px;font-weight:700;color:#2E7D32">${icon} ${esc(e)}</span>
        ${ob?`<span style="font-size:8.5px;color:#555;font-style:italic">${esc(ob)}</span>`:''}
      </div>`;
    }).join('');
  }

  /* ── alert badges ── */
  let alertsHtml='';
  if(temAlerta(s.transtorno))alertsHtml+=`<span style="background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:2px 8px;font-size:9px;font-weight:700;color:#c8960c;margin-right:4px">⚠️ ${esc(String(s.transtorno))}</span>`;
  if(temAlerta(s.deficiencia))alertsHtml+=`<span style="background:#e3f2fd;border:1px solid #90caf9;border-radius:4px;padding:2px 8px;font-size:9px;font-weight:700;color:#1565C0;margin-right:4px">♿ ${esc(String(s.deficiencia))}</span>`;
  if(temAlerta(s.superdotacao))alertsHtml+=`<span style="background:#fffde7;border:1px solid #fff176;border-radius:4px;padding:2px 8px;font-size:9px;font-weight:700;color:#f9a825;margin-right:4px">⭐ ${esc(String(s.superdotacao))}</span>`;

  /* ── bimestre sections ── */
  const bimSections=[1,2,3,4].map(b=>{
    const av=getAvYear(s,_yr,b);
    const hasData=av.comp||av.desemp||av.obs||
      (av.compPos||[]).length||(av.compIssues||[]).length||
      (av.despPos||[]).length||(av.despIssues||[]).length||
      (av.disciplinas||[]).length||(av.encaminhamentos||[]).length||av.encaminhamentosOutro;
    const cc=av.comp||0;const dc=av.desemp||0;

    /* encaminhamentos list (filter __outro__) */
    const encArr=(av.encaminhamentos||[]).filter(e=>e!==ENCAM_OUTRO_KEY);
    const encHtml=itemCards(encArr,av.encaminhamentosObs||{},'📋')
      +(av.encaminhamentosOutro?`<div style="display:flex;flex-direction:column;gap:1px;background:#f0faf2;border:1px solid #c8e6c9;border-left:3px solid #2E7D32;border-radius:5px;padding:3px 6px;margin-bottom:3px"><span style="font-size:9.5px;font-weight:700;color:#2E7D32">📋 Outro</span><span style="font-size:8.5px;color:#555;font-style:italic">${esc(av.encaminhamentosOutro)}</span></div>`:'');
    const encFinal=encArr.length||av.encaminhamentosOutro?encHtml:'<span style="font-size:9px;color:#aaa">Nenhum encaminhamento</span>';

    /* disciplinas */
    const discFinal=itemCards(av.disciplinas||[],av.disciplinasObs||{},'📌');

    return`<div style="border:1px solid #c8e6c9;border-radius:8px;margin-bottom:10px;overflow:hidden;page-break-inside:avoid">
      <!-- bim header -->
      <div style="background:#2E7D32;color:#fff;padding:5px 10px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:11px;font-weight:800">${b}º Bimestre · ${_yr}</span>
        ${hasData
          ?`<span style="font-size:10px;opacity:.9">${C_LABEL[cc]} &nbsp;·&nbsp; ${C_LABEL[dc]}</span>`
          :`<span style="font-size:9px;opacity:.7;font-style:italic">Sem avaliação registrada</span>`}
      </div>
      ${hasData?`
      <div style="padding:8px 10px">
        <!-- Comp + Desemp side by side -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <!-- COMPORTAMENTO -->
          <div style="border:1px solid #e0e0e0;border-radius:6px;padding:7px">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#555;margin-bottom:4px">Comportamento</div>
            <div style="display:inline-block;background:${C_BG[cc]};border:1.5px solid ${C_COLOR[cc]};border-radius:5px;padding:2px 10px;font-size:11px;font-weight:800;color:${C_COLOR[cc]};margin-bottom:5px">${C_LABEL[cc]}</div>
            ${aspectBlock(av.compPos||[],av.compIssues||[])}
          </div>
          <!-- DESEMPENHO -->
          <div style="border:1px solid #e0e0e0;border-radius:6px;padding:7px">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#555;margin-bottom:4px">Desempenho</div>
            <div style="display:inline-block;background:${C_BG[dc]};border:1.5px solid ${C_COLOR[dc]};border-radius:5px;padding:2px 10px;font-size:11px;font-weight:800;color:${C_COLOR[dc]};margin-bottom:5px">${C_LABEL[dc]}</div>
            ${aspectBlock(av.despPos||[],av.despIssues||[])}
          </div>
        </div>
        <!-- Obs + Disciplinas side by side -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div style="border:1px solid #e0e0e0;border-radius:6px;padding:7px">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#555;margin-bottom:4px">Observações</div>
            <div style="font-size:9.5px;color:#333;line-height:1.5;white-space:pre-wrap">${av.obs?esc(av.obs):'<span style="color:#aaa">Nenhuma observação</span>'}</div>
          </div>
          <div style="border:1px solid #e0e0e0;border-radius:6px;padding:7px">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#555;margin-bottom:4px">Disciplinas com Dificuldades</div>
            ${discFinal}
          </div>
        </div>
        <!-- Encaminhamentos full width -->
        <div style="border:1px solid #e0e0e0;border-radius:6px;padding:7px">
          <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#555;margin-bottom:4px">Encaminhamentos</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:3px">${encFinal}</div>
        </div>
      </div>`:''}
    </div>`;
  }).join('');

  /* ── assemble ── */
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8">
  <title>Relatório — ${toTitleCase(s.nome)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;background:#fff;padding:18px 22px}
    @media print{
      body{padding:10px 14px}
      button{display:none!important}
      @page{size:A4;margin:12mm 10mm}
    }
  </style>
  </head><body>
  <!-- PAGE HEADER -->
  <div style="border-bottom:2.5px solid #2E7D32;padding-bottom:8px;margin-bottom:10px;display:flex;align-items:flex-start;justify-content:space-between">
    <div>
      <div style="font-size:17px;font-weight:800;color:#1a1a1a;line-height:1.2">${esc(toTitleCase(s.nome))}</div>
      <div style="font-size:9.5px;color:#555;margin-top:3px;display:flex;gap:12px;flex-wrap:wrap">
        ${mat?`<span><b>Matrícula:</b> ${mat}</span>`:''}
        <span><b>Turma:</b> ${esc(cl?.clase?.name||'—')}</span>
        <span><b>Curso:</b> ${esc(s.descricaoCurso||s.curso||'—')}</span>
        <span><b>Situação:</b> ${esc(s.situacao||'—')}</span>
        <span><b>Ano Letivo:</b> ${esc(_yr)}</span>
        ${s.anoIngresso?`<span><b>Ingresso:</b> ${esc(s.anoIngresso)}</span>`:''}
      </div>
      ${alertsHtml?`<div style="margin-top:5px">${alertsHtml}</div>`:''}
    </div>
    <div style="text-align:right;flex-shrink:0;margin-left:12px">
      ${boletimUrl?`<a href="${boletimUrl}" style="font-size:8.5px;color:#1565C0;font-weight:600">📊 Boletim SUAP</a><br>`:''}
      <span style="font-size:8px;color:#aaa">Gerado em ${new Date().toLocaleString('pt-BR')}</span>
    </div>
  </div>
  <!-- BIMESTRES -->
  ${bimSections}
  <!-- FOOTER -->
  <div style="text-align:center;margin-top:10px;font-size:8px;color:#aaa;border-top:1px solid #eee;padding-top:6px">
    IFMA Campus Imperatriz · TeIA
  </div>
  <div style="text-align:center;margin-top:10px">
    <button onclick="window.print()" style="background:#2E7D32;color:#fff;border:none;border-radius:6px;padding:7px 22px;font-size:11px;font-weight:700;cursor:pointer">🖨️ Imprimir / Salvar PDF</button>
  </div>
  </body></html>`);
  w.document.close();
}

// ══════════════════ PDF PÁGINA COMPLETA (FICHA IMPRIMÍVEL DO BIMESTRE) ══════════════════
// Constrói o HTML INTERNO (corpo) de uma ficha "Página Completa" para um
// aluno + bimestre específico. Não inclui <html>, <head>, botões — apenas
// o conteúdo da página. Usado tanto por printStudentFullPDF (um aluno) como
// por printClassFullPDF (toda a turma em um único PDF).
function _buildStudentFullPageHTML(s, cl, _yr, b){
  const av=getAvYear(s,_yr,b);
  const mat=s.matricula||'';
  const temFoto=s.foto&&s.foto.trim();
  const ini=initials(s.nome);

  const CL={1:{label:'Ruim',color:'#E65100',bg:'#fff3e0'},2:{label:'Regular',color:'#F9A825',bg:'#fffde7'},3:{label:'Bom',color:'#2E7D32',bg:'#e8f5e9'},4:{label:'Excelente',color:'#1565C0',bg:'#e3f2fd'}};

  // Disciplinas — turma + externas já salvas (mesma lógica da lupa)
  const schedDiscs=(db.schedules&&cl?.name&&db.schedules[cl.name])||[];
  const classDiscs=[...new Set([...schedDiscs.map(d=>d.disc),...(cl?.teachers||[]).map(t=>t.disc||'')])].filter(Boolean);
  const classSet=new Set(classDiscs);
  const discSaved=av.disciplinas||[];
  const savedCustom=discSaved.filter(d=>d!=='__todas__'&&!classSet.has(d));
  const allDiscs=[...classDiscs,...savedCustom];
  const discObsSaved=av.disciplinasObs||{};
  const temTodas=discSaved.includes('__todas__');

  // Encaminhamentos
  const encSaved=av.encaminhamentos||[];
  const encObsSaved=av.encaminhamentosObs||{};
  const outroPrev=av.encaminhamentosOutro||'';
  const outroChecked=encSaved.includes(ENCAM_OUTRO_KEY);

  // Mapa da sala — posição salva
  const seat=av.seating&&typeof av.seating==='object'?av.seating:{x:-1,y:-1};

  // Alertas
  let alertsHtml='';
  if(temAlerta(s.transtorno))alertsHtml+=`<span style="background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:1px 6px;font-size:8.5px;font-weight:700;color:#c8960c;margin-right:3px">⚠️ ${esc(String(s.transtorno))}</span>`;
  if(temAlerta(s.deficiencia))alertsHtml+=`<span style="background:#e3f2fd;border:1px solid #90caf9;border-radius:4px;padding:1px 6px;font-size:8.5px;font-weight:700;color:#1565C0;margin-right:3px">♿ ${esc(String(s.deficiencia))}</span>`;
  if(temAlerta(s.superdotacao))alertsHtml+=`<span style="background:#fffde7;border:1px solid #fff176;border-radius:4px;padding:1px 6px;font-size:8.5px;font-weight:700;color:#f9a825;margin-right:3px">⭐ ${esc(String(s.superdotacao))}</span>`;

  // Helper: checkbox estilizado (☐/☑)
  const cbox=(checked,label,obs='')=>`<label style="display:flex;align-items:flex-start;gap:5px;font-size:8.7px;line-height:1.25;padding:1.5px 0;break-inside:avoid">
    <span style="display:inline-block;width:11px;height:11px;border:1.4px solid #333;border-radius:2px;flex-shrink:0;margin-top:1px;text-align:center;line-height:9px;font-size:9px;background:${checked?'#2E7D32':'#fff'};color:#fff;font-weight:800;border-color:${checked?'#2E7D32':'#333'}">${checked?'✓':''}</span>
    <span style="${checked?'font-weight:700;color:#1a1a1a':'color:#333'}">${esc(label)}${obs?`<br><span style="font-size:7.8px;color:#666;font-style:italic;font-weight:400;display:inline-block;margin-top:1px">${esc(obs)}</span>`:''}</span>
  </label>`;

  // Helper: linha de classificação com todos os níveis (o selecionado destacado)
  const classifRow=cur=>[1,2,3,4].map(v=>{
    const sel=v===cur;
    return `<span style="display:inline-block;padding:2px 9px;border-radius:12px;border:1.4px solid ${sel?CL[v].color:'#bbb'};background:${sel?CL[v].bg:'#fff'};color:${sel?CL[v].color:'#777'};font-size:9px;font-weight:${sel?800:500};margin-right:3px">${sel?'● ':'○ '}${CL[v].label}</span>`;
  }).join('');

  // Mapa da sala (réplica inline do CSS da tela)
  const mapaHtml=`<div style="position:relative;width:100%;aspect-ratio:4/5;border:1px solid #bbb;border-radius:4px;overflow:hidden;background:#f5f5f5">
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;opacity:.32">
      <div style="background:#777;height:12%;display:flex;align-items:center;justify-content:center;font-size:6.5px;font-weight:700;color:#fff;letter-spacing:.1em;flex-shrink:0">QUADRO</div>
      <div style="flex:1;display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(5,1fr);gap:1px;padding:2px">
        ${Array.from({length:30},()=>'<div style="background:#aaa;border-radius:1px"></div>').join('')}
      </div>
    </div>
    ${seat.x>=0&&seat.y>=0
      ? `<div style="position:absolute;width:20px;height:20px;border-radius:50%;background:#2E7D32;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:translate(-50%,-50%);left:${seat.x}%;top:${seat.y}%;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:800">★</div>`
      : '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:7.5px;color:#aaa;font-style:italic">(sem posição)</div>'}
  </div>`;

  // Foto
  const fotoHtml=temFoto
    ? `<img src="${esc(s.foto)}" alt="" onerror="this.outerHTML='<div style=&quot;width:80px;height:80px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#2E7D32;border:2px solid #c8e6c9;flex-shrink:0&quot;>${esc(ini)}</div>'" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:2px solid #c8e6c9;background:#f5f5f5;flex-shrink:0">`
    : `<div style="width:80px;height:80px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#2E7D32;border:2px solid #c8e6c9;flex-shrink:0">${esc(ini)}</div>`;

  // Observação
  const obsSaved=av.obs||'';
  const obsBlock=obsSaved
    ? `<div style="font-size:9.5px;line-height:1.55;color:#1a1a1a;white-space:pre-wrap;min-height:66px;padding:2px 0">${esc(obsSaved)}</div>`
    : `<div style="min-height:72px;background-image:linear-gradient(to bottom,transparent calc(100% - 1px),#c8c8c8 calc(100% - 1px));background-size:100% 16px;background-repeat:repeat-y"></div>`;

  const compPos=(av.compPos||[]), compIss=(av.compIssues||[]);
  const despPos=(av.despPos||[]), despIss=(av.despIssues||[]);

  const gridStyle=`display:grid;grid-template-columns:repeat(2,1fr);gap:0 10px`;

  const compSection=`<div style="border:1px solid #c8e6c9;border-radius:6px;padding:6px 8px 7px;background:#fff">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:4px">Comportamento</div>
    <div style="margin-bottom:5px">${classifRow(av.comp||0)}</div>
    <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#2E7D32;margin:3px 0 1px">✓ Aspectos Positivos</div>
    <div style="${gridStyle}">${COMP_POS.map(iss=>cbox(compPos.includes(iss),iss)).join('')}</div>
    <div style="border-top:1px solid #e0e0e0;margin:5px 0 3px"></div>
    <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#C62828;margin:0 0 1px">✕ Aspectos Negativos</div>
    <div style="${gridStyle}">${COMP_ISSUES.map(iss=>cbox(compIss.includes(iss),iss)).join('')}</div>
  </div>`;

  const desempSection=`<div style="border:1px solid #c8e6c9;border-radius:6px;padding:6px 8px 7px;background:#fff">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:4px">Desempenho</div>
    <div style="margin-bottom:5px">${classifRow(av.desemp||0)}</div>
    <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#2E7D32;margin:3px 0 1px">✓ Aspectos Positivos</div>
    <div style="${gridStyle}">${DESEMP_POS.map(iss=>cbox(despPos.includes(iss),iss)).join('')}</div>
    <div style="border-top:1px solid #e0e0e0;margin:5px 0 3px"></div>
    <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#C62828;margin:0 0 1px">✕ Aspectos Negativos</div>
    <div style="${gridStyle}">${DESEMP_ISSUES.map(iss=>cbox(despIss.includes(iss),iss)).join('')}</div>
  </div>`;

  const obsSection=`<div style="border:1px solid #c8e6c9;border-radius:6px;padding:6px 8px 7px;background:#fff">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:4px">Observações</div>
    ${obsBlock}
  </div>`;

  const discSection=`<div style="border:1px solid #c8e6c9;border-radius:6px;padding:6px 8px 7px;background:#fff">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:4px">Disciplinas com Dificuldades</div>
    <div style="background:${temTodas?'#fff5f5':'#fafafa'};border:1px solid ${temTodas?'#ef9a9a':'#e0e0e0'};border-radius:4px;padding:2px 6px;margin-bottom:4px">${cbox(temTodas,'Todas as disciplinas')}</div>
    ${allDiscs.length
      ? allDiscs.map(d=>{
          const isExt=!classSet.has(d);
          return `<div style="display:flex;align-items:flex-start;gap:4px">
            <div style="flex:1">${cbox(discSaved.includes(d),d,discObsSaved[d]||'')}</div>
            ${isExt?'<span style="font-size:6.5px;font-weight:700;color:#1565c0;border:1px solid #90caf9;border-radius:8px;padding:1px 4px;background:#e3f2fd;margin-top:2px;flex-shrink:0">EXTERNA</span>':''}
          </div>`;
        }).join('')
      : '<div style="font-size:8.5px;color:#aaa;font-style:italic;padding:3px 0">Nenhuma disciplina cadastrada nos professores/horário da turma.</div>'}
    <div style="margin-top:5px;padding-top:4px;border-top:1px dashed #ccc;font-size:8px;color:#666;display:flex;align-items:center;gap:4px">
      <span>Outra:</span>
      <span style="flex:1;border-bottom:1px solid #888;display:inline-block;height:12px"></span>
    </div>
  </div>`;

  const encSection=`<div style="border:1px solid #c8e6c9;border-radius:6px;padding:6px 8px 7px;background:#fff">
    <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:4px">Encaminhamentos</div>
    <div style="${gridStyle}">
      ${ENCAMINHAMENTOS.map(e=>cbox(encSaved.includes(e),e,encObsSaved[e]||'')).join('')}
    </div>
    <div style="margin-top:5px;display:flex;align-items:center;gap:6px">
      <div style="flex-shrink:0">${cbox(outroChecked,'Outro:')}</div>
      <span style="flex:1;border-bottom:1px solid #888;display:inline-block;height:13px;padding:0 4px;font-size:9px;font-weight:600">${outroPrev?esc(outroPrev):''}</span>
    </div>
  </div>`;

  const sit=(s.situacao||'').toLowerCase();
  const sitColor=sit.includes('ativo')&&!sit.includes('in')?'#2E7D32':sit.includes('inativo')||sit.includes('cancel')?'#C62828':'#888';

  return `
  <!-- HEADER -->
  <div style="display:flex;gap:10px;border-bottom:2.5px solid #2E7D32;padding-bottom:7px;margin-bottom:8px" class="pbavoid">
    ${fotoHtml}
    <div style="flex:1;min-width:0">
      <div style="font-size:15px;font-weight:800;line-height:1.15">${esc(toTitleCase(s.nome))}</div>
      <div class="hdr-line"><b>Matrícula:</b> ${esc(mat||'—')} &nbsp; <b>Turma:</b> ${esc(cl?.name||'—')} &nbsp; <b>Situação:</b> <span style="color:${sitColor};font-weight:700">${esc(s.situacao||'—')}</span></div>
      <div class="hdr-line"><b>Curso:</b> ${esc(s.descricaoCurso||s.curso||'—')} &nbsp; <b>Ingresso:</b> ${esc(s.anoIngresso||'—')}</div>
      ${alertsHtml?`<div style="margin-top:3px">${alertsHtml}</div>`:''}
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="background:#2E7D32;color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:800;letter-spacing:.02em">${b}º BIMESTRE</div>
      <div style="font-size:9.5px;color:#555;margin-top:3px">Ano Letivo: <b>${esc(_yr)}</b></div>
      <div style="font-size:7.5px;color:#aaa;margin-top:2px">Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:7px;margin-bottom:7px" class="pbavoid">
    <div style="border:1px solid #c8e6c9;border-radius:6px;padding:5px 6px 6px;background:#fff;display:flex;flex-direction:column">
      <div style="font-size:9px;font-weight:800;color:#2E7D32;margin-bottom:4px;text-align:center">Mapa da Sala</div>
      ${mapaHtml}
    </div>
    ${compSection}
    ${desempSection}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px" class="pbavoid">
    ${obsSection}
    ${discSection}
  </div>

  <div style="margin-bottom:10px" class="pbavoid">
    ${encSection}
  </div>

  <div style="display:flex;gap:24px;margin-top:14px">
    <div style="flex:1;border-top:1px solid #333;padding-top:3px;font-size:9px;color:#555;text-align:center">
      Data: _____ / _____ / __________
    </div>
    <div style="flex:2;border-top:1px solid #333;padding-top:3px;font-size:9px;color:#555;text-align:center">
      Assinatura do Professor / Responsável
    </div>
  </div>

  <div style="text-align:center;margin-top:10px;font-size:7.5px;color:#aaa;border-top:1px solid #eee;padding-top:5px">
    IFMA Campus Imperatriz · TeIA — Tecnologia Escolar de Integração e Acompanhamento
  </div>`;
}

// CSS comum usado pelas páginas completas (individual e turma)
function _fullPageCSS(){
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;background:#fff;padding:14px 16px}
    @media print{
      body{padding:4px 6px}
      button.noprint{display:none!important}
      @page{size:A4;margin:7mm 8mm}
      .pbavoid{page-break-inside:avoid;break-inside:avoid}
      .page-break{page-break-after:always;break-after:page}
    }
    .hdr-line{font-size:9.5px;color:#444;margin-top:2px}
    .hdr-line b{color:#1a1a1a}
  `;
}

function printStudentFullPDF(){
  const s=findStudentById(activeStudentId);if(!s)return;
  const cl=findClass(activeClassId);
  const _yr=activeYear||getActiveYear(s);
  const b=activeBim;
  const inner=_buildStudentFullPageHTML(s, cl?.clase, _yr, b);
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Ficha ${b}º Bim — ${esc(toTitleCase(s.nome))}</title>
    <style>${_fullPageCSS()}</style>
  </head><body>
  ${inner}
  <div style="text-align:center;margin-top:12px">
    <button class="noprint" onclick="window.print()" style="background:#2E7D32;color:#fff;border:none;border-radius:6px;padding:8px 24px;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15)">🖨️ Imprimir / Salvar PDF</button>
  </div>
  </body></html>`);
  w.document.close();
}

// Gera um único PDF/HTML com as Páginas Completas de todos os alunos de uma
// turma para o bimestre escolhido. Cada aluno ocupa uma página (page-break).
function printClassFullPDF(bim){
  const cl=findClass(activeClassId);if(!cl){toast('Turma não encontrada','err');return;}
  const clase=cl.clase;
  const students=(clase.students||[]).slice();
  if(!students.length){toast('Turma sem alunos','err');return;}
  const b=Number(bim)||1;
  // Ordena por nome para manter consistência
  students.sort((a,b2)=>toTitleCase(a.nome).localeCompare(toTitleCase(b2.nome)));

  const w=window.open('','_blank');
  if(!w){toast('Bloqueador de pop-ups impediu a abertura. Permita pop-ups para este site.','err');return;}

  const pages=students.map((s,i)=>{
    const _yr=activeYear||getActiveYear(s);
    const inner=_buildStudentFullPageHTML(s, clase, _yr, b);
    const isLast = i === students.length-1;
    return `<div class="${isLast?'':'page-break'}">${inner}</div>`;
  }).join('');

  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8">
    <title>Fichas ${b}º Bim — ${esc(clase.name||'Turma')}</title>
    <style>${_fullPageCSS()}</style>
  </head><body>
  <div class="noprint" style="position:sticky;top:0;background:#2E7D32;color:#fff;padding:10px 16px;margin:-14px -16px 12px;z-index:100;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(0,0,0,.2)">
    <div style="flex:1">
      <div style="font-size:13px;font-weight:800">📋 Fichas do ${b}º Bimestre — Turma ${esc(clase.name||'')}</div>
      <div style="font-size:10px;opacity:.9;margin-top:2px">${students.length} aluno${students.length!==1?'s':''} · uma ficha por página</div>
    </div>
    <button onclick="window.print()" style="background:#fff;color:#2E7D32;border:none;border-radius:6px;padding:8px 22px;font-size:11px;font-weight:800;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15)">🖨️ Imprimir / Salvar PDF</button>
  </div>
  ${pages}
  </body></html>`);
  w.document.close();
}

// Abre um diálogo pequeno para escolher o bimestre antes de gerar as fichas
function askBimAndPrintClass(){
  const cl=findClass(activeClassId);if(!cl){toast('Turma não encontrada','err');return;}
  if(!(cl.clase.students||[]).length){toast('Turma sem alunos','err');return;}
  // Monta um diálogo inline (evita depender de modal pré-definido)
  let overlay=document.getElementById('bim-picker-overlay');
  if(overlay)overlay.remove();
  overlay=document.createElement('div');
  overlay.id='bim-picker-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9300;display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.innerHTML=`
    <div style="background:#fff;border-radius:14px;padding:1.4rem 1.6rem;width:min(420px,96vw);box-shadow:0 8px 40px rgba(0,0,0,.22)">
      <div style="font-size:1rem;font-weight:800;color:#2E7D32;margin-bottom:.4rem">📋 Imprimir Avaliações da Turma</div>
      <div style="font-size:.78rem;color:#555;margin-bottom:.9rem">Selecione o bimestre a ser impresso. Será gerado um PDF com uma ficha "Página Completa" por aluno (${(cl.clase.students||[]).length} ao total).</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin-bottom:1rem">
        ${[1,2,3,4].map(b=>`<button class="bim-choose" data-bim="${b}" style="padding:.7rem .4rem;border:1.5px solid #c8e6c9;background:#f8fdf9;border-radius:8px;font-size:.85rem;font-weight:700;color:#2E7D32;cursor:pointer;transition:all .15s">${b}º Bim</button>`).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.5rem">
        <button id="bim-picker-cancel" style="background:#fff;border:1.5px solid #e0e0e0;color:#555;border-radius:8px;padding:.5rem 1rem;font-size:.8rem;font-weight:600;cursor:pointer">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  overlay.querySelector('#bim-picker-cancel').onclick=close;
  overlay.querySelectorAll('.bim-choose').forEach(btn=>{
    btn.onmouseenter=()=>{btn.style.background='#2E7D32';btn.style.color='#fff';};
    btn.onmouseleave=()=>{btn.style.background='#f8fdf9';btn.style.color='#2E7D32';};
    btn.onclick=()=>{const bim=+btn.dataset.bim;close();printClassFullPDF(bim);};
  });
}

function printTurmaPDF(){
  const cl=findClass(activeClassId);if(!cl)return;
  const w=window.open('','_blank');
  const rows=cl.clase.students.map(s=>{
    const avs=[1,2,3,4].map(b=>{const av=s.avaliacoes?.[b]||{};return`${CLASSIF_LABEL[av.comp||0]}/${CLASSIF_LABEL[av.desemp||0]}`;}).join(' | ');
    const encams=[1,2,3,4].flatMap(b=>(s.avaliacoes?.[b]?.encaminhamentos||[]));
    return`<tr><td>${toTitleCase(s.nome)}</td><td>${s.matricula||'—'}</td><td>${avs}</td><td>${[...new Set(encams)].join(', ')||'—'}</td></tr>`;
  }).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>Relatório — ${cl.clase.name}</title><style>*{box-sizing:border-box;font-family:Arial,sans-serif;font-size:10px}body{margin:20px;color:#1a1a2e}h1{font-size:15px}h2{font-size:11px;color:#555;margin-bottom:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 7px;text-align:left}th{background:#e8f5e9;color:#2e7d32}@media print{button{display:none}}</style></head><body>
    <h1>Relatório da Turma — ${cl.clase.name}</h1>
    <h2>${cl.clase.students.length} alunos | Gerado em ${new Date().toLocaleString('pt-BR')}</h2>
    <table><tr><th>Aluno</th><th>Matrícula</th><th>Comp/Desemp (1º|2º|3º|4º bim)</th><th>Encaminhamentos</th></tr>${rows}</table>
    <button onclick="window.print()" style="margin-top:12px;padding:6px 14px;background:#2e7d32;color:#fff;border:none;border-radius:4px;cursor:pointer">Imprimir PDF</button>
  </body></html>`);w.document.close();
}

