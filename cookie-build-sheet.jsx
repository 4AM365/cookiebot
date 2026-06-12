import React, { useState, useMemo, useContext } from "react";

// ============================================================================
// Cookie Dashboard — drive the *qualities* (spread, chew vs. crisp vs. cakey,
// brown-sugar share, butter state, browning…) and the *style*; the recipe and
// method regenerate live. Baker's percentages are all relative to total
// flour = 100%.
//
// The science behind each dial is drawn from the repo's reference corpus
// (Bressanini, La scienza della pasticceria — the core pastry reference;
// McGee, On Food and Cooking — sugars, browning, fats, eggs; Cauvain & Young,
// Technology of Breadmaking — flour, gluten, leavening) — see data/chunks.jsonl.
// Styles and traditional add-ins are baking-tradition knowledge, not the corpus.
// ============================================================================

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,800;9..144,900&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
@keyframes riseIn { from { opacity:0; transform: translateY(10px);} to {opacity:1; transform:none;} }
`;

// ---- Theming ---------------------------------------------------------------
// Warm bakery palette. Same keys in both themes. `onAccent` is light in BOTH —
// it's the text/icon colour placed on butter/butterDeep/choc accent surfaces.
const THEMES = {
  light: {
    paper: "#f7efe1", paperDeep: "#ece0ca", ink: "#3a2a1b", inkSoft: "#6e5740",
    butter: "#b9772b", butterDeep: "#74471c", choc: "#8a3f24", bake: "#cf9a3c",
    line: "#d8c7a9", card: "#fdf8ee", onAccent: "#fbf3e4",
    glow: "radial-gradient(circle at 20% 10%, rgba(138,63,36,0.05), transparent 40%), radial-gradient(circle at 85% 0%, rgba(185,119,43,0.06), transparent 45%)",
    mixBg: "rgba(138,63,36,0.07)",
  },
  dark: {
    paper: "#181206", paperDeep: "#231a0f", ink: "#f0e4d2", inkSoft: "#b39c80",
    butter: "#e0a44a", butterDeep: "#2e2110", choc: "#e08a5a", bake: "#e6b256",
    line: "#3c3122", card: "#241a0e", onAccent: "#fbf3e4",
    glow: "radial-gradient(circle at 20% 10%, rgba(224,138,90,0.10), transparent 42%), radial-gradient(circle at 85% 0%, rgba(224,164,74,0.10), transparent 45%)",
    mixBg: "rgba(224,138,90,0.10)",
  },
};
const ThemeCtx = React.createContext(THEMES.light);
const useC = () => useContext(ThemeCtx);

function round(n, dp = 0) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
const fToC = (f) => round(((f - 32) * 5) / 9 / 5) * 5; // °F -> nearest 5°C

// ---- Fixed (non-dialed) constants -----------------------------------------
// Chemical leavening, expressed as a % of flour, at the extremes of the
// soda:powder dial. Baking soda is the stronger base, so a soda-leaning cookie
// uses less total powder than a baking-powder one.
const SODA_MAX = 1.0;    // all-soda setting -> 1.0% soda
const POWDER_MAX = 2.0;  // all-powder setting -> 2.0% baking powder
const CHIPS_PCT = 60;    // chocolate-chip load as % of flour when chips are on
const EGG_G = 50;        // one large egg, grams

// ---- Flour, chill, method, egg, scoop registries ---------------------------
const FLOURS = [
  { key: "cake", name: "Cake flour", prot: "~7–9% protein", hint: "tender & short" },
  { key: "pastry", name: "Pastry flour", prot: "~8–10% protein", hint: "delicate" },
  { key: "all-purpose", name: "All-purpose", prot: "~10–12% protein", hint: "balanced" },
  { key: "bread", name: "Bread flour", prot: "~12–14% protein", hint: "chewy & sturdy" },
];

// The flavour/spread axis — analogous to a bread ferment schedule.
const CHILLS = [
  { name: "No chill", clock: "bake now", tag: "max spread",
    short: "scoop & bake straight away" },
  { name: "1-hour chill", clock: "~1 hr", tag: "tamed spread",
    short: "firm the fat so it holds" },
  { name: "Overnight rest", clock: "~12–16 hr", tag: "even & deeper",
    short: "fat firms, flour hydrates" },
  { name: "24–72 hr cure", clock: "1–3 days", tag: "toffee-deep",
    short: "the long flavour rest" },
];

const METHODS = {
  creamed: { label: "Creamed", short: "beat softened butter + sugar to aerate → lift" },
  melted: { label: "Melted (one-bowl)", short: "no aeration → denser, chewier, more spread" },
  browned: { label: "Browned butter", short: "nutty Maillard, water cooked off → deep flavour" },
  sable: { label: "Cold-cut (sablé)", short: "rub cold butter into the dry → sandy & short" },
};
const EGG_FORMS = {
  whole: { label: "Whole eggs", short: "balanced bind & set" },
  yolk: { label: "Yolk-rich", short: "lecithin & fat → tender, chewy, fudgy" },
  white: { label: "Whites added", short: "more protein & water → crisper, sets dry" },
};
const SCOOPS = {
  small: { label: "Small", g: 18, tag: "2-bite", min: 9, max: 11 },
  standard: { label: "Standard", g: 40, tag: "classic", min: 11, max: 13 },
  bakery: { label: "Bakery", g: 80, tag: "giant", min: 15, max: 18 },
};

// ---- Styles: curated presets that drive every dial at once -----------------
// `cat` groups the buttons. Every style here is one the dial model renders
// faithfully (a creamed/melted/sablé chemical-leavened dough). Cookies that
// need a *different* method — flourless, twice-baked, meringue-built — live in
// SPECIAL_STYLES below, with their own full recipe rather than faked on dials.
const STYLES = [
  // ---- The house ----
  { id: "hotrod", cat: "The house", name: "Hot-rod chocolate chip", tag: "brown-butter · big chew",
    blurb: "The house build: browned butter for toffee depth, bread flour for a real chew, a 24–72 hr cure for dark Maillard flavour, and a yolk-rich dough. Scooped big, baked tall, finished with flaky salt.",
    set: { sugarPct: 95, brownPct: 70, butterPct: 65, eggPct: 26, flourIdx: 3, leaven: true, sodaShare: 80, saltPct: 1.6, chillIdx: 3, ovenF: 375, method: "browned", eggForm: "yolk", scoop: "bakery" } },
  { id: "thin", cat: "The house", name: "Thin & crispy", tag: "lacy · snappy",
    blurb: "The opposite hot-rod: lots of white sugar, melted butter and no chill so it spreads thin and lacy, then bakes long enough to dry into a glassy snap. Caramel, not chew.",
    set: { sugarPct: 110, brownPct: 20, butterPct: 75, eggPct: 18, flourIdx: 2, leaven: true, sodaShare: 70, saltPct: 1.2, chillIdx: 0, ovenF: 350, method: "melted", eggForm: "whole", scoop: "standard" } },

  // ---- American classics ----
  { id: "chewy", cat: "American classics", name: "Chewy chocolate chip", tag: "soft · bendy",
    blurb: "Brown-sugar-heavy and yolk-rich with melted butter and an overnight rest — the moisture and a little extra protein give that bendy, soft-set chew. Pulled from the oven just underdone.",
    set: { sugarPct: 90, brownPct: 65, butterPct: 60, eggPct: 28, flourIdx: 3, leaven: true, sodaShare: 75, saltPct: 1.3, chillIdx: 2, ovenF: 350, method: "melted", eggForm: "yolk", scoop: "standard" } },
  { id: "tollhouse", cat: "American classics", name: "Classic Toll House", tag: "the original",
    blurb: "The 1938 archetype: creamed butter, an even split of white and brown sugar, all-purpose flour, straight baking soda and no chill. Crisp rim, soft middle, faintly cakey.",
    set: { sugarPct: 85, brownPct: 50, butterPct: 65, eggPct: 25, flourIdx: 2, leaven: true, sodaShare: 100, saltPct: 1.1, chillIdx: 0, ovenF: 375, method: "creamed", eggForm: "whole", scoop: "standard" } },
  { id: "oatmeal", cat: "American classics", name: "Oatmeal raisin", tag: "spiced · hearty",
    blurb: "Creamed, brown-sugar-led and cinnamon-warm, built around rolled oats and plump raisins. The oats drink moisture and firm the dough for a hearty, chewy-craggy cookie.",
    set: { sugarPct: 80, brownPct: 70, butterPct: 58, eggPct: 25, flourIdx: 2, leaven: true, sodaShare: 70, saltPct: 1.2, chillIdx: 1, ovenF: 350, method: "creamed", eggForm: "whole", scoop: "standard" } },
  { id: "pnut", cat: "American classics", name: "Peanut butter", tag: "fork-marked",
    blurb: "Peanut butter adds fat and protein for a tender-dense crumb; brown sugar keeps it soft. Pressed with the classic criss-cross so the dense dough bakes through.",
    set: { sugarPct: 95, brownPct: 55, butterPct: 55, eggPct: 24, flourIdx: 2, leaven: true, sodaShare: 80, saltPct: 1.4, chillIdx: 1, ovenF: 350, method: "creamed", eggForm: "whole", scoop: "standard" } },
  { id: "snicker", cat: "American classics", name: "Snickerdoodle", tag: "cinnamon-sugar · tangy",
    blurb: "Creamed and white-sugar-bright, leavened mostly with baking powder (the cream-of-tartar tang is the signature), rolled in cinnamon sugar so it stays pale and puffy with a crackled, chewy top.",
    set: { sugarPct: 100, brownPct: 10, butterPct: 60, eggPct: 26, flourIdx: 2, leaven: true, sodaShare: 30, saltPct: 1.1, chillIdx: 0, ovenF: 375, method: "creamed", eggForm: "whole", scoop: "standard" } },
  { id: "sugar", cat: "American classics", name: "Soft sugar cookie", tag: "pillowy · pale",
    blurb: "All white sugar, cake-leaning flour and baking powder, creamed for lift — a pillowy, pale, cakey cookie that's all about tender crumb, not browning. The blank canvas for frosting and sprinkles.",
    set: { sugarPct: 95, brownPct: 0, butterPct: 60, eggPct: 28, flourIdx: 1, leaven: true, sodaShare: 0, saltPct: 1.0, chillIdx: 1, ovenF: 350, method: "creamed", eggForm: "whole", scoop: "standard" } },
  { id: "doublechoc", cat: "American classics", name: "Double chocolate", tag: "brownie-edged",
    blurb: "Cocoa swapped in for some of the flour and melted butter for fudge — a dark, brownie-edged cookie. Natural cocoa's acidity pairs with the soda to brown and bloom the chocolate.",
    set: { sugarPct: 100, brownPct: 55, butterPct: 60, eggPct: 30, flourIdx: 2, leaven: true, sodaShare: 70, saltPct: 1.3, chillIdx: 1, ovenF: 350, method: "melted", eggForm: "whole", scoop: "standard" } },

  // ---- European & pastry ----
  { id: "shortbread", cat: "European & pastry", name: "Shortbread", tag: "Scottish · sandy",
    blurb: "Three ingredients, no egg, no leavening: butter rubbed into flour and sugar (sablage) so gluten can barely form. Pure short, sandy, snappable richness, baked low and slow to stay pale.",
    set: { sugarPct: 50, brownPct: 0, butterPct: 70, eggPct: 0, flourIdx: 1, leaven: false, sodaShare: 0, saltPct: 1.0, chillIdx: 1, ovenF: 325, method: "sable", eggForm: "whole", scoop: "standard" } },
  { id: "sable", cat: "European & pastry", name: "Sablé Breton", tag: "French · buttery",
    blurb: "The French sandy cookie: yolk-rich and heavily salted, with a touch of baking powder for a tender lift. Cold-cut and rested, baked in rings for a thick, crumbling, intensely buttery disc.",
    set: { sugarPct: 60, brownPct: 0, butterPct: 68, eggPct: 18, flourIdx: 1, leaven: true, sodaShare: 0, saltPct: 1.8, chillIdx: 2, ovenF: 340, method: "sable", eggForm: "yolk", scoop: "standard" } },
  { id: "speculoos", cat: "European & pastry", name: "Speculoos", tag: "Belgian · spiced",
    blurb: "All brown sugar and warm spice (cinnamon, clove, nutmeg, ginger), creamed lean and rested, then baked thin and crisp. The caramel-spice biscuit behind cookie butter.",
    set: { sugarPct: 75, brownPct: 100, butterPct: 55, eggPct: 12, flourIdx: 2, leaven: true, sodaShare: 60, saltPct: 1.0, chillIdx: 2, ovenF: 350, method: "creamed", eggForm: "whole", scoop: "small" } },
  { id: "gingerbread", cat: "European & pastry", name: "Gingerbread cut-out", tag: "molasses · snap",
    blurb: "Molasses-dark and soda-leavened for browning and a firm snap, spiced with ginger and cinnamon. A stiff, rollable dough for cutting shapes that hold their edges.",
    set: { sugarPct: 70, brownPct: 100, butterPct: 50, eggPct: 18, flourIdx: 2, leaven: true, sodaShare: 80, saltPct: 1.0, chillIdx: 2, ovenF: 350, method: "creamed", eggForm: "whole", scoop: "standard" } },
  { id: "anzac", cat: "European & pastry", name: "Anzac biscuit", tag: "oats · golden syrup",
    blurb: "No egg — bound by golden syrup (invert sugar) and baking soda bloomed in a little boiling water, with oats and coconut. Chewy-then-crisp and famously keeps for weeks.",
    set: { sugarPct: 75, brownPct: 40, butterPct: 55, eggPct: 0, flourIdx: 2, leaven: true, sodaShare: 100, saltPct: 0.8, chillIdx: 0, ovenF: 325, method: "melted", eggForm: "whole", scoop: "standard" } },
  { id: "viennese", cat: "European & pastry", name: "Viennese whirls", tag: "piped · melt-in-mouth",
    blurb: "Very high butter, low sugar, cake flour and no leavening, creamed soft enough to pipe into swirls. They barely spread and dissolve on the tongue — shortbread you can pipe.",
    set: { sugarPct: 45, brownPct: 0, butterPct: 75, eggPct: 0, flourIdx: 0, leaven: false, sodaShare: 0, saltPct: 0.6, chillIdx: 0, ovenF: 340, method: "creamed", eggForm: "whole", scoop: "small" } },
];
const STYLE_CATS = ["The house", "American classics", "European & pastry"];
const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));
const DEFAULT_STYLE = "hotrod";
// The fingerprint used to detect which preset (if any) the dials currently match.
// eggForm + scoop are user prefs, like a yeast form — set by a style but not matched.
const STYLE_KEYS = ["sugarPct", "brownPct", "butterPct", "eggPct", "flourIdx",
  "leaven", "sodaShare", "saltPct", "chillIdx", "ovenF", "method"];

// ---- Beyond the dials: fixed recipes --------------------------------------
// These cookies break the dial model — flourless, twice-baked, or built on a
// meringue. So instead of faking them on sliders, each carries its own full
// recipe + method, scaled by the flour/almond master input. `bp(f, pct)` is a
// baker's-percentage gram weight against that master.
const bp = (f, pct, dp = 0) => round((f * pct) / 100, dp);
const num = (steps) => steps.map((s, i) => ({ ...s, n: String(i + 1).padStart(2, "0") }));

const SPECIAL_STYLES = [
  { id: "biscotti", name: "Biscotti / Cantucci", tag: "twice-baked · lean",
    blurb: "Tuscan cantucci: a lean, almost fat-free dough bound by whole eggs and studded with whole almonds, baked once as a log, sliced, then baked again to drive out moisture for the hard, dry, dunk-it-in-vinsanto snap.",
    recipe: (f) => ({
      clock: "~1.5 hr",
      profile: ["lean · little/no butter", "egg-bound", "whole almonds", "twice-baked", "hard & dry"],
      groups: [
        { title: "Dough — lean & egg-bound", caption: "stiff, sticky, no creaming", items: [
          { k: "Flour (all-purpose)", g: bp(f, 100), pct: 100 },
          { k: "Sugar", g: bp(f, 65), pct: 65 },
          { k: "Whole eggs", g: bp(f, 55), pct: 55, note: "the only real moisture & bind (~2–3 large)" },
          { k: "Baking powder", g: bp(f, 2, 1), pct: 2 },
          { k: "Butter", g: bp(f, 8), pct: 8, note: "optional — traditional cantucci use none" },
          { k: "Salt", g: bp(f, 0.8, 1), pct: 0.8 },
        ] },
        { title: "The almonds & aromatics", caption: "whole, skin-on, untoasted", brine: true, items: [
          { k: "Whole almonds", g: bp(f, 60), pct: 60, accent: true, note: "fold in whole — they toast in the bake" },
          { k: "Orange zest + vanilla", g: null, pct: null, accent: true, note: "classic; a splash of vin santo too" },
        ] },
      ],
      summary: [
        { label: "Total dough", val: `${round(f + bp(f, 65) + bp(f, 55) + bp(f, 60))}g` },
        { label: "Bakes", val: "twice" },
        { label: "Oven", val: "165–175°C / 325–350°F" },
        { label: "Bake", val: "25m + 15m" },
      ],
      steps: num([
        { title: "Mix a stiff dough", spec: "whisk eggs + sugar · add flour, baking powder, salt, zest · fold in almonds",
          why: "No creaming — biscotti are nearly fat-free, so the eggs do all the binding. Whisk eggs and sugar, then work in the dry to a stiff, sticky dough and fold in the whole almonds. It should be just shy of too dry to handle.",
          more: "Wet or floured hands help; the dough is meant to be dense, not soft." },
        { title: "Shape the logs", spec: "2 flattened logs on a lined sheet · ~6 cm wide",
          why: "Shape into a couple of flattened logs. They spread a little, so leave room. The flatter the log, the more even the slices.",
          more: "An egg wash gives the classic shiny, deep-gold crust." },
        { title: "First bake", spec: "165–175°C / 325–350°F · ~25 min until set & pale-gold",
          why: "Bake the logs until set and lightly golden but not hard — you need to be able to slice them cleanly. This bake cooks the dough through; the second one dries it.",
          more: "Cool 10–15 min before slicing or they crumble." },
        { title: "Slice on the diagonal", spec: "serrated knife · ~1.5 cm · cut-side up on the sheet",
          why: "Slice each log diagonally into fingers and lay them cut-side down/up on the sheet. The exposed faces are what go hard and dry in the second bake.",
          more: "A sawing motion with a serrated knife stops them shattering." },
        { title: "Second bake — the dry-out", spec: "150–160°C / 300–325°F · ~15 min, flip once",
          why: "Bake again, lower, flipping once, until dry and crisp through. This is the defining step: driving off the last moisture is what gives cantucci their hard, long-keeping snap (the same reason rusks and zwieback are twice-baked).",
          more: "They firm up further as they cool — pull them while there's the faintest give." },
        { title: "Cool fully", spec: "rack · airtight · keeps for weeks",
          why: "Cool completely so they reach full crispness, then store airtight. Bone-dry, they keep for weeks — they're built to be dunked into coffee or vin santo, which softens them to eat." },
      ]),
    }) },

  { id: "amaretti", name: "Amaretti / Ricciarelli", tag: "flourless · almond",
    blurb: "Italian almond cookies with no flour and no butter: ground almonds and sugar bound by whisked egg white, scented with bitter-almond. Crisp-shelled and chewy inside (morbidi), or the soft, diamond-shaped Sienese ricciarelli rolled in icing sugar.",
    recipe: (f) => ({
      clock: "~1 hr + rest",
      profile: ["no flour", "no butter", "almond + egg white", "crisp shell, chewy centre", "naturally gluten-free"],
      groups: [
        { title: "The paste — almond & sugar", caption: "f = ground almonds (the master scale here)", items: [
          { k: "Ground almonds", g: bp(f, 100), pct: 100, note: "blanched, finely ground" },
          { k: "Sugar (caster + icing)", g: bp(f, 95), pct: 95, note: "part caster, part icing" },
          { k: "Egg white", g: bp(f, 35), pct: 35, accent: true, note: "whisked to soft peaks (~1–1.5 whites)" },
          { k: "Bitter-almond / amaretto", g: null, pct: null, note: "a few drops — the signature scent" },
        ] },
        { title: "To finish", caption: "the crackled sugar shell", brine: true, items: [
          { k: "Icing sugar", g: bp(f, 20), pct: 20, accent: true, note: "roll the balls heavily before baking" },
          { k: "Pinch of salt + zest", g: null, pct: null, accent: true, note: "orange or lemon, optional" },
        ] },
      ],
      summary: [
        { label: "Total", val: `${round(f + bp(f, 95) + bp(f, 35))}g` },
        { label: "Flour", val: "none" },
        { label: "Oven", val: "150–160°C / 300–325°F" },
        { label: "Bake", val: "15–20 min" },
      ],
      steps: num([
        { title: "Whisk the whites", spec: "egg white → soft peaks (add a little sugar to stabilise)",
          why: "With no flour and no butter, the only structure comes from the almond's own protein and oil plus the egg-white foam. Whisk the whites to soft peaks so they can lift and set the cookie.",
          more: "A pinch of salt or drop of lemon helps the foam form and hold." },
        { title: "Fold in almonds & sugar", spec: "combine ground almonds + sugar + flavouring · fold into the whites",
          why: "Fold the almond–sugar mix gently into the whites to a thick, sticky paste. Keep it airy — overworking knocks out the foam and bakes them flat and dense.",
          more: "It should hold a soft shape; rest 30 min if it's too slack to roll." },
        { title: "Roll & coat in icing sugar", spec: "walnut-size balls · roll heavily in icing sugar",
          why: "Roll into balls and coat thickly in icing sugar. As they bake and spread, that sugar shell cracks into the classic crackled, snow-dusted craquelure.",
          more: "For ricciarelli, shape into flattened diamonds instead and coat the same way." },
        { title: "Rest to skin over", spec: "uncovered · 30 min – overnight before baking",
          why: "Let the shaped cookies sit so the surface dries and forms a skin. That skin is what sets and cracks neatly instead of spreading into a puddle — the same logic as resting macarons.",
          more: "An overnight rest gives the most pronounced cracks and a chewier centre." },
        { title: "Bake low & gentle", spec: "150–160°C / 300–325°F · 15–20 min until pale-gold & cracked",
          why: "Bake low so they set and crackle without browning much — amaretti should stay pale and almond-pale, crisp on the shell and still soft-chewy within. Too hot and the sugar scorches before the centre sets.",
          more: "They firm as they cool; pull while the centres still feel soft." },
      ]),
    }) },

  { id: "macaron", name: "French macaron", tag: "meringue · almond",
    blurb: "Not a drop-cookie at all but a meringue-and-almond confection: almond flour and icing sugar folded into meringue (macaronage), piped, rested to a skin, and baked low so they rise on smooth 'feet'. Technique over recipe — humidity, folding and resting decide everything.",
    recipe: (f) => ({
      clock: "~1.5 hr + rest",
      profile: ["meringue-built", "almond + icing sugar", "macaronage", "smooth feet", "technique-driven"],
      groups: [
        { title: "Tant-pour-tant — the dry", caption: "f = almond flour (the master scale here)", items: [
          { k: "Almond flour", g: bp(f, 100), pct: 100, note: "sifted fine" },
          { k: "Icing sugar", g: bp(f, 100), pct: 100, note: "sift together with the almonds" },
        ] },
        { title: "The meringue", caption: "French (raw) or Italian (syrup) method", brine: true, items: [
          { k: "Egg white (aged)", g: bp(f, 38), pct: 38, accent: true, note: "split: part in the meringue, part in the paste" },
          { k: "Caster sugar", g: bp(f, 38), pct: 38, accent: true, note: "whipped into the whites" },
          { k: "Gel colour + flavour", g: null, pct: null, accent: true, note: "no liquid — it slackens the batter" },
        ] },
      ],
      summary: [
        { label: "Almond : sugar", val: "1 : 1" },
        { label: "Critical step", val: "macaronage" },
        { label: "Oven", val: "150°C / 300°F" },
        { label: "Bake", val: "14–18 min" },
      ],
      steps: num([
        { title: "Sift the tant-pour-tant", spec: "almond flour + icing sugar · sift twice · discard coarse bits",
          why: "Sift the almond flour and icing sugar together — twice. Any coarse almond grit pocks the smooth shell macarons are prized for. Equal weights of almond and sugar is the classic 'tant pour tant'.",
          more: "Grind and re-sift if your almond flour is coarse; bone-dry is best." },
        { title: "Whip the meringue", spec: "whites → soft peak · rain in sugar → stiff, glossy",
          why: "Whip aged whites to soft peaks, then rain in the caster sugar and beat to a stiff, glossy meringue — this is the only leavening, so it must be strong. Add gel colour at the end (never liquid, which thins the batter).",
          more: "Italian method (hot sugar syrup) is more stable for beginners; French (raw) is simpler." },
        { title: "Macaronage — the make-or-break fold", spec: "fold dry into meringue · deflate to a slow 'lava ribbon'",
          why: "Fold the dry into the meringue and keep folding to deliberately knock some air out, until the batter flows off the spatula in a thick ribbon that melts back in ~10–20 seconds. Under-folded = lumpy and hollow; over-folded = flat and footless. This single step decides the result.",
          more: "Test by figure-eighting the ribbon — it should hold briefly, then smooth out." },
        { title: "Pipe & bang", spec: "even rounds on a template · rap the tray hard · pop bubbles",
          why: "Pipe even rounds, then rap the tray firmly on the counter to release trapped air and pop surface bubbles with a pick — trapped air cracks the shells.",
          more: "A silicone mat or doubled trays protect the bottoms from over-baking." },
        { title: "Rest until skinned over", spec: "20–60 min · until touch-dry, not tacky",
          why: "Leave the piped shells until the surface is dry to a light touch. That skin forces the rising batter to escape downward instead of upward — which is what pushes out the smooth ruffled 'feet'. Skip it and they crack.",
          more: "High humidity stops them skinning; a dry room or a brief warm spot helps." },
        { title: "Bake low & even", spec: "150°C / 300°F · 14–18 min · don't brown",
          why: "Bake low and slow until the feet are set and a shell lifts cleanly without sticking — they should stay pale, never brown. Convection or a hot spot makes them lopsided; rotate if needed.",
          more: "Mature filled macarons in the fridge 24 hr — the shells soften to the ideal chew." },
      ]),
    }) },
];
const SPECIAL_BY_ID = Object.fromEntries(SPECIAL_STYLES.map((s) => [s.id, s]));

function matchStyle(cur) {
  const hit = STYLES.find((s) => STYLE_KEYS.every((k) => s.set[k] === cur[k]));
  return hit ? hit.id : "custom";
}

// ---- Add-ins ---------------------------------------------------------------
// `styles` = which presets an add-in is classic for (drives the badge).
// `short` = one-line prep (always shown). `prep` = full method (shown in the
// process step at Detailed). `prepSteps` = the tickable mise-en-place list.
// `finish: true` = goes on top after/at the end, not folded into the dough.
const ADDINS = [
  { id: "chips", icon: "🍫", label: "Chocolate chips/chunks", styles: ["hotrod", "thin", "chewy", "tollhouse", "doublechoc"],
    short: "folded in last; reserve some for the tops",
    prep: "Chips hold their shape; a chopped bar gives molten puddles and shardy edges — use a mix. Fold in last so they don't smear the dough grey, and press a few extra onto each ball before baking so the tops look bakery-made.",
    prepSteps: ["Chop a bar for puddles, or use chips for shape", "Fold in at the very end", "Reserve a handful to press on top"] },
  { id: "cocoa", icon: "🟤", label: "Cocoa (double-choc)", styles: ["doublechoc"],
    short: "swapped in for some of the flour", swap: true,
    prep: "Cocoa replaces some of the flour, so it dilutes the gluten (softer, more spread) and drinks fat and liquid (drier crumb). Natural cocoa is acidic and pairs with baking soda — the soda neutralises it, browns harder and blooms the colour; Dutched cocoa is alkalised and pH-neutral, so lean on baking powder or it tastes flat and over-browns. The cocoa panel does the swap math live.",
    prepSteps: ["Sift the cocoa with the flour to kill lumps", "Natural cocoa → baking soda; Dutched → baking powder", "Pull back the flour by the cocoa weight"] },
  { id: "walnuts", icon: "🌰", label: "Walnuts / pecans", styles: ["hotrod", "tollhouse", "oatmeal", "chewy"],
    short: "toasted, chopped, folded in",
    prep: "Toast them first (8–10 min at 175°C) — raw nuts taste flat and go soft in the dough. Cool, chop, and fold in with the chips. The toasting builds the same Maillard nuttiness you're chasing in the cookie itself.",
    prepSteps: ["Toast at 175°C / 350°F for 8–10 min", "Cool, then chop", "Fold in with the chocolate"] },
  { id: "oats", icon: "🌾", label: "Rolled oats", styles: ["oatmeal", "anzac"],
    short: "rolled (not instant); firm the dough", swapNote: true,
    prep: "Use old-fashioned rolled oats, not instant — they hold their chew. Oats absorb a lot of moisture and firm the dough, so they cut spread; if the dough turns stiff, a splash more egg or a touch less flour rebalances it. Toasting them first deepens the flavour.",
    prepSteps: ["Use rolled, not instant or steel-cut", "(optional) toast for deeper flavour", "Expect a stiffer dough — they drink moisture"] },
  { id: "raisins", icon: "🍇", label: "Raisins / dried fruit", styles: ["oatmeal"],
    short: "plumped, patted dry",
    prep: "Soak raisins (or dried cranberries/cherries) in warm water or rum 10–15 min so they don't steal moisture from the dough and bake to bullets, then pat them dry before folding in.",
    prepSteps: ["Soak 10–15 min in warm water or rum", "Drain and pat dry", "Fold in with any nuts"] },
  { id: "pb", icon: "🥜", label: "Peanut butter", styles: ["pnut"],
    short: "creamed in with the butter",
    prep: "Beat it in with the butter and sugar. Peanut butter is extra fat and protein, so it tenderises but also dries — keep the brown sugar up for moisture, and don't overbake or it goes chalky.",
    prepSteps: ["Use no-stir (stabilised) for consistency", "Cream in with the butter & sugar", "Press the criss-cross to flatten the dense dough"] },
  { id: "coconut", icon: "🥥", label: "Coconut", styles: ["anzac"],
    short: "desiccated or flaked, folded in",
    prep: "Desiccated coconut melts into the crumb; flaked gives chew and toasty edges. Either way it drinks moisture like oats, so expect a firmer dough.",
    prepSteps: ["Pick desiccated (fine) or flaked (chewy)", "Fold in with the oats", "Expect a drier, firmer dough"] },
  { id: "spice", icon: "🌶️", label: "Cinnamon / spice", styles: ["oatmeal", "snicker", "speculoos", "gingerbread"],
    short: "whisked into the dry",
    prep: "Whisk ground spice into the flour so it disperses evenly — cinnamon, plus clove, nutmeg, ginger and cardamom for speculoos/gingerbread. Bloom whole spices in the warm butter (if browning) for a rounder flavour.",
    prepSteps: ["Whisk ground spice into the flour", "(if browning butter) bloom whole spices in it", "Taste the raw dough and adjust"] },
  { id: "toffee", icon: "🍯", label: "Toffee bits", styles: ["hotrod"],
    short: "folded in; they melt to caramel",
    prep: "Toffee/Heath bits melt into little caramel pools and crisp at the edges. Fold in sparingly — they're pure sugar and push the cookie sweeter and crisper.",
    prepSteps: ["Fold in with the chocolate", "Keep the amount modest — pure sugar", "Expect crisper, sweeter edges"] },
  { id: "espresso", icon: "☕", label: "Espresso powder", styles: ["doublechoc", "hotrod"],
    short: "dissolved in; deepens chocolate",
    prep: "A teaspoon of instant espresso powder dissolved into the wet ingredients doesn't read as coffee — it deepens and rounds the chocolate, the same way a pinch of it lifts a brownie.",
    prepSteps: ["Dissolve into the egg/vanilla", "Start with ~1 tsp", "Tastes like deeper chocolate, not coffee"] },
  { id: "zest", icon: "🍋", label: "Citrus zest", styles: ["sugar", "sable", "shortbread"],
    short: "rubbed into the sugar",
    prep: "Rub the zest into the sugar with your fingertips before creaming — it bruises the oils out of the zest and perfumes the whole batch far better than just stirring it in.",
    prepSteps: ["Zest only the coloured layer, no pith", "Rub into the sugar until fragrant & damp", "Then cream as usual"] },
  { id: "flakysalt", icon: "🧂", label: "Flaky salt (finish)", styles: ["hotrod", "chewy", "doublechoc", "sable"], finish: true,
    short: "pinched on warm, out of the oven",
    prep: "Maldon or fleur de sel pinched onto the cookies as they come out of the oven, while the surface is still tacky enough to hold it. The salt crystals stay crunchy and pop against the sweet — don't bake it in, or it dissolves.",
    prepSteps: ["Use a flaky salt, not table salt", "Pinch on within a minute of pulling them", "Let it stick to the warm, tacky tops"] },
  { id: "sprinkles", icon: "🌈", label: "Sprinkles", styles: ["sugar"], finish: true,
    short: "pressed on before baking",
    prep: "Press nonpareils or jimmies onto the dough balls before baking (or onto frosting after). Roll the whole ball for full coverage; they don't bleed if you use jimmies rather than soft confetti quins.",
    prepSteps: ["Roll the balls in sprinkles before baking", "Use jimmies (they don't bleed)", "Or save them for frosting after"] },
];
const VERBOSITY = ["Terse", "Standard", "Detailed"];

// Cocoa swaps 1:1 for flour. Natural cocoa is acidic (pairs with baking soda);
// Dutched is alkalised and pH-neutral (pairs with baking powder).
const COCOA_MODES = { natural: "Natural", dutch: "Dutched" };

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function Num({ children, color }) {
  return <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color }}>{children}</span>;
}

function Toggle({ on, onClick, label, sub }) {
  const C = useC();
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
      background: on ? C.butter : "transparent", color: on ? C.onAccent : C.ink,
      border: `1.5px solid ${on ? C.butter : C.line}`, borderRadius: 10, padding: "12px 14px",
      cursor: "pointer", transition: "all .18s ease", fontFamily: "'Fraunces', serif" }}>
      <span style={{ width: 34, height: 20, borderRadius: 20, background: on ? C.onAccent : C.line, position: "relative", flexShrink: 0, transition: "background .18s ease" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: on ? C.butter : C.card, transition: "left .18s ease" }} />
      </span>
      <span style={{ lineHeight: 1.2 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{label}</span>
        {sub && <span style={{ display: "block", fontSize: 12, opacity: 0.75, fontFamily: "'IBM Plex Mono', monospace" }}>{sub}</span>}
      </span>
    </button>
  );
}

// A labelled slider with a live readout, lo↔hi captions, and an expandable
// "why" science note. `stops` (optional) renders discrete tick labels.
function Dial({ label, value, min, max, step, onChange, readout, lo, hi, stops, why, accent }) {
  const C = useC();
  const [open, setOpen] = useState(false);
  const col = accent ? C.choc : C.butter;
  return (
    <div style={{ background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 15px 11px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: col, fontWeight: 600, whiteSpace: "nowrap" }}>{readout}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: col, margin: "9px 0 2px" }} />
      {stops ? (
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkSoft }}>
          {stops.map((s, i) => (
            <span key={s} style={{ color: i === value ? col : C.inkSoft, fontWeight: i === value ? 600 : 400, textAlign: "center", flex: 1 }}>{s}</span>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.inkSoft }}>
          <span>{lo}</span><span>{hi}</span>
        </div>
      )}
      {why && (
        <>
          <button onClick={() => setOpen((o) => !o)} style={{ marginTop: 7, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: col, fontWeight: 600, letterSpacing: 0.5 }}>
            {open ? "− why" : "ⓘ why"}
          </button>
          {open && <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.5, color: C.inkSoft, animation: "riseIn .2s ease" }}>{why}</div>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process generator — steps adapt to method, chill, leavening, flour, add-ins,
// cocoa, oven temp, scoop and verbosity. `more` is surfaced only at Detailed.
// ---------------------------------------------------------------------------
function buildSteps(p) {
  const { method, eggForm, leaven, sugarPct, brownPct, butterPct, eggPct,
    flour, chill, chillIdx, sodaShare, ovenF, scoop, addins, cocoa, verbosity } = p;
  const ovenC = fToC(ovenF);
  const sc = SCOOPS[scoop];
  const eg = EGG_FORMS[eggForm];
  const hasEgg = eggPct > 0;
  const sablage = method === "sable";
  const notFolded = new Set(["cocoa", "pb", "spice", "zest", "espresso"]); // mixed into wet/dry, not folded in as solids
  const folded = addins.filter((a) => !a.finish && !notFolded.has(a.id));
  const finishers = addins.filter((a) => a.finish);
  const chewWord = flour.key === "bread" ? "really matters here" : flour.key === "cake" ? "matters less — there's little gluten to build" : "matters";

  const steps = [];

  if (method === "browned") {
    steps.push({ title: "Brown the butter", spec: "melt → foam → nutty-brown speckles · pour off · cool until pliable",
      why: "Melt the butter and keep cooking past melting: it foams, then the milk solids toast to brown flecks and a nutty, toffee aroma — that's the Maillard reaction on the milk proteins and sugars (McGee). Cooking also drives off ~15–20% of the butter's water, so a browned-butter cookie spreads less and tastes deeper.",
      more: "You lost water, so the dough is drier — chill the browned butter back to a soft solid if you want to cream it, or use it warm-melted for maximum spread and chew." });
  }

  if (sablage) {
    steps.push({ title: "Sablage — rub the cold butter into the dry", spec: `cold cubed butter (${butterPct}%) rubbed into flour + sugar + salt${leaven ? " + leavening" : ""} · until sandy`,
      why: `The sablé/frolla move: coat the flour in fat *before* any liquid. Cold butter rubbed into the dry waterproofs the flour so water can't reach the proteins and build gluten — the result is short, tender, sandy and snappable rather than chewy (Bressanini, pasta frolla). 'Sablé' literally means sandy.`,
      more: "Keep everything cold and work fast — warm hands melt the butter into the flour and you lose the short, flaky texture." });
  } else if (method === "creamed") {
    steps.push({ title: "Cream the butter & sugar", spec: `softened butter (≈18°C/65°F, ${butterPct}%) + both sugars · beat 3–5 min to pale & fluffy`,
      why: `Beat softened butter with the sugar until pale and fluffy. Creaming whips air into the plastic fat, and the sharp sugar crystals cut in those bubbles — they become the nuclei the leavening later inflates, so creaming is itself a leavening step and gives a lighter, more cakey lift (Bressanini; McGee).${brownPct > 0 ? " The brown sugar also brings moisture and a little acidity." : ""}`,
      more: "Butter too warm and greasy won't hold the air; too cold and it won't cream. Stop when it's pale and noticeably fluffy." });
  } else {
    steps.push({ title: `Whisk the ${method === "browned" ? "browned " : "melted "}butter & sugar`, spec: `warm ${method === "browned" ? "browned " : "melted "}butter (${butterPct}%) + both sugars · whisk smooth · rest 10 min`,
      why: `Whisk the melted butter into both sugars — no aeration here, so you get a denser, chewier, more spread-prone dough than creaming. Resting 10 minutes lets the sugar begin dissolving, which gives that shiny, crackly top; undissolved sugar bakes sandier (McGee, sugars). Melted butter also frees its water to hydrate the flour, building a little more gluten for chew.`,
      more: "The warmer the butter, the more it spreads. For the glossiest, crackliest top, dissolve the sugar fully — whisk, rest, whisk again." });
  }

  if (hasEgg) {
    steps.push({ title: "Beat in the egg & vanilla", spec: `egg (${eggPct}%, ${eg.label.toLowerCase()}) + vanilla · beat until emulsified`,
      why: `Add the egg and vanilla and beat until smooth and emulsified. You're on ${eg.label.toLowerCase()}: ${eggForm === "yolk" ? "yolks bring fat and lecithin (an emulsifier) for a silky, tender, moisture-holding chew" : eggForm === "white" ? "the extra white is protein and water, so it sets firmer and bakes crisper and more cakey" : "whole eggs balance binding and set"} (McGee, eggs).`,
      more: "Scrape the bowl and beat until uniform — a broken emulsion bakes greasy and uneven." });
  }

  const cocoaDry = cocoa && cocoa.on ? ` + sifted cocoa (${cocoa.pct}% of flour)` : "";
  steps.push({ title: "Whisk the dry ingredients", spec: `${flour.name.toLowerCase()}${cocoaDry}${leaven ? " + leavening" : ""} + salt · whisk to combine`,
    why: `Whisk the ${flour.name.toLowerCase()} (${flour.prot})${leaven ? ", the leavening," : ""} and salt together off to the side. Even dispersal stops soapy pockets of baking soda and pale/dark patches. ${cocoa && cocoa.on ? `Sift the cocoa in — it clumps. ${cocoa.mode === "natural" ? "Natural cocoa is acidic, so it reacts with the baking soda to brown harder and bloom the colour." : "Dutched cocoa is alkalised and pH-neutral, so it leans on the baking powder; with soda alone it tastes flat and over-browns."}` : ""}`,
    more: `Choosing the flour is choosing the chew: at ${flour.name} (${flour.prot}) the protein — and so how hard you mix next — ${chewWord}.` });

  if (sablage) {
    steps.push({ title: "Bring it together", spec: `${hasEgg ? "add the egg/yolk" : "add a splash of cream or water"} · press just until it clumps into a dough`,
      why: "Add the liquid to the sandy mix and press — don't knead — just until it comes together into a dough. Any real kneading now starts building the gluten you worked to avoid, turning short into tough.",
      more: "Pat into a disc, wrap, and chill before rolling or slicing." });
  } else {
    steps.push({ title: "Combine — just until it comes together", spec: "add the dry to the wet · mix until the last flour streak vanishes · stop",
      why: `Add the dry to the wet and mix only until the last streak of flour disappears. Every extra turn develops the gluten network (Cauvain, Ch.2: mixing is what builds gluten) — past just-combined the cookie turns tough and bready instead of tender. At ${flour.name} this ${chewWord}.`,
      more: "Finish by hand with a spatula for control, scraping the bottom of the bowl where dry flour hides." });
  }

  if (folded.length) {
    const lines = folded.map((t) => `${t.icon} ${t.label} — ${verbosity >= 2 ? t.prep : t.short}`).join("\n");
    steps.push({ title: "Fold in the add-ins", spec: folded.map((t) => t.label).join(" · "),
      why: lines,
      more: "Fold by hand just to distribute — overmixing now both toughens the dough and smears the chocolate. Reserve a few chips/nuts to press onto the tops." });
  }

  // Chill / rest
  if (chillIdx === 0) {
    steps.push({ title: "Scoop straight away", spec: `${sc.label.toLowerCase()} scoops (${sc.g}g) · no chill`,
      why: `Skipping the chill means the fat is soft and the cookies spread to their thinnest, flattest extent — exactly what you want for ${sugarPct >= 100 ? "a lacy, crisp" : "a thin, even"} cookie. Scoop and get them in.`,
      more: "If the kitchen is hot and they're spreading into each other, a 15-minute fridge firm-up is a cheap insurance." });
  } else {
    const why = chillIdx === 3
      ? `Cover tightly and rest the dough 1–3 days. The long cure is a flavour engine: enzymes slowly break starch and protein into reducing sugars and free amino acids, which then brown far more deeply in the oven, and the moisture redistributes for an even bake — the well-known multi-day chocolate-chip rest (McGee, browning).`
      : chillIdx === 2
      ? `Rest the dough overnight. The fat firms so it spreads slower and the cookie bakes taller, the flour fully hydrates for a more even crumb, and the flavour deepens and browns better than a same-day bake (McGee).`
      : `An hour in the fridge firms the butter so the cookies hold their shape and don't spread to a puddle — the simplest lever on spread there is.`;
    steps.push({ title: chill.name, spec: `${chill.short} · ${chill.clock}${sablage ? " · also makes it rollable" : ""}`,
      why,
      more: chillIdx >= 2 ? "Scoop cold, straight from the fridge — cold dough holds its height in the oven. Let bakery-size scoops sit 5 min if they're rock-hard." : "Scoop chilled for the best shape." });
  }

  // Shape
  const shapeNote = [];
  if (addins.some((a) => a.id === "sprinkles")) shapeNote.push("roll the balls in sprinkles");
  if (p.styleId === "snicker") shapeNote.push("roll in cinnamon sugar");
  if (p.styleId === "pnut") shapeNote.push("press the criss-cross with a fork");
  const cutout = p.styleId === "gingerbread" || (sablage && p.styleId !== "sable") || p.styleId === "sugar";
  steps.push({ title: cutout ? "Roll, cut & space" : "Scoop & space", spec: cutout
      ? "roll ~5mm · cut shapes · space on a lined sheet"
      : `${sc.g}g balls · ${Math.max(6, Math.round(640 / sc.g))}-ish per sheet · spaced for spread${shapeNote.length ? " · " + shapeNote.join(" · ") : ""}`,
    why: cutout
      ? "Roll the chilled dough to an even thickness and cut your shapes — even thickness is even baking. Re-chill the cut shapes briefly so they keep crisp edges in the oven."
      : `Scoop even ${sc.label.toLowerCase()} balls so they bake at the same rate, and space them well — they spread to roughly double.${shapeNote.length ? ` Then ${shapeNote.join(", ")}.` : ""} A taller, craggier ball (don't roll it smooth) bakes a more textured top.`,
    more: cutout ? "Gather and re-roll scraps gently — overworked scraps toughen." : "For picture-perfect rounds, swirl a cup around each cookie ('scooting') the moment they leave the oven." });

  // Bake
  const setVsSpread = ovenF >= 375
    ? "the edges set fast before the centre can spread far, so you get a thicker, soft-centred cookie with crisp rims"
    : ovenF <= 325
    ? "the slow set lets the dough spread further and dry more evenly, for a flatter, crisper, more uniform cookie"
    : "you get a balanced spread and set";
  steps.push({ title: `Bake — ${ovenF}°F / ${ovenC}°C`, spec: `middle rack · one sheet · ${sc.min}–${sc.max} min · rotate halfway`,
    why: `Bake one sheet on the middle rack and rotate halfway. It's a race between spreading and setting: at ${ovenF}°F ${setVsSpread}. Pull them when the edges are set and golden but the centres still look slightly underdone — they finish on the sheet. Browning is Maillard (proteins + reducing sugars) plus sugar caramelization, both steeply temperature-dependent (McGee).`,
    more: `Convection bakes faster and spreads more — drop 15–25°F. For dense, fudgy, rippled centres, rap the sheet on the counter once or twice mid-bake to deflate them.${p.styleId === "snicker" || p.styleId === "sugar" ? " Keep these pale — pull before they colour." : ""}` });

  // Cool
  const finishLine = finishers.length
    ? ` ${finishers.map((t) => t.icon + " " + t.label.replace(" (finish)", "")).join(" + ")} goes on now, while the tops are warm and tacky enough to hold it.`
    : "";
  steps.push({ title: "Cool on the sheet, then move", spec: "5 min on the hot sheet · then a wire rack",
    why: `Let them sit 5 minutes on the hot sheet: carryover heat finishes the underdone centre and the cookie sets enough to lift without tearing. Then move to a rack so the bottoms don't steam soft against the pan.${finishLine}`,
    more: "For the chewiest result, underbake slightly and let the carryover do the rest. They keep best airtight; a slice of bread in the tub keeps soft cookies soft." });

  return steps.map((s, i) => ({ ...s, n: String(i + 1).padStart(2, "0") }));
}

// ---------------------------------------------------------------------------
export default function CookieBuildSheet() {
  const D0 = STYLE_BY_ID[DEFAULT_STYLE].set;
  // master scale
  const [flourG, setFlourG] = useState(280);
  // quality dials (initialised from the default style)
  const [sugarPct, setSugarPct] = useState(D0.sugarPct);
  const [brownPct, setBrownPct] = useState(D0.brownPct);
  const [butterPct, setButterPct] = useState(D0.butterPct);
  const [eggPct, setEggPct] = useState(D0.eggPct);
  const [flourIdx, setFlourIdx] = useState(D0.flourIdx);
  const [leaven, setLeaven] = useState(D0.leaven);
  const [sodaShare, setSodaShare] = useState(D0.sodaShare);
  const [saltPct, setSaltPct] = useState(D0.saltPct);
  const [chillIdx, setChillIdx] = useState(D0.chillIdx);
  const [ovenF, setOvenF] = useState(D0.ovenF);
  // method / form / scoop
  const [method, setMethod] = useState(D0.method);
  const [eggForm, setEggForm] = useState(D0.eggForm);
  const [scoop, setScoop] = useState(D0.scoop);
  // add-ins + cocoa
  const [addinSel, setAddinSel] = useState({ chips: true, flakysalt: true });
  const [cocoaMode, setCocoaMode] = useState("natural"); // natural | dutch
  const [cocoaPct, setCocoaPct] = useState(25);           // cocoa as % of flour
  const [prepDone, setPrepDone] = useState({});           // mise-en-place checklist
  const [verbosity, setVerbosity] = useState(1);
  const [dark, setDark] = useState(false);
  const [openStep, setOpenStep] = useState("01");
  const [special, setSpecial] = useState(null);           // a fixed recipe, or null

  const C = dark ? THEMES.dark : THEMES.light;

  function applyStyle(id) {
    const s = STYLE_BY_ID[id];
    if (!s) return;
    setSpecial(null);
    const k = s.set;
    setSugarPct(k.sugarPct); setBrownPct(k.brownPct); setButterPct(k.butterPct);
    setEggPct(k.eggPct); setFlourIdx(k.flourIdx); setLeaven(k.leaven);
    setSodaShare(k.sodaShare); setSaltPct(k.saltPct); setChillIdx(k.chillIdx);
    setOvenF(k.ovenF); setMethod(k.method); setEggForm(k.eggForm); setScoop(k.scoop);
    // double-choc implies the cocoa swap is on
    if (id === "doublechoc") setAddinSel((t) => ({ ...t, cocoa: true }));
  }
  function applySpecial(id) { setSpecial(id); setOpenStep("01"); }
  const toggleAddin = (id) => setAddinSel((t) => ({ ...t, [id]: !t[id] }));
  const togglePrep = (key) => setPrepDone((p) => ({ ...p, [key]: !p[key] }));
  const activeStyle = matchStyle({ sugarPct, brownPct, butterPct, eggPct, flourIdx, leaven, sodaShare, saltPct, chillIdx, ovenF, method });
  const selectedAddins = ADDINS.filter((a) => addinSel[a.id]);

  const f = Math.max(0, Number(flourG) || 0);
  const flour = FLOURS[flourIdx];
  const chill = CHILLS[chillIdx];

  // Cocoa swaps 1:1 for flour — pulls down the gluten-forming flour and shifts pH.
  const cocoaOn = !!addinSel.cocoa;
  const cocoaPctEff = cocoaOn ? cocoaPct : 0;
  const cocoaLoad = f * (cocoaPctEff / 100);
  const effFlour = f - cocoaLoad;                 // the flour left to build structure
  const cocoa = { on: cocoaOn, mode: cocoaMode, pct: cocoaPct, load: cocoaLoad, effFlour };

  const v = useMemo(() => {
    const totalSugar = f * (sugarPct / 100);
    const brown = totalSugar * (brownPct / 100);
    const white = totalSugar - brown;
    const butter = f * (butterPct / 100);
    const egg = f * (eggPct / 100);
    const salt = f * (saltPct / 100);
    const soda = leaven ? f * (SODA_MAX / 100) * (sodaShare / 100) : 0;
    const powder = leaven ? f * (POWDER_MAX / 100) * (1 - sodaShare / 100) : 0;
    const chips = addinSel.chips ? f * (CHIPS_PCT / 100) : 0;
    const flourMass = f - cocoaLoad;
    const doughWeight = flourMass + cocoaLoad + totalSugar + butter + egg + soda + powder + chips;
    return { totalSugar, brown, white, butter, egg, salt, soda, powder, chips, flourMass, doughWeight };
  }, [f, sugarPct, brownPct, butterPct, eggPct, saltPct, leaven, sodaShare, addinSel.chips, cocoaLoad]);

  const specialDef = special ? SPECIAL_BY_ID[special] : null;
  const specialRecipe = useMemo(() => (specialDef ? specialDef.recipe(f) : null), [special, f]);

  const sodaPct = leaven ? round(SODA_MAX * (sodaShare / 100), 2) : 0;
  const powderPct = leaven ? round(POWDER_MAX * (1 - sodaShare / 100), 2) : 0;
  const eggCount = v.egg > 0 ? round(v.egg / EGG_G, 1) : 0;

  const dialGroups = [
    { title: "Dough", items: [
      { k: `Flour — ${flour.name.toLowerCase()}`, g: round(v.flourMass), pct: round(100 - cocoaPctEff, 1), note: flour.prot },
      ...(cocoaOn ? [{ k: `Cocoa — ${cocoaMode}`, g: round(cocoaLoad), pct: round(cocoaPctEff, 1), accent: true, note: "swapped in for flour" }] : []),
      { k: "White sugar", g: round(v.white), pct: round(sugarPct * (1 - brownPct / 100), 1), note: "spread & crisp · caramelizes" },
      ...(v.brown > 0 ? [{ k: "Brown sugar", g: round(v.brown), pct: round(sugarPct * (brownPct / 100), 1), accent: true, note: "molasses · moisture · chew" }] : []),
      { k: `Butter — ${METHODS[method].label.toLowerCase().replace(" (one-bowl)", "")}`, g: round(v.butter), pct: round(butterPct, 1), note: METHODS[method].short },
      ...(eggPct > 0 ? [{ k: `Egg — ${EGG_FORMS[eggForm].label.toLowerCase()}`, g: round(v.egg), pct: round(eggPct, 1), note: `~${eggCount} large · ${EGG_FORMS[eggForm].short}` }] : []),
      ...(leaven && v.soda > 0 ? [{ k: "Baking soda", g: round(v.soda, 1), pct: sodaPct, accent: true, note: "needs acid · browns & spreads" }] : []),
      ...(leaven && v.powder > 0 ? [{ k: "Baking powder", g: round(v.powder, 1), pct: powderPct, note: "self-acting · puffs & pales" }] : []),
      ...(!leaven ? [{ k: "Chemical leavening", g: null, pct: null, note: "none — short/shortbread style" }] : []),
      { k: "Salt", g: round(v.salt, 1), pct: round(saltPct, 1), note: "seasons · sharpens the sweet" },
      { k: "Vanilla", g: null, pct: null, note: "1–2 tsp, to taste" },
    ] },
    ...(selectedAddins.some((a) => !a.finish && a.id !== "cocoa") ? [{ title: "Add-ins", caption: "folded into the dough", items: selectedAddins.filter((a) => !a.finish && a.id !== "cocoa").map((t) => (
      t.id === "chips"
        ? { k: `${t.icon} ${t.label}`, g: round(v.chips), pct: CHIPS_PCT, accent: true, note: t.short }
        : { k: `${t.icon} ${t.label}`, g: null, pct: null, note: t.short }
    )) }] : []),
    ...(selectedAddins.some((a) => a.finish) ? [{ title: "Finish", caption: "on top, at or after the bake", brine: true, items: selectedAddins.filter((a) => a.finish).map((t) => (
      { k: `${t.icon} ${t.label.replace(" (finish)", "")}`, g: null, pct: null, accent: true, note: t.short }
    )) }] : []),
  ];

  const sc = SCOOPS[scoop];
  const cookieCount = v.doughWeight > 0 ? Math.max(1, Math.floor(v.doughWeight / sc.g)) : 0;
  const dialSteps = useMemo(() => buildSteps({ method, eggForm, leaven, sugarPct, brownPct, butterPct, eggPct, flour, chill, chillIdx, sodaShare, ovenF, scoop, addins: selectedAddins, cocoa, verbosity, styleId: activeStyle }),
    [method, eggForm, leaven, sugarPct, brownPct, butterPct, eggPct, flourIdx, chillIdx, sodaShare, ovenF, scoop, addinSel, cocoaOn, cocoaMode, cocoaPct, verbosity, activeStyle]);

  // Live profile chips
  const spreadScore = (sugarPct - 70) * 0.5 + (butterPct - 55) * 0.6
    + (method === "melted" ? 8 : method === "browned" ? -2 : method === "sable" ? -6 : 0)
    - chillIdx * 4 - (ovenF - 350) * 0.12 - (flourIdx - 2) * 4 - (leaven ? 0 : 4);
  const dialProfile = [
    spreadScore > 14 ? "thin & lacy" : spreadScore > 4 ? "moderate spread" : spreadScore > -6 ? "holds its shape" : "thick & domed",
    method === "sable" || flourIdx <= 1 ? "short & sandy crumb" : (brownPct >= 55 && (eggForm === "yolk" || method !== "creamed")) ? "soft, bendy chew" : (sugarPct >= 100 && brownPct <= 25) ? "crisp & snappy" : method === "creamed" && flourIdx <= 1 ? "light & cakey" : "tender crumb",
    sugarPct >= 100 ? "candy-sweet" : sugarPct <= 65 ? "barely sweet" : "balanced sweet",
    (sodaShare >= 60 && leaven) || brownPct >= 70 || chillIdx === 3 ? "deeply browned" : (!leaven || sodaShare <= 20) ? "pale & blond" : "golden",
    butterPct >= 70 ? "very rich" : butterPct <= 50 ? "lean" : "buttery",
    ...(cocoaOn ? ["deep cocoa"] : []),
    ...(brownPct >= 90 ? ["molasses-dark"] : []),
    ...(selectedAddins.some((a) => a.id === "flakysalt") ? ["salt-finished"] : []),
    ...(chillIdx === 3 ? ["toffee-deep (long cure)"] : []),
  ];

  // A fixed recipe overrides the dial-driven output.
  const groups = specialRecipe ? specialRecipe.groups : dialGroups;
  const STEPS = specialRecipe ? specialRecipe.steps : dialSteps;
  const profile = specialRecipe ? specialRecipe.profile : dialProfile;
  const showWhy = verbosity >= 1;
  const ovenC = fToC(ovenF);

  return (
    <ThemeCtx.Provider value={C}>
    <div style={{ background: C.paper, minHeight: "100vh", padding: "28px 16px 60px", fontFamily: "'Fraunces', serif", color: C.ink, colorScheme: dark ? "dark" : "light", backgroundImage: C.glow, transition: "background .25s ease, color .25s ease" }}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", animation: "riseIn .5s ease" }}>
        {/* Header */}
        <div style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 14, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: -1, lineHeight: 0.95 }}>Cookies</h1>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, textAlign: "right", color: C.inkSoft, lineHeight: 1.5 }}>
            <span style={{ color: C.choc, fontWeight: 600 }}>{specialDef ? specialDef.name : activeStyle === "custom" ? "Custom build" : STYLE_BY_ID[activeStyle].name}</span><br />
            {specialRecipe ? `fixed recipe · ${specialRecipe.clock}` : `${sugarPct}% sugar · ${chill.clock}`}
          </div>
        </div>

        {/* Style selector */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.choc, fontWeight: 600, margin: "2px 2px 10px" }}>
            <span>Style</span>
            {activeStyle === "custom" && !special && <span style={{ color: C.inkSoft, letterSpacing: 1 }}>custom · off-preset</span>}
          </div>
          {STYLE_CATS.map((cat) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.inkSoft, fontWeight: 600, margin: "0 2px 6px" }}>{cat}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                {STYLES.filter((s) => s.cat === cat).map((s) => {
                  const on = !special && activeStyle === s.id;
                  return (
                    <button key={s.id} onClick={() => applyStyle(s.id)} style={{
                      display: "flex", gap: 9, alignItems: "flex-start", textAlign: "left", cursor: "pointer",
                      borderRadius: 11, padding: "11px 12px", transition: "all .15s ease", fontFamily: "'Fraunces', serif",
                      border: `1.5px solid ${on ? C.butter : C.line}`, background: on ? C.butter : C.card, color: on ? C.onAccent : C.ink }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${on ? C.onAccent : C.line}`, flexShrink: 0, marginTop: 2, position: "relative" }}>
                        {on && <span style={{ position: "absolute", inset: 2.5, borderRadius: "50%", background: C.onAccent }} />}
                      </span>
                      <span style={{ lineHeight: 1.25 }}>
                        <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{s.name}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, opacity: 0.8 }}>{s.tag}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Beyond the dials — fixed recipes that don't run off the sliders */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.inkSoft, fontWeight: 600, margin: "0 2px 6px" }}>
              Beyond the dials · fixed recipes
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {SPECIAL_STYLES.map((s) => {
                const on = special === s.id;
                return (
                  <button key={s.id} onClick={() => applySpecial(s.id)} style={{
                    display: "flex", gap: 9, alignItems: "flex-start", textAlign: "left", cursor: "pointer",
                    borderRadius: 11, padding: "11px 12px", transition: "all .15s ease", fontFamily: "'Fraunces', serif",
                    border: `1.5px solid ${on ? C.choc : C.line}`, background: on ? C.choc : C.card, color: on ? C.onAccent : C.ink }}>
                    <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${on ? C.onAccent : C.line}`, flexShrink: 0, marginTop: 2, position: "relative" }}>
                      {on && <span style={{ position: "absolute", inset: 2.5, borderRadius: "50%", background: C.onAccent }} />}
                    </span>
                    <span style={{ lineHeight: 1.25 }}>
                      <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{s.name}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, opacity: 0.8 }}>{s.tag}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.5, color: C.inkSoft, fontStyle: "italic", borderLeft: `3px solid ${special ? C.choc : activeStyle === "custom" ? C.line : C.bake}`, paddingLeft: 12 }}>
            {specialDef
              ? specialDef.blurb
              : activeStyle === "custom"
              ? "Custom — you've tuned the dials off any single tradition. Pick a style above to snap back to a preset."
              : STYLE_BY_ID[activeStyle].blurb}
          </div>
        </div>

        {/* Flour master input */}
        <div style={{ background: C.butterDeep, borderRadius: 14, padding: "20px 22px", color: C.onAccent, marginBottom: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
          <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.8 }}>
            {special === "amaretti" || special === "macaron" ? "Ground almonds — master scale" : "Total flour — master scale"}
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
            <input type="number" value={flourG} min={0} onChange={(e) => setFlourG(e.target.value)}
              style={{ width: 150, fontFamily: "'IBM Plex Mono', monospace", fontSize: 38, fontWeight: 600, background: "transparent", border: "none", borderBottom: `2px solid ${C.bake}`, color: C.onAccent, outline: "none", padding: "2px 0" }} />
            <span style={{ fontSize: 24, opacity: 0.7 }}>grams</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {[170, 250, 280, 360].map((val) => (
              <button key={val} onClick={() => setFlourG(val)}
                style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, padding: "6px 14px", borderRadius: 20, border: `1px solid ${f === val ? C.bake : "rgba(251,243,228,0.35)"}`, background: f === val ? C.bake : "transparent", color: C.onAccent, cursor: "pointer", fontWeight: 600 }}>
                {val}g
              </button>
            ))}
          </div>
        </div>

        {/* Fixed-recipe banner — the dials don't apply here */}
        {special && (
          <div style={{ background: C.mixBg, border: `1.5px solid ${C.choc}`, borderRadius: 12, padding: "12px 15px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, lineHeight: 1.45, color: C.ink }}>
              <strong>{specialDef.name}</strong> is a fixed recipe — it doesn't run off the sliders. Only the master scale, detail and theme apply. The full method is below.
            </span>
            <button onClick={() => applyStyle(DEFAULT_STYLE)} style={{ flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, padding: "7px 13px", borderRadius: 20, border: `1.5px solid ${C.choc}`, background: "transparent", color: C.choc, cursor: "pointer" }}>
              ← back to the dials
            </button>
          </div>
        )}

        {/* The dials (dial-driven styles only) */}
        {!special && <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.choc, fontWeight: 600, margin: "4px 2px 10px" }}>
          <span>The dials</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Dial label="Sugar — total" value={sugarPct} min={45} max={120} step={5}
            onChange={setSugarPct} readout={`${sugarPct}% · ${round(v.totalSugar)}g`} lo="lean / less sweet" hi="rich / candy-sweet"
            why="Sugar as a % of flour. Sugar does far more than sweeten: it melts and dissolves in the heat so the dough flows — more sugar means more spread and a crisper, more caramelized cookie. It also tenderises (competing for water, it interferes with gluten and slows egg set) and fuels browning (McGee; Bressanini, zuccheri)." />
          <Dial label="Brown : white sugar" value={brownPct} min={0} max={100} step={5} accent
            onChange={setBrownPct} readout={brownPct === 0 ? "all white" : brownPct === 100 ? "all brown" : `${brownPct}% brown`} lo="all white / crisp" hi="all brown / chewy"
            why="Brown sugar is white sugar plus molasses — which brings moisture, a little acid, and invert sugar (glucose + fructose). The molasses is hygroscopic, so it holds water and keeps the cookie soft and chewy, and its acidity feeds the baking soda to brown harder. All-white bakes crisper, paler and snappier (McGee, sugars; Bressanini)." />
          <Dial label="Butter — fat" value={butterPct} min={40} max={80} step={5}
            onChange={setButterPct} readout={`${butterPct}% · ${round(v.butter)}g`} lo="lean / firm" hi="rich / spreads"
            why="Fat as a % of flour. Butterfat coats the flour proteins and physically shortens the gluten, so more butter means a more tender, melting crumb — and because it liquefies in the oven, more fat also means more spread. Butter is ~16% water, which hydrates flour and turns to steam for a little lift (Bressanini, burro; McGee, fats)." />
          <Dial label="Egg — bind & lift" value={eggPct} min={0} max={35} step={5}
            onChange={setEggPct} readout={eggPct === 0 ? "none" : `${eggPct}% · ${round(v.egg)}g`} lo="none / sandy" hi="rich / cakey"
            why="Egg as a % of flour. Yolks are fat plus lecithin, an emulsifier, so they bind, enrich and tenderise (chew); whites are protein and water that set into structure and crisp as they dry. More egg overall means a more set, cakier cookie; none at all (shortbread) means a short, sandy one held together by fat (McGee, eggs)." />
          <Dial label="Flour strength" value={flourIdx} min={0} max={3} step={1} stops={["cake", "pastry", "AP", "bread"]}
            onChange={setFlourIdx} readout={`${flour.name} · ${flour.hint}`}
            why="Which flour, by protein. Protein is the raw material for gluten, and gluten is chew and structure: bread flour (high protein) bakes a chewier, sturdier cookie; cake flour (low protein) a tender, short, delicate one. How hard you then mix decides how much of that potential gluten actually forms (Cauvain, Ch.2)." />
          {leaven ? (
            <Dial label="Leavening — soda : powder" value={sodaShare} min={0} max={100} step={10} accent
              onChange={setSodaShare} readout={`${round(v.soda, 1)}g soda · ${round(v.powder, 1)}g powder`} lo="all powder / puffy" hi="all soda / spread"
              why="Baking soda is a pure base: it needs an acid (brown sugar, molasses, natural cocoa) to make CO₂, and it raises the dough's pH — which speeds Maillard browning, weakens gluten for more spread, and bakes a coarser, darker cookie. Baking powder is self-acting and pH-neutral, so it just puffs: a finer, paler, more cake-like lift (McGee, leavening; Bressanini, lievitazione)." />
          ) : (
            <div style={{ background: C.card, border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: "13px 15px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No chemical leavening</div>
              <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45, fontFamily: "'IBM Plex Mono', monospace" }}>
                shortbread/sablé style — rise comes only from steam and any creamed air. Toggle leavening on below to add soda &amp; powder.
              </div>
            </div>
          )}
          <Dial label="Salt" value={saltPct} min={0.4} max={2.4} step={0.1}
            onChange={setSaltPct} readout={`${round(saltPct, 1)}% · ${round(v.salt, 1)}g`} lo="lean" hi="bold"
            why="Salt as a % of flour. Beyond seasoning, salt suppresses bitterness and sharpens the perception of sweetness, so a well-salted cookie tastes more of everything; it also slightly tightens gluten. Brown-butter and chocolate cookies take more salt than pale, delicate ones (McGee)." />
          <Dial label="Chill & rest" value={chillIdx} min={0} max={3} step={1} accent stops={["none", "1 hr", "night", "24–72h"]}
            onChange={setChillIdx} readout={`${chill.name} · ${chill.tag}`}
            why={`The spread-and-flavour axis. Chilling firms the butter so the cookie spreads less and bakes taller; a longer rest also hydrates the flour for an even crumb, and over 24–72 hr enzymes break starch and protein into reducing sugars and free amino acids that brown far deeper — the famous multi-day cookie cure (McGee, browning). Right now: ${chill.short}, ${chill.clock}.`} />
          <Dial label="Oven — temperature" value={ovenF} min={300} max={400} step={25}
            onChange={setOvenF} readout={`${ovenF}°F · ${ovenC}°C`} lo="low / dry & even" hi="hot / set fast"
            why="It's a race between spreading and setting. A hotter oven sets the edges before the centre can spread far, giving a thick, soft-centred cookie with crisp rims; a cooler oven lets it spread and dry evenly into a flatter, crisper one. Browning (Maillard + caramelization) climbs steeply with temperature, so hotter also means darker, faster (McGee)." />
        </div>

        {/* Method + leavening toggle + egg form + scoop */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 12 }}>
          <Segmented label="Mixing method" value={method} onChange={setMethod} sub={METHODS[method].short}
            options={[["creamed", "Creamed"], ["melted", "Melted"], ["browned", "Browned"], ["sable", "Cold-cut"]]} C={C} />
          <Segmented label="Egg richness" value={eggForm} onChange={setEggForm} sub={eggPct === 0 ? "no egg in this build" : EGG_FORMS[eggForm].short}
            options={[["whole", "Whole"], ["yolk", "Yolk-rich"], ["white", "+ Whites"]]} C={C} />
          <Segmented label="Scoop size" value={scoop} onChange={setScoop} sub={`${sc.g}g · ${sc.tag} · ${sc.min}–${sc.max} min bake`}
            options={[["small", "Small"], ["standard", "Standard"], ["bakery", "Bakery"]]} C={C} />
          <Toggle on={leaven} onClick={() => setLeaven((s) => !s)} label="Chemical leavening" sub={leaven ? "baking soda + powder, split by the dial" : "off — shortbread / sablé style"} />
        </div>

        {/* Add-ins */}
        <div style={{ background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 15px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Add-ins & mix-ins</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.inkSoft }}>
              {activeStyle === "custom" ? "pick a style to see what's traditional" : `✓ traditional for ${STYLE_BY_ID[activeStyle].name}`}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            {ADDINS.map((t) => {
              const on = !!addinSel[t.id];
              const trad = activeStyle !== "custom" && t.styles.includes(activeStyle);
              const badge = activeStyle === "custom" ? `classic in ${t.styles.length}` : trad ? "traditional" : "modern twist";
              const badgeCol = trad ? C.butter : C.inkSoft;
              return (
                <button key={t.id} onClick={() => toggleAddin(t.id)} style={{
                  display: "flex", gap: 9, alignItems: "center", textAlign: "left", cursor: "pointer",
                  borderRadius: 10, padding: "9px 11px", transition: "all .15s ease", fontFamily: "'Fraunces', serif",
                  border: `1.5px solid ${on ? C.butter : C.line}`, background: on ? C.butter : "transparent", color: on ? C.onAccent : C.ink }}>
                  <span style={{ width: 17, height: 17, borderRadius: 5, border: `2px solid ${on ? C.onAccent : C.line}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.onAccent, lineHeight: 1 }}>
                    {on ? "✓" : ""}
                  </span>
                  <span style={{ lineHeight: 1.2, flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 14.5 }}>{t.icon} {t.label}</span>
                    <span style={{ display: "block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 600, color: on ? C.onAccent : badgeCol, opacity: on ? 0.85 : 1, letterSpacing: 0.3 }}>
                      {trad ? "✓ " : ""}{badge}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Cocoa swap → effective flour + pH */}
          {cocoaOn && (
            <div style={{ marginTop: 11, background: C.mixBg, border: `1.5px solid ${C.choc}`, borderRadius: 11, padding: "12px 14px", animation: "riseIn .2s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>🟤 Cocoa swap</span>
                <div style={{ display: "flex", gap: 4, background: C.paperDeep, borderRadius: 9, padding: 4 }}>
                  {Object.entries(COCOA_MODES).map(([id, label]) => {
                    const on = cocoaMode === id;
                    return (
                      <button key={id} onClick={() => setCocoaMode(id)} style={{ border: "none", borderRadius: 7, padding: "6px 11px", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, background: on ? C.choc : "transparent", color: on ? C.onAccent : C.inkSoft, transition: "all .15s ease" }}>{label}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.inkSoft, marginBottom: 2 }}>
                <span>cocoa load</span>
                <span style={{ color: C.choc, fontWeight: 600 }}>{cocoaPct}% · {round(cocoaLoad)}g</span>
              </div>
              <input type="range" min={0} max={40} step={5} value={cocoaPct} onChange={(e) => setCocoaPct(Number(e.target.value))} style={{ width: "100%", accentColor: C.choc, margin: "4px 0 8px" }} />
              <div style={{ fontSize: 13, lineHeight: 1.5, color: C.inkSoft }}>
                Cocoa swaps 1:1 for flour, so it pulls the structural flour down to <Num color={C.choc}>{round(effFlour)}g</Num> ({round(100 - cocoaPct, 0)}%) — less gluten, a softer, more spread-prone and drier crumb (cocoa drinks fat &amp; liquid).
                {" "}{cocoaMode === "natural"
                  ? <>Natural cocoa is <Num color={C.choc}>acidic</Num>, so it pairs with the <Num color={C.ink}>baking soda</Num> — the soda neutralises it, browns harder and blooms the colour. Keep the dial soda-leaning.</>
                  : <>Dutched cocoa is alkalised and <Num color={C.choc}>pH-neutral</Num>, so lean on <Num color={C.ink}>baking powder</Num>; with soda alone it tastes flat and over-browns.</>}
              </div>
            </div>
          )}
        </div>

        {/* Mise en place — tickable prep checklist */}
        {selectedAddins.length > 0 && (
          <div style={{ background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 15px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Mise en place — add-in prep</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.inkSoft }}>tick as you go</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.inkSoft, fontStyle: "italic", marginBottom: 10 }}>Get these ready before you mix — soggy or unprepped add-ins throw off the dough.</div>
            {selectedAddins.map((t) => (
              <div key={t.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>{t.icon} {t.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {t.prepSteps.map((step, i) => {
                    const key = `${t.id}:${i}`;
                    const done = !!prepDone[key];
                    return (
                      <button key={key} onClick={() => togglePrep(key)} style={{
                        display: "flex", gap: 9, alignItems: "flex-start", textAlign: "left", cursor: "pointer",
                        background: "transparent", border: "none", padding: "1px 0", fontFamily: "'Fraunces', serif", color: C.ink }}>
                        <span style={{ width: 16, height: 16, borderRadius: 5, border: `2px solid ${done ? C.butter : C.line}`, background: done ? C.butter : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.onAccent, lineHeight: 1, marginTop: 2 }}>{done ? "✓" : ""}</span>
                        <span style={{ fontSize: 13.5, lineHeight: 1.4, color: done ? C.inkSoft : C.ink, textDecoration: done ? "line-through" : "none", opacity: done ? 0.7 : 1 }}>{step}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        </>}

        {/* Display options: verbosity + dark mode */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 15px 11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Recipe detail</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.butter, fontWeight: 600 }}>{VERBOSITY[verbosity]}</span>
            </div>
            <input type="range" min={0} max={2} step={1} value={verbosity} onChange={(e) => setVerbosity(Number(e.target.value))} style={{ width: "100%", accentColor: C.butter, margin: "9px 0 2px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkSoft }}>
              {VERBOSITY.map((lbl, i) => <span key={lbl} style={{ color: i === verbosity ? C.butter : C.inkSoft, fontWeight: i === verbosity ? 600 : 400, flex: 1, textAlign: "center" }}>{lbl.toLowerCase()}</span>)}
            </div>
          </div>
          <Toggle on={dark} onClick={() => setDark((d) => !d)} label={dark ? "Dark mode" : "Light mode"} sub={dark ? "warm charcoal" : "warm cream"} />
        </div>

        {/* Live profile chips */}
        <div style={{ background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 15px", marginBottom: 22 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.inkSoft, fontWeight: 600, marginBottom: 9 }}>
            This build bakes up
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {profile.map((p, i) => (
              <span key={i} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: "5px 11px", borderRadius: 20, background: C.paperDeep, color: C.butter, fontWeight: 600, border: `1px solid ${C.line}` }}>{p}</span>
            ))}
          </div>
        </div>

        {/* Grouped ingredient table */}
        <div style={{ borderRadius: 14, border: `1.5px solid ${C.line}`, overflow: "hidden", marginBottom: 14, background: C.card }}>
          {groups.map((grp, gi) => (
            <div key={grp.title}>
              <div style={{ padding: "11px 18px 9px", background: grp.brine ? C.mixBg : C.paperDeep, borderTop: gi === 0 ? "none" : `1.5px solid ${C.line}` }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, letterSpacing: 1.5, textTransform: "uppercase", color: grp.brine ? C.choc : C.inkSoft, fontWeight: 600 }}>
                  ▸ {grp.title}
                </div>
                {grp.caption && <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2, fontStyle: "italic" }}>{grp.caption}</div>}
              </div>
              {grp.items.map((r, i) => (
                <div key={r.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderTop: i === 0 ? "none" : `1px solid ${C.paperDeep}` }}>
                  <span style={{ fontSize: 16, fontWeight: 500 }}>
                    {r.k}
                    {r.note && <span style={{ display: "block", fontSize: 11, color: C.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{r.note}</span>}
                  </span>
                  <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {r.pct != null && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: r.accent ? C.choc : C.inkSoft, marginRight: 10 }}>{r.pct}%</span>}
                    {r.g != null ? (
                      <>
                        <Num color={r.accent ? C.choc : C.ink}><span style={{ fontSize: 19 }}>{r.g}</span></Num>
                        <span style={{ fontSize: 13, color: C.inkSoft }}> g</span>
                      </>
                    ) : (
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.inkSoft }}>{r.note ? "to taste" : "—"}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Yield summary */}
        <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
          {specialRecipe
            ? specialRecipe.summary.map((c) => (
                <div key={c.label} style={summaryCard(C)}><div style={summaryLabel(C)}>{c.label}</div><div style={{ ...summaryVal(C), fontSize: /\d/.test(c.val) && c.val.length <= 6 ? 22 : 15 }}>{c.val}</div></div>
              ))
            : <>
                <div style={summaryCard(C)}><div style={summaryLabel(C)}>Total dough</div><div style={summaryVal(C)}>{round(v.doughWeight)}g</div></div>
                <div style={summaryCard(C)}><div style={summaryLabel(C)}>{sc.label} cookies</div><div style={summaryVal(C)}>≈{cookieCount}</div></div>
                <div style={summaryCard(C)}><div style={summaryLabel(C)}>Total sugar</div><div style={summaryVal(C)}>{round(v.totalSugar)}g</div></div>
                <div style={summaryCard(C)}><div style={summaryLabel(C)}>Oven</div><div style={{ ...summaryVal(C), fontSize: 17 }}>{ovenF}°F · {sc.min}–{sc.max}m</div></div>
              </>}
        </div>

        {/* Process */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.choc, fontWeight: 600, marginBottom: 12 }}>
          <span>Process{showWhy ? " — tap for the why" : ""}</span>
          <span style={{ color: C.inkSoft, letterSpacing: 1 }}>{specialRecipe ? specialRecipe.clock : `${chill.clock} + bake`}</span>
        </div>

        {STEPS.map((s) => {
          const open = openStep === s.n;
          return (
            <div key={s.n} style={{ border: `1.5px solid ${open && showWhy ? C.butter : C.line}`, borderRadius: 12, marginBottom: 9, overflow: "hidden", background: open && showWhy ? C.card : "transparent", transition: "border-color .18s ease" }}>
              <button onClick={() => setOpenStep(open ? "" : s.n)} style={{ width: "100%", display: "flex", gap: 14, alignItems: "flex-start", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "14px 16px", fontFamily: "'Fraunces', serif", color: C.ink }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: open && showWhy ? C.butter : C.bake, paddingTop: 3 }}>{s.n}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: 19, fontWeight: 600, display: "block" }}>{s.title}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.inkSoft }}>{s.spec}</span>
                </span>
                {showWhy && <span style={{ fontSize: 20, color: C.butter, transform: open ? "rotate(45deg)" : "none", transition: "transform .2s ease", lineHeight: 1, paddingTop: 2 }}>+</span>}
              </button>
              {open && showWhy && (
                <div style={{ padding: "0 16px 16px 44px", fontSize: 15.5, lineHeight: 1.55, color: C.inkSoft, whiteSpace: "pre-line", animation: "riseIn .25s ease" }}>
                  {s.why}{verbosity >= 2 && s.more ? `\n\n${s.more}` : ""}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ textAlign: "center", marginTop: 26, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.inkSoft, letterSpacing: 1, lineHeight: 1.6 }}>
          baker's % locked to flour mass · everything scales live<br />
          science notes drawn from the repo reference corpus
        </div>
      </div>
    </div>
    </ThemeCtx.Provider>
  );
}

// A labelled segmented control (method / egg form / scoop).
function Segmented({ label, value, onChange, options, sub, C }) {
  return (
    <div style={{ background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "11px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
        <div style={{ display: "flex", gap: 4, background: C.paperDeep, borderRadius: 9, padding: 4, flexWrap: "wrap" }}>
          {options.map(([id, lbl]) => {
            const on = value === id;
            return (
              <button key={id} onClick={() => onChange(id)} style={{ border: "none", borderRadius: 7, padding: "6px 11px", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, background: on ? C.butter : "transparent", color: on ? C.onAccent : C.inkSoft, transition: "all .15s ease" }}>{lbl}</button>
            );
          })}
        </div>
      </div>
      {sub && <div style={{ fontSize: 12, color: C.inkSoft, fontFamily: "'IBM Plex Mono', monospace", marginTop: 7 }}>{sub}</div>}
    </div>
  );
}

const summaryCard = (C) => ({ flex: "1 1 130px", background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "13px 16px" });
const summaryLabel = (C) => ({ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.inkSoft, marginBottom: 4 });
const summaryVal = (C) => ({ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: C.butter });
