# TeIA · Tecnologia Escolar de Integração e Acompanhamento

IFMA Campus Imperatriz. Versão 3 (setembro de 2026): site estático no GitHub Pages, banco no Supabase e backup no Google Drive, no mesmo padrão do PASES Refeições.

## Estrutura

- `index.html`, `css/`, `assets/`: interface (igual à versão 2).
- `js/01-dados.js` a `js/14-backup.js`: código do sistema, separado por assunto. A ordem dos arquivos importa.
- `js/10-servidor.js`: comunicação com o Supabase. Substitui o antigo `api.php`, mantendo as mesmas funções (`phpGet`/`phpPost`) para o resto do código não mudar.
- `config.js`: endereço do Supabase (chave pública) e do Apps Script.
- `infra/schema.sql`: tabelas e funções do banco. Todas as tabelas têm RLS sem políticas; o acesso é só pelas funções, que conferem o token de sessão.
- `infra/ia/index.ts`: Edge Function `ia` (substitui o `ia_proxy.php`). Implantada com verificação de JWT desligada.
- `infra/apps-script/Code.gs`: backup semanal no Drive e consulta diária para o projeto gratuito não pausar.

## Senhas

As senhas ficam só na tabela `teia_usuarios` (bcrypt). Usuário novo nasce com senha igual ao login e troca no primeiro acesso. O admin pode resetar uma senha em Configurações > Usuários.

## Sistema anterior

A versão 2 (PHP + arquivos JSON) continua intacta no HostGator, acessível em teia1.concretta.org.
