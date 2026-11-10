// Contas de progresso (nível, títulos, marcos). Sem banco nem Discord: só funções puras.
const config = require("../config");

const levelOf = (xp) => Math.floor(Math.max(0, xp) / config.xpPerLevel) + 1;

// { level, into, needed, percent }: quanto da barra do nível atual já foi preenchida.
function levelProgress(xp) {
  const into = Math.max(0, xp) % config.xpPerLevel;
  return {
    level: levelOf(xp),
    into,
    needed: config.xpPerLevel,
    percent: Math.round((into / config.xpPerLevel) * 100),
  };
}

// Títulos por faixa de nível. Substantivos neutros, para servir a qualquer pessoa.
const TITLES = [
  { from: 1, emoji: "🌱", name: "Semente" },
  { from: 3, emoji: "🌿", name: "Broto" },
  { from: 5, emoji: "🌳", name: "Árvore" },
  { from: 8, emoji: "⚡", name: "Faísca" },
  { from: 12, emoji: "🔥", name: "Chama" },
  { from: 20, emoji: "👑", name: "Lenda" },
];

function titleFor(level) {
  let current = TITLES[0];
  for (const title of TITLES) if (level >= title.from) current = title;
  return current;
}

// Barra de progresso: ▰▰▰▱▱ (valores fora do intervalo são aparados).
function progressBar(value, max, size = 10) {
  if (max <= 0) return "▱".repeat(size);
  const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

// Próximo marco de sequência ainda não atingido: { days, bonus, left } ou null.
function nextMilestone(streak) {
  const days = Object.keys(config.streakMilestones)
    .map(Number)
    .sort((a, b) => a - b)
    .find((d) => d > streak);
  return days ? { days, bonus: config.streakMilestones[days], left: days - streak } : null;
}

module.exports = { levelOf, levelProgress, titleFor, progressBar, nextMilestone };
