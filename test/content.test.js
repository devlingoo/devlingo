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
