export function hostname(value: string) {
  return value.toLowerCase().replace(/:\d+$/, "");
}

export function isAppHost(host: string, root: string) {
  const hostName = hostname(host);
  return hostName === `app.${hostname(root)}` || hostName === "localhost" ||
    hostName.endsWith(".app.github.dev") || hostName.endsWith(".vercel.app");
}
