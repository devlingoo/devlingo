// Deixa um nome de comando comparável: minúsculas, sem acentos e sem pontuação no fim.
// "Configuração!" -> "configuracao", "perfil?" -> "perfil".
function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.,;:!?…]+$/u, "");
}

// Extrai { name, args } de uma mensagem, ou null se ela não é para o bot.
// - Em servidores: a mensagem precisa começar marcando o bot ("@Devlingo desafio").
// - Em DM: vale direto ("desafio"), com ou sem "!" ou "/" na frente.
// - Só marcar o bot mostra a ajuda. Uma DM sem texto (foto, figurinha, GIF) é ignorada.
function parseCommand(content, botId, isDM) {
  const text = (content ?? "").trim();
  const mention = new RegExp(`^<@!?${botId}>\\s*`);

  let rest;
  let mentioned = false;
  if (mention.test(text)) {
    mentioned = true;
    rest = text.replace(mention, "");
  } else if (isDM) {
    rest = text;
  } else {
    return null;
  }

  rest = rest.replace(/^[!/]/, "").trim();
  if (!rest) return mentioned ? { name: "ajuda", args: [] } : null;

  const [name, ...args] = rest.split(/\s+/);
  return { name: normalizeName(name), args };
}

module.exports = { parseCommand, normalizeName };
