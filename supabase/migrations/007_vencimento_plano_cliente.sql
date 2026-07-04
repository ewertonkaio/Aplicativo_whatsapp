-- =========================================================
-- Migração: data de vencimento do plano por cliente
-- Rode se seu banco já existia antes dessa funcionalidade.
-- =========================================================

alter table public.clientes
  add column if not exists vencimento_plano date;

create index if not exists idx_clientes_vencimento_plano on public.clientes(vencimento_plano);
