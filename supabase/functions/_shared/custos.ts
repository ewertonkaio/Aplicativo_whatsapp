// Helper compartilhado entre as Edge Functions de disparo (aniversário e
// campanhas) para calcular o custo de cada mensagem enviada, usando a
// tabela central public.tabela_precos (controlada só pelo administrador)
// em vez de preços por usuário.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface Preco {
  custo_meta: number;
  valor_cobranca: number;
}

export function categoriaDeCobranca(modelo: {
  categoria_meta_aprovada?: string | null;
  categoria_meta?: string | null;
}): string {
  // Usa a categoria que a Meta de fato aprovou, se disponível — ela pode
  // divergir da categoria que o usuário selecionou ao criar o template.
  // Sem informação nenhuma, assume Marketing (é o padrão mais seguro/realista
  // para mensagens proativas como aniversário e campanhas avulsas).
  return modelo.categoria_meta_aprovada || modelo.categoria_meta || "MARKETING";
}

const PADRAO: Record<string, Preco> = {
  MARKETING: { custo_meta: 0.3217, valor_cobranca: 0.4182 },
  UTILITY: { custo_meta: 0.035, valor_cobranca: 0.0455 },
  AUTHENTICATION: { custo_meta: 0.035, valor_cobranca: 0.0455 },
};

/**
 * Busca a tabela de preços vigente (a mais recente por categoria) para um
 * país. Chamado 1x por execução da função de disparo, com o client
 * service_role (que ignora RLS e enxerga tabela_precos inteira).
 */
export async function buscarTabelaPrecos(
  supabase: SupabaseClient,
  pais = "BR",
): Promise<Record<string, Preco>> {
  const { data, error } = await supabase
    .from("tabela_precos")
    .select("categoria, custo_meta, valor_cobranca, vigente_desde")
    .eq("pais", pais)
    .eq("ativo", true)
    .order("vigente_desde", { ascending: false });

  if (error || !data || data.length === 0) return PADRAO;

  const mapa: Record<string, Preco> = {};
  for (const linha of data) {
    // já vem ordenado do mais recente pro mais antigo — mantém só a 1ª ocorrência por categoria
    if (!mapa[linha.categoria]) {
      mapa[linha.categoria] = {
        custo_meta: Number(linha.custo_meta),
        valor_cobranca: Number(linha.valor_cobranca),
      };
    }
  }
  return { ...PADRAO, ...mapa };
}

export function obterPreco(tabela: Record<string, Preco>, categoria: string): Preco {
  return tabela[categoria] || PADRAO.MARKETING;
}
