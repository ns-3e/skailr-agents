# UI Spec: <feature>

Traces to: story.md, spec.md
Skill: apply-ux-quality

## Scope
User-visible surfaces in this feature. If none: `N/A: no user-visible UI` and stop.

## Consumed design contracts
List `kind: design` contract ids / paths, or `none`.

## Surfaces
### <Surface / view name>
- **Primary job:** …
- **Actor:** …
- **Hierarchy:** primary / secondary / tertiary
- **Layout zones:** …
- **Breakpoints:** …
- **Tokens / primitives:** …
- **States:** loading / empty / populated / error / unauthorized — treatment each
- **Motion budget:** none | list 1–3 intentional motions + reduced-motion note
- **A11y:** contrast bar, focus order, keyboard, labels, alt
- **Anti-AI constraints:** patterns explicitly avoided
- **AC IDs:** …

## Interaction flows
Happy path and key branches (one short bullet list). Happy path must be discoverable without hunting.

## Exceptions
Off-system or craft exceptions with owner approval reference. Omit if none.

## Engineering notes
Anything FE must not invent (shared chrome owner, forbidden libraries, brand fonts).
