// ══ GEOCODING + HAVERSINE ══
const IFMA_LAT=-5.491008576073533,IFMA_LON=-47.49549580075903;
const _geoCache={};

function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// ── Cache persistente de geocodificação (localStorage) ──
const GEO_CACHE_KEY='scc_geo_cache_v3';
function _loadGeoCache(){try{return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)||'{}');}catch{return{};}}
function _saveGeoCache(cache){try{localStorage.setItem(GEO_CACHE_KEY,JSON.stringify(cache));}catch{}}

async function geocodeAddress(addr){
  if(!addr||String(addr).trim().length<5)return null;
  const key=String(addr).trim().toLowerCase();

  // 1. Verifica cache persistente
  const cache=_loadGeoCache();
  if(cache[key]!==undefined)return cache[key];

  const save=(val)=>{
    const c=_loadGeoCache();
    c[key]=val;
    _saveGeoCache(c);
    return val;
  };

  // Helper: chama Nominatim e calcula distância se encontrou
  const tryQuery=async(q)=>{
    try{
      const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q='+encodeURIComponent(q);
      const r=await fetch(url,{headers:{'Accept-Language':'pt-BR','User-Agent':'SCC-IFMA/1.0'}});
      const data=await r.json();
      if(data&&data[0]){
        const km=haversineKm(IFMA_LAT,IFMA_LON,parseFloat(data[0].lat),parseFloat(data[0].lon));
        return +km.toFixed(1);
      }
    }catch(e){}
    return null;
  };

  // Extrai partes do endereço
  // Formato SUAP: "Rua X, 123, Bairro Y, 65XXX-XXX, Cidade-UF"
  const parts=String(addr).split(',').map(p=>p.trim()).filter(p=>p.length>0);

  // ── DETECTA CIDADE/UF NO FIM DO ENDEREÇO ──
  // Procura "Cidade-UF" (ex: "Imperatriz-MA", "Itinga do Maranhão-MA")
  // Sem isso, qualquer aluno de fora de Imperatriz tem distância errada.
  let cidade='Imperatriz';
  let uf='MA';
  for(let i=parts.length-1;i>=Math.max(0,parts.length-3);i--){
    const m=parts[i].match(/^(.+?)\s*[-–\/]\s*([A-Z]{2})$/i);
    if(m){
      cidade=m[1].trim();
      uf=m[2].toUpperCase();
      break;
    }
  }
  const cidadeUF=`${cidade}, ${uf}`;
  const ehImperatriz=/imperatriz/i.test(cidade);

  // 2. Estratégia 1: CEP isolado + cidade detectada
  const cepMatch=String(addr).match(/\b(\d{5}-?\d{3})\b/);
  if(cepMatch){
    const cep=cepMatch[1];
    const r1=await tryQuery(`${cep}, ${cidadeUF}, Brasil`);
    if(r1!==null)return save(r1);
    await new Promise(r=>setTimeout(r,500));
  }

  // 3. Estratégia 2: Bairro + Cidade detectada (penúltimo antes do CEP)
  const bairro=parts.length>=3?parts[parts.length-3]:null;
  if(bairro&&bairro.length>3&&!/^\d/.test(bairro)){
    const r2=await tryQuery(`${bairro}, ${cidadeUF}, Brasil`);
    if(r2!==null)return save(r2);
    await new Promise(r=>setTimeout(r,500));
  }

  // 4. Estratégia 3: SÓ a cidade (último recurso — funciona pra outras cidades)
  if(!ehImperatriz){
    const r3=await tryQuery(`${cidadeUF}, Brasil`);
    if(r3!==null)return save(r3);
    await new Promise(r=>setTimeout(r,500));
  }

  // 5. Estratégia 4 (fallback Imperatriz): Rua + número + Imperatriz
  if(ehImperatriz && parts.length>=2){
    const rua=parts[0];
    const num=parts[1];
    const r4=await tryQuery(`${rua}, ${num}, Imperatriz, Maranhão, Brasil`);
    if(r4!==null)return save(r4);
  }

  return save(null);
}

// ══ DIAGNÓSTICO MODAL ══
// ══ DIAGNÓSTICO — SAVE / LOAD ══
function _diagKey(classId,bim){return`scc_diag_${classId}_b${bim}`;}

function saveDiagResult(text){
  const key=_diagKey(activeClassId,_covBim);
  const record={text,date:new Date().toISOString(),classId:activeClassId,bim:_covBim,className:findClass(activeClassId)?.clase?.name||''};
  localStorage.setItem(key,JSON.stringify(record));
}

function loadDiagResult(){
  const key=_diagKey(activeClassId,_covBim);
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
}

// ════════════════════════════════════════════════════════════════════
// _tentarRepararJson — tenta reparar JSON truncado por limite de tokens.
// Estratégia:
//   1. Conta abertura/fechamento de { } e [ ] respeitando strings escapadas
//   2. Remove o último fragmento incompleto (ex: '"score": 7' ou '"nome":')
//   3. Fecha objetos/arrays abertos na ordem correta
//   4. Tenta parsear; se ainda falhar, vai recortando da direita pra esquerda
// ════════════════════════════════════════════════════════════════════
function _tentarRepararJson(s){
  if (typeof s !== 'string' || s.length < 10) return null;

  // Helper: tenta parsear sucessivos prefixos do JSON adicionando fechamentos
  const tentarPrefixo = (texto) => {
    const stack = [];
    let inStr = false, escape = false;
    let ultimoBomCorte = -1;  // posição segura para cortar (entre propriedades)
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (escape) { escape = false; continue; }
      if (inStr) {
        if (ch === '\\') escape = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' && stack[stack.length-1] === '{') stack.pop();
      else if (ch === ']' && stack[stack.length-1] === '[') stack.pop();
      // Marca um corte seguro: depois de uma vírgula no nível atual
      if (ch === ',' && !inStr) ultimoBomCorte = i;
    }
    // Tenta vários níveis de corte regressivo
    const cortes = [texto.length, ultimoBomCorte, ...Array.from({length:6}, (_,k)=>ultimoBomCorte - k*100)].filter(c=>c>0);
    for (const corte of cortes) {
      let candidato = texto.slice(0, corte).replace(/,\s*$/,'');
      // Recalcula stack até o corte
      const stk = [];
      let inS = false, esc = false;
      for (let i = 0; i < candidato.length; i++) {
        const ch = candidato[i];
        if (esc) { esc = false; continue; }
        if (inS) {
          if (ch === '\\') esc = true;
          else if (ch === '"') inS = false;
          continue;
        }
        if (ch === '"') inS = true;
        else if (ch === '{' || ch === '[') stk.push(ch);
        else if (ch === '}' && stk[stk.length-1] === '{') stk.pop();
        else if (ch === ']' && stk[stk.length-1] === '[') stk.pop();
      }
      // Se ainda estiver dentro de string, descarta corte
      if (inS) continue;
      // Remove vírgula órfã antes de ] ou } (vai surgir após o corte)
      candidato = candidato.replace(/,(\s*)$/,'$1');
      // Fecha tudo
      let fechamento = '';
      for (let i = stk.length - 1; i >= 0; i--) {
        fechamento += (stk[i] === '{' ? '}' : ']');
      }
      try {
        return JSON.parse(candidato + fechamento);
      } catch(e){ /* tenta próximo corte */ }
    }
    return null;
  };

  return tentarPrefixo(s);
}

// ════════════════════════════════════════════════════════════════════
// _renderDiagJson — pinta o diagnóstico estilizado a partir do JSON da IA.
// Layout estilo "apresentação/portfólio": cards coloridos, ícones, mapas
// SVG embutidos, indicadores visuais. Tudo sem prosa corrida.
// ════════════════════════════════════════════════════════════════════
function _renderDiagJson(d, ctx){
  if(!d || typeof d!=='object') return '<div style="padding:1rem;color:#888">Sem dados.</div>';
  ctx = ctx || {};

  // ── helpers de cor / paleta ──
  const HUMOR_COLORS = {
    calmo:    { bg:'linear-gradient(135deg,#43A047 0%,#1B5E20 100%)', emoji:'🌱' },
    atencao:  { bg:'linear-gradient(135deg,#FFA726 0%,#E65100 100%)', emoji:'⚠️' },
    critico:  { bg:'linear-gradient(135deg,#EF5350 0%,#B71C1C 100%)', emoji:'🚨' }
  };
  const RISCO_COLORS = {
    vermelho: { bg:'#FFEBEE', border:'#C62828', text:'#B71C1C', dot:'#D32F2F' },
    laranja:  { bg:'#FFF3E0', border:'#E65100', text:'#BF360C', dot:'#F57C00' },
    amarelo:  { bg:'#FFF9C4', border:'#F9A825', text:'#827717', dot:'#FBC02D' }
  };
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let html = '';

  // ━━━ CABEÇALHO HERO ━━━
  const humor = HUMOR_COLORS[d.panorama?.humor] || HUMOR_COLORS.atencao;
  const tituloHero = d.panorama?.titulo || 'Diagnóstico da Turma';
  html += `
    <div style="background:${humor.bg};color:#fff;padding:1.6rem 1.4rem;border-radius:14px;margin-bottom:1.1rem;box-shadow:0 6px 18px rgba(0,0,0,.12)">
      <div style="font-size:2rem;margin-bottom:.4rem">${humor.emoji}</div>
      <div style="font-size:1.12rem;font-weight:800;line-height:1.3;margin-bottom:.35rem">${esc(tituloHero)}</div>
      <div style="font-size:.82rem;opacity:.92">${esc(ctx.turma||'')} · ${esc(ctx.bimestre||'')}º Bimestre · ${esc(ctx.ano||'')}</div>
    </div>`;

  // ━━━ MÉTRICAS-CHAVE ━━━
  const metricas = Array.isArray(d.panorama?.metricasChave) ? d.panorama.metricasChave : [];
  if (metricas.length) {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.7rem;margin-bottom:1.2rem">`;
    metricas.forEach(m => {
      const destaqueStyle = m.destaque ? 'background:linear-gradient(135deg,#FFE0E0 0%,#FFCDD2 100%);border:2px solid #C62828' : 'background:#fff;border:1px solid #E1D8F1';
      const txt = m.destaque ? '#B71C1C' : '#4F46E5';
      html += `
        <div style="${destaqueStyle};padding:.85rem .9rem;border-radius:11px;text-align:center">
          <div style="font-size:1.6rem;margin-bottom:.2rem">${esc(m.icone||'📊')}</div>
          <div style="font-size:1.45rem;font-weight:800;color:${txt};line-height:1">${esc(m.valor)}</div>
          <div style="font-size:.7rem;color:#666;margin-top:.3rem;text-transform:uppercase;letter-spacing:.3px">${esc(m.label)}</div>
        </div>`;
    });
    html += `</div>`;
  }

  // ━━━ PARÁGRAFO DE PANORAMA ━━━
  if (d.panorama?.paragrafo) {
    html += `<div style="background:#F8F6FC;padding:1rem 1.1rem;border-radius:10px;margin-bottom:1.4rem;font-size:.88rem;color:#333;line-height:1.55;border-left:4px solid #6B21A8">${esc(d.panorama.paragrafo)}</div>`;
  }

  // ━━━ ALUNOS EM RISCO IMINENTE (cards) ━━━
  const riscos = Array.isArray(d.alunosRiscoIminente) ? d.alunosRiscoIminente : [];
  html += `<div style="margin:1.6rem 0 .8rem">
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.7rem">
      <span style="font-size:1.3rem">🚨</span>
      <h3 style="margin:0;font-size:1rem;font-weight:800;color:#6B21A8">Alunos em Risco Iminente de Evasão</h3>
    </div>`;
  if (riscos.length === 0) {
    html += `<div style="background:#E8F5E9;border-left:4px solid #43A047;padding:.9rem 1rem;border-radius:8px;color:#1B5E20;font-size:.85rem">
      ✓ Nenhum aluno apresenta risco iminente neste bimestre. A turma está estável.
    </div>`;
  } else {
    html += `<div style="display:flex;flex-direction:column;gap:.65rem">`;
    riscos.forEach(r => {
      const c = RISCO_COLORS[r.cor] || RISCO_COLORS.laranja;
      const sinais = Array.isArray(r.sinais) ? r.sinais : [];
      html += `
        <div style="background:${c.bg};border-left:5px solid ${c.border};padding:.8rem 1rem;border-radius:8px;display:flex;gap:.85rem;align-items:flex-start">
          <div style="flex-shrink:0;width:48px;height:48px;background:${c.dot};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem">${esc(r.score||'?')}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;margin-bottom:.25rem">
              <span style="font-weight:700;color:${c.text};font-size:.95rem">${esc(r.nome)}</span>
              <span style="font-size:.7rem;background:${c.dot};color:#fff;padding:.1rem .5rem;border-radius:10px;font-weight:700">${esc(r.classificacao||'')}</span>
            </div>
            <div style="font-size:.82rem;color:#444;line-height:1.45;margin-bottom:.4rem">${esc(r.resumo||'')}</div>
            ${sinais.length ? `<div style="display:flex;flex-wrap:wrap;gap:.3rem">${sinais.map(s=>`<span style="background:#fff;color:${c.text};font-size:.7rem;padding:.18rem .5rem;border-radius:8px;border:1px solid ${c.border}">${esc(s)}</span>`).join('')}</div>`:''}
          </div>
        </div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  // ━━━ ANÁLISE ESPACIAL com mapa SVG ━━━
  if (d.analiseEspacial?.incluir !== false) {
    const realocs = Array.isArray(d.analiseEspacial?.realocacoes) ? d.analiseEspacial.realocacoes : [];
    html += `<div style="margin:1.8rem 0 1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
        <span style="font-size:1.3rem">🗺️</span>
        <h3 style="margin:0;font-size:1rem;font-weight:800;color:#6B21A8">Análise da Disposição da Sala</h3>
      </div>`;
    if (d.analiseEspacial?.observacaoCurta) {
      html += `<div style="font-size:.85rem;color:#555;margin-bottom:.8rem;line-height:1.5">${esc(d.analiseEspacial.observacaoCurta)}</div>`;
    }
    // Renderiza mapa SVG da sala atual (já contém a lista de realocações no rodapé)
    const cl = findClass(activeClassId);
    if (cl?.clase?.students) {
      html += _renderSalaSVG(cl.clase.students, realocs);
    }
    html += `</div>`;
  }

  // ━━━ PROBLEMAS COLETIVOS x INDIVIDUAIS ━━━
  const colet = Array.isArray(d.problemasColetivos) ? d.problemasColetivos : [];
  const indiv = Array.isArray(d.problemasIndividuais) ? d.problemasIndividuais : [];
  if (colet.length || indiv.length) {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.9rem;margin:1.5rem 0">`;
    if (colet.length) {
      html += `<div style="background:#E3F2FD;border-radius:11px;padding:1rem">
        <div style="font-weight:700;color:#0D47A1;font-size:.88rem;margin-bottom:.6rem;display:flex;align-items:center;gap:.4rem">
          <span style="font-size:1.1rem">👥</span> Desafios da Turma
        </div>`;
      colet.forEach(p => {
        html += `<div style="background:#fff;border-radius:8px;padding:.55rem .7rem;margin:.4rem 0;font-size:.8rem;color:#333;line-height:1.4">
          <div style="display:flex;gap:.4rem;align-items:baseline"><span>${esc(p.icone||'•')}</span><strong style="color:#0D47A1">${esc(p.titulo)}</strong></div>
          <div style="margin:.2rem 0 0 1.4rem;color:#555">${esc(p.descricao)} ${p.afetados?`<span style="color:#1565C0;font-weight:600">(${esc(p.afetados)})</span>`:''}</div>
        </div>`;
      });
      html += `</div>`;
    }
    if (indiv.length) {
      html += `<div style="background:#FCE4EC;border-radius:11px;padding:1rem">
        <div style="font-weight:700;color:#880E4F;font-size:.88rem;margin-bottom:.6rem;display:flex;align-items:center;gap:.4rem">
          <span style="font-size:1.1rem">👤</span> Casos Individuais
        </div>`;
      indiv.forEach(p => {
        html += `<div style="background:#fff;border-radius:8px;padding:.55rem .7rem;margin:.4rem 0;font-size:.8rem;color:#333;line-height:1.4">
          <div style="display:flex;gap:.4rem;align-items:baseline"><span>${esc(p.icone||'•')}</span><strong style="color:#880E4F">${esc(p.nome)}</strong></div>
          <div style="margin:.2rem 0 0 1.4rem;color:#555">${esc(p.situacao)}</div>
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  // ━━━ EVOLUÇÃO TEMPORAL ━━━
  if (d.evolucaoTemporal?.incluir) {
    const tendIcon = {melhorando:'📈',estavel:'📊',piorando:'📉'}[d.evolucaoTemporal.tendenciaGeral] || '📊';
    const tendCor  = {melhorando:'#388E3C',estavel:'#1976D2',piorando:'#C62828'}[d.evolucaoTemporal.tendenciaGeral] || '#1976D2';
    const trajetorias = d.evolucaoTemporal.alunosTrajetoria || [];

    // Helper para sparkline SVG (mini-gráfico de linha)
    // pontos: [{label, comp, des}]
    const sparkline = (pontos, tipo) => {
      if (!Array.isArray(pontos) || pontos.length < 2) return '';
      const W = 120, H = 50, pad = 6;
      const escSvg = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      // Linhas de fundo para 1-4 (escala de classificação)
      const yScale = (v) => H - pad - ((v - 0) / 4) * (H - 2*pad);
      const xScale = (i) => pad + (i / (pontos.length - 1)) * (W - 2*pad);

      const corComp = tipo==='degradacao'?'#C62828':(tipo==='melhora'?'#388E3C':'#1976D2');
      const corDes  = '#9C27B0';

      // Gridlines horizontais sutis
      let grid = '';
      for (let v = 1; v <= 4; v++) {
        const y = yScale(v);
        grid += `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${W-pad}" y2="${y.toFixed(1)}" stroke="#EEE" stroke-width=".5" stroke-dasharray="${v===2.5?'':'1,1'}"/>`;
      }

      // Curvas (linha + pontos)
      const linhaComp = pontos.map((p,i) => `${xScale(i).toFixed(1)},${yScale(p.comp || 0).toFixed(1)}`).join(' ');
      const linhaDes  = pontos.map((p,i) => `${xScale(i).toFixed(1)},${yScale(p.des  || 0).toFixed(1)}`).join(' ');
      let dotsComp = '', dotsDes = '';
      pontos.forEach((p,i) => {
        const x = xScale(i);
        dotsComp += `<circle cx="${x.toFixed(1)}" cy="${yScale(p.comp || 0).toFixed(1)}" r="2.2" fill="${corComp}"/>`;
        dotsDes  += `<circle cx="${x.toFixed(1)}" cy="${yScale(p.des  || 0).toFixed(1)}" r="2.2" fill="${corDes}"/>`;
      });

      // Labels (x axis)
      const labels = pontos.map((p,i) => `<text x="${xScale(i).toFixed(1)}" y="${(H-1).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="#888" font-family="system-ui">${escSvg(p.label||'')}</text>`).join('');

      return `<svg viewBox="0 0 ${W} ${H+8}" width="${W}" height="${H+8}" style="flex-shrink:0">
        ${grid}
        <polyline points="${linhaComp}" fill="none" stroke="${corComp}" stroke-width="1.6"/>
        <polyline points="${linhaDes}"  fill="none" stroke="${corDes}"  stroke-width="1.6" stroke-dasharray="3,2"/>
        ${dotsComp}
        ${dotsDes}
        ${labels}
      </svg>`;
    };

    html += `<div style="margin:1.6rem 0 1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.7rem">
        <span style="font-size:1.3rem">${tendIcon}</span>
        <h3 style="margin:0;font-size:1rem;font-weight:800;color:${tendCor}">Evolução Temporal</h3>
      </div>
      <div style="background:#fff;border:1px solid #E1D8F1;border-radius:10px;padding:.9rem 1rem">
        <div style="font-size:.85rem;color:#333;line-height:1.5;margin-bottom:${trajetorias.length?'.8rem':'0'}">${esc(d.evolucaoTemporal.fraseDidatica||'')}</div>`;
    if (trajetorias.length) {
      // Legenda das séries
      html += `<div style="display:flex;gap:.8rem;justify-content:flex-end;font-size:.7rem;color:#666;margin-bottom:.4rem">
        <span style="display:flex;align-items:center;gap:.25rem"><span style="width:14px;height:2px;background:#388E3C;display:inline-block"></span>Comportamento</span>
        <span style="display:flex;align-items:center;gap:.25rem"><span style="width:14px;height:2px;background:#9C27B0;border-top:1px dashed #9C27B0;display:inline-block"></span>Desempenho</span>
      </div>`;
    }
    trajetorias.forEach(a => {
      const tipoCor = a.tipo==='degradacao' ? '#C62828' : (a.tipo==='melhora' ? '#388E3C' : '#1976D2');
      const tipoIco = a.tipo==='degradacao' ? '⬇️' : (a.tipo==='melhora' ? '⬆️' : '➡️');
      html += `<div style="display:grid;grid-template-columns:1fr 140px;gap:.7rem;align-items:center;padding:.5rem .6rem;border-radius:7px;background:#F8F6FC;margin:.35rem 0">
        <div style="font-size:.78rem;line-height:1.45">
          <div style="display:flex;align-items:center;gap:.35rem;margin-bottom:.15rem">
            <span>${tipoIco}</span>
            <strong style="color:${tipoCor}">${esc(a.primeiroNome||'')}</strong>
          </div>
          <div style="color:#555">${esc(a.trajetoria||'')}</div>
        </div>
        ${sparkline(a.pontos, a.tipo)}
      </div>`;
    });
    html += `</div></div>`;
  }

  // ━━━ VERIFICAÇÃO CADASTRAL ━━━
  const cadast = d.verificacaoCadastral;
  if (cadast?.incluir && Array.isArray(cadast.alunos) && cadast.alunos.length) {
    html += `<div style="margin:1.5rem 0 1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem">
        <span style="font-size:1.2rem">📍</span>
        <h3 style="margin:0;font-size:.95rem;font-weight:800;color:#6B21A8">Verificação Cadastral</h3>
      </div>
      <div style="background:#FFFDE7;border:1px solid #F9A825;border-radius:10px;padding:.85rem 1rem;font-size:.8rem">
        <div style="color:#555;margin-bottom:.5rem;line-height:1.45">Alunos com município diferente de Imperatriz. A distância foi calculada normalmente — solicita-se confirmar se o endereço está atualizado:</div>`;
    cadast.alunos.forEach(a => {
      const flag = a.outroEstado ? '🔺' : '';
      html += `<div style="background:#fff;border-radius:6px;padding:.4rem .6rem;margin:.25rem 0;display:flex;justify-content:space-between;align-items:center;font-size:.78rem">
        <span>${flag} <strong>${esc(a.nome)}</strong> · ${esc(a.municipio)}</span>
        <span style="color:#827717;font-weight:600">${esc(a.distancia)}</span>
      </div>`;
    });
    html += `</div></div>`;
  }

  // ━━━ SINAIS QUALITATIVOS ━━━
  const sinaisQ = Array.isArray(d.sinaisQualitativos) ? d.sinaisQualitativos : [];
  if (sinaisQ.length) {
    html += `<div style="margin:1.5rem 0 1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem">
        <span style="font-size:1.2rem">💭</span>
        <h3 style="margin:0;font-size:.95rem;font-weight:800;color:#6B21A8">Sinais Qualitativos do Conselho</h3>
      </div>
      <div style="background:#fff;border:1px solid #E1D8F1;border-radius:10px;padding:.8rem 1rem">`;
    sinaisQ.forEach(s => {
      html += `<div style="font-size:.82rem;color:#444;line-height:1.5;padding:.3rem 0;border-bottom:1px solid #F0EAFB">💡 ${esc(s)}</div>`;
    });
    html += `</div></div>`;
  }

  // ━━━ PLANO DE INTERVENÇÃO ━━━
  const urg = Array.isArray(d.planoUrgente) ? d.planoUrgente : [];
  const imp = Array.isArray(d.planoImportante) ? d.planoImportante : [];
  if (urg.length || imp.length) {
    html += `<div style="margin:1.6rem 0 1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.7rem">
        <span style="font-size:1.3rem">🎯</span>
        <h3 style="margin:0;font-size:1rem;font-weight:800;color:#6B21A8">Plano de Intervenção</h3>
      </div>`;
    if (urg.length) {
      html += `<div style="background:#FFEBEE;border-left:5px solid #C62828;border-radius:10px;padding:.9rem 1rem;margin-bottom:.7rem">
        <div style="font-weight:800;color:#B71C1C;font-size:.85rem;margin-bottom:.5rem">🔴 URGENTE — Próximas 2 semanas</div>`;
      urg.forEach((a,i) => {
        const alunos = Array.isArray(a.alunos) ? a.alunos.join(', ') : (a.alunos||'');
        html += `<div style="background:#fff;border-radius:8px;padding:.6rem .8rem;margin:.4rem 0;font-size:.8rem;line-height:1.4">
          <div style="font-weight:700;color:#B71C1C;margin-bottom:.2rem">${i+1}. ${esc(a.acao)}</div>
          ${alunos?`<div style="color:#666;font-size:.75rem;margin:.15rem 0"><strong>Aluno(s):</strong> ${esc(alunos)}</div>`:''}
          <div style="color:#666;font-size:.75rem;display:flex;gap:.7rem;flex-wrap:wrap">
            ${a.responsavel?`<span><strong>Responsável:</strong> ${esc(a.responsavel)}</span>`:''}
            ${a.prazo?`<span><strong>Prazo:</strong> ${esc(a.prazo)}</span>`:''}
          </div>
        </div>`;
      });
      html += `</div>`;
    }
    if (imp.length) {
      html += `<div style="background:#FFF8E1;border-left:5px solid #F9A825;border-radius:10px;padding:.9rem 1rem">
        <div style="font-weight:800;color:#827717;font-size:.85rem;margin-bottom:.5rem">🟡 IMPORTANTE — 4 a 8 semanas</div>`;
      imp.forEach((a,i) => {
        const alunos = Array.isArray(a.alunos) ? a.alunos.join(', ') : (a.alunos||'');
        html += `<div style="background:#fff;border-radius:8px;padding:.6rem .8rem;margin:.4rem 0;font-size:.8rem;line-height:1.4">
          <div style="font-weight:700;color:#827717;margin-bottom:.2rem">${i+1}. ${esc(a.acao)}</div>
          ${alunos?`<div style="color:#666;font-size:.75rem;margin:.15rem 0"><strong>Aluno(s):</strong> ${esc(alunos)}</div>`:''}
          ${a.responsavel?`<div style="color:#666;font-size:.75rem"><strong>Responsável:</strong> ${esc(a.responsavel)}</div>`:''}
        </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  // ━━━ BOTÃO DO MEMORIAL ━━━
  if (d.memorial) {
    html += `<div style="margin:1.8rem 0 1rem;text-align:center">
      <button onclick="openMemorialCalculo()" style="background:linear-gradient(135deg,#6B21A8 0%,#4F46E5 100%);color:#fff;border:none;padding:.85rem 1.4rem;border-radius:11px;font-size:.85rem;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(107,33,168,.25);display:inline-flex;gap:.5rem;align-items:center">
        <span style="font-size:1.1rem">📐</span> Memorial de Cálculo de Score
      </button>
      <div style="font-size:.7rem;color:#999;margin-top:.4rem">Detalhes técnicos: fórmulas, pesos e referências</div>
    </div>`;
  }

  return html;
}

// ════════════════════════════════════════════════════════════════════
// _renderSalaSVG — desenha o mapa da sala como SVG. Mostra alunos como
// círculos coloridos pela classificação de comportamento e desenha
// setas pontilhadas para realocações sugeridas.
// ════════════════════════════════════════════════════════════════════
function _renderSalaSVG(students, realocacoes){
  // Reusa a MESMA função de heatmap do sistema (_drawHeatmapCanvas) gerando
  // dois canvases (comportamento + desempenho) IDÊNTICOS aos da visão da turma.
  // Por cima, sobrepõe um SVG com as setas tracejadas roxas e destaque dos
  // alunos a realocar (halo pulsante + nome do destino).
  //
  // Estratégia: o HTML retornado contém os canvases + SVGs. Depois que o
  // _renderDiagJson injeta tudo via innerHTML, ele chama _aplicarHeatmapsDiag
  // (definida abaixo) que desenha os canvases.
  const W = 320, H = 420; // mesmas dimensões dos canvases do sistema
  const escSvg = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const yrAtivo = (typeof activeYear !== 'undefined' && activeYear) ? String(activeYear) : String(new Date().getFullYear());
  const bimAtivo = (typeof activeBim !== 'undefined' && activeBim) || 1;

  // Indexa realocações por primeiro nome (case-insensitive)
  const realocByNome = {};
  (realocacoes||[]).forEach(r => {
    if (r && r.primeiroNome) realocByNome[String(r.primeiroNome).toLowerCase().trim()] = r;
  });

  // Coleta pontos com fallback de ano (mesma lógica do _renderHeatmaps original)
  const compPts = [], desPts = [];
  // Coleta também alunos com realocação (mesmo se sem comp/des), para sobreposição
  const alunosReloc = [];
  students.forEach(s => {
    let av = s.avaliacoes?.[yrAtivo]?.[bimAtivo];
    if (!av || !av.seating || av.seating.x < 0) {
      for (const yr of Object.keys(s.avaliacoes||{})) {
        const c = s.avaliacoes[yr]?.[bimAtivo];
        if (c?.seating?.x >= 0) { av = c; break; }
      }
    }
    if (!av || !av.seating || av.seating.x < 0) return;
    const seat = av.seating;
    // Snap-to-grid: alinha ponto à célula 6×7 mais próxima
    const snapped = _snapSeatToGrid(seat.x, seat.y);
    if (av.comp > 0) compPts.push({x: snapped.x, y: snapped.y, v: av.comp});
    if (av.desemp > 0) desPts.push({x: snapped.x, y: snapped.y, v: av.desemp});

    const primeiroNome = String(s.nome||'').trim().split(/\s+/)[0];
    const reloc = realocByNome[primeiroNome.toLowerCase()];
    if (reloc) {
      // Snap também na posição atual e na posição sugerida
      const snappedReloc = _snapSeatToGrid(reloc.paraX, reloc.paraY);
      alunosReloc.push({
        primeiroNome,
        nomeCompleto: s.nome || '',
        x: snapped.x, y: snapped.y,
        paraX: snappedReloc.x, paraY: snappedReloc.y,
        motivo: reloc.motivo || ''
      });
    }
  });

  // ID único do render — permite múltiplos diagnósticos sem colisão
  const uid = 'diag' + Math.random().toString(36).slice(2,8);

  // Armazena pontos pra serem desenhados no canvas após innerHTML
  window._diagHeatmapData = window._diagHeatmapData || {};
  window._diagHeatmapData[uid] = { compPts, desPts };

  // Função que constrói o overlay SVG (setas + halos + nomes)
  const overlayPara = (campo) => {
    if (!alunosReloc.length) return '';
    let setas = '', halos = '', alvos = '';
    alunosReloc.forEach(a => {
      const cx = (a.x/100) * W;
      const cy = (a.y/100) * H;
      const tx = (a.paraX/100) * W;
      const ty = (a.paraY/100) * H;
      // Halo pulsante no ponto atual (atrás da bolinha do canvas)
      halos += `<g>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="none" stroke="#6B21A8" stroke-width="2" opacity=".75">
          <animate attributeName="r" values="7;14;7" dur="1.6s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values=".8;.15;.8" dur="1.6s" repeatCount="indefinite"/>
        </circle>
      </g>`;
      // Seta tracejada
      setas += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#6B21A8" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#arrow-${campo}-${uid})" opacity=".92"/>`;
      // Alvo + nome
      const labelY = ty - 12;
      const labelW = a.primeiroNome.length * 6.2 + 12;
      alvos += `<g>
        <circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="7" fill="rgba(107,33,168,.18)" stroke="#6B21A8" stroke-width="1.8" stroke-dasharray="2,2"/>
        <rect x="${(tx - labelW/2).toFixed(1)}" y="${(labelY - 8).toFixed(1)}" width="${labelW.toFixed(1)}" height="13" rx="3" fill="#6B21A8"/>
        <text x="${tx.toFixed(1)}" y="${(labelY + 2).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff" font-family="system-ui">${escSvg(a.primeiroNome)}</text>
      </g>`;
    });
    return `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">
        <defs>
          <marker id="arrow-${campo}-${uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill="#6B21A8"/>
          </marker>
        </defs>
        ${halos}
        ${setas}
        ${alvos}
      </svg>`;
  };

  // Lista compacta dos alunos a realocar (sem listar TODOS)
  let listaRelocs = '';
  const relocsList = (realocacoes || []).filter(r => r && r.primeiroNome);
  if (relocsList.length) {
    listaRelocs = `
      <div style="background:#F8F6FC;border:1px solid #E1D8F1;border-radius:10px;padding:.7rem .85rem;margin-top:.7rem">
        <div style="font-size:.72rem;font-weight:700;color:#6B21A8;margin-bottom:.4rem;display:flex;align-items:center;gap:.3rem">
          <span>🔄</span>
          <span>Alunos a Realocar (${relocsList.length})</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:.35rem">
          ${relocsList.map(r => `
            <div style="display:flex;align-items:flex-start;gap:.5rem;font-size:.74rem">
              <span style="background:#6B21A8;color:#fff;font-weight:700;padding:.12rem .5rem;border-radius:6px;flex-shrink:0;font-size:.7rem">${escSvg(r.primeiroNome)}</span>
              <span style="color:#444;line-height:1.4">${escSvg(r.motivo||'Recomendado mudar de lugar')}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  return `
    <div style="background:#FAFAFA;border-radius:12px;padding:.9rem;border:1px solid #E0E0E0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem;margin-bottom:.6rem" data-diag-uid="${uid}">
        <!-- Painel comportamento -->
        <div style="background:#fff;border-radius:8px;padding:.45rem;border:1px solid #E0E0E0">
          <div style="font-size:.7rem;font-weight:700;color:#4F46E5;text-align:center;margin-bottom:.3rem;letter-spacing:.5px">COMPORTAMENTO</div>
          <div style="position:relative;width:100%;aspect-ratio:${W}/${H};border-radius:6px;overflow:hidden">
            <canvas id="heatcanv-comp-${uid}" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
            ${overlayPara('comp')}
          </div>
        </div>
        <!-- Painel desempenho -->
        <div style="background:#fff;border-radius:8px;padding:.45rem;border:1px solid #E0E0E0">
          <div style="font-size:.7rem;font-weight:700;color:#4F46E5;text-align:center;margin-bottom:.3rem;letter-spacing:.5px">DESEMPENHO</div>
          <div style="position:relative;width:100%;aspect-ratio:${W}/${H};border-radius:6px;overflow:hidden">
            <canvas id="heatcanv-des-${uid}" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
            ${overlayPara('des')}
          </div>
        </div>
      </div>
      <!-- Legenda compacta (mesma do sistema) -->
      <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:.7rem;padding:.45rem;background:#fff;border-radius:8px;font-size:.7rem;color:#555;border:1px solid #E0E0E0">
        <div style="display:flex;align-items:center;gap:.3rem"><span style="width:10px;height:10px;background:#DC1919;border-radius:50%"></span>Ruim</div>
        <div style="display:flex;align-items:center;gap:.3rem"><span style="width:10px;height:10px;background:#FFA500;border-radius:50%"></span>Regular</div>
        <div style="display:flex;align-items:center;gap:.3rem"><span style="width:10px;height:10px;background:#50B428;border-radius:50%"></span>Bom</div>
        <div style="display:flex;align-items:center;gap:.3rem"><span style="width:10px;height:10px;background:#145ECD;border-radius:50%"></span>Excelente</div>
        <div style="display:flex;align-items:center;gap:.3rem"><span style="width:11px;height:11px;border:2px solid #6B21A8;border-radius:50%;background:rgba(107,33,168,.15)"></span>Realocar</div>
      </div>
      ${listaRelocs}
    </div>`;
}

// Aplica os heatmaps no canvas DEPOIS que o HTML do diagnóstico foi injetado.
// Chamada automaticamente pelo _renderDiagJson após innerHTML estar pronto.
function _aplicarHeatmapsDiag() {
  if (!window._diagHeatmapData) return;
  // Encontra todos os contêineres data-diag-uid e dispara o desenho
  document.querySelectorAll('[data-diag-uid]').forEach(el => {
    const uid = el.getAttribute('data-diag-uid');
    const data = window._diagHeatmapData[uid];
    if (!data) return;
    // Usa a MESMA função do sistema (_drawHeatmapCanvas)
    _drawHeatmapCanvas('heatcanv-comp-' + uid, data.compPts);
    _drawHeatmapCanvas('heatcanv-des-' + uid, data.desPts);
  });
}

// ════════════════════════════════════════════════════════════════════
// Memorial de Cálculo — modal separado com fórmulas, fatores e referências
// ════════════════════════════════════════════════════════════════════
function openMemorialCalculo(){
  const d = window._diagDataAtual;
  if (!d || !d.memorial) { toast('Memorial não disponível','err'); return; }
  const m = d.memorial;
  const ctx = window._diagContextoAtual || {};
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let html = `
    <div style="background:linear-gradient(135deg,#6B21A8 0%,#4F46E5 100%);color:#fff;padding:1.3rem 1.4rem;border-radius:12px 12px 0 0">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem">
        <span style="font-size:1.6rem">📐</span>
        <h2 style="margin:0;font-size:1.05rem;font-weight:800">Memorial de Cálculo de Score</h2>
      </div>
      <div style="font-size:.78rem;opacity:.9">${esc(ctx.turma||'')} · ${esc(ctx.bimestre||'')}º Bim · ${esc(ctx.ano||'')}</div>
    </div>
    <div style="padding:1.2rem 1.4rem;max-height:70vh;overflow-y:auto">`;

  // Metodologia
  if (m.metodologia) {
    html += `<div style="background:#F4F0FC;border-left:4px solid #6B21A8;padding:.8rem 1rem;border-radius:8px;margin-bottom:1.2rem;font-size:.82rem;color:#333;line-height:1.5">${esc(m.metodologia)}</div>`;
  }

  // Tabela de Fatores e Pesos
  const fats = Array.isArray(m.fatoresExplicacao) ? m.fatoresExplicacao : [];
  if (fats.length) {
    html += `<h3 style="font-size:.92rem;font-weight:800;color:#4F46E5;margin:1rem 0 .5rem">Fatores Ponderados</h3>
      <div style="background:#fff;border:1px solid #E1D8F1;border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:.78rem">
          <thead><tr style="background:#F4F0FC;color:#4F46E5">
            <th style="padding:.5rem;text-align:left;border-bottom:1px solid #E1D8F1">Fator</th>
            <th style="padding:.5rem;text-align:center;border-bottom:1px solid #E1D8F1">Peso</th>
            <th style="padding:.5rem;text-align:left;border-bottom:1px solid #E1D8F1">Regra</th>
            <th style="padding:.5rem;text-align:center;border-bottom:1px solid #E1D8F1">Ref.</th>
          </tr></thead><tbody>`;
    fats.forEach(f => {
      html += `<tr>
        <td style="padding:.5rem;font-weight:600;color:#333;border-bottom:1px solid #F0EAFB">${esc(f.fator)}</td>
        <td style="padding:.5rem;text-align:center;color:#6B21A8;font-weight:700;border-bottom:1px solid #F0EAFB">${esc(f.peso)}</td>
        <td style="padding:.5rem;color:#555;font-size:.74rem;line-height:1.4;border-bottom:1px solid #F0EAFB">${esc(f.regra)}</td>
        <td style="padding:.5rem;text-align:center;color:#666;font-size:.7rem;border-bottom:1px solid #F0EAFB">${esc(f.referencias)}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  // Cálculos detalhados
  const calc = Array.isArray(m.calculoDetalhado) ? m.calculoDetalhado : [];
  if (calc.length) {
    html += `<h3 style="font-size:.92rem;font-weight:800;color:#4F46E5;margin:1.3rem 0 .5rem">Decomposição do Score por Aluno</h3>`;
    calc.forEach(c => {
      const dec = Array.isArray(c.decomposicao) ? c.decomposicao : [];
      html += `<div style="background:#fff;border:1px solid #E1D8F1;border-radius:10px;padding:.9rem 1rem;margin:.7rem 0">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem;border-bottom:1px solid #F0EAFB;padding-bottom:.4rem">
          <strong style="color:#4F46E5;font-size:.88rem">${esc(c.nome)}</strong>
          <span style="background:#6B21A8;color:#fff;padding:.15rem .6rem;border-radius:10px;font-size:.75rem;font-weight:700">Score: ${esc(c.scoreTotal)}</span>
        </div>`;
      dec.forEach(it => {
        html += `<div style="display:grid;grid-template-columns:1fr 100px 60px 60px 60px;gap:.5rem;font-size:.74rem;padding:.25rem 0;border-bottom:1px dotted #F0EAFB;align-items:center">
          <span style="color:#333"><strong>${esc(it.fator)}</strong> = ${esc(it.valor)}</span>
          <span style="color:#888;font-size:.7rem">contrib: ${esc(it.contribuicao)}</span>
          <span style="color:#888;font-size:.7rem;text-align:right">× ${esc(it.peso)}</span>
          <span style="color:#666;font-size:.7rem;text-align:right">=</span>
          <span style="color:#6B21A8;font-weight:700;text-align:right">${esc(it.subTotal)}</span>
        </div>`;
      });
      if (c.formula) {
        html += `<div style="background:#F8F6FC;padding:.5rem .7rem;border-radius:6px;margin-top:.5rem;font-family:'SF Mono',Consolas,monospace;font-size:.72rem;color:#333">${esc(c.formula)}</div>`;
      }
      html += `</div>`;
    });
  }

  // Referências
  const refs = Array.isArray(m.referencias) ? m.referencias : [];
  if (refs.length) {
    html += `<h3 style="font-size:.92rem;font-weight:800;color:#4F46E5;margin:1.3rem 0 .5rem">Referências</h3>
      <div style="background:#fff;border:1px solid #E1D8F1;border-radius:8px;padding:.7rem 1rem">`;
    refs.forEach(r => {
      html += `<div style="font-size:.75rem;color:#555;margin:.3rem 0;line-height:1.45"><strong style="color:#6B21A8">${esc(r.id)}</strong> ${esc(r.citacao)}</div>`;
    });
    html += `</div>`;
  }

  // Limitações
  const lims = Array.isArray(m.limitacoes) ? m.limitacoes : [];
  if (lims.length) {
    html += `<h3 style="font-size:.92rem;font-weight:800;color:#4F46E5;margin:1.3rem 0 .5rem">Limitações Técnicas</h3>
      <div style="background:#FFF8E1;border:1px solid #F9A825;border-radius:8px;padding:.7rem 1rem">`;
    lims.forEach(l => {
      html += `<div style="font-size:.76rem;color:#827717;margin:.25rem 0;line-height:1.45">⚠️ ${esc(l)}</div>`;
    });
    html += `</div>`;
  }

  html += `</div>
    <div style="padding:.9rem 1.4rem;border-top:1px solid #E1D8F1;display:flex;justify-content:space-between;gap:.6rem;background:#F8F6FC;border-radius:0 0 12px 12px">
      <button onclick="printMemorialCalculo()" style="background:linear-gradient(135deg,#6B21A8 0%,#4F46E5 100%);color:#fff;border:none;padding:.55rem 1.2rem;border-radius:8px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem">🖨️ Imprimir / Salvar PDF</button>
      <button onclick="closeMemorialCalculo()" style="background:#fff;border:1px solid #6B21A8;color:#6B21A8;padding:.5rem 1.2rem;border-radius:8px;font-weight:600;cursor:pointer">Fechar</button>
    </div>`;

  // Cria modal se não existir
  let modal = document.getElementById('memorial-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'memorial-modal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;align-items:center;justify-content:center;padding:1rem';
    modal.onclick = e => { if (e.target === modal) closeMemorialCalculo(); };
    const box = document.createElement('div');
    box.id = 'memorial-box';
    box.style.cssText = 'background:#fff;border-radius:12px;width:100%;max-width:760px;max-height:92vh;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.3)';
    modal.appendChild(box);
    document.body.appendChild(modal);
  }
  document.getElementById('memorial-box').innerHTML = html;
  modal.style.display = 'flex';
}
function closeMemorialCalculo(){
  const m = document.getElementById('memorial-modal');
  if (m) m.style.display = 'none';
}

// ════════════════════════════════════════════════════════════════════
// printMemorialCalculo — abre janela de impressão APENAS com o memorial.
// O conteúdo é o mesmo HTML do modal, sem cabeçalho/botões, formatado
// pra A4 e impressão.
// ════════════════════════════════════════════════════════════════════
function printMemorialCalculo(){
  const d = window._diagDataAtual;
  if (!d || !d.memorial) { toast('Memorial não disponível','err'); return; }
  const m = d.memorial;
  const ctx = window._diagContextoAtual || {};
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dtPrint = new Date().toLocaleString('pt-BR');

  let body = '';
  if (m.metodologia) {
    body += `<div class="metodologia">${esc(m.metodologia)}</div>`;
  }
  // Tabela de fatores
  const fats = Array.isArray(m.fatoresExplicacao) ? m.fatoresExplicacao : [];
  if (fats.length) {
    body += `<h2>Fatores Ponderados</h2>
      <table><thead><tr><th>Fator</th><th style="text-align:center">Peso</th><th>Regra</th><th style="text-align:center">Ref.</th></tr></thead><tbody>`;
    fats.forEach(f => {
      body += `<tr><td><b>${esc(f.fator)}</b></td><td style="text-align:center;color:#6B21A8;font-weight:700">${esc(f.peso)}</td><td style="font-size:9.5px">${esc(f.regra)}</td><td style="text-align:center;font-size:9px;color:#666">${esc(f.referencias)}</td></tr>`;
    });
    body += `</tbody></table>`;
  }
  // Decomposição por aluno
  const calc = Array.isArray(m.calculoDetalhado) ? m.calculoDetalhado : [];
  if (calc.length) {
    body += `<h2>Decomposição do Score por Aluno</h2>`;
    calc.forEach(c => {
      const dec = Array.isArray(c.decomposicao) ? c.decomposicao : [];
      body += `<div class="aluno-box">
        <div class="aluno-head"><b>${esc(c.nome)}</b><span class="score-pill">Score: ${esc(c.scoreTotal)}</span></div>`;
      dec.forEach(it => {
        body += `<div class="dec-row">
          <span><b>${esc(it.fator)}</b> = ${esc(it.valor)}</span>
          <span class="dec-num">contrib ${esc(it.contribuicao)} × ${esc(it.peso)} = <b>${esc(it.subTotal)}</b></span>
        </div>`;
      });
      if (c.formula) {
        body += `<div class="formula">${esc(c.formula)}</div>`;
      }
      body += `</div>`;
    });
  }
  // Referências
  const refs = Array.isArray(m.referencias) ? m.referencias : [];
  if (refs.length) {
    body += `<h2>Referências</h2><ol class="refs">`;
    refs.forEach(r => body += `<li><b>${esc(r.id)}</b> ${esc(r.citacao)}</li>`);
    body += `</ol>`;
  }
  // Limitações
  const lims = Array.isArray(m.limitacoes) ? m.limitacoes : [];
  if (lims.length) {
    body += `<h2>Limitações Técnicas</h2><ul class="lims">`;
    lims.forEach(l => body += `<li>${esc(l)}</li>`);
    body += `</ul>`;
  }

  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"><title>Memorial de Cálculo — ${esc(ctx.turma||'')}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#222;padding:18px 22px;background:#fff}
      .header{background:linear-gradient(135deg,#6B21A8 0%,#4F46E5 100%);color:#fff;padding:14px 18px;border-radius:8px;margin-bottom:14px}
      .header h1{font-size:16px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:6px}
      .header .meta{font-size:10px;opacity:.92;display:flex;gap:14px;flex-wrap:wrap}
      h2{font-size:13px;font-weight:800;color:#4F46E5;margin:14px 0 5px;border-bottom:1.5px solid #E1D8F1;padding-bottom:3px}
      .metodologia{background:#F4F0FC;border-left:3px solid #6B21A8;padding:8px 12px;border-radius:5px;font-size:11px;line-height:1.5;color:#333}
      table{border-collapse:collapse;width:100%;margin:6px 0;font-size:10px}
      th{background:#F4F0FC;color:#4F46E5;font-weight:700;padding:5px 7px;border:1px solid #E1D8F1;text-align:left}
      td{padding:4px 7px;border:1px solid #EEE7FB}
      tr:nth-child(even) td{background:#FAF7FE}
      .aluno-box{background:#fff;border:1px solid #E1D8F1;border-radius:6px;padding:9px 11px;margin:7px 0;break-inside:avoid}
      .aluno-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #F0EAFB;padding-bottom:4px;margin-bottom:5px;color:#4F46E5}
      .score-pill{background:#6B21A8;color:#fff;padding:2px 9px;border-radius:9px;font-size:10px;font-weight:700}
      .dec-row{display:flex;justify-content:space-between;font-size:10px;padding:2px 0;border-bottom:1px dotted #F0EAFB}
      .dec-num{color:#666}
      .formula{background:#F8F6FC;padding:5px 8px;border-radius:4px;margin-top:5px;font-family:Consolas,Courier,monospace;font-size:9.5px;color:#333}
      .refs{padding-left:18px;margin:4px 0}
      .refs li{font-size:10px;color:#555;margin:3px 0;line-height:1.4}
      .lims{padding-left:18px;margin:4px 0;background:#FFF8E1;border-radius:5px;padding:8px 8px 8px 22px;border:1px solid #F9A825}
      .lims li{font-size:10px;color:#827717;margin:2px 0;line-height:1.4}
      .footer{text-align:center;margin-top:18px;font-size:9px;color:#999;border-top:1px solid #E1D8F1;padding-top:8px}
      @media print{body{padding:8px 12px}button{display:none!important}@page{size:A4;margin:10mm 8mm}}
    </style></head><body>
    <div class="header">
      <h1>📐 Memorial de Cálculo de Score</h1>
      <div class="meta">
        <span><b>Turma:</b> ${esc(ctx.turma||'—')}</span>
        <span><b>Curso:</b> ${esc(ctx.curso||'—')}</span>
        <span><b>Bimestre:</b> ${esc(ctx.bimestre||'')}º / ${esc(ctx.ano||'')}</span>
        <span><b>Total de alunos:</b> ${esc(ctx.totalAlunos||'')}</span>
        <span><b>Impresso em:</b> ${dtPrint}</span>
      </div>
    </div>
    ${body}
    <div class="footer">IFMA Campus Imperatriz · TeIA — Tecnologia Escolar de Integração e Acompanhamento</div>
    <div style="text-align:center;margin-top:12px">
      <button onclick="window.print()" style="background:#6B21A8;color:#fff;border:none;border-radius:6px;padding:7px 22px;font-size:11px;font-weight:700;cursor:pointer">🖨️ Imprimir / Salvar PDF</button>
    </div>
  </body></html>`);
  w.document.close();
}


async function openDiagnosticoIA(){
  const modal=document.getElementById('diag-modal');
  const cl=findClass(activeClassId);
  if(!cl){toast('Abra uma turma primeiro','err');return;}
  modal.style.display='flex'; // abre imediatamente
  // Verifica status da chave no servidor
  const status=await checkApiKeyStatus();
  const key=status.configured?'__proxy__':'';

  const saved=loadDiagResult();
  const banner=document.getElementById('diag-saved-banner');

  // Reset all action buttons
  ['diag-copy-btn','diag-print-btn','diag-new-btn'].forEach(id=>{
    document.getElementById(id).style.display='none';
  });
  document.getElementById('diag-run-btn').style.display='inline-flex';
  document.getElementById('diag-status').style.display='none';
  document.getElementById('diag-modal-subtitle').textContent=cl.clase.name+' · '+_covBim+'º Bimestre';

  if(saved){
    const dt=new Date(saved.date).toLocaleString('pt-BR');
    document.getElementById('diag-saved-date').textContent=dt;
    banner.style.display='flex';
    // Tenta ler como JSON (formato novo); se falhar, usa o renderizador antigo
    let parsed = null;
    try { parsed = JSON.parse(saved.text); } catch(_) { parsed = null; }
    const ctx = {
      turma: cl.clase.name,
      curso: cl.course?.name || '—',
      bimestre: _covBim,
      ano: (typeof activeYear !== 'undefined' && activeYear) ? activeYear : String(new Date().getFullYear()),
      totalAlunos: cl.clase.students?.length || 0
    };
    if (parsed && parsed.panorama) {
      window._diagDataAtual = parsed;
      window._diagContextoAtual = ctx;
      document.getElementById('diag-result').innerHTML = _renderDiagJson(parsed, ctx);
      setTimeout(_aplicarHeatmapsDiag, 0);
    } else {
      document.getElementById('diag-result').innerHTML = _renderDiagHtml(saved.text);
    }
    // Show post-result buttons, hide run
    document.getElementById('diag-run-btn').style.display='none';
    document.getElementById('diag-new-btn').style.display='inline-flex';
    ['diag-copy-btn','diag-print-btn'].forEach(id=>{
      const el=document.getElementById(id);
      el.style.display='inline-flex';
      el.dataset.text=saved.text;
    });
  } else {
    banner.style.display='none';
    document.getElementById('diag-result').innerHTML='<div style="color:#888;text-align:center;padding:2rem">Clique em <strong>▶ Gerar Diagnóstico</strong> para iniciar a análise.</div>';
  }

  if(!key){
    document.getElementById('diag-result').innerHTML='<div style="color:#c62828;padding:1rem;background:#fff5f5;border-radius:8px;line-height:1.7">⚠️ <strong>Chave API não configurada.</strong><br>Vá em <strong>Configurações → 🤖 Inteligência Artificial</strong> e configure a chave Anthropic.</div>';
    document.getElementById('diag-run-btn').disabled=true;
    document.getElementById('diag-new-btn').disabled=true;
  } else {
    document.getElementById('diag-run-btn').disabled=false;
    document.getElementById('diag-new-btn').disabled=false;
  }
}

function printDiagResult(){
  const text=document.getElementById('diag-print-btn')?.dataset.text||'';
  if(!text)return;
  const cl=findClass(activeClassId);
  const turma=cl?.clase?.name||'—';
  const curso=cl?.course?.name||'—';
  const total=cl?.clase?.students?.length||0;
  const dt=new Date().toLocaleString('pt-BR');
  const saved=loadDiagResult();
  const savedDt=saved?new Date(saved.date).toLocaleString('pt-BR'):'—';

  // Simple markdown to HTML for print — ou JSON renderizado se for o novo formato
  let body;
  let parsed = null;
  try { parsed = JSON.parse(text); } catch(_) { parsed = null; }
  if (parsed && parsed.panorama) {
    const ctx = { turma, curso, bimestre: _covBim, ano: (typeof activeYear !== 'undefined' && activeYear) ? activeYear : String(new Date().getFullYear()), totalAlunos: total };
    body = _renderDiagJson(parsed, ctx);
    // Remove o botão do memorial na versão impressa (em vez disso, inclui o memorial no fim do print)
    body = body.replace(/<button onclick="openMemorialCalculo\(\)"[\s\S]*?<\/div>\s*<\/div>/, '');

    // ── Converte canvases do DOM ATUAL em <img> (data URL) ──
    // Necessário porque <canvas> num document recém-aberto vem vazio (não é
    // serializável). Capturamos o pixel-art do canvas vivo no DOM atual
    // (já renderizado pelo _aplicarHeatmapsDiag) e geramos PNG via toDataURL.
    // Como o re-render do body para print gera IDs DIFERENTES, fazemos o
    // pareamento por ORDEM: 1º canvas do print = 1º canvas vivo, etc.
    const liveCanvases = Array.from(document.querySelectorAll('#diag-result canvas[id^="heatcanv-"]'));
    const dataUrls = liveCanvases.map(cv => {
      try { return cv.toDataURL('image/png'); }
      catch (e) { console.warn('canvas->PNG falhou:', cv.id, e); return null; }
    });
    // Substitui na ordem que aparece no body do print
    let i = 0;
    body = body.replace(/<canvas\b[^>]*id="heatcanv-[^"]*"[^>]*><\/canvas>/g, (m) => {
      const url = dataUrls[i++];
      if (!url) return m;
      return `<img src="${url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block">`;
    });
  } else {
    body = _renderDiagHtml(text);
  }
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8"><title>Diagnóstico — ${turma}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:18px 22px}
    .header{border-bottom:3px solid #6B21A8;padding-bottom:10px;margin-bottom:14px}
    .header{border-bottom:3px solid #2e7d32}
    .header h1{font-size:16px;font-weight:800;color:#1b5e20}
    .header .meta{display:flex;gap:18px;margin-top:6px;flex-wrap:wrap;font-size:10px;color:#555}
    .header .meta span b{color:#1a1a1a}
    h3{font-size:13px;font-weight:800;color:#1b5e20;margin:12px 0 4px;border-bottom:2px solid #a5d6a7;padding-bottom:3px}
    h4{font-size:11.5px;font-weight:700;color:#2e7d32;margin:9px 0 2px}
    h5{font-size:10.5px;font-weight:700;color:#388e3c;margin:7px 0 2px}
    table{border-collapse:collapse;width:100%;margin:6px 0;font-size:10px}
    th{background:#e8f5e9;color:#1b5e20;font-weight:700;padding:4px 6px;border:1px solid #c8e6c9;text-align:left}
    td{padding:3px 6px;border:1px solid #e0e0e0}
    tr:nth-child(even) td{background:#f9fbe7}
    ul{padding-left:14px;margin:4px 0}
    li{margin:2px 0;font-size:10.5px}
    strong{color:#1b5e20}
    .red-box{margin:3px 0;padding:4px 7px;background:#fff5f5;border-left:3px solid #c62828;border-radius:3px;font-size:10.5px}
    .yel-box{margin:3px 0;padding:4px 7px;background:#f1f8e9;border-left:3px solid #7cb342;border-radius:3px;font-size:10.5px}
    .footer{text-align:center;margin-top:14px;font-size:9px;color:#aaa;border-top:2px solid #a5d6a7;padding-top:6px;color:#2e7d32}
    @media print{body{padding:10px 14px}button{display:none!important}@page{size:A4;margin:12mm 10mm}}
  </style></head><body>
  <div class="header">
    <h1>🤖 Diagnóstico Inteligente — ${turma}</h1>
    <div class="meta">
      <span><b>Curso:</b> ${curso}</span>
      <span><b>Bimestre:</b> ${_covBim}º</span>
      <span><b>Total de alunos:</b> ${total}</span>
      <span><b>Gerado em:</b> ${savedDt}</span>
      <span><b>Impresso em:</b> ${dt}</span>
    </div>
  </div>
  ${body.replace(/🔴\s*/g,'<span class="red-box">🔴 ').replace(/🟡\s*/g,'<span class="yel-box">🟡 ')}
  <div class="footer">IFMA Campus Imperatriz · TeIA</div>
  <div style="text-align:center;margin-top:10px">
    <button onclick="window.print()" style="background:#6B21A8;color:#fff;border:none;border-radius:6px;padding:7px 22px;font-size:11px;font-weight:700;cursor:pointer">🖨️ Imprimir / Salvar PDF</button>
  </div>
  </body></html>`);
  w.document.close();
}

function downloadDiagResult(){
  const text=document.getElementById('diag-download-btn')?.dataset.text||'';
  if(!text)return;
  const cl=findClass(activeClassId);
  const nome=(cl?.clase?.name||'turma').replace(/[^a-zA-Z0-9]/g,'_');
  const blob=new Blob([text],{type:'text/markdown;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`diagnostico_${nome}_bim${_covBim}_${new Date().toISOString().slice(0,10)}.md`;
  a.click();
  toast('✅ Diagnóstico baixado!','ok');
}

function closeDiagModal(){document.getElementById('diag-modal').style.display='none';}

function setDiagStatus(msg,pct){
  const el=document.getElementById('diag-status');
  const lbl=document.getElementById('diag-status-label');
  const bar=document.getElementById('diag-progress-bar');
  const pctEl=document.getElementById('diag-progress-pct');
  if(!msg&&pct===undefined){el.style.display='none';return;}
  el.style.display='block';
  if(lbl)lbl.textContent=msg||'';
  if(pct!==undefined){
    const p=Math.max(0,Math.min(100,Math.round(pct)));
    if(bar)bar.style.width=p+'%';
    if(pctEl)pctEl.textContent=p+'%';
  }
}

async function runDiagnostico(){
  // Verifica se proxy tem chave configurada
  const _proxyStatus=await checkApiKeyStatus();
  if(!_proxyStatus.configured){toast('Chave API não configurada — vá em Configurações → IA','err');return;}
  const cl=findClass(activeClassId);if(!cl){return;}
  const clase=cl.clase;
  const bim=_covBim||1;
  const students=clase.students||[];

  const btn=document.getElementById('diag-run-btn');
  btn.disabled=true;btn.textContent='⏳ Analisando...';
  // Limpa resultado anterior ao gerar novo
  document.getElementById('diag-result').innerHTML='<div style="color:#888;text-align:center;padding:2rem">⏳ Preparando análise...</div>';
  document.getElementById('diag-saved-banner').style.display='none';
  document.getElementById('diag-status').style.display='none';
  ['diag-copy-btn','diag-print-btn','diag-new-btn'].forEach(id=>{document.getElementById(id).style.display='none';});
  document.getElementById('diag-run-btn').style.display='none';

  // ── Ano por aluno (igual ao restante do sistema) ──
  function getYrForStudent(s){
    // 1. Tenta o ano ativo global
    if(activeYear)return activeYear;
    // 2. Tenta encontrar qual ano tem dados para o bim atual
    const years=Object.keys(s.avaliacoes||{});
    for(const y of years){
      const av=s.avaliacoes[y]?.[bim];
      if(av&&(av.comp>0||av.desemp>0))return y;
    }
    // 3. Fallback: ano corrente ou anoIngresso
    return getActiveYear(s);
  }

  // ── 1. Geocode addresses ──
  const needGeo=students.filter(s=>s.endereco&&String(s.endereco).trim().length>4);
  setDiagStatus(needGeo.length?`📍 Calculando distâncias de ${needGeo.length} endereços...`:'📍 Sem endereços para geocodificar',2);
  const distMap={};
  for(let i=0;i<needGeo.length;i++){
    const s=needGeo[i];
    const pct=2+(i+1)/needGeo.length*52;
    setDiagStatus(`📍 Endereço ${i+1}/${needGeo.length} — ${s.nome?.split(' ')[0]}`,pct);
    distMap[s.id]=await geocodeAddress(String(s.endereco));
    if(i<needGeo.length-1)await new Promise(r=>setTimeout(r,400));
  }

  // ── 2. Aggregate com ano POR ALUNO ──
  setDiagStatus('📊 Agregando dados da turma...',57);
  const CL={0:'—',1:'Ruim',2:'Regular',3:'Bom',4:'Excelente'};

  // Construir mapa de avaliação por aluno (usando o ano correto de cada um)
  const avMap=new Map();
  students.forEach(s=>{
    const yr=getYrForStudent(s);
    const av=getAvYear(s,yr,bim);
    avMap.set(s.id,{av,yr});
  });

  const avaliados=students.filter(s=>{const{av}=avMap.get(s.id);return av.comp>0||av.desemp>0;});

  // Ano para mostrar no cabeçalho: prioriza o ano ATIVO selecionado pelo
  // usuário (activeYear) — esse é o "ano vigente" do conselho. Só usa o ano
  // mais frequente nas avaliações como último recurso.
  const yrAtualSistema = String(new Date().getFullYear());
  const yrFreq={};
  avMap.forEach(({yr})=>{yrFreq[yr]=(yrFreq[yr]||0)+1;});
  const yrMaisFrequente = Object.keys(yrFreq).sort((a,b)=>yrFreq[b]-yrFreq[a])[0];
  const yrDisplay = (typeof activeYear !== 'undefined' && activeYear)
    ? String(activeYear)
    : (yrMaisFrequente || yrAtualSistema);
  // O `yr` (ano por aluno) continua sendo o que cada um tem em avMap, mas o
  // CABEÇALHO mostra o ano que o usuário está olhando.

  const mediaComp=avaliados.length?(avaliados.reduce((acc,s)=>acc+avMap.get(s.id).av.comp,0)/avaliados.length).toFixed(1):0;
  const mediaDesemp=avaliados.length?(avaliados.reduce((acc,s)=>acc+avMap.get(s.id).av.desemp,0)/avaliados.length).toFixed(1):0;

  function topTags(arr){const m={};arr.forEach(t=>{m[t]=(m[t]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`).join(', ');}
  const allCompIssues=[],allDespIssues=[],allDiscs=[],allEncam=[],allCompPos=[],allDespPos=[];
  avaliados.forEach(s=>{
    const{av}=avMap.get(s.id);
    (av.compIssues||[]).forEach(t=>allCompIssues.push(t));
    (av.despIssues||[]).forEach(t=>allDespIssues.push(t));
    (av.disciplinas||[]).filter(d=>d!=='__todas__').forEach(t=>allDiscs.push(t));
    if((av.disciplinas||[]).includes('__todas__'))allDiscs.push('Todas as disciplinas');
    (av.encaminhamentos||[]).filter(e=>e!==ENCAM_OUTRO_KEY).forEach(t=>allEncam.push(t));
    (av.compPos||[]).forEach(t=>allCompPos.push(t));
    (av.despPos||[]).forEach(t=>allDespPos.push(t));
  });

  const distCount=(field)=>[1,2,3,4].map(v=>students.filter(s=>avMap.get(s.id).av[field]===v).length);
  const dc=distCount('comp'),dd=distCount('desemp');

  // ── 3. Build student table ──
  // Helpers para os campos novos da planilha enriquecida v2
  const parseBR = v => {
    // "1,56" → 1.56 ; "-" ou "" → null
    if(!v) return null;
    const s = String(v).trim();
    if(s==='' || s==='-' || s==='—') return null;
    const n = parseFloat(s.replace(',','.'));
    return isNaN(n) ? null : n;
  };
  const calcDefasagem = s => {
    // Defasagem idade-série COM TOLERÂNCIA REALISTA por faixa etária.
    // Aplicada SOMENTE no Técnico Integrado (não calcula para Subsequente,
    // Concomitante ou EJA — esses são públicos adultos/jovens trabalhadores,
    // onde a "defasagem" não faz sentido como preditor de evasão).
    //
    // Faixas esperadas (Técnico Integrado, ano corrente):
    //   1º ano (período 1)  → 14-16 anos
    //   2º ano (período 2)  → 15-17 anos
    //   3º ano (período 3)  → 16-18 anos
    //   4º ano (período 4)  → 17-19 anos (raro)
    //
    // Defasagem = anos ACIMA do limite superior da faixa. Se idade está dentro
    // da faixa, defasagem = 0. Mesmo abaixo da faixa (calouro precoce), 0.
    const dn = s.dataNascimento || '';
    const periodoNum = parseFloat(String(s.periodo||'').replace(',','.'));
    if(!dn || !periodoNum || periodoNum<=0) return null;
    const ymatch = String(dn).match(/(19|20)\d{2}/);
    if(!ymatch) return null;
    const anoNasc = parseInt(ymatch[0],10);
    const anoAtual = new Date().getFullYear();
    const idadeReal = anoAtual - anoNasc;
    // Filtro RIGOROSO: precisa ser Técnico Integrado.
    const nivel = String(s.nivelEnsino||'').toLowerCase();
    const mod = String(s.modalidade||'').toLowerCase();
    const desc = String(s.descricaoCurso||'').toLowerCase();
    const textoTudo = nivel + ' ' + mod + ' ' + desc;
    const isTecnico = nivel.includes('técnico')||nivel.includes('tecnico');
    const isSubseq = textoTudo.includes('subseq');
    const isConcom = textoTudo.includes('concom');
    const isEja = textoTudo.includes('eja') || textoTudo.includes('proeja');
    if(!isTecnico) return null;
    if(isSubseq || isConcom || isEja) return null;
    const isIntegrado = mod.includes('integrado') || desc.includes('integrado')
                    || (!isSubseq && !isConcom && !isEja);
    if(!isIntegrado) return null;
    // Faixa: limite superior = 16 + (período - 1). 1ºano:16, 2º:17, 3º:18, 4º:19.
    const periodoInt = Math.max(1, Math.min(4, Math.floor(periodoNum)));
    const idadeLimSuperior = 15 + periodoInt;  // 16, 17, 18, 19
    return Math.max(0, idadeReal - idadeLimSuperior);
  };
  // Helper: pega histórico do aluno em outros bimestres do mesmo ano e em
  // anos anteriores. Retorna string compacta com médias e tendência.
  const histAluno = (s, yrAluno) => {
    const av = s.avaliacoes || {};
    const anoAtual = String(yrAluno);
    // 1. Bimestres anteriores do MESMO ano (não inclui o atual)
    const bimsAnoAtual = [];
    if (av[anoAtual] && typeof av[anoAtual] === 'object') {
      for (const b of ['1','2','3','4']) {
        if (parseInt(b) >= bim) continue; // só anteriores
        const d = av[anoAtual][b];
        if (d && (d.comp>0 || d.desemp>0)) {
          bimsAnoAtual.push({b: parseInt(b), comp: d.comp||0, desemp: d.desemp||0});
        }
      }
    }
    // 2. Anos anteriores (média de comp/desemp em cada ano completo)
    const anosAnteriores = [];
    for (const ano of Object.keys(av).sort()) {
      if (ano >= anoAtual) continue;
      const bims = av[ano];
      if (!bims || typeof bims !== 'object') continue;
      let comps = [], deses = [];
      for (const b of Object.values(bims)) {
        if (b && typeof b === 'object') {
          if (b.comp > 0) comps.push(b.comp);
          if (b.desemp > 0) deses.push(b.desemp);
        }
      }
      if (comps.length || deses.length) {
        const mcomp = comps.length ? (comps.reduce((a,b)=>a+b,0)/comps.length).toFixed(1) : '-';
        const mdes  = deses.length ? (deses.reduce((a,b)=>a+b,0)/deses.length).toFixed(1) : '-';
        anosAnteriores.push(`${ano}:c${mcomp}/d${mdes}`);
      }
    }
    const partes = [];
    if (bimsAnoAtual.length) {
      partes.push('bimsPrev=' + bimsAnoAtual.map(x=>`b${x.b}:c${x.comp}d${x.desemp}`).join(','));
    }
    if (anosAnteriores.length) {
      partes.push('anosPrev=' + anosAnteriores.join(','));
    }
    return partes.length ? partes.join('|') : '';
  };

  const linhas=students.map(s=>{
    const{av,yr}=avMap.get(s.id);
    const hasAv=av.comp>0||av.desemp>0;
    const seat=av.seating&&av.seating.x>=0?`X=${av.seating.x}% Y=${av.seating.y}%`:'sem posição';
    const km=distMap[s.id]!=null?distMap[s.id]+'km':'sem endereço';
    // NEE — apenas para informação de suporte/acessibilidade, NÃO entra no score
    const alertas=[
      s.transtorno&&temAlerta(s.transtorno)?'transtorno:'+String(s.transtorno).substring(0,25):'',
      s.deficiencia&&temAlerta(s.deficiencia)?'deficiência:'+String(s.deficiencia).substring(0,25):'',
      s.superdotacao&&temAlerta(s.superdotacao)?'superdotação':''
    ].filter(Boolean).join(';')||'—';
    const negC=(av.compIssues||[]).join(';')||'—';
    const negD=(av.despIssues||[]).join(';')||'—';
    const discs=(av.disciplinas||[]).includes('__todas__')?'TODAS':(av.disciplinas||[]).join(';')||'—';
    const encam=(av.encaminhamentos||[]).filter(e=>e!==ENCAM_OUTRO_KEY).join(';')||'—';
    const obs=av.obs?av.obs.substring(0,120):'—';
    // === Campos novos (planilha v2) — chaves do score de evasão ===
    const freqNum = parseBR(s.frequencia);
    const freqStr = freqNum!=null ? (freqNum*100).toFixed(1)+'%' : 'ausente';
    const iraNum = parseBR(s.ira);
    const periodoNum = parseFloat(String(s.periodo||'').replace(',','.'))||0;
    // I.R.A. = 0 em ingressante (1º período) → "ainda sem nota", não rendimento ruim
    const iraIngressante = iraNum===0 && periodoNum>0 && periodoNum<=1;
    const iraStr = iraNum==null ? 'ausente' : (iraIngressante ? '0,00(ingressante-sem-nota)' : iraNum.toFixed(2).replace('.',','));
    const rendaNum = parseBR(s.rendaPerCapita);
    const rendaStr = rendaNum==null ? 'ausente' : rendaNum.toFixed(2).replace('.',',')+'sm';
    const cadUnico = s.cadastroUnico && String(s.cadastroUnico).trim() && String(s.cadastroUnico).trim()!=='-' ? 'sim' : 'não';
    const def = calcDefasagem(s);
    // Defasagem só é "anos" se > 0 (idade acima do limite superior da faixa).
    const defStr = def==null ? '—' : (def>0 ? def+'anos' : '0');
    const mun = s.municipioResidencia || '';
    const munStr = mun || 'ausente';
    // Município fora de Imperatriz → marca como ALERTA, mas mantém distância
    const munOk = mun.toLowerCase().includes('imperatriz');
    const munFlag = (!mun || munOk) ? '' : '[ALERTA-MUN]';
    const nivel = s.nivelEnsino || '—';
    // Histórico temporal (bimestres anteriores + anos anteriores)
    const hist = histAluno(s, yr);
    return`${s.nome}|P${periodoNum||'?'}|${nivel}|comp=${hasAv?av.comp:'-'}|des=${hasAv?av.desemp:'-'}|freq=${freqStr}|IRA=${iraStr}|renda=${rendaStr}|CadÚnico=${cadUnico}|defas=${defStr}|mun=${munStr}${munFlag}|dist=${km}|pos=${seat}|negC=${negC}|negD=${negD}|disc=${discs}|enc=${encam}|nee=${alertas}|obs=${obs}${hist?'|'+hist:''}`;
  }).join('\n');

  const semPosicao=students.filter(s=>{const{av}=avMap.get(s.id);return!(av.seating&&av.seating.x>=0);}).length;
  const semDist=students.filter(s=>!s.endereco||!String(s.endereco).trim()||distMap[s.id]==null).length;
  const semFreq=students.filter(s=>parseBR(s.frequencia)==null).length;
  const semIra=students.filter(s=>parseBR(s.ira)==null).length;
  const semRenda=students.filter(s=>parseBR(s.rendaPerCapita)==null).length;
  const foraImperatriz=students.filter(s=>{
    const m=String(s.municipioResidencia||'').toLowerCase();
    return m && !m.includes('imperatriz');
  }).length;

  // ── Séries históricas agregadas da TURMA (médias por bim do ano atual e
  //    por ano anterior). Permite à IA citar evolução temporal. ──
  const serieBimsAnoAtual = []; // [{bim, mcomp, mdes, n}]
  for (const b of [1,2,3,4]) {
    let comps = [], deses = [];
    for (const s of students) {
      const ano = String(yrDisplay);
      const d = (s.avaliacoes||{})[ano]?.[b] || (s.avaliacoes||{})[ano]?.[String(b)];
      if (d && typeof d === 'object') {
        if (d.comp > 0) comps.push(d.comp);
        if (d.desemp > 0) deses.push(d.desemp);
      }
    }
    if (comps.length || deses.length) {
      const mc = comps.length ? (comps.reduce((a,b)=>a+b,0)/comps.length).toFixed(2) : null;
      const md = deses.length ? (deses.reduce((a,b)=>a+b,0)/deses.length).toFixed(2) : null;
      serieBimsAnoAtual.push({bim: b, mcomp: mc, mdes: md, n: Math.max(comps.length, deses.length)});
    }
  }
  // Anos anteriores: médias por ano
  const anosPresentes = new Set();
  for (const s of students) {
    for (const a of Object.keys(s.avaliacoes||{})) anosPresentes.add(a);
  }
  const serieAnos = []; // [{ano, mcomp, mdes, n}]
  for (const ano of [...anosPresentes].sort()) {
    if (ano >= String(yrDisplay)) continue;
    let comps = [], deses = [];
    for (const s of students) {
      const bims = (s.avaliacoes||{})[ano];
      if (!bims || typeof bims !== 'object') continue;
      for (const d of Object.values(bims)) {
        if (d && typeof d === 'object') {
          if (d.comp > 0) comps.push(d.comp);
          if (d.desemp > 0) deses.push(d.desemp);
        }
      }
    }
    if (comps.length || deses.length) {
      const mc = comps.length ? (comps.reduce((a,b)=>a+b,0)/comps.length).toFixed(2) : null;
      const md = deses.length ? (deses.reduce((a,b)=>a+b,0)/deses.length).toFixed(2) : null;
      serieAnos.push({ano, mcomp: mc, mdes: md, n: Math.max(comps.length, deses.length)});
    }
  }

  const txtSerieTemporal = (() => {
    const partes = [];
    if (serieBimsAnoAtual.length > 0) {
      partes.push('Bimestres do ano atual (' + yrDisplay + '):');
      for (const b of serieBimsAnoAtual) {
        partes.push(`  ${b.bim}º bim: comp=${b.mcomp||'-'} | des=${b.mdes||'-'} | n=${b.n}`);
      }
    }
    if (serieAnos.length > 0) {
      partes.push('Anos anteriores:');
      for (const a of serieAnos) {
        partes.push(`  ${a.ano}: comp=${a.mcomp||'-'} | des=${a.mdes||'-'} | n=${a.n}`);
      }
    }
    return partes.length ? partes.join('\n') : 'Sem histórico anterior registrado.';
  })();


  const totalAlunos = students.length;
  // Cobertura "completa" considera os fatores ESSENCIAIS (frequência, IRA, renda).
  // Distância depende de geocoding async — pode falhar mesmo com endereço válido.
  // semPosicao (mapa da sala) também não conta como bloqueador.
  const coberturaCompleta = (semFreq===0 && semIra===0 && semRenda===0);
  const txtCobertura = coberturaCompleta
    ? `COBERTURA: 100% em todos os fatores (frequência, IRA, renda, distância). NÃO mencione "fatores ausentes" — a seção 3 do template deve ser OMITIDA inteira.`
    : `COBERTURA INCOMPLETA — declare na seção 3:
- Sem posição no mapa: ${semPosicao}/${totalAlunos}
- Sem endereço/distância: ${semDist}/${totalAlunos}
- Sem frequência: ${semFreq}/${totalAlunos}
- Sem I.R.A.: ${semIra}/${totalAlunos}
- Sem renda per capita: ${semRenda}/${totalAlunos}`;
  const txtMunicipio = foraImperatriz===0
    ? `MUNICÍPIO: todos os alunos residem em Imperatriz-MA. NÃO mencione alertas de atualização cadastral — a seção 4 deve ser OMITIDA.`
    : `MUNICÍPIO: ${foraImperatriz}/${totalAlunos} alunos residem fora de Imperatriz-MA — emita alertas na seção 4.`;

  const prompt=`Você é o motor de análise do TeIA — plataforma de apoio à decisão pedagógica do IFMA Campus Imperatriz. Gere um diagnóstico TÉCNICO, EXPLICÁVEL e REFERENCIADO para esta turma. Calcule score de risco de evasão por aluno e mostre matematicamente como cada fator contribuiu.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TURMA: ${clase.name} | CURSO: ${cl.course?.name||'—'}
BIMESTRE: ${bim}º / ${yrDisplay} | AVALIADOS: ${avaliados.length}/${totalAlunos} alunos
ESCOLA: IFMA Campus Imperatriz (Av. Newton Bello, Vila Maria, Imperatriz-MA)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## REGRAS INVIOLÁVEIS

1. Use APENAS os fatores listados em "FATORES PERMITIDOS NO SCORE". NUNCA usem como fatores de risco: Etnia/Raça, gênero, Deficiência, Superdotação, Transtorno, Emancipado. NEE pode gerar nota qualitativa de suporte/acessibilidade, jamais aumento de risco.
2. Dado ausente NÃO é penalizado — fator simplesmente não entra no cálculo daquele aluno e o peso é redistribuído proporcionalmente entre os fatores disponíveis.
3. I.R.A. = 0 em aluno do 1º período = "ainda sem nota", NÃO rendimento ruim. Marquei tais casos como "(ingressante-sem-nota)" na tabela — IGNORE como fator de risco.
4. Os pesos abaixo são heurísticos da equipe (baseados na ORDEM de relevância apontada pela literatura — frequência e rendimento no topo); NÃO são percentuais extraídos dos artigos.
5. Score (número) e sinais qualitativos (texto) são SEPARADOS. Texto livre não altera o número.
6. Recomendações pedagógicas devem DERIVAR dos fatores identificados — nunca genéricas.
7. Linguagem técnica e sóbria, sem alarmismo. O diagnóstico APOIA decisão humana, não a substitui.

## FUNDAMENTAÇÃO CIENTÍFICA (cite estas referências ao explicar cada fator)

[1] **OLIVEIRA et al. (2024)** — *Identificação de Fatores de Risco para Evasão Escolar em Ensino Fundamental e Médio.* Avaliação Psicológica, v.23 n.4. DOI: 10.15689/ap.2024.2304.09. Amostra: 104.011 estudantes. Achados: renda familiar, desempenho em matemática, período/frequência escolar, defasagem idade-série e necessidade de trabalho >20h/sem são os preditores principais. Renda pesa MAIS no ensino médio/técnico. Precisão: 58-68%.

[2] **RIBEIRO et al. (2026)** — *Evasão escolar: análise e estudo de modelos preditivos sobre frequência, rendimento e permanência.* DOI: 10.5281/zenodo.19447417. Frequência, rendimento e renda como variáveis de maior relevância.

[3] **CHUNG; LEE (2019)** — *Dropout early warning systems for high school students using machine learning.* Children and Youth Services Review. DOI: 10.1016/j.childyouth.2018.11.030. Amostra: 165.715 estudantes ensino médio. Random Forest. Frequência e desempenho como preditores centrais.

[4] **COLPO et al. (2024)** — *Mineração de Dados Educacionais na Predição da Evasão Estudantil.* RBIE. DOI: 10.5753/rbie.2024.3559. Aponta a lacuna na entrega das predições aos gestores — gap que a TeIA preenche.

[5] **MOLNAR (2022)** — *Interpretable Machine Learning: A Guide for Making Black Box Models Explainable.* https://christophm.github.io/interpretable-ml-book/. Fundamenta SHAP/LIME como base da explicabilidade.

[6] **CARVALHO; MATTOS; AGUIAR (2024)** — *Interpretabilidade e Justiça Algorítmica em Modelos Preditivos de Evasão.* SBIE 2024. DOI: 10.5753/sbie.2024.242289. Sem explicabilidade, educadores não adotam.

[7] **MDUMA et al. (2019)** — *A survey of machine learning approaches and techniques for student dropout prediction.* DOI: 10.5334/dsj-2019-014.

## FATORES PERMITIDOS NO SCORE (com pesos heurísticos e thresholds CALIBRADOS)

| # | Fator | Dado | Peso base | Thresholds | Referência |
|---|---|---|---|---|---|
| 1 | Frequência/absenteísmo | freq= (% de presença) | **0,30 (ALTO)** | <75% = 1,0 (risco máximo); 75-85% = 0,6; 85-95% = 0,3; ≥95% = 0,0 | [1][2][3] |
| 2 | Rendimento (I.R.A. + Desempenho Conselho) | IRA (0-10) + des (1-4) | **0,30 (ALTO)** | **IRA<7,0: 1,0 (RISCO ALTO — média mínima de aprovação no IFMA é 7,0; aluno com IRA<7 já reprovou em pelo menos uma disciplina); 7,0≤IRA<8,0: 0,6 (médio); 8,0≤IRA<9,0: 0,3 (baixo); IRA≥9,0: 0,0 (sem contribuição). PESO MAIOR no período avançado (3º, 4º ano): IRA<7 num aluno em série final é mais grave porque ele já acumulou reprovações ao longo do curso.** Se des=1 (Ruim no Conselho), some +0,3 ao IRA calculado (limitado a 1,0) — captura discrepância qualitativa que a média não mostra. Ignora IRA=0 em ingressante (período 1) — declarar "(ingressante-sem-nota)". | [1][3] |
| 3 | Vulnerabilidade socioeconômica | renda (SM p/c) + CadÚnico | **0,20 (MÉDIO)** | renda<0,5sm: 0,8 (+0,2 se CadÚnico=sim → 1,0); 0,5≤renda<1,0: 0,4; renda≥1,0: 0,0. Pesa +30% se nivel=Técnico. | [1] |
| 4 | Defasagem idade-série | defas (anos) | **0,10 (MÉDIO-BAIXO)** | **A defasagem JÁ vem pré-calculada na tabela como anos ACIMA do limite superior da faixa esperada (faixas: 1ºano 14-16, 2ºano 15-17, 3ºano 16-18, 4ºano 17-19). defas=0 significa idade DENTRO da faixa normal → contribuição 0,0 (sem risco). defas=1: 0,3; defas=2: 0,6; defas≥3: 1,0.** Calculado SOMENTE para Técnico Integrado — para Subsequente/Concomitante/EJA o valor vem como "—" e o fator é redistribuído. | [1] |
| 5 | Distância/município | mun + dist | **0,10 (MÉDIO-BAIXO)** | **A distância é SEMPRE computada no score**, independentemente do município. Thresholds: dist≤10km: 0,0; 10-20km: 0,4; 20-30km: 0,7; >30km: 1,0. **Quando município ≠ Imperatriz-MA, marca-se [ALERTA-MUN] na tabela e o aluno aparece na seção 4 com solicitação de confirmação cadastral — mas o cálculo é feito normalmente.** | Preditor espacial TeIA |

### FÓRMULA DO SCORE
\`\`\`
score_bruto = Σ (peso_i × contribuição_i) para fatores com dado disponível
peso_efetivo_i = peso_i × (1 / Σ pesos disponíveis)   ← redistribuição quando há dado ausente
score_final = round(score_bruto × 100)  ← intervalo 0-100
classificação = Baixo (<35) | Médio (35-65) | Alto (>65)
\`\`\`

### REGRA DO MUNICÍPIO
Município ≠ Imperatriz-MA → distância **É computada normalmente no score** (não há mais redistribuição de peso por isso). O aluno aparece na seção 4 como "verificação cadastral solicitada". Se a verificação confirmar que ele se mudou para Imperatriz, basta atualizar o cadastro no SUAP.

### Camada complementar (NÃO compõe score numérico)
Comportamento Conselho (comp=1-4), aspectos negativos (negC/negD), encaminhamentos (enc), disciplinas com dificuldade (disc), observações (obs), posição no mapa (pos). USE para enriquecer diagnóstico qualitativo SEMPRE em tom de hipótese.

## MÉDIAS DA TURMA (bimestre atual)
Comportamento: ${mediaComp}/4 (${CL[Math.round(mediaComp)]}) | Desempenho: ${mediaDesemp}/4 (${CL[Math.round(mediaDesemp)]})
Comp dist → Ruim:${dc[0]} Reg:${dc[1]} Bom:${dc[2]} Exc:${dc[3]}
Desemp dist → Ruim:${dd[0]} Reg:${dd[1]} Bom:${dd[2]} Exc:${dd[3]}
Problemas comportamento (top): ${topTags(allCompIssues)||'nenhum'}
Problemas desempenho (top): ${topTags(allDespIssues)||'nenhum'}
Disciplinas críticas: ${topTags(allDiscs)||'nenhuma'}
Encaminhamentos: ${topTags(allEncam)||'nenhum'}

## SÉRIE TEMPORAL DA TURMA (evolução agregada)
${txtSerieTemporal}

## COBERTURA DE DADOS
${txtCobertura}
${txtMunicipio}

## DADOS POR ALUNO
Legenda: P=período | freq=% presença | IRA=índice rendimento (0-10) | renda=salários mínimos per capita | CadÚnico=tem NIS | defas=defasagem em anos ACIMA da faixa esperada (0 = idade normal) | mun=município (com [ALERTA-MUN] se fora de Imperatriz) | dist=distância em km | comp/des=classificação 1-4 do Conselho | negC/negD=aspectos negativos | nee=NEE (só suporte, não risco) | bimsPrev=histórico bimestres anteriores deste ano | anosPrev=histórico anos anteriores (médias)

${linhas}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO DE SAÍDA: JSON ESTRUTURADO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você deve responder APENAS com um JSON válido (sem markdown ao redor, sem texto antes ou depois, sem \`\`\`json). O JSON terá DUAS partes:

1. **diagnostico**: linguagem DIDÁTICA E SIMPLES para a equipe pedagógica e PAIS entenderem. Sem percentuais cheios. Sem fórmulas. Sem referências [1][2] no texto. Frases curtas e diretas. Tom humano e empático.

2. **memorial**: detalhes TÉCNICOS para os professores (fórmulas, decomposição do score, fatores ponderados, referências). Esse memorial fica num modal separado e SÓ é visto por quem clicar em "Memorial de Cálculo".

══ ESQUEMA EXATO DO JSON ══

\`\`\`json
{
  "panorama": {
    "titulo": "string curto — diagnóstico em 1 frase (ex: 'Turma com 3 alunos em risco iminente de evasão')",
    "humor": "calmo|atencao|critico",
    "metricasChave": [
      { "label": "Alunos avaliados", "valor": "34", "icone": "👥" },
      { "label": "Comportamento médio", "valor": "Bom", "icone": "🤝" },
      { "label": "Desempenho médio", "valor": "Regular", "icone": "📊" },
      { "label": "Em risco iminente", "valor": "3", "icone": "⚠️", "destaque": true }
    ],
    "paragrafo": "1-2 frases didáticas resumindo o estado da turma. Como se explicasse para um pai/mãe."
  },

  "alunosRiscoIminente": [
    {
      "nome": "Nome completo",
      "primeiroNome": "Primeiro nome",
      "score": 78,
      "classificacao": "Alto",
      "resumo": "1 frase explicando POR QUE este aluno está em risco, em linguagem simples (ex: 'Faltou muitas aulas e teve notas baixas nas avaliações')",
      "sinais": ["Faltas frequentes", "Notas baixas em Matemática", "Família em situação econômica difícil"],
      "cor": "vermelho|laranja|amarelo"
    }
  ],

  "analiseEspacial": {
    "incluir": true,
    "observacaoCurta": "Frase com o padrão identificado (ex: 'A maioria dos alunos com dificuldade está sentada no fundo da sala').",
    "realocacoes": [
      {
        "primeiroNome": "Paulo",
        "nomeCompleto": "Paulo Henrique Batista da Silva",
        "deX": 63,
        "deY": 91,
        "paraX": 35,
        "paraY": 25,
        "motivo": "Mudar para a frente reduz dispersão e facilita acompanhamento"
      }
    ]
  },

  "problemasColetivos": [
    { "titulo": "Dificuldade em disciplinas técnicas", "descricao": "Frase didática", "afetados": "10 alunos", "icone": "📚" }
  ],

  "problemasIndividuais": [
    { "nome": "Primeiro nome", "situacao": "1 frase didática", "icone": "👤" }
  ],

  "evolucaoTemporal": {
    "incluir": ${(serieAnos.length===0 && serieBimsAnoAtual.length<=1) ? 'false' : 'true'},
    "tendenciaGeral": "melhorando|estavel|piorando",
    "fraseDidatica": "Comparado ao ano passado, a turma...",
    "alunosTrajetoria": [
      {
        "primeiroNome": "Ana",
        "nomeCompleto": "Ana Clara Souza",
        "trajetoria": "1 frase didática DIRETA — sem jargão técnico (NUNCA escreva 'c1d2', 'c2d1', etc. — use linguagem humana: 'comportamento foi bom mas caiu', 'desempenho subiu', 'frequência despencou'). Exemplo: 'Vinha bem em 2024, melhorou no 1º bim, mas regrediu nos últimos bimestres.'",
        "tipo": "melhora|degradacao|estavel",
        "pontos": [
          { "label": "2024", "comp": 1.8, "des": 2.0 },
          { "label": "2025", "comp": 2.5, "des": 2.3 },
          { "label": "2026/1º", "comp": 3.0, "des": 2.8 }
        ]
      }
    ]
  },

  "verificacaoCadastral": {
    "incluir": ${foraImperatriz===0 ? 'false' : 'true'},
    "alunos": [
      { "nome": "Nome completo", "primeiroNome": "Iêgo", "municipio": "Ribamar Fiquene-MA", "distancia": "13,7 km", "outroEstado": false }
    ]
  },

  "sinaisQualitativos": [
    "Hipótese 1 em frase didática (ex: 'Há indícios de problemas de motivação na turma — vários alunos relatam cansaço')"
  ],

  "planoUrgente": [
    {
      "acao": "Ação concreta e nominal",
      "alunos": ["Paulo Henrique", "Iêgo Neres"],
      "responsavel": "Orientação Pedagógica|Serviço Social|Psicologia",
      "prazo": "Esta semana|Próximas 2 semanas"
    }
  ],

  "planoImportante": [
    { "acao": "Ação contínua", "alunos": ["lista de nomes ou 'turma toda'"], "responsavel": "..." }
  ],

  "memorial": {
    "metodologia": "Frase explicando: 'Score 0-100 calculado com 5 fatores ponderados (frequência 30%, rendimento 30%, vulnerabilidade 20%, defasagem 10%, distância 10%). Pesos heurísticos da equipe, baseados em literatura.'",
    "fatoresExplicacao": [
      { "fator": "Frequência", "peso": "30%", "regra": "<75%=1.0; 75-85%=0.6; 85-95%=0.3; ≥95%=0.0", "referencias": "[1][2][3]" },
      { "fator": "Rendimento (IRA + des)", "peso": "30%", "regra": "IRA<7=1.0; 7-8=0.6; 8-9=0.3; ≥9=0.0 (+0.3 se des=1)", "referencias": "[1][3]" },
      { "fator": "Vulnerabilidade", "peso": "20%", "regra": "renda<0,5sm=0.8 (+0.2 se CadÚnico=1.0); 0,5-1=0.4; ≥1=0.0", "referencias": "[1]" },
      { "fator": "Defasagem idade-série", "peso": "10%", "regra": "Só Téc.Integrado. defas=1:0.3; defas=2:0.6; defas≥3:1.0", "referencias": "[1]" },
      { "fator": "Distância", "peso": "10%", "regra": "≤10km:0.0; 10-20:0.4; 20-30:0.7; >30:1.0 (sempre computada)", "referencias": "[1]" }
    ],
    "calculoDetalhado": [
      {
        "nome": "Paulo Henrique Batista da Silva",
        "scoreTotal": 78,
        "decomposicao": [
          { "fator": "Frequência", "valor": "72%", "contribuicao": 1.0, "peso": 0.30, "subTotal": 0.30 },
          { "fator": "Rendimento", "valor": "IRA=6.5, des=2", "contribuicao": 1.0, "peso": 0.30, "subTotal": 0.30 },
          { "fator": "Vulnerabilidade", "valor": "renda=0,33sm+CU", "contribuicao": 1.0, "peso": 0.20, "subTotal": 0.20 },
          { "fator": "Defasagem", "valor": "0 anos (idade normal)", "contribuicao": 0.0, "peso": 0.10, "subTotal": 0.00 },
          { "fator": "Distância", "valor": "12 km", "contribuicao": 0.4, "peso": 0.10, "subTotal": 0.04 }
        ],
        "formula": "0.30 + 0.30 + 0.20 + 0.00 + 0.04 = 0.78 → 78 (Alto)"
      }
    ],
    "referencias": [
      { "id": "[1]", "citacao": "OLIVEIRA et al. (2024). DOI: 10.15689/ap.2024.2304.09" },
      { "id": "[2]", "citacao": "RIBEIRO et al. (2026). DOI: 10.5281/zenodo.19447417" },
      { "id": "[3]", "citacao": "CHUNG; LEE (2019). DOI: 10.1016/j.childyouth.2018.11.030" },
      { "id": "[4]", "citacao": "COLPO et al. (2024). DOI: 10.5753/rbie.2024.3559" },
      { "id": "[5]", "citacao": "MOLNAR (2022). Interpretable Machine Learning" }
    ],
    "limitacoes": [
      "Modelo é heurístico (pesos da equipe), não estatístico/aprendido. Calibração futura com dados reais [4].",
      "Score reflete RISCO atual, não predição determinística.",
      "Sinais qualitativos do Conselho não compõem o score numérico.",
      "Defasagem só é calculada para Técnico Integrado."
    ]
  }
}
\`\`\`

══ REGRAS CRÍTICAS ══

**Sobre alunosRiscoIminente — LEIA COM ATENÇÃO:**
- NÃO é "Top 10 fixo". É uma lista VARIÁVEL com APENAS alunos que tenham RISCO REAL DE EVASÃO IMINENTE.
- Pode ser **0 (zero) alunos** se a turma estiver bem (turma estudiosa sem casos críticos).
- Pode ser **1, 2, 3, 5, 10, 15** — quantos forem. Use seu JULGAMENTO PERSPICAZ.
- Critério para INCLUIR: score >55 OU combinação alarmante de fatores (ex: freq<70% + IRA<6 + observações graves no Conselho) OU trajetória de degradação clara.
- **NÃO INCLUA** alunos com score 40-55 só porque a tabela mostraria 10 — eles podem estar em risco mas NÃO IMINENTE.
- Quando incluir, "cor" segue a regra: vermelho (score≥75 ou caso crítico), laranja (60-74), amarelo (55-59 com fatores combinados).

**Sobre o tom da seção "diagnostico":**
- Linguagem para PAIS e equipe pedagógica entenderem na hora.
- NUNCA use "0.30×freq" ou "[1][3]" ou "IRA threshold" no diagnostico (só no memorial).
- Substitua "freq<75%" por "faltou muitas aulas". Substitua "IRA=6.5" por "notas abaixo da média". Substitua "vulnerabilidade socioeconômica" por "família em situação econômica difícil".
- Quando for explicar um risco, foque no QUE ESTÁ ACONTECENDO COM O ALUNO, não no número.

**Sobre realocações na análise espacial:**
- Use os campos pos=X% Y% que estão nos dados dos alunos.
- Y baixo (10-40%) = frente da sala. Y alto (60-95%) = fundo.
- Para cada realocação, indique: deX, deY (posição atual exata do aluno) e paraX, paraY (posição sugerida).
- A realocação deve LIBERAR uma posição lógica (não sugerir 2 alunos para o mesmo lugar).
- **NÃO realoque alunos com comportamento BOM/EXCELENTE (comp≥3) sem motivo MUITO claro.** Aluno bem-posicionado e com bom rendimento deve ficar ONDE ESTÁ. Só mexa se o motivo for relevante (ex: aluno bom no fundo isolado pode estar sentindo-se excluído, mas isso precisa estar EVIDENTE nos dados — sem dados, NÃO realoca).
- **Foque em mover alunos COM PROBLEMAS** (comp≤2 ou des≤2, ou casos com freq baixa/IRA baixo) que estão em posições ruins (geralmente fundo, longe da supervisão).
- Inclua só realocações QUE FAÇAM SENTIDO PEDAGOGICAMENTE.
- Quantidade: 0 a 5 realocações no máximo. Pode ser 0 se a sala já estiver bem organizada.

**Sobre evolução temporal:**
- Só se ${(serieAnos.length===0 && serieBimsAnoAtual.length<=1) ? '"incluir": false (turma sem histórico)' : '"incluir": true (há histórico)'}.
- Quando incluir, cite 1-3 alunos com trajetória notável (melhora ou degradação).

**Sobre o memorial:**
- "calculoDetalhado" deve ter UM cálculo COMPLETO para CADA aluno listado em "alunosRiscoIminente".
- Se alunosRiscoIminente for vazio, calculoDetalhado pode ter os 3 alunos com maior score da turma como exemplo.
- "referencias" só inclui as que foram efetivamente citadas em algum lugar.

══ FUNDAMENTAÇÃO PRÉ-DEFINIDA (use no memorial) ══

[1] OLIVEIRA et al. (2024). DOI: 10.15689/ap.2024.2304.09
[2] RIBEIRO et al. (2026). DOI: 10.5281/zenodo.19447417
[3] CHUNG; LEE (2019). DOI: 10.1016/j.childyouth.2018.11.030
[4] COLPO et al. (2024). DOI: 10.5753/rbie.2024.3559
[5] MOLNAR (2022). Interpretable Machine Learning
[6] CARVALHO et al. (2024). DOI: 10.5753/sbie.2024.242289
[7] MDUMA et al. (2019). DOI: 10.5334/dsj-2019-014

LEMBRE-SE: **APENAS JSON na resposta**. Sem markdown ao redor. Sem \`\`\`json. Sem texto explicativo antes ou depois.`;

  setDiagStatus('📝 Prompt montado, enviando para IA...',68);
  await new Promise(r=>setTimeout(r,200));

  // ── 5. Call API ──
  setDiagStatus('🤖 IA recebendo dados...',72);
  document.getElementById('diag-result').innerHTML='<div style="text-align:center;padding:2rem;color:#888">⏳ Gerando diagnóstico...</div>';
  // Animação suave 72→93 enquanto IA processa
  let _aiPct=72;
  const _aiTimer=setInterval(()=>{
    _aiPct=Math.min(93,_aiPct+(93-_aiPct)*0.04+0.3);
    setDiagStatus('🤖 IA analisando a turma...',_aiPct);
  },600);

  try{
    // === STREAMING (Server-Sent Events) ===
    // Vantagem: o texto aparece em tempo real e não há timeout de 120s.
    // No Supabase, a função "ia" confere a sessão e repassa o pedido à Anthropic.
    // Uma chamada de função no plano gratuito dura no máximo 150 s. Se o
    // diagnóstico for longo e a conexão cair antes do fim, o pedido é refeito
    // mandando o texto já recebido para a IA continuar de onde parou.
    const _iaBody = (msgs) => JSON.stringify({
      token: teiaSessao.token,
      payload: { model:'claude-sonnet-4-5', max_tokens:16000, stream:true, messages: msgs }
    });
    const _iaHeaders = {'Content-Type':'application/json', apikey:(window.TEIA_CONFIG||{}).SUPABASE_KEY};
    let text = '';
    let firstChunkArrived = false;
    let lastUiUpdate = 0;
    const resultEl = document.getElementById('diag-result');

    // Durante o stream, JSON não é parseável até estar completo. Em vez de
    // tentar renderizar JSON parcial (que dá lixo), mostramos um indicador
    // de progresso com o tamanho do JSON recebido + uma barra animada.
    const updateProgress = () => {
      const now = Date.now();
      if (now - lastUiUpdate < 150) return; // throttle
      lastUiUpdate = now;
      const kb = (text.length / 1024).toFixed(1);
      const pct = Math.min(95, 72 + (text.length / 50));
      setDiagStatus('🤖 Gerando análise... (' + kb + ' KB recebidos)', pct);
    };

    let terminou = false;
    for (let rodada = 0; rodada < 4 && !terminou; rodada++) {
      const msgs = [{role:'user',content:prompt}];
      // Continuação: a IA recebe o que já escreveu e segue do mesmo ponto
      // (o texto enviado não pode terminar em espaço).
      let prefixo = '';
      if (rodada > 0) {
        prefixo = text.replace(/\s+$/,'');
        text = prefixo;
        msgs.push({role:'assistant', content: prefixo});
        setDiagStatus('🤖 Continuando a análise... (' + (text.length/1024).toFixed(1) + ' KB)', Math.min(95, 72 + (text.length / 50)));
      }
      const resp = await fetch(IA_PROXY_URL, { method:'POST', headers:_iaHeaders, body:_iaBody(msgs) });
      if(!resp.ok){
        // Tenta extrair JSON de erro (não-stream)
        let errMsg = 'HTTP ' + resp.status;
        try{ const j = await resp.json(); errMsg = j.error?.message || j.error || errMsg; }catch(_){}
        throw new Error(errMsg);
      }
      if(!resp.body){ throw new Error('Streaming não suportado pelo navegador'); }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      try {
        while(true){
          const {done, value} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream:true});

          // SSE: eventos separados por linha em branco (\n\n).
          let sepIdx;
          while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
            const eventBlock = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            let eventName = 'message';
            const dataLines = [];
            for (const line of eventBlock.split('\n')) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            const dataStr = dataLines.join('\n');
            if (!dataStr) continue;
            if (eventName === 'error') {
              let m = dataStr; try{ const j = JSON.parse(dataStr); m = j.message || j.error?.message || dataStr; }catch(_){}
              throw new Error(m);
            }
            let payload = null;
            try { payload = JSON.parse(dataStr); } catch(_){ continue; }
            if (payload.type === 'content_block_delta' && payload.delta?.text) {
              text += payload.delta.text;
              if (!firstChunkArrived) {
                firstChunkArrived = true;
                clearInterval(_aiTimer);
              }
              updateProgress();
            } else if (payload.type === 'message_stop') {
              terminou = true;
            } else if (payload.type === 'error') {
              throw new Error(payload.error?.message || 'Erro na geração');
            }
          }
        }
      } catch (eStream) {
        // Queda de conexão no meio do texto: tenta continuar; erro da IA: repassa
        if (!text || /overloaded|invalid|permiss|chave|acesso|sess/i.test(eStream.message||'')) throw eStream;
        console.warn('[TeIA] stream interrompido, continuando:', eStream.message);
      }
      if (!terminou && !text) break;
    }


    clearInterval(_aiTimer);
    setDiagStatus('🎨 Montando apresentação...',97);

    // Limpa cercas de markdown caso a IA tenha colocado mesmo após o pedido pra não colocar
    let jsonStr = text.trim();
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    // Pega entre a primeira { e a última }
    const startI = jsonStr.indexOf('{');
    const endI = jsonStr.lastIndexOf('}');
    if (startI >= 0 && endI > startI) jsonStr = jsonStr.slice(startI, endI + 1);

    // Tenta parse direto; se falhar, tenta REPARAR JSON truncado (resposta cortada
    // por limite de tokens). Estratégia: contar { [ não-fechados, remover a
    // última propriedade incompleta e fechar tudo.
    let diagData = null;
    let truncado = false;
    try {
      diagData = JSON.parse(jsonStr);
    } catch (errOriginal) {
      console.warn('JSON inválido na primeira tentativa, tentando reparar:', errOriginal.message);
      diagData = _tentarRepararJson(jsonStr);
      if (!diagData) {
        throw new Error('JSON inválido retornado pela IA: ' + errOriginal.message +
          '. A resposta provavelmente foi cortada por limite de tokens. Tente gerar novamente — se persistir, avise para reduzir o tamanho do prompt.');
      }
      truncado = true;
      console.warn('JSON reparado com sucesso (resposta foi truncada).');
    }

    // Armazena para o botão Memorial
    window._diagDataAtual = diagData;
    window._diagContextoAtual = {
      turma: clase.name,
      curso: cl.course?.name || '—',
      bimestre: bim,
      ano: yrDisplay,
      totalAlunos
    };

    setDiagStatus('✅ Diagnóstico concluído!',100);
    saveDiagResult(JSON.stringify(diagData));
    document.getElementById('diag-result').innerHTML =
      (truncado ? '<div style="background:#FFF8E1;border:1px solid #F9A825;color:#827717;padding:.7rem 1rem;border-radius:8px;font-size:.78rem;margin-bottom:1rem">⚠️ <strong>Diagnóstico parcial:</strong> a resposta da IA foi truncada por limite de tokens, mas conseguimos reparar e exibir o que foi gerado até o corte. Algumas seções finais (memorial, plano) podem estar incompletas. Se desejar a versão completa, clique em "Gerar Novo".</div>' : '') +
      _renderDiagJson(diagData, window._diagContextoAtual);
    setTimeout(_aplicarHeatmapsDiag, 0);

    // Mostrar botões pós-geração
    document.getElementById('diag-copy-btn').style.display='inline-flex';
    document.getElementById('diag-copy-btn').dataset.text = JSON.stringify(diagData, null, 2);
    const printBtn=document.getElementById('diag-print-btn');
    printBtn.style.display='inline-flex';
    printBtn.dataset.text = JSON.stringify(diagData);
    // Trocar "Gerar Diagnóstico" por "Gerar Novo"
    document.getElementById('diag-run-btn').style.display='none';
    document.getElementById('diag-new-btn').style.display='inline-flex';
    // Banner salvo
    const savedDate=new Date().toLocaleString('pt-BR');
    document.getElementById('diag-saved-date').textContent=savedDate;
    document.getElementById('diag-saved-banner').style.display='flex';
  }catch(e){
    clearInterval(_aiTimer);
    document.getElementById('diag-result').innerHTML=`<div style="color:#c62828;padding:1rem;background:#fff5f5;border-radius:8px">❌ Erro: ${e.message}</div>`;
    setDiagStatus('❌ Erro na geração',0);
  }
  btn.disabled=false;
}


function copyDiagResult(){
  const text=document.getElementById('diag-copy-btn')?.dataset.text||'';
  navigator.clipboard.writeText(text).then(()=>toast('✅ Copiado!','ok')).catch(()=>{});
}





