// Supabase Edge Function: template-meta
// Chamada pelo FRONT-END (usa o token de login do próprio usuário, não a
// service_role), com duas ações possíveis no corpo da requisição:
//
//   { "modelo_id": "...", "action": "enviar" } -> submete o template para
//     aprovação na Meta (WhatsApp Message Templates API)
//
//   { "modelo_id": "...", "action": "status" } -> consulta na Meta o status
//     atual do template (pendente / aprovado / rejeitado) e atualiza o banco
//
// Como o cliente Supabase é criado com o JWT do próprio usuário (não a
// service_role), o RLS garante que ele só consegue enviar/consultar
// templates e credenciais que são dele mesmo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ erro: "Não autenticado." }, 401);

    // Cliente Supabase "como o usuário" — respeita RLS
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ erro: "Sessão inválida." }, 401);

    const { modelo_id, action } = await req.json();
    if (!modelo_id || !action) {
      return jsonResponse({ erro: "Parâmetros 'modelo_id' e 'action' são obrigatórios." }, 400);
    }

    const { data: modelo, error: modeloError } = await supabase
      .from("modelos_mensagem")
      .select("*")
      .eq("id", modelo_id)
      .single();
    if (modeloError || !modelo) return jsonResponse({ erro: "Template não encontrado." }, 404);

    const { data: perfil, error: perfilError } = await supabase
      .from("perfis")
      .select("whatsapp_id_conta_comercial, whatsapp_token_acesso")
      .eq("id", user.id)
      .single();
    if (perfilError || !perfil?.whatsapp_id_conta_comercial || !perfil?.whatsapp_token_acesso) {
      return jsonResponse(
        { erro: "Configure o WhatsApp Business Account ID e o token de acesso em Configurações." },
        400,
      );
    }

    if (action === "enviar") {
      return await enviarParaAprovacao(supabase, modelo, perfil);
    }
    if (action === "status") {
      return await consultarStatus(supabase, modelo, perfil);
    }
    return jsonResponse({ erro: "Ação inválida. Use 'enviar' ou 'status'." }, 400);
  } catch (err) {
    return jsonResponse({ erro: (err as Error).message }, 500);
  }
});

async function enviarParaAprovacao(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  modelo: any,
  // deno-lint-ignore no-explicit-any
  perfil: any,
) {
  if (!modelo.nome_modelo_meta) {
    return jsonResponse({ erro: "Preencha o 'nome do template na Meta' antes de enviar." }, 400);
  }
  if (!modelo.exemplo_variavel_1) {
    return jsonResponse(
      { erro: "Preencha um exemplo para {{1}} (ex: um nome fictício) — a Meta exige isso na submissão." },
      400,
    );
  }

  const url = `https://graph.facebook.com/v19.0/${perfil.whatsapp_id_conta_comercial}/message_templates`;

  const body = {
    name: modelo.nome_modelo_meta,
    language: modelo.idioma_modelo_meta || "pt_BR",
    category: modelo.categoria_meta || "MARKETING",
    components: [
      {
        type: "BODY",
        text: modelo.texto_visualizacao,
        example: {
          body_text: [[modelo.exemplo_variavel_1]],
        },
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${perfil.whatsapp_token_acesso}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    return jsonResponse(
      { erro: data?.error?.message || `Erro HTTP ${res.status} ao enviar para a Meta.` },
      400,
    );
  }

  await supabase
    .from("modelos_mensagem")
    .update({
      id_modelo_meta: data.id,
      status_aprovacao: "pendente",
      motivo_rejeicao: null,
      enviado_para_aprovacao_em: new Date().toISOString(),
    })
    .eq("id", modelo.id);

  return jsonResponse({ mensagem: "Template enviado para aprovação da Meta.", id_modelo_meta: data.id });
}

async function consultarStatus(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  modelo: any,
  // deno-lint-ignore no-explicit-any
  perfil: any,
) {
  if (!modelo.nome_modelo_meta) {
    return jsonResponse({ erro: "Este template ainda não tem nome configurado para a Meta." }, 400);
  }

  const url =
    `https://graph.facebook.com/v19.0/${perfil.whatsapp_id_conta_comercial}/message_templates` +
    `?name=${encodeURIComponent(modelo.nome_modelo_meta)}&fields=name,status,category,rejected_reason`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${perfil.whatsapp_token_acesso}` },
  });
  const data = await res.json();

  if (!res.ok) {
    return jsonResponse(
      { erro: data?.error?.message || `Erro HTTP ${res.status} ao consultar a Meta.` },
      400,
    );
  }

  const encontrado = data?.data?.[0];
  if (!encontrado) {
    return jsonResponse({ erro: "Template ainda não encontrado na Meta. Envie para aprovação primeiro." }, 404);
  }

  const mapaStatus: Record<string, string> = {
    APPROVED: "aprovado",
    PENDING: "pendente",
    REJECTED: "rejeitado",
  };
  const statusTraduzido = mapaStatus[encontrado.status] || "pendente";

  await supabase
    .from("modelos_mensagem")
    .update({
      status_aprovacao: statusTraduzido,
      categoria_meta_aprovada: encontrado.category ?? null,
      motivo_rejeicao: encontrado.rejected_reason ?? null,
      status_verificado_em: new Date().toISOString(),
    })
    .eq("id", modelo.id);

  return jsonResponse({
    status: statusTraduzido,
    categoria_aprovada: encontrado.category ?? null,
    motivo_rejeicao: encontrado.rejected_reason ?? null,
  });
}
