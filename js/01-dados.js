



// ══════════════════ DATA ══════════════════
const DB_KEY='ifma_conselho_v3';
const LOG_KEY='ifma_conselho_log_v2';
const CLASSIF={1:{label:'Ruim',cls:'ruim',val:1,color:'#E65100'},2:{label:'Regular',cls:'regular',val:2,color:'#F9A825'},3:{label:'Bom',cls:'bom',val:3,color:'#2E7D32'},4:{label:'Excelente',cls:'excelente',val:4,color:'#1565C0'}};
const CLASSIF_LABEL={0:'—',1:'Ruim',2:'Regular',3:'Bom',4:'Excelente'};
const CLASSIF_COLOR={0:'#aaa',1:'#E65100',2:'#F9A825',3:'#2E7D32',4:'#1565C0'};
const COMP_POS=['Presta atenção nas aulas','Pontualidade','Assiduidade','Postura ética','Organização','Bom relacionamento c/ a turma','Compromisso','Cordialidade','Proatividade'];
const COMP_ISSUES=['Conversas paralelas','Falta muito','Chega atrasado','Brincadeiras excessivas','Dispersão','Problemas de relacionamento c/ os pares','Uso do celular','Cansaço/sono recorrente','Inquieto(a) / Sai de sala com frequência'];
const DESEMP_POS=['Faz as atividades','Esforçado(a)','Responsável','Participativo(a)','Interessado(a)','Facilidade de aprendizado','Auxilia os colegas','Organização com os estudos','Bons resultados nas avaliações'];
const DESEMP_ISSUES=['Não faz as atividades','Não participa','Falta de interesse','Dificuldade de compreensão','Não traz o material','Falta de base','Precisa estudar mais','Dificuldade em apresentações de trabalho','Baixo rendimento em avaliações'];
const ENCAMINHAMENTOS=['Convocar os responsáveis','Orientação Pedagógica','Encaminhar para a Psicóloga','Monitoria','Serviço Social','CAI/NAPNE'];
const ENCAM_OUTRO_KEY='__outro__';
const PHP_URL='supabase'; // mantido por compatibilidade; o acesso real está em 10-servidor.js
let _usePhp=null,_serverOk=false,_pollingTimer=null;

function defaultDB(){
  return{
    version:2,
    users:[{id:'1',username:'admin',password:'ifma2026',role:'admin',name:'Administrador',createdAt:new Date().toISOString()}],
    courses:[],lastImport:null,
    schedules:{}, // {siglaTurma: [{disc:'...',prof:'...'}]}
    professors:[{"id": "w3s7oid08y67wh0c", "nome": "ADRIANA", "nomeCompleto": "Adriana Oliveira Santos Matias", "matricula": "1871571"}, {"id": "mj3kg0vm408ner8q", "nome": "ADRIANO", "nomeCompleto": "Adriano Francisco Monteiro dos Santos", "matricula": "1682455"}, {"id": "hcr18f4dx8niqni0", "nome": "ADRIANO BEZERRA", "nomeCompleto": "Adriano Bezerra Pereira", "matricula": "2416329"}, {"id": "rmeyk575oqmtykjt", "nome": "ALBERTO", "nomeCompleto": "Alberto Candido Sousa Alencar", "matricula": "2322854"}, {"id": "ijsxsyzt1qhkd195", "nome": "ALEX", "nomeCompleto": "Alexssandry Lamarques Sousa", "matricula": "3474553"}, {"id": "n93gunx5j35kn4iv", "nome": "ALIELSON", "nomeCompleto": "Alielson Correa Botelho", "matricula": "1767519"}, {"id": "llobvam6h0yswkwh", "nome": "ALIFRAN", "nomeCompleto": "Alifran Araujo Santos", "matricula": "1483866"}, {"id": "yih789d6bm4g3sxo", "nome": "ALUÍSIO", "nomeCompleto": "Jose Aluisio Mendes de Sousa Junior", "matricula": "1783342"}, {"id": "47nq3cu02c59sy64", "nome": "AMORIM", "nomeCompleto": "Raimundo Amorim Duarte Neto", "matricula": "1483859"}, {"id": "avrzyag494t8b4c3", "nome": "ANA ANGÉLICA", "nomeCompleto": "Ana Angelica Mathias Macedo", "matricula": "1666989"}, {"id": "7w68y3894j8q7bld", "nome": "ANA CARLA", "nomeCompleto": "Ana Carla Carneiro Rio", "matricula": "2342287"}, {"id": "xh8cu1un8qibx9s6", "nome": "ANA CAROLINA", "nomeCompleto": "Ana Carolina Freitas de Farias", "matricula": "3408319"}, {"id": "hkd80b4gs6qvffxb", "nome": "ANA MARIA", "nomeCompleto": "Ana Maria Souza dos Santos", "matricula": "1831966"}, {"id": "s5npvk4a5fya4z7f", "nome": "ANDERSON", "nomeCompleto": "Anderson Araujo Casanova", "matricula": "1483892"}, {"id": "3pbkvrwc7h5c7a4o", "nome": "ANDRÉ", "nomeCompleto": "Andre Sales Aguiar Furtado", "matricula": "2413073"}, {"id": "xda9xwepayiors2f", "nome": "ANTÔNIO VIEIRA", "nomeCompleto": "Antonio Jose Dias Vieira", "matricula": "1364072"}, {"id": "fjqtatnredtmjdc9", "nome": "ARICELMA", "nomeCompleto": "Aricelma Costa Ibiapina", "matricula": "1572766"}, {"id": "sg2grhpii3qni3tc", "nome": "ARILTON", "nomeCompleto": "Arilton Raimundo Souza Macedo", "matricula": "2305587"}, {"id": "hz73qykcw66anb1v", "nome": "ARLETE", "nomeCompleto": "Arlete Fragas da Silva", "matricula": "1958760"}, {"id": "dz15r0vko24n4xif", "nome": "BIANCA", "nomeCompleto": "Bianca Macedo de Araujo", "matricula": "3515883"}, {"id": "09fw70dp3rv19820", "nome": "BISNETO", "nomeCompleto": "Antonio Maranhao Bisneto", "matricula": "1169222"}, {"id": "ni7qy1e6xysr2lck", "nome": "BRUNA", "nomeCompleto": "Bruna Caroline Sousa Macedo", "matricula": "3474609"}, {"id": "eshvtcgznf0sv3nz", "nome": "CIRANO", "nomeCompleto": "Cirano Melo Pinheiro", "matricula": "3261859"}, {"id": "muu4b4jor3mhf8wy", "nome": "CLÁUDIO", "nomeCompleto": "Claudio Henrique Moura de Andrade", "matricula": "1637230"}, {"id": "ravwtaainv9t2ome", "nome": "CLERTON", "nomeCompleto": "Antonio Clerton Santana de Araujo", "matricula": "1102677"}, {"id": "ut0el6lliby8j7cx", "nome": "CLEUMIR", "nomeCompleto": "Cleumir Pereira Leal", "matricula": "1571986"}, {"id": "wvi33pq2318su2st", "nome": "DANIEL", "nomeCompleto": "Daniel Santos de Carvalho", "matricula": "1789749"}, {"id": "wb3ugxtf2va5cvqn", "nome": "DANIELA", "nomeCompleto": "Daniela de Sousa Cortez", "matricula": "1521294"}, {"id": "zcgnlmpg3k9kguvj", "nome": "DANILLO", "nomeCompleto": "Danillo Silva Nunes", "matricula": "3489846"}, {"id": "k4cc0uee87xhnidd", "nome": "DAVI", "nomeCompleto": "Davi Ketley Sousa Moraes", "matricula": "1180589"}, {"id": "jw0mz129amtiuezl", "nome": "DÊINISE", "nomeCompleto": "Deinise Lima Bonfim", "matricula": "1565498"}, {"id": "hiqxep7quhses83w", "nome": "DIEGO", "nomeCompleto": "Diego Ted Rogrigues Bogea", "matricula": "2328711"}, {"id": "qzn5f2yackbaqryx", "nome": "EDIL", "nomeCompleto": "Edil Jarles de Jesus Nascimento", "matricula": "1258259"}, {"id": "qh0wqs2srswzd5xs", "nome": "ELIEL", "nomeCompleto": "Eliel de Oliveira", "matricula": "1679714"}, {"id": "fcpi92jjzcd41378", "nome": "ELINEUSA", "nomeCompleto": "Elineusa Macario dos Santos Lima", "matricula": "1084095"}, {"id": "cv97gf9gispamz15", "nome": "ELLEN", "nomeCompleto": "Ellen Dayanne Andrade Souza", "matricula": "3485382"}, {"id": "3ngfj93dlra41off", "nome": "EMÃNUEL", "nomeCompleto": "Emanuel Luiz Souza e Silva", "matricula": "1385083"}, {"id": "y74cdmh7pik7i7nt", "nome": "EMMANUEL XAVIER", "nomeCompleto": "Emmanuel Silva Xavier", "matricula": "2967270"}, {"id": "di1xyr38cm4d220h", "nome": "EVERTON", "nomeCompleto": "Everton Soares Cangussu", "matricula": "1731353"}, {"id": "mf5d9lbjb98pxjt3", "nome": "GABRIELA", "nomeCompleto": "Gabriela de Carvalho Veloso", "matricula": "1846356"}, {"id": "ulq1mo09r4m4mgjh", "nome": "GEORGE", "nomeCompleto": "George Carvalho Almeida", "matricula": "1878144"}, {"id": "cgz1e2h47jr68gsa", "nome": "GESIVALDO", "nomeCompleto": "Gesivaldo dos Santos Silva", "matricula": "1959706"}, {"id": "8ynwg6j6rwcd5vtw", "nome": "GLAUCO", "nomeCompleto": "Glauco Hebert Almeida de Melo", "matricula": "1614153"}, {"id": "x3peetxmvyayg5sh", "nome": "GUILHERME", "nomeCompleto": "Guilherme Henrique Ramos Silva", "matricula": "1262404"}, {"id": "cqs8ng4hqcvykit0", "nome": "IRAN", "nomeCompleto": "Jose Iran Saraiva da Silva", "matricula": "1056963"}, {"id": "r3ojx6hzwpis4cxu", "nome": "ISAIAS", "nomeCompleto": "Isaias Pereira Coelho", "matricula": "1551609"}, {"id": "7y189ve9fnxy35iu", "nome": "JACKES", "nomeCompleto": "Jackes de Pabllo Pereira Tiburcio", "matricula": "3268333"}, {"id": "mj3y54lruakke7jt", "nome": "JAKELINE", "nomeCompleto": "Jakeline Freitas da Luz", "matricula": "1195301"}, {"id": "e7zgxnt7s2nhe1sd", "nome": "JONAS", "nomeCompleto": "Jonas Silva Grangeiro", "matricula": "1086242"}, {"id": "opz8cmjbas6ctgsp", "nome": "JOSÉ CARLOS", "nomeCompleto": "Jose Carlos Martins dos Santos Bezerra", "matricula": "1195105"}, {"id": "1iswpwoshhcrq3r0", "nome": "JOSY", "nomeCompleto": "Josy Neres da Silva", "matricula": "3426847"}, {"id": "xlbbbzpc7ysrefap", "nome": "JUAN", "nomeCompleto": "Juan Pablo do Nascimento Vale", "matricula": "3300316"}, {"id": "j9hz11a6l1o3azal", "nome": "JÚLIO CESAR", "nomeCompleto": "Julio Cesar Nascimento Souza", "matricula": "271717"}, {"id": "bdwif9hbb6m7uhp8", "nome": "KERLLY", "nomeCompleto": "Kerlly Karine Pereira Herenio Amaral", "matricula": "2034811"}, {"id": "qf7ni9z4ml80lzzr", "nome": "LAÉCIO", "nomeCompleto": "Laecio Gomes Galdino", "matricula": "1524677"}, {"id": "qxnasq7furys4dww", "nome": "LAÍS", "nomeCompleto": "Lais Milhomem de Souza", "matricula": "2995943"}, {"id": "0oaauyeu7dfguqtf", "nome": "LENNYSE", "nomeCompleto": "Lennyse Teixeira Bandeira", "matricula": "3485534"}, {"id": "ti554l8sxgpkdpgl", "nome": "LUAN", "nomeCompleto": "Luan Henrique Varao Silva", "matricula": "1264288"}, {"id": "zc9y1eah749c5prp", "nome": "LUANA", "nomeCompleto": "Adelina Luana Oliveira de Moura", "matricula": "3445509"}, {"id": "hb0u1un61jvajmbd", "nome": "LUCIANA", "nomeCompleto": "Luciana Learte Moura Nunes", "matricula": "2770501"}, {"id": "tipk7sb6ia3l4c6z", "nome": "MACHADO", "nomeCompleto": "Jose Silva Machado", "matricula": "1047492"}, {"id": "f40z0auchvnpfax3", "nome": "MAGNO", "nomeCompleto": "Magno Marciete do Nascimento Oliveira", "matricula": "2412906"}, {"id": "gj5fct1aklqbuzs7", "nome": "MARCOS JEAN", "nomeCompleto": "Marcos Jean Araujo de Sousa", "matricula": "1569772"}, {"id": "gdpdda5kgactysua", "nome": "MARINALDA", "nomeCompleto": "Marinalda Pereira de Sousa", "matricula": "2569491"}, {"id": "rxvkovdmlga470nz", "nome": "MIRIAN", "nomeCompleto": "Mirian Ferreira da Silva Bogea", "matricula": "2339880"}, {"id": "m4ho31coj06jbxc6", "nome": "NELIANE", "nomeCompleto": "Neliane Raquel Macedo Aquino", "matricula": "1825473"}, {"id": "rce4oqd4fchmhu8k", "nome": "OSIEL", "nomeCompleto": "Osiel Costa Oliveira", "matricula": "1828416"}, {"id": "nv3zzfimnumjv1ej", "nome": "PATRÍCIA", "nomeCompleto": "Patricia Suelene Silva Costa Gobira", "matricula": "1938727"}, {"id": "zfsq87o8sz334ovv", "nome": "PAULO BECKMAN", "nomeCompleto": "Paulo Henrique Beckman Gomes", "matricula": "3299680"}, {"id": "rue1a0ydo1ap7yqc", "nome": "PAULO JALES", "nomeCompleto": "Paulo Cardoso Jales", "matricula": "2026200"}, {"id": "3gygpvzlqyb8loie", "nome": "PEDRO HENRIQUE", "nomeCompleto": "Pedro Henrique Alves Ribeiro", "matricula": "1419185"}, {"id": "dcshzhugx94o38be", "nome": "PEDRO JR", "nomeCompleto": "Pedro Faustino de Souza Junior", "matricula": "1210934"}, {"id": "9zfw7u0jr0wf93i4", "nome": "PEDRO QUEIROZ", "nomeCompleto": "Pedro Irapoan Queiroz Barbosa", "matricula": "1287108"}, {"id": "8dy4sw2tqwcp79fa", "nome": "RAINA", "nomeCompleto": "Raina Jansen Cutrim Propp Lima", "matricula": "1775415"}, {"id": "4eegv3o3m223cw9a", "nome": "RANNA", "nomeCompleto": "Ranna de Sousa Barros", "matricula": "1357855"}, {"id": "i5qwgw2o384ot85q", "nome": "RÉGIA", "nomeCompleto": "Regia Simony Braz da Silva", "matricula": "2020071"}, {"id": "0y9rmiuiv157fyu7", "nome": "REGIANE", "nomeCompleto": "Regiane Braz da Silva Cantanhede", "matricula": "1883918"}, {"id": "pehkeh127o2nsvnh", "nome": "REMI", "nomeCompleto": "Antonio Remi Kieling Hoffmann", "matricula": "1211021"}, {"id": "huq8qcja2b3lkkji", "nome": "RENAN", "nomeCompleto": "Renan da Silva Leal", "matricula": "3508160"}, {"id": "v55q67ezbovr5qvw", "nome": "RENATO", "nomeCompleto": "Renato Inacio Matos", "matricula": "1079952"}, {"id": "u3r7bp3y5zq4jq0y", "nome": "RICARDO BORGES", "nomeCompleto": "Ricardo Borges da Costa", "matricula": "2271716"}, {"id": "lwucpqhgpiu540tw", "nome": "RICARDO JR", "nomeCompleto": "Ricardo de Sousa Ferreira Junior", "matricula": "1820676"}, {"id": "h98p6ab7nndxs3bu", "nome": "RIVELINO", "nomeCompleto": "Rivelino Cunha Vilela", "matricula": "1195307"}, {"id": "zt3w1kbvff1pxet1", "nome": "ROBERT", "nomeCompleto": "Robert Guimaraes Silva", "matricula": "1049500"}, {"id": "hk5q2qizkszuvo9k", "nome": "RUTILEIA", "nomeCompleto": "Rutileia Lima Almeida", "matricula": "1637241"}, {"id": "gpsuksjm7brg3bbq", "nome": "SAULO", "nomeCompleto": "Saulo Cardoso", "matricula": "1582974"}, {"id": "0hqpy9ox5snvaznu", "nome": "SEBASTIÃO RICARDO", "nomeCompleto": "Sebastiao Ricardo Coelho Fonseca", "matricula": "3158927"}, {"id": "s5jyn0afhxriq70h", "nome": "SELMO", "nomeCompleto": "Selmo Eduardo Rodrigues Junior", "matricula": "2425623"}, {"id": "aj8hq6y7mbpk5gbd", "nome": "SHERYDA", "nomeCompleto": "Sheryda Lila de Souza Carvalho", "matricula": "1785107"}, {"id": "a5g9m9hb8l3qqtug", "nome": "SIMONE", "nomeCompleto": "Simone Azevedo Bandeira de Melo Aquino", "matricula": "1526505"}, {"id": "h6s9hvb04htjd357", "nome": "SIRDENYO", "nomeCompleto": "Francisco Sirdenyo Rodrigues Pereira", "matricula": "1565490"}, {"id": "0w00pfnhhle90igo", "nome": "SUBS. INFORMÁTICA", "nomeCompleto": "—", "matricula": "—"}, {"id": "71wxqbiv9f5qop1b", "nome": "SUBS. MATEMÁTICA", "nomeCompleto": "—", "matricula": "—"}, {"id": "18c41mhjjt4i9dek", "nome": "SUZY", "nomeCompleto": "Suzy Wilde dos Santos Lima", "matricula": "3483869"}, {"id": "5xhvf0ixdumxo26o", "nome": "TEREZA", "nomeCompleto": "Tereza Cristina Souza Silva", "matricula": "3499267"}, {"id": "2s2efto5165xe5n9", "nome": "TÚLIO", "nomeCompleto": "Tulio Carvalho Tsuji", "matricula": "1784706"}, {"id": "12rzb3en31dtrv3y", "nome": "VALDÍVIO", "nomeCompleto": "Valdivio Rodrigues Cerqueira", "matricula": "1076875"}, {"id": "zwk5rcgka8xfamqa", "nome": "VANDERLEI", "nomeCompleto": "Vanderlei de Araujo Lima", "matricula": "2424857"}, {"id": "9ez4n87rsrvooukc", "nome": "VICTOR", "nomeCompleto": "Victor Aurelio Batista Pires de Sousa", "matricula": "1257260"}, {"id": "8qxv8zkgqv6dk45s", "nome": "WALISON", "nomeCompleto": "Walison Silva Reis", "matricula": "1031214"}]
  };
}
function loadDB(){try{const s=localStorage.getItem(DB_KEY);if(s){const d=JSON.parse(s);if(!d.schedules)d.schedules={};if(!d.settings)d.settings={};
  // Migra chave do localStorage antigo para o DB compartilhado
  const oldKey=localStorage.getItem('scc_anthropic_key');
  if(oldKey&&!d.settings.anthropicKey){d.settings.anthropicKey=oldKey;localStorage.removeItem('scc_anthropic_key');}
  return d;}return defaultDB();}catch{return defaultDB();}}
// ═══════════════════════ MULTI-USER SYNC v2 ═══════════════════════
// A partir da v2.0, o armazenamento é híbrido:
//   - banco.json   → núcleo (cursos, turmas, professores, users, schedules)
//   - usuarios/<u>.json → patch de cada usuário (avaliações + notas de turma)
// Cada usuário grava SOMENTE o próprio arquivo. Não há colisão.
// Ao carregar, mescla-se núcleo + patches de todos os usuários.

// Flag que marca uma sessão que já recebeu merge de patches (evita um re-merge
// em cima do outro estourar o que o usuário acabou de digitar).
let _corePullTs = 0;
// Handle de envio pendente (mantido apenas para compatibilidade caso alguém
// ainda tenha uma versão antiga no cache do navegador — no save atual não há
// mais debounce: cada alteração dispara um envio imediato).
let _patchSaveTimer = null;

// ═══════════════════════════════════════════════════════════════════════════
// DIRTY TRACKING — conjuntos de entradas modificadas nesta sessão.
// O patch enviado ao servidor só inclui entradas que ESTE usuário realmente
// alterou. Sem isso, o patch carrega TUDO em memória, e o "last write wins"
// sobrescreve alterações de outro usuário que esteja editando o mesmo aluno
// em outra aba/dispositivo.
//
// Chaves:
//   _dirtyStudentAv : Set de "studentId|year|bim" para avaliações alteradas
//   _dirtyClassBim  : Set de "classId|bim" para aspectos positivos/negativos
//
// Os conjuntos persistem até o próximo reload/login. Toda função que MUTA
// o db (setAvYear, saveCovBim, etc.) também marca a chave correspondente.
// ═══════════════════════════════════════════════════════════════════════════
const _dirtyStudentAv = new Set();
const _dirtyClassBim = new Set();
function markStudentAvDirty(sid, year, bim){
  if(!sid || !year || !bim) return;
  _dirtyStudentAv.add(`${sid}|${year}|${bim}`);
}
function markClassBimDirty(clid, bim){
  if(!clid || !bim) return;
  _dirtyClassBim.add(`${clid}|${bim}`);
}
function clearDirty(){
  _dirtyStudentAv.clear();
  _dirtyClassBim.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// Extrai do db atual APENAS o patch do usuário logado com APENAS as entradas
// que foram alteradas nesta sessão (dirty tracking).
//
// Por que só o que está dirty?
// Antes, o patch incluía TODO o estado em memória. Se duas pessoas abriam a
// mesma ficha, a última a sair mandava seu estado local (desatualizado em
// relação ao que a outra acabou de marcar) e sobrescrevia.
//
// Agora: cada usuário envia APENAS as entradas (aluno+ano+bim, ou turma+bim)
// que ele mesmo modificou durante esta sessão. As demais entradas ficam
// intocadas no arquivo dele no servidor — preservando o que outros usuários
// gravaram nas suas próprias sessões.
// ═══════════════════════════════════════════════════════════════════════════
function buildCurrentUserPatch(){
  const patch = { studentAvaliacoes: {}, classBimestres: {} };
  if(!db||!db.courses) return patch;
  const isAdm = curUser?.role==='admin';
  const allowedClassIds = new Set();
  if(!isAdm){
    const permCourseIds = new Set(curUser?.permissions||[]);
    db.courses.forEach(c=>{
      if(!permCourseIds.has(c.id)) return;
      const myKey = getGroupKey(c.name);
      db.courses.forEach(c2=>{ if(getGroupKey(c2.name)===myKey) c2.classes.forEach(cl=>allowedClassIds.add(cl.id)); });
    });
  }
  const sById = {};
  const clById = {};
  db.courses.forEach(c=>c.classes.forEach(cl=>{
    clById[cl.id] = cl;
    cl.students.forEach(s=>{ sById[s.id] = s; });
  }));

  // Só inclui avaliações marcadas como DIRTY nesta sessão
  for(const key of _dirtyStudentAv){
    const [sid, yr, b] = key.split('|');
    const s = sById[sid]; if(!s) continue;
    // Checar permissão
    let inAllowedClass = isAdm;
    if(!isAdm){
      db.courses.some(c=>c.classes.some(cl=>{
        if(!allowedClassIds.has(cl.id)) return false;
        if(cl.students.some(st=>st.id===sid)){ inAllowedClass = true; return true; }
        return false;
      }));
    }
    if(!inAllowedClass) continue;
    const av = s.avaliacoes?.[yr]?.[b];
    if(!patch.studentAvaliacoes[sid]) patch.studentAvaliacoes[sid] = {};
    if(!patch.studentAvaliacoes[sid][yr]) patch.studentAvaliacoes[sid][yr] = {};
    // Inclui o valor atual (pode ser objeto vazio/null para "limpeza" explícita)
    patch.studentAvaliacoes[sid][yr][b] = av || null;
  }

  // Só inclui notas de turma marcadas como DIRTY nesta sessão
  for(const key of _dirtyClassBim){
    const [clid, b] = key.split('|');
    const cl = clById[clid]; if(!cl) continue;
    if(!isAdm && !allowedClassIds.has(clid)) continue;
    const bv = cl.bimestres?.[b];
    if(!patch.classBimestres[clid]) patch.classBimestres[clid] = {};
    patch.classBimestres[clid][b] = bv ? { positivos: bv.positivos||'', negativos: bv.negativos||'' } : null;
  }

  return patch;
}

// Aplica um patch (ou map de patches por usuário) sobre o db carregado.
// Estratégia de merge: "last write wins por entrada" usando _savedAt do patch.
// Na prática, conjuntos são disjuntos (cada usuário só edita as próprias turmas),
// mas se houver colisão (admin corrigiu algo que o professor também tem), ganha
// o mais recente.
function applyPatchesToDb(patches){
  if(!Array.isArray(patches)) patches = Object.values(patches||{});
  // Ordena por _savedAt crescente para que o mais recente sobrescreva
  patches = [...patches].filter(p=>p && typeof p==='object');
  patches.sort((a,b)=>{
    const ta = a._savedAt ? Date.parse(a._savedAt)||0 : 0;
    const tb = b._savedAt ? Date.parse(b._savedAt)||0 : 0;
    return ta-tb;
  });
  const sById = {};
  db.courses.forEach(c=>c.classes.forEach(cl=>cl.students.forEach(s=>{sById[s.id]=s;})));
  const clById = {};
  db.courses.forEach(c=>c.classes.forEach(cl=>{clById[cl.id]=cl;}));
  patches.forEach(p=>{
    // Avaliações
    if(p.studentAvaliacoes && typeof p.studentAvaliacoes==='object'){
      for(const[sid,yrs] of Object.entries(p.studentAvaliacoes)){
        const s = sById[sid]; if(!s) continue;
        if(!s.avaliacoes) s.avaliacoes = {};
        for(const[yr,bims] of Object.entries(yrs)){
          if(!s.avaliacoes[yr]) s.avaliacoes[yr] = {};
          Object.assign(s.avaliacoes[yr], bims);
        }
      }
    }
    // Notas de bimestre de turma
    if(p.classBimestres && typeof p.classBimestres==='object'){
      for(const[clid,bims] of Object.entries(p.classBimestres)){
        const cl = clById[clid]; if(!cl) continue;
        if(!cl.bimestres) cl.bimestres = {};
        Object.assign(cl.bimestres, bims);
      }
    }
  });
}

// Remove do db as avaliações e notas de bimestre — mantém só o "núcleo".
// Usado antes de gravar banco.json para que o núcleo não contenha dados voláteis.
// IMPORTANTE: senhas dos usuários são preservadas do servidor, não sobrescritas
// pelo db local (que pode estar desatualizado). A troca de senha de cada usuário
// vai por endpoint dedicado (change_password), e o admin nunca deve sobrescrever
// a senha de outro usuário via save_core.
async function buildCoreSnapshotAsync(){
  const core = JSON.parse(JSON.stringify(db));
  if(core.courses){
    core.courses.forEach(c=>c.classes.forEach(cl=>{
      delete cl.bimestres;
      cl.students.forEach(s=>{ delete s.avaliacoes; });
    }));
  }
  // Preserva as senhas atuais do servidor. Se falhar (offline), cai no comportamento
  // antigo (usa senhas locais), mas isso é raro e menos grave que apagar as senhas.
  // No Supabase as senhas ficam numa tabela separada e o servidor ignora o
  // campo password do núcleo; não é mais preciso buscá-las antes de gravar.
  if(false && _usePhp && Array.isArray(core.users)){
    try{
      const serverCore = await phpGet('get_core');
      if(serverCore && Array.isArray(serverCore.users)){
        const serverPw = {};
        serverCore.users.forEach(u=>{ if(u.username) serverPw[u.username.toLowerCase()] = u.password; });
        core.users.forEach(u=>{
          const su = serverPw[(u.username||'').toLowerCase()];
          if(su!==undefined) u.password = su;
        });
      }
    } catch(e){/* ignora, segue com senhas locais */}
  }
  return core;
}

// Versão síncrona — só usada em contextos que não podem esperar (migração legada).
// Retorna o core sem a preservação de senhas do servidor. NÃO use para save_core regular.
function buildCoreSnapshot(){
  const core = JSON.parse(JSON.stringify(db));
  if(core.courses){
    core.courses.forEach(c=>c.classes.forEach(cl=>{
      delete cl.bimestres;
      cl.students.forEach(s=>{ delete s.avaliacoes; });
    }));
  }
  return core;
}

// Contador de saves em andamento — quando > 0, o badge mostra amarelo (salvando).
// Quando chega a 0, volta ao verde (sincronizado).
let _pendingSaves = 0;
// Fila de saves: garante ordem e que só um save esteja em voo por vez,
// evitando que posts cheguem ao servidor fora de ordem e uma versão antiga
// sobrescreva uma mais nova.
let _saveInFlight = false;
let _saveQueued = false;
// Flag que bloqueia o polling enquanto há saves pendentes — previne que o
// polling puxe dados do servidor e aplique "por cima" das edições locais
// ainda não confirmadas.
let _pollingPaused = false;

// Debounce curto: agrupa cliques em rajada num único POST. 400ms é
// imperceptível pra quem está clicando e reduz drasticamente o número de
// requests simultâneos (crítico em hospedagem compartilhada que bloqueia
// por rate limit).
let _saveDebounceTimer = null;
// Debounce aumentado de 400ms para 1500ms — em hospedagem compartilhada
// (HostGator) muitas requisições simultâneas de write+lock fazem o servidor
// rejeitar com 503/timeout. 1,5s é imperceptível para o usuário e consolida
// múltiplos cliques num único save.
const _SAVE_DEBOUNCE_MS = 1500;

// Envia o patch do usuário logado ao servidor com debounce curto.
// Cada mudança agenda um save; cliques/teclas dentro da janela de 400ms
// são consolidados num único POST. Dados nunca ficam só no localStorage:
// flushPendingSave() força envio imediato em eventos críticos (troca de
// aluno/turma/bimestre, logout, beforeunload).
//
// Estratégia de serialização:
// - Se já há um save em voo, marca _saveQueued=true. Quando o atual terminar,
//   um único save "consolidado" é enviado com o estado mais recente.
// - Isso elimina a race condition de posts fora de ordem e garante que o
//   servidor sempre receba uma sequência coerente de snapshots.
function schedulePatchSave(){
  if(!_usePhp || !curUser) return;
  // Bloqueia saves até o primeiro pull pós-login terminar. Sem isso, um cache
  // velho do localStorage poderia disparar saves antes do merge do servidor
  // estar concluído, sobrescrevendo dados mais recentes de outros dispositivos.
  if(!_initialPullDone) return;
  if(_saveInFlight){
    _saveQueued = true;
    return;
  }
  // Debounce: agenda (ou reagenda) o envio para daqui a _SAVE_DEBOUNCE_MS ms.
  // Se outro clique vier antes, o timer é cancelado e reagendado — tudo vira
  // um único POST consolidado.
  if(_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
  _saveDebounceTimer = setTimeout(()=>{
    _saveDebounceTimer = null;
    _doSave();
  }, _SAVE_DEBOUNCE_MS);
}

function _doSave(){
  _saveInFlight = true;
  _pollingPaused = true;
  _pendingSaves++;
  updateSyncStatus('warn');
  // Captura a foto atual dos conjuntos dirty ANTES de montar o patch.
  // Depois do sucesso, remove apenas essas chaves (mudanças feitas durante o
  // envio ficam no conjunto pra ir no próximo save).
  const dirtySnapshotStu = new Set(_dirtyStudentAv);
  const dirtySnapshotCls = new Set(_dirtyClassBim);
  const patch = buildCurrentUserPatch();
  // Se não há nada pra enviar, pula o save (evita requests desnecessários)
  const nothingToSend = Object.keys(patch.studentAvaliacoes||{}).length===0
    && Object.keys(patch.classBimestres||{}).length===0;
  if(nothingToSend){
    _pendingSaves = Math.max(0, _pendingSaves-1);
    _saveInFlight = false;
    _pollingPaused = false;
    if(_pendingSaves===0) updateSyncStatus('ok');
    return;
  }
  phpPost('save_user_patch', { user: curUser.username, patch })
    .then(r=>{
      _pendingSaves = Math.max(0, _pendingSaves-1);
      _saveInFlight = false;
      if(r?.ok){
        // Remove do dirty apenas as chaves que foram para este patch com sucesso
        dirtySnapshotStu.forEach(k=>_dirtyStudentAv.delete(k));
        dirtySnapshotCls.forEach(k=>_dirtyClassBim.delete(k));
      }
      if(_saveQueued){
        _saveQueued = false;
        _doSave();
      } else {
        _pollingPaused = false;
        if(_pendingSaves===0) updateSyncStatus(r?.ok?'ok':'off');
      }
    })
    .catch(()=>{
      _pendingSaves = Math.max(0, _pendingSaves-1);
      _saveInFlight = false;
      // Em caso de erro, MANTÉM o dirty — tentar de novo no próximo save
      if(_saveQueued){
        _saveQueued = false;
        _doSave();
      } else {
        _pollingPaused = false;
        if(_pendingSaves===0) updateSyncStatus('off');
      }
    });
}

// Envia o núcleo (só admin chama isso — importação de planilha, criação de turma, edição de usuário).
// Debounce do save do núcleo (admin only). Alterações administrativas — editar
// aluno, renomear turma, importação — podem disparar vários saves em cascata;
// o debounce consolida num único POST.
let _coreSaveDebounceTimer = null;
// Debounce aumentado para reduzir lock contention no banco.json
const _CORE_SAVE_DEBOUNCE_MS = 2500;

async function scheduleCoreSave(){
  if(!_usePhp) return;
  if(curUser?.role !== 'admin') return; // defesa em profundidade — só admin escreve o núcleo
  // Bloqueia até primeiro pull pós-login terminar (evita overwrite com cache antigo)
  if(!_initialPullDone) return;
  if(_coreSaveDebounceTimer) clearTimeout(_coreSaveDebounceTimer);
  _coreSaveDebounceTimer = setTimeout(async ()=>{
    _coreSaveDebounceTimer = null;
    const core = await buildCoreSnapshotAsync();
    _pendingSaves++;
    updateSyncStatus('warn');
    phpPost('save_core', core)
      .then(r=>{
        _pendingSaves = Math.max(0, _pendingSaves-1);
        if(_pendingSaves===0) updateSyncStatus(r?.ok?'ok':'off');
      })
      .catch(()=>{
        _pendingSaves = Math.max(0, _pendingSaves-1);
        if(_pendingSaves===0) updateSyncStatus('off');
      });
  }, _CORE_SAVE_DEBOUNCE_MS);
}

function saveDB(){
  // Salva no localStorage como cache (se couber; o servidor é a fonte de verdade)
  try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch(e){}
  if(!_usePhp) return;
  // Todos: salvam seu próprio patch (avaliações/turmas que editaram)
  schedulePatchSave();
  // Admin: também replica o núcleo (cursos, professores, users) ao servidor.
  // Chamadas sucessivas em menos de 2s são agrupadas por _coreSaveTimer.
  if(curUser?.role==='admin') scheduleCoreSave();
}
let db=loadDB();
let curUser=null,curView='dashboard';
let activeClassId=null,activeStudentId=null,activeBim=1,_classLocked=true;
let listStudents=[],evolChart=null;
let _dashGroups={},_permGroups={};
let _curComp=0,_curDesemp=0;
let _covBim=1; // class overview active bim
// Senha digitada no login — usada pelo overlay de "trocar senha no 1º acesso".
// Como `curUser.password` não vem do servidor (hashed), precisamos guardar
// a senha em texto puro temporariamente para enviar como `currentPassword`
// no endpoint change_password do PHP (que faz password_verify).
let _loginPwForForceChange='';
// Flag que bloqueia saves até o primeiro pull pós-login terminar. Sem isso,
// um cache local antigo poderia disparar saves antes do merge do servidor,
// sobrescrevendo dados mais recentes de outros dispositivos.
let _initialPullDone=false;

