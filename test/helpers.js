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
    user: { id: userId, displayName: "Ana", displayAvatarURL: () => "https://cdn.example/avatar.png" },
    member: null,
    guild: null,
    guildId: "g1",
    message: { id: messageId },
    values,
    isStringSelectMenu: () => kind === "menu",
    isButton: () => kind === "button",
    inGuild: () => true,
    update: async (payload) => calls.push({ method: "update", payload }),
    reply: async (payload) => calls.push({ method: "reply", payload }),
    deferUpdate: async () => calls.push({ method: "deferUpdate" }),
    editReply: async (payload) => calls.push({ method: "editReply", payload }),
  };
}

const fakeClient = { user: { toString: () => "<@1>" }, users: { fetch: async (id) => ({ username: `usuario-${id}` }) } };

// Limites do Discord para mensagens Components V2: até 40 componentes e 4000 caracteres de texto.
function assertWithinDiscordLimits(components, label, assert) {
  const nodes = flatten(components);
  assert.ok(nodes.length <= 40, `${label}: ${nodes.length} componentes (limite 40)`);
  const texts = nodes.filter((n) => n.type === TYPE.TextDisplay);
  assert.ok(texts.every((t) => t.content.trim().length > 0), `${label}: texto vazio`);
  const chars = texts.reduce((sum, t) => sum + t.content.length, 0);
  assert.ok(chars <= 4000, `${label}: ${chars} caracteres de texto (limite 4000)`);
  for (const n of nodes) {
    if (n.custom_id) assert.ok(n.custom_id.length <= 100, `${label}: custom_id longo: ${n.custom_id}`);
  }
}

module.exports = { TYPE, flatten, customIds, fakeInteraction, fakeClient, assertWithinDiscordLimits };
