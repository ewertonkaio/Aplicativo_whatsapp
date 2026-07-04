// Supabase Edge Function: send-campaigns
// Roda 1x por dia (agendada via pg_cron ou GitHub Actions). Busca todas as
// campanhas com status "agendada" cuja data_envio é hoje, envia a mensagem
// (usando o template escolhido) para o público definido (todos os clientes
// ativos ou uma lista selecionada) e marca a campanha como concluída.
//
// Independente do disparo automático de aniversário (send-birthday-reminders),
// que roda todo dia 1º do mês — esta função cuida de campanhas avulsas com
// data escolhida livremente pelo usuário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buscarTabelaPrecos, categoriaDeCobranca, obterPreco } from "../_shared/custos.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface Cliente {
  id: string;
  nome: string;
  telefone: string;
}

interface Perfil {
  whatsapp_id_numero_telefone: string | null;
  whatsapp_token_acesso: string | null;
}

interface Modelo {
  id: string;
  nome_modelo_meta: string | null;
  idioma_modelo_meta: string | null;
  categoria_meta: string | null;
  categoria_meta_aprovada: string | null;
  status_aprovacao: string;
}

interface Campanha {
  id: string;
  usuario_id: string;
  modelo_id: string;
  nome: string;
  publico: "todos" | "selecionados";
  clientes_ids: string[];
}

async function enviarModeloWhatsApp(
  idNumeroTelefone: string,
  tokenAcesso: string,
  telefoneDestino: string,
  nomeModelo: string,
  idiomaModelo: string,
  nomeCliente: string,
) {
  const url = `https://graph.facebook.com/v19.0/${idNumeroTelefone}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: telefoneDestino,
    type: "template",
    template: {
      name: nomeModelo,
      language: { code: idiomaModelo || "pt_BR" },
      components: [
        { type: "body", parameters: [{ type: "text", text: nomeCliente }] },
      ],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenAcesso}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Erro HTTP ${res.status}`);
  }
  return data?.messages?.[0]?.id as string | undefined;
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const forcarCampanhaId = url.searchParams.get("campanha_id"); // permite forçar 1 campanha específica p/ teste

    const hojeISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let consulta = supabase.from("campanhas").select("*").eq("status", "agendada");
    consulta = forcarCampanhaId ? consulta.eq("id", forcarCampanhaId) : consulta.eq("data_envio", hojeISO);

    const { data: campanhas, error: erroCampanhas } = await consulta;
    if (erroCampanhas) throw erroCampanhas;

    if (!campanhas || campanhas.length === 0) {
      return new Response(
        JSON.stringify({ mensagem: "Nenhuma campanha agendada para hoje.", total: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const resultadoGeral: Record<string, unknown>[] = [];
    const tabelaPrecos = await buscarTabelaPrecos(supabase);

    for (const campanha of campanhas as Campanha[]) {
      await supabase.from("campanhas").update({ status: "enviando" }).eq("id", campanha.id);

      const resultadosCampanha: Record<string, unknown>[] = [];
      let erroGeral: string | null = null;

      try {
        const { data: modelo, error: erroModelo } = await supabase
          .from("modelos_mensagem")
          .select("id, nome_modelo_meta, idioma_modelo_meta, categoria_meta, categoria_meta_aprovada, status_aprovacao")
          .eq("id", campanha.modelo_id)
          .single<Modelo>();
        if (erroModelo || !modelo) throw new Error("Template da campanha não encontrado.");
        if (!modelo.nome_modelo_meta) {
          throw new Error("O template dessa campanha não tem nome configurado na Meta.");
        }

        const { data: perfil, error: erroPerfil } = await supabase
          .from("perfis")
          .select("whatsapp_id_numero_telefone, whatsapp_token_acesso")
          .eq("id", campanha.usuario_id)
          .single<Perfil>();
        if (erroPerfil || !perfil?.whatsapp_id_numero_telefone || !perfil?.whatsapp_token_acesso) {
          throw new Error("Credenciais do WhatsApp não configuradas no perfil.");
        }

        // Monta a lista de clientes-alvo
        let clientesAlvo: Cliente[] = [];
        if (campanha.publico === "todos") {
          const { data } = await supabase
            .from("clientes")
            .select("id, nome, telefone")
            .eq("usuario_id", campanha.usuario_id)
            .eq("ativo", true);
          clientesAlvo = data ?? [];
        } else {
          const ids = campanha.clientes_ids ?? [];
          if (ids.length > 0) {
            const { data } = await supabase
              .from("clientes")
              .select("id, nome, telefone")
              .in("id", ids);
            clientesAlvo = data ?? [];
          }
        }

        for (const cliente of clientesAlvo) {
          try {
            const idMensagem = await enviarModeloWhatsApp(
              perfil.whatsapp_id_numero_telefone,
              perfil.whatsapp_token_acesso,
              cliente.telefone,
              modelo.nome_modelo_meta,
              modelo.idioma_modelo_meta ?? "pt_BR",
              cliente.nome,
            );

            const categoria = categoriaDeCobranca(modelo);
            const preco = obterPreco(tabelaPrecos, categoria);

            await supabase.from("logs_envio").insert({
              usuario_id: campanha.usuario_id,
              cliente_id: cliente.id,
              modelo_id: modelo.id,
              campanha_id: campanha.id,
              status: "enviado",
              id_mensagem_whatsapp: idMensagem,
              categoria_cobranca: categoria,
              custo: preco.valor_cobranca,
              custo_meta: preco.custo_meta,
            });
            resultadosCampanha.push({ cliente: cliente.nome, status: "enviado" });
          } catch (err) {
            await supabase.from("logs_envio").insert({
              usuario_id: campanha.usuario_id,
              cliente_id: cliente.id,
              modelo_id: modelo.id,
              campanha_id: campanha.id,
              status: "falhou",
              mensagem_erro: (err as Error).message,
            });
            resultadosCampanha.push({ cliente: cliente.nome, status: "falhou", motivo: (err as Error).message });
          }
        }
      } catch (err) {
        erroGeral = (err as Error).message;
      }

      await supabase
        .from("campanhas")
        .update({
          status: erroGeral ? "erro" : "concluida",
          mensagem_erro: erroGeral,
          processada_em: new Date().toISOString(),
        })
        .eq("id", campanha.id);

      resultadoGeral.push({
        campanha: campanha.nome,
        erro: erroGeral,
        total_clientes: resultadosCampanha.length,
        resultados: resultadosCampanha,
      });
    }

    return new Response(JSON.stringify({ total: resultadoGeral.length, resultados: resultadoGeral }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ erro: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
