---
name: sprint-planning
description: |-
  Filling a sprint from a backlog — reading the candidates, weighting them, handling carryover,
  and proposing a shape a person signs off before anything is written. Use it when asked to plan
  or prepare a sprint, an iteration or a milestone. It plans; it never implements, and it changes
  nothing until an explicit go-ahead.
---

# Sprint planning

Fills a sprint. It does not execute one — that is the loop's job, and planning that starts
implementing has stopped being planning.

**Nothing is mutated before an explicit go-ahead.** Not a label, not a milestone, not a comment.
The proposal is one of the artefacts that stays **fully visible**: a person has to decide on it,
and a fold hides what they have to weigh.

## What the tracker calls a sprint

The mechanics differ and the method does not. Read
`<plugin>/providers/tracker/<providers.tracker>.md` for the commands, and note which of these
your tracker uses:

| | Membership | Weight |
|---|---|---|
| **Milestone-shaped** | the ticket's milestone | a board field, since there is no issue-level weight |
| **Iteration-shaped** | the iteration, which may live on a parent group | the issue's own weight |

The distinction has one consequence worth stating: **membership and work state are different
axes.** Where membership is carried by the milestone or iteration, a committed ticket keeps
whatever backlog state the loop transitions *out of* — stripping it leaves the loop with nothing
to move from, and a committed ticket in no state at all. Where membership *is* the state, the two
would contradict, and the state has to move.

## 1 · Read the candidates, comments included

**Always read the thread, not just the description.** A ticket's comments are where its scope was
narrowed, its premise was challenged, or its estimate was invalidated. Planning from titles is how
a sprint fills with work that was already decided against.

Epics are containers, not work. They never enter a sprint; their children do.

## 2 · Prioritise

In order:

1. **Priority label** — highest first.
2. **Type** — a bug outranks tech debt, which is roughly level with a task.
3. **Blockers** — a ticket that blocks another candidate lifts above the ones it blocks. On a young
   project this dominates everything else: an unblocked critical path beats a high-priority ticket
   that cannot start.
4. **Judgement** — where the ordering is genuinely uncertain, ask rather than guess.

## 3 · Capacity, then weight

Ask for the budget in story points. Where a project has no established velocity there is no
defensible default — ask, and **record the answer in the proposal**, so the next planning has a
number to compare against.

**Weighting is part of planning, not an afterthought.** A sprint whose weights do not separate an
hour from three days is a burndown that counts tickets while pretending to count effort.

| Effort | SP | Means |
|---|---|---|
| very low | **1** | about an hour |
| low | **2** | half a day |
| medium | **3** | one to two days |
| high | **5** | three days or more |

Derive in this order, and state the value **and its source** beside every ticket, so a wrong one
can be corrected in a single pass:

1. The weight already recorded, when it is a real estimate.
2. Else the effort label, per the table.
3. Else priority: highest → 5, high → 3, medium → 2, low → 1.
4. Else **2**, flagged as unestimated.

**The effort label is a claim, not a fact.** When a ticket's own thread contradicts it, weight the
thread and say so in the proposal rather than the label.

**Never re-weight a sprint already running.** Correcting a weight mid-sprint moves the burndown for
reasons that have nothing to do with progress. Fix it at the next planning, or on a ticket that has
not started.

## 4 · Carryover

Open tickets already in the target sprint stay there. Whether they consume budget depends on where
they got to:

| State | Counts against budget? |
|---|---|
| development finished | **No** |
| in QA only | **No** |
| in progress | **Yes** |
| in review | **Yes** |
| blocked | **Yes** — assume it unblocks |
| no state at all | **Yes**, and flag it |

## 5 · Who a ticket belongs to

Eligibility, in order:

1. **Assigned to the person planning** — eligible, no question needed.
2. **Assigned to somebody else** — skip. Do not propose it. The only exception is being asked for
   it by name, and then ask: *"#X is assigned to <name>. Add you as a co-assignee, or take it
   over?"*
3. **Unassigned** — eligible **only with explicit approval**, however obviously worth doing it
   looks. Group these at the bottom of the proposal and ask together: *"These N unassigned tickets
   look sprint-worthy. Assign you to any of them?"* Never assign silently to make one eligible.

## 6 · The shape

```
carryover = open tickets already in the target sprint
budget    = the number the user gave
spent     = sum of sp(t) for the carryover that still counts

remaining = budget - spent

eligible  = open tickets, not in carryover,
            assigned to the user OR unassigned and worth surfacing

ask about the unassigned ones before adding any of them   # a decision, not a default

for t in eligible, sorted by the priority order above:
    if spent + sp(t) > budget + 2:   # soft overflow, at most 2 SP
        skip
    take t; spent += sp(t)

present carryover, proposal, total, and what is left of the budget
```

**Do not pad to hit the number.** If the honest answer is 9 of 15, say 9 of 15 — and say it
explicitly rather than letting the total speak for itself.

Render every ticket as a clickable link, in live markdown rather than inside a code fence.

## 7 · Quality actions — draft, never execute

While reading each ticket, classify and **draft**:

- **Obsolete** — verify against the current code *and* the comments before believing it. If
  confirmed, propose closing it with a note naming what superseded it, in **keyword-safe**
  phrasing: never an auto-closing keyword before an issue reference. If the call is at all
  uncertain, list it and ask.
- **Valid but unclear** — propose a neutral clarifying comment. **Never silently rewrite somebody
  else's description.**

## 8 · Apply, only after the go-ahead

Per committed ticket: set the weight, set the membership, set the state per the rule above, assign
— and only ever to the person planning. Then re-fetch and **report what actually changed**, not
what was intended.

## The sprint is estimated against its definition of done

Not against its tickets. A definition-of-done item no ticket covers is an incomplete plan, and it
will be found at the end — one sprint's DoD required two binaries nobody had ticketed.

**Write the definition of done when the sprint opens**, not when it closes. A sprint with only a
point total and a list has no way to notice that two of the three things it delivered were never
in it, which is exactly what happened to a sprint that had no DoD written down.

## Guardrails

- Nothing mutates before the go-ahead.
- Never assign somebody else's ticket, and never auto-assign to make one eligible.
- Never close anything but a verified-obsolete ticket, with its note posted first.
- Never use an auto-closing keyword before an issue reference.
- **Ticket count is not capacity.** SP is the unit, and one ticket can be five.
- **Never move a paused ticket without asking.** It is paused for a reason, and the reason is
  rarely in the ticket.
- **Never edit the state of a carryover ticket.** Where it got to is information; resetting it
  loses the only record that the QA already happened.
- **Never skip the proposal.** Whatever the tracker, nothing changes before a person has seen the
  whole plan.
- **Never guess an ambiguous target.** Two sprints with the same dates are two cadences, not a
  duplicate — ask which one.
- **Never rank a ticket on its description alone** when it has an unread thread.
- A finding made during planning is filed, not absorbed. The sprint shrinks; it does not swell to
  accommodate what planning discovered.
