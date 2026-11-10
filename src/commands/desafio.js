const areas = require("../utils/areas");
const challenges = require("../utils/challenges");
const study = require("../utils/study");
const { sendV2, notice, challengeMessage, setupAreasMenu } = require("../utils/ui");

module.exports = {
  name: "desafio",
  aliases: ["quiz", "d"],
  description: "um desafio aleatório do seu nível e das suas áreas (ou de uma linguagem: python, javascript, sql, git)",
  usage: "desafio [linguagem]",
  category: "estudar",
  order: 3,

  async execute({ message, args }) {
    const ownerId = message.author.id;
    const prefs = study.preferencesOf(ownerId);

    // Primeira vez: a configuração vem antes de qualquer pergunta.
    if (!prefs) return sendV2(message.channel, setupAreasMenu(ownerId, { intro: true }));

    const language = args[0];
    let ch;
    if (language) {
      ch = challenges.random(language);
    } else {
      // Do nível e das áreas dela; se não houver nada, afrouxa aos poucos para sempre ter um desafio.
      ch =
        challenges.random({ difficulty: prefs.level, topicIds: areas.topicIdsFor(prefs.areas) }) ??
        challenges.random({ difficulty: prefs.level }) ??
        challenges.random();
    }

    if (!ch) {
      const langs = challenges.languages().join(", ");
      return sendV2(message.channel, notice(`Não tenho desafios de **${language}**. Disponíveis: ${langs}`));
    }

    const issuedAt = Date.now().toString(36);
    return sendV2(message.channel, challengeMessage(ch, ownerId, issuedAt));
  },
};
