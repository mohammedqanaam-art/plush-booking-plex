import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  BHG_ASSISTANT_SCOPE,
  classifyBoudlAssistantScope,
} from "../../netlify/functions/_shared/boudlAssistantScope";
import visitorAgent from "../../netlify/functions/visitor-agent";
import { isCacheableBoudlQuestion } from "../../netlify/functions/_shared/boudlAssistantCache";

describe("BHG hotel assistant scope", () => {
  it("accepts BHG brands and hotel service questions", () => {
    for (const question of [
      "ما فروع بودل في الرياض؟",
      "هل يوجد مسبح في بريرا العليا؟",
      "أحتاج فندقًا من المجموعة في جدة",
      "كيف أحجز من الموقع الرسمي؟",
      "How can I book a room at Narcissus?",
    ]) {
      expect(classifyBoudlAssistantScope(question)).toBe("in_scope");
    }
  });

  it("returns a fast path for greetings and refuses unrelated topics", () => {
    expect(classifyBoudlAssistantScope("السلام عليكم")).toBe("greeting");
    expect(classifyBoudlAssistantScope("اكتب لي كود بايثون")).toBe("out_of_scope");
    expect(classifyBoudlAssistantScope("ما أخبار سوق الأسهم؟")).toBe("out_of_scope");
    expect(classifyBoudlAssistantScope("من فاز في المباراة؟")).toBe("out_of_scope");
  });

  it("allows a short follow-up only after an in-scope user question", () => {
    expect(classifyBoudlAssistantScope("وكم السعر؟", ["ما خدمات بودل العليا؟"])).toBe("in_scope");
    expect(classifyBoudlAssistantScope("وكم السعر؟", ["مرحبًا"])).toBe("out_of_scope");
  });

  it("caches only standalone questions with stable hotel facts", () => {
    expect(isCacheableBoudlQuestion("ما فروع بودل في الرياض؟", false)).toBe(true);
    expect(isCacheableBoudlQuestion("ما سعر الغرفة اليوم؟", false)).toBe(false);
    expect(isCacheableBoudlQuestion("هل توجد مواقف؟", true)).toBe(false);
  });

  it("uses cached official evidence and skips duplicate web search when evidence exists", () => {
    const visitor = readFileSync("netlify/functions/visitor-agent.ts", "utf8");
    const knowledge = readFileSync("netlify/functions/_shared/boudl-knowledge.ts", "utf8");
    const schedule = readFileSync("netlify/functions/branch-knowledge-sync-scheduled.ts", "utf8");

    expect(BHG_ASSISTANT_SCOPE).toBe("bhg-hotels");
    expect(visitor).toContain("bhg-scope-fast-path");
    expect(visitor).toContain("bhg-answer-cache");
    expect(visitor).toContain("context.waitUntil(write)");
    expect(visitor).toContain("officialSources.length ? undefined");
    expect(visitor).toContain("maxOutputTokens: 800");
    expect(knowledge).toContain("officialPageCacheKey");
    expect(knowledge).toContain("if (cached) return cached");
    expect(schedule).toContain('schedule: "15 1 * * *"');
  });

  it("answers unrelated questions without calling any upstream AI or website", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await visitorAgent(new Request("https://res-dashbord.com/api/visitor/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://res-dashbord.com" },
      body: JSON.stringify({ message: "اكتب لي كود بايثون" }),
    }));
    const data = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ provider: "bhg-scope-fast-path", scope: "bhg-hotels" });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("streams the lightweight scope reply without an upstream request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await visitorAgent(new Request("https://res-dashbord.com/api/visitor/agent", {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Origin: "https://res-dashbord.com",
      },
      body: JSON.stringify({ message: "السلام عليكم" }),
    }));
    const stream = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(stream).toContain("event: delta");
    expect(stream).toContain("event: done");
    expect(stream).toContain("مجموعة بودل للضيافة");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
