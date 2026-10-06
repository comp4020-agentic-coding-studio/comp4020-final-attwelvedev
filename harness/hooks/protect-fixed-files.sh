#!/bin/sh
# PreToolUse (Edit|Write|MultiEdit): block edits to the files the course fixes.
# fly.toml, the shipped spec invariants and the course CI/hooks are the contract
# the tutor checks; changing them is a decision for me, not the agent.
file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
rel=${file#"${CLAUDE_PROJECT_DIR:-$PWD}"/}
case "$rel" in
fly.toml | spec/invariants.test.ts | spec/global-setup.ts | .github/workflows/* | .githooks/*)
	echo "blocked: $rel is fixed by the course. Ask me before changing it." >&2
	exit 2
	;;
esac
exit 0
