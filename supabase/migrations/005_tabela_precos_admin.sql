-- =========================================================
-- Migração: tabela de preços central (só administrador)
-- Rode este script se seu banco já existia antes dessa funcionalidade.
-- =========================================================

alter table public.perfis
  add column if not exists is_admin boolean default false;

alter table public.logs_envio
  add column if not exists custo_meta numeric(10,4) default 0;

create table if not exists public.tabela_precos (
  id uuid primary key default gen_random_uuid(),

  categoria text not null check (categoria in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  pais text not null default 'BR',

  custo_meta numeric(10,4) not null,
  valor_cobranca numeric(10,4) not null,

  vigente_desde date not null default current_date,
  ativo boolean default true,

  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create unique index if not exists idx_tabela_precos_categoria_pais_vigencia
  on public.tabela_precos (categoria, pais, vigente_desde);

insert into public.tabela_precos (categoria, pais, custo_meta, valor_cobranca)
values
  ('MARKETING', 'BR', 0.3217, 0.4182),      -- 0.3217 + 30%
  ('UTILITY', 'BR', 0.0350, 0.0455),        -- 0.035 + 30%
  ('AUTHENTICATION', 'BR', 0.0350, 0.0455)  -- 0.035 + 30%
on conflict do nothing;

-- Se você já tinha rodado esta migração antes (com valor_cobranca = custo_meta,
-- sem margem), este update aplica 30% de margem retroativamente às faixas
-- que ainda estão "no zero a zero" (evita sobrescrever ajustes manuais que
-- você já tenha feito na tela Painel Admin).
update public.tabela_precos
set valor_cobranca = round(custo_meta * 1.30, 4)
where valor_cobranca = custo_meta;

alter table public.tabela_precos enable row level security;

drop policy if exists "tabela_precos_somente_admin" on public.tabela_precos;
create policy "tabela_precos_somente_admin" on public.tabela_precos
  for all
  using (exists (select 1 from public.perfis p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.perfis p where p.id = auth.uid() and p.is_admin = true));

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

-- Lembrete: promova seu usuário a administrador rodando (troque o uuid):
--   update public.perfis set is_admin = true where id = '<uuid-do-usuario>';
