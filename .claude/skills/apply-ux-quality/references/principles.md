# UX principles (Skailr craft kernel)

Operational pass criteria for top-tier product UI. Every user-visible surface should satisfy these.

## 1. Job clarity

**Pass:** The surface has one primary job stated in the ui-spec / brief. Primary CTA or path is obvious within a few seconds. Secondary actions are visually quieter.

**Fail:** Multiple competing primaries; user must hunt for the happy path.

## 2. Hierarchy matches importance

**Pass:** Visual weight (size, contrast, position, whitespace) tracks user goals. Brand and primary action outrank chrome and metadata.

**Fail:** Equal-weight blocks; nav or side content louder than the job; first viewport reads as a dashboard of unrelated widgets (unless the product *is* a dashboard).

## 3. Affordance honesty

**Pass:** Interactive controls look interactive; static content does not mimic buttons/links. Focus and hover states are visible.

**Fail:** Decorative chips/badges that look clickable; clickable text that looks like body copy; invisible focus.

## 4. Designed states

**Pass:** Loading, empty, populated, error, and unauthorized are intentional designs (copy, layout, recovery). Empty / first-run is useful, not a blank void.

**Fail:** Spinner-only loading with layout jump; empty = white page; raw exception strings; silent unauthorized.

## 5. System over novelty

**Pass:** Spacing, type, color, and components come from the house design system or documented tokens. New primitives are named exceptions.

**Fail:** One-off radii/colors/shadows; new UI library introduced without brief/spec approval; silent off-system components.

## 6. Accessibility as correctness

**Pass:** Semantic structure; labelled inputs; keyboard-operable controls; visible focus; contrast that meets the project bar (default WCAG 2.2 AA unless brief says otherwise); alt/purpose for meaningful imagery; `prefers-reduced-motion` respected.

**Fail:** Div-only controls; missing labels; keyboard traps; contrast theater; motion that cannot be reduced.

## 7. Restraint

**Pass:** Composition is calm; remove until it hurts. One job per section. Cards only when they contain a real interaction (or the system requires them).

**Fail:** Pill/chip clutter; stat strips and promo stickers in the hero; card-everything; decorative borders that add no structure. See `anti-ai-layouts.md`.

## 8. Motion as meaning

**Pass:** A small budget of intentional motions (typically 2–3 on visually led surfaces) that clarify hierarchy or state change. Reduced-motion path exists.

**Fail:** Motion as noise; endless shimmer; staggered entrances on every tile; no reduced-motion alternative.

## 9. Brand presence

**Pass:** On branded / marketing / greenfield product chrome, identity is readable without the nav. Typography is purposeful; when no house stack exists, do not default to Inter / Roboto / Arial / system UI for display.

**Fail:** First viewport could belong to any SaaS after removing the logo; generic template look; brand only in the nav eyebrow.

## 10. Recoverable feedback

**Pass:** Errors appear at the point of failure with an actionable next step; destructive actions are reversible or confirmed; success is acknowledged without modal spam.

**Fail:** Toast-only errors for form fields; dead-end failures; silent no-ops.
