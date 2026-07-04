-- =========================================================
-- Migração: campanhas avulsas com data de envio agendada
-- Rode este script se seu banco já tinha sido criado antes
-- dessa funcionalidade existir.
-- =========================================================

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  modelo_id uuid not null references public.modelos_mensagem(id) on delete restrict,

  nome text not null,
  data_envio date not null,
  publico text not null default 'todos' check (publico in ('todos', 'selecionados')),
  clientes_ids jsonb default '[]'::jsonb,

  status text not null default 'agendada'
    check (status in ('agendada', 'enviando', 'concluida', 'cancelada', 'erro')),
  mensagem_erro text,
  processada_em timestamptz,

  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_campanhas_usuario_id on public.campanhas(usuario_id);
create index if not exists idx_campanhas_data_envio on public.campanhas(data_envio);

alter table public.campanhas enable row level security;

drop policy if exists "campanhas_all_proprio" on public.campanhas;
create policy "campanhas_all_proprio" on public.campanhas
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

alter table public.logs_envio
  add column if not exists campanha_id uuid references public.campanhas(id) on delete set null;

create index if not exists idx_logs_campanha_id on public.logs_envio(campanha_id);
