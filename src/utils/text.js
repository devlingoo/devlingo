const { escapeMarkdown } = require("discord.js");

const ZERO_WIDTH = "​";

// Texto vindo de uma pessoa (apelido, nome de usuário, o que ela digitou) para mostrar numa
// mensagem do bot. O `escapeMarkdown` do discord.js NÃO cobre três coisas que precisam de cuidado:
//   - links mascarados  [Ganhe Nitro](https://golpe.example)  viram um link clicável com aparência legítima;
//   - autolinks e menções  <https://...>  <@123>  (a menção não pinga, mas mostra o nome de outra pessoa);
//   - endereços http(s):// soltos, que o Discord transforma em link.
// Aqui os colchetes e os sinais < > ganham barra invertida, o "://" é quebrado com um caractere
// invisível e @everyone/@here perdem o efeito. Domínios soltos (sem http) continuam como texto honesto.
function safeText(value, { max = 32, fallback = "(sem nome)" } = {}) {
  const flat = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  const cut = [...flat].slice(0, max).join(""); // corta antes de escapar, para não partir uma sequência de escape
  const safe = escapeMarkdown(cut)
    .replace(/[[\]<>]/g, "\\$&")
    .replace(/(https?):\/\//gi, `$1:${ZERO_WIDTH}//`)
    .replace(/@(everyone|here)/gi, `@${ZERO_WIDTH}$1`)
    .trim();
  return safe || fallback;
}

module.exports = { safeText };
