---
name: agent-protocols
description: "How role agents compose with stack profiles: the role is the contract, the stack is the conformance, they meet at spawn. Use it when you need to launch developer/tester/reviewer/qa on a project, add support for a new stack, or understand why a role refuses to start."
---

# Agent protocols

Four roles plus N stacks, instead of a 4×N grid of pre-fused agents.

## The two pieces

**The role is the contract** — what a developer, a tester, a reviewer, a QA must do,
regardless of language and framework. It lives **inside** the agent: when you launch
`developer`, the contract is already there. It does not depend on a read that might
never happen.

**The stack is the conformance** — build commands, test frameworks, idioms, review
pitfalls. It lives **in the project**, in `<repo>/.agents/harness/stacks/<name>.md`, because it
declares architecture choices that belong to the project, not to you. A repo using Koin
and XML would get wrong instructions from an "Android" profile kept at user level.

## How they compose

Pass the profile's path in the spawn prompt:

> "Your stack profile is `.agents/harness/stacks/swift-xcode.md`."

The agent reads it and conforms. With no injected profile it falls back to `stack` in
`.agents/harness/ticket-loop.json`; if it is not there either **it stops and says so**, instead
of inventing language and framework.

## Adding a stack

```bash
bash scripts/stack-init.sh swift-xcode              # in the agent-protocols module directory;
                                                    # under Claude Code, /stack-new does the same
```

Fill it in completely and point to it with a path **relative to the repo**. Then the same
four agents know how to work in Swift: no new definitions.

## If the project already has its own role system, it wins

Recognize it and respect it, in this order: an `AGENTS.md` with role cards in
`.codex/agents/`; `role_cards` in `.agents/harness/ticket-loop.json`; project agents in
`.claude/agents/`. When it exists, launch the project's agents and inject its role cards.
The four roles here are the fallback for projects that have nothing of the kind.

## Permissions: reviewer and QA do not write

`reviewer` and `qa` have neither `Edit` nor `Write`, and that is a choice. A reviewer who
fixes things themselves stops being a reviewer, and QA verifies the running software instead
of modifying it. If a fix is needed, it goes back to whoever implements.

## What this mechanism does NOT guarantee

The agent receives a path and the instruction to read it: **that is not verified
conformance**. If the file is missing, or half empty, the agent can still proceed on what
it knows in general. That is why the role contract lives inside the agent (that half is
guaranteed), and why the `ticket-loop` preflight verifies that the profile exists and is
not the unfilled template. That check is the real gate, not the instruction in the prompt.
