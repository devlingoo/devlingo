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

module.exports = { dayKey, daysBetween };
