// Conquistas (medalhas). Cada uma tem uma regra sobre as estatísticas da pessoa; o banco só
// guarda quais já foram desbloqueadas. Para criar uma nova, acrescente na lista (a `key` nunca muda).
//
// Estatísticas recebidas: { answered, correct, streak, bestStreak, bestCombo, goalDoneDays,
//                           expertCorrect, level }
const LIST = [
  { key: "first", emoji: "👣", name: "Primeiro passo", description: "Responda sua primeira pergunta", test: (s) => s.answered >= 1 },
  { key: "correct10", emoji: "🎯", name: "Mira afiada", description: "Acerte 10 perguntas", test: (s) => s.correct >= 10 },
  { key: "correct50", emoji: "🏹", name: "Atirador de elite", description: "Acerte 50 perguntas", test: (s) => s.correct >= 50 },
  { key: "correct100", emoji: "🏆", name: "Centenário", description: "Acerte 100 perguntas", test: (s) => s.correct >= 100 },
  { key: "streak3", emoji: "🔥", name: "Pegando fogo", description: "Estude 3 dias seguidos", test: (s) => s.bestStreak >= 3 },
  { key: "streak7", emoji: "🌋", name: "Semana de fogo", description: "Estude 7 dias seguidos", test: (s) => s.bestStreak >= 7 },
  { key: "streak30", emoji: "☄️", name: "Mês imparável", description: "Estude 30 dias seguidos", test: (s) => s.bestStreak >= 30 },
  { key: "combo5", emoji: "⚡", name: "Em sequência", description: "Acerte 5 seguidas sem errar", test: (s) => s.bestCombo >= 5 },
  { key: "combo10", emoji: "💥", name: "Sem errar", description: "Acerte 10 seguidas sem errar", test: (s) => s.bestCombo >= 10 },
  { key: "goal1", emoji: "🏁", name: "Meta batida", description: "Cumpra a meta diária pela primeira vez", test: (s) => s.goalDoneDays >= 1 },
  { key: "goal7", emoji: "📅", name: "Rotina de ferro", description: "Cumpra a meta diária em 7 dias", test: (s) => s.goalDoneDays >= 7 },
  { key: "expert1", emoji: "🧠", name: "Mente especialista", description: "Acerte uma pergunta do nível Especialista", test: (s) => s.expertCorrect >= 1 },
  { key: "level5", emoji: "🌳", name: "Crescendo", description: "Chegue ao nível 5", test: (s) => s.level >= 5 },
];

const byKey = new Map(LIST.map((a) => [a.key, a]));

module.exports = {
  list: LIST,
  get: (key) => byKey.get(key) ?? null,
  // Chaves das conquistas cujas regras as estatísticas já satisfazem (inclusive as já desbloqueadas).
  earned: (stats) => LIST.filter((a) => a.test(stats)).map((a) => a.key),
};
