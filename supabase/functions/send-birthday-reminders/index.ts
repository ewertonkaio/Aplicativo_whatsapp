// Supabase Edge Function: send-birthday-reminders
// Roda 1x por dia (agendada via pg_cron, ver schema.sql), mas só dispara
// alguma coisa no DIA 1 de cada mês: nesse dia, busca TODOS os clientes
// que fazem aniversário naquele mês (independente do dia exato) e envia
// a mensagem para todos de uma vez, usando o modelo padrão de cada
// usuário e o número (Phone Number ID) cadastrado no perfil dele.
// Nos outros dias do mês a função não faz nada (retorna cedo).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buscarTabelaPrecos, categoriaDeCobranca, obterPreco } from "../_shared/custos.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface Cliente {
  id: string;
  usuario_id: string;
  nome: string;
  telefone: string;
  aniversario: string;
}

interface Perfil {
  id: string;
  whatsapp_id_numero_telefone: string | null;
  whatsapp_token_acesso: string | null;
}

interface ModeloMensagem {
  id: string;
  nome_modelo_meta: string | null;
  idioma_modelo_meta: string | null;
  categoria_meta: string | null;
  categoria_meta_aprovada: string | null;
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
        {
          type: "body",
          parameters: [{ type: "text", text: nomeCliente }],
        },
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
    const hoje = new Date();
    const mes = hoje.getMonth() + 1;
    const dia = hoje.getDate();

    // Essa função só dispara no primeiro dia do mês. Se rodar em outro
    // dia (ex: pg_cron chamando diariamente), simplesmente não faz nada.
    // Para forçar um envio manual fora do dia 1 (ex: teste), chame a
    // função passando ?force=1 na URL.
    const url = new URL(req.url);
    const forcar = url.searchParams.get("force") === "1";

    if (dia !== 1 && !forcar) {
      return new Response(
        JSON.stringify({ mensagem: "Hoje não é dia 1. Nada a fazer.", total: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // Busca clientes ativos cujo MÊS de aniversário é o mês atual
    // (todos os dias do mês, não só o dia 1)
    const { data: clientes, error: erroClientes } = await supabase
      .from("clientes")
      .select("id, usuario_id, nome, telefone, aniversario")
      .eq("ativo", true);

    if (erroClientes) throw erroClientes;

    const aniversariantesDoMes = (clientes as Cliente[] ?? []).filter((c) => {
      const d = new Date(c.aniversario + "T00:00:00");
      return d.getMonth() + 1 === mes;
    });

    if (aniversariantesDoMes.length === 0) {
      return new Response(
        JSON.stringify({ mensagem: "Nenhum aniversariante neste mês.", total: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const resultados: Record<string, unknown>[] = [];
    const tabelaPrecos = await buscarTabelaPrecos(supabase);

    // Agrupa por usuário para reaproveitar perfil/modelo
    const usuarioIds = [...new Set(aniversariantesDoMes.map((c) => c.usuario_id))];

    for (const usuarioId of usuarioIds) {
      const { data: perfil } = await supabase
        .from("perfis")
        .select("id, whatsapp_id_numero_telefone, whatsapp_token_acesso")
        .eq("id", usuarioId)
        .single<Perfil>();

      const { data: modelo } = await supabase
        .from("modelos_mensagem")
        .select("id, nome_modelo_meta, idioma_modelo_meta, categoria_meta, categoria_meta_aprovada")
        .eq("usuario_id", usuarioId)
        .eq("padrao", true)
        .single<ModeloMensagem>();

      const clientesDoUsuario = aniversariantesDoMes.filter((c) => c.usuario_id === usuarioId);

      // Evita reenvio se a função rodar mais de uma vez no mesmo mês
      // (ex: retry manual com ?force=1)
      const inicioDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
      const { data: jaEnviados } = await supabase
        .from("logs_envio")
        .select("cliente_id")
        .eq("usuario_id", usuarioId)
        .eq("status", "enviado")
        .gte("enviado_em", inicioDoMes);
      const idsJaEnviados = new Set((jaEnviados ?? []).map((l) => l.cliente_id));

      for (const cliente of clientesDoUsuario) {
        if (idsJaEnviados.has(cliente.id)) {
          resultados.push({ cliente: cliente.nome, status: "ignorado", motivo: "já enviado este mês" });
          continue;
        }

        if (!perfil?.whatsapp_id_numero_telefone || !perfil?.whatsapp_token_acesso) {
          await supabase.from("logs_envio").insert({
            usuario_id: usuarioId,
            cliente_id: cliente.id,
            modelo_id: modelo?.id ?? null,
            status: "falhou",
            mensagem_erro: "Credenciais do WhatsApp não configuradas no perfil.",
          });
          resultados.push({ cliente: cliente.nome, status: "falhou", motivo: "sem credenciais" });
          continue;
        }

        if (!modelo?.nome_modelo_meta) {
          await supabase.from("logs_envio").insert({
            usuario_id: usuarioId,
            cliente_id: cliente.id,
            modelo_id: modelo?.id ?? null,
            status: "falhou",
            mensagem_erro: "Nenhum modelo padrão aprovado configurado.",
          });
          resultados.push({ cliente: cliente.nome, status: "falhou", motivo: "sem modelo" });
          continue;
        }

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
            usuario_id: usuarioId,
            cliente_id: cliente.id,
            modelo_id: modelo.id,
            status: "enviado",
            id_mensagem_whatsapp: idMensagem,
            categoria_cobranca: categoria,
            custo: preco.valor_cobranca,
            custo_meta: preco.custo_meta,
          });

          resultados.push({ cliente: cliente.nome, status: "enviado" });
        } catch (err) {
          await supabase.from("logs_envio").insert({
            usuario_id: usuarioId,
            cliente_id: cliente.id,
            modelo_id: modelo.id,
            status: "falhou",
            mensagem_erro: (err as Error).message,
          });
          resultados.push({ cliente: cliente.nome, status: "falhou", motivo: (err as Error).message });
        }
      }
    }

    return new Response(JSON.stringify({ total: resultados.length, resultados }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ erro: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
