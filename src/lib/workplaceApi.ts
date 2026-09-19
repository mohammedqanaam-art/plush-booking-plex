export async function workplaceRequest<T>(url: string, body?: Record<string, unknown>, method = "POST"): Promise<T> {
  const response = await fetch(url, { method: body ? method : "GET", credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذر تنفيذ الطلب. أعد المحاولة.");
  return data;
}
