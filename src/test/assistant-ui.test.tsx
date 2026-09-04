import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmployeeAssistant from "@/pages/EmployeeAssistant";

describe("assistant UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("answers a greeting immediately without a POST request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter><EmployeeAssistant /></MemoryRouter>);

    const input = screen.getByLabelText("سؤالك لمساعد بودل");
    fireEvent.change(input, { target: { value: "السلام عليكم" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(await screen.findByText(/أهلًا بك في مجموعة بودل للضيافة/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("renders streamed answer chunks as they arrive", async () => {
    const completion = {
      reply: "فرع العليا متاح في دليل بودل.",
      provider: "openai-responses",
      model: "gpt-5.6-sol",
      sources: [{ title: "دليل بودل", url: "https://boudl.com/ar/hotels" }],
    };
    const body = [
      "event: status",
      `data: ${JSON.stringify({ stage: "generating" })}`,
      "",
      "event: delta",
      `data: ${JSON.stringify({ delta: completion.reply })}`,
      "",
      "event: done",
      `data: ${JSON.stringify(completion)}`,
      "",
    ].join("\n");
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter><EmployeeAssistant /></MemoryRouter>);

    const input = screen.getByLabelText("سؤالك لمساعد بودل");
    fireEvent.change(input, { target: { value: "ما فروع بودل في الرياض؟" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(await screen.findByText(completion.reply)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /دليل بودل/ })).toHaveAttribute("href", "https://boudl.com/ar/hotels");
    await waitFor(() => expect(screen.getByLabelText("سؤالك لمساعد بودل")).not.toBeDisabled());
  });
});
