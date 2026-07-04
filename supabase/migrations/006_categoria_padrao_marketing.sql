-- =========================================================
-- Migração: considerar Marketing como categoria padrão
-- Rode se seu banco já existia com o padrão anterior (Utilidade).
-- =========================================================

-- Muda o valor padrão da coluna para novos templates criados a partir de agora
alter table public.modelos_mensagem
  alter column categoria_meta set default 'MARKETING';

-- Atualiza templates existentes que ainda não têm uma categoria confirmada
-- pela Meta (categoria_meta_aprovada) — não sobrescreve templates cuja
-- categoria já foi de fato aprovada como Utilidade ou Autenticação pela Meta.
update public.modelos_mensagem
set categoria_meta = 'MARKETING'
where categoria_meta_aprovada is null;
