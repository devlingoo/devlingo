const areas = require("../utils/areas");
const challenges = require("../utils/challenges");
const db = require("../utils/db");
const study = require("../utils/study");
const { safeText } = require("../utils/text");
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
      // Do nível e das áreas dela, evitando repetir; se não houver nada, afrouxa aos poucos para sempre ter um desafio.
      const history = db.getSeen(ownerId);
      ch =
        challenges.random({ difficulty: prefs.level, topicIds: areas.topicIdsFor(prefs.areas) }, undefined, history) ??
        challenges.random({ difficulty: prefs.level }, undefined, history) ??
        challenges.random();
    }

    if (!ch) {
      const langs = challenges.languages().join(", ");
      // `language` é o que a pessoa digitou: passa por safeText antes de voltar numa mensagem.
      return sendV2(message.channel, notice(`Não tenho desafios de **${safeText(language, { max: 24 })}**. Disponíveis: ${langs}`));
    }

    const issuedAt = Date.now().toString(36);
    return sendV2(message.channel, challengeMessage(ch, ownerId, issuedAt));
  },
};
