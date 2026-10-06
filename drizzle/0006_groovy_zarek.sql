ALTER TABLE `items` ADD `category` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `icon_key` text;--> statement-breakpoint
ALTER TABLE `items` ADD `measure` text DEFAULT 'have' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `fill_stop` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `exact_amount` real;--> statement-breakpoint
ALTER TABLE `items` ADD `exact_unit` text;--> statement-breakpoint
ALTER TABLE `items` ADD `estimated_expiry` text;--> statement-breakpoint
ALTER TABLE `items` ADD `exact_expiry` text;--> statement-breakpoint
ALTER TABLE `items` ADD `value_set_by` text REFERENCES members(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `items` ADD `value_set_at` integer;--> statement-breakpoint
ALTER TABLE `items` ADD `expiry_set_by` text REFERENCES members(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `items` ADD `expiry_set_at` integer;