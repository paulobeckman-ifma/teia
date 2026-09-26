// ══ API KEY — guardada no banco (Supabase), usada só pela função "ia" no servidor ══
const IA_PROXY_URL=(window.TEIA_CONFIG||{}).SUPABASE_URL+'/functions/v1/ia';
let _iaKeyConfigured=null; // cache do status

async function checkApiKeyStatus(){
  try{
    const d=await teiaApi('teia_ia_status');
    _iaKeyConfigured=d.configured||false;
    return d;
  }catch{_iaKeyConfigured=false;return{configured:false,hasToken:false};}
}

function getApiKey(){
  // Frontend não precisa da chave — só saber se está configurada
  // O proxy PHP usa a chave internamente
  return _iaKeyConfigured?'__proxy__':'';
}

async function saveApiKey(){
  if(!_isAdmin()){toast('Apenas administradores podem configurar a chave','err');return;}
  const keyVal=document.getElementById('ia-api-key-input')?.value.trim();
  const tokenVal=document.getElementById('ia-access-token-input')?.value.trim();
  if(!keyVal){toast('Cole a chave antes de salvar','err');return;}
  if(!keyVal.startsWith('sk-ant-')){toast('Chave inválida — deve começar com sk-ant-','err');return;}
  if(!tokenVal||tokenVal.length<4){toast('Defina uma senha de acesso (mín. 4 caracteres)','err');return;}
  try{
    const d=await teiaApi('teia_ia_savekey',{p_key:keyVal,p_access:tokenVal});
    if(d.error){toast('❌ '+d.error,'err');return;}
    toast('✅ Chave salva com segurança no servidor!','ok');
    _iaKeyConfigured=true;
    document.getElementById('ia-api-key-input').value='';
    document.getElementById('ia-access-token-input').value='';
    renderIAConfig();
  }catch(e){toast('Erro ao salvar: '+e.message,'err');}
}

async function clearApiKey(){
  if(!_isAdmin()){toast('Apenas administradores podem remover a chave','err');return;}
  const tokenVal=prompt('Digite a senha de acesso para confirmar a remoção:');
  if(!tokenVal)return;
  try{
    const d=await teiaApi('teia_ia_removekey',{p_access:tokenVal});
    if(d.error){toast('❌ '+d.error,'err');return;}
    toast('Chave removida','ok');
    _iaKeyConfigured=false;
    renderIAConfig();
  }catch(e){toast('Erro: '+e.message,'err');}
}

function toggleApiKeyVisibility(){
  const inp=document.getElementById('ia-api-key-input');
  if(inp)inp.type=inp.type==='password'?'text':'password';
}

async function renderIAConfig(){
  const panel=document.getElementById('cfg-ia');
  if(!panel)return;
  const status=await checkApiKeyStatus();
  const isAdmin=_isAdmin();

  if(isAdmin){
    panel.innerHTML=`
    <div class="card">
      <div class="ct">🤖 Inteligência Artificial — Chave API</div>
      <p style="font-size:.72rem;color:var(--g2);margin-bottom:.8rem;line-height:1.7">
        A chave fica <strong>armazenada no banco do servidor</strong>, em área protegida.<br>
        Nunca é enviada ao navegador — apenas o servidor a utiliza para chamar a Anthropic.<br>
        Todos os usuários podem gerar diagnósticos; ninguém vê a chave.
      </p>
      ${status.configured
        ?`<div style="background:#e8f5e9;border-radius:8px;padding:.7rem .9rem;margin-bottom:.8rem;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:.78rem;font-weight:700;color:#2e7d32">✅ Chave configurada no servidor</span>
            <button class="btn-d" style="font-size:.68rem;padding:.28rem .6rem" onclick="clearApiKey()">🗑 Remover</button>
          </div>`
        :`<div style="background:#fff3e0;border-radius:8px;padding:.7rem .9rem;margin-bottom:.8rem">
            <span style="font-size:.78rem;font-weight:700;color:#e65100">⚠️ Nenhuma chave configurada</span>
          </div>`}
      <div style="display:flex;flex-direction:column;gap:.5rem">
        <div>
          <label style="font-size:.68rem;font-weight:700;color:var(--g2);text-transform:uppercase;letter-spacing:.04em">
            ${status.configured?'Nova chave (para substituir)':'Chave API Anthropic'}
          </label>
          <div style="position:relative;margin-top:.25rem">
            <input type="password" id="ia-api-key-input" placeholder="sk-ant-api03-..." autocomplete="off"
              style="width:100%;padding:.45rem .75rem .45rem 2.1rem;border:1.5px solid var(--g5);border-radius:var(--rs);font-family:'IBM Plex Mono',monospace;font-size:.76rem;box-sizing:border-box">
            <span style="position:absolute;left:.6rem;top:50%;transform:translateY(-50%);font-size:.82rem;opacity:.45;pointer-events:none">🔑</span>
            <button onclick="toggleApiKeyVisibility()" style="position:absolute;right:.5rem;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:.85rem;opacity:.5">👁</button>
          </div>
        </div>
        <div>
          <label style="font-size:.68rem;font-weight:700;color:var(--g2);text-transform:uppercase;letter-spacing:.04em">
            ${status.hasToken?'Senha de acesso (definida na 1ª configuração)':'Criar senha de acesso'}
          </label>
          <input type="password" id="ia-access-token-input" placeholder="${status.hasToken?'Digite a senha para confirmar':'Crie uma senha (mín. 4 caracteres)'}" autocomplete="off"
            style="width:100%;margin-top:.25rem;padding:.45rem .75rem;border:1.5px solid var(--g5);border-radius:var(--rs);font-size:.78rem;box-sizing:border-box">
          <span style="font-size:.66rem;color:var(--g3);margin-top:.2rem;display:block">
            ${status.hasToken?'Necessária para alterar ou remover a chave.':'Esta senha protege a chave. Guarde-a com segurança.'}
          </span>
        </div>
        <button class="btn-p" style="align-self:flex-end;padding:.45rem 1.1rem;font-size:.78rem" onclick="saveApiKey()">
          💾 ${status.configured?'Substituir chave':'Salvar chave'}
        </button>
      </div>
    </div>
    <div class="card">
      <div class="ct">ℹ️ Como obter a chave</div>
      <ol style="font-size:.72rem;color:var(--g2);line-height:2;padding-left:1.2rem">
        <li>Acesse <strong>console.anthropic.com</strong></li>
        <li>Faça login ou crie uma conta</li>
        <li>Vá em <strong>API Keys → Create Key</strong></li>
        <li>Copie e cole acima</li>
      </ol>
    </div>`;
  } else {
    panel.innerHTML=`
    <div class="card">
      <div class="ct">🤖 Inteligência Artificial</div>
      <div style="padding:.5rem 0;font-size:.82rem">
        ${status.configured
          ?'<span style="color:#2e7d32;font-weight:700">✅ Diagnóstico IA disponível</span><br><span style="font-size:.72rem;color:var(--g2);margin-top:.35rem;display:block">A chave API está configurada pelo administrador. Use o botão <strong>🤖 Diagnóstico IA</strong> na página da turma.</span>'
          :'<span style="color:#c62828;font-weight:700">⚠️ Diagnóstico IA indisponível</span><br><span style="font-size:.72rem;color:var(--g2);margin-top:.35rem;display:block">Solicite ao administrador que configure a chave API Anthropic.</span>'}
      </div>
    </div>`;
  }
}


