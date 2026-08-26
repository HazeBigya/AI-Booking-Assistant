import { describe, expect, it } from "vitest";
import { runTool, type ToolContext } from "@server/sdk/ai/tools";

// These cover the deterministic guard branches in the tool dispatcher that
// short-circuit BEFORE touching the database or the model — the layer where the
// "past-date booking" and "book without auth" bugs lived. No DB needed.

describe("runTool dispatch guards", () => {
  it("rejects an unknown tool by name", async () => {
    const out = JSON.parse(await runTool("no_such_tool", "{}"));
    expect(out.error).toMatch(/unknown tool/i);
  });

  it("rejects invalid JSON arguments instead of throwing", async () => {
    const out = JSON.parse(await runTool("list_services", "{not json"));
    expect(out.error).toMatch(/invalid json/i);
  });

  describe("create_booking", () => {
    const futureBooking = {
      serviceName: "Teeth Whitening",
      dentistName: "John",
      start: "2999-01-01T09:00:00Z",
      patientName: "Test",
    };

    it("refuses to book when the patient is not logged in", async () => {
      const out = JSON.parse(await runTool("create_booking", JSON.stringify(futureBooking), {}));
      expect(out.error).toMatch(/verify/i);
    });

    it("refuses a start time in the past even when logged in", async () => {
      const ctx: ToolContext = { authedEmail: "test@example.com" };
      const past = { ...futureBooking, start: "2020-01-01T09:00:00Z" };
      const out = JSON.parse(await runTool("create_booking", JSON.stringify(past), ctx));
      expect(out.error).toMatch(/already passed/i);
    });

    it("rejects a malformed start date", async () => {
      const ctx: ToolContext = { authedEmail: "test@example.com" };
      const bad = { ...futureBooking, start: "not-a-date" };
      const out = JSON.parse(await runTool("create_booking", JSON.stringify(bad), ctx));
      expect(out.error).toMatch(/invalid start/i);
    });
  });

  it("get_my_appointments requires login (no IDOR via the model)", async () => {
    const out = JSON.parse(await runTool("get_my_appointments", "{}", {}));
    expect(out.error).toMatch(/logged in/i);
  });

  it("cancel_booking requires login (ownership enforced server-side)", async () => {
    const out = JSON.parse(await runTool("cancel_booking", JSON.stringify({ bookingId: 1 }), {}));
    expect(out.error).toMatch(/logged in/i);
  });
});
