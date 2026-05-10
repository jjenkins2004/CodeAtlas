CREATE TYPE "public"."symbol_type" AS ENUM('function', 'class', 'enum', 'protocol', 'method');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'internal', 'private');--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"file" text NOT NULL,
	"type" "symbol_type" NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"blurb" text,
	"implementation" text,
	"tags" text[],
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "symbols_embedding_cosine_idx" ON "symbols" USING hnsw ("embedding" vector_cosine_ops);