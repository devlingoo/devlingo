const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/challenges.json");
const list = JSON.parse(fs.readFileSync(FILE, "utf-8"));

const DIFFICULTIES = [
  { id: "beginner", label: "Iniciante", description: "Conceitos fundamentais e primeiros passos" },
  { id: "intermediate", label: "Intermediário", description: "Aplicação prática e resolução de problemas" },
  { id: "advanced", label: "Avançado", description: "Conceitos complexos e boas práticas" },
  { id: "expert", label: "Especialista", description: "Arquitetura, otimização e domínio técnico" },
];

// Validação antecipada: dados inválidos impedem o bot de iniciar.
const ids = new Set();
for (const c of list) {
  const where = `challenges.json (${c.id ?? "sem id"})`;
  if (!c.id || ids.has(c.id)) throw new Error(`${where}: id ausente ou repetido`);
  ids.add(c.id);
  if (!c.language || !c.question || !c.explanation) {
    throw new Error(`${where}: faltam language, question ou explanation`);
  }
  if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 4) {
    throw new Error(`${where}: options precisa ter de 2 a 4 itens`);
  }
  if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer >= c.options.length) {
    throw new Error(`${where}: answer precisa ser o índice de uma opção`);
  }
  if (!DIFFICULTIES.some((d) => d.id === c.difficulty)) {
    throw new Error(`${where}: difficulty inválida ou ausente`);
  }
  if (!c.topic?.id || !c.topic?.label || !c.topic?.description) {
    throw new Error(`${where}: topic precisa de id, label e description`);
  }
}

const byId = new Map(list.map((c) => [c.id, c]));
const matches = ({ language, difficulty, topic } = {}) => list.filter((c) =>
  (!language || c.language === language.toLowerCase()) &&
  (!difficulty || c.difficulty === difficulty) &&
  (!topic || c.topic.id === topic)
);

module.exports = {
  list,
  DIFFICULTIES,
  getById: (id) => byId.get(id),
  languages: () => [...new Set(list.map((c) => c.language))].sort(),
  topics(difficulty) {
    const unique = new Map();
    for (const c of matches({ difficulty })) unique.set(c.topic.id, c.topic);
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  },
  random(filters) {
    // Mantém compatibilidade com o comando antigo: random("python").
    const normalized = typeof filters === "string" ? { language: filters } : filters;
    const pool = matches(normalized);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  },
};
