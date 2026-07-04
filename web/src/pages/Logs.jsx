import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("logs_envio")
      .select("*, clientes(nome, telefone), campanhas(nome)")
      .order("enviado_em", { ascending: false })
      .limit(100);
    setLogs(data ?? []);
    setCarregando(false);
  }

  return (
    <>
      <div className="page-header">
        <h1>Histórico de envios</h1>
        <p>Últimas 100 mensagens disparadas automaticamente.</p>
      </div>

      {carregando && <p style={{ color: "var(--muted)" }}>Carregando...</p>}

      {!carregando && logs.length === 0 && (
        <div className="card empty-state">
          <h3>Nenhum envio registrado ainda</h3>
          <p>Os registros aparecem aqui assim que a rotina mensal começar a disparar.</p>
        </div>
      )}

      {!carregando && logs.length > 0 && (
        <div className="card">
          <div className="row-list">
            {logs.map((l) => (
              <div className="client-row" key={l.id}>
                <div className="info">
                  <div className="name">{l.clientes?.nome ?? "Cliente removido"}</div>
                  <div className="phone">
                    {l.clientes?.telefone} ·{" "}
                    {new Date(l.enviado_em).toLocaleString("pt-BR")}
                    {l.campanhas?.nome ? ` · Campanha: ${l.campanhas.nome}` : " · Aniversário"}
                  </div>
                  {l.status === "falhou" && (
                    <div className="phone" style={{ color: "var(--red)" }}>{l.mensagem_erro}</div>
                  )}
                </div>
                <span className={`badge ${l.status === "enviado" ? "sent" : "failed"}`}>
                  {l.status === "enviado" ? "Enviado" : l.status === "ignorado" ? "Ignorado" : "Falhou"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
