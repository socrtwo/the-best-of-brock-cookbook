// Shopping List — The Best of Brock Cookbook
// Aggregates ingredients from multiple recipes, groups by category,
// combines compatible units, and lets the cook tick off what they
// already have.
//
// Relies on BrockScaler (Scaler.js) for ingredient classification and
// quantity parsing.

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var recipes = [];   // [{ id, name, raw }]
  var have = {};      // { itemKey: true } — user already has this
  var nextRid = 1;

  // ---- Ingredient parsing ----
  // Returns { qty, unit, name, raw } or null for non-ingredient lines.
  var UNIT_MAP = {
    'tsp': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp',
    'tbsp': 'tbsp', 'tbsps': 'tbsp', 'tablespoon': 'tbsp', 'tablespoons': 'tbsp',
    'cup': 'cup', 'cups': 'cup', 'c': 'cup',
    'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz',
    'lb': 'lb', 'lbs': 'lb', 'pound': 'lb', 'pounds': 'lb',
    'g': 'g', 'gram': 'g', 'grams': 'g',
    'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
    'ml': 'ml', 'milliliter': 'ml', 'milliliters': 'ml',
    'l': 'l', 'liter': 'l', 'liters': 'l',
    'pint': 'pint', 'pints': 'pint', 'pt': 'pint',
    'quart': 'quart', 'quarts': 'quart', 'qt': 'quart',
    'gallon': 'gallon', 'gallons': 'gallon', 'gal': 'gallon',
    'clove': 'clove', 'cloves': 'clove',
    'head': 'head', 'heads': 'head',
    'stick': 'stick', 'sticks': 'stick',
    'pinch': 'pinch', 'pinches': 'pinch',
    'dash': 'dash', 'dashes': 'dash',
    'can': 'can', 'cans': 'can',
    'jar': 'jar', 'jars': 'jar',
    'package': 'package', 'packages': 'package', 'pkg': 'package',
    'bunch': 'bunch', 'bunches': 'bunch',
    'sprig': 'sprig', 'sprigs': 'sprig',
    'slice': 'slice', 'slices': 'slice',
    'piece': 'piece', 'pieces': 'piece',
    'stalk': 'stalk', 'stalks': 'stalk',
    'rib': 'rib', 'ribs': 'rib',
    'dozen': 'dozen'
  };

  var VOLUME_TO_ML = {
    tsp: 4.929, tbsp: 14.787, cup: 236.588,
    pint: 473.176, quart: 946.353, gallon: 3785.41,
    ml: 1, l: 1000
  };
  var WEIGHT_TO_G = { oz: 28.3495, lb: 453.592, g: 1, kg: 1000 };

  function parseLine(raw) {
    var line = raw.trim();
    if (!line) return null;

    // Skip clearly non-ingredient text (headers, instructions).
    if (/^[a-z][^:]*:\s*$/i.test(line)) return null;
    if (line.length < 3) return null;

    var S = window.BrockScaler;
    var qty = NaN;
    var rest = line;
    var qtyMatch = line.match(
      /^([\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*\/\s*\d+)?(?:\s+[\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*\/\s*\d+)?)?)\s+(.*)/
    );
    if (qtyMatch && S) {
      qty = S.parseQty(qtyMatch[1]);
      rest = qtyMatch[2];
    }

    var unit = '';
    var name = rest;
    var unitMatch = rest.match(/^([A-Za-z]+\.?)\s+(.*)/);
    if (unitMatch) {
      var candidate = unitMatch[1].toLowerCase().replace(/\.$/, '');
      if (UNIT_MAP[candidate]) {
        unit = UNIT_MAP[candidate];
        name = unitMatch[2];
      }
    }

    name = normalizeName(name);
    if (!name) return null;

    return {
      qty: isNaN(qty) ? null : qty,
      unit: unit,
      name: name,
      raw: raw.trim(),
      category: S ? S.classify(name) : 'pantry'
    };
  }

  function normalizeName(n) {
    if (!n) return '';
    // Drop parentheticals and trailing notes.
    n = n.replace(/\([^)]*\)/g, '');
    n = n.replace(/,.*$/, '');
    n = n.replace(/\s+(freshly|finely|coarsely|roughly|thinly|thickly)\s+(chopped|sliced|diced|minced|grated|ground|cubed|shredded|crushed)$/i, '');
    n = n.replace(/\s+(chopped|sliced|diced|minced|grated|ground|cubed|shredded|crushed|peeled|drained|softened|melted|beaten|divided|to taste)$/i, '');
    n = n.replace(/^(fresh|dried|large|small|medium|lg|sm|md)\s+/i, '');
    n = n.replace(/\s+/g, ' ').trim().toLowerCase();
    // Singularize last word (crude).
    if (/s$/i.test(n) && !/ss$/i.test(n) && n !== 'peas' && n !== 'oats') {
      n = n.replace(/s$/i, '');
    }
    return n;
  }

  // ---- Aggregation ----
  function aggregate() {
    var bucket = {};   // key -> { name, category, parts:[{qty, unit}], rawList:[] }
    recipes.forEach(function (r) {
      var lines = (r.raw || '').split(/\r?\n/);
      lines.forEach(function (l) {
        var it = parseLine(l);
        if (!it) return;
        var key = it.name;
        if (!bucket[key]) {
          bucket[key] = { name: it.name, category: it.category, parts: [], rawList: [] };
        }
        bucket[key].parts.push({ qty: it.qty, unit: it.unit });
        bucket[key].rawList.push({ recipe: r.name, raw: it.raw });
      });
    });

    var out = [];
    for (var k in bucket) out.push(summarize(bucket[k]));
    // Sort: category then name
    var catOrder = ['produce', 'meat', 'dairy', 'pantry', 'flour', 'sugar', 'oilfat',
                    'liquid', 'alcohol', 'aromatic', 'herb', 'spice', 'salt',
                    'leavening', 'egg'];
    out.sort(function (a, b) {
      var ai = catOrder.indexOf(a.category); if (ai < 0) ai = 99;
      var bi = catOrder.indexOf(b.category); if (bi < 0) bi = 99;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  function summarize(entry) {
    // Merge parts with compatible units.
    var vol = 0, wgt = 0, count = 0, other = {}, hasCount = false;
    entry.parts.forEach(function (p) {
      if (p.qty == null) { count += 1; hasCount = true; return; }
      if (VOLUME_TO_ML[p.unit]) vol += p.qty * VOLUME_TO_ML[p.unit];
      else if (WEIGHT_TO_G[p.unit]) wgt += p.qty * WEIGHT_TO_G[p.unit];
      else if (!p.unit) { count += p.qty; hasCount = true; }
      else other[p.unit] = (other[p.unit] || 0) + p.qty;
    });

    var bits = [];
    if (vol > 0) bits.push(fmtVolume(vol));
    if (wgt > 0) bits.push(fmtWeight(wgt));
    for (var u in other) bits.push(fmtQty(other[u]) + ' ' + u + (other[u] === 1 ? '' : (u === 'stick' ? 's' : 's')));
    if (hasCount && count > 0) bits.push(fmtQty(count));

    return {
      name: entry.name,
      category: entry.category,
      summary: bits.join(' + '),
      rawList: entry.rawList
    };
  }

  function fmtQty(n) {
    if (window.BrockScaler) return window.BrockScaler.formatQty(n);
    return String(Math.round(n * 100) / 100);
  }
  function fmtVolume(ml) {
    // Prefer cups if >= 240ml, tbsp/tsp otherwise.
    if (ml >= VOLUME_TO_ML.cup * 0.9) return fmtQty(ml / VOLUME_TO_ML.cup) + ' cup' + (ml / VOLUME_TO_ML.cup > 1.01 ? 's' : '');
    if (ml >= VOLUME_TO_ML.tbsp * 0.9) return fmtQty(ml / VOLUME_TO_ML.tbsp) + ' tbsp';
    return fmtQty(ml / VOLUME_TO_ML.tsp) + ' tsp';
  }
  function fmtWeight(g) {
    if (g >= WEIGHT_TO_G.lb * 0.9) return fmtQty(g / WEIGHT_TO_G.lb) + ' lb';
    return fmtQty(g / WEIGHT_TO_G.oz) + ' oz';
  }

  // ---- Rendering ----
  var CATEGORY_LABELS = {
    produce: 'Produce', meat: 'Meat & Seafood', dairy: 'Dairy & Eggs',
    pantry: 'Pantry', flour: 'Baking', sugar: 'Sweeteners', oilfat: 'Oils & Fats',
    liquid: 'Liquids', alcohol: 'Wine & Spirits', aromatic: 'Aromatics',
    herb: 'Fresh Herbs', spice: 'Spices', salt: 'Salt', leavening: 'Leavening',
    egg: 'Eggs'
  };

  function renderRecipes() {
    var host = $('recipe-cards');
    if (!recipes.length) {
      host.innerHTML = '<p class="shop-empty">Add your first recipe below.</p>';
    } else {
      host.innerHTML = recipes.map(function (r) {
        return '<div class="shop-recipe" data-rid="' + r.id + '">' +
               '  <div class="shop-recipe-head">' +
               '    <input class="shop-recipe-name" type="text" value="' + escapeAttr(r.name) + '" data-rid="' + r.id + '" data-field="name" placeholder="Recipe name"/>' +
               '    <button class="tool-btn tool-btn-sm tool-btn-danger" data-rid="' + r.id + '" data-act="del" type="button">Remove</button>' +
               '  </div>' +
               '  <textarea class="tool-textarea shop-recipe-ings" rows="6" data-rid="' + r.id + '" data-field="raw" placeholder="Paste ingredients, one per line">' + escapeHtml(r.raw) + '</textarea>' +
               '</div>';
      }).join('');
    }
  }

  function renderList() {
    var items = aggregate();
    var count = $('shop-count');
    var host = $('shop-list');
    var card = $('resultCard');

    if (!items.length) {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'block';

    // Group by category
    var groups = {};
    items.forEach(function (it) {
      (groups[it.category] = groups[it.category] || []).push(it);
    });

    var needCount = 0, haveCount = 0;
    items.forEach(function (it) { if (have[it.name]) haveCount++; else needCount++; });
    count.innerHTML = '<strong>' + needCount + '</strong> to buy &middot; ' +
                      '<strong>' + haveCount + '</strong> already have &middot; ' +
                      '<strong>' + items.length + '</strong> total';

    var html = '';
    Object.keys(groups).sort(function (a, b) {
      var order = ['produce','meat','dairy','egg','pantry','flour','sugar','oilfat',
                   'liquid','alcohol','aromatic','herb','spice','salt','leavening'];
      var ai = order.indexOf(a), bi = order.indexOf(b);
      if (ai < 0) ai = 99; if (bi < 0) bi = 99;
      return ai - bi;
    }).forEach(function (cat) {
      html += '<div class="shop-group"><h3 class="shop-group-title">' + (CATEGORY_LABELS[cat] || cat) + '</h3><ul class="shop-items">';
      groups[cat].forEach(function (it) {
        var checked = have[it.name] ? 'checked="checked"' : '';
        var cls = have[it.name] ? 'shop-item shop-have' : 'shop-item';
        var tag = it.rawList.length > 1 ? ' <span class="shop-tag">' + it.rawList.length + ' recipes</span>' : '';
        html += '<li class="' + cls + '">' +
                '  <label>' +
                '    <input type="checkbox" data-name="' + escapeAttr(it.name) + '" ' + checked + '/>' +
                '    <span class="shop-item-qty">' + escapeHtml(it.summary || '') + '</span>' +
                '    <span class="shop-item-name">' + escapeHtml(it.name) + '</span>' +
                     tag +
                '  </label>' +
                '</li>';
      });
      html += '</ul></div>';
    });
    host.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ---- Event handlers ----
  function addRecipe(preset) {
    var r = { id: nextRid++, name: (preset && preset.name) || 'Recipe ' + nextRid, raw: (preset && preset.raw) || '' };
    recipes.push(r);
    renderRecipes();
    // Focus the new textarea
    setTimeout(function () {
      var last = document.querySelector('[data-rid="' + r.id + '"][data-field="name"]');
      if (last) last.focus();
    }, 0);
  }

  function onEditRecipe(e) {
    var t = e.target;
    var rid = t.getAttribute && t.getAttribute('data-rid');
    var field = t.getAttribute && t.getAttribute('data-field');
    if (!rid || !field) return;
    var r = recipes.find(function (x) { return String(x.id) === String(rid); });
    if (!r) return;
    r[field] = t.value;
    renderList();
  }

  function onClickRecipe(e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-act') === 'del') {
      var rid = t.getAttribute('data-rid');
      recipes = recipes.filter(function (x) { return String(x.id) !== String(rid); });
      renderRecipes();
      renderList();
    }
  }

  function onListChange(e) {
    var t = e.target;
    if (t.tagName !== 'INPUT' || t.type !== 'checkbox') return;
    var name = t.getAttribute('data-name');
    if (t.checked) have[name] = true; else delete have[name];
    // Toggle class without full rerender for snappiness.
    var li = t.closest ? t.closest('.shop-item') : t.parentNode.parentNode;
    if (li) li.className = 'shop-item' + (t.checked ? ' shop-have' : '');
    updateCountLine();
  }

  function updateCountLine() {
    var items = aggregate();
    var needCount = 0, haveCount = 0;
    items.forEach(function (it) { if (have[it.name]) haveCount++; else needCount++; });
    $('shop-count').innerHTML = '<strong>' + needCount + '</strong> to buy &middot; ' +
                                '<strong>' + haveCount + '</strong> already have &middot; ' +
                                '<strong>' + items.length + '</strong> total';
  }

  function clearHave() {
    have = {};
    renderList();
  }

  function clearAll() {
    recipes = [];
    have = {};
    renderRecipes();
    renderList();
  }

  function copyList() {
    var items = aggregate().filter(function (it) { return !have[it.name]; });
    var lines = items.map(function (it) {
      return (it.summary ? it.summary + ' ' : '') + it.name;
    });
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    flashBtn('btn-copy', 'Copied!');
  }

  function printList() { window.print(); }

  function flashBtn(id, msg) {
    var b = $(id);
    if (!b) return;
    var prev = b.innerHTML;
    b.innerHTML = msg;
    setTimeout(function () { b.innerHTML = prev; }, 1200);
  }

  // Preload from ?recipes=... URL param or from a per-recipe "add to shopping list" link.
  function preload() {
    var q = (window.location.search || '').replace(/^\?/, '');
    if (!q) return;
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var k = decodeURIComponent(kv[0]);
      var v = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      if (k === 'add') {
        // ?add=RecipeName|ing1\ning2
        var pipe = v.indexOf('|');
        if (pipe > 0) addRecipe({ name: v.slice(0, pipe), raw: v.slice(pipe + 1) });
      }
    }
  }

  function onReady() {
    $('btn-add-recipe').addEventListener('click', function () { addRecipe(); });
    $('recipe-cards').addEventListener('input', onEditRecipe);
    $('recipe-cards').addEventListener('click', onClickRecipe);
    $('shop-list').addEventListener('change', onListChange);
    $('btn-copy').addEventListener('click', copyList);
    $('btn-print').addEventListener('click', printList);
    $('btn-clear-have').addEventListener('click', clearHave);
    $('btn-clear-all').addEventListener('click', clearAll);

    preload();
    if (!recipes.length) addRecipe();  // Start with one empty slot
    renderList();
  }

  // Legacy hook
  window.createList = function () { renderList(); };
  window.clearShoppingList = clearAll;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}());
