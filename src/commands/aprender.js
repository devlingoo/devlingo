const views = require("../utils/views");
const { sendV2 } = require("../utils/ui");

module.exports = {
  name: "aprender",
  aliases: ["learn", "estudar", "trilha"],
  description: "estude o assunto exato que você escolher, no seu nível e nas suas áreas",
  usage: "aprender",
  category: "estudar",
  order: 2,

  async execute({ message }) {
    return sendV2(message.channel, views.studyEntry(message.author.id));
  },
};
