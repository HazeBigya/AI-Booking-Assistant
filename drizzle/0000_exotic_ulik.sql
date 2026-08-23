CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer,
	"professional_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"price_cents" integer,
	"patient_name" text NOT NULL,
	"patient_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_end_after_start" CHECK ("bookings"."end_time" > "bookings"."start_time"),
	CONSTRAINT "bookings_status_valid" CHECK ("bookings"."status" in ('booked','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_role_valid" CHECK ("chat_messages"."role" in ('user','assistant','tool'))
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "professional_services" (
	"professional_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"expertise_note" text,
	"proficiency" smallint,
	"price_cents" integer,
	CONSTRAINT "professional_services_professional_id_service_id_pk" PRIMARY KEY("professional_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "professionals" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"level" text NOT NULL,
	"bio" text NOT NULL,
	"calendar_provider" text DEFAULT 'noop' NOT NULL,
	"calendar_id" text,
	CONSTRAINT "professionals_level_valid" CHECK ("professionals"."level" in ('junior','senior'))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"base_price_cents" integer NOT NULL,
	CONSTRAINT "services_code_unique" UNIQUE("code"),
	CONSTRAINT "services_duration_positive" CHECK ("services"."duration_minutes" > 0),
	CONSTRAINT "services_price_nonneg" CHECK ("services"."base_price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bookings_prof_start" ON "bookings" USING btree ("professional_id","start_time");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_session_time" ON "chat_messages" USING btree ("session_id","created_at");