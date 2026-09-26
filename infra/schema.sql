-- ════════════════════════════════════════════════════════════════════════════
-- TeIA · banco no Supabase
-- Substitui o api.php e a pasta conselho_dados do HostGator.
--
-- Modelo (igual ao do sistema antigo, para o frontend continuar funcionando):
--   teia_core      → antigo banco.json (cursos, turmas, alunos, professores, usuários)
--   teia_patches   → antigo usuarios/<login>.json (avaliações e notas de turma de cada usuário)
--   teia_log       → antigo log.json
--   teia_usuarios  → senhas (bcrypt) ficam SÓ aqui, nunca dentro do núcleo
--
-- Segurança: todas as tabelas têm RLS ligado e nenhuma política, então a chave
-- pública não lê nada diretamente. Todo acesso passa pelas funções abaixo
-- (security definer), que conferem o token de sessão.
-- Rode este arquivo inteiro no SQL Editor. Pode ser executado de novo sem perder dados.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────── tabelas
create table if not exists public.teia_usuarios (
  username     text primary key,
  hash         text not null,
  must_change  boolean not null default true,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.teia_sessoes (
  token      text primary key,
  username   text not null references public.teia_usuarios(username) on delete cascade,
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null default now() + interval '30 days'
);
create index if not exists teia_sessoes_user on public.teia_sessoes(username);

create table if not exists public.teia_tentativas (
  username text not null,
  em       timestamptz not null default now()
);
create index if not exists teia_tentativas_user on public.teia_tentativas(username, em);

create table if not exists public.teia_core (
  id             int primary key default 1 check (id = 1),
  dados          jsonb not null default '{}'::jsonb,
  ts             timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.teia_patches (
  username text primary key,
  dados    jsonb not null default '{}'::jsonb,
  ts       timestamptz not null default now()
);

create table if not exists public.teia_log (
  id    int primary key default 1 check (id = 1),
  dados jsonb not null default '[]'::jsonb,
  ts    timestamptz not null default now()
);

create table if not exists public.teia_ia_config (
  id         int primary key default 1 check (id = 1),
  api_key    text,
  token_hash text,
  ts         timestamptz not null default now()
);

create table if not exists public.teia_backup (
  id            int primary key default 1 check (id = 1),
  segredo_hash  text,
  config        jsonb not null default '{}'::jsonb,
  ts            timestamptz not null default now()
);

create table if not exists public.teia_backups_feitos (
  id          bigserial primary key,
  em          timestamptz not null default now(),
  tipo        text,
  arquivo_url text,
  detalhe     text
);

alter table public.teia_usuarios       enable row level security;
alter table public.teia_sessoes        enable row level security;
alter table public.teia_tentativas     enable row level security;
alter table public.teia_core           enable row level security;
alter table public.teia_patches        enable row level security;
alter table public.teia_log            enable row level security;
alter table public.teia_ia_config      enable row level security;
alter table public.teia_backup         enable row level security;
alter table public.teia_backups_feitos enable row level security;

revoke all on public.teia_usuarios, public.teia_sessoes, public.teia_tentativas, public.teia_core,
  public.teia_patches, public.teia_log, public.teia_ia_config, public.teia_backup,
  public.teia_backups_feitos from anon, authenticated;

insert into public.teia_core(id) values (1) on conflict do nothing;
insert into public.teia_log(id) values (1) on conflict do nothing;
insert into public.teia_ia_config(id) values (1) on conflict do nothing;
insert into public.teia_backup(id) values (1) on conflict do nothing;

-- ─────────────────────────────────────────────────────────────── utilitários internos
create or replace function public._teia_hash(p text) returns text
language sql volatile set search_path = public, extensions as
$$ select extensions.crypt(p, extensions.gen_salt('bf', 10)) $$;

create or replace function public._teia_confere(p text, h text) returns boolean
language sql stable set search_path = public, extensions as
$$ select h is not null and extensions.crypt(p, h) = h $$;

-- Usuário do núcleo (objeto dentro de core.users) pelo login
create or replace function public._teia_user_core(p_user text) returns jsonb
language sql stable set search_path = public as
$$ select u from public.teia_core c, jsonb_array_elements(coalesce(c.dados->'users','[]'::jsonb)) u
   where lower(u->>'username') = lower(p_user) limit 1 $$;

-- Valida o token e devolve (username, role). Erro SESSAO_INVALIDA se não valer.
create or replace function public._teia_sessao(p_token text, out username text, out role text)
language plpgsql stable set search_path = public as
$$
declare u jsonb;
begin
  select s.username into username from public.teia_sessoes s
   where s.token = p_token and s.expira_em > now();
  if username is null then raise exception 'SESSAO_INVALIDA'; end if;
  u := public._teia_user_core(username);
  if u is null then raise exception 'SESSAO_INVALIDA'; end if;
  role := coalesce(u->>'role', 'user');
end $$;

-- Tira as senhas e marca quem ainda está com a senha provisória.
-- O frontend antigo mostra o selo "Padrão" quando password == username.
create or replace function public._teia_users_publicos(p_users jsonb, p_admin boolean) returns jsonb
language sql stable set search_path = public as
$$
  select coalesce(jsonb_agg(
           case when p_admin then
             (u - 'password') || jsonb_build_object('password',
                case when coalesce(t.must_change, true) then u->>'username' else '(alterada)' end)
           else (u - 'password') end
         ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_users,'[]'::jsonb)) u
  left join public.teia_usuarios t on t.username = lower(u->>'username')
$$;

-- Mescla o patch recebido no patch guardado, entrada por entrada:
--   studentAvaliacoes[aluno][ano][bim] e classBimestres[turma][bim].
-- Valor null é mantido (limpeza explícita), como no sistema antigo.
create or replace function public._teia_merge_patch(atual jsonb, novo jsonb) returns jsonb
language plpgsql immutable as
$$
declare
  res jsonb := coalesce(atual, '{}'::jsonb);
  sa jsonb := case when jsonb_typeof(res->'studentAvaliacoes') = 'object' then res->'studentAvaliacoes' else '{}'::jsonb end;
  cb jsonb := case when jsonb_typeof(res->'classBimestres') = 'object' then res->'classBimestres' else '{}'::jsonb end;
  sid text; yrs jsonb; yr text; bims jsonb; b text; v jsonb; clid text;
begin
  if jsonb_typeof(novo->'studentAvaliacoes') = 'object' then
    for sid, yrs in select * from jsonb_each(novo->'studentAvaliacoes') loop
      if jsonb_typeof(yrs) <> 'object' then continue; end if;
      if jsonb_typeof(sa->sid) is distinct from 'object' then sa := jsonb_set(sa, array[sid], '{}'::jsonb); end if;
      for yr, bims in select * from jsonb_each(yrs) loop
        if jsonb_typeof(bims) <> 'object' then continue; end if;
        if jsonb_typeof(sa->sid->yr) is distinct from 'object' then sa := jsonb_set(sa, array[sid, yr], '{}'::jsonb); end if;
        for b, v in select * from jsonb_each(bims) loop
          sa := jsonb_set(sa, array[sid, yr, b], v);
        end loop;
      end loop;
    end loop;
  end if;
  if jsonb_typeof(novo->'classBimestres') = 'object' then
    for clid, bims in select * from jsonb_each(novo->'classBimestres') loop
      if jsonb_typeof(bims) <> 'object' then continue; end if;
      if jsonb_typeof(cb->clid) is distinct from 'object' then cb := jsonb_set(cb, array[clid], '{}'::jsonb); end if;
      for b, v in select * from jsonb_each(bims) loop
        cb := jsonb_set(cb, array[clid, b], v);
      end loop;
    end loop;
  end if;
  return jsonb_build_object('studentAvaliacoes', sa, 'classBimestres', cb,
                            '_savedAt', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
end $$;

-- ─────────────────────────────────────────────────────────────── API pública (RPC)
create or replace function public.teia_status() returns jsonb
language sql stable as $$ select jsonb_build_object('ok', true, 'servidor', 'supabase', 'agora', now()) $$;

create or replace function public.teia_login(p_user text, p_pass text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  u text := lower(trim(coalesce(p_user,'')));
  t public.teia_usuarios; uc jsonb; tok text;
begin
  if (select count(*) from public.teia_tentativas where username = u and em > now() - interval '15 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'erro', 'Muitas tentativas incorretas. Aguarde 15 minutos.');
  end if;
  select * into t from public.teia_usuarios where username = u;
  uc := public._teia_user_core(u);
  if t.username is null or uc is null or not public._teia_confere(coalesce(p_pass,''), t.hash) then
    insert into public.teia_tentativas(username) values (u);
    return jsonb_build_object('ok', false, 'erro', 'Usuário ou senha inválidos.');
  end if;
  delete from public.teia_tentativas where username = u or em < now() - interval '1 day';
  delete from public.teia_sessoes where expira_em < now();
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.teia_sessoes(token, username) values (tok, u);
  return jsonb_build_object('ok', true, 'token', tok,
    'user', (uc - 'password') || jsonb_build_object('mustChangePassword', t.must_change));
end $$;

create or replace function public.teia_logout(p_token text) returns jsonb
language sql security definer set search_path = public as
$$ delete from public.teia_sessoes where token = p_token; select jsonb_build_object('ok', true) $$;

create or replace function public.teia_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; t public.teia_usuarios;
begin
  s := public._teia_sessao(p_token);
  select * into t from public.teia_usuarios where username = s.username;
  update public.teia_sessoes set expira_em = now() + interval '30 days' where token = p_token;
  return jsonb_build_object('ok', true,
    'user', (public._teia_user_core(s.username) - 'password') || jsonb_build_object('mustChangePassword', t.must_change));
end $$;

create or replace function public.teia_get_core(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; d jsonb;
begin
  s := public._teia_sessao(p_token);
  select dados into d from public.teia_core where id = 1;
  return d || jsonb_build_object('users', public._teia_users_publicos(d->'users', s.role = 'admin'));
end $$;

-- Só admin grava o núcleo. Sincroniza a lista de usuários com teia_usuarios:
-- login novo nasce com senha provisória = login (troca obrigatória no 1º acesso),
-- login removido perde o acesso (os lançamentos dele continuam guardados).
create or replace function public.teia_save_core(p_token text, p_core jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; users jsonb; u jsonb; nome text; admins int;
begin
  s := public._teia_sessao(p_token);
  if s.role <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'Apenas administradores gravam o núcleo.'); end if;
  if jsonb_typeof(p_core) <> 'object' or jsonb_typeof(p_core->'courses') <> 'array' or jsonb_typeof(p_core->'users') <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'Núcleo inválido.');
  end if;
  select coalesce(jsonb_agg((x - 'password') || jsonb_build_object('username', lower(x->>'username'))), '[]'::jsonb)
    into users from jsonb_array_elements(p_core->'users') x where coalesce(x->>'username','') <> '';
  select count(*) into admins from jsonb_array_elements(users) x where x->>'role' = 'admin';
  if admins = 0 then return jsonb_build_object('ok', false, 'erro', 'O sistema precisa de pelo menos um administrador.'); end if;
  if not exists (select 1 from jsonb_array_elements(users) x where x->>'username' = s.username and x->>'role' = 'admin') then
    return jsonb_build_object('ok', false, 'erro', 'Você não pode remover o seu próprio acesso de administrador.');
  end if;
  for u in select * from jsonb_array_elements(users) loop
    nome := u->>'username';
    insert into public.teia_usuarios(username, hash, must_change) values (nome, public._teia_hash(nome), true)
      on conflict (username) do nothing;
  end loop;
  delete from public.teia_usuarios t
   where not exists (select 1 from jsonb_array_elements(users) x where x->>'username' = t.username);
  update public.teia_core set dados = (p_core - 'users') || jsonb_build_object('users', users),
         ts = now(), atualizado_por = s.username where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.teia_list_user_patches(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  perform public._teia_sessao(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('user', username, 'ts', ts) order by username) from public.teia_patches), '[]'::jsonb);
end $$;

create or replace function public.teia_get_user_patch(p_token text, p_user text) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  perform public._teia_sessao(p_token);
  return coalesce((select dados from public.teia_patches where username = lower(p_user)), '{}'::jsonb);
end $$;

-- Busca vários patches de uma vez (menos requisições)
create or replace function public.teia_get_user_patches(p_token text, p_users text[]) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  perform public._teia_sessao(p_token);
  return coalesce((select jsonb_object_agg(username, jsonb_build_object('ts', ts, 'dados', dados))
                     from public.teia_patches where username = any(p_users)), '{}'::jsonb);
end $$;

-- Cada usuário grava o próprio patch; admin pode gravar em nome de outro.
create or replace function public.teia_save_user_patch(p_token text, p_user text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; alvo text := lower(coalesce(nullif(p_user,''), ''));
begin
  s := public._teia_sessao(p_token);
  if alvo = '' then alvo := s.username; end if;
  if alvo <> s.username and s.role <> 'admin' then
    return jsonb_build_object('ok', false, 'erro', 'Sem permissão para gravar os dados de outro usuário.');
  end if;
  if jsonb_typeof(p_patch) <> 'object' then return jsonb_build_object('ok', false, 'erro', 'Patch inválido.'); end if;
  insert into public.teia_patches(username, dados, ts) values (alvo, public._teia_merge_patch('{}'::jsonb, p_patch), now())
    on conflict (username) do update set dados = public._teia_merge_patch(public.teia_patches.dados, p_patch), ts = now();
  return jsonb_build_object('ok', true, 'ts', now());
end $$;

create or replace function public.teia_get_log(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  perform public._teia_sessao(p_token);
  return (select dados from public.teia_log where id = 1);
end $$;

create or replace function public.teia_save_log(p_token text, p_log jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; l jsonb;
begin
  s := public._teia_sessao(p_token);
  if jsonb_typeof(p_log) <> 'array' then return jsonb_build_object('ok', false, 'erro', 'Log inválido.'); end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into l from (select x from jsonb_array_elements(p_log) x limit 500) q;
  update public.teia_log set dados = l, ts = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Acrescenta uma entrada no topo do log sem precisar baixar o log inteiro
create or replace function public.teia_add_log(p_token text, p_entry jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record;
begin
  s := public._teia_sessao(p_token);
  update public.teia_log set dados = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select x from (select p_entry as x, 0 as o union all select e, 1 from jsonb_array_elements(dados) e) q order by o limit 500) q2),
    ts = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.teia_get_ts(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  perform public._teia_sessao(p_token);
  return jsonb_build_object(
    'banco_ts', (select extract(epoch from ts)::text from public.teia_core where id = 1),
    'log_ts',   (select extract(epoch from ts)::text from public.teia_log where id = 1),
    'users_ts', coalesce((select jsonb_object_agg(username, extract(epoch from ts)::text) from public.teia_patches), '{}'::jsonb));
end $$;

create or replace function public.teia_change_password(p_token text, p_current text, p_new text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; t public.teia_usuarios;
begin
  s := public._teia_sessao(p_token);
  select * into t from public.teia_usuarios where username = s.username;
  if not public._teia_confere(coalesce(p_current,''), t.hash) then
    return jsonb_build_object('ok', false, 'erro', 'Senha atual incorreta.');
  end if;
  if length(coalesce(p_new,'')) < 4 then return jsonb_build_object('ok', false, 'erro', 'Senha muito curta (mín. 4 caracteres).'); end if;
  if lower(p_new) = s.username then return jsonb_build_object('ok', false, 'erro', 'A senha não pode ser igual ao usuário.'); end if;
  update public.teia_usuarios set hash = public._teia_hash(p_new), must_change = false, atualizado_em = now()
   where username = s.username;
  delete from public.teia_sessoes where username = s.username and token <> p_token;
  return jsonb_build_object('ok', true);
end $$;

-- Admin devolve a senha de alguém para a provisória (= login), com troca obrigatória
create or replace function public.teia_reset_password(p_token text, p_user text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; alvo text := lower(coalesce(p_user,''));
begin
  s := public._teia_sessao(p_token);
  if s.role <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'Apenas administradores.'); end if;
  update public.teia_usuarios set hash = public._teia_hash(alvo), must_change = true, atualizado_em = now() where username = alvo;
  if not found then return jsonb_build_object('ok', false, 'erro', 'Usuário não encontrado.'); end if;
  delete from public.teia_sessoes where username = alvo;
  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────────── IA (chave da Anthropic)
create or replace function public.teia_ia_status(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  perform public._teia_sessao(p_token);
  return (select jsonb_build_object('configured', api_key is not null, 'hasToken', token_hash is not null)
            from public.teia_ia_config where id = 1);
end $$;

create or replace function public.teia_ia_savekey(p_token text, p_key text, p_access text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; c public.teia_ia_config;
begin
  s := public._teia_sessao(p_token);
  if s.role <> 'admin' then return jsonb_build_object('error', 'Apenas administradores.'); end if;
  if coalesce(p_key,'') !~ '^sk-ant-' then return jsonb_build_object('error', 'Chave inválida.'); end if;
  if length(coalesce(p_access,'')) < 4 then return jsonb_build_object('error', 'Senha de acesso muito curta.'); end if;
  select * into c from public.teia_ia_config where id = 1;
  if c.token_hash is not null and not public._teia_confere(p_access, c.token_hash) then
    return jsonb_build_object('error', 'Senha de acesso incorreta.');
  end if;
  update public.teia_ia_config set api_key = p_key,
         token_hash = coalesce(token_hash, public._teia_hash(p_access)), ts = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.teia_ia_removekey(p_token text, p_access text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; c public.teia_ia_config;
begin
  s := public._teia_sessao(p_token);
  if s.role <> 'admin' then return jsonb_build_object('error', 'Apenas administradores.'); end if;
  select * into c from public.teia_ia_config where id = 1;
  if c.token_hash is not null and not public._teia_confere(coalesce(p_access,''), c.token_hash) then
    return jsonb_build_object('error', 'Senha de acesso incorreta.');
  end if;
  update public.teia_ia_config set api_key = null, ts = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Só a Edge Function "ia" (service_role) chama esta: confere sessão + permissão e entrega a chave.
create or replace function public.teia_ia_chave(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record; u jsonb; k text;
begin
  s := public._teia_sessao(p_token);
  u := public._teia_user_core(s.username);
  if s.role <> 'admin' and coalesce((u->>'iaAccess')::boolean, false) = false then
    return jsonb_build_object('error', 'Seu usuário não tem acesso ao Diagnóstico IA.');
  end if;
  select api_key into k from public.teia_ia_config where id = 1;
  if k is null then return jsonb_build_object('error', 'Chave da IA não configurada.'); end if;
  return jsonb_build_object('key', k, 'user', s.username);
end $$;

-- ─────────────────────────────────────────────────────────────── Backup (Apps Script / Google Drive)
-- O admin, logado no TeIA, conecta o Apps Script: o script gera um segredo,
-- e esta função guarda só o hash dele. Depois o script usa o segredo para
-- baixar o dump semanal sem precisar de sessão de usuário.
create or replace function public.teia_backup_registrar(p_token text, p_segredo text, p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record;
begin
  s := public._teia_sessao(p_token);
  if s.role <> 'admin' then raise exception 'SEM_PERMISSAO'; end if;
  if length(coalesce(p_segredo,'')) < 32 then raise exception 'SEGREDO_CURTO'; end if;
  update public.teia_backup set segredo_hash = encode(extensions.digest(p_segredo, 'sha256'), 'hex'),
         config = coalesce(p_config, config), ts = now() where id = 1;
  return jsonb_build_object('ok', true, 'admin', s.username);
end $$;

create or replace function public._teia_backup_ok(p_segredo text) returns boolean
language sql stable set search_path = public, extensions as
$$ select exists (select 1 from public.teia_backup where id = 1 and segredo_hash is not null
                  and segredo_hash = encode(extensions.digest(coalesce(p_segredo,''), 'sha256'), 'hex')) $$;

create or replace function public.teia_backup_dump(p_segredo text) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  if not public._teia_backup_ok(p_segredo) then raise exception 'SEGREDO_INVALIDO'; end if;
  return jsonb_build_object(
    'sistema', 'TeIA', 'versao', 1, 'gerado_em', now(),
    'core', (select dados from public.teia_core where id = 1),
    'core_ts', (select ts from public.teia_core where id = 1),
    'patches', coalesce((select jsonb_object_agg(username, jsonb_build_object('ts', ts, 'dados', dados)) from public.teia_patches), '{}'::jsonb),
    'log', (select dados from public.teia_log where id = 1),
    'usuarios', coalesce((select jsonb_agg(jsonb_build_object('username', username, 'must_change', must_change)) from public.teia_usuarios), '[]'::jsonb));
end $$;

create or replace function public.teia_backup_anotar(p_segredo text, p_tipo text, p_url text, p_detalhe text) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  if not public._teia_backup_ok(p_segredo) then raise exception 'SEGREDO_INVALIDO'; end if;
  insert into public.teia_backups_feitos(tipo, arquivo_url, detalhe) values (p_tipo, p_url, p_detalhe);
  delete from public.teia_backups_feitos where em < now() - interval '2 years';
  return jsonb_build_object('ok', true);
end $$;

-- Consulta leve diária feita pelo Apps Script para o projeto gratuito não pausar por inatividade
create or replace function public.teia_ping(p_segredo text) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  if not public._teia_backup_ok(p_segredo) then raise exception 'SEGREDO_INVALIDO'; end if;
  return jsonb_build_object('ok', true, 'agora', now(), 'alunos_core_bytes', (select pg_column_size(dados) from public.teia_core where id = 1));
end $$;

create or replace function public.teia_backup_info(p_token text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare s record;
begin
  s := public._teia_sessao(p_token);
  if s.role <> 'admin' then raise exception 'SEM_PERMISSAO'; end if;
  return jsonb_build_object(
    'conectado', (select segredo_hash is not null from public.teia_backup where id = 1),
    'config', (select config from public.teia_backup where id = 1),
    'ultimos', coalesce((select jsonb_agg(b order by b.em desc) from (select em, tipo, arquivo_url, detalhe from public.teia_backups_feitos order by em desc limit 20) b), '[]'::jsonb));
end $$;

-- ─────────────────────────────────────────────────────────────── Migração inicial (uma vez só)
-- Usada pelo script de migração, rodando no navegador do admin, para carregar
-- os dados do HostGator. Exige a chave de migração abaixo e se desliga sozinha
-- depois do primeiro uso bem-sucedido.
create table if not exists public.teia_migracao (id int primary key default 1 check (id = 1), chave_hash text, usada_em timestamptz);
alter table public.teia_migracao enable row level security;
revoke all on public.teia_migracao from anon, authenticated;

create or replace function public.teia_migrar(p_chave text, p_core jsonb, p_patches jsonb, p_log jsonb, p_admins text[]) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare m public.teia_migracao; users jsonb; u jsonb; nome text; k text; v jsonb; n_users int := 0; n_patches int := 0;
begin
  select * into m from public.teia_migracao where id = 1;
  if m.chave_hash is null or m.usada_em is not null
     or m.chave_hash <> encode(extensions.digest(coalesce(p_chave,''), 'sha256'), 'hex') then
    raise exception 'MIGRACAO_NAO_AUTORIZADA';
  end if;
  select coalesce(jsonb_agg((x - 'password') || jsonb_build_object('username', lower(x->>'username'))), '[]'::jsonb)
    into users from jsonb_array_elements(coalesce(p_core->'users','[]'::jsonb)) x where coalesce(x->>'username','') <> '';
  update public.teia_core set dados = (p_core - 'users') || jsonb_build_object('users', users), ts = now(), atualizado_por = 'migracao' where id = 1;
  for u in select * from jsonb_array_elements(users) loop
    nome := u->>'username';
    insert into public.teia_usuarios(username, hash, must_change) values (nome, public._teia_hash(nome), true)
      on conflict (username) do update set hash = excluded.hash, must_change = true, atualizado_em = now();
    n_users := n_users + 1;
  end loop;
  delete from public.teia_patches where true;
  for k, v in select * from jsonb_each(coalesce(p_patches,'{}'::jsonb)) loop
    insert into public.teia_patches(username, dados, ts)
      values (lower(k), v - '_ts', coalesce(to_timestamp((v->>'_ts')::double precision), now()));
    n_patches := n_patches + 1;
  end loop;
  update public.teia_log set dados = coalesce(p_log, '[]'::jsonb), ts = now() where id = 1;
  update public.teia_migracao set usada_em = now() where id = 1;
  return jsonb_build_object('ok', true, 'usuarios', n_users, 'patches', n_patches,
    'core_bytes', pg_column_size(p_core), 'patches_bytes', pg_column_size(p_patches));
end $$;

-- ─────────────────────────────────────────────────────────────── permissões das funções
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.teia_status(), public.teia_login(text,text), public.teia_logout(text), public.teia_me(text),
  public.teia_get_core(text), public.teia_save_core(text,jsonb),
  public.teia_list_user_patches(text), public.teia_get_user_patch(text,text), public.teia_get_user_patches(text,text[]),
  public.teia_save_user_patch(text,text,jsonb),
  public.teia_get_log(text), public.teia_save_log(text,jsonb), public.teia_add_log(text,jsonb), public.teia_get_ts(text),
  public.teia_change_password(text,text,text), public.teia_reset_password(text,text),
  public.teia_ia_status(text), public.teia_ia_savekey(text,text,text), public.teia_ia_removekey(text,text),
  public.teia_backup_registrar(text,text,jsonb), public.teia_backup_dump(text), public.teia_backup_anotar(text,text,text,text),
  public.teia_ping(text), public.teia_backup_info(text), public.teia_migrar(text,jsonb,jsonb,jsonb,text[])
to anon, authenticated;
-- teia_ia_chave fica só para a service_role (Edge Function)
grant execute on function public.teia_ia_chave(text) to service_role;
