// Extrai { name, args } de uma mensagem, ou null se ela não é para o bot.
// - Em servidores: a mensagem precisa começar marcando o bot ("@Devlingo desafio").
// - Em DM: vale direto ("desafio"), com ou sem "!" na frente.
function parseCommand(content, botId, isDM) {
  const text = (content ?? "").trim();
  const mention = new RegExp(`^<@!?${botId}>\\s*`);

  let rest;
  if (mention.test(text)) {
    rest = text.replace(mention, "");
  } else if (isDM) {
    rest = text;
  } else {
    return null;
  }

  rest = rest.replace(/^!/, "").trim();
  if (!rest) return { name: "ajuda", args: [] }; // só marcou o bot -> ajuda

  const [name, ...args] = rest.split(/\s+/);
  return { name: name.toLowerCase(), args };
}

module.exports = { parseCommand };
