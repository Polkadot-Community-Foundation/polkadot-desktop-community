---
name: document-review
description: Use to refine a brainstorm/design or plan document in `docs/_plans/` before proceeding to the next workflow step. Applies when the document exists and needs improving — vague language, dead weight, unstated assumptions, scope creep.
---

# Document Review

Improve brainstorm/design or plan documents through structured review.

## Step 1: Get the Document

**If a document path is provided:** Read it, then proceed to Step 2.

**If no document is specified:** Ask which document to review, or look for the most recent one in `docs/_plans/` — `<topic>-design.md` for designs, `<topic>-plan.md` for plans.

## Step 2: Assess

Read through the document and ask:

- What is unclear?
- What is unnecessary?
- What decision is being avoided?
- What assumptions are unstated?
- Where could scope accidentally expand?

These questions surface issues. Don't fix yet—just note what you find.

## Step 3: Evaluate

Score the document against these criteria:

| Criterion        | What to Check                                                                    |
|------------------|----------------------------------------------------------------------------------|
| **Clarity**      | Problem statement is clear, no vague language ("probably," "consider," "try to") |
| **Completeness** | Required sections present, constraints stated, open questions flagged            |
| **Specificity**  | Concrete enough for next step (design → can plan, plan → can implement)          |
| **YAGNI**        | No hypothetical features, simplest approach chosen                               |

If invoked within a workflow (after `superpowers:brainstorming` or `superpowers:writing-plans`, via the `architecture` skill), also check:

- **User intent fidelity** — Document reflects what was discussed, assumptions validated

## Step 4: Identify the Critical Improvement

Among everything found in Steps 2-3, does one issue stand out? If something would significantly improve the document's quality, this is the "must address" item. Highlight it prominently.

## Step 5: Make Changes

Present your findings, then:

1. **Auto-fix** minor issues (vague language, formatting) without asking
2. **Ask approval** before substantive changes (restructuring, removing sections, changing meaning)
3. **Update** the document inline—no separate files, no metadata sections

### Simplification Guidance

Simplification is purposeful removal of unnecessary complexity, not shortening for its own sake.

**Simplify when:**

- Content serves hypothetical future needs, not current ones
- Sections repeat information already covered elsewhere
- Detail exceeds what's needed to take the next step
- Abstractions or structure add overhead without clarity

**Don't simplify:**

- Constraints or edge cases that affect implementation
- Rationale that explains why alternatives were rejected
- Open questions that need resolution

## Step 6: Offer Next Action

After changes are complete, ask:

1. **Refine again** - Another review pass
2. **Review complete** - Document is ready

### Iteration Guidance

After 2 refinement passes, recommend completion—diminishing returns are likely. But if the user wants to continue, allow it.

Return control to the caller (the `architecture` skill, or the user) after selection.

## What NOT to Do

- Do not rewrite the entire document
- Do not add new sections or requirements the user didn't discuss
- Do not over-engineer or add complexity
- Do not create separate review files or add metadata sections

## Relationship to the `architecture` plan-review gate

This skill is **not** a replacement for the fresh-context plan review in `architecture` (§ "Reviewing the plan — from an empty session"). The two run in sequence and answer different questions:

| | `document-review` | `architecture` step 5 |
|---|---|---|
| Runs | in the authoring context, right after the document is written | in a **fresh** subagent, once the document is settled |
| Asks | is this document clear, honest, and free of dead weight? | would a session with zero history execute this against the real repo? |
| Verifies against the repo | no | yes — paths, symbols, seams must exist |
| Output | edits the document inline | findings, fixed via `superpowers:writing-plans` |
| Loop | max 2 passes, user-gated | until one clean pass, hard cap 4 |

Do not re-run this skill as a substitute for a step-5 pass, and do not treat a clean pass here as clearing that gate.
