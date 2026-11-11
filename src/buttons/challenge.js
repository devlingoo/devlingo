const { MessageFlags } = require("discord.js");
const config = require("../config");
const db = require("../utils/db");
const challenges = require("../utils/challenges");
const courses = require("../utils/courses");
const { levelSuggestion: suggestLevel } = require("../utils/study");
const logger = require("../utils/logger");
const { commandRef, challengeMessage } = require("../utils/ui");

// Desafios já respondidos (evita duplo clique e XP em dobro). Limitado para não crescer sem fim.
// A chave é mensagem + momento da pergunta: na trilha de estudo a mesma mensagem recebe
// uma pergunta nova a cada "Próxima pergunta", e cada uma precisa poder ser respondida.
const answered = new Set();
function markAnswered(key) {
  answered.add(key);
  if (answered.size > 10_000) answered.delete(answered.values().next().value);
}

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const update = (interaction, components) =>
  interaction.update({ components, flags: MessageFlags.IsComponentsV2 });

module.exports = {
  prefix: "ch",

  // customId: ch:<idDoDesafio>:<opção>:<idDoDono>:<criadoEm em base36>[:s]
  async execute(interaction, parts, client) {
    const [, challengeId, chosenText, ownerId, issuedAt, mode] = parts;
    const study = mode === "s"; // veio do comando aprender: oferece "Próxima pergunta"

    if (interaction.user.id !== ownerId) {
      return interaction.reply(
        ephemeral(`Esse desafio é de outra pessoa. Peça o seu com ${commandRef(client, interaction.inGuild(), "desafio")}.`)
      );
    }

    const ch = challenges.getById(challengeId);
    if (!ch) {
      return interaction.reply(ephemeral("Esse desafio não existe mais. Peça um novo."));
    }

    // Já respondido (clique repetido): só confirma o clique, sem fazer nada
    const key = `${interaction.message.id}:${issuedAt}`;
    if (answered.has(key)) return interaction.deferUpdate();

    const issued = parseInt(issuedAt, 36);
    if (!Number.isFinite(issued) || Date.now() - issued > config.challengeTtlMs) {
      markAnswered(key);
      return update(interaction, challengeMessage(ch, ownerId, issuedAt, { type: "expired", study }));
    }

    markAnswered(key);

    const chosen = Number(chosenText);
    const correct = chosen === ch.answer;
    // O resultado traz tudo o que a mensagem mostra: XP que entrou (já com o limite diário), bônus,
    // combo, meta do dia, marcos de sequência, subida de nível e conquistas novas.
    let result;
    try {
      result = db.recordAnswer(
        interaction.user.id,
        interaction.guildId,
        correct,
        config.xpCorrect,
        new Date(),
        { difficulty: ch.difficulty, challengeId: ch.id }
      );
    } catch (error) {
      // Nada foi gravado: solta a trava para a pessoa poder tentar de novo. Sem isso, o clique
      // seguinte seria ignorado como "duplicado" e a pergunta ficaria impossível de responder.
      answered.delete(key);
      throw error;
    }

    // Cursos: um acerto pode fechar um módulo e, com ele, um nível do curso (certificado novo). Se isso
    // falhar, a resposta já foi registrada: só deixa de aparecer a parte do curso (e a próxima conferência
    // emite o certificado, porque a emissão é idempotente).
    let certificates = [];
    let courseHint = null;
    try {
      if (correct) {
        certificates = courses.sync(ownerId, { courseIds: courses.byTopic(ch.topic.id).map((c) => c.id) });
        // O primeiro certificado já guarda o nome do Discord (limpo), para a pessoa poder trocar depois.
        if (certificates.length > 0) courses.nameFor(ownerId, interaction.member?.displayName ?? interaction.user.displayName);
      }
      courseHint = courses.hint(ownerId, ch);
    } catch (error) {
      logger.error("Erro ao atualizar o progresso do curso:", error);
    }

    // Sugestão de subir de nível: só depois de um acerto, para o convite chegar junto da comemoração.
    // Se falhar, só deixa de aparecer o convite.
    let levelSuggestion = null;
    try {
      if (correct) levelSuggestion = suggestLevel(ownerId, result.levelProgress);
    } catch (error) {
      logger.error("Erro ao calcular a sugestão de nível:", error);
    }

    return update(
      interaction,
      challengeMessage(ch, ownerId, issuedAt, {
        type: "answered", chosen, correct, study, ...result, certificates, courseHint, levelSuggestion,
      })
    );
  },
};
