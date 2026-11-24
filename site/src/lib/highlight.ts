// Colorização de sintaxe feita NA HORA DO BUILD: o HTML já sai com cada pedaço do código dentro de um <span> com a sua classe,
// sem biblioteca no navegador e sem depender de JavaScript. É um colorizador simples (por linha, com expressões regulares):
// serve para os trechos curtos dos desafios, não para qualquer código do mundo.
//
// Regra de ouro (conferida no teste de navegador): juntar o texto de todos os pedaços devolve EXATAMENTE o código original.

export type Kind =
  | "k" // palavra-chave
  | "s" // texto entre aspas
  | "n" // número
  | "c" // comentário
  | "f" // função (ou chave, no YAML)
  | "t" // tipo ou classe
  | "w" // recuo do começo da linha (o editor "digita" de uma vez, como o recuo automático de uma IDE)
  | "p"; // o resto (nomes, pontuação, espaços)

export interface Token {
  kind: Kind;
  text: string;
}

interface Language {
  comment: string | null;
  keywords: Set<string>;
  types: Set<string>;
  word: RegExp;
  /** O nome logo antes de "(" é uma função? */
  calls: boolean;
  /** Nome com inicial maiúscula é um tipo ou classe? */
  capitals: boolean;
  /** Palavras-chave sem diferenciar maiúsculas de minúsculas (SQL). */
  insensitive: boolean;
  /** No começo da linha, "chave:" é uma chave (YAML). */
  keys: boolean;
}

const words = (list: string): Set<string> => new Set(list.split(" "));

const JS_KEYWORDS =
  "const let var function return if else for while do switch case break continue new class extends this import from export default async await try catch finally throw typeof instanceof in of true false null undefined";

const LANGUAGES: Record<string, Language> = {
  python: {
    comment: "#",
    keywords: words("def return if elif else for while in not and or is import from as class lambda with try except finally raise pass break continue yield True False None"),
    types: new Set(),
    word: /^[A-Za-z_]\w*/,
    calls: true,
    capitals: true,
    insensitive: false,
    keys: false,
  },
  javascript: { comment: "//", keywords: words(JS_KEYWORDS), types: new Set(), word: /^[A-Za-z_$][\w$]*/, calls: true, capitals: true, insensitive: false, keys: false },
  typescript: {
    comment: "//",
    keywords: words(`${JS_KEYWORDS} interface type enum implements readonly as`),
    types: words("number string boolean any void never unknown object"),
    word: /^[A-Za-z_$][\w$]*/,
    calls: true,
    capitals: true,
    insensitive: false,
    keys: false,
  },
  sql: {
    comment: "--",
    keywords: words("create table primary key references on delete cascade select from where insert into values update set join left right inner outer group by order having limit and or not null default unique index alter drop add constraint foreign as distinct in is like"),
    types: words("integer int text varchar char boolean date timestamp numeric real serial"),
    word: /^[A-Za-z_]\w*/,
    calls: false,
    capitals: false,
    insensitive: true,
    keys: false,
  },
  docker: {
    comment: "#",
    keywords: words("FROM WORKDIR COPY ADD RUN CMD ENTRYPOINT ENV EXPOSE ARG USER VOLUME LABEL HEALTHCHECK AS"),
    types: new Set(),
    word: /^[A-Za-z_][\w.-]*/,
    calls: false,
    capitals: false,
    insensitive: false,
    keys: false,
  },
  yaml: {
    comment: "#",
    keywords: words("true false null yes no"),
    types: new Set(),
    word: /^[A-Za-z_][\w.-]*/,
    calls: false,
    capitals: false,
    insensitive: false,
    keys: true,
  },
};

const STRING = /^(["'`])(?:\\.|(?!\1).)*\1?/;
const NUMBER = /^\d+(?:\.\d+)?/;

function scanLine(line: string, lang: Language): Token[] {
  const out: Token[] = [];
  const push = (kind: Kind, text: string): void => {
    const last = out[out.length - 1];
    if (last && last.kind === "p" && kind === "p") last.text += text;
    else out.push({ kind, text });
  };

  let i = 0;
  const indent = /^\s+/.exec(line)?.[0] ?? "";
  if (indent) {
    push("w", indent);
    i = indent.length;
  }

  while (i < line.length) {
    const rest = line.slice(i);
    if (lang.comment && rest.startsWith(lang.comment)) {
      push("c", rest);
      break;
    }
    const string = STRING.exec(rest)?.[0];
    if (string) {
      push("s", string);
      i += string.length;
      continue;
    }
    const number = NUMBER.exec(rest)?.[0];
    if (number) {
      push("n", number);
      i += number.length;
      continue;
    }
    const word = lang.word.exec(rest)?.[0];
    if (word) {
      const key = lang.insensitive ? word.toLowerCase() : word;
      const before = line.slice(0, i);
      let kind: Kind = "p";
      if (lang.keywords.has(key)) kind = "k";
      else if (lang.types.has(key)) kind = "t";
      else if (lang.keys && /^\s*(?:- )?$/.test(before) && /^:(?:\s|$)/.test(rest.slice(word.length))) kind = "f";
      else if (lang.calls && rest[word.length] === "(") kind = "f";
      else if (lang.capitals && /^[A-Z]/.test(word)) kind = "t";
      push(kind, word);
      i += word.length;
      continue;
    }
    push("p", rest[0] ?? "");
    i += 1;
  }
  return out;
}

/** Uma lista de pedaços por linha do código. Linhas em branco viram uma lista vazia. */
export function highlight(code: string, language: string): Token[][] {
  const lang = LANGUAGES[language];
  return code.split("\n").map((line) => (lang ? scanLine(line, lang) : line ? [{ kind: "p" as const, text: line }] : []));
}
