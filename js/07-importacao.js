// ══════════════════ IMPORT ══════════════════
let _pendingCourses=null;
function handleDrop(e){e.preventDefault();document.getElementById('dropzone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f)processExcel(f);}
function handleExcel(e){const f=e.target.files[0];if(f)processExcel(f);e.target.value='';}
function addLog(msg){const el=document.getElementById('import-log');el.textContent+=(el.textContent?'\n':'')+msg;el.scrollTop=el.scrollHeight;}
function handleDropHorario(e){e.preventDefault();document.getElementById('dropzone-horario').classList.remove('drag');const f=e.dataTransfer.files[0];if(f)processHorario(f);}
function handleHorario(e){const f=e.target.files[0];if(f)processHorario(f);e.target.value='';}

async function processHorario(file){
  const log=document.getElementById('horario-log');
  log.textContent='📊 Lendo: '+file.name+'...\n';
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    log.textContent+='Abas: '+wb.SheetNames.join(', ')+'\n';

    if(!db.schedules)db.schedules={};

    // Locate "TURMAS" sheet (has "turma" + "hor" in name)
    const turmSheetName=wb.SheetNames.find(n=>/turma/i.test(n)&&/hor/i.test(n))||wb.SheetNames.find(n=>/turma/i.test(n));
    if(!turmSheetName){log.textContent+='⚠️ Aba de turmas não encontrada.\n';toast('Aba de turmas não encontrada','err');return;}

    log.textContent+='Usando aba: "'+turmSheetName+'"\n';
    const ws=wb.Sheets[turmSheetName];
    // raw:false keeps text as strings, but cells with \n need raw:true for multiline
    const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});

    // Structure: rows with "Turma 111-I" in col 0 start each block.
    // Data rows: col 0 = time (datetime or string), cols 1+ = "Disc\nPROF"
    const norm=s=>String(s||'').toLowerCase().replace(/[\s\-\._()"]/g,'');
    const collected={}; // { "111-I": Set<"disc::prof"> }
    let curTurma=null;
    let curDays=[];
    const slotMap={};

    for(const row of raw){
      const a=String(row[0]||'').trim();
      // Class header: "Turma 111-I"
      const m=a.match(/Turma\s+(\S+)/i);
      if(m){curTurma=m[1].trim();curDays=[];if(!collected[curTurma])collected[curTurma]=new Set();continue;}
      if(!curTurma)continue;
      // Blank row
      if(!a&&row.every(c=>!c))continue;
      // Day header row: col0 is null/empty, cols 1+ are day names
      if(!a&&/segunda|terça|quarta|quinta|sexta|sáb/i.test(String(row.slice(1).join(' ')))){
        curDays=row.slice(1).map(d=>String(d||'').trim());
        continue;
      }
      // Skip explicit header row with "segunda" in col0 area
      if(/segunda|terça|quarta|quinta|sexta|sáb/i.test(a))continue;
      // Time row — parse each day cell
      const timeStr=a.match(/(\d{1,2}:\d{2})/)?.[1]||a;
      for(let c=1;c<row.length;c++){
        const cell=String(row[c]||'').trim();
        if(!cell||cell==='---'||cell==='-'||cell==='null')continue;
        const lines=cell.split(/\n/).map(s=>s.trim()).filter(Boolean);
        const disc=lines[0]||'';const prof=lines[1]||'';
        if(disc.length>1){
          const key=disc+'::'+prof;
          collected[curTurma].add(key);
          // Store slot {day, time}
          const day=curDays[c-1]||'';
          if(!slotMap[curTurma])slotMap[curTurma]={};
          if(!slotMap[curTurma][key])slotMap[curTurma][key]=[];
          const existing=slotMap[curTurma][key];
          if(!existing.find(s=>s.day===day&&s.time===timeStr)){
            existing.push({day,time:timeStr});
          }
        }
      }
    }

    // Log collected data
    let totalReg=0;
    for(const[sig,pairs]of Object.entries(collected)){
      log.textContent+='"'+sig+'": '+pairs.size+' disciplina(s)\n';
      db.schedules[sig]=[...pairs].map(p=>{
        const[disc,prof]=p.split('::');
        const slots=(slotMap[sig]&&slotMap[sig][p])||[];
        return{disc,prof:prof||'',slots};
      });
      totalReg+=pairs.size;
    }

    // Show system classes for reference
    const sysClasses=db.courses.flatMap(c=>c.classes);
    log.textContent+='\nTurmas no sistema: '+sysClasses.map(cl=>cl.name).join(', ')+'\n\n';

    // Match collected entries to system classes and populate cl.teachers
    let matchedCount=0;
    for(const cl of sysClasses){
      const clN=norm(cl.name);
      let matched=null;
      // 1. Exact match
      for(const sig of Object.keys(collected)){if(norm(sig)===clN){matched=collected[sig];break;}}
      // 2. Substring match
      if(!matched){for(const sig of Object.keys(collected)){const sN=norm(sig);if(clN.includes(sN)||sN.includes(clN)){matched=collected[sig];break;}}}
      if(matched&&matched.size){
        if(!cl.teachers)cl.teachers=[];
        let added=0;
        for(const p of matched){
          const[disc,prof]=p.split('::');
          if(disc&&!cl.teachers.find(t=>t.disc===disc&&t.prof===prof)){
            cl.teachers.push({disc,prof:prof||''});matchedCount++;added++;
          }
        }
        log.textContent+=(added?'✅':'ℹ️')+' "'+cl.name+'": '+(added?added+' vínculo(s) criado(s)':'já atualizado')+'\n';
      } else {
        log.textContent+='⚠️ "'+cl.name+'" ('+clN+'): sem correspondência\n';
      }
    }

    saveDB();
    log.textContent+='\n✅ Concluído! '+totalReg+' registros, '+matchedCount+' vínculos criados.\n';
    if(matchedCount===0)log.textContent+='Dica: o código da turma no sistema deve corresponder ao usado na planilha (ex: "111-I").\n';
    try{renderDashboard();}catch(e2){}
    toast(matchedCount>0?matchedCount+' vínculo(s) importado(s)!':'Importado — verifique o log','ok');
  }catch(e){log.textContent+='❌ Erro: '+e.message+'\n';console.error(e);}
}

async function processExcel(file){
  const log=document.getElementById('import-log');log.textContent='';
  addLog('📊 Lendo: '+file.name);
  document.getElementById('confirm-import-btn').style.display='none';
  _pendingCourses=null;
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    if(raw.length<2){addLog('❌ Planilha vazia!');return;}
    const headers=raw[0];
    const sampleRows=raw.slice(1,4);
    addLog('🔍 Cabeçalhos: '+headers.filter(Boolean).slice(0,8).join(', ')+'...');
    addLog('🧠 Analisando com IA...');
    let mapping;
    try{
      const prompt=`Analise esta planilha de alunos do IFMA.\nCABEÇALHOS: ${JSON.stringify(headers)}\nEXEMPLOS:\n${sampleRows.map((r,i)=>`Linha ${i+1}: ${JSON.stringify(r)}`).join('\n')}\n\nIdentifique os índices (0-based) das colunas. Use null se não existir. Para "turma" priorize "Sigla da Turma".\n\nResponda APENAS JSON válido sem texto extra:\n{"nome":<idx>,"matricula":<idx>,"curso":<idx>,"descricaoCurso":<idx>,"turma":<idx>,"siglaTurma":<idx>,"periodo":<idx>,"anoIngresso":<idx>,"campus":<idx>,"codigoCurso":<idx>,"dataNascimento":<idx>,"idade":<idx>,"deficiencia":<idx>,"superdotacao":<idx>,"transtorno":<idx>,"situacao":<idx>,"modalidade":<idx>,"nivelEnsino":<idx>,"endereco":<idx>,"urlFoto":<idx>,"obs":"explicação"}`;
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:500,messages:[{role:'user',content:prompt}]})});
      const data=await res.json();
      const txt=data.content?.[0]?.text||'';
      const m=txt.match(/\{[\s\S]*\}/);
      if(m){mapping=JSON.parse(m[0]);addLog('🧠 IA: '+mapping.obs);}
      else throw new Error('Sem JSON na resposta');
    }catch(e){addLog('⚠️ IA falhou, usando detecção automática');mapping=autoMap(headers);}
    const getCellVal=(row,idx)=>{if(idx==null||idx<0)return'';const v=row[idx];if(v==null||v==='')return'';return String(v).trim();};
    const cursosMap=new Map();
    for(const row of raw.slice(1)){
      if(!row.some(c=>String(c).trim()))continue;
      const nome=getCellVal(row,mapping.nome);if(!nome)continue;
      const curso=getCellVal(row,mapping.curso)||getCellVal(row,mapping.descricaoCurso)||'Curso Geral';
      const descCurso=getCellVal(row,mapping.descricaoCurso);
      const siglaTurma=getCellVal(row,mapping.siglaTurma);
      const turmaRaw=getCellVal(row,mapping.turma);
      const turma=siglaTurma||turmaRaw||'Turma A';
      const nomeParaFiltro=(descCurso||curso).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      if(!nomeParaFiltro.startsWith('tecnico'))continue;
      const mat=getCellVal(row,mapping.matricula);
      const periodo=getCellVal(row,mapping.periodo);
      const anoIngresso=getCellVal(row,mapping.anoIngresso);
      const campus=getCellVal(row,mapping.campus);
      const dataNasc=getCellVal(row,mapping.dataNascimento);
      const idade=getCellVal(row,mapping.idade);
      const deficiencia=getCellVal(row,mapping.deficiencia);
      const superdotacao=getCellVal(row,mapping.superdotacao);
      const transtorno=getCellVal(row,mapping.transtorno);
      const situacao=getCellVal(row,mapping.situacao);
      const modalidade=getCellVal(row,mapping.modalidade);
      const nivelEnsino=getCellVal(row,mapping.nivelEnsino);
      const endereco=getCellVal(row,mapping.endereco);
      const urlFoto=getCellVal(row,mapping.urlFoto);
      if(!cursosMap.has(curso))cursosMap.set(curso,new Map());
      if(!cursosMap.get(curso).has(turma))cursosMap.get(curso).set(turma,[]);
      cursosMap.get(curso).get(turma).push({nome:toTitleCase(nome),matricula:mat,curso,descricaoCurso:descCurso,turma,siglaTurma:siglaTurma||turma,periodo,anoIngresso,campus,dataNascimento:dataNasc,idade,deficiencia,superdotacao,transtorno,situacao,modalidade,nivelEnsino,endereco,urlFoto});
    }
    _pendingCourses=[];let total=0;
    for(const[cn,tm]of cursosMap){const classes=[];for(const[tn,studs]of tm){classes.push({id:genId(),name:tn,students:studs.map(s=>({id:genId(),...s,foto:s.urlFoto||null,avaliacoes:{},teachers:[],bimestres:{}}))});total+=studs.length;}_pendingCourses.push({id:genId(),name:cn,classes});}
    addLog(`✅ Prontos para importar: ${total} alunos técnicos em ${_pendingCourses.length} curso(s)`);
    if(total>0){document.getElementById('confirm-import-btn').style.display='inline-flex';}
    else addLog('⚠️ Nenhum aluno técnico encontrado. Verifique o campo "Nível de Ensino" ou "Descrição do Curso".');
  }catch(e){addLog('❌ Erro: '+e.message);console.error(e);}
}

function autoMap(headers){
  // Normaliza: remove acentos, minúsculo, trim — casamento robusto independente de codificação
  const norm=s=>String(s).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const h=headers.map(x=>norm(x));
  const find=(...terms)=>{
    for(const t of terms){const nt=norm(t);const i=h.findIndex(x=>x.includes(nt));if(i>=0)return i;}
    return null;
  };
  // Endereço: busca por nome normalizado; NUNCA cai em 'Matriz'
  // SUAP sempre coloca Endereço na coluna K (índice 10) — fallback fixo
  let enderecoIdx=find('endereco','logradouro','address');
  if(enderecoIdx===null&&headers.length>10){
    const k=norm(headers[10]);
    if(!k.includes('matriz')&&!k.includes('codigo')&&!k.includes('codigo'))enderecoIdx=10;
  }
  return{
    nome:find('nome','name','aluno','discente')??0,
    matricula:find('matricula','mat'),
    curso:find('descricao do curso','descricao','curso','course'),
    descricaoCurso:find('descricao do curso','desc'),
    siglaTurma:find('sigla da turma','sigla'),
    turma:find('turma','class','grupo'),
    periodo:find('periodo atual','periodo'),
    anoIngresso:find('ano de ingresso','ingresso','ano'),
    campus:find('campus'),
    codigoCurso:find('codigo curso'),
    dataNascimento:find('data de nasc','nascimento'),
    idade:find('idade'),
    deficiencia:find('deficiencia'),
    superdotacao:find('superdotacao'),
    transtorno:find('transtorno'),
    situacao:find('situacao','status'),
    modalidade:find('modalidade'),
    nivelEnsino:find('nivel de ensino','nivel'),
    endereco:enderecoIdx,
    urlFoto:find('url foto','url_foto','foto','url','imagem'),
    obs:'Detecção automática'
  };
}

function confirmImport(){
  if(!_pendingCourses)return;
  // ═══════════════════════════════════════════════════════════════════════
  // FIX: importação preserva alunos transferidos e não cria duplicatas.
  //
  // Cenário que causava perda de dados:
  //   1. Admin transfere aluno João de 111-I para 211-I (dados preservados).
  //   2. SUAP é re-importado; a planilha ainda lista João em 111-I.
  //   3. Lógica antiga: procurava João APENAS em 111-I → não encontrava (foi
  //      movido) → push do João vazio da planilha em 111-I → DUPLICATA criada
  //      (um em 111-I vazio + o original em 211-I com avaliações).
  //
  // Correção: antes de tratar um aluno como "novo", procurá-lo em QUALQUER
  // turma do banco pela chave (matrícula, fallback nome). Se já existe em
  // algum lugar, manter onde está e só atualizar os campos biográficos.
  // Transferências locais ganham prioridade sobre a planilha do SUAP.
  // ═══════════════════════════════════════════════════════════════════════

  // Indexa TODOS os alunos existentes por matrícula (e por nome como fallback),
  // junto com o objeto do aluno e a turma onde ele está.
  const indexByKey = new Map();
  for(const c of db.courses){
    for(const cl of c.classes){
      for(const s of cl.students){
        const key = (s.matricula||s.nome||'').toString().trim();
        if(key && !indexByKey.has(key)) indexByKey.set(key, { student: s, clase: cl });
      }
    }
  }

  const BIO=['endereco','deficiencia','superdotacao','transtorno','situacao',
             'dataNascimento','idade','periodo','urlFoto','foto','modalidade','nivelEnsino'];

  let transferidosPreservados = 0;

  for(const nc of _pendingCourses){
    const ex=db.courses.find(c=>c.name===nc.name);
    if(ex){
      for(const ncl of nc.classes){
        const excl=ex.classes.find(c=>c.name===ncl.name);
        if(excl){
          for(const ns of ncl.students){
            const key = (ns.matricula||ns.nome||'').toString().trim();
            if(!key){ excl.students.push(ns); continue; }
            const found = indexByKey.get(key);
            if(found){
              // Aluno já existe em alguma turma — atualiza APENAS campos
              // biográficos, preserva avaliações e NÃO move de turma.
              for(const f of BIO){
                if(ns[f]!==undefined && ns[f]!==null && String(ns[f]).trim()!=='')
                  found.student[f] = ns[f];
              }
              // Se está em turma diferente da que o SUAP indica, é porque foi
              // transferido localmente — mantém na turma atual.
              if(found.clase !== excl) transferidosPreservados++;
            } else {
              // Aluno realmente novo — adiciona e indexa para evitar duplicatas
              // posteriores dentro da mesma importação.
              excl.students.push(ns);
              indexByKey.set(key, { student: ns, clase: excl });
            }
          }
        } else {
          // Turma nova — adiciona inteira. Mas ainda precisamos verificar se
          // os alunos dela não existem em outras turmas (transferidos).
          const alunosRealmenteNovos = [];
          for(const ns of ncl.students){
            const key = (ns.matricula||ns.nome||'').toString().trim();
            if(!key){ alunosRealmenteNovos.push(ns); continue; }
            const found = indexByKey.get(key);
            if(found){
              // Já existe em outra turma (transferido) — preserva lá, só atualiza BIO
              for(const f of BIO){
                if(ns[f]!==undefined && ns[f]!==null && String(ns[f]).trim()!=='')
                  found.student[f] = ns[f];
              }
              transferidosPreservados++;
            } else {
              alunosRealmenteNovos.push(ns);
              indexByKey.set(key, { student: ns, clase: ncl });
            }
          }
          ncl.students = alunosRealmenteNovos;
          ex.classes.push(ncl);
        }
      }
    } else {
      // Curso novo — cada turma passa pelo filtro de duplicatas também
      for(const ncl of nc.classes){
        ncl.students = ncl.students.filter(ns=>{
          const key = (ns.matricula||ns.nome||'').toString().trim();
          if(!key) return true;
          const found = indexByKey.get(key);
          if(found){
            for(const f of BIO){
              if(ns[f]!==undefined && ns[f]!==null && String(ns[f]).trim()!=='')
                found.student[f] = ns[f];
            }
            transferidosPreservados++;
            return false;
          }
          indexByKey.set(key, { student: ns, clase: ncl });
          return true;
        });
      }
      db.courses.push(nc);
    }
  }

  db.lastImport=new Date().toISOString();saveDB();
  document.getElementById('confirm-import-btn').style.display='none';
  const total=_pendingCourses.reduce((s,c)=>s+c.classes.reduce((s2,cl)=>s2+cl.students.length,0),0);
  const msg = transferidosPreservados>0
    ? `🎉 Importação concluída! ${total} alunos processados. ${transferidosPreservados} aluno(s) transferido(s) localmente foram preservados na turma atual.`
    : `🎉 Importação concluída! ${total} alunos (endereços atualizados).`;
  addLog(msg);
  addActivityLog('import',`Planilha importada: ${total} alunos; ${transferidosPreservados} transferidos preservados`);
  db.courses.filter(ehCursoTecnico).forEach(c=>{if(!c.classes.find(isEvasaoClass))getOrCreateEvasaoClass(c.id);});
  renderDashboard();injectAlunosTab();toast('Importação concluída! 🎉','ok');_pendingCourses=null;
}

function exportBackup(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`conselho_classe_backup_${new Date().toISOString().slice(0,10)}.json`;a.click();toast('Backup exportado!','ok');}
function importBackup(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const p=JSON.parse(ev.target.result);confirmAction('Importar Backup','Substituirá TODOS os dados atuais.',()=>{db=p;if(!db.users)db.users=defaultDB().users;if(!db.schedules)db.schedules={};saveDB();renderDashboard();renderAdmin();toast('Backup importado!','ok');addActivityLog('import','Backup JSON importado');});}catch{toast('Arquivo inválido','err');}};r.readAsText(f);e.target.value='';}
function confirmClear(){confirmAction('⚠️ Apagar Todos os Dados','Remove TODOS os alunos e avaliações. Irreversível!',()=>{const t=db.courses.reduce((s,c)=>s+c.classes.reduce((s2,cl)=>s2+cl.students.length,0),0);db.courses=[];db.lastImport=null;saveDB();addActivityLog('clear',`Dados apagados: ${t} alunos removidos`);renderDashboard();toast('Dados apagados','warn');});}

