CREATE TABLE `micro_learning_records` (
	`id` text PRIMARY KEY NOT NULL,
	`knowledge_point_id` text NOT NULL,
	`bank_id` text NOT NULL,
	`generated_cards` text NOT NULL,
	`extended_cards` text,
	`context` text,
	`created_at` integer NOT NULL
);
