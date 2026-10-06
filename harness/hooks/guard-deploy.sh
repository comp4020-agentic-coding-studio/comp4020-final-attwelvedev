#!/bin/sh
# PreToolUse (Bash): never deploy from a dirty tree. A deploy that isn't backed
# by a commit leaves no trace in the history, which is half of what's marked.
cmd=$(jq -r '.tool_input.command // empty')
case "$cmd" in
*"flyctl deploy"* | *"fly deploy"*)
	if [ -n "$(git -C "${CLAUDE_PROJECT_DIR:-.}" status --porcelain)" ]; then
		echo "blocked: working tree has uncommitted changes. Commit first, then deploy." >&2
		exit 2
	fi
	;;
esac
exit 0
