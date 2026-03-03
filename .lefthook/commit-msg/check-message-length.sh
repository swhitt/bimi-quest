#!/bin/bash
# Enforce commit message limits: 72-char summary, max 3 body lines.
# Runs as a lefthook commit-msg hook so it applies in all contexts
# (main session, sub-agents, manual git).

MAX_SUMMARY_LENGTH=72
MAX_BODY_LINES=3

MSG_FILE="$1"
if [ ! -f "$MSG_FILE" ]; then
  echo "ERROR: No commit message file provided"
  exit 1
fi

# Strip comment lines (lines starting with #) that git adds
MSG=$(grep -v '^#' "$MSG_FILE")

SUMMARY=$(echo "$MSG" | head -1)
# Body starts after the blank separator line (line 3+)
BODY=$(echo "$MSG" | tail -n +3)

ISSUES=""

SUMMARY_LENGTH=${#SUMMARY}
if [ "$SUMMARY_LENGTH" -gt "$MAX_SUMMARY_LENGTH" ]; then
  ISSUES="Summary is ${SUMMARY_LENGTH} chars (max ${MAX_SUMMARY_LENGTH})."
fi

if [ -n "$BODY" ]; then
  LINE_COUNT=$(echo "$BODY" | wc -l | tr -d ' ')
  if [ "$LINE_COUNT" -gt "$MAX_BODY_LINES" ]; then
    [ -n "$ISSUES" ] && ISSUES="$ISSUES "
    ISSUES="${ISSUES}Body is ${LINE_COUNT} lines (max ${MAX_BODY_LINES})."
  fi
fi

if [ -n "$ISSUES" ]; then
  echo "ERROR: Commit message exceeds limits: ${ISSUES}"
  exit 1
fi
