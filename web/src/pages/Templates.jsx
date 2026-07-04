import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import EmojiPicker from "../components/EmojiPicker";
import WhatsAppPreview from "../components/WhatsAppPreview";

const formVazio = {
  id: null,
  nome: "",
  texto_visualizacao: "Olá {{1}}, aqui é a equipe da [Sua Empresa]! 🎉 Passando para desejar um feliz aniversário. Conte com a gente sempre que precisar!",
  nome_modelo_meta: "",
  idioma_modelo_meta: "pt_BR",
  categoria_meta: "MARKETING",
  exemplo_variavel_1: "Maria",
  padrao: false,
};

const STATUS_LABEL = {
  nao_enviado: { texto: "Não enviado", cor: "var(--muted)" },
  pendente: { texto: "Aguardando aprovação da Meta", cor: "var(--gold)" },
  aprovado: { texto: "Aprovado ✅", cor: "var(--green)" },
  rejeitado: { texto: "Rejeitado", cor: "var(--red)" },
};

export default function Templates() {
  const [modelos, setModelos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState("");
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null); // id do modelo com ação em curso
  const [avisoAcao, setAvisoAcao] = useState({});
  const [previewAberto, setPreviewAberto] = useState({});
  const textareaRef = useRef(null);

  function inserirEmoji(emoji) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setForm((f) => ({ ...f, texto_visualizacao: f.texto_visualizacao + emoji }));
      return;
    }
    const inicio = textarea.selectionStart;
    const fim = textarea.selectionEnd;
    const textoAtual = form.texto_visualizacao;
    const novoTexto = textoAtual.slice(0, inicio) + emoji + textoAtual.slice(fim);
    setForm((f) => ({ ...f, texto_visualizacao: novoTexto }));
    // Recoloca o cursor logo após o emoji inserido
    requestAnimationFrame(() => {
      textarea.focus();
      const novaPosicao = inicio + emoji.length;
      textarea.setSelectionRange(novaPosicao, novaPosicao);
    });
  }

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("modelos_mensagem")
      .select("*")
      .order("criado_em", { ascending: false });
    setModelos(data ?? []);
    setCarregando(false);
  }

  function abrirNovo() {
    setForm(formVazio);
    setMostrarForm(true);
    setErro("");
  }

  function abrirEdicao(modelo) {
    setForm(modelo);
    setMostrarForm(true);
    setErro("");
  }

  async function handleSalvar(e) {
    e.preventDefault();
    setErro("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      nome: form.nome.trim(),
      texto_visualizacao: form.texto_visualizacao.trim(),
      nome_modelo_meta: form.nome_modelo_meta.trim() || null,
      idioma_modelo_meta: form.idioma_modelo_meta || "pt_BR",
      categoria_meta: form.categoria_meta || "MARKETING",
      exemplo_variavel_1: form.exemplo_variavel_1?.trim() || null,
      padrao: form.padrao,
      usuario_id: user.id,
    };

    if (payload.padrao) {
      await supabase.from("modelos_mensagem").update({ padrao: false }).eq("usuario_id", user.id);
    }

    let res;
    if (form.id) {
      res = await supabase.from("modelos_mensagem").update(payload).eq("id", form.id);
    } else {
      res = await supabase.from("modelos_mensagem").insert(payload);
    }

    if (res.error) {
      setErro(res.error.message);
      return;
    }

    setMostrarForm(false);
    carregar();
  }

  async function handleExcluir(id) {
    if (!confirm("Remover este template?")) return;
    await supabase.from("modelos_mensagem").delete().eq("id", id);
    carregar();
  }

  async function chamarTemplateMeta(modeloId, action) {
    setAcaoEmAndamento(modeloId + action);
    setAvisoAcao((prev) => ({ ...prev, [modeloId]: null }));

    const { data, error } = await supabase.functions.invoke("template-meta", {
      body: { modelo_id: modeloId, action },
    });

    if (error) {
      // supabase-js embrulha erros HTTP != 2xx aqui; o corpo real vem em error.context
      let msg = error.message;
      try {
        const corpo = await error.context.json();
        if (corpo?.erro) msg = corpo.erro;
      } catch {
        // mantém a mensagem padrão
      }
      setAvisoAcao((prev) => ({ ...prev, [modeloId]: { tipo: "erro", texto: msg } }));
    } else if (data?.erro) {
      setAvisoAcao((prev) => ({ ...prev, [modeloId]: { tipo: "erro", texto: data.erro } }));
    } else {
      setAvisoAcao((prev) => ({
        ...prev,
        [modeloId]: {
          tipo: "ok",
          texto: action === "enviar" ? "Enviado para aprovação da Meta." : `Status atual: ${data.status}`,
        },
      }));
      carregar();
    }

    setAcaoEmAndamento(null);
  }

  return (
    <>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Templates de mensagem</h1>
          <p>
            Enviado todo dia 1º do mês para todos os clientes aniversariantes daquele mês.
            O texto abaixo é o preview — o envio real usa o template já aprovado na Meta.
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Novo template</button>
      </div>

      <div className="helper-box" style={{ marginBottom: 20 }}>
        <strong>Aprovação automática:</strong> depois de salvar o template com o nome, idioma,
        categoria e um exemplo para <code>{"{{1}}"}</code>, use o botão <strong>"Enviar para
        aprovação"</strong> em cada card — isso submete direto para a Meta pela API, sem precisar
        abrir o WhatsApp Manager. A aprovação em si ainda é feita pela Meta e pode levar de
        minutos a ~1 dia útil; use "Verificar status" para atualizar.
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{form.id ? "Editar template" : "Novo template"}</h3>
          <form onSubmit={handleSalvar}>
            <div className="field">
              <label>Nome interno</label>
              <input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Aniversário padrão"
                required
              />
            </div>
            <div className="field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Texto — use {"{{1}}"} para o nome do cliente</label>
                <EmojiPicker onSelect={inserirEmoji} />
              </div>
              <textarea
                ref={textareaRef}
                value={form.texto_visualizacao}
                onChange={(e) => setForm({ ...form, texto_visualizacao: e.target.value })}
                required
              />
              <div className="hint">
                Também aceita formatação do WhatsApp: <code>*negrito*</code>, <code>_itálico_</code>, <code>~tachado~</code>
              </div>
            </div>

            <div className="field">
              <label>Preview de como fica no WhatsApp</label>
              <WhatsAppPreview texto={form.texto_visualizacao} nomeExemplo={form.exemplo_variavel_1} />
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Nome do template na Meta</label>
                <input
                  value={form.nome_modelo_meta}
                  onChange={(e) => setForm({ ...form, nome_modelo_meta: e.target.value })}
                  placeholder="Ex: feliz_aniversario"
                />
                <div className="hint">Só letras minúsculas, números e "_" — sem espaços/acentos.</div>
              </div>
              <div className="field">
                <label>Idioma</label>
                <input
                  value={form.idioma_modelo_meta}
                  onChange={(e) => setForm({ ...form, idioma_modelo_meta: e.target.value })}
                  placeholder="pt_BR"
                />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Categoria (Meta)</label>
                <select
                  value={form.categoria_meta}
                  onChange={(e) => setForm({ ...form, categoria_meta: e.target.value })}
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utilidade</option>
                  <option value="AUTHENTICATION">Autenticação</option>
                </select>
              </div>
              <div className="field">
                <label>Exemplo para {"{{1}}"}</label>
                <input
                  value={form.exemplo_variavel_1}
                  onChange={(e) => setForm({ ...form, exemplo_variavel_1: e.target.value })}
                  placeholder="Ex: Maria"
                />
                <div className="hint">A Meta exige um valor de exemplo para revisar o template.</div>
              </div>
            </div>
            <div className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={form.padrao}
                onChange={(e) => setForm({ ...form, padrao: e.target.checked })}
                id="padrao"
              />
              <label htmlFor="padrao" style={{ margin: 0 }}>
                Usar como template padrão para os disparos automáticos
              </label>
            </div>

            {erro && <p className="error-text">{erro}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" type="submit">Salvar</button>
              <button className="btn btn-ghost" type="button" onClick={() => setMostrarForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {carregando && <p style={{ color: "var(--muted)" }}>Carregando...</p>}

      {!carregando && modelos.length === 0 && !mostrarForm && (
        <div className="card empty-state">
          <h3>Nenhum template cadastrado</h3>
          <p>Crie o primeiro para poder ativar os disparos automáticos.</p>
        </div>
      )}

      {!carregando && modelos.length > 0 && (
        <div className="row-list">
          {modelos.map((t) => {
            const status = STATUS_LABEL[t.status_aprovacao] || STATUS_LABEL.nao_enviado;
            const aviso = avisoAcao[t.id];
            return (
              <div className="card" key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h3 style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                    {t.nome} {t.padrao && <span className="default-pill">PADRÃO</span>}
                  </h3>
                  <div className="row-actions">
                    <button className="btn btn-ghost btn-icon" onClick={() => abrirEdicao(t)}>Editar</button>
                    <button className="btn btn-danger" onClick={() => handleExcluir(t.id)}>Excluir</button>
                  </div>
                </div>

                <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 6 }}>{t.texto_visualizacao}</p>
                <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>
                  Meta: <code>{t.nome_modelo_meta || "não configurado"}</code> ({t.idioma_modelo_meta}) ·{" "}
                  Categoria solicitada: {t.categoria_meta}
                  {t.categoria_meta_aprovada && t.categoria_meta_aprovada !== t.categoria_meta && (
                    <span style={{ color: "var(--gold)" }}> · Aprovada como: {t.categoria_meta_aprovada}</span>
                  )}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: status.cor }}>● {status.texto}</span>

                  <button
                    className="btn btn-ghost btn-icon"
                    disabled={acaoEmAndamento === t.id + "enviar"}
                    onClick={() => chamarTemplateMeta(t.id, "enviar")}
                  >
                    {acaoEmAndamento === t.id + "enviar" ? "Enviando..." : "Enviar para aprovação"}
                  </button>

                  <button
                    className="btn btn-ghost btn-icon"
                    disabled={acaoEmAndamento === t.id + "status" || t.status_aprovacao === "nao_enviado"}
                    onClick={() => chamarTemplateMeta(t.id, "status")}
                  >
                    {acaoEmAndamento === t.id + "status" ? "Verificando..." : "Verificar status"}
                  </button>

                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => setPreviewAberto((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                  >
                    {previewAberto[t.id] ? "Ocultar preview" : "Ver preview"}
                  </button>
                </div>

                {previewAberto[t.id] && (
                  <div style={{ marginTop: 12 }}>
                    <WhatsAppPreview texto={t.texto_visualizacao} nomeExemplo={t.exemplo_variavel_1} />
                  </div>
                )}

                {t.motivo_rejeicao && (
                  <p style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>
                    Motivo da rejeição: {t.motivo_rejeicao}
                  </p>
                )}

                {aviso && (
                  <p
                    style={{ fontSize: 12, marginTop: 8 }}
                    className={aviso.tipo === "erro" ? "error-text" : "success-text"}
                  >
                    {aviso.texto}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
