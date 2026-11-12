CREATE TABLE "system_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"last_ok" boolean NOT NULL,
	"detail" text
);
