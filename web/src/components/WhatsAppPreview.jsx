// Renderiza um preview visual parecido com uma conversa do WhatsApp,
// aplicando a formatação básica que o WhatsApp reconhece (*negrito*,
// _itálico_, ~tachado~) e substituindo {{1}} por um nome de exemplo.

function formatarTextoWhatsApp(texto) {
  // Escapa HTML antes de aplicar as tags de formatação
  const escapado = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escapado
    .replace(/\*(.+?)\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/~(.+?)~/g, "<del>$1</del>")
    .replace(/\n/g, "<br/>");
}

export default function WhatsAppPreview({ texto, nomeExemplo }) {
  const textoComExemplo = (texto || "").replaceAll("{{1}}", nomeExemplo || "Maria");
  const horaAgora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="wa-preview-phone">
      <div className="wa-preview-header">
        <div className="wa-preview-avatar">🏢</div>
        <div>
          <div className="wa-preview-name">Sua Empresa</div>
          <div className="wa-preview-status">online</div>
        </div>
      </div>

      <div className="wa-preview-chat">
        <div className="wa-preview-bubble">
          <span dangerouslySetInnerHTML={{ __html: formatarTextoWhatsApp(textoComExemplo) || "…" }} />
          <span className="wa-preview-meta">
            {horaAgora} <span className="wa-preview-check">✔✔</span>
          </span>
        </div>
      </div>
    </div>
  );
}
