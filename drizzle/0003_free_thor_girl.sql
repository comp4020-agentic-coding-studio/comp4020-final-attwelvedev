CREATE TABLE `communities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`join_code` text NOT NULL,
	`creator_household_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`centre_lat` real,
	`centre_lng` real,
	`radius_m` integer,
	FOREIGN KEY (`creator_household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communities_join_code_unique` ON `communities` (`join_code`);--> statement-breakpoint
CREATE TABLE `community_households` (
	`community_id` text NOT NULL,
	`household_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	`display_name` text NOT NULL,
	PRIMARY KEY(`community_id`, `household_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_links` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
