-- =========================================================
-- Migração: dashboard de campanhas (envios, visualizações, custo)
-- Rode este script se seu banco já existia antes dessa funcionalidade.
-- =========================================================

alter table public.perfis
  add column if not exists preco_marketing numeric(10,4) default 0.3217,
  add column if not exists preco_utilidade numeric(10,4) default 0.035,
  add column if not exists preco_autenticacao numeric(10,4) default 0.035;

alter table public.modelos_mensagem
  add column if not exists categoria_meta_aprovada text
    check (categoria_meta_aprovada in ('MARKETING', 'UTILITY', 'AUTHENTICATION'));

alter table public.logs_envio
  add column if not exists status_entrega text default 'enviado'
    check (status_entrega in ('enviado', 'entregue', 'lido', 'falhou_entrega')),
  add column if not exists entregue_em timestamptz,
  add column if not exists lido_em timestamptz,
  add column if not exists categoria_cobranca text
    check (categoria_cobranca in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  add column if not exists custo numeric(10,4) default 0;

create index if not exists idx_logs_id_mensagem_whatsapp on public.logs_envio(id_mensagem_whatsapp);

-- Preenche custo retroativo dos envios já existentes, usando a categoria
-- do template associado e o preço atual configurado no perfil (aproximação —
-- envios antigos não tinham essa informação registrada no momento do disparo).
update public.logs_envio le
set
  categoria_cobranca = coalesce(m.categoria_meta_aprovada, m.categoria_meta),
  custo = case coalesce(m.categoria_meta_aprovada, m.categoria_meta)
    when 'MARKETING' then p.preco_marketing
    when 'AUTHENTICATION' then p.preco_autenticacao
    else p.preco_utilidade
  end
from public.modelos_mensagem m, public.perfis p
where le.modelo_id = m.id
  and le.usuario_id = p.id
  and le.status = 'enviado'
  and le.categoria_cobranca is null;
