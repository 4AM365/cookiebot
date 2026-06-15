// ============================================================================
// nutrition.js — per-100g macros for the cookie formula
//
// This is a straight mass-balance, not a model: every ingredient carries a
// fixed macro density (kcal / carb / fat / protein / sugar per 100 g), so the
// finished dough's macros are just the gram-weighted sum of its parts, then
// normalised to a 100 g serving:
//
//   macro_per_100g = ( Σ_i  grams_i · density_i / 100 )  ·  100 / Σ_i grams_i
//
// Densities are reference values from USDA FoodData Central (FDC) — each entry
// cites its FDC food id in FDC_IDS. Per-100g, so the table is unit-consistent
// with the recipe (which is in grams).
//
// Note: figures are for the dough *as mixed*. Baking drives off some water, so
// a baked cookie runs a little more energy-dense per 100 g than shown.
// ============================================================================

// kcal, carbohydrate (g), fat (g), protein (g), sugars (g) — all per 100 g.
export const MACROS = {
  flour:         { kcal: 364, carb: 76.3, fat: 1.0,  protein: 10.3, sugar: 0.3 },
  cocoa:         { kcal: 228, carb: 57.9, fat: 13.7, protein: 19.6, sugar: 1.8 },
  whiteSugar:    { kcal: 387, carb: 100,  fat: 0,    protein: 0,    sugar: 99.8 },
  brownSugar:    { kcal: 380, carb: 98.1, fat: 0,    protein: 0.1,  sugar: 97.0 },
  butter:        { kcal: 717, carb: 0.1,  fat: 81.1, protein: 0.9,  sugar: 0.1 },
  eggWhole:      { kcal: 143, carb: 0.7,  fat: 9.5,  protein: 12.6, sugar: 0.4 },
  eggYolk:       { kcal: 322, carb: 3.6,  fat: 26.5, protein: 15.9, sugar: 0.6 },
  eggWhite:      { kcal: 52,  carb: 0.7,  fat: 0.2,  protein: 10.9, sugar: 0.7 },
  bakingSoda:    { kcal: 0,   carb: 0,    fat: 0,    protein: 0,    sugar: 0 },
  bakingPowder:  { kcal: 53,  carb: 27.7, fat: 0,    protein: 0,    sugar: 0 },
  salt:          { kcal: 0,   carb: 0,    fat: 0,    protein: 0,    sugar: 0 },
  chocolateChips:{ kcal: 480, carb: 63.9, fat: 28.0, protein: 4.2,  sugar: 53.9 },
  almond:        { kcal: 579, carb: 21.6, fat: 49.9, protein: 21.2, sugar: 4.4 },
};

// USDA FoodData Central ids backing each density.
export const FDC_IDS = {
  flour: "169761",          // Wheat flour, white, all-purpose, enriched
  cocoa: "169593",          // Cocoa, dry powder, unsweetened
  whiteSugar: "169655",     // Sugars, granulated
  brownSugar: "168833",     // Sugars, brown
  butter: "173410",         // Butter, salted
  eggWhole: "748967",       // Egg, whole, raw, fresh
  eggYolk: "172183",        // Egg, yolk, raw, fresh
  eggWhite: "172182",       // Egg, white, raw, fresh
  bakingPowder: "172805",   // Leavening agents, baking powder, double-acting
  chocolateChips: "174836", // Chocolate, semisweet, made with cocoa butter (chips)
  almond: "170567",         // Nuts, almonds, raw
};

// Map a free-text ingredient name (the `k` field used across the build sheet)
// to a macro key. Ordered: more specific names must win over generic ones
// (e.g. "almond flour" → almond before the generic "flour" rule).
const RULES = [
  [/\balmond/i,                 "almond"],
  [/baking soda/i,              "bakingSoda"],
  [/baking powder/i,            "bakingPowder"],
  [/yolk/i,                     "eggYolk"],
  [/egg\s*white|whites? added|whites?\b/i, "eggWhite"],
  [/\begg/i,                    "eggWhole"],
  [/brown sugar/i,              "brownSugar"],
  [/cocoa/i,                    "cocoa"],
  [/chocolate|chips|chunk/i,    "chocolateChips"],
  [/butter/i,                   "butter"],
  [/sugar/i,                    "whiteSugar"],   // white / caster / icing / generic
  [/salt/i,                     "salt"],
  [/flour|oat|almond meal/i,    "flour"],
];

export function resolveMacroKey(name) {
  if (!name) return null;
  for (const [re, key] of RULES) if (re.test(name)) return key;
  return null;
}

// items: [{ key?, k?, g }]. `key` (a macro key) wins; otherwise `k` (free text)
// is resolved. Items without a numeric, positive weight are ignored. Returns
// macros for the whole batch, plus the total weighed mass, or null if nothing
// weighable was supplied.
function totals(items) {
  const tot = { kcal: 0, carb: 0, fat: 0, protein: 0, sugar: 0 };
  let mass = 0;
  for (const it of items || []) {
    const g = Number(it.g);
    if (!Number.isFinite(g) || g <= 0) continue;
    const key = it.key || resolveMacroKey(it.k);
    const m = MACROS[key];
    if (!m) continue;
    const f = g / 100;
    tot.kcal += m.kcal * f; tot.carb += m.carb * f; tot.fat += m.fat * f;
    tot.protein += m.protein * f; tot.sugar += m.sugar * f;
    mass += g;
  }
  return mass > 0 ? { tot, mass } : null;
}

// Macros for one `servingGrams` portion of the batch (e.g. a scooped cookie),
// plus the batch's total weighed mass. Null if nothing weighable was supplied.
export function macrosForServing(items, servingGrams) {
  const t = totals(items);
  if (!t || !(servingGrams > 0)) return null;
  const k = servingGrams / t.mass;
  const r1 = (x) => Math.round(x * k * 10) / 10;
  return {
    kcal: Math.round(t.tot.kcal * k),
    carb: r1(t.tot.carb), fat: r1(t.tot.fat), protein: r1(t.tot.protein), sugar: r1(t.tot.sugar),
    mass: Math.round(t.mass), serving: Math.round(servingGrams),
  };
}

// Macros normalised to a 100 g serving, plus the total weighed mass.
export function macrosPer100g(items) {
  const t = totals(items);
  return t ? macrosForServing(items, 100) : null;
}
