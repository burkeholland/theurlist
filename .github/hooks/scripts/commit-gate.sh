#!/bin/bash
# commit-gate.sh — preToolUse hook
#
# Gates git commits behind ALL quality checks: type checking, linting, and tests.
# The model cannot commit until every check passes. The denial reason contains the
# actual errors, creating a feedback loop — the model sees what's broken and has
# to fix it before trying again.
#
# Requires: jq

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')

# Only gate bash commands
if [ "$TOOL_NAME" != "bash" ]; then
  exit 0
fi

# Only gate git commit commands
COMMAND=$(echo "$INPUT" | jq -r '.toolArgs' | jq -r '.command // empty')
if ! echo "$COMMAND" | grep -q "git commit"; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')
ERRORS=""

# 1. TypeScript type check
if [ -f "$CWD/tsconfig.json" ]; then
  TSC_OUTPUT=$(cd "$CWD" && npx tsc --noEmit 2>&1)
  if [ $? -ne 0 ]; then
    ERRORS="${ERRORS}
=== TypeScript Errors ===
$(echo "$TSC_OUTPUT" | head -30)
"
  fi
fi

# 2. Lint
if [ -f "$CWD/package.json" ]; then
  HAS_LINT=$(jq -r '.scripts.lint // empty' "$CWD/package.json")
  if [ -n "$HAS_LINT" ]; then
    LINT_OUTPUT=$(cd "$CWD" && npm run lint --silent 2>&1)
    if [ $? -ne 0 ]; then
      ERRORS="${ERRORS}
=== Lint Errors ===
$(echo "$LINT_OUTPUT" | tail -30)
"
    fi
  fi
fi

# 3. Tests
if [ -f "$CWD/package.json" ]; then
  HAS_TEST=$(jq -r '.scripts.test // empty' "$CWD/package.json")
  if [ -n "$HAS_TEST" ]; then
    TEST_OUTPUT=$(cd "$CWD" && CI=true npm test -- --watchAll=false 2>&1)
    if [ $? -ne 0 ]; then
      ERRORS="${ERRORS}
=== Test Failures ===
$(echo "$TEST_OUTPUT" | tail -30)
"
    fi
  fi
fi

# If any check failed, deny the commit with full error output
if [ -n "$ERRORS" ]; then
  jq -nc --arg reason "Cannot commit — fix these issues first:
$ERRORS" \
    '{permissionDecision: "deny", permissionDecisionReason: $reason}'
  exit 0
fi

# All checks passed
