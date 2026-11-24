export function formatAiCost(value: number, detailed = false) {
  const magnitude = Math.abs(value);
  if (detailed && magnitude > 0 && magnitude < 0.000001) return value < 0 ? "-<$0.000001" : "<$0.000001";
  const digits = detailed && magnitude > 0 && magnitude < 0.01 ? 6 : 2;
  return value.toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}
