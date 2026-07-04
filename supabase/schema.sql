-- =========================================================
-- Sistema de Lembrete de Aniversário via WhatsApp
-- Schema Supabase (Postgres) — tabelas e campos em português
-- =========================================================

-- ---------------------------------------------------------
-- 1. PERFIS (public.perfis)
-- Extensão da tabela auth.users do Supabase.
-- Guarda as credenciais da WhatsApp Cloud API de cada usuário
-- (cada conta dispara pelo seu próprio número).
-- ---------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome_completo text,
  nome_empresa text,

  -- Credenciais WhatsApp Cloud API (Meta)
  whatsapp_id_numero_telefone text,     -- Phone Number ID (Meta)
  whatsapp_id_conta_comercial text,     -- WABA ID (Meta)
  whatsapp_token_acesso text,           -- Token permanente (system user)
  whatsapp_numero_exibicao text,        -- número em formato legível, só p/ exibição

  fuso_horario text default 'America/Sao_Paulo',
  hora_envio smallint default 9 check (hora_envio between 0 and 23), -- horário do disparo diário

  is_admin boolean default false, -- só administradores enxergam/editam public.tabela_precos

  -- OBSOLETO: preço editável pelo próprio usuário. Substituído pela tabela
  -- central public.tabela_precos, controlada só pelo administrador. Mantido
  -- aqui só por compatibilidade com bancos antigos; não é mais usado no cálculo.
  preco_marketing numeric(10,4) default 0.3217,
  preco_utilidade numeric(10,4) default 0.035,
  preco_autenticacao numeric(10,4) default 0.035,

  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ---------------------------------------------------------
-- 2. CLIENTES (public.clientes)
-- Lista de clientes de cada usuário, com data de aniversário.
-- ---------------------------------------------------------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,

  nome text not null,
  telefone text not null,        -- formato E.164, ex: 5511999998888
  aniversario date not null,     -- ano pode ser fictício se não souber, só mês/dia importam
  vencimento_plano date,         -- data de vencimento do plano/contrato do cliente (opcional)
  observacoes text,
  ativo boolean default true,

  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_clientes_usuario_id on public.clientes(usuario_id);
create index if not exists idx_clientes_aniversario_mes_dia
  on public.clientes (extract(month from aniversario), extract(day from aniversario));
create index if not exists idx_clientes_vencimento_plano on public.clientes(vencimento_plano);

-- ---------------------------------------------------------
-- 3. MODELOS DE MENSAGEM (public.modelos_mensagem)
-- Campo aberto de criação de mensagem. Importante: para enviar
-- mensagem "iniciada pela empresa" (fora da janela de 24h de
-- conversa) a Meta EXIGE um Message Template pré-aprovado.
-- Por isso guardamos:
--   - texto_visualizacao: o texto livre que o usuário escreve/edita aqui
--   - nome_modelo_meta: o nome exato do template já aprovado no
--     WhatsApp Manager, que deve usar as mesmas variáveis
-- ---------------------------------------------------------
create table if not exists public.modelos_mensagem (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,

  nome text not null,                    -- nome interno, ex: "Aniversário padrão"
  texto_visualizacao text not null,      -- texto livre, ex: "Olá {{1}}, feliz aniversário! ..."
  nome_modelo_meta text,                 -- nome do template aprovado na Meta (obrigatório p/ envio real)
  idioma_modelo_meta text default 'pt_BR',
  categoria_meta text default 'MARKETING' check (categoria_meta in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  exemplo_variavel_1 text,               -- valor de exemplo p/ {{1}}, exigido pela Meta na submissão (ex: "Maria")
  variaveis jsonb default '[]'::jsonb,   -- ex: ["nome_cliente"]
  padrao boolean default false,          -- se é o modelo padrão usado no disparo automático

  -- Controle de aprovação automática do template na Meta
  id_modelo_meta text,                   -- ID retornado pela Meta ao submeter o template
  status_aprovacao text default 'nao_enviado'
    check (status_aprovacao in ('nao_enviado', 'pendente', 'aprovado', 'rejeitado')),
  categoria_meta_aprovada text check (categoria_meta_aprovada in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
    -- categoria que a Meta de fato aprovou (pode ser diferente da solicitada em categoria_meta)
  motivo_rejeicao text,
  enviado_para_aprovacao_em timestamptz,
  status_verificado_em timestamptz,

  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_modelos_usuario_id on public.modelos_mensagem(usuario_id);

-- ---------------------------------------------------------
-- 4. CAMPANHAS (public.campanhas)
-- Campanhas avulsas com data de envio escolhida pelo usuário
-- (além do disparo automático de aniversário do mês). Cada
-- campanha usa um template já cadastrado e pode mirar todos os
-- clientes ativos ou uma lista específica.
-- ---------------------------------------------------------
create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  modelo_id uuid not null references public.modelos_mensagem(id) on delete restrict,

  nome text not null,                 -- nome interno da campanha, ex: "Promoção Dia das Mães"
  data_envio date not null,           -- dia em que a campanha deve ser disparada
  publico text not null default 'todos' check (publico in ('todos', 'selecionados')),
  clientes_ids jsonb default '[]'::jsonb, -- usado quando publico = 'selecionados'

  status text not null default 'agendada'
    check (status in ('agendada', 'enviando', 'concluida', 'cancelada', 'erro')),
  mensagem_erro text,
  processada_em timestamptz,

  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_campanhas_usuario_id on public.campanhas(usuario_id);
create index if not exists idx_campanhas_data_envio on public.campanhas(data_envio);

-- ---------------------------------------------------------
-- 5. LOGS DE ENVIO (public.logs_envio)
-- Histórico de disparos (sucesso/erro) para auditoria — tanto
-- do disparo automático de aniversário quanto das campanhas.
-- ---------------------------------------------------------
create table if not exists public.logs_envio (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  modelo_id uuid references public.modelos_mensagem(id) on delete set null,
  campanha_id uuid references public.campanhas(id) on delete set null, -- nulo = disparo de aniversário

  status text not null check (status in ('enviado', 'falhou', 'ignorado')),
  id_mensagem_whatsapp text,
  mensagem_erro text,

  -- Confirmação de entrega/leitura, atualizada pelo webhook da Meta
  status_entrega text default 'enviado'
    check (status_entrega in ('enviado', 'entregue', 'lido', 'falhou_entrega')),
  entregue_em timestamptz,
  lido_em timestamptz,

  -- Snapshot da categoria/custo no momento do envio (mantém o histórico
  -- correto mesmo que o template mude de categoria ou o preço seja atualizado depois)
  categoria_cobranca text check (categoria_cobranca in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  custo numeric(10,4) default 0,        -- valor cobrado do cliente (público, visível pro usuário)
  custo_meta numeric(10,4) default 0,   -- custo real pago à Meta (interno, só o admin vê)

  enviado_em timestamptz default now()
);

create index if not exists idx_logs_usuario_id on public.logs_envio(usuario_id);
create index if not exists idx_logs_enviado_em on public.logs_envio(enviado_em);
create index if not exists idx_logs_campanha_id on public.logs_envio(campanha_id);
create index if not exists idx_logs_id_mensagem_whatsapp on public.logs_envio(id_mensagem_whatsapp);

-- ---------------------------------------------------------
-- 6. TABELA DE PREÇOS (public.tabela_precos) — SÓ ADMINISTRADOR
-- Tabela central e oculta dos usuários comuns. Guarda, por categoria
-- de template e país, quanto a Meta cobra de fato (custo_meta) e
-- quanto o sistema cobra do cliente final (valor_cobranca) — ou seja,
-- é aqui que a margem/markup é definida. Só quem tem perfis.is_admin
-- = true consegue ler ou editar essa tabela diretamente.
-- ---------------------------------------------------------
create table if not exists public.tabela_precos (
  id uuid primary key default gen_random_uuid(),

  categoria text not null check (categoria in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  pais text not null default 'BR',       -- código do país (ex: BR, US)

  custo_meta numeric(10,4) not null,     -- o que a Meta cobra por mensagem nessa categoria/país
  valor_cobranca numeric(10,4) not null, -- o que é cobrado do cliente final (com markup)

  vigente_desde date not null default current_date,
  ativo boolean default true,

  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create unique index if not exists idx_tabela_precos_categoria_pais_vigencia
  on public.tabela_precos (categoria, pais, vigente_desde);

-- Preços iniciais sugeridos (Brasil, tabela da Meta em vigor), já com
-- 30% de margem embutida em valor_cobranca. Ajuste livremente depois
-- pela tela "Painel Admin".
insert into public.tabela_precos (categoria, pais, custo_meta, valor_cobranca)
values
  ('MARKETING', 'BR', 0.3217, 0.4182),      -- 0.3217 + 30%
  ('UTILITY', 'BR', 0.0350, 0.0455),        -- 0.035 + 30%
  ('AUTHENTICATION', 'BR', 0.0350, 0.0455)  -- 0.035 + 30%
on conflict do nothing;

-- =========================================================
-- ROW LEVEL SECURITY
-- Cada usuário só enxerga e edita seus próprios dados.
-- =========================================================
alter table public.perfis enable row level security;
alter table public.clientes enable row level security;
alter table public.modelos_mensagem enable row level security;
alter table public.campanhas enable row level security;
alter table public.logs_envio enable row level security;
alter table public.tabela_precos enable row level security;

create policy "perfis_select_proprio" on public.perfis
  for select using (auth.uid() = id);
create policy "perfis_update_proprio" on public.perfis
  for update using (auth.uid() = id);
create policy "perfis_insert_proprio" on public.perfis
  for insert with check (auth.uid() = id);

create policy "clientes_all_proprio" on public.clientes
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create policy "modelos_all_proprio" on public.modelos_mensagem
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create policy "campanhas_all_proprio" on public.campanhas
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create policy "logs_select_proprio" on public.logs_envio
  for select using (auth.uid() = usuario_id);
-- inserts em logs_envio são feitos pela Edge Function com service_role,
-- que ignora RLS, então não precisa de policy de insert para usuários comuns.

-- Só quem tem perfis.is_admin = true consegue ler/editar a tabela de preços.
-- Usuários comuns não têm NENHUM acesso direto — nem leitura.
create policy "tabela_precos_somente_admin" on public.tabela_precos
  for all
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.perfis p where p.id = auth.uid() and p.is_admin = true));

-- =========================================================
-- Função pública (SECURITY DEFINER): permite que QUALQUER usuário logado
-- veja apenas o "valor_cobranca" (o preço que ele paga), sem nunca expor
-- custo_meta nem o restante da tabela_precos. É assim que o app mostra
-- o custo estimado de uma campanha sem dar acesso à tabela em si.
-- =========================================================
create or replace function public.obter_precos_publicos(p_pais text default 'BR')
returns table(categoria text, valor_cobranca numeric)
language sql
security definer
set search_path = public
as $$
  select distinct on (categoria) categoria, valor_cobranca
  from public.tabela_precos
  where pais = p_pais and ativo = true
  order by categoria, vigente_desde desc;
$$;

grant execute on function public.obter_precos_publicos(text) to authenticated;

-- =========================================================
-- Trigger: cria o perfil automaticamente quando um usuário se cadastra
-- =========================================================
create or replace function public.criar_perfil_novo_usuario()
returns trigger as $$
begin
  insert into public.perfis (id, nome_completo)
  values (new.id, new.raw_user_meta_data->>'nome_completo');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- =========================================================
-- Agenda diária: chama a Edge Function todo dia às 09:00 (ajuste
-- o horário/UTC conforme necessário). A própria função só executa
-- o disparo de fato no dia 1º de cada mês. Requer as extensões
-- pg_cron e pg_net habilitadas no painel Supabase
-- (Database > Extensions). Troque <PROJECT_REF> e <SERVICE_ROLE_KEY>
-- pelos valores reais.
-- =========================================================
-- select cron.schedule(
--   'disparo-aniversarios-diario',
--   '0 12 * * *', -- 12:00 UTC = 09:00 BRT
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-birthday-reminders',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     )
--   );
--   $$
-- );
--
-- select cron.schedule(
--   'disparo-campanhas-diario',
--   '5 12 * * *', -- 12:05 UTC = 09:05 BRT (alguns minutos depois, sem sobrepor)
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-campaigns',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     )
--   );
--   $$
-- );

-- =========================================================
-- Webhook de status (entregue/lido): NÃO usa cron — é a própria Meta
-- que chama a Edge Function `whatsapp-webhook` em tempo real sempre que
-- uma mensagem muda de status. Configure a URL dela em:
-- Meta for Developers > seu App > WhatsApp > Configuration > Webhook.
-- Veja o passo a passo completo no README.
-- =========================================================

-- =========================================================
-- Como promover o primeiro administrador (faça isso 1x, manualmente,
-- direto no SQL Editor do Supabase — não existe tela no app para isso,
-- de propósito, por segurança):
--
--   update public.perfis set is_admin = true where id = '<uuid-do-usuario>';
--
-- Você encontra o uuid em Authentication > Users no painel do Supabase.
-- =========================================================
