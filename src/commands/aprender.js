const challenges = require("../utils/challenges");
const study = require("../utils/study");
const { sendV2, notice, learningLevelMenu, setupAreasMenu } = require("../utils/ui");

module.exports = {
  name: "aprender",
  aliases: ["learn", "estudar", "trilha"],
  description: "estude o assunto exato que você escolher, no seu nível e nas suas áreas",
  usage: "aprender",

  async execute({ message }) {
    if (challenges.availableDifficulties().length === 0) {
      return sendV2(message.channel, notice("Ainda não há desafios cadastrados."));
    }

    const ownerId = message.author.id;
    const prefs = study.preferencesOf(ownerId);

    // Primeira vez: a configuração (áreas e nível) vem antes de qualquer pergunta.
    if (!prefs) return sendV2(message.channel, setupAreasMenu(ownerId, { intro: true }));

    // Já configurado: abre direto nos assuntos do nível e das áreas dela.
    const topics = study.topicMenu(ownerId, prefs.level);
    return sendV2(message.channel, topics ?? learningLevelMenu(ownerId));
  },
};
