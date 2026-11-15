// Lembretes por DM: o que liga e desliga (comando e botões) e o relógio que manda as mensagens.
// Regras: só vai DM para quem ligou; no máximo uma tentativa por dia; só se a pessoa ainda não respondeu nada
// naquele dia; e a DM que falha desliga os lembretes (de uma vez se a pessoa não aceita DM, ou depois de
// `reminderMaxFailures` dias seguidos de erro).
const { MessageFlags } = require("discord.js");
const config = require("../config");
const db = require("./db");
const logger = require("./logger");
const ui = require("./ui");

// Códigos do Discord que não têm conserto do nosso lado: 50007 (não dá para mandar DM para essa pessoa: ela bloqueou
// o bot ou não aceita DMs) e 10013 (a conta não existe mais). Nesses casos, desliga na hora.
const FATAL_CODES = new Set([50007, 10013]);

// "20", "20h", "08h" e "20:00" viram 20, 8, 8 e 20. Qualquer outra coisa (inclusive "8h30" e "24") é null.
function parseHour(input) {
  const match = /^(\d{1,2})(?:h|:00)?$/i.exec(String(input ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

// Executa o que a pessoa pediu e devolve o aviso para mostrar na tela:
//   action "on"   liga (ou muda a hora para `hour`; sem hora, usa a que ela já tinha ou a padrão). Num servidor,
//                 manda antes uma DM de confirmação: se não chega, não liga (ela não receberia nada mesmo).
//   action "off"  desliga e apaga o registro.
// `user` é quem pediu (para a DM), `inGuild` diz se o pedido veio de um servidor (na DM a própria conversa já prova
// que dá para mandar mensagem).
async function apply({ action, user, ownerId, inGuild, hour = null }) {
  if (action === "off") {
    return db.clearReminder(ownerId)
      ? "🔕 **Lembretes desligados.** Não vou mais te mandar DM."
      : "Os lembretes já estavam desligados.";
  }
  if (action !== "on") return null;

  const chosen = hour ?? db.getReminder(ownerId)?.hour ?? config.reminderDefaultHour;
  if (inGuild) {
    try {
      await user.send({ components: ui.reminderWelcome({ ownerId, hour: chosen }), flags: MessageFlags.IsComponentsV2 });
    } catch {
      return (
        "⚠️ **Não consegui te mandar DM**, então não liguei os lembretes. Ative as mensagens diretas de membros deste " +
        "servidor (Configurações de Privacidade do servidor) e tente de novo."
      );
    }
  }
  db.setReminder(ownerId, chosen);
  return `🔔 **Lembretes ligados!**${inGuild ? " Mandei uma DM de confirmação." : ""}`;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

// Uma conferência: manda a DM de quem está na hora, uma de cada vez e com pausa entre elas, até
// `reminderBatch` por conferência (quem sobrar sai na conferência seguinte). Duas conferências nunca rodam ao mesmo
// tempo. Devolve { sent, failed, disabled } (ou { skipped: true } se já havia uma rodando).
async function tick(client, { now = new Date(), sleep = defaultSleep } = {}) {
  if (running) return { skipped: true };
  running = true;
  const result = { sent: 0, failed: 0, disabled: 0 };

  try {
    let first = true;
    for (const { userId } of db.dueReminders(now)) {
      // Reserva a tentativa de hoje ANTES de mandar: o que falhar aqui não é repetido no mesmo dia.
      if (!db.claimReminder(userId, now)) continue;
      if (!first) await sleep(config.reminderSpacingMs);
      first = false;

      const habit = db.getHabit(userId, now);
      const components = ui.reminderMessage({
        ownerId: userId,
        streak: db.getUser(userId, now).streak,
        frozenDays: habit.frozenDays,
        dailyDone: habit.dailyDone,
      });

      try {
        const user = await client.users.fetch(userId);
        await user.send({ components, flags: MessageFlags.IsComponentsV2 });
        db.reminderSent(userId);
        result.sent++;
      } catch (error) {
        const { disabled } = db.reminderFailed(userId, { fatal: FATAL_CODES.has(error?.code) });
        result.failed++;
        if (disabled) result.disabled++;
        logger.warn(
          `Lembrete: a DM para ${userId} falhou (${error?.code ?? error?.message ?? "erro"}); ` +
            (disabled ? "lembretes desligados para essa pessoa." : "tento de novo amanhã.")
        );
      }
    }
  } finally {
    running = false;
  }

  if (result.sent + result.failed > 0) {
    logger.info(`Lembretes: ${result.sent} enviado(s), ${result.failed} com falha (${result.disabled} desligado(s)).`);
  }
  return result;
}

// Liga o relógio. Devolve { stop } ou null se os lembretes estão desligados neste processo (REMINDERS=off).
// `deps` existe para os testes trocarem os temporizadores.
function start(client, { setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  if (!config.remindersEnabled) {
    logger.info("Lembretes por DM desligados neste processo (REMINDERS=off).");
    return null;
  }
  const timer = setIntervalFn(() => {
    tick(client).catch((error) => logger.error("Erro na conferência dos lembretes:", error));
  }, config.reminderTickMs);
  timer.unref?.(); // o relógio sozinho não segura o processo aberto
  return { stop: () => clearIntervalFn(timer) };
}

module.exports = { parseHour, apply, tick, start };
