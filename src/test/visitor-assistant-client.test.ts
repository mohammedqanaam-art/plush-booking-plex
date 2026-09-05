import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localAssistantReply,
  streamVisitorAssistant,
} from "@/lib/visitorAssistantClient";

describe("visitor assistant client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("answers greetings locally but sends hotel questions to the assistant", () => {
    expect(localAssistantReply("السلام عليكم", [])).toContain("مجموعة بودل");
    expect(localAssistantReply("كيف أحجز من الموقع الرسمي؟", [])).toBeNull();
  });

  it("parses streamed status, text and official sources", async () => {
    const completion = {
      reply: "أهلًا بك",
      provider: "openai-responses",
      model: "gpt-5.6-sol",
      sessionId: "visitor_12345678",
      sources: [{ title: "بودل الرسمي", url: "https://boudl.com/ar/hotels" }],
    };
    const stream = [
      "event: status",
      `data: ${JSON.stringify({ stage: "generating" })}`,
      "",
      "event: delta",
      `data: ${JSON.stringify({ delta: "أهلًا " })}`,
      "",
      "event: delta",
      `data: ${JSON.stringify({ delta: "بك" })}`,
      "",
      "event: done",
      `data: ${JSON.stringify(completion)}`,
      "",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    })));
    const deltas: string[] = [];
    const statuses: string[] = [];

    const result = await streamVisitorAssistant({
      message: "ما فروع بودل؟",
      sessionId: "visitor_12345678",
      history: [],
    }, {
      onDelta: (delta) => deltas.push(delta),
      onStatus: (stage) => statuses.push(stage),
    });

    expect(deltas).toEqual(["أهلًا ", "بك"]);
    expect(statuses).toEqual(["generating"]);
    expect(result).toMatchObject(completion);
  });

  it.each(["", 'event: error\ndata: {"error":"interrupted"}\n\n',
    'event: done\ndata: {"error":"incomplete"}\n\n'])("does not accept a partial stream without a successful done: %s", async (tail) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'event: delta\ndata: {"delta":"جزء من الإجابة"}\n\n' + tail,
      { headers: { "Content-Type": "text/event-stream" } },
    )));
    const onDelta = vi.fn();
    await expect(streamVisitorAssistant({ message: "كيف أحجز في بودل؟", sessionId: "test_12345678", history: [] }, { onDelta }))
      .rejects.toThrow();
    expect(onDelta).toHaveBeenCalledWith("جزء من الإجابة");
  });
});
