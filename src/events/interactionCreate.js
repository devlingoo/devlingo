const { Events } = require("discord.js");
const buttonHandler = require("../handlers/buttonHandler");

module.exports = {
  name: Events.InteractionCreate,

  async execute(client, interaction) {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      return buttonHandler.handle(client, interaction);
    }
    // O bot usa prefixos e componentes; não depende de slash commands.
  },
};
