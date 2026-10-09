CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`room_id` text,
	`room_version` integer,
	`heist_version` text,
	`team_name` text NOT NULL,
	`names` text NOT NULL,
	`ms` integer NOT NULL,
	`loot` integer NOT NULL,
	`loot_total` integer NOT NULL,
	`created_at` integer NOT NULL
);
