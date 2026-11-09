const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../data/challenges.json");
const list = JSON.parse(fs.readFileSync(FILE, "utf-8"));

// Falha cedo (ao iniciar) se algum desafio estiver mal escrito
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
}

const byId = new Map(list.map((c) => [c.id, c]));

module.exports = {
  list,
  getById: (id) => byId.get(id),
  languages: () => [...new Set(list.map((c) => c.language))].sort(),
  random(language) {
    const pool = language ? list.filter((c) => c.language === language.toLowerCase()) : list;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  },
};
