"use strict";
// Aplica o avatar e o banner da marca no perfil do bot no Discord.
//
// Uso (dentro de brand/tools; o token vem do .env da raiz, e nunca é impresso):
//   node --env-file=../../.env apply-discord.js            só mostra o que mudaria
//   node --env-file=../../.env apply-discord.js --yes      aplica
//   node --env-file=../../.env apply-discord.js --restore  volta ao avatar/banner que estavam antes
//
// Antes de alterar, guarda o avatar e o banner atuais em .discord-backup/ (fora do git).
// Não precisa de dependências: usa o fetch do Node.
const fs = require("fs");
const path = require("path");

const API = "https://discord.com/api/v10";
const BRAND = path.join(__dirname, "..");
const BACKUP = path.join(__dirname, ".discord-backup");
const FILES = {
  avatar: path.join(BRAND, "discord", "avatar-1024.png"),
  banner: path.join(BRAND, "discord", "banner-1360x480.png"),
};

const args = new Set(process.argv.slice(2));
const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error("Defina DISCORD_TOKEN: rode com --env-file=../../.env a partir de brand/tools.");
  process.exit(1);
}

async function api(method, route, body) {
  const res = await fetch(API + route, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "DiscordBot (https://github.com/devlingoo/devlingo, 1.0)",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(`Discord respondeu ${res.status}: ${data.message ?? "sem mensagem"}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)} KB`;

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return true;
}

const cdn = (me) => ({
  avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=1024` : null,
  banner: me.banner ? `https://cdn.discordapp.com/banners/${me.id}/${me.banner}.png?size=1024` : null,
});

// Tenta tudo de uma vez; se o Discord recusar só o banner, aplica o avatar e avisa.
async function patch(fields) {
  try {
    return { me: await api("PATCH", "/users/@me", fields), skipped: [] };
  } catch (error) {
    const bad = Object.keys(error.data?.errors ?? {});
    if (error.status === 400 && bad.length && bad.every((k) => k in fields) && Object.keys(fields).length > bad.length) {
      const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => !bad.includes(k)));
      return { me: await api("PATCH", "/users/@me", rest), skipped: bad };
    }
    throw error;
  }
}

(async () => {
  const me = await api("GET", "/users/@me");
  console.log(`Bot: ${me.username} (id ${me.id})`);
  console.log(`Hoje: avatar ${me.avatar ?? "(padrão)"} · banner ${me.banner ?? "(nenhum)"}`);

  if (args.has("--restore")) {
    const fields = {};
    for (const key of ["avatar", "banner"]) {
      const file = path.join(BACKUP, `${key}-old.png`);
      if (fs.existsSync(file)) fields[key] = dataUri(file);
    }
    if (!Object.keys(fields).length) throw new Error("Não há backup em .discord-backup/ para restaurar.");
    const { me: after } = await patch(fields);
    console.log(`Restaurado: avatar ${after.avatar ?? "(padrão)"} · banner ${after.banner ?? "(nenhum)"}`);
    return;
  }

  console.log(`\nVai aplicar:\n  avatar ${path.relative(BRAND, FILES.avatar)} (${kb(FILES.avatar)})\n  banner ${path.relative(BRAND, FILES.banner)} (${kb(FILES.banner)})`);

  // Backup do que está no ar agora (não sobrescreve um backup anterior).
  const urls = cdn(me);
  for (const key of ["avatar", "banner"]) {
    const file = path.join(BACKUP, `${key}-old.png`);
    if (urls[key] && !fs.existsSync(file) && (await download(urls[key], file))) {
      console.log(`Backup do ${key} atual salvo em tools/.discord-backup/${key}-old.png`);
    }
  }

  if (!args.has("--yes")) {
    console.log("\nNada foi alterado. Para aplicar de verdade, rode de novo com --yes.");
    return;
  }

  const { me: after, skipped } = await patch({ avatar: dataUri(FILES.avatar), banner: dataUri(FILES.banner) });
  const now = cdn(after);
  console.log(`\nAplicado. Avatar ${after.avatar}${now.avatar ? `\n  ${now.avatar}` : ""}`);
  if (skipped.includes("banner")) {
    console.log("O Discord recusou o banner por API. Envie manualmente: Developer Portal > Bot > Banner (brand/discord/banner-1360x480.png).");
  } else {
    console.log(`Banner ${after.banner}${now.banner ? `\n  ${now.banner}` : ""}`);
  }
  console.log("Para desfazer: node --env-file=../../.env apply-discord.js --restore");
})().catch((error) => {
  console.error(`\nErro: ${error.message}`);
  if (error.status === 401) console.error("O token do .env não é válido (foi redefinido?). Atualize o DISCORD_TOKEN.");
  if (error.status === 429) console.error(`Limite de alterações do Discord. Tente de novo em ${Math.ceil(error.data?.retry_after ?? 60)}s.`);
  process.exit(1);
});
