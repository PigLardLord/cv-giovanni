#!/usr/bin/env bash
# Policy shared by the git hooks. No dependencies beyond git and coreutils, so the hooks
# stay valid whatever tool you put on top — or none.
#
# Protected branches come from <repo>/.agents/harness/guards.json, which is versioned because it is
# project policy, not personal preference. When it is missing, a prudent default applies:
# better to protect one branch too many than one too few.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
POLICY="$REPO_ROOT/.agents/harness/guards.json"

# The policy that applies is the COMMITTED one. Read from the working tree, an uncommitted edit
# disarmed the hooks that were about to judge that very commit — and since the file itself counted
# as non-code, the edit could then be committed on a protected branch and made permanent.
POLICY_TEXT=""
if git -C "$REPO_ROOT" rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
  POLICY_TEXT="$(git -C "$REPO_ROOT" show "HEAD:.agents/harness/guards.json" 2>/dev/null || true)"
fi
if [ -z "$POLICY_TEXT" ] && [ -f "$POLICY" ]; then
  POLICY_TEXT="$(cat "$POLICY")"      # first commit: nothing is committed yet
fi
POLICY_FILE=""
if [ -n "$POLICY_TEXT" ]; then
  POLICY_FILE="$(mktemp)"; printf '%s' "$POLICY_TEXT" > "$POLICY_FILE"
  trap 'rm -f "$POLICY_FILE"' EXIT
fi

DEFAULT_PROTECTED='^(develop|main|master|release/.+)$'
DEFAULT_NONCODE='(^(CLAUDE|AGENTS)\.md$|(^|/)\.gitignore$|^\.claude/|^\.agents/|^\.githooks/|^docs/|\.md$)'

# Checked BEFORE the non-code list, and not overridable by it. The policy decides what is
# protected and the hooks carry it out, so a change to either is a change to the enforcement —
# and a guard that lets its own configuration through on a protected branch guards nothing: write
# a permissive policy, commit it because it counted as documentation, then commit anything.
ALWAYS_CODE='(^\.agents/harness/guards\.json$|^\.githooks/)'

# A policy file that exists is authoritative. When it cannot be parsed the hooks refuse,
# because falling back to the default silently applies rules nobody wrote, inside a file
# somebody wrote on purpose.
_policy_is_readable() {
  if command -v jq >/dev/null 2>&1; then jq empty "$1" >/dev/null 2>&1; return $?; fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$1" >/dev/null 2>&1; return $?
  fi
  return 0   # no parser here: the sed reader below is best-effort, and says nothing false
}

# jq when available, otherwise a reader built from sed. A hook must not demand
# dependencies beyond git and coreutils.
#
# $3 decides the joining, and the two lists need different joining. A branch name is
# matched whole, so `protected` is wrapped in ^(...)$ and a bare `trunk` cannot also
# protect `trunk-experimental`. A path pattern carries its own anchors — `\.md$`,
# `^docs/` — so wrapping `noncode` turned every one of them into a demand that the whole
# path equal the pattern, and an explicit list silently classified all documentation as
# code.
_json_array() {                       # $1 = file, $2 = key, $3 = whole|partial
  local f="$1" k="$2" mode="$3" items
  if command -v jq >/dev/null 2>&1; then
    items=$(jq -r --arg k "$k" 'try (.[$k] // empty) | select(type=="array") | .[]' "$f" 2>/dev/null)
  else
    items=$(sed -n "/\"$k\"[[:space:]]*:[[:space:]]*\[/,/\]/p" "$f" 2>/dev/null \
            | grep -o '"[^"]*"' | sed '1d' | tr -d '"' | sed 's/\\\\/\\/g')
  fi
  [ -z "$items" ] && return 1
  items=$(printf '%s' "$items" | paste -sd '|' -)
  if [ "$mode" = "whole" ]; then printf '^(%s)$' "$items"; else printf '(%s)' "$items"; fi
}

# A key that is present and empty is a decision — "protect nothing", "everything is code" — and
# falling back to the default replaced it with rules nobody wrote.
_key_present() {
  if command -v jq >/dev/null 2>&1; then jq -e --arg k "$2" 'has($k)' "$1" >/dev/null 2>&1
  else grep -q "\"$2\"[[:space:]]*:" "$1" 2>/dev/null; fi
}

PROTECTED_RE="$DEFAULT_PROTECTED"
NONCODE_RE="$DEFAULT_NONCODE"
if [ -n "$POLICY_FILE" ]; then
  if ! _policy_is_readable "$POLICY_FILE"; then
    printf '\n\033[31m✖ %s cannot be parsed\033[0m\n' ".agents/harness/guards.json" >&2
    printf '  Fix it, or delete it to fall back to the default. A policy that cannot be\n' >&2
    printf '  read is not a policy that is absent.\n\n' >&2
    exit 1
  fi
  if _key_present "$POLICY_FILE" protected; then
    PROTECTED_RE="$(_json_array "$POLICY_FILE" protected whole || printf '^(?!)$')"
  fi
  if _key_present "$POLICY_FILE" noncode; then
    NONCODE_RE="$(_json_array "$POLICY_FILE" noncode partial || printf '(?!)')"
  fi
fi

# grep exits 2 when the pattern does not compile, which `-q` alone reports as "no match" —
# so a typo in the policy quietly switched protection OFF, in a file that says it is on.
_matches() {                          # $1 = text, $2 = pattern
  printf '%s' "$1" | grep -qE "$2"; local rc=$?
  if [ "$rc" -gt 1 ]; then
    printf '\n\033[31m✖ a pattern in the policy does not compile\033[0m\n' >&2
    printf '  %s\n' "$2" >&2
    printf '  Fix it. A policy that cannot be read is not a policy that is absent.\n\n' >&2
    exit 1
  fi
  return $rc
}
is_protected() { _matches "$1" "$PROTECTED_RE"; }
is_code()      { _matches "$1" "$ALWAYS_CODE" || ! _matches "$1" "$NONCODE_RE"; }

# From a stream of paths on stdin, keep only the ones that count as code.
code_only() { while IFS= read -r p; do [ -n "$p" ] && is_code "$p" && printf '%s\n' "$p"; done; }

refuse() {                            # $1 = title, $2... = explanation lines
  local title="$1"; shift
  printf '\n\033[31m✖ %s\033[0m\n' "$title" >&2
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  printf '\n  Deliberate escape hatch: --no-verify (skips ALL checks).\n' >&2
  printf '  The real guarantee lives server-side: enable branch protection on the remote.\n\n' >&2
  exit 1
}
