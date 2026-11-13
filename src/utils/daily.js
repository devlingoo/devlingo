// Desafio do dia: uma pergunta por nível a cada dia, igual para todo mundo daquele nível.
// Sem banco nem Discord (quem já acertou hoje fica em db.hasDoneDaily).
const crypto = require("crypto");
const challenges = require("./challenges");
const config = require("../config");
const { dayKey, daysBetween } = require("./time");

// A ordem das perguntas de um nível é embaralhada de um jeito fixo (depende só do nível e dos ids), e o
// dia anda por ela uma pergunta por vez: nada se repete até o nível inteiro passar, e o bot reiniciar
// não muda a pergunta de hoje. Acrescentar perguntas ao nível muda a ordem dali em diante.
const rank = (levelId, challengeId) => crypto.createHash("sha256").update(`${levelId}:${challengeId}`).digest("hex");

function cycleOf(levelId) {
  return challenges.list
    .filter((c) => c.difficulty === levelId)
    .map((c) => ({ c, key: rank(levelId, c.id) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ c }) => c);
}

// A pergunta do dia (`day` = YYYY-MM-DD) no nível `levelId`, ou null se o nível não tem desafios.
function challengeFor(levelId, day) {
  const cycle = cycleOf(levelId);
  if (cycle.length === 0) return null;
  return cycle[daysBetween("1970-01-01", day) % cycle.length];
}

// O "hoje" do bot (no fuso configurado) para quem chama.
const todayKey = (now = new Date()) => dayKey(now, config.timezone);

module.exports = { challengeFor, todayKey };
