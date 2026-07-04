import { useState, useRef, useEffect } from "react";

const CATEGORIAS = {
  "Comemoração": ["🎉", "🎂", "🎈", "🎁", "🥳", "🍰", "✨", "🎊", "🍾", "🥂", "🎇", "🎆"],
  "Sorrisos": ["😀", "😄", "😁", "😊", "🙂", "😉", "😍", "🥰", "😘", "🤗", "😎", "🤩"],
  "Mãos e gestos": ["👏", "🙌", "🙏", "👍", "🤝", "💪", "✌️", "🤙", "👋", "🫶", "❤️", "💛"],
  "Símbolos": ["⭐", "🌟", "💫", "🔥", "✅", "📅", "📲", "💬", "📌", "🎯", "💼", "🛍️"],
};

export default function EmojiPicker({ onSelect }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, []);

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={() => setAberto((v) => !v)}
        title="Inserir emoji"
      >
        😀 Emoji
      </button>

      {aberto && (
        <div className="emoji-popover">
          {Object.entries(CATEGORIAS).map(([categoria, emojis]) => (
            <div key={categoria} style={{ marginBottom: 8 }}>
              <div className="emoji-popover-label">{categoria}</div>
              <div className="emoji-grid">
                {emojis.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    className="emoji-btn"
                    onClick={() => {
                      onSelect(emoji);
                      setAberto(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
