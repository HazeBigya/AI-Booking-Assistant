import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ChatResponse, LLMProvider } from "@server/sdk/ai/providers/types";

// A scripted provider stands in for the real model so we can make it lie on cue.
let script: ChatMessage[] = [];
let calls = 0;

const scriptedProvider: LLMProvider = {
  name: "scripted",
  async chat(): Promise<ChatResponse> {
    const message = script[Math.min(calls, script.length - 1)];
    calls++;
    return { message, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 1 } };
  },
  async classify() {
    return "in_scope";
  },
};

vi.mock("@server/sdk/ai/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@server/sdk/ai/providers")>()),
  getLLMProvider: () => scriptedProvider,
}));

const { runChat } = await import("@server/sdk/ai/chat");

function assistant(content: string): ChatMessage {
  return { role: "assistant", content };
}

beforeEach(() => {
  calls = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("fabricated confirmations never reach the patient", () => {
  it("does not relay a confirmed booking that no tool made", async () => {
    script = [assistant("Your appointment is confirmed! Time: 9:00 AM – 10:00 AM")];

    const result = await runChat([], {});

    expect(result.reply).not.toMatch(/confirmed/i);
    expect(result.reply).toMatch(/isn't booked yet/i);
  });

  it("gives the model one chance to correct itself, and relays the honest reply", async () => {
    script = [
      assistant("Your appointment is confirmed!"),
      assistant("Sorry — I still need to know which time you'd like before I can book it."),
    ];

    const result = await runChat([], {});

    expect(result.reply).toMatch(/which time/i);
    expect(calls).toBe(2); // one original, one corrective retry
  });

  it("passes the confirmation through when a booking really was made", async () => {
    script = [assistant("Your appointment is confirmed! Time: 9:00 AM – 10:00 AM")];

    const result = await runChat([], { bookingConfirmed: true });

    expect(result.reply).toMatch(/confirmed/i);
    expect(calls).toBe(1);
  });

  it("blocks an invented cancellation", async () => {
    script = [assistant("Your appointment with John tomorrow has been cancelled successfully.")];

    const result = await runChat([], {});

    expect(result.reply).toMatch(/still on our schedule/i);
  });

  it("passes a real cancellation through", async () => {
    script = [assistant("Your appointment with John tomorrow has been cancelled successfully.")];

    const result = await runChat([], { bookingCancelled: true });

    expect(result.reply).toMatch(/cancelled successfully/i);
    expect(calls).toBe(1);
  });

  it("does not trip on ordinary talk about slots being taken", async () => {
    script = [
      assistant(
        "That slot is already booked, and Kate is fully booked this morning. " +
          "Would you like me to check the afternoon?",
      ),
    ];

    const result = await runChat([], {});

    expect(result.reply).toMatch(/check the afternoon/i);
    expect(calls).toBe(1);
  });
});
