#!/bin/sh
# PostToolUse (Edit|Write|MultiEdit): format and safe-fix the edited file with
# Biome so style never needs a prompt. Files Biome ignores are skipped silently.
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
*.ts | *.tsx | *.js | *.jsx | *.json | *.css)
	cd "${CLAUDE_PROJECT_DIR:-.}" &&
		mise exec -- pnpm exec biome check --write --no-errors-on-unmatched \
			--files-ignore-unknown=true "$file" >/dev/null 2>&1
	;;
esac
exit 0
