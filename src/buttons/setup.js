const { MessageFlags } = require("discord.js");
const db = require("../utils/db");
const areas = require("../utils/areas");
const challenges = require("../utils/challenges");
const study = require("../utils/study");
const { setupAreasMenu, setupLevelMenu, setupDoneMessage } = require("../utils/ui");

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const show = (interaction, components) =>
  interaction.update({ components, flags: MessageFlags.IsComponentsV2 });

// customId dos componentes da configuração (o dono vai sempre no 3º campo):
//   setup:start:<dono>                  botão "Alterar": recomeça pelo passo 1
//   setup:areas:<dono>                  menu do passo 1 (uma ou mais áreas)
//   setup:level:<dono>:<áreas>          menu do passo 2 (nível); as áreas escolhidas vão no customId
//   setup:up:<dono>:<nível>             botão "Subir para ..." da sugestão de subir de nível
// Nada é gravado até o passo 2 terminar, então abandonar no meio não muda a configuração atual.
module.exports = {
  prefix: "setup",

  async execute(interaction, parts) {
    const [, stage, ownerId, arg] = parts; // arg: as áreas (passo do nível) ou o nível novo (botão de subir)

    if (interaction.user.id !== ownerId) {
      return interaction.reply(ephemeral("Essa configuração é de outra pessoa. Use o comando configurar para fazer a sua."));
    }

    const invalid = () =>
      interaction.reply(ephemeral("Essa configuração não vale mais. Use o comando configurar para refazer."));

    if (stage === "start" && interaction.isButton()) {
      return show(interaction, setupAreasMenu(ownerId, { current: study.preferencesOf(ownerId) }));
    }

    // Botão "Subir para ..." da sugestão que aparece depois de uma resposta. Vai numa resposta à parte
    // (só da pessoa), para a explicação da pergunta continuar na tela.
    if (stage === "up" && interaction.isButton()) {
      const { status, prefs } = study.promote(ownerId, arg);
      if (status === "ok") {
        return interaction.reply({
          components: setupDoneMessage(ownerId, prefs, { promoted: true }),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      if (status === "already") {
        return interaction.reply(ephemeral(`Você já está no nível ${challenges.difficultyLabel(prefs.level)}.`));
      }
      return invalid();
    }

    if (stage === "areas" && interaction.isStringSelectMenu()) {
      const areaIds = areas.parse(interaction.values.join(","));
      if (areaIds.length === 0) return invalid();
      return show(interaction, setupLevelMenu(ownerId, areaIds, { current: study.preferencesOf(ownerId) }));
    }

    if (stage === "level" && interaction.isStringSelectMenu()) {
      const areaIds = areas.parse(arg);
      const level = challenges.availableDifficulties().find((d) => d.id === interaction.values[0]);
      if (areaIds.length === 0 || !level) return invalid();

      const prefs = { level: level.id, areas: areaIds };
      db.setPreferences(ownerId, prefs);
      return show(interaction, setupDoneMessage(ownerId, prefs));
    }
  },
};
