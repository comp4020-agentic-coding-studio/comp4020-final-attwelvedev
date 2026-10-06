CREATE TABLE `offer_targets` (
	`offer_id` text NOT NULL,
	`community_id` text NOT NULL,
	PRIMARY KEY(`offer_id`, `community_id`),
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`household_id` text NOT NULL,
	`pickup_note` text NOT NULL,
	`status` text NOT NULL,
	`claimed_by_household_id` text,
	`claimed_community_id` text,
	`claimed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claimed_by_household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`claimed_community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offers_one_open_per_item` ON `offers` (`item_id`) WHERE "offers"."status" in ('offered', 'claimed');--> statement-breakpoint
ALTER TABLE `households` ADD `default_pickup_note` text;