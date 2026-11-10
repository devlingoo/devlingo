const { MessageFlags } = require("discord.js");
const challenges = require("../utils/challenges");
const db = require("../utils/db");
const study = require("../utils/study");
const { learningLevelMenu, challengeMessage } = require("../utils/ui");

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const show = (interaction, components) =>
  interaction.update({ components, flags: MessageFlags.IsComponentsV2 });

// Todos os componentes da trilha têm o customId "learn:<etapa>:<idDoDono>:...":
//   learn:difficulty:<dono>                               menu de níveis
//   learn:topic:<dono>:<nível>                            menu de assuntos
//   learn:next:<dono>:<nível>:<assunto>:<últimoDesafio>   botão "Próxima pergunta"
//   learn:topics:<dono>:<nível>[:all]                     botão "Trocar assunto" (":all" = todas as áreas)
//   learn:levels:<dono>                                   botão "Trocar nível"
//   learn:go:<dono>:<nível>:<assunto>                     botão "Praticar" (vem da tela de um curso)
module.exports = {
  prefix: "learn",

  async execute(interaction, parts) {
    const [, stage, ownerId, difficulty, topicId, lastId] = parts;

    if (interaction.user.id !== ownerId) {
      return interaction.reply(ephemeral("Essa seleção pertence a outra pessoa. Peça sua própria trilha com o comando aprender."));
    }

    const isMenu = interaction.isStringSelectMenu();
    const isButton = interaction.isButton();

    // Escolheu um nível no menu: mostra os assuntos dele.
    if (stage === "difficulty" && isMenu) return showTopics(interaction, ownerId, interaction.values[0]);

    // "Trocar assunto": volta ao menu de assuntos do mesmo nível (só as áreas da pessoa, ou todas com ":all").
    if (stage === "topics" && isButton) return showTopics(interaction, ownerId, difficulty, topicId === "all");

    // "Trocar nível": volta ao menu de níveis.
    if (stage === "levels" && isButton) {
      if (challenges.availableDifficulties().length === 0) {
        return interaction.reply(ephemeral("Ainda não há desafios cadastrados."));
      }
      return show(interaction, learningLevelMenu(ownerId));
    }

    // Escolheu o assunto no menu: primeira pergunta.
    if (stage === "topic" && isMenu) return ask(interaction, ownerId, difficulty, interaction.values[0]);

    // "Próxima pergunta": mais uma do mesmo nível e assunto.
    if (stage === "next" && isButton) return ask(interaction, ownerId, difficulty, topicId, lastId);

    // "Praticar" na tela de um curso: vai direto a uma pergunta do módulo e nível que faltam.
    if (stage === "go" && isButton) return ask(interaction, ownerId, difficulty, topicId);
  },
};

async function showTopics(interaction, ownerId, difficulty, showAll = false) {
  const menu = study.topicMenu(ownerId, difficulty, { showAll });
  if (!menu) {
    return interaction.reply(ephemeral("Ainda não há perguntas cadastradas nesse nível. Use aprender para escolher outro."));
  }
  return show(interaction, menu);
}

// Sorteia uma pergunta do nível e assunto escolhidos (nunca de outro assunto).
async function ask(interaction, ownerId, difficulty, topicId, lastId) {
  const topic = challenges.topics(difficulty).find((item) => item.id === topicId);
  if (!topic) {
    return interaction.reply(ephemeral("Esse assunto não está disponível nessa trilha. Use aprender para começar novamente."));
  }

  // Evita repetir: primeiro as nunca vistas, depois as que ainda não acertou, por fim as acertadas há mais tempo.
  const challenge = challenges.random({ difficulty, topic: topicId }, lastId, db.getSeen(ownerId));
  if (!challenge) return interaction.reply(ephemeral("Ainda não há perguntas para esse assunto."));

  const issuedAt = Date.now().toString(36);
  return show(interaction, challengeMessage(challenge, ownerId, issuedAt, { type: "open", study: true }));
}
