const study = require("../utils/study");
const { sendV2, setupAreasMenu } = require("../utils/ui");

module.exports = {
  name: "configurar",
  aliases: ["setup", "config", "configuracao", "preferencias", "comecar"],
  description: "escolha suas áreas (Frontend, Backend...) e seu nível; dá para mudar quando quiser",
  usage: "configurar",

  async execute({ message }) {
    const ownerId = message.author.id;
    return sendV2(message.channel, setupAreasMenu(ownerId, { current: study.preferencesOf(ownerId) }));
  },
};
