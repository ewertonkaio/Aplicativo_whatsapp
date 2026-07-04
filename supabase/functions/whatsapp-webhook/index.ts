// Supabase Edge Function: whatsapp-webhook
// Endpoint PÚBLICO (deploy com --no-verify-jwt) chamado diretamente pela Meta
// sempre que o status de uma mensagem muda: enviado -> entregue -> lido
// (ou falhou). É assim que conseguimos contar "visualizações" (= lido) no
// dashboard de campanhas, já que a API de envio não retorna isso sozinha.
//
// Configuração necessária no Meta for Developers (cada usuário faz isso 1x
// no próprio App): WhatsApp > Configuration > Webhook > Callback URL =
// a URL desta função; Verify Token = o mesmo valor salvo no secret
// WEBHOOK_VERIFY_TOKEN deste projeto Supabase; e inscrever o campo "messages".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WEBHOOK_VERIFY_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // 1) Handshake de verificação (GET) exigido pela Meta ao salvar o webhook
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Token de verificação inválido.", { status: 403 });
  }

  // 2) Notificações de status (POST) — id da mensagem + novo status
  if (req.method === "POST") {
    try {
      const payload = await req.json();

      const entradas = payload?.entry ?? [];
      for (const entrada of entradas) {
        const mudancas = entrada?.changes ?? [];
        for (const mudanca of mudancas) {
          const statuses = mudanca?.value?.statuses ?? [];
          for (const s of statuses) {
            await processarStatus(s);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // Sempre responde 200 pra Meta não ficar re-tentando indefinidamente
      // por payloads inesperados — só registramos o erro internamente.
      console.error("Erro processando webhook:", (err as Error).message);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Método não suportado.", { status: 405 });
});

async function processarStatus(s: Record<string, unknown>) {
  const wamid = s.id as string | undefined;
  const status = s.status as string | undefined; // sent | delivered | read | failed
  if (!wamid || !status) return;

  const agora = new Date().toISOString();

  const mapa: Record<string, Record<string, unknown>> = {
    sent: { status_entrega: "enviado" },
    delivered: { status_entrega: "entregue", entregue_em: agora },
    read: { status_entrega: "lido", lido_em: agora },
    failed: { status_entrega: "falhou_entrega" },
  };

  const atualizacao = mapa[status];
  if (!atualizacao) return;

  await supabase.from("logs_envio").update(atualizacao).eq("id_mensagem_whatsapp", wamid);
}
