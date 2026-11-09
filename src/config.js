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

  colors: {
    brand: 0x5865f2,
    success: 0x57f287,
    danger: 0xed4245,
    muted: 0x747f8d,
  },
};
