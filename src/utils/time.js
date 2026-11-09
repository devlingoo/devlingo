// "Dia" no formato YYYY-MM-DD, no fuso informado (não no fuso do servidor onde o bot roda).
function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Soma (ou subtrai) dias de uma data YYYY-MM-DD.
function shiftDay(day, delta) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

module.exports = { dayKey, shiftDay };
