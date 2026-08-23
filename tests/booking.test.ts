import { describe, it, expect } from "vitest";

import {
  overlaps,
  computeAvailableSlots,
  type Interval,
} from "@server/domain/booking/availability";
import {
  canLevelPerform,
  isWorkingDay,
  isWithinClinicHours,
  enumerateSlotStarts,
  addMinutes,
} from "@server/domain/booking/rules";
import {
  createBooking,
  findAvailability,
  findAvailabilityForProfessional,
  listServices,
} from "@server/domain/booking/scheduler";
import {
  DoubleBookingError,
  type BookingRepository,
  type Service,
  type Professional,
  type Interval as PortInterval,
  type NewBooking,
  type Booking,
} from "@server/domain/booking/ports";

// Helpers. All times are UTC = clinic-local by our simplification.
const MON = "2026-08-24"; // Monday, a working day
const SUN = "2026-08-23"; // Sunday, closed
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00Z`);

describe("overlaps", () => {
  const iv = (s: string, e: string): Interval => ({ start: at(MON, s), end: at(MON, e) });

  it("returns true when ranges intersect", () => {
    expect(overlaps(iv("09:00", "10:00"), iv("09:30", "10:30"))).toBe(true);
  });

  it("returns false for touching ranges (end-exclusive)", () => {
    // 09:00-10:00 and 10:00-11:00 share only the boundary -> no overlap.
    expect(overlaps(iv("09:00", "10:00"), iv("10:00", "11:00"))).toBe(false);
  });

  it("returns false for fully separate ranges", () => {
    expect(overlaps(iv("09:00", "10:00"), iv("11:00", "12:00"))).toBe(false);
  });

  it("is symmetric", () => {
    const a = iv("09:00", "10:00");
    const b = iv("09:30", "10:30");
    expect(overlaps(a, b)).toBe(overlaps(b, a));
  });
});

describe("rules", () => {
  it("junior can perform A and B but not C/D/E", () => {
    expect(canLevelPerform("junior", "A")).toBe(true);
    expect(canLevelPerform("junior", "B")).toBe(true);
    expect(canLevelPerform("junior", "C")).toBe(false);
    expect(canLevelPerform("junior", "E")).toBe(false);
  });

  it("senior can perform all services", () => {
    for (const c of ["A", "B", "C", "D", "E"]) {
      expect(canLevelPerform("senior", c)).toBe(true);
    }
  });

  it("recognizes working days vs weekends", () => {
    expect(isWorkingDay(at(MON, "09:00"))).toBe(true);
    expect(isWorkingDay(at(SUN, "09:00"))).toBe(false);
  });

  it("accepts appointments inside clinic hours", () => {
    expect(isWithinClinicHours(at(MON, "09:00"), at(MON, "10:00"))).toBe(true);
    // Ending exactly at close (17:00) is allowed.
    expect(isWithinClinicHours(at(MON, "11:00"), at(MON, "17:00"))).toBe(true);
  });

  it("rejects before open, after close, and on closed days", () => {
    expect(isWithinClinicHours(at(MON, "08:00"), at(MON, "09:00"))).toBe(false);
    expect(isWithinClinicHours(at(MON, "16:30"), at(MON, "17:30"))).toBe(false);
    expect(isWithinClinicHours(at(SUN, "09:00"), at(SUN, "10:00"))).toBe(false);
  });

  it("enumerates the right number of grid starts", () => {
    // 1h service: 09:00..16:00 in 30-min steps = 15 starts.
    expect(enumerateSlotStarts(at(MON, "00:00"), 60)).toHaveLength(15);
    // 6h service E: must finish by 17:00, so latest start is 11:00 -> 5 starts.
    expect(enumerateSlotStarts(at(MON, "00:00"), 360)).toHaveLength(5);
    // Closed day -> no starts.
    expect(enumerateSlotStarts(at(SUN, "00:00"), 60)).toHaveLength(0);
  });
});

describe("computeAvailableSlots", () => {
  it("returns the full grid when there are no bookings", () => {
    const slots = computeAvailableSlots({
      day: at(MON, "00:00"),
      durationMin: 60,
      existingBookings: [],
    });
    expect(slots).toHaveLength(15);
    expect(slots[0].toISOString()).toBe(at(MON, "09:00").toISOString());
  });

  it("removes slots that overlap an existing booking", () => {
    // Booking 09:30-10:30 blocks candidate starts 09:00, 09:30, 10:00
    // (each of those 1h slots would overlap it). 08:00 doesn't exist; 10:30 ok.
    const existing: Interval[] = [{ start: at(MON, "09:30"), end: at(MON, "10:30") }];
    const slots = computeAvailableSlots({
      day: at(MON, "00:00"),
      durationMin: 60,
      existingBookings: existing,
    });
    const iso = slots.map((s) => s.toISOString());
    expect(iso).not.toContain(at(MON, "09:00").toISOString());
    expect(iso).not.toContain(at(MON, "09:30").toISOString());
    expect(iso).not.toContain(at(MON, "10:00").toISOString());
    expect(iso).toContain(at(MON, "10:30").toISOString()); // 10:30-11:30, clear
    expect(iso).toContain(at(MON, "11:00").toISOString()); // 11:00-12:00, clear
  });

  it("keeps a slot that abuts a booking exactly (no overlap at boundary)", () => {
    // Booking 10:00-11:00; a 1h slot at 09:00 ends 10:00 -> touches, allowed.
    const existing: Interval[] = [{ start: at(MON, "10:00"), end: at(MON, "11:00") }];
    const slots = computeAvailableSlots({
      day: at(MON, "00:00"),
      durationMin: 60,
      existingBookings: existing,
    });
    const iso = slots.map((s) => s.toISOString());
    expect(iso).toContain(at(MON, "09:00").toISOString());
    expect(iso).toContain(at(MON, "11:00").toISOString());
    expect(iso).not.toContain(at(MON, "10:00").toISOString());
  });

  it("a 6h service E booking blocks the whole day for that professional", () => {
    const existing: Interval[] = [{ start: at(MON, "09:00"), end: at(MON, "15:00") }];
    const slots = computeAvailableSlots({
      day: at(MON, "00:00"),
      durationMin: 360, // another E can only start 09:00-11:00, all blocked
      existingBookings: existing,
    });
    expect(slots).toHaveLength(0);
  });
});

// In-memory fake repo: proves the scheduler works against the port, no DB.
class FakeRepo implements BookingRepository {
  private services: Service[];
  private capable: Map<number, Professional[]>; // serviceId -> pros
  private bookings: Booking[] = [];
  private nextId = 1;
  // If true, insert always throws DoubleBookingError (simulates a lost race).
  public simulateRace = false;

  constructor(services: Service[], capable: Map<number, Professional[]>) {
    this.services = services;
    this.capable = capable;
  }

  async listServices() {
    return this.services;
  }
  async getServiceByCode(code: string) {
    return this.services.find((s) => s.code === code) ?? null;
  }
  async listProfessionalsForService(serviceId: number) {
    return this.capable.get(serviceId) ?? [];
  }
  async getBookingsForProfessionalOnDay(professionalId: number, day: Date): Promise<PortInterval[]> {
    const ymd = day.toISOString().slice(0, 10);
    return this.bookings
      .filter((b) => b.professionalId === professionalId && b.start.toISOString().slice(0, 10) === ymd)
      .map((b) => ({ start: b.start, end: b.end }));
  }
  async insertBooking(b: NewBooking): Promise<Booking> {
    if (this.simulateRace) throw new DoubleBookingError();
    const booking: Booking = { ...b, id: this.nextId++ };
    this.bookings.push(booking);
    return booking;
  }
}

const SERVICE_A: Service = { id: 1, code: "A", name: "Routine Checkup", durationMinutes: 60 };
const SERVICE_C: Service = { id: 3, code: "C", name: "Cavity Filling", durationMinutes: 150 };
const JUNIOR: Professional = { id: 10, name: "Dr. Junior", level: "junior" };
const SENIOR: Professional = { id: 20, name: "Dr. Senior", level: "senior" };

function makeRepo() {
  return new FakeRepo(
    [SERVICE_A, SERVICE_C],
    new Map([
      [SERVICE_A.id, [JUNIOR, SENIOR]], // A: both
      [SERVICE_C.id, [SENIOR]], // C: senior only
    ]),
  );
}

describe("scheduler.createBooking", () => {
  const base = {
    serviceCode: "A",
    professionalId: SENIOR.id,
    patientName: "Pat",
    patientEmail: "pat@example.com",
  };

  it("books a valid appointment", async () => {
    const repo = makeRepo();
    const res = await createBooking(repo, { ...base, start: at(MON, "09:00") });
    expect(res.ok).toBe(true);
  });

  it("rejects a time outside clinic hours", async () => {
    const repo = makeRepo();
    const res = await createBooking(repo, { ...base, start: at(MON, "08:00") });
    expect(res).toMatchObject({ ok: false, reason: "outside_hours" });
  });

  it("rejects a professional not qualified for the service", async () => {
    const repo = makeRepo();
    // Junior for service C (senior-only) -> not in the capable list.
    const res = await createBooking(repo, {
      ...base,
      serviceCode: "C",
      professionalId: JUNIOR.id,
      start: at(MON, "09:00"),
    });
    expect(res).toMatchObject({ ok: false, reason: "not_qualified" });
  });

  it("refuses a double booking (app-level overlap check)", async () => {
    const repo = makeRepo();
    const first = await createBooking(repo, { ...base, start: at(MON, "09:00") });
    expect(first.ok).toBe(true);
    const second = await createBooking(repo, { ...base, start: at(MON, "09:30") });
    expect(second).toMatchObject({ ok: false, reason: "slot_taken" });
  });

  it("refuses when the DB constraint fires (lost race)", async () => {
    const repo = makeRepo();
    repo.simulateRace = true; // app-level check passes, DB rejects on insert
    const res = await createBooking(repo, { ...base, start: at(MON, "09:00") });
    expect(res).toMatchObject({ ok: false, reason: "slot_taken" });
  });
});

describe("scheduler.findAvailability", () => {
  it("offers only qualified professionals and hides fully-booked ones", async () => {
    const repo = makeRepo();
    // Service C is senior-only, so only the senior should be offered.
    const avail = await findAvailability(repo, { serviceCode: "C", day: at(MON, "00:00") });
    expect("error" in avail).toBe(false);
    if (!("error" in avail)) {
      expect(avail.options).toHaveLength(1);
      expect(avail.options[0].professional.id).toBe(SENIOR.id);
    }
  });

  it("returns an error for an unknown service", async () => {
    const repo = makeRepo();
    const avail = await findAvailability(repo, { serviceCode: "Z", day: at(MON, "00:00") });
    expect(avail).toMatchObject({ error: expect.any(String) });
  });
});

describe("scheduler.listServices", () => {
  it("returns every service the repo knows", async () => {
    const repo = makeRepo();
    const services = await listServices(repo);
    expect(services.map((s) => s.code).sort()).toEqual(["A", "C"]);
  });
});

describe("scheduler.findAvailabilityForProfessional", () => {
  it("returns that one professional's slots when qualified", async () => {
    const repo = makeRepo();
    const res = await findAvailabilityForProfessional(repo, {
      serviceCode: "C",
      professionalId: SENIOR.id,
      day: at(MON, "00:00"),
    });
    expect("error" in res).toBe(false);
    if (!("error" in res)) {
      expect(res.professional.id).toBe(SENIOR.id);
      expect(res.slots.length).toBeGreaterThan(0);
    }
  });

  it("errors when the professional cannot perform the service", async () => {
    const repo = makeRepo();
    const res = await findAvailabilityForProfessional(repo, {
      serviceCode: "C", // senior-only
      professionalId: JUNIOR.id,
      day: at(MON, "00:00"),
    });
    expect(res).toMatchObject({ error: expect.any(String) });
  });

  it("errors for an unknown service", async () => {
    const repo = makeRepo();
    const res = await findAvailabilityForProfessional(repo, {
      serviceCode: "Z",
      professionalId: SENIOR.id,
      day: at(MON, "00:00"),
    });
    expect(res).toMatchObject({ error: expect.any(String) });
  });
});

describe("addMinutes", () => {
  it("adds minutes without mutating the input", () => {
    const start = at(MON, "09:00");
    const end = addMinutes(start, 150);
    expect(end.toISOString()).toBe(at(MON, "11:30").toISOString());
    expect(start.toISOString()).toBe(at(MON, "09:00").toISOString());
  });
});
