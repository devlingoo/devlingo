const config = require("../config");
const daily = require("../utils/daily");
const db = require("../utils/db");
const study = require("../utils/study");
const { sendV2, notice, isDM, commandRef, challengeMessage, setupAreasMenu } = require("../utils/ui");

module.exports = {
  name: "diario",
  aliases: ["daily"],
  description: "o desafio do dia: uma pergunta por nível, igual para todo mundo, com XP de bônus",
  usage: "diario",
  category: "estudar",
  order: 3,

  async execute({ message, client }) {
    const ownerId = message.author.id;
    const prefs = study.preferencesOf(ownerId);

    // Primeira vez: a configuração vem antes de qualquer pergunta (o desafio do dia depende do nível).
    if (!prefs) return sendV2(message.channel, setupAreasMenu(ownerId, { intro: true }));

    const ch = daily.challengeFor(prefs.level, daily.todayKey());
    if (!ch) return sendV2(message.channel, notice("Ainda não há desafios cadastrados para o seu nível."));

    if (db.hasDoneDaily(ownerId)) {
      const ref = (command) => commandRef(client, !isDM(message), command);
      return sendV2(
        message.channel,
        notice(
          `📆 **Você já cumpriu o desafio de hoje!** ✅ O próximo chega à meia-noite (${config.timezone}). ` +
            `Até lá, que tal ${ref("aprender")} ou ${ref("desafio")}?`,
          config.colors.success
        )
      );
    }

    // Quem errou pode tentar de novo: o bônus é do primeiro acerto do dia, não da primeira tentativa.
    const issuedAt = Date.now().toString(36);
    return sendV2(message.channel, challengeMessage(ch, ownerId, issuedAt, { type: "open", isDaily: true }));
  },
};
