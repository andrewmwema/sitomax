export function isAnalyticsSaltValid(salt: string | undefined): salt is string {
  return typeof salt === "string" && salt.length >= 32;
}
