const test = require("node:test");
const assert = require("node:assert/strict");
const challenges = require("../src/utils/challenges");
const ui = require("../src/utils/ui");
const { TYPE, flatten } = require("./helpers");

// Se o JSON estiver inválido, o require acima já lança erro (validação ao iniciar).

test("todo nível com conteúdo tem assuntos, e cada assunto tem perguntas para variar", () => {
  const levels = challenges.availableDifficulties();
  assert.ok(levels.length >= 3, "iniciante, intermediário e avançado precisam ter conteúdo");

  for (const level of levels) {
    for (const topic of challenges.topics(level.id)) {
      const pool = challenges.list.filter((c) => c.difficulty === level.id && c.topic.id === topic.id);
      assert.ok(pool.length >= 2, `${level.id}/${topic.id} tem só ${pool.length} pergunta(s)`);
    }
  }
});

test("todos os assuntos têm pelo menos 4 desafios em cada um dos 4 níveis", () => {
  const topicIds = [...new Set(challenges.list.map((c) => c.topic.id))];
  for (const level of challenges.DIFFICULTIES) {
    for (const topicId of topicIds) {
      const n = challenges.list.filter((c) => c.difficulty === level.id && c.topic.id === topicId).length;
      assert.ok(n >= 4, `${level.id}/${topicId} tem só ${n} desafio(s)`);
    }
  }
});

test("o mesmo assunto tem rótulo e descrição idênticos em todos os níveis", () => {
  const seen = new Map();
  for (const c of challenges.list) {
    const key = c.topic.id;
    const value = JSON.stringify(c.topic);
    if (seen.has(key)) assert.equal(value, seen.get(key), `assunto ${key} diverge entre desafios`);
    else seen.set(key, value);
  }
});

test("random(): respeita nível e assunto e evita repetir o desafio anterior", () => {
  for (let i = 0; i < 200; i++) {
    const first = challenges.random({ difficulty: "intermediate", topic: "javascript-arrays" });
    assert.equal(first.difficulty, "intermediate");
    assert.equal(first.topic.id, "javascript-arrays");

    const next = challenges.random({ difficulty: "intermediate", topic: "javascript-arrays" }, first.id);
    assert.notEqual(next.id, first.id);
    assert.equal(next.topic.id, "javascript-arrays");
  }
  assert.equal(challenges.random({ difficulty: "expert", topic: "nao-existe" }), null);
});

// Valida o que o Discord exige das mensagens Components V2 (os builders já checam o formato).
function assertValidMessage(components, label) {
  const nodes = flatten(components);
  assert.ok(nodes.length <= 40, `${label}: ${nodes.length} componentes (limite 40)`);

  const texts = nodes.filter((n) => n.type === TYPE.TextDisplay);
  assert.ok(texts.every((t) => t.content.trim().length > 0), `${label}: texto vazio`);
  const chars = texts.reduce((sum, t) => sum + t.content.length, 0);
  assert.ok(chars <= 4000, `${label}: ${chars} caracteres de texto (limite 4000)`);

  for (const n of nodes) {
    if (n.custom_id) assert.ok(n.custom_id.length <= 100, `${label}: custom_id longo (${n.custom_id.length}): ${n.custom_id}`);
  }
}

test("menus da trilha geram mensagens válidas", () => {
  assertValidMessage(ui.learningLevelMenu("123456789012345678"), "menu de níveis");
  for (const level of challenges.availableDifficulties()) {
    assertValidMessage(
      ui.learningTopicMenu("123456789012345678", level.id, challenges.topics(level.id)),
      `menu de assuntos (${level.id})`
    );
  }
});

test("todo desafio gera mensagens válidas em todos os estados, com ou sem sessão de estudo", () => {
  const owner = "123456789012345678"; // snowflake de 18 dígitos
  const issuedAt = Date.now().toString(36);
  for (const ch of challenges.list) {
    for (const study of [false, true]) {
      const states = [
        { type: "open", study },
        { type: "expired", study },
        { type: "answered", chosen: (ch.answer + 1) % ch.options.length, correct: false, gained: 0, xp: 10, streak: 1, study },
        { type: "answered", chosen: ch.answer, correct: true, gained: 10, xp: 20, streak: 2, study },
      ];
      for (const state of states) {
        const label = `${ch.id} ${state.type} study=${study}`;
        const message = ui.challengeMessage(ch, owner, issuedAt, state);
        assertValidMessage(message, label);

        // Os botões de continuar só aparecem na sessão de estudo e depois da resposta.
        const ids = flatten(message).map((n) => n.custom_id).filter(Boolean);
        const hasNext = ids.some((id) => id.startsWith("learn:next:"));
        assert.equal(hasNext, study && state.type !== "open", `${label}: botão "Próxima pergunta"`);
      }
    }
  }
});

// O Discord corta o rótulo do botão com "…" (no celular, perto dos 30 caracteres): por isso o botão leva só a
// letra e a alternativa inteira fica no texto da mensagem.
test("as alternativas aparecem completas no texto e os botões levam só a letra", () => {
  const owner = "123456789012345678";
  const issuedAt = Date.now().toString(36);
  const letters = "ABCD";
  // O que o Discord mostra de um texto com markdown escapado: sem a barra invertida e sem o caractere invisível.
  const shown = (line) => line.replace(/\\([^0-9A-Za-z\s])/g, "$1").replace(/​/g, "");

  for (const ch of challenges.list) {
    const nodes = flatten(ui.challengeMessage(ch, owner, issuedAt, { type: "open" }));
    const labels = nodes.filter((n) => n.type === TYPE.Button && n.custom_id.startsWith("ch:")).map((n) => n.label);
    assert.deepEqual(labels, [...letters].slice(0, ch.options.length), `${ch.id}: rótulos dos botões`);

    const lines = nodes.filter((n) => n.type === TYPE.TextDisplay).flatMap((n) => n.content.split("\n"));
    ch.options.forEach((option, i) => {
      const prefix = `**${letters[i]})** `;
      const matching = lines.filter((l) => l.startsWith(prefix));
      assert.equal(matching.length, 1, `${ch.id}: a alternativa ${letters[i]} precisa aparecer em uma linha`);
      assert.equal(shown(matching[0].slice(prefix.length)), option, `${ch.id}: alternativa ${letters[i]} sem cortes`);
    });
  }
});

test("alternativas com símbolos de markdown aparecem como foram escritas, sem itálico nem link", () => {
  const ch = challenges.list.find((c) => c.id === "sql-001"); // COUNT(*), SUM(*)...
  const lines = flatten(ui.challengeMessage(ch, "123456789012345678", "abc", { type: "open" }))
    .filter((n) => n.type === TYPE.TextDisplay)
    .flatMap((n) => n.content.split("\n"));
  assert.ok(lines.includes("**B)** COUNT(\\*)"), lines.join("\n"));

  // Qualquer alternativa dos dados vira texto puro: nada de colchete, ângulo, asterisco, sublinhado ou crase
  // sem a barra (um "|" ou um "~" sozinhos não formatam nada; só o par "||" e "~~").
  for (const c of challenges.list) {
    const out = flatten(ui.challengeMessage(c, "123456789012345678", "abc", { type: "open" }))
      .filter((n) => n.type === TYPE.TextDisplay)
      .flatMap((n) => n.content.split("\n"))
      .filter((l) => /^\*\*[A-D]\)\*\* /.test(l))
      .map((l) => l.replace(/^\*\*[A-D]\)\*\* /, ""));
    for (const line of out) {
      assert.doesNotMatch(line, /(?<!\\)[[\]<>*_`]|(?<!\\)~~|(?<!\\)\|\|/, `${c.id}: símbolo de markdown solto em "${line}"`);
    }
  }
});

test("depois da resposta, a alternativa certa ganha ✅ e a escolhida errada ❌ (e só essas)", () => {
  const ch = challenges.list.find((c) => c.id === "a11y-004");
  const marks = (state) =>
    flatten(ui.challengeMessage(ch, "123456789012345678", "abc", state))
      .filter((n) => n.type === TYPE.TextDisplay)
      .flatMap((n) => n.content.split("\n"))
      .filter((l) => /\*\*[A-D]\)\*\* /.test(l))
      .map((l) => l.match(/^(✅|❌) /)?.[1] ?? "");

  const none = ["", "", "", ""];
  assert.deepEqual(marks({ type: "open" }), none, "aberto: sem marcas");
  assert.deepEqual(marks({ type: "expired" }), none, "expirado: sem marcas");

  const wrong = (ch.answer + 1) % 4;
  const expected = none.map((_, i) => (i === ch.answer ? "✅" : i === wrong ? "❌" : ""));
  assert.deepEqual(marks({ type: "answered", chosen: wrong, correct: false, gained: 0, xp: 10, streak: 1 }), expected);

  const right = none.map((_, i) => (i === ch.answer ? "✅" : ""));
  assert.deepEqual(marks({ type: "answered", chosen: ch.answer, correct: true, gained: 10, xp: 20, streak: 1 }), right);
});

// ---------- áreas (Frontend, Backend, Banco de dados, Ferramentas e DevOps) ----------

const areas = require("../src/utils/areas");

test("todo assunto pertence a pelo menos uma área (senão ninguém o encontraria depois do setup)", () => {
  const covered = new Set(areas.list.flatMap((a) => a.topics));
  for (const topicId of new Set(challenges.list.map((c) => c.topic.id))) {
    assert.ok(covered.has(topicId), `o assunto "${topicId}" não está em nenhuma área de src/data/areas.json`);
  }
});

test("as quatro áreas existem e todas têm conteúdo", () => {
  assert.deepEqual(areas.available().map((a) => a.id), ["frontend", "backend", "banco", "devops"]);
});

test("areas.parse e areas.labels ignoram o que não existe e as repetições", () => {
  assert.deepEqual(areas.parse("backend,frontend,backend,xyz,"), ["frontend", "backend"]);
  assert.deepEqual(areas.parse(""), []);
  assert.deepEqual(areas.parse(undefined), []);
  assert.equal(areas.labels(["frontend", "banco", "xyz"]), "🎨 Frontend, 🗄️ Banco de dados");
});

test("telas do setup geram mensagens válidas (com e sem configuração atual)", () => {
  const owner = "123456789012345678";
  const current = { level: "advanced", areas: ["frontend", "backend", "banco", "devops"] };
  assertValidMessage(ui.setupAreasMenu(owner, { intro: true }), "setup passo 1 (primeira vez)");
  assertValidMessage(ui.setupAreasMenu(owner, { current }), "setup passo 1 (alterar)");
  assertValidMessage(ui.setupLevelMenu(owner, current.areas, { current }), "setup passo 2 (4 áreas)");
  assertValidMessage(ui.setupDoneMessage(owner, current), "setup concluído");
});

test("menu de assuntos com todos os botões também respeita os limites do Discord", () => {
  const owner = "123456789012345678";
  const prefs = { level: "beginner", areas: ["banco"] };
  for (const level of challenges.availableDifficulties()) {
    const topics = challenges.topics(level.id);
    assertValidMessage(ui.learningTopicMenu(owner, level.id, topics, { prefs, filtered: true }), `assuntos filtrado ${level.id}`);
    assertValidMessage(ui.learningTopicMenu(owner, level.id, topics, { prefs, filtered: false }), `assuntos todos ${level.id}`);
  }
});
