// Read-only presentation data for the AI tools: descriptions, prices, expertise.
// Separate from the booking core (which only cares about scheduling correctness).
import { asc, eq } from "drizzle-orm";
import { db } from "../client";
import { professionals, professionalServices, services } from "../schema";

export interface ServiceCatalogItem {
  code: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
}

export async function getServiceCatalog(): Promise<ServiceCatalogItem[]> {
  return db
    .select({
      code: services.code,
      name: services.name,
      description: services.description,
      durationMinutes: services.durationMinutes,
      price: services.basePrice,
    })
    .from(services)
    .orderBy(asc(services.code));
}

export interface ProfessionalForService {
  professionalId: number;
  name: string;
  title: string;
  level: string;
  bio: string;
  expertiseNote: string | null;
  proficiency: number | null;
  price: number;
}

// null => the service code doesn't exist. [] => no one performs it.
export async function getProfessionalsForServiceByCode(
  code: string,
): Promise<ProfessionalForService[] | null> {
  const svc = await db
    .select({ id: services.id, base: services.basePrice })
    .from(services)
    .where(eq(services.code, code))
    .limit(1);
  if (!svc[0]) return null;

  const rows = await db
    .select({
      professionalId: professionals.id,
      name: professionals.name,
      title: professionals.title,
      level: professionals.level,
      bio: professionals.bio,
      expertiseNote: professionalServices.expertiseNote,
      proficiency: professionalServices.proficiency,
      override: professionalServices.priceOverride,
    })
    .from(professionals)
    .innerJoin(professionalServices, eq(professionalServices.professionalId, professionals.id))
    .where(eq(professionalServices.serviceId, svc[0].id))
    .orderBy(asc(professionals.id));

  return rows.map((r) => ({
    professionalId: r.professionalId,
    name: r.name,
    title: r.title,
    level: r.level,
    bio: r.bio,
    expertiseNote: r.expertiseNote,
    proficiency: r.proficiency,
    price: r.override ?? svc[0].base, // override pattern resolved here
  }));
}
