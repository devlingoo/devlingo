const views = require("../utils/views");
const { sendV2 } = require("../utils/ui");

module.exports = {
  name: "conquistas",
  aliases: ["conquista", "medalhas", "badges"],
  description: "suas medalhas: as que você já ganhou e as que faltam",
  usage: "conquistas",
  category: "voce",
  order: 3,

  async execute({ message }) {
    return sendV2(message.channel, views.achievements(message.author.id));
  },
};
