require("dotenv").config();
const path = require("path");

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

function validTimezone(name) {
  try {
    new Intl.DateTimeFormat("sv-SE", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

// Número inteiro >= 0 vindo do ambiente (0 desliga o limite); valor inválido usa o padrão.
function nonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

const requestedTimezone = process.env.TIMEZONE?.trim();
if (requestedTimezone && !validTimezone(requestedTimezone)) {
  console.warn(`TIMEZONE "${requestedTimezone}" é inválido; usando ${DEFAULT_TIMEZONE}.`);
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  // Se definido, nos servidores o bot só responde nesse canal (DMs sempre funcionam)
  allowedChannelId: process.env.ALLOWED_CHANNEL_ID || "",

  // Banco SQLite. Fica na pasta data/ da raiz (ignorada pelo git).
  dbPath: process.env.DB_PATH?.trim() || path.join(__dirname, "../data/devlingo.db"),
  // Fuso que define "o dia" da sequência de dias e do limite diário de XP.
  timezone: requestedTimezone && validTimezone(requestedTimezone) ? requestedTimezone : DEFAULT_TIMEZONE,

  xpCorrect: 10, // XP por acerto
  xpPerLevel: 100, // XP necessário para subir de nível
  // Máximo de XP que cada pessoa ganha por dia (0 = sem limite). Passou disso, ainda dá para
  // treinar e ver as explicações, mas o XP só volta no dia seguinte.
  dailyXpCap: nonNegativeInt(process.env.DAILY_XP_CAP, 200),
  challengeTtlMs: 5 * 60 * 1000, // depois disso o desafio expira
  cooldownMs: 3000, // intervalo mínimo entre comandos da mesma pessoa

  // ---- Estímulos de hábito. Os bônus abaixo ficam FORA do limite diário de XP: são raros
  // (uma vez por dia, por marco ou a cada N acertos seguidos) e premiam constância, não volume.
  // Meta diária: quantas respostas (certas ou erradas) por dia cumprem a meta (0 desliga).
  dailyGoal: nonNegativeInt(process.env.DAILY_GOAL, 5),
  goalBonusXp: 15, // XP ao cumprir a meta do dia (uma vez por dia)
  // Marcos de sequência: dias seguidos -> XP de bônus no dia em que o marco é atingido.
  streakMilestones: { 3: 10, 7: 30, 14: 60, 30: 150, 60: 300, 100: 500 },
  comboEvery: 5, // a cada N acertos seguidos, o combo dá um bônus
  comboBonusXp: 5,
  // Congelamento de sequência: a cada `freezeEvery` dias seguidos a pessoa ganha 1 (0 desliga), guarda
  // no máximo `freezeMax`, e cada um salva um dia sem responder, sozinho, quando ela volta.
  freezeEvery: 7,
  freezeMax: 2,
  // Desafio do dia (comando diario): XP extra no primeiro acerto do dia, FORA do limite diário (0 desliga o bônus).
  dailyChallengeBonusXp: 10,

  // ---- Cursos e certificados. Um módulo (assunto) de um nível está concluído quando a pessoa
  // acertou pelo menos esta porcentagem das perguntas DIFERENTES dele. Acertar a mesma pergunta
  // várias vezes não conta mais de uma vez. 1 a 100.
  coursePassPercent: Math.min(100, Math.max(1, nonNegativeInt(process.env.COURSE_PASS_PERCENT, 75) || 75)),

  // ---- Sugestão de subir de nível. Vale o nível escolhido em "configurar": olha as últimas N respostas
  // nele e, com pelo menos P% de acerto, a mensagem convida a subir (N = 0 desliga). Só sugere; quem
  // decide é a pessoa. Depois de sugerir, a contagem recomeça do zero.
  levelUpWindow: nonNegativeInt(process.env.LEVEL_UP_WINDOW, 20),
  levelUpPercent: Math.min(100, Math.max(1, nonNegativeInt(process.env.LEVEL_UP_PERCENT, 90) || 90)),

  // Cores da marca (a paleta completa e o porquê de cada uma estão em brand/guide.html).
  // Os valores são os mesmos de brand/tokens/colors.json.
  colors: {
    brand: 0x6c4dff, // Violeta Devlingo: mensagens padrão
    success: 0x2bd9a8, // Menta: acerto
    danger: 0xff5c7a, // Coral: erro
    muted: 0x6b6890, // Bruma: desafio expirado
    gold: 0xffb224, // Faísca: comemorações (subir de nível, meta, marcos, conquistas)
  },
};
