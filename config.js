/*
 * TeIA · configuração da instalação
 * Banco: Supabase (projeto "teia" na organização IFMA Imperatriz - PASES).
 * A chave abaixo é a chave PÚBLICA (publishable). Ela só dá acesso às funções
 * do TeIA, que conferem login e sessão; as tabelas não ficam expostas.
 */
window.TEIA_CONFIG = {
  SUPABASE_URL: 'https://kfprrfmoauhokzveuelv.supabase.co',
  SUPABASE_KEY: 'sb_publishable_SB05cbf2pslsySaF2TXdAQ_DzO0oOzx',

  // Apps Script (Google Drive) para backup. Preenchido depois da implantação.
  APPS_SCRIPT_URL: '',

  VERSAO: '3.0.0'
};

// Teste local (servidor de teste na própria máquina): usa o servidor de teste.
if (['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('producao')) {
  window.TEIA_CONFIG.SUPABASE_URL = location.origin;
  window.TEIA_CONFIG.SUPABASE_KEY = 'teste-local';
}
