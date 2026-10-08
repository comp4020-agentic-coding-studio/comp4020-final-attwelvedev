#!/bin/sh
# PostToolUse (Edit|Write|MultiEdit): lint the rooms after a room file is
# edited and print any issues to stderr. Never blocks (always exit 0), like the
# formatter hook.
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
*/rooms/*.room | rooms/*.room)
	cd "${CLAUDE_PROJECT_DIR:-.}" && mise exec -- pnpm lint:rooms >&2
	;;
esac
exit 0
