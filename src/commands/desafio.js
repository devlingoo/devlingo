const challenges = require("../utils/challenges");
const { sendV2, notice, challengeMessage } = require("../utils/ui");

module.exports = {
  name: "desafio",
  aliases: ["quiz", "d"],
  description: "um desafio aleatório (ou de uma linguagem: python, javascript, sql, git)",
  usage: "desafio [linguagem]",

  async execute({ message, args }) {
    const language = args[0];
    const ch = challenges.random(language);

    if (!ch) {
      const langs = challenges.languages().join(", ");
      return sendV2(message.channel, notice(`Não tenho desafios de **${language}**. Disponíveis: ${langs}`));
    }

    const issuedAt = Date.now().toString(36);
    return sendV2(message.channel, challengeMessage(ch, message.author.id, issuedAt));
  },
};
