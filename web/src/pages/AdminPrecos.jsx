import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const formVazio = {
  id: null,
  categoria: "MARKETING",
  pais: "BR",
  custo_meta: "",
  valor_cobranca: "",
  vigente_desde: "",
  ativo: true,
};

const NOME_CATEGORIA = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };

function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatarReais(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdminPrecos() {
  const [autorizado, setAutorizado] = useState(null); // null = verificando, true/false
  const [precos, setPrecos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState("");

  useEffect(() => {
    verificarAcesso();
  }, []);

  async function verificarAcesso() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase.from("perfis").select("is_admin").eq("id", user.id).single();
    const ehAdmin = !!data?.is_admin;
    setAutorizado(ehAdmin);
    if (ehAdmin) carregar();
    else setCarregando(false);
  }

  async function carregar() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("tabela_precos")
      .select("*")
      .order("categoria")
      .order("vigente_desde", { ascending: false });
    if (!error) setPrecos(data ?? []);
    setCarregando(false);
  }

  function abrirNovo() {
    setForm({ ...formVazio, vigente_desde: hojeISO() });
    setMostrarForm(true);
    setErro("");
  }

  function abrirEdicao(linha) {
    setForm({ ...linha, custo_meta: String(linha.custo_meta), valor_cobranca: String(linha.valor_cobranca) });
    setMostrarForm(true);
    setErro("");
  }

  async function handleSalvar(e) {
    e.preventDefault();
    setErro("");

    const payload = {
      categoria: form.categoria,
      pais: form.pais.trim().toUpperCase(),
      custo_meta: Number(form.custo_meta),
      valor_cobranca: Number(form.valor_cobranca),
      vigente_desde: form.vigente_desde,
      ativo: form.ativo,
    };

    let res;
    if (form.id) {
      res = await supabase.from("tabela_precos").update(payload).eq("id", form.id);
    } else {
      res = await supabase.from("tabela_precos").insert(payload);
    }

    if (res.error) {
      setErro(res.error.message);
      return;
    }

    setMostrarForm(false);
    carregar();
  }

  async function handleExcluir(id) {
    if (!confirm("Remover esta faixa de preço?")) return;
    await supabase.from("tabela_precos").delete().eq("id", id);
    carregar();
  }

  if (autorizado === null) {
    return <p style={{ color: "var(--muted)" }}>Verificando acesso...</p>;
  }

  if (!autorizado) {
    return (
      <div className="card empty-state">
        <h3>Acesso restrito</h3>
        <p>Esta área é exclusiva do administrador do sistema.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Tabela de preços (admin)</h1>
          <p>Custo real pago à Meta x valor cobrado do cliente final, por categoria e país.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova faixa</button>
      </div>

      <div className="helper-box" style={{ marginBottom: 20 }}>
        Só usuários com <code>is_admin = true</code> enxergam esta tela e os dados desta tabela —
        usuários comuns só veem o "valor a pagar" já calculado, nunca o custo real da Meta nem a margem.
      </div>

      {mostrarForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>{form.id ? "Editar faixa de preço" : "Nova faixa de preço"}</h3>
          <form onSubmit={handleSalvar}>
            <div className="form-grid">
              <div className="field">
                <label>Categoria</label>
                <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utilidade</option>
                  <option value="AUTHENTICATION">Autenticação</option>
                </select>
              </div>
              <div className="field">
                <label>País (código)</label>
                <input
                  value={form.pais}
                  onChange={(e) => setForm({ ...form, pais: e.target.value })}
                  placeholder="BR"
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Custo da Meta (R$)</label>
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={form.custo_meta}
                  onChange={(e) => setForm({ ...form, custo_meta: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Valor cobrado do cliente (R$)</label>
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={form.valor_cobranca}
                  onChange={(e) => setForm({ ...form, valor_cobranca: e.target.value })}
                  required
                />
                {form.custo_meta && form.valor_cobranca && (
                  <div className="hint">
                    Margem: {formatarReais(Number(form.valor_cobranca) - Number(form.custo_meta))} por mensagem
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label>Vigente desde</label>
              <input
                type="date"
                value={form.vigente_desde}
                onChange={(e) => setForm({ ...form, vigente_desde: e.target.value })}
                required
              />
              <div className="hint">Uma nova data passa a valer para os próximos envios — o histórico antigo não muda.</div>
            </div>

            <div className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                id="ativo"
              />
              <label htmlFor="ativo" style={{ margin: 0 }}>Ativa</label>
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

      {!carregando && precos.length === 0 && !mostrarForm && (
        <div className="card empty-state">
          <h3>Nenhuma faixa de preço cadastrada</h3>
          <p>Clique em "Nova faixa" para começar.</p>
        </div>
      )}

      {!carregando && precos.length > 0 && (
        <div className="card">
          <div className="row-list">
            {precos.map((p) => (
              <div className="client-row" key={p.id}>
                <div className="info">
                  <div className="name">
                    {NOME_CATEGORIA[p.categoria] || p.categoria} · {p.pais}
                    {!p.ativo && <span style={{ color: "var(--muted)" }}> (inativa)</span>}
                  </div>
                  <div className="phone">
                    Custo Meta: {formatarReais(p.custo_meta)} → Cobrado: {formatarReais(p.valor_cobranca)}
                    {" · "}
                    Margem: {formatarReais(p.valor_cobranca - p.custo_meta)}
                    {" · desde "}
                    {new Date(p.vigente_desde + "T00:00:00").toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="btn btn-ghost btn-icon" onClick={() => abrirEdicao(p)}>Editar</button>
                  <button className="btn btn-danger" onClick={() => handleExcluir(p.id)}>Excluir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
