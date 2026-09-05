export function assistantModelLabel(result: { model?: string | null; provider?: string }) {
  if (result.provider?.includes("cache")) return "إجابة محفوظة";
  if (result.provider?.includes("fast-path")) return "مرجع BHG مباشر";
  if (result.model === "gpt-5.6-sol") return "GPT‑5.6 Sol";
  if (result.model) return result.model;
  if (result.provider === "n8n-agent") return "BHG · خدمة بديلة";
  return "مساعد BHG";
}
