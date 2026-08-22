// =============================================================================
// The Postgres implementation of the BookingRepository PORT (lib/booking/ports).
//
// This is the concrete "adapter". The booking core declared WHAT it needs
// (ports.ts); this file provides HOW, in SQL. Because it implements the
// interface, scheduler.ts can use it in production and a fake in tests without
// changing a line. The dependency arrow points db -> booking, never the reverse.
//
// Two jobs live here and nowhere else:
//   1. Parametrized SQL ($1, $2, ...) — never string-concatenate user input.
//   2. Row mapping: snake_case DB columns -> camelCase domain objects.
// =============================================================================

import { pool } from "./client";
import type { Interval } from "@server/domain/booking/availability";
import type { ProfessionalLevel } from "@server/domain/booking/rules";
import {
  DoubleBookingError,
  type Booking,
  type BookingRepository,
  type NewBooking,
  type Professional,
  type Service,
} from "@server/domain/booking/ports";

// Postgres raises this SQLSTATE for an exclusion_constraint violation — i.e.
// our no_double_booking guard fired. We translate it to the domain error.
const EXCLUSION_VIOLATION = "23P01";

export const pgBookingRepository: BookingRepository = {
  async getServiceByCode(code: string): Promise<Service | null> {
    const { rows } = await pool.query(
      `SELECT id, code, name, duration_minutes
         FROM services
        WHERE code = $1`,
      [code],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      durationMinutes: r.duration_minutes,
    };
  },

  async listProfessionalsForService(serviceId: number): Promise<Professional[]> {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.level
         FROM professionals p
         JOIN professional_services ps ON ps.professional_id = p.id
        WHERE ps.service_id = $1
        ORDER BY p.id`,
      [serviceId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      level: r.level as ProfessionalLevel,
    }));
  },

  async getBookingsForProfessionalOnDay(
    professionalId: number,
    day: Date,
  ): Promise<Interval[]> {
    // Half-open UTC day window [dayStart, nextDay). Anything that starts within
    // this range is a booking "on that day". We compare on start_time, which is
    // what the availability algorithm needs to detect overlaps for that day.
    const dayStart = new Date(day);
    dayStart.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const { rows } = await pool.query(
      `SELECT start_time, end_time
         FROM bookings
        WHERE professional_id = $1
          AND start_time >= $2
          AND start_time <  $3
        ORDER BY start_time`,
      [professionalId, dayStart.toISOString(), nextDay.toISOString()],
    );
    return rows.map((r) => ({
      start: new Date(r.start_time),
      end: new Date(r.end_time),
    }));
  },

  async insertBooking(b: NewBooking): Promise<Booking> {
    try {
      const { rows } = await pool.query(
        `INSERT INTO bookings
           (professional_id, service_id, start_time, end_time,
            patient_name, patient_email)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          b.professionalId,
          b.serviceId,
          b.start.toISOString(),
          b.end.toISOString(),
          b.patientName,
          b.patientEmail,
        ],
      );
      return { ...b, id: rows[0].id };
    } catch (err: unknown) {
      // The exclusion constraint fired => someone took the slot between the
      // scheduler's check and this insert. Convert to the domain error so the
      // scheduler can return a friendly "slot just taken" result.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === EXCLUSION_VIOLATION
      ) {
        throw new DoubleBookingError();
      }
      throw err;
    }
  },
};
