require("dotenv").config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  // Se definido, nos servidores o bot só responde nesse canal (DMs sempre funcionam)
  allowedChannelId: process.env.ALLOWED_CHANNEL_ID || "",

  xpCorrect: 10, // XP por acerto
  xpPerLevel: 100, // XP necessário para subir de nível
  challengeTtlMs: 5 * 60 * 1000, // depois disso o desafio expira
  cooldownMs: 3000, // intervalo mínimo entre comandos da mesma pessoa

  colors: {
    brand: 0x5865f2,
    success: 0x57f287,
    danger: 0xed4245,
    muted: 0x747f8d,
  },
};
