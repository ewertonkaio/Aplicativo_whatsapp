# Aniversário Cliente — Lembretes via WhatsApp

Sistema multiusuário: cada pessoa cria uma conta, cadastra seus clientes e datas
de aniversário, escreve seu próprio template de mensagem, e todo **dia 1º de cada mês**
o sistema dispara a mensagem para **todos os clientes que fazem aniversário naquele mês**
(não espera o dia exato), pelo **número de WhatsApp do próprio usuário** (WhatsApp Business
Cloud API da Meta), permitindo que os clientes respondam normalmente.

## Como funciona

```
Usuário (login) ──> cadastra clientes + aniversários + template
                          │
                          ▼
        Supabase (Postgres + Auth + RLS)
                          │
        todo dia 1º do mês, às 09h (cron)
                          ▼
     Edge Function "send-birthday-reminders"
     (pega TODOS os aniversariantes do mês)
                          │
                          ▼
        WhatsApp Cloud API (Meta) — usando o
        Phone Number ID e token do PRÓPRIO usuário
                          │
                          ▼
              Cliente recebe a mensagem
           e pode responder no WhatsApp normal
```

## Estrutura do repositório

```
supabase/
  schema.sql                          -> tabelas + RLS + trigger, rode no SQL Editor (instalação nova)
  migrations/                         -> scripts incrementais para bancos já existentes
  functions/send-birthday-reminders/  -> Edge Function (Deno) que dispara as mensagens do mês
  functions/send-campaigns/           -> Edge Function que dispara campanhas agendadas
  functions/template-meta/            -> Edge Function que envia/consulta templates na API da Meta
  functions/whatsapp-webhook/         -> Edge Function PÚBLICA que recebe status de entrega/leitura da Meta
  functions/_shared/custos.ts         -> helper de cálculo de custo por categoria, usado pelos disparos
web/                                  -> app React (Vite) publicado no Netlify
.github/workflows/disparo-diario.yml  -> alternativa via GitHub Actions para chamar as funções todo dia
netlify.toml                          -> configuração de build do Netlify
```

---

## 1. Configurar o WhatsApp Cloud API (Meta) — feito 1x por cada usuário

Isso precisa ser feito por **cada usuário** que for usar o próprio número:

1. Criar um app em [developers.facebook.com](https://developers.facebook.com) → tipo "Business".
2. Adicionar o produto **WhatsApp** ao app.
3. Em **WhatsApp → API Setup**, anotar:
   - `Phone Number ID`
   - `WhatsApp Business Account ID`
4. Gerar um **token de acesso permanente**: Business Settings → Usuários do sistema →
   criar um usuário do sistema → gerar token com permissão `whatsapp_business_messaging`
   (o token temporário de 24h que aparece por padrão na tela do app **não serve** para produção).
5. Em **WhatsApp Manager → Modelos de mensagem**, você tem duas opções para criar o template
   de aniversário:
   - **Manual**: crie direto no WhatsApp Manager (nome, categoria, corpo com `{{1}}`, exemplo).
   - **Pelo próprio app**: cadastre o texto na tela "Templates", preencha nome/categoria/idioma/
     exemplo, e clique em "Enviar para aprovação" — isso chama a Edge Function `template-meta`,
     que submete pela API da Meta sem precisar abrir o WhatsApp Manager. A aprovação em si (de
     minutos a ~1 dia útil) é sempre feita pela Meta; use "Verificar status" para atualizar.
6. Anexar o número de WhatsApp real do usuário ao app (pode ser o número pessoal/comercial dele,
   desde que ainda não esteja em uso no app do WhatsApp normal ao mesmo tempo — a Meta migra
   o número para a Cloud API).

Sem um template aprovado, a Edge Function `send-birthday-reminders` não consegue enviar (a Meta
bloqueia mensagens "iniciadas pela empresa" sem template aprovado).

## 2. Criar o projeto no Supabase

1. Criar projeto em [supabase.com](https://supabase.com).
2. Abrir **SQL Editor** e rodar todo o conteúdo de `supabase/schema.sql` (instalação nova) —
   ou, se o banco já existia com o schema anterior, rode os arquivos em `supabase/migrations/`
   em ordem.
3. Em **Authentication → Providers**, deixar Email habilitado (já vem por padrão).
4. Anotar em **Project Settings → API**:
   - `Project URL`
   - `anon public key`
   - `service_role key` (fica só no GitHub Actions/servidor, nunca no front-end)

## 3. Deploy das Edge Functions

Com a [Supabase CLI](https://supabase.com/docs/guides/cli) instalada:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy send-birthday-reminders
supabase functions deploy send-campaigns
supabase functions deploy template-meta

# whatsapp-webhook é chamada pela própria Meta, sem JWT do Supabase — precisa
# do --no-verify-jwt. Antes, defina um token secreto qualquer (você escolhe):
supabase secrets set WEBHOOK_VERIFY_TOKEN=escolha-uma-string-secreta-aqui
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

Todas usam `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, que a própria
Supabase já injeta automaticamente nas Edge Functions — não precisa configurar nada extra ali.
A `template-meta` é chamada diretamente pelo front-end (com o login do usuário); `send-birthday-reminders`
(todo dia 1º) e `send-campaigns` (campanhas com data escolhida) são chamadas pelo cron; e a
`whatsapp-webhook` é chamada pela própria Meta em tempo real — veja a configuração abaixo.

### Configurar o webhook de status (entregue/lido) — necessário para o dashboard

Sem isso, o sistema sabe que a mensagem foi **enviada**, mas não sabe se foi **entregue** ou
**visualizada** (lida) — essa informação só chega via webhook, em tempo real. Cada usuário
configura isso 1x no próprio App da Meta:

1. Em **developers.facebook.com** → seu App → **WhatsApp → Configuration**.
2. Em "Webhook", clique em editar e informe:
   - **Callback URL**: `https://SEU_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook`
   - **Verify Token**: o mesmo valor que você definiu em `WEBHOOK_VERIFY_TOKEN` (passo acima)
3. Clique em "Verify and Save" — a Meta faz uma chamada de verificação na hora.
4. Em "Webhook fields", clique em **Manage** e inscreva o campo **messages**.

A partir daí, toda vez que uma mensagem for entregue ou lida pelo cliente, a Meta avisa a
função automaticamente, e o dashboard de campanhas passa a mostrar as visualizações reais.

## 4. Agendar o disparo diário — escolha UMA opção

**Opção A — pg_cron (dentro do próprio Supabase):**
Em Database → Extensions, habilite `pg_cron` e `pg_net`. Depois, no SQL Editor, descomente
e rode o bloco `cron.schedule(...)` que está no final de `supabase/schema.sql`, preenchendo
o project ref e a service role key.

**Opção B — GitHub Actions (mais simples de visualizar/depurar):**
No repositório GitHub, vá em **Settings → Secrets and variables → Actions** e crie:
- `SUPABASE_FUNCTION_URL` → `https://SEU_PROJECT_REF.supabase.co/functions/v1/send-birthday-reminders`
- `SUPABASE_CAMPAIGNS_FUNCTION_URL` → `https://SEU_PROJECT_REF.supabase.co/functions/v1/send-campaigns`
- `SUPABASE_SERVICE_ROLE_KEY` → a service role key do projeto

O workflow `.github/workflows/disparo-diario.yml` já está pronto e roda todo dia às 09h
(horário de Brasília). Dá pra também disparar manualmente pela aba **Actions** do GitHub.

## 5. Publicar o front-end no Netlify

1. Suba este repositório para o GitHub.
2. No Netlify: **Add new site → Import an existing project** → conecte o repositório.
3. O `netlify.toml` já define `base = web`, `command = npm run build`, `publish = web/dist`.
4. Em **Site settings → Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Pronto — cada usuário acessa a URL do Netlify, cria a própria conta e configura
   suas credenciais em "Configurações".

## Rodando localmente

```bash
cd web
cp .env.example .env   # preencha com as chaves do seu projeto Supabase
npm install
npm run dev
```

## Observações importantes

- **Formato de telefone**: sempre em E.164 sem símbolos, ex. `5511999998888`.
- **Custo**: cada mensagem de template enviada pela Cloud API tem custo por mensagem, cobrado
  pela Meta e variando por país/categoria. O sistema calcula o custo usando a tabela central de
  preços (ver seção abaixo) — a categoria usada é a que a Meta efetivamente aprovou
  (`categoria_meta_aprovada`), que pode ser diferente da solicitada ao criar o template.
- **Categoria padrão = Marketing**: mensagens de aniversário e campanhas avulsas não são
  transacionais (não respondem a uma ação do cliente), então a Meta as trata como Marketing por
  padrão — é essa a categoria pré-selecionada ao criar um template novo e usada como fallback
  em qualquer cálculo de custo quando a categoria não está definida. Rode
  `migrations/006_categoria_padrao_marketing.sql` se seu banco já existia antes dessa mudança.
- **RLS**: cada usuário só vê seus próprios clientes/templates/campanhas/histórico — já
  configurado no `schema.sql`.
- **Segurança do token**: o `whatsapp_token_acesso` fica salvo na tabela `perfis`,
  protegido por RLS (só o próprio dono lê/edita) e só é lido pelas Edge Functions via
  `service_role`, nunca exposto ao navegador.

## Tabela de preços central (custo Meta x valor cobrado) — só administrador

Existe uma tabela `public.tabela_precos`, **invisível para usuários comuns**, com duas colunas
de preço por categoria/país:
- `custo_meta`: o que a Meta cobra de fato por mensagem (referência interna)
- `valor_cobranca`: o que o sistema cobra do cliente final (pode ter markup/margem)

Usuários comuns nunca leem essa tabela diretamente — eles só recebem o `valor_cobranca` através
de uma função pública (`obter_precos_publicos`), usada nas telas de Configurações, Campanhas e
no Dashboard. O `custo_meta` e a margem só aparecem na tela **Painel Admin**, visível apenas para
quem tiver `perfis.is_admin = true`.

**Para promover o primeiro administrador**, rode no SQL Editor do Supabase (não existe tela para
isso, de propósito, por segurança):

```sql
update public.perfis set is_admin = true where id = '<uuid-do-usuario>';
```

O uuid você encontra em **Authentication → Users** no painel do Supabase.
