export function formatAiCost(value: number, detailed = false) {
  if (detailed && value > 0 && value < 0.000001) return "<$0.000001";
  const digits = detailed && value > 0 && value < 0.01 ? 6 : 2;
  return value.toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}
