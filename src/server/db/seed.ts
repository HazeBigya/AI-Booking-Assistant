import "dotenv/config";
import { db, pool } from "./client";
import { professionals, professionalServices, services } from "./schema";

// Idempotent: skips if professionals already exist. `docker compose down -v`
// (or truncate) to reseed from scratch.
async function seed() {
  const existing = await db.select({ id: professionals.id }).from(professionals).limit(1);
  if (existing.length > 0) {
    console.log("Seed skipped: data already present.");
    return;
  }

  const svc = await db
    .insert(services)
    .values([
      {
        code: "A",
        name: "Routine Checkup",
        description:
          "A general dental exam where the dentist checks your teeth and gums for any issues. Includes a consultation and advice on keeping your mouth healthy.",
        durationMinutes: 60,
        basePrice: 50,
      },
      {
        code: "B",
        name: "Teeth Whitening",
        description:
          "A cosmetic treatment that lightens stains and discoloration to brighten your smile. A popular option before events or for anyone wanting whiter teeth.",
        durationMinutes: 60,
        basePrice: 100,
      },
      {
        code: "C",
        name: "Cavity Filling",
        description:
          "The dentist removes decay from a tooth and fills the space to restore it. This stops the cavity from getting worse and relieves discomfort.",
        durationMinutes: 150,
        basePrice: 150,
      },
      {
        code: "D",
        name: "Root Canal",
        description:
          "Treatment for a tooth with an infected or damaged inner pulp, cleaning it out to save the natural tooth. It relieves pain and avoids extraction.",
        durationMinutes: 120,
        basePrice: 200,
      },
      {
        code: "E",
        name: "Full Mouth Restoration",
        description:
          "A comprehensive, multi-stage treatment that rebuilds or replaces the full set of teeth. Best for extensive damage or wear across the whole mouth.",
        durationMinutes: 360,
        basePrice: 400,
      },
    ])
    .returning({ id: services.id, code: services.code });
  const serviceId = Object.fromEntries(svc.map((s) => [s.code, s.id])) as Record<string, number>;

  const pros = await db
    .insert(professionals)
    .values([
      {
        name: "John",
        email: "bigya.developer@gmail.com", // dummy dentist inbox (demo)
        title: "Junior Dentist",
        level: "junior",
        bio: "Junior dentist, 3 years' experience. Handles routine checkups and whitening.",
      },
      {
        name: "Oscar",
        email: "bigya.developer@gmail.com",
        title: "Senior Dentist",
        level: "senior",
        bio: "Senior dentist, 15 years' experience. Focus on restorative work: fillings, root canals, full restorations.",
      },
      {
        name: "Kate",
        email: "bigya.developer@gmail.com",
        title: "Senior Dentist",
        level: "senior",
        bio: "Senior dentist, 12 years' experience. Lead cosmetic dentist; whitening and aesthetics are her focus.",
      },
    ])
    .returning({ id: professionals.id, name: professionals.name });
  const proId = Object.fromEntries(pros.map((p) => [p.name, p.id])) as Record<string, number>;

  // proficiency 1–5; priceOverride (dollars) overrides the service base when set.
  const mappings: {
    pro: string;
    code: string;
    proficiency: number;
    note: string;
    priceOverride?: number;
  }[] = [
    // John (junior): A, B only.
    { pro: "John", code: "A", proficiency: 3, note: "Comfortable with routine checkups." },
    { pro: "John", code: "B", proficiency: 3, note: "Performs standard whitening treatments." },
    // Oscar (senior): all; strongest at restorative work.
    { pro: "Oscar", code: "A", proficiency: 4, note: "Thorough general exams." },
    { pro: "Oscar", code: "B", proficiency: 4, note: "Experienced with whitening." },
    { pro: "Oscar", code: "C", proficiency: 5, note: "Highly experienced with fillings." },
    { pro: "Oscar", code: "D", proficiency: 5, note: "Root canal specialist." },
    { pro: "Oscar", code: "E", proficiency: 5, note: "Leads complex full-mouth restorations." },
    // Kate (senior): all; cosmetic/whitening specialist, premium whitening price.
    { pro: "Kate", code: "A", proficiency: 4, note: "Thorough general exams." },
    {
      pro: "Kate",
      code: "B",
      proficiency: 5,
      note: "Lead cosmetic dentist; whitening is her focus.",
      priceOverride: 150,
    },
    { pro: "Kate", code: "C", proficiency: 4, note: "Skilled with fillings." },
    { pro: "Kate", code: "D", proficiency: 4, note: "Performs root canals." },
    { pro: "Kate", code: "E", proficiency: 4, note: "Contributes to full-mouth restorations." },
  ];

  await db.insert(professionalServices).values(
    mappings.map((m) => ({
      professionalId: proId[m.pro],
      serviceId: serviceId[m.code],
      proficiency: m.proficiency,
      expertiseNote: m.note,
      priceOverride: m.priceOverride ?? null,
    })),
  );

  console.log(`Seed complete: ${pros.length} professionals, ${svc.length} services.`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
