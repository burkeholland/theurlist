#!/bin/bash
# lint-gate.sh — preToolUse hook
#
# Gates file edits behind lint checks. If lint errors exist from previous edits,
# the model must fix them before editing other files. Edits to files that HAVE
# lint errors are allowed so the model can fix them (avoids deadlock).
#
# Requires: jq

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')

# Only gate edit and create tools
if [ "$TOOL_NAME" != "edit" ] && [ "$TOOL_NAME" != "create" ]; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')

# Skip if no package.json
if [ ! -f "$CWD/package.json" ]; then
  exit 0
fi

# Skip if no lint script configured
HAS_LINT=$(jq -r '.scripts.lint // empty' "$CWD/package.json")
if [ -z "$HAS_LINT" ]; then
  exit 0
fi

# Run linter
LINT_OUTPUT=$(cd "$CWD" && npm run lint --silent 2>&1)
LINT_EXIT=$?

# Lint passes — allow the edit
if [ $LINT_EXIT -eq 0 ]; then
  exit 0
fi

# Lint failed. Check if the model is editing a file WITH lint errors
# (allow it so the model can fix the error — prevents deadlock).
EDIT_FILE=$(echo "$INPUT" | jq -r '.toolArgs' | jq -r '.path // empty')

if [ -n "$EDIT_FILE" ]; then
  BASENAME=$(basename "$EDIT_FILE")
  if echo "$LINT_OUTPUT" | grep -q "$BASENAME"; then
    exit 0
  fi
fi

# Model is trying to edit a different file while lint errors exist — deny
ERRORS=$(echo "$LINT_OUTPUT" | tail -30)
jq -nc --arg reason "Lint errors must be fixed before editing other files. Current errors:
$ERRORS" \
  '{permissionDecision: "deny", permissionDecisionReason: $reason}'
