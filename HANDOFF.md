# HANDOFF — cookiebot

State: **working, mid-feature.** The dashboard was inverted from "set ingredient
amounts" to "drive qualities → get told the formula."

## What changed
- **New `src/cookie-model.js`** — a two-layer multivariate model:
  `recipe → latent physical state → qualities` (forward) plus a numerical
  `solve(targetQualities)` (inverse: coordinate descent over continuous dials +
  enumeration of method/flour/egg, regularised toward a prior). Coefficients are
  **hand-set and cited** (option a) to `data/chunks.jsonl` ids — see `CITES`.
- **`cookie-build-sheet.jsx` rewired:**
  - Sliders are now the six **qualities** (`QUALITY_AXES`: spread, crispness
    chew↔crisp, cakey, browning, sweetness, richness). The recipe is *derived*:
    `const solved = useMemo(() => solve(q, {scoop}))`. The old ingredient-% dials
    and the method/egg/leaven controls are gone.
  - A **"Use this — solved from your qualities"** panel surfaces the chosen
    method / flour / egg / leavening / chill / oven + a % match.
  - **Ingredients are listed by physical step** (not the old Dough/Add-ins
    component table). `buildSteps` attaches an `ing[]` array to each step; the
    component-grouped table now renders **only for the fixed SPECIAL recipes**.
  - Presets (`STYLES`) are now **quality targets**: `s.q = qualities(s.set)`,
    precomputed at module load. `matchStyleQ(q)` replaces `matchStyle`.

## Verified
Vite "cookie" server (port 5174), no console errors. Hot-rod default → browned
butter/bread/yolk (99%); thin&crispy sliders → melted/white sugar (97%);
Shortbread preset → sablé/no-leaven (86%). Sliders re-solve live.

## Core logic correction (latest) — identity vs. deviation
The inverse must NOT treat flour/method/leavening as free variables. Those are a
recipe's **identity** (a shortbread IS low-protein, sablage, no leavening). The
model now splits `IDENTITY_KEYS` vs `LEVER_KEYS` and exposes:
- `solveWithin(target, identity)` — tunes LEVERS only, identity held; reports
  residual (high residual = "this identity can't reach that target").
- `classify(target, recipes)` — recommends a real archetype for a target.
- `deviations(recipe, base)` — flags identity changes as deviations vs lever tweaks.
`solve()` (free search over identity) is kept but marked **LEGACY** — it breaks the
identity rule. Validated via node (shortbread keeps its flour; chewy-shortbread
returns resid ~1011 instead of cheating to bread flour).

## Binary mode (integrated)
`cookie-build-sheet.jsx` now runs a binary: `boundStyle` state.
- **Bound** (a style selected): identity is LOCKED to the style; sliders tune
  levers only via `solveWithin`. Unreachable targets show a low % match and the
  identity never changes (verified: shortbread pushed toward chewy → 4% match,
  stays sablé/pastry/no-leaven — does NOT cheat to bread flour).
- **Freestyle** (`boundStyle === null`, the Freestyle button): free `solve()`
  picks the identity too; shows the `classify()` "closest style" hint (verified:
  same chewy target → 94% match, closest = Chewy chocolate chip).

## Known warts / next steps
- **Freestyle plausibility** is loose (free `solve` may pick e.g. cake flour for
  a chewy target) — fine for exploration; bound mode is where identity integrity
  matters and it holds.
- **cakey tops out ~85**; very-cakey targets slightly under-shoot. Coefficients
  are interpretable, not fitted — tune in `cookie-model.js` `qualities()`.
- **`dialGroups`** (old component table) is still computed but only used by the
  SPECIAL branch; it's dead for the dial path and can be trimmed.
- **focacciabot is NOT done** — same architecture should be lifted. The latent
  core (water / gluten / leavening / set) is shared; focaccia adds fermentation
  schedule + dough strength and drops the sugar-melt/spread axis.

## Don't touch
`data/chunks.jsonl` chunk ids referenced by `CITES` — re-running the corpus
pipeline can renumber them; re-point `CITES` if you do.
