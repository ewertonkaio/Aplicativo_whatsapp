-- =========================================================
-- Migração: aprovação automática de templates via API da Meta
-- Rode este script se você já tinha criado modelos_mensagem
-- com o schema.sql anterior (sem essas colunas).
-- =========================================================

alter table public.modelos_mensagem
  add column if not exists categoria_meta text default 'UTILITY'
    check (categoria_meta in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  add column if not exists exemplo_variavel_1 text,
  add column if not exists id_modelo_meta text,
  add column if not exists status_aprovacao text default 'nao_enviado'
    check (status_aprovacao in ('nao_enviado', 'pendente', 'aprovado', 'rejeitado')),
  add column if not exists motivo_rejeicao text,
  add column if not exists enviado_para_aprovacao_em timestamptz,
  add column if not exists status_verificado_em timestamptz;

-- Templates que já tinham um nome_modelo_meta preenchido manualmente
-- são marcados como "aprovado" (presume-se que já passaram pela Meta
-- manualmente, já que estavam sendo usados nos disparos).
update public.modelos_mensagem
set status_aprovacao = 'aprovado'
where nome_modelo_meta is not null and status_aprovacao = 'nao_enviado';
