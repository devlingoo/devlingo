const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/challenges.json");
const list = JSON.parse(fs.readFileSync(FILE, "utf-8"));

const DIFFICULTIES = [
  { id: "beginner", label: "Iniciante", emoji: "🟢", description: "Conceitos fundamentais e primeiros passos" },
  { id: "intermediate", label: "Intermediário", emoji: "🟡", description: "Aplicação prática e resolução de problemas" },
  { id: "advanced", label: "Avançado", emoji: "🟠", description: "Conceitos complexos e boas práticas" },
  { id: "expert", label: "Especialista", emoji: "🔴", description: "Arquitetura, otimização e domínio técnico" },
];

// O botão mostra "A) " + a alternativa e o Discord limita o rótulo a 80 caracteres.
const MAX_OPTION_LENGTH = 77;
// ids vão dentro do customId dos botões (separados por ":", limite de 100 caracteres).
const ID_PATTERN = /^[a-z0-9-]+$/;

// Validação antecipada: dados inválidos impedem o bot de iniciar.
const ids = new Set();
for (const c of list) {
  const where = `challenges.json (${c.id ?? "sem id"})`;
  if (!c.id || ids.has(c.id)) throw new Error(`${where}: id ausente ou repetido`);
  ids.add(c.id);
  if (!ID_PATTERN.test(c.id) || c.id.length > 16) {
    throw new Error(`${where}: id precisa ter até 16 caracteres (a-z, 0-9 e hífen)`);
  }
  if (!c.language || !c.question || !c.explanation) {
    throw new Error(`${where}: faltam language, question ou explanation`);
  }
  if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 4) {
    throw new Error(`${where}: options precisa ter de 2 a 4 itens`);
  }
  if (c.options.some((o) => typeof o !== "string" || !o || o.length > MAX_OPTION_LENGTH)) {
    throw new Error(`${where}: cada opção precisa ter de 1 a ${MAX_OPTION_LENGTH} caracteres`);
  }
  if (new Set(c.options).size !== c.options.length) {
    throw new Error(`${where}: opções repetidas`);
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
  if (!ID_PATTERN.test(c.topic.id) || c.topic.id.length > 32) {
    throw new Error(`${where}: topic.id precisa ter até 32 caracteres (a-z, 0-9 e hífen)`);
  }
}

const byId = new Map(list.map((c) => [c.id, c]));
const matches = ({ language, difficulty, topic } = {}) => list.filter((c) =>
  (!language || c.language === language.toLowerCase()) &&
  (!difficulty || c.difficulty === difficulty) &&
  (!topic || c.topic.id === topic)
);

function topics(difficulty) {
  const unique = new Map();
  for (const c of matches({ difficulty })) unique.set(c.topic.id, c.topic);
  return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

module.exports = {
  list,
  DIFFICULTIES,
  getById: (id) => byId.get(id),
  languages: () => [...new Set(list.map((c) => c.language))].sort(),
  topics,
  // Só os níveis que já têm pelo menos um desafio cadastrado.
  availableDifficulties: () => DIFFICULTIES.filter((d) => topics(d.id).length > 0),
  difficultyLabel: (id) => DIFFICULTIES.find((d) => d.id === id)?.label ?? id,
  // `excludeId` evita repetir o desafio que acabou de ser respondido (se houver outro no grupo).
  random(filters, excludeId) {
    // Mantém compatibilidade com o comando antigo: random("python").
    const normalized = typeof filters === "string" ? { language: filters } : filters;
    const pool = matches(normalized);
    const fresh = excludeId ? pool.filter((c) => c.id !== excludeId) : pool;
    const source = fresh.length ? fresh : pool;
    return source.length ? source[Math.floor(Math.random() * source.length)] : null;
  },
};
