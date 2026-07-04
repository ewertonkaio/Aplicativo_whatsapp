import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const formVazio = {
  id: null,
  nome: "",
  modelo_id: "",
  data_envio: "",
  publico: "todos",
  clientes_ids: [],
};

const STATUS_LABEL = {
  agendada: { texto: "Agendada", cor: "var(--gold)" },
  enviando: { texto: "Enviando...", cor: "var(--gold)" },
  concluida: { texto: "Concluída ✅", cor: "var(--green)" },
  cancelada: { texto: "Cancelada", cor: "var(--muted)" },
  erro: { texto: "Erro", cor: "var(--red)" },
};

function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function precoPorCategoria(precos, categoria) {
  if (!precos) return 0;
  return Number(precos[categoria] ?? 0.035);
}

function formatarReais(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Campaigns() {
  const [campanhas, setCampanhas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [precos, setPrecos] = useState({});
  const [statsPorCampanha, setStatsPorCampanha] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);

    const [{ data: camps }, { data: mods }, { data: clis }, { data: precosData }, { data: logs }] =
      await Promise.all([
        supabase.from("campanhas").select("*, modelos_mensagem(nome)").order("data_envio", { ascending: false }),
        supabase.from("modelos_mensagem").select("id, nome, status_aprovacao, categoria_meta, categoria_meta_aprovada").order("nome"),
        supabase.from("clientes").select("id, nome, telefone").eq("ativo", true).order("nome"),
        supabase.rpc("obter_precos_publicos"),
        supabase
          .from("logs_envio")
          .select("campanha_id, status, status_entrega, custo")
          .not("campanha_id", "is", null),
      ]);

    setCampanhas(camps ?? []);
    setModelos(mods ?? []);
    setClientes(clis ?? []);
    const mapaPrecos = {};
    for (const p of precosData ?? []) mapaPrecos[p.categoria] = Number(p.valor_cobranca);
    setPrecos(mapaPrecos);

    const stats = {};
    for (const log of logs ?? []) {
      const s = stats[log.campanha_id] || { enviados: 0, lidos: 0, falhas: 0, custo: 0 };
      if (log.status === "enviado") {
        s.enviados += 1;
        s.custo += Number(log.custo || 0);
        if (log.status_entrega === "lido") s.lidos += 1;
      } else if (log.status === "falhou") {
        s.falhas += 1;
      }
      stats[log.campanha_id] = s;
    }
    setStatsPorCampanha(stats);

    setCarregando(false);
  }

  function abrirNovo() {
    setForm({ ...formVazio, data_envio: hojeISO() });
    setMostrarForm(true);
    setErro("");
  }

  function abrirEdicao(campanha) {
    setForm({
      id: campanha.id,
      nome: campanha.nome,
      modelo_id: campanha.modelo_id,
      data_envio: campanha.data_envio,
      publico: campanha.publico,
      clientes_ids: campanha.clientes_ids ?? [],
    });
    setMostrarForm(true);
    setErro("");
  }

  function alternarCliente(id) {
    setForm((f) => ({
      ...f,
      clientes_ids: f.clientes_ids.includes(id)
        ? f.clientes_ids.filter((c) => c !== id)
        : [...f.clientes_ids, id],
    }));
  }

  async function handleSalvar(e) {
    e.preventDefault();
    setErro("");

    if (!form.modelo_id) return setErro("Selecione um template.");
    if (form.publico === "selecionados" && form.clientes_ids.length === 0) {
      return setErro("Selecione ao menos um cliente ou escolha 'Todos os clientes'.");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      nome: form.nome.trim(),
      modelo_id: form.modelo_id,
      data_envio: form.data_envio,
      publico: form.publico,
      clientes_ids: form.publico === "selecionados" ? form.clientes_ids : [],
      usuario_id: user.id,
    };

    let res;
    if (form.id) {
      res = await supabase.from("campanhas").update(payload).eq("id", form.id);
    } else {
      res = await supabase.from("campanhas").insert(payload);
    }

    if (res.error) {
      setErro(res.error.message);
      return;
    }

    setMostrarForm(false);
    carregar();
  }

  async function handleCancelar(id) {
    if (!confirm("Cancelar esta campanha agendada?")) return;
    await supabase.from("campanhas").update({ status: "cancelada" }).eq("id", id);
    carregar();
  }

  async function handleExcluir(id) {
    if (!confirm("Excluir esta campanha permanentemente?")) return;
    await supabase.from("campanhas").delete().eq("id", id);
    carregar();
  }

  const modeloSelecionado = modelos.find((m) => m.id === form.modelo_id);

  return (
    <>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Campanhas</h1>
          <p>Agende o envio de qualquer template para uma data específica, além do disparo automático de aniversário.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova campanha</button>
      </div>

      {modelos.length === 0 && !carregando && (
        <div className="helper-box" style={{ marginBottom: 20 }}>
          Você ainda não tem nenhum template cadastrado. Vá em "Templates" para criar um antes de agendar uma campanha.
        </div>
      )}

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{form.id ? "Editar campanha" : "Nova campanha"}</h3>
          <form onSubmit={handleSalvar}>
            <div className="field">
              <label>Nome da campanha</label>
              <input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Promoção Dia das Mães"
                required
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Template</label>
                <select
                  value={form.modelo_id}
                  onChange={(e) => setForm({ ...form, modelo_id: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} {m.status_aprovacao !== "aprovado" ? "(não aprovado ainda)" : ""}
                    </option>
                  ))}
                </select>
                {modeloSelecionado && modeloSelecionado.status_aprovacao !== "aprovado" && (
                  <div className="hint" style={{ color: "var(--gold)" }}>
                    Esse template ainda não foi aprovado pela Meta — aprove em "Templates" antes da data de envio.
                  </div>
                )}
              </div>
              <div className="field">
                <label>Data de envio</label>
                <input
                  type="date"
                  min={hojeISO()}
                  value={form.data_envio}
                  onChange={(e) => setForm({ ...form, data_envio: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Público</label>
              <select value={form.publico} onChange={(e) => setForm({ ...form, publico: e.target.value })}>
                <option value="todos">Todos os clientes ativos ({clientes.length})</option>
                <option value="selecionados">Selecionar clientes específicos</option>
              </select>
            </div>

            {form.publico === "selecionados" && (
              <div className="field">
                <label>Clientes ({form.clientes_ids.length} selecionado(s))</label>
                <div
                  style={{
                    maxHeight: 220,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {clientes.map((c) => (
                    <label
                      key={c.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 14 }}
                    >
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={form.clientes_ids.includes(c.id)}
                        onChange={() => alternarCliente(c.id)}
                      />
                      {c.nome} <span style={{ color: "var(--muted)" }}>· {c.telefone}</span>
                    </label>
                  ))}
                  {clientes.length === 0 && (
                    <p style={{ color: "var(--muted)", fontSize: 13 }}>Nenhum cliente ativo cadastrado.</p>
                  )}
                </div>
              </div>
            )}

            {modeloSelecionado && (
              <div className="helper-box" style={{ marginBottom: 16 }}>
                <strong>Custo estimado:</strong>{" "}
                {(() => {
                  const categoria = modeloSelecionado.categoria_meta_aprovada || modeloSelecionado.categoria_meta || "MARKETING";
                  const qtd = form.publico === "todos" ? clientes.length : form.clientes_ids.length;
                  const preco = precoPorCategoria(precos, categoria);
                  return `${qtd} envio(s) × ${formatarReais(preco)} (${categoria}) ≈ ${formatarReais(qtd * preco)}`;
                })()}
              </div>
            )}

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

      {!carregando && campanhas.length === 0 && !mostrarForm && (
        <div className="card empty-state">
          <h3>Nenhuma campanha criada</h3>
          <p>Clique em "Nova campanha" para agendar o primeiro envio.</p>
        </div>
      )}

      {!carregando && campanhas.length > 0 && (
        <div className="row-list">
          {campanhas.map((c) => {
            const status = STATUS_LABEL[c.status] || STATUS_LABEL.agendada;
            const stats = statsPorCampanha[c.id] || { enviados: 0, lidos: 0, falhas: 0, custo: 0 };
            return (
              <div className="card" key={c.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ fontSize: 15 }}>{c.nome}</h3>
                    <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                      Template: {c.modelos_mensagem?.nome ?? "—"} · Envio em{" "}
                      {new Date(c.data_envio + "T00:00:00").toLocaleDateString("pt-BR")} ·{" "}
                      {c.publico === "todos" ? "Todos os clientes" : `${c.clientes_ids?.length ?? 0} cliente(s)`}
                    </p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: status.cor, whiteSpace: "nowrap" }}>
                    ● {status.texto}
                  </span>
                </div>

                {(c.status === "concluida" || c.status === "erro") && (
                  <div
                    style={{
                      display: "flex",
                      gap: 18,
                      marginTop: 12,
                      padding: "10px 12px",
                      background: "var(--surface-2)",
                      borderRadius: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>ENVIOS</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{stats.enviados}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>VISUALIZAÇÕES</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--green)" }}>{stats.lidos}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>FALHAS</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: stats.falhas > 0 ? "var(--red)" : "var(--text)" }}>
                        {stats.falhas}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>CUSTO TOTAL</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gold)" }}>{formatarReais(stats.custo)}</div>
                    </div>
                  </div>
                )}

                {c.mensagem_erro && (
                  <p style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>Erro: {c.mensagem_erro}</p>
                )}

                <div className="row-actions" style={{ marginTop: 12 }}>
                  {c.status === "agendada" && (
                    <>
                      <button className="btn btn-ghost btn-icon" onClick={() => abrirEdicao(c)}>Editar</button>
                      <button className="btn btn-danger" onClick={() => handleCancelar(c.id)}>Cancelar</button>
                    </>
                  )}
                  {c.status !== "agendada" && c.status !== "enviando" && (
                    <button className="btn btn-danger" onClick={() => handleExcluir(c.id)}>Excluir</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
