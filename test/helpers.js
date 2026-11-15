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

// Como desfazer cada migração do banco (a de número N cria o que está em DOWNGRADES[N]). Ao acrescentar uma
// migração em src/utils/db.js, acrescente aqui a linha que a desfaz: os testes de "banco antigo" dependem disso.
const DOWNGRADES = {
  7: "DROP TABLE league_xp; DROP TABLE league_members;",
  6: "ALTER TABLE users DROP COLUMN freezes; DROP TABLE daily_done;",
  5: "ALTER TABLE users DROP COLUMN recent;",
};

// Volta um banco em arquivo (já migrado e FECHADO) para a versão `version`, apagando o que as migrações
// seguintes criaram, como se ele nunca tivesse passado por elas.
function downgradeTo(file, version) {
  const { DatabaseSync } = require("node:sqlite");
  const raw = new DatabaseSync(file);
  try {
    const { user_version: current } = raw.prepare("PRAGMA user_version").get();
    for (let v = current; v > version; v--) {
      if (!DOWNGRADES[v]) throw new Error(`helpers.js: falta DOWNGRADES[${v}] (como desfazer a migração ${v})`);
      raw.exec(DOWNGRADES[v]);
    }
    raw.exec(`PRAGMA user_version = ${version}`);
  } finally {
    raw.close();
  }
}

module.exports = { TYPE, flatten, customIds, fakeInteraction, fakeClient, assertWithinDiscordLimits, downgradeTo };
