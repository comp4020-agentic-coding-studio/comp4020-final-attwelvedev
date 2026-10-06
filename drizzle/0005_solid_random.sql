CREATE TABLE `passkeys` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`public_key` blob NOT NULL,
	`counter` integer NOT NULL,
	`transports` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
