const views = require("../utils/views");
const { sendV2 } = require("../utils/ui");

module.exports = {
  name: "configurar",
  aliases: ["setup", "config", "configuracao", "preferencias", "comecar"],
  description: "escolha suas áreas (Frontend, Backend...) e seu nível; dá para mudar quando quiser",
  usage: "configurar",
  category: "estudar",
  order: 1,

  async execute({ message }) {
    return sendV2(message.channel, views.setup(message.author.id));
  },
};
