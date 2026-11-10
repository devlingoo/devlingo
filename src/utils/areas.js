const list = require("../data/areas.json");
const challenges = require("./challenges");

// Áreas (Frontend, Backend...) são só etiquetas sobre os assuntos: um assunto pode estar em
// várias áreas (JavaScript serve para Frontend e para Backend). Quem define isso é areas.json.

// Os ids vão dentro do customId dos botões (limite de 100 caracteres), por isso o limite de tamanho e quantidade.
const MAX_AREAS = 6;
const ID_PATTERN = /^[a-z0-9-]{1,10}$/;

// Validação antecipada, como a dos desafios: dado inválido impede o bot de iniciar.
const knownTopics = new Set(challenges.list.map((c) => c.topic.id));
const seen = new Set();
if (!Array.isArray(list) || list.length === 0 || list.length > MAX_AREAS) {
  throw new Error(`areas.json: precisa ter de 1 a ${MAX_AREAS} áreas`);
}
for (const area of list) {
  const where = `areas.json (${area.id ?? "sem id"})`;
  if (!ID_PATTERN.test(area.id ?? "") || seen.has(area.id)) {
    throw new Error(`${where}: id inválido ou repetido (até 10 caracteres: a-z, 0-9 e hífen)`);
  }
  seen.add(area.id);
  if (!area.label || !area.emoji || !area.description || area.description.length > 100) {
    throw new Error(`${where}: faltam label, emoji ou description (de até 100 caracteres)`);
  }
  if (!Array.isArray(area.topics) || area.topics.length === 0) {
    throw new Error(`${where}: topics precisa ter pelo menos um assunto`);
  }
  for (const topicId of area.topics) {
    if (!knownTopics.has(topicId)) throw new Error(`${where}: o assunto "${topicId}" não existe em challenges.json`);
  }
}

const hasContent = (topicId) => challenges.list.some((c) => c.topic.id === topicId);
const get = (id) => list.find((a) => a.id === id) ?? null;

module.exports = {
  list,
  get,
  // Só as áreas que têm pelo menos um assunto com desafios.
  available: () => list.filter((a) => a.topics.some(hasContent)),
  // Ids de assuntos que pertencem a qualquer uma das áreas informadas.
  topicIdsFor: (areaIds) => new Set(areaIds.flatMap((id) => get(id)?.topics ?? [])),
  // "frontend,backend" -> ["frontend", "backend"], ignorando o que não existe e repetições.
  parse(value) {
    const wanted = new Set(String(value ?? "").split(",").map((s) => s.trim()));
    return list.filter((a) => wanted.has(a.id) && a.topics.some(hasContent)).map((a) => a.id);
  },
  // ["frontend", "backend"] -> "🎨 Frontend, ⚙️ Backend"
  labels: (areaIds) =>
    areaIds
      .map(get)
      .filter(Boolean)
      .map((a) => `${a.emoji} ${a.label}`)
      .join(", "),
};
