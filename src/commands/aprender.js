const challenges = require("../utils/challenges");
const { sendV2, notice, learningLevelMenu } = require("../utils/ui");

module.exports = {
  name: "aprender",
  aliases: ["learn", "estudar", "trilha"],
  description: "escolha seu nível e o assunto exato que deseja estudar",
  usage: "aprender",

  async execute({ message }) {
    if (challenges.availableDifficulties().length === 0) {
      return sendV2(message.channel, notice("Ainda não há desafios cadastrados."));
    }
    return sendV2(message.channel, learningLevelMenu(message.author.id));
  },
};
