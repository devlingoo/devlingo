// Intervalo mínimo entre comandos da mesma pessoa. As entradas vencidas são removidas quando o mapa
// passa de PRUNE_ABOVE, então a memória fica limitada em vez de crescer a cada pessoa nova.
const until = new Map(); // chave -> momento em que o cooldown acaba
const PRUNE_ABOVE = 2000;

// Devolve 0 e inicia o cooldown, ou os ms que faltam se ainda estiver em cooldown.
function remaining(key, ms, now = Date.now()) {
  const left = (until.get(key) ?? 0) - now;
  if (left > 0) return left;

  until.set(key, now + ms);
  if (until.size > PRUNE_ABOVE) {
    for (const [k, expires] of until) if (expires <= now) until.delete(k);
  }
  return 0;
}

const size = () => until.size;

module.exports = { remaining, size };
