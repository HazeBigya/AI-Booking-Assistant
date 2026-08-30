import { describe, expect, it, vi } from "vitest";

const getAppointmentsForPatient = vi.fn();
vi.mock("@server/db/queries/appointments", () => ({ getAppointmentsForPatient }));

const { runTool } = await import("@server/sdk/ai/tools");

const at = (offsetMs: number, lengthMs = 60 * 60 * 1000) => ({
  start: new Date(Date.now() + offsetMs),
  end: new Date(Date.now() + offsetMs + lengthMs),
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Whether an appointment has happened is a fact about the clock, so the tool
// decides it rather than the model — the same reason the model never decides
// availability. Returned as one flat list, it read a finished visit and a
// booking tomorrow out together and left the patient to work out which was which.
describe("get_my_appointments", () => {
  it("separates what has happened from what has not", async () => {
    getAppointmentsForPatient.mockResolvedValue([
      { id: 1, service: "Routine Checkup", dentist: "John", title: "Checkup", ...at(-3 * DAY) },
      { id: 2, service: "Root Canal", dentist: "Kate", title: "Root Canal", ...at(2 * DAY) },
    ]);

    const out = JSON.parse(await runTool("get_my_appointments", "{}", { authedEmail: "a@b.com" }));
    expect(out.past.map((a: { id: number }) => a.id)).toEqual([1]);
    expect(out.upcoming.map((a: { id: number }) => a.id)).toEqual([2]);
  });

  // Someone in the chair is not someone who has been.
  it("counts an appointment in progress as upcoming", async () => {
    getAppointmentsForPatient.mockResolvedValue([
      { id: 3, service: "Cavity Filling", dentist: "Oscar", title: "Filling", ...at(-10 * 60_000) },
    ]);

    const out = JSON.parse(await runTool("get_my_appointments", "{}", { authedEmail: "a@b.com" }));
    expect(out.upcoming).toHaveLength(1);
    expect(out.past).toHaveLength(0);
  });

  it("returns both keys even when a patient has nothing", async () => {
    getAppointmentsForPatient.mockResolvedValue([]);
    const out = JSON.parse(await runTool("get_my_appointments", "{}", { authedEmail: "a@b.com" }));
    expect(out).toEqual({ upcoming: [], past: [] });
  });
});
