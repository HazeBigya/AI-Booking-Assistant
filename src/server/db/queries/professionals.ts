import { eq } from "drizzle-orm";
import { db } from "../client";
import { professionals, professionalServices } from "../schema";
import type { ProfessionalLevel } from "@server/domain/booking/rules";
import type { Professional } from "@server/domain/booking/ports";

export async function listProfessionalsForService(serviceId: number): Promise<Professional[]> {
  const rows = await db
    .select({ id: professionals.id, name: professionals.name, level: professionals.level })
    .from(professionals)
    .innerJoin(professionalServices, eq(professionalServices.professionalId, professionals.id))
    .where(eq(professionalServices.serviceId, serviceId))
    .orderBy(professionals.id);
  return rows.map((r) => ({ id: r.id, name: r.name, level: r.level as ProfessionalLevel }));
}
