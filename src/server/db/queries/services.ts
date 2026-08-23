import { eq } from "drizzle-orm";
import { db } from "../client";
import { services } from "../schema";
import type { Service } from "@server/domain/booking/ports";

type ServiceRow = typeof services.$inferSelect;
const toService = (r: ServiceRow): Service => ({
  id: r.id,
  code: r.code,
  name: r.name,
  durationMinutes: r.durationMinutes,
});

export async function listServices(): Promise<Service[]> {
  const rows = await db.select().from(services).orderBy(services.code);
  return rows.map(toService);
}

export async function getServiceByCode(code: string): Promise<Service | null> {
  const rows = await db.select().from(services).where(eq(services.code, code)).limit(1);
  return rows[0] ? toService(rows[0]) : null;
}
