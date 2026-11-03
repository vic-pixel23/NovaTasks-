CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"amount_kobo" integer NOT NULL,
	"type" text DEFAULT 'task_reward' NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"transaction_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_id" uuid NOT NULL UNIQUE,
	CONSTRAINT "reward_amount" CHECK ("amount_kobo" > 0),
	CONSTRAINT "reward_type" CHECK ("type" = 'task_reward'),
	CONSTRAINT "reward_status" CHECK ("status" = 'posted')
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"proof" text NOT NULL,
	"reward_kobo" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" uuid,
	CONSTRAINT "submission_status" CHECK ("status" in ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"description" text NOT NULL,
	"kind" text NOT NULL,
	"reward_kobo" integer NOT NULL,
	"slots" integer NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_money" CHECK ("reward_kobo" > 0),
	CONSTRAINT "task_slots" CHECK ("slots" >= 0),
	CONSTRAINT "task_kind" CHECK ("kind" in ('task','survey')),
	CONSTRAINT "task_status" CHECK ("status" in ('published','paused','closed'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY,
	"full_name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "user_status" CHECK ("status" in ('active','suspended')),
	CONSTRAINT "user_role" CHECK ("role" in ('member','admin'))
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"amount_kobo" integer NOT NULL,
	"payment_details" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" uuid,
	"payment_reference" text UNIQUE,
	"request_key" uuid NOT NULL,
	CONSTRAINT "withdrawal_amount" CHECK ("amount_kobo" > 0),
	CONSTRAINT "withdrawal_status" CHECK ("status" in ('pending','approved','paid','rejected'))
);
--> statement-breakpoint
CREATE INDEX "rewards_user" ON "rewards" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_submission_per_user_task" ON "submissions" ("user_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_idempotency" ON "withdrawals" ("user_id","request_key");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_submission_id_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewer_id_users_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reviewer_id_users_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id");