export function redactProviderResponse(value: unknown, secret?: string): unknown {
  if (typeof value === "string") {
    let text = secret ? value.replaceAll(secret, "[redacted]") : value;
    text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]");
    return text.replace(/([?&](?:token|access_token|key|api_key|secret)=)[^&\s"'<>]+/gi, "$1[redacted]");
  }
  if (Array.isArray(value)) return value.map((item) => redactProviderResponse(item, secret));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, /token|secret|password|authorization|access_url|api.?key/i.test(key) ? "[redacted]" : redactProviderResponse(item, secret),
    ]));
  }
  return value;
}
