import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MESES_ABREV = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export default function Dashboard() {
  const [clientes, setClientes] = useState([]);
  const [resumoMes, setResumoMes] = useState({ enviados: 0, lidos: 0, falhas: 0, custoTotal: 0, porCategoria: {} });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);

    const agora = new Date();
    const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();

    const [{ data: dataClientes }, { data: logs }] = await Promise.all([
      supabase.from("clientes").select("*").eq("ativo", true),
      supabase
        .from("logs_envio")
        .select("status, status_entrega, categoria_cobranca, custo")
        .gte("enviado_em", inicioDoMes),
    ]);

    setClientes(dataClientes ?? []);

    const resumo = { enviados: 0, lidos: 0, falhas: 0, custoTotal: 0, porCategoria: {} };
    for (const log of logs ?? []) {
      if (log.status === "enviado") {
        resumo.enviados += 1;
        resumo.custoTotal += Number(log.custo || 0);
        if (log.status_entrega === "lido") resumo.lidos += 1;
        const cat = log.categoria_cobranca || "MARKETING";
        resumo.porCategoria[cat] = (resumo.porCategoria[cat] || 0) + Number(log.custo || 0);
      } else if (log.status === "falhou") {
        resumo.falhas += 1;
      }
    }
    setResumoMes(resumo);

    setCarregando(false);
  }

  function formatarReais(valor) {
    return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const NOME_CATEGORIA = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Autenticação" };

  const mesAtual = new Date().getMonth() + 1;

  const porMes = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({
    mes: m,
    clientes: clientes
      .filter((c) => new Date(c.aniversario + "T00:00:00").getMonth() + 1 === m)
      .sort((a, b) => new Date(a.aniversario).getDate() - new Date(b.aniversario).getDate()),
  }));

  const grupoMesAtual = porMes.find((g) => g.mes === mesAtual);
  const outrosMeses = porMes.filter((g) => g.mes !== mesAtual && g.clientes.length > 0);

  return (
    <>
      <div className="page-header">
        <h1>Aniversariantes por mês</h1>
        <p>
          Todo dia 1º, o sistema dispara automaticamente para todos os clientes que fazem
          aniversário naquele mês.
        </p>
      </div>

      {carregando && <p style={{ color: "var(--muted)" }}>Carregando...</p>}

      {!carregando && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>💰 Resumo deste mês (aniversários + campanhas)</h3>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>MENSAGENS ENVIADAS</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{resumoMes.enviados}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>VISUALIZADAS</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--green)" }}>{resumoMes.lidos}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>FALHAS</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: resumoMes.falhas > 0 ? "var(--red)" : "var(--text)" }}>
                {resumoMes.falhas}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>VALOR TOTAL A PAGAR</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--gold)" }}>{formatarReais(resumoMes.custoTotal)}</div>
            </div>
          </div>

          {Object.keys(resumoMes.porCategoria).length > 0 && (
            <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
              {Object.entries(resumoMes.porCategoria).map(([cat, valor]) => (
                <span key={cat} style={{ fontSize: 12, color: "var(--muted)" }}>
                  {NOME_CATEGORIA[cat] || cat}: <strong style={{ color: "var(--text)" }}>{formatarReais(valor)}</strong>
                </span>
              ))}
            </div>
          )}

          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
            Estimativa com base nos preços configurados em "Configurações" — a fatura real vem da Meta.
          </p>
        </div>
      )}

      {!carregando && clientes.length === 0 && (
        <div className="card empty-state">
          <h3>Nenhum cliente cadastrado ainda</h3>
          <p>Vá em "Clientes" para adicionar o primeiro.</p>
        </div>
      )}

      {!carregando && clientes.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontSize: 15 }}>
                🎉 {MESES[mesAtual - 1]} (mês atual) — {grupoMesAtual?.clientes.length ?? 0} cliente(s)
              </h3>
              <span className="default-pill">DISPARO DESTE MÊS</span>
            </div>

            {!grupoMesAtual || grupoMesAtual.clientes.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 14 }}>
                Nenhum aniversariante em {MESES[mesAtual - 1]}.
              </p>
            ) : (
              <div className="row-list">
                {grupoMesAtual.clientes.map((c) => {
                  const nascimento = new Date(c.aniversario + "T00:00:00");
                  return (
                    <div className="client-row" key={c.id}>
                      <div className="day-badge today">
                        <span className="num">{String(nascimento.getDate()).padStart(2, "0")}</span>
                        <span className="mon">{MESES_ABREV[nascimento.getMonth()]}</span>
                      </div>
                      <div className="info">
                        <div className="name">{c.nome}</div>
                        <div className="phone">{c.telefone}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {outrosMeses.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 14 }}>Próximos meses</h3>
              <div className="row-list">
                {outrosMeses.map((g) => (
                  <div className="client-row" key={g.mes} style={{ alignItems: "flex-start" }}>
                    <div className="day-badge">
                      <span className="num">{g.clientes.length}</span>
                      <span className="mon">{MESES_ABREV[g.mes - 1]}</span>
                    </div>
                    <div className="info">
                      <div className="name">{MESES[g.mes - 1]}</div>
                      <div className="phone">{g.clientes.map((c) => c.nome).join(", ")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
