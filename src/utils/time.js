// "Dia" no formato YYYY-MM-DD, no fuso informado (não no fuso do servidor onde o bot roda).
function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Quantos dias separam duas datas YYYY-MM-DD: positivo se `to` vem depois de `from`, 0 se é o mesmo dia.
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Soma (ou subtrai) dias de uma data YYYY-MM-DD.
function addDays(day, delta) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// A segunda-feira da semana (segunda a domingo) em que cai a data YYYY-MM-DD. Serve de "nome" da semana.
function weekStartOf(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(day, -((weekday + 6) % 7));
}

// A hora cheia (0 a 23) de um instante no fuso informado.
function hourOf(date, timeZone) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(date));
}

module.exports = { dayKey, daysBetween, addDays, weekStartOf, hourOf };
