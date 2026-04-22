// Smart Recipe Scaler - The Best of Brock Cookbook
// Applies non-linear rules per ingredient class so a 2x scale of a stew
// does not double the salt, and halving cookies does not give you 0.5 eggs.
//
// Exposes window.BrockScaler with:
//   parseQty(str)           -> number | NaN
//   formatQty(n)            -> string
//   classify(line)          -> { category, unit, qty, rest }
//   scaleLine(line, ratio)  -> string  (or same line if unparseable)
//   scaleRecipe(text, ratio)-> string
//   readBaseline(el)        -> number (reads data-baseline-yield)

(function (global) {
  'use strict';

  // ---------- Parsing helpers ----------
  var UNI_FRACS = {
    '\u00BC': 0.25, '\u00BD': 0.5, '\u00BE': 0.75,
    '\u2153': 1/3, '\u2154': 2/3, '\u2155': 0.2,
    '\u2156': 0.4, '\u2157': 0.6, '\u2158': 0.8,
    '\u2159': 1/6, '\u215A': 5/6, '\u215B': 0.125,
    '\u215C': 0.375, '\u215D': 0.625, '\u215E': 0.875
  };

  function parseQty(str) {
    if (str == null) return NaN;
    str = String(str).trim();
    if (!str) return NaN;
    for (var uf in UNI_FRACS) {
      if (str.indexOf(uf) >= 0) str = str.replace(uf, ' ' + UNI_FRACS[uf]);
    }
    str = str.replace(/\s+/g, ' ').trim();

    var m = str.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (m) return +m[1] + +m[2] / +m[3];

    m = str.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) return +m[1] / +m[2];

    m = str.match(/^(\d+)\s+([\d.]+)$/);
    if (m) return +m[1] + +m[2];

    var n = parseFloat(str);
    return isNaN(n) ? NaN : n;
  }

  // Choose the closest cooking-friendly fraction for the fractional part.
  var FRACTIONS = [
    [0,    ''],       [1/8,  '\u215B'], [1/4,  '\u00BC'],
    [1/3,  '\u2153'], [3/8,  '\u215C'], [1/2,  '\u00BD'],
    [5/8,  '\u215D'], [2/3,  '\u2154'], [3/4,  '\u00BE'],
    [7/8,  '\u215E'], [1,    '']
  ];

  function snapFraction(frac) {
    var best = FRACTIONS[0], bestD = Math.abs(frac - best[0]);
    for (var i = 1; i < FRACTIONS.length; i++) {
      var d = Math.abs(frac - FRACTIONS[i][0]);
      if (d < bestD) { bestD = d; best = FRACTIONS[i]; }
    }
    return best;
  }

  function formatQty(n) {
    if (!isFinite(n) || n <= 0) return '0';
    // Small counts snap tight; bigger amounts get rounded sensibly.
    if (n >= 20) return String(Math.round(n));
    if (n >= 5)  return String(Math.round(n * 2) / 2).replace(/\.5$/, ' \u00BD');

    var whole = Math.floor(n);
    var frac = n - whole;
    var snap = snapFraction(frac);
    var snapped = snap[0];
    if (snapped === 1) { whole += 1; snap = FRACTIONS[0]; }

    if (whole === 0 && snap[1] === '') {
      // Too small to represent — show two decimals.
      return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    }
    if (whole === 0) return snap[1];
    if (snap[1] === '') return String(whole);
    return whole + ' ' + snap[1];
  }

  // ---------- Ingredient classification ----------
  // Categories and their non-linear exponents. A ratio r is mapped to r^exp.
  // 1.0 = linear. <1 = sub-linear (scales less). >1 = super-linear (rarely used).
  var CATEGORIES = {
    egg:       { exp: 1.00, round: 'whole',  min: 1 },
    salt:      { exp: 0.70, round: 'frac' },
    spice:     { exp: 0.75, round: 'frac' },
    herb:      { exp: 0.80, round: 'frac' },
    leavening: { exp: 0.85, round: 'frac' },
    alcohol:   { exp: 0.85, round: 'frac' },
    aromatic:  { exp: 0.85, round: 'frac' },
    oilfat:    { exp: 0.90, round: 'frac' },
    flour:     { exp: 1.00, round: 'frac' },
    sugar:     { exp: 1.00, round: 'frac' },
    liquid:    { exp: 0.95, round: 'frac' },
    dairy:     { exp: 1.00, round: 'frac' },
    produce:   { exp: 1.00, round: 'whole-soft' },
    meat:      { exp: 1.00, round: 'frac' },
    pantry:    { exp: 1.00, round: 'frac' }
  };

  // Matched against the ingredient line (lowercased, minus leading qty).
  // First match wins.
  var RULES = [
    [/\b(salt|kosher salt|sea salt)\b/,                              'salt'],
    [/\b(baking powder|baking soda|yeast|active dry yeast|instant yeast)\b/, 'leavening'],
    [/\b(pepper|black pepper|white pepper|cayenne|paprika|chili powder|chili flakes|red pepper flakes|cinnamon|nutmeg|clove|cloves of (?!garlic)|cumin|coriander|turmeric|ginger powder|ground ginger|allspice|cardamom|curry powder|garam masala|mustard powder|dry mustard|saffron|vanilla|vanilla extract|almond extract|lemon extract)\b/, 'spice'],
    [/\b(basil|oregano|thyme|rosemary|sage|tarragon|dill|parsley|cilantro|chives|mint|bay leaf|bay leaves|marjoram)\b/, 'herb'],
    [/\b(wine|red wine|white wine|bourbon|whiskey|rum|vodka|tequila|brandy|sherry|vermouth|beer|ale|lager|cognac)\b/, 'alcohol'],
    [/\b(garlic|shallot|scallion|green onion|leek)\b/,               'aromatic'],
    [/\b(onion|celery|carrot)\b/,                                     'aromatic'],
    [/\b(olive oil|vegetable oil|canola oil|peanut oil|sesame oil|butter|ghee|lard|shortening|margarine|coconut oil|avocado oil)\b/, 'oilfat'],
    [/\b(flour|all[- ]purpose flour|bread flour|cake flour|cornmeal|semolina|rye flour)\b/, 'flour'],
    [/\b(sugar|granulated sugar|brown sugar|powdered sugar|confectioner|honey|maple syrup|molasses|agave)\b/, 'sugar'],
    [/\b(egg|eggs|egg white|egg yolk)\b/,                             'egg'],
    [/\b(milk|cream|half and half|buttermilk|yogurt|sour cream|cheese|parmesan|cheddar|mozzarella|ricotta|feta|cream cheese)\b/, 'dairy'],
    [/\b(water|broth|stock|juice|vinegar|soy sauce|worcestershire|tamari|fish sauce|mirin)\b/, 'liquid'],
    [/\b(beef|chicken|pork|lamb|turkey|duck|veal|bacon|sausage|ham|steak|ribs|roast|shrimp|prawn|scallop|lobster|crab|fish|salmon|tuna|cod|halibut|tilapia|tofu|tempeh)\b/, 'meat'],
    [/\b(tomato|potato|sweet potato|yam|eggplant|zucchini|squash|pepper|bell pepper|jalapeno|mushroom|broccoli|cauliflower|cabbage|kale|spinach|lettuce|cucumber|apple|pear|orange|lemon|lime|banana|strawberr|blueberr|raspberr)\b/, 'produce'],
    [/\b(rice|pasta|noodle|macaroni|spaghetti|penne|linguine|fettuccine|couscous|quinoa|barley|oats|oat|lentil|bean|chickpea)\b/, 'pantry']
  ];

  function classify(line) {
    var low = line.toLowerCase();
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(low)) return RULES[i][1];
    }
    return 'pantry';
  }

  // ---------- Unit-aware rounding ----------
  // Keep numbers cooks would actually write.
  function roundWhole(n, min) {
    n = Math.max(min || 0, Math.round(n));
    return n;
  }

  function roundSmart(n, kind) {
    if (kind === 'whole')      return Math.max(1, Math.round(n));
    if (kind === 'whole-soft') {
      // Pieces of produce: 1 apple, 2 apples. Round half-up, keep halves for big items.
      if (n < 1) return Math.round(n * 2) / 2 || 0.5;
      if (n < 4) return Math.round(n * 2) / 2;
      return Math.round(n);
    }
    // 'frac' — snap to the nearest cooking fraction via formatQty's logic.
    // We return a number; formatQty handles display.
    return n;
  }

  // Scale a single quantity with the category's rule.
  function scaleQty(qty, ratio, category, unit) {
    var rule = CATEGORIES[category] || CATEGORIES.pantry;

    // Spices & salt: sub-linear, but ratios near 1 should still round-trip.
    var effective = Math.pow(ratio, rule.exp);

    // When scaling up a pinch of salt 2x, don't blow it out; when scaling
    // down, don't drop below a meaningful floor.
    var scaled = qty * effective;

    // Minimum floor for tiny amounts of salt/spices/leavening.
    if ((category === 'salt' || category === 'spice' || category === 'leavening') && ratio < 1) {
      var floor = Math.max(qty * 0.25, 1/16);
      if (scaled < floor) scaled = floor;
    }

    // Eggs: round to whole unless we're in tiny territory.
    if (category === 'egg') {
      if (scaled < 0.4) return 0;            // drop it
      if (scaled < 0.8) return 0.5;          // half-egg (beat & measure)
      return roundWhole(scaled, rule.min);
    }

    // Produce counted in pieces (no unit) vs by weight (lb/oz) — unit disambiguates.
    if (category === 'produce' && !unit) {
      return roundSmart(scaled, 'whole-soft');
    }

    return roundSmart(scaled, rule.round);
  }

  // ---------- Line parsing ----------
  // Grab a leading quantity token: digits, unicode fractions, slashes, mixed.
  var QTY_RE = /^([\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*\/\s*\d+)?(?:\s+[\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*\/\s*\d+)?)?)(\s+)(.*)/;

  // A range: "4–6 servings", "3-4 cups" -> scale both endpoints.
  var RANGE_RE = /^([\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*\/\s*\d+)?)\s*[\u2013\u2014-]\s*([\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*\/\s*\d+)?)(\s+)(.*)/;

  // Known unit words (for classify + produce disambiguation).
  var UNIT_RE = /^(tsp|teaspoons?|tbsp|tablespoons?|cups?|c\.|oz|ounces?|lb|lbs|pounds?|g|gram(s)?|kg|ml|mL|l|liter(s)?|pint(s)?|pt|quart(s)?|qt|gallon(s)?|gal|clove(s)?|head(s)?|stick(s)?|pinch(es)?|dash(es)?|can(s)?|jar(s)?|package(s)?|pkg|bunch(es)?|sprig(s)?|leaf|leaves|slice(s)?|piece(s)?|sheet(s)?|stalk(s)?|rib(s)?|cubes?|dozen)\b/i;

  function scaleLine(line, ratio) {
    var original = line;
    var leading = line.match(/^(\s*)/)[1];
    line = line.replace(/^\s+/, '');

    if (!line) return original;

    // Skip obvious headers/instructions
    if (/^[A-Z][^a-z]{0,30}$/.test(line) && line.length < 40) return original;

    // Try range first
    var rm = line.match(RANGE_RE);
    if (rm) {
      var a = parseQty(rm[1]), b = parseQty(rm[2]);
      if (!isNaN(a) && !isNaN(b)) {
        var rest = rm[4];
        var unit = (rest.match(UNIT_RE) || [])[0] || '';
        var cat = classify(rest);
        var sa = scaleQty(a, ratio, cat, unit);
        var sb = scaleQty(b, ratio, cat, unit);
        return leading + formatQty(sa) + '\u2013' + formatQty(sb) + rm[3] + rest;
      }
    }

    var m = line.match(QTY_RE);
    if (!m) return original;

    var qty = parseQty(m[1]);
    if (isNaN(qty)) return original;

    var after = m[3];
    var unit = (after.match(UNIT_RE) || [])[0] || '';
    var cat = classify(after);
    var scaled = scaleQty(qty, ratio, cat, unit);

    if (scaled === 0) {
      return leading + '(omit) ' + after;
    }
    return leading + formatQty(scaled) + m[2] + after;
  }

  function scaleRecipe(text, ratio) {
    if (!text) return '';
    var lines = text.split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) out.push(scaleLine(lines[i], ratio));
    return out.join('\n');
  }

  function readBaseline(el) {
    if (!el) return NaN;
    var v = el.getAttribute('data-baseline-yield');
    var n = parseFloat(v);
    return isNaN(n) ? NaN : n;
  }

  global.BrockScaler = {
    parseQty: parseQty,
    formatQty: formatQty,
    classify: classify,
    scaleLine: scaleLine,
    scaleRecipe: scaleRecipe,
    readBaseline: readBaseline,
    CATEGORIES: CATEGORIES
  };
}(typeof window !== 'undefined' ? window : this));
