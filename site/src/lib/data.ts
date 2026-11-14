// Lê os DADOS DO PRÓPRIO BOT (src/data/*.json na raiz do repositório) na hora do build: os números e as listas do site
// nunca ficam desatualizados, e nada é escrito à mão. Se um arquivo estiver fora do formato, o build falha na hora.
import { readFileSync } from "node:fs";
import path from "node:path";

// O build roda dentro de site/ (npm run build), então os dados do bot ficam um nível acima.
const DATA_DIR = path.resolve(process.cwd(), "..", "src", "data");

export type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";

export interface Challenge {
  id: string;
  language: string;
  question: string;
  code: string;
  options: string[];
  answer: number;
  explanation: string;
  difficulty: Difficulty;
  topic: { id: string; label: string; description: string };
}
export interface Area { id: string; label: string; emoji: string; description: string; topics: string[] }
export interface Course { id: string; name: string; emoji: string; description: string; modules: string[] }

function load<T>(file: string, check: (value: unknown) => value is T): T {
  const raw: unknown = JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf-8"));
  if (!check(raw)) throw new Error(`${file} está fora do formato esperado pelo site`);
  return raw;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isChallenges = (v: unknown): v is Challenge[] =>
  Array.isArray(v) && v.length > 0 && v.every((c) => isRecord(c) && typeof c["id"] === "string" && Array.isArray(c["options"]) && typeof c["answer"] === "number" && isRecord(c["topic"]));
const isAreas = (v: unknown): v is Area[] => Array.isArray(v) && v.length > 0 && v.every((a) => isRecord(a) && typeof a["label"] === "string" && Array.isArray(a["topics"]));
const isCourses = (v: unknown): v is Course[] => Array.isArray(v) && v.length > 0 && v.every((c) => isRecord(c) && typeof c["name"] === "string" && typeof c["emoji"] === "string");

export const challenges = load("challenges.json", isChallenges);
export const areas = load("areas.json", isAreas);
export const courses = load("courses.json", isCourses);

// Assuntos (um por topic.id) com o total de desafios de cada um.
export const topics = new Map<string, { id: string; label: string; total: number }>();
for (const c of challenges) {
  const found = topics.get(c.topic.id);
  if (found) found.total++;
  else topics.set(c.topic.id, { id: c.topic.id, label: c.topic.label, total: 1 });
}

export const stats = { challenges: challenges.length, topics: topics.size, courses: courses.length, levels: 4 } as const;

export const LEVELS: Record<Difficulty, { emoji: string; label: string }> = {
  beginner: { emoji: "🟢", label: "Iniciante" },
  intermediate: { emoji: "🟡", label: "Intermediário" },
  advanced: { emoji: "🟠", label: "Avançado" },
  expert: { emoji: "🔴", label: "Especialista" },
};

// Perguntas REAIS do banco usadas no demo da página inicial.
const DEMO_IDS = ["js-015", "ds-001", "dom-002", "ts-009"] as const;
export interface DemoChallenge {
  id: string;
  topic: string;
  level: [emoji: string, label: string];
  question: string;
  code: string;
  options: string[];
  answer: number;
  explanation: string;
}
export const demo: DemoChallenge[] = DEMO_IDS.map((id) => {
  const c = challenges.find((x) => x.id === id);
  if (!c) throw new Error(`desafio do demo não existe mais no banco do bot: ${id}`);
  const level = LEVELS[c.difficulty];
  return { id: c.id, topic: c.topic.label, level: [level.emoji, level.label], question: c.question, code: c.code, options: c.options, answer: c.answer, explanation: c.explanation };
});

// Áreas com os assuntos que existem de fato (e o total de desafios de cada um).
export const areaList = areas.map((area) => ({
  id: area.id,
  label: area.label,
  description: area.description,
  topics: area.topics.flatMap((id) => {
    const topic = topics.get(id);
    return topic ? [topic] : [];
  }),
}));
