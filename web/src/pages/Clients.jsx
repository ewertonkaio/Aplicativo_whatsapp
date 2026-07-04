import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const formVazio = { id: null, nome: "", telefone: "", aniversario: "", vencimento_plano: "", observacoes: "" };

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .order("criado_em", { ascending: false });
    setClientes(data ?? []);
    setCarregando(false);
  }

  function abrirNovo() {
    setForm(formVazio);
    setMostrarForm(true);
    setErro("");
  }

  function abrirEdicao(cliente) {
    setForm(cliente);
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
      telefone: form.telefone.trim(),
      aniversario: form.aniversario,
      vencimento_plano: form.vencimento_plano || null,
      observacoes: form.observacoes?.trim() || null,
      usuario_id: user.id,
    };

    let res;
    if (form.id) {
      res = await supabase.from("clientes").update(payload).eq("id", form.id);
    } else {
      res = await supabase.from("clientes").insert(payload);
    }

    if (res.error) {
      setErro(res.error.message);
      return;
    }

    setMostrarForm(false);
    carregar();
  }

  async function handleExcluir(id) {
    if (!confirm("Remover este cliente?")) return;
    await supabase.from("clientes").delete().eq("id", id);
    carregar();
  }

  return (
    <>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Clientes</h1>
          <p>Cadastre os clientes e a data de aniversário de cada um.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Novo cliente</button>
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{form.id ? "Editar cliente" : "Novo cliente"}</h3>
          <form onSubmit={handleSalvar}>
            <div className="form-grid">
              <div className="field">
                <label>Nome</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Telefone (formato internacional)</label>
                <input
                  placeholder="5511999998888"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  required
                />
                <div className="hint">Sem espaços, traços ou "+". Ex: 5511999998888</div>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Data de aniversário</label>
                <input
                  type="date"
                  value={form.aniversario}
                  onChange={(e) => setForm({ ...form, aniversario: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Vencimento do plano (opcional)</label>
                <input
                  type="date"
                  value={form.vencimento_plano || ""}
                  onChange={(e) => setForm({ ...form, vencimento_plano: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Observações (opcional)</label>
              <textarea
                value={form.observacoes || ""}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
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

      {!carregando && clientes.length === 0 && !mostrarForm && (
        <div className="card empty-state">
          <h3>Nenhum cliente cadastrado</h3>
          <p>Clique em "Novo cliente" para começar.</p>
        </div>
      )}

      {!carregando && clientes.length > 0 && (
        <div className="card">
          <div className="row-list">
            {clientes.map((c) => {
              const hoje = new Date();
              hoje.setHours(0, 0, 0, 0);
              const vencimento = c.vencimento_plano ? new Date(c.vencimento_plano + "T00:00:00") : null;
              const diasParaVencer = vencimento ? Math.round((vencimento - hoje) / (1000 * 60 * 60 * 24)) : null;
              const vencido = diasParaVencer !== null && diasParaVencer < 0;
              const proximoDoVencimento = diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer <= 7;

              return (
                <div className="client-row" key={c.id}>
                  <div className="info">
                    <div className="name">{c.nome}</div>
                    <div className="phone">
                      {c.telefone} · aniversário em{" "}
                      {new Date(c.aniversario + "T00:00:00").toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                      })}
                      {vencimento && (
                        <>
                          {" · plano vence em "}
                          <span
                            style={{
                              color: vencido ? "var(--red)" : proximoDoVencimento ? "var(--gold)" : "var(--muted)",
                              fontWeight: vencido || proximoDoVencimento ? 700 : 400,
                            }}
                          >
                            {vencimento.toLocaleDateString("pt-BR")}
                            {vencido && " (vencido)"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button className="btn btn-ghost btn-icon" onClick={() => abrirEdicao(c)}>Editar</button>
                    <button className="btn btn-danger" onClick={() => handleExcluir(c.id)}>Excluir</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
