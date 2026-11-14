// Endereços e opções do site.
export const REPO_URL = "https://github.com/devlingoo/devlingo";
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const RUN_URL = `${REPO_URL}#como-rodar`;

// Link de convite do bot (OAuth2 > URL Generator, escopo `bot`). Vem da variável PUBLIC_INVITE_URL no build.
// Só aceitamos o formato oficial do Discord; qualquer outra coisa é ignorada, e o botão principal vira "Ver o código".
// Permissões do bot (README): Ver canais, Enviar mensagens, Ler o histórico e Adicionar reações = 68672.
const INVITE_PATTERN = /^https:\/\/discord\.com\/oauth2\/authorize\?client_id=\d{17,20}(&[A-Za-z0-9_=%.+-]+)*$/;
const configured = import.meta.env["PUBLIC_INVITE_URL"] as string | undefined;
export const inviteUrl: string | undefined = configured && INVITE_PATTERN.test(configured) ? configured : undefined;
