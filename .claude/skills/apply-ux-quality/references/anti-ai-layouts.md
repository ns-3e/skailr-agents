# Anti-AI layout patterns

Layout analogue of content's AI-tell sweep. Flag each hit with location and a concrete fix.

## Banned clusters (default looks)

Do not ship these unless the **existing** design system already requires them:

1. **Purple-on-white / purple-to-indigo gradient** themes as the whole visual identity.
2. **Warm cream background** (~`#F4F1EA`) + high-contrast serif display + terracotta accent.
3. **Broadsheet chrome** — hairline rules, zero radius, dense newspaper columns as a faux-editorial product UI.

## Hero and first viewport (landing / promotional)

- First viewport is **one composition**, not a mini-dashboard.
- Brand / product name is a **hero-level** signal, not only nav text.
- Hero budget: brand, one headline, one short supporting sentence, one CTA group, one dominant image/plane — usually nothing else.
- Full-bleed hero plane by default; avoid inset hero cards, side-panel heroes, tiled collages, floating media blocks unless the house system requires them.
- **No hero overlays:** detached labels, floating badges, promo stickers, info chips, or callout boxes on top of hero media.
- No stats, schedules, address blocks, “this week” callouts, or secondary marketing in the first viewport.

## Cards and chrome

- Default: **no cards**. Cards allowed when they are the container for a user interaction. If removing border/shadow/radius/background does not hurt interaction or understanding, it should not be a card.
- Never use cards in the hero.
- Avoid pill clusters, icon rows, boxed promos, schedule snippets, and multiple competing text blocks in one section.
- One job per section: one purpose, one headline, usually one short supporting sentence.

## Typography and atmosphere

- Avoid default stacks (Inter, Roboto, Arial, system) for **branded / marketing / greenfield display** when no house font is documented — pick expressive, purposeful fonts that fit the product.
- Do not rely on flat single-color backgrounds alone for branded surfaces; use gradients, imagery, or subtle patterns for atmosphere when appropriate.
- Imagery should show product, place, atmosphere, or context. Decorative gradients alone are not the main visual idea.

## Product app chrome (settings, tables, workflows)

- Prefer clarity and density appropriate to the domain over marketing flourish.
- Still apply job clarity, hierarchy, designed empty/error states, and system tokens.
- Do not paste landing-page hero patterns into dense app tools.

## Copy-adjacent UI tells

- No emoji decoration as a substitute for hierarchy.
- No dash punctuation asides in UI strings (prefer period, comma, colon, parentheses) when writing product copy — see project copy rules if present.

## Form controls (WebKit)

- Styled `input` / `select` / `textarea`: reset appearance (`appearance-none`), explicit background and border, explicit font.
- `<select>`: restore a custom chevron after reset; extra right padding.

## Scroll

- Root scrolling element: `overscroll-behavior: none` on `html`/`body` when setting global site styles (prevent rubber-band overscroll).
