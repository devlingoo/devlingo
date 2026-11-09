// Utilitários dos testes: percorrem os componentes e simulam interações do Discord.

// Tipos de componente da API do Discord (só os que os testes usam).
const TYPE = { Button: 2, StringSelect: 3, Section: 9, TextDisplay: 10, Separator: 14, Container: 17 };

// Transforma builders em JSON (isso já roda a validação do discord.js) e achata a árvore.
function flatten(components) {
  const out = [];
  const walk = (node) => {
    out.push(node);
    for (const child of node.components ?? []) walk(child);
    if (node.accessory) walk(node.accessory);
  };
  for (const c of components) walk(c.toJSON ? c.toJSON() : c);
  return out;
}

const customIds = (components) => flatten(components).map((n) => n.custom_id).filter(Boolean);

function fakeInteraction({ customId, userId = "100", kind, values = [], messageId = "m1" }) {
  const calls = [];
  return {
    calls,
    customId,
    user: { id: userId },
    guildId: "g1",
    message: { id: messageId },
    values,
    isStringSelectMenu: () => kind === "menu",
    isButton: () => kind === "button",
    inGuild: () => true,
    update: async (payload) => calls.push({ method: "update", payload }),
    reply: async (payload) => calls.push({ method: "reply", payload }),
    deferUpdate: async () => calls.push({ method: "deferUpdate" }),
  };
}

const fakeClient = { user: { toString: () => "<@1>" } };

module.exports = { TYPE, flatten, customIds, fakeInteraction, fakeClient };
