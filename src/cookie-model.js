// ============================================================================
// cookie-model.js — the multivariate cookie model
//
// This is the inversion the dashboard is built on: you drive the *qualities*
// (spread, chew↔crisp, cakey, browning, sweetness, richness) and the model
// tells you the *formula and method* to use. It is a small system of coupled
// algebraic equations in two layers:
//
//   recipe ──(constitutive eqs)──▶ latent physical state ──(observation eqs)──▶ qualities
//
// and an inverse `solve(targets)` that searches recipe space for the formula
// whose predicted qualities best match the sliders.
//
// Coefficients are HAND-SET and CITED to the reference corpus (option a): every
// relation carries the chunks.jsonl id(s) it is grounded in — see CITES. The
// numbers are deliberately interpretable, not fitted; the structure (which
// variable depends on which, and the sign of each cross-term) is the part that
// comes from the books.
//
// Units: everything is a fraction of flour mass (baker's % / 100), so flour = 1.
// ============================================================================

export const CITES = {
  sugar_sweetness_hygroscopic: ["bressanini-scienza-della-pasticceria:0004:00:bc4560f8"],
  invert_humectancy:           ["bressanini-scienza-della-pasticceria:0015:00:acb7b1a5"],
  caramelization:              ["mcgee-on-food-and-cooking:0515:00:beb5a68c"],
  maillard_browning:           ["mcgee-on-food-and-cooking:0578:00:f27894b5",
                                "mcgee-on-food-and-cooking:0580:00:74717fa5"],
  gluten:                      ["bressanini-scienza-della-pasticceria:0075:00:7d1dcdb1"],
  mixing_develops_gluten:      ["cauvain-technology-of-breadmaking:0004:00:a821d86e"],
  fat_shortens_gluten:         ["bressanini-scienza-della-pasticceria:0067:00:36da9e91"],
  chemical_leavening_pH:       ["bressanini-scienza-della-pasticceria:0088:00:a630897c"],
  egg_protein_set:             ["bressanini-scienza-della-pasticceria:0030:00:f9449048"],
  creaming_aeration:           ["bressanini-scienza-della-pasticceria:0092:00:08b423cc"],
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const sat = (x) => clamp(x, 0, 1);
// linear map x∈[lo,hi] → [0,100], clamped
const lin = (x, lo, hi) => clamp(((x - lo) / (hi - lo)) * 100, 0, 100);

// ---- Discrete-choice physical modifiers ------------------------------------
// How the *method* changes what the fat does. Creaming whips air into plastic
// fat and locks it around bubbles (less free to flow, more lift); melting frees
// the fat and its water; browning cooks the water off; sablage coats the flour.
const METHOD = {
  creamed: { fatFree: 0.60, air: 0.70, fatCoat: 0.25, waterFree: 0.50 },
  melted:  { fatFree: 1.00, air: 0.00, fatCoat: 0.15, waterFree: 1.00 },
  browned: { fatFree: 0.90, air: 0.00, fatCoat: 0.20, waterFree: 0.05 }, // water cooked off
  sable:   { fatFree: 0.50, air: 0.00, fatCoat: 0.60, waterFree: 0.40 }, // fat waterproofs flour → short
};
// Flour protein as a mass fraction — the gluten ceiling (Bressanini, Il glutine).
const PROTEIN = [0.08, 0.09, 0.11, 0.13]; // cake, pastry, all-purpose, bread
// Egg form shifts water & fat: whites add water/protein (crisper, drier set),
// yolks add fat & lecithin (tender, moist) — McGee/Bressanini on egg proteins.
const EGGFORM = {
  whole: { water: 1.00, yolkFat: 0.0 },
  yolk:  { water: 0.55, yolkFat: 1.0 },
  white: { water: 1.25, yolkFat: -0.5 },
};

// ============================================================================
// LAYER 1 — recipe → latent physical state (constitutive equations)
// ============================================================================
export function state(r) {
  const m = METHOD[r.method];
  const prot = PROTEIN[r.flourIdx];
  const ef = EGGFORM[r.eggForm];

  const S  = r.sugarPct / 100;                 // total sugar (frac of flour)
  const Sb = S * (r.brownPct / 100);           // brown sugar
  const Sw = S - Sb;                           // white sugar
  const B  = r.butterPct / 100;                // fat
  const E  = r.eggPct / 100;                   // egg

  const soda  = r.leaven ? r.sodaShare / 100 : 0;        // alkaline strength
  const acid  = (r.brownPct / 100) * 0.5                  // brown sugar is mildly acidic
              + (r.leaven ? (1 - r.sodaShare / 100) * 0.5 : 0); // powder carries its own acid

  // --- water budget: who brings water, who binds it -------------------------
  const waterEgg    = E * 0.75 * ef.water;
  const waterButter = B * 0.16 * m.waterFree;
  const brownMoist  = Sb * 0.12;                          // brown holds moisture/invert  [invert_humectancy]
  const sugarBind   = 0.18 * Sw + 0.35 * Sb;              // sugar is hygroscopic, ties up water [sugar_sweetness_hygroscopic]
  const flourAbsorb = 0.9 * prot + 0.04;                  // protein/starch soak
  const freeWater   = waterEgg + waterButter + brownMoist - sugarBind - flourAbsorb;

  // --- fat available to lubricate & flow, and air whipped in ----------------
  const fatFree = B * m.fatFree;
  const air     = B * m.air;                              // creaming aeration [creaming_aeration]

  // --- gluten: protein × water-availability × mixing, cut by fat & sugar ----
  // [gluten] ceiling, [mixing_develops_gluten] builds it, [fat_shortens_gluten]
  const gluten = Math.max(0,
    prot * (0.45 + 0.55 * sat(freeWater + 0.5)) * (1 - m.fatCoat) * (1 - 0.45 * S));

  // --- pH: soda raises it, acids lower it → drives browning & spread --------
  const pH = 7 + 1.3 * soda - 0.7 * acid;                 // [chemical_leavening_pH]

  // --- leavening gas: chemical + creamed air --------------------------------
  const gas = (r.leaven ? 0.35 * soda + 0.30 * (1 - r.sodaShare / 100) : 0) + 0.40 * air;

  // --- sugar that liquefies & flows when hot (spread now, crisp on cooling) --
  const dissolved = sat(freeWater / (0.25 + S));
  const sugarMelt = S * (0.55 + 0.45 * dissolved);        // [caramelization]

  // --- how fast the cookie sets vs. spreads (a race, not an ODE) ------------
  const setRate = 0.5 * ((r.ovenF - 300) / 100) + 0.8 * E * (1 + 0.4 * ef.yolkFat * -1) + 0.6 * gluten;
  //                                              ^ whites set faster/firmer [egg_protein_set]

  return { S, Sb, Sw, B, E, freeWater, fatFree, air, gluten, pH, gas, sugarMelt,
    setRate, dissolved, soda, acid, yolkFat: ef.yolkFat };
}

// ============================================================================
// LAYER 2 — latent state → sensory qualities (observation equations), 0..100
// ============================================================================
export function qualities(r) {
  const s = state(r);
  const chillIdx = r.chillIdx;
  const dry = 1 - sat(s.freeWater + 0.4); // a dryness proxy: low free water → dry crumb

  // SPREAD: free fat + melting sugar + free water push it out; gluten, a fast
  // set, and a cold rest hold it in.
  const spread = lin(
    0.95 * s.fatFree + 0.80 * s.sugarMelt + 0.55 * s.freeWater
      - 1.30 * s.gluten - 0.45 * s.setRate - 0.10 * chillIdx,
    -0.15, 1.0);

  // CRISPNESS (chew↔crisp axis): white sugar drying to a glassy snap & low
  // residual water = crisp; gluten + retained water + brown humectancy = chew.
  const crispScore =
      (0.85 * s.Sw + 0.75 * dry + 0.35 * ((r.ovenF - 350) / 50))
    - (1.00 * s.gluten + 0.85 * (1 - dry) + 0.65 * s.Sb + 0.30 * Math.max(0, s.yolkFat));
  const crispness = lin(crispScore, -0.85, 0.85);

  // CAKEY: pale, tall puff. Baking POWDER lifts and holds (double-acting, sets
  // before it vents); soda instead vents and spreads, so it counts against a
  // cakey crumb. Creamed air and a hot set help; free fat and melting sugar
  // flatten it. [chemical_leavening_pH], [creaming_aeration]
  const powderLift = r.leaven ? (0.30 + 0.70 * (1 - r.sodaShare / 100)) : 0;
  const cakey = lin(
    0.95 * powderLift + 0.55 * s.air + 0.15 * s.gluten + 0.40 * ((r.ovenF - 300) / 100)
      - 0.90 * s.fatFree - 0.70 * s.sugarMelt - 0.30 * s.freeWater,
    -0.30, 1.05);

  // BROWNING: alkaline pH + reducing sugars (brown/invert) + melt + heat + the
  // long cure (enzymes free reducing sugars & amino acids). [maillard_browning]
  const browning = lin(
    0.28 * (s.pH - 7) + 0.85 * s.Sb + 0.45 * s.sugarMelt
      + 0.20 * ((r.ovenF - 350) / 25) + 0.06 * chillIdx,
    0.05, 1.40);

  // SWEETNESS: total sugar load. [sugar_sweetness_hygroscopic]
  const sweetness = lin(s.S, 0.40, 1.25);

  // RICHNESS: fat load, plus yolk.
  const richness = lin(s.B + 0.18 * Math.max(0, s.yolkFat), 0.42, 0.92);

  return { spread, crispness, cakey, browning, sweetness, richness };
}

// ---- Quality axes the UI exposes as sliders --------------------------------
export const QUALITY_AXES = [
  { key: "spread",    label: "Spread",    lo: "thick & domed", hi: "thin & lacy",  def: 45 },
  { key: "crispness", label: "Texture",   lo: "chewy",         hi: "crisp",        def: 40 },
  { key: "cakey",     label: "Cakeyness", lo: "dense",         hi: "cakey & airy", def: 30 },
  { key: "browning",  label: "Browning",  lo: "pale",          hi: "deep",         def: 50 },
  { key: "sweetness", label: "Sweetness", lo: "restrained",    hi: "candy-sweet",  def: 50 },
  { key: "richness",  label: "Richness",  lo: "lean",          hi: "very rich",    def: 55 },
];

// ============================================================================
// INVERSE — target qualities → recipe (coordinate descent + discrete search)
// ============================================================================

// The continuous dials the solver is free to move, with bounds and a prior
// (a sane all-purpose default the regulariser pulls toward when the targets
// don't pin a dial down).
const CONT = [
  { key: "sugarPct",  lo: 55,  hi: 125, prior: 85, step: 5 },
  { key: "brownPct",  lo: 0,   hi: 100, prior: 50, step: 5 },
  { key: "butterPct", lo: 40,  hi: 85,  prior: 62, step: 3 },
  { key: "eggPct",    lo: 12,  hi: 32,  prior: 25, step: 2 },
  { key: "saltPct",   lo: 0.8, hi: 1.8, prior: 1.2, step: 0.1 },
  { key: "sodaShare", lo: 0,   hi: 100, prior: 70, step: 10 },
  { key: "chillIdx",  lo: 0,   hi: 3,   prior: 1,  step: 1 },
  { key: "ovenF",     lo: 325, hi: 400, prior: 360, step: 5 },
];
const PRIOR = Object.fromEntries(CONT.map((c) => [c.key, c.prior]));

// A recipe splits into two kinds of variable:
//   IDENTITY  — the categorical commitments that make a recipe *what it is*
//               (a shortbread IS low-protein flour, sablage, no leavening). They
//               are GIVEN by the recipe; the inverse never reassigns them to
//               chase a quality number.
//   LEVERS    — the continuous formulation/process dials that tune qualities
//               *within* an identity. These are what the inverse is free to move.
// Changing an identity value is allowed, but it is a *deviation* from the recipe
// (see deviations()), not something the optimiser does silently.
export const IDENTITY_KEYS = ["flourIdx", "method", "eggForm", "leaven"];
export const LEVER_KEYS = CONT.map((c) => c.key);

const DISCRETE = {
  method:   ["creamed", "melted", "browned", "sable"],
  flourIdx: [0, 1, 2, 3],
  eggForm:  ["whole", "yolk", "white"],
};

function loss(recipe, targets, weights) {
  const q = qualities(recipe);
  let e = 0;
  for (const k of Object.keys(targets)) {
    const w = (weights && weights[k] != null) ? weights[k] : 1;
    e += w * (q[k] - targets[k]) ** 2;
  }
  // gentle pull toward the prior so under-determined dials stay sensible
  for (const c of CONT) e += 5 * ((recipe[c.key] - c.prior) / (c.hi - c.lo)) ** 2;
  return e;
}

function descend(start, targets, weights) {
  const r = { ...start };
  for (let pass = 0; pass < 8; pass++) {
    for (const c of CONT) {
      let best = r[c.key], bestL = loss(r, targets, weights);
      for (const dir of [-1, 1]) {
        for (let k = 1; k <= 8; k++) {
          const cand = clamp(r[c.key] + dir * c.step * k, c.lo, c.hi);
          const L = loss({ ...r, [c.key]: cand }, targets, weights);
          if (L < bestL - 1e-9) { bestL = L; best = cand; }
        }
      }
      r[c.key] = best;
    }
  }
  return r;
}

function roundRecipe(r) {
  const o = { ...r };
  o.sugarPct = Math.round(o.sugarPct);
  o.brownPct = Math.round(o.brownPct / 5) * 5;
  o.butterPct = Math.round(o.butterPct);
  o.eggPct = Math.round(o.eggPct);
  o.saltPct = Math.round(o.saltPct * 10) / 10;
  o.sodaShare = Math.round(o.sodaShare / 10) * 10;
  o.chillIdx = Math.round(o.chillIdx);
  o.ovenF = Math.round(o.ovenF / 5) * 5;
  return o;
}

// ---- The identity-fixed inverse (the right one) ----------------------------
// Solve only the LEVERS to hit the target qualities, holding the recipe's
// IDENTITY fixed. You bring the identity (the recipe you're making); the model
// tells you the amounts and process that best realise your target qualities
// *within* it, and reports how close it can get. It will never swap the flour
// or method to fake a better fit.
export function solveWithin(target, identity, opts = {}) {
  const scoop = opts.scoop || "standard";
  const start = { ...PRIOR, ...identity, scoop };
  const r = roundRecipe(descend(start, target, opts.weights));
  return { recipe: r, qualities: qualities(r), residual: loss(r, target, opts.weights) };
}

// Which named recipe do these target qualities most resemble? Ranks a supplied
// list of real recipes by forward-quality distance, so "qualities → recipe"
// recommends an actual archetype (whose identity you then adopt) instead of
// inventing an arbitrary point. Items expose their dials directly or under `.set`.
export function classify(target, recipes) {
  let best = null, bestD = Infinity;
  for (const rec of recipes) {
    const q = qualities(rec.set || rec);
    let e = 0;
    for (const k of Object.keys(target)) e += (q[k] - target[k]) ** 2;
    if (e < bestD) { bestD = e; best = rec; }
  }
  return { recipe: best, distance: Math.sqrt(bestD) };
}

// How `recipe` differs from a `base` recipe — flagging which differences are
// IDENTITY deviations (changed what the recipe fundamentally is) vs. lever
// tweaks (tuned it within bounds). This is how a deviation stays a deviation.
export function deviations(recipe, base) {
  const out = [];
  for (const key of [...IDENTITY_KEYS, ...LEVER_KEYS]) {
    if (recipe[key] !== base[key]) {
      out.push({ key, base: base[key], now: recipe[key], identity: IDENTITY_KEYS.includes(key) });
    }
  }
  return out;
}

// Freestyle WITH style conformity: adopt the nearest real archetype's identity,
// then tune the levers within it. Keeps freestyle recognisable — it always
// conforms to a real style — instead of drifting to implausible flour/method
// combos. Returns the adopted `style` alongside the solved recipe.
export function solveConforming(target, recipes, opts = {}) {
  const near = classify(target, recipes).recipe;
  const identity = Object.fromEntries(IDENTITY_KEYS.map((k) => [k, (near.set || near)[k]]));
  return { ...solveWithin(target, identity, opts), style: near };
}

// ---- LEGACY free search ----------------------------------------------------
// Lets the optimiser pick the IDENTITY too (flour, method, egg, leavening)
// purely to minimise quality error. Kept only so the current tool keeps running;
// it violates the identity rule (it will, e.g., put a shortbread on bread flour).
// Prefer classify() → solveWithin().
export function solve(targets, opts = {}) {
  const scoop = opts.scoop || "standard";
  const weights = opts.weights;
  let bestL = Infinity, bestRecipe = null;

  for (const method of DISCRETE.method) {
    for (const flourIdx of DISCRETE.flourIdx) {
      for (const eggForm of DISCRETE.eggForm) {
        const start = { ...PRIOR, method, flourIdx, eggForm, leaven: true, scoop };
        const r = descend(start, targets, weights);
        const L = loss(r, targets, weights);
        if (L < bestL) { bestL = L; bestRecipe = r; }
      }
    }
  }
  // also try leaven OFF for very short/dense, low-cakey targets
  if ((targets.cakey ?? 30) < 18) {
    for (const method of ["sable", "creamed"]) {
      const start = { ...PRIOR, method, flourIdx: bestRecipe.flourIdx, eggForm: bestRecipe.eggForm, leaven: false, scoop };
      const r = descend(start, targets, weights);
      const L = loss(r, targets, weights);
      if (L < bestL) { bestL = L; bestRecipe = r; }
    }
  }

  const r = roundRecipe(bestRecipe);
  return { recipe: r, qualities: qualities(r), residual: loss(r, targets, weights) };
}
