import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [modo, setModo] = useState("login"); // 'login' | 'cadastro'
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setAviso("");
    setCarregando(true);

    if (modo === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setErro(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome_completo: nomeCompleto } },
      });
      if (error) setErro(error.message);
      else setAviso("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
    }

    setCarregando(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="mark">A</div>
        <h1>{modo === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="sub">
          Lembretes de aniversário para seus clientes, disparados pelo seu próprio WhatsApp.
        </p>

        <form onSubmit={handleSubmit}>
          {modo === "cadastro" && (
            <div className="field">
              <label>Nome</label>
              <input value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={6}
              required
            />
          </div>

          <button className="btn btn-primary" style={{ width: "100%" }} disabled={carregando}>
            {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {erro && <p className="error-text">{erro}</p>}
        {aviso && <p className="success-text">{aviso}</p>}

        <p style={{ marginTop: 18, fontSize: 13, color: "var(--muted)" }}>
          {modo === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
          <button
            type="button"
            onClick={() => setModo(modo === "login" ? "cadastro" : "login")}
            style={{ background: "none", border: "none", color: "var(--gold)", cursor: "pointer", fontWeight: 600 }}
          >
            {modo === "login" ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </div>
    </div>
  );
}
