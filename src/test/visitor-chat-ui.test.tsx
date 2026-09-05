import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VisitorChat from "@/components/VisitorChat";

describe("visitor BHG chat UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders model markdown as formatted content instead of raw symbols", async () => {
    const reply = "**بريرا العليا**\n\n[عرض الفندق](https://boudl.com/ar/hotel/example)";
    const body = [
      "event: delta",
      `data: ${JSON.stringify({ delta: reply })}`,
      "",
      "event: done",
      `data: ${JSON.stringify({ reply, provider: "openai-responses", model: "gpt-5.6-sol", sources: [] })}`,
      "",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init?: RequestInit) => (
      Promise.resolve(init?.method === "POST"
        ? new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })
        : new Response(null, { status: 204 }))
    )));

    render(<VisitorChat />);
    fireEvent.click(screen.getByRole("button", { name: "فتح مساعد BHG" }));
    const input = screen.getByLabelText("سؤالك لمساعد BHG");
    fireEvent.change(input, { target: { value: "أقرب فندق" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(await screen.findByText("بريرا العليا")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByRole("link", { name: /عرض الفندق/ })).toHaveAttribute(
      "href",
      "https://boudl.com/ar/hotel/example",
    );
    expect(screen.queryByText(/\*\*بريرا العليا\*\*/)).not.toBeInTheDocument();
  });
});
