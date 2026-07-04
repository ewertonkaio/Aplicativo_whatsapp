import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [ehAdmin, setEhAdmin] = useState(false);

  useEffect(() => {
    verificarAdmin();
  }, []);

  async function verificarAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("perfis").select("is_admin").eq("id", user.id).single();
    setEhAdmin(!!data?.is_admin);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="mark">A</div>
          <span>Aniversário</span>
        </div>

        <NavLink to="/" end className="nav-link">📅 Próximos aniversários</NavLink>
        <NavLink to="/clientes" className="nav-link">👥 Clientes</NavLink>
        <NavLink to="/templates" className="nav-link">✉️ Templates (modelos)</NavLink>
        <NavLink to="/campanhas" className="nav-link">🚀 Campanhas</NavLink>
        <NavLink to="/historico" className="nav-link">📨 Histórico de envios</NavLink>
        <NavLink to="/configuracoes" className="nav-link">⚙️ Configurações</NavLink>
        {ehAdmin && (
          <NavLink to="/admin/precos" className="nav-link">🔒 Painel Admin</NavLink>
        )}

        <div className="sidebar-footer">
          <button className="btn-logout" onClick={handleLogout}>Sair</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
