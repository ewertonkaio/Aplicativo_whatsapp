import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Settings() {
  const [perfil, setPerfil] = useState(null);
  const [precos, setPrecos] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [{ data }, { data: precosData }] = await Promise.all([
      supabase.from("perfis").select("*").eq("id", user.id).single(),
      supabase.rpc("obter_precos_publicos"),
    ]);
    setPerfil(data);
    const mapa = {};
    for (const p of precosData ?? []) mapa[p.categoria] = p.valor_cobranca;
    setPrecos(mapa);
    setCarregando(false);
  }

  async function handleSalvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setAviso("");

    const { error } = await supabase
      .from("perfis")
      .update({
        nome_completo: perfil.nome_completo,
        nome_empresa: perfil.nome_empresa,
        whatsapp_id_numero_telefone: perfil.whatsapp_id_numero_telefone,
        whatsapp_id_conta_comercial: perfil.whatsapp_id_conta_comercial,
        whatsapp_token_acesso: perfil.whatsapp_token_acesso,
        whatsapp_numero_exibicao: perfil.whatsapp_numero_exibicao,
        hora_envio: perfil.hora_envio,
      })
      .eq("id", perfil.id);

    if (error) setErro(error.message);
    else setAviso("Configurações salvas.");
    setSalvando(false);
  }

  if (carregando || !perfil) return <p style={{ color: "var(--muted)" }}>Carregando...</p>;

  return (
    <>
      <div className="page-header">
        <h1>Configurações</h1>
        <p>Credenciais da WhatsApp Cloud API — o número usado aqui é o que dispara as mensagens.</p>
      </div>

      <div className="helper-box" style={{ marginBottom: 20 }}>
        Essas informações vêm do <strong>Meta for Developers</strong> → seu App → WhatsApp → API Setup:
        o <strong>Phone Number ID</strong>, o <strong>WhatsApp Business Account ID</strong> e um
        <strong> token de acesso permanente</strong> (gerado com um usuário do sistema, não o token
        temporário de 24h).
      </div>

      <form onSubmit={handleSalvar} className="card">
        <div className="form-grid">
          <div className="field">
            <label>Seu nome</label>
            <input
              value={perfil.nome_completo || ""}
              onChange={(e) => setPerfil({ ...perfil, nome_completo: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Nome da empresa</label>
            <input
              value={perfil.nome_empresa || ""}
              onChange={(e) => setPerfil({ ...perfil, nome_empresa: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label>Número de WhatsApp (exibição)</label>
          <input
            placeholder="+55 11 99999-8888"
            value={perfil.whatsapp_numero_exibicao || ""}
            onChange={(e) => setPerfil({ ...perfil, whatsapp_numero_exibicao: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Phone Number ID</label>
          <input
            value={perfil.whatsapp_id_numero_telefone || ""}
            onChange={(e) => setPerfil({ ...perfil, whatsapp_id_numero_telefone: e.target.value })}
          />
        </div>

        <div className="field">
          <label>WhatsApp Business Account ID</label>
          <input
            value={perfil.whatsapp_id_conta_comercial || ""}
            onChange={(e) =>
              setPerfil({ ...perfil, whatsapp_id_conta_comercial: e.target.value })
            }
          />
        </div>

        <div className="field">
          <label>Token de acesso permanente</label>
          <input
            type="password"
            value={perfil.whatsapp_token_acesso || ""}
            onChange={(e) => setPerfil({ ...perfil, whatsapp_token_acesso: e.target.value })}
          />
          <div className="hint">Fica salvo no banco; nunca é exposto no front-end.</div>
        </div>

        <div className="field">
          <label>Horário do disparo diário (0–23, fuso {perfil.fuso_horario || "America/Sao_Paulo"})</label>
          <input
            type="number"
            min={0}
            max={23}
            value={perfil.hora_envio ?? 9}
            onChange={(e) => setPerfil({ ...perfil, hora_envio: Number(e.target.value) })}
          />
        </div>

        <h3 style={{ fontSize: 15, margin: "20px 0 6px" }}>Preços por mensagem (R$)</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
          Definidos pelo administrador do sistema — aqui é só consulta.
        </p>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>MARKETING</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {(precos.MARKETING ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>UTILIDADE</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {(precos.UTILITY ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>AUTENTICAÇÃO</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {(precos.AUTHENTICATION ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>
        </div>

        {erro && <p className="error-text">{erro}</p>}
        {aviso && <p className="success-text">{aviso}</p>}

        <button className="btn btn-primary" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar configurações"}
        </button>
      </form>
    </>
  );
}
