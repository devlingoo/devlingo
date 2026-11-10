const views = require("../utils/views");
const { sendV2 } = require("../utils/ui");

module.exports = {
  name: "perfil",
  aliases: ["profile", "xp"],
  description: "seu nível, XP, sequência, meta do dia e estatísticas",
  usage: "perfil",
  category: "voce",
  order: 1,

  async execute({ message }) {
    return sendV2(
      message.channel,
      views.profile({
        ownerId: message.author.id,
        name: message.member?.displayName ?? message.author.displayName,
        avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 128 }),
      })
    );
  },
};
