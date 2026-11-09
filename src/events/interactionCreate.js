const { Events } = require("discord.js");
const buttonHandler = require("../handlers/buttonHandler");

module.exports = {
  name: Events.InteractionCreate,

  async execute(client, interaction) {
    if (interaction.isButton()) return buttonHandler.handle(client, interaction);
    // Sem slash commands: não há outros tipos de interação para tratar.
  },
};
