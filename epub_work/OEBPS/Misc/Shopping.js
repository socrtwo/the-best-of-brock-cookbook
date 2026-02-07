// Shopping List - The Best of Brock Cookbook
// Modern rewrite with improved matching and formatting

function normalizeItem(str) {
  // Normalize for comparison: lowercase, trim, collapse whitespace
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

function createList() {
  var recipeText = document.getElementById('area').value.trim();
  if (!recipeText) return;

  var excludeText = document.getElementById('area_1').value.trim();

  // Parse recipe items
  var recipeLines = recipeText.split('\n');
  var items = [];
  for (var i = 0; i < recipeLines.length; i++) {
    var line = recipeLines[i].trim();
    if (line) items.push(line);
  }

  // Parse exclusion items
  var excludeSet = {};
  if (excludeText) {
    var excludeLines = excludeText.split('\n');
    for (var j = 0; j < excludeLines.length; j++) {
      var eLine = excludeLines[j].trim();
      if (eLine) {
        excludeSet[normalizeItem(eLine)] = true;
      }
    }
  }

  // Filter: remove items that match exclusions
  var finalItems = [];
  for (var k = 0; k < items.length; k++) {
    var normalized = normalizeItem(items[k]);
    var excluded = false;

    // Exact match
    if (excludeSet[normalized]) {
      excluded = true;
    }

    // Also check if any exclude item is a substring match on the ingredient name
    if (!excluded) {
      for (var exKey in excludeSet) {
        // Extract just the ingredient name (skip leading numbers/units)
        var ingredientPart = normalized.replace(/^[\d\s\/\.]+\s*(cups?|tbsp|tsp|oz|lb|lbs|pounds?|ounces?|quarts?|gallons?|cans?|packages?|pkg|bags?|bottles?|jars?|bunche?s?|heads?|cloves?|stalks?|pieces?|slices?|sticks?|pinche?s?|dashe?s?|sm|md|lg|small|medium|large)\s+/i, '');
        var exIngredient = exKey.replace(/^[\d\s\/\.]+\s*(cups?|tbsp|tsp|oz|lb|lbs|pounds?|ounces?|quarts?|gallons?|cans?|packages?|pkg|bags?|bottles?|jars?|bunche?s?|heads?|cloves?|stalks?|pieces?|slices?|sticks?|pinche?s?|dashe?s?|sm|md|lg|small|medium|large)\s+/i, '');
        if (ingredientPart && exIngredient && ingredientPart === exIngredient) {
          excluded = true;
          break;
        }
      }
    }

    if (!excluded) {
      finalItems.push(items[k]);
    }
  }

  // Display results
  var resultCard = document.getElementById('resultCard');
  resultCard.style.display = 'block';

  var resultsEl = document.getElementById('results');
  var countEl = document.getElementById('shoppingCount');

  if (finalItems.length === 0) {
    resultsEl.innerHTML = 'No items needed - you have everything!';
    countEl.style.display = 'none';
  } else {
    countEl.style.display = 'block';
    countEl.innerHTML = finalItems.length + ' item' + (finalItems.length !== 1 ? 's' : '') + ' on your shopping list';

    var html = '';
    for (var m = 0; m < finalItems.length; m++) {
      html += '<div class="shopping-item">' + escapeHtml(finalItems[m]) + '</div>';
    }
    resultsEl.innerHTML = html;
  }
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

function clearShoppingList() {
  document.getElementById('area').value = '';
  document.getElementById('area_1').value = '';
  var resultCard = document.getElementById('resultCard');
  if (resultCard) resultCard.style.display = 'none';
}

function copyList() {
  var resultsEl = document.getElementById('results');
  var items = resultsEl.getElementsByClassName('shopping-item');
  var text = '';
  for (var i = 0; i < items.length; i++) {
    text += items[i].textContent + '\n';
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
  }
}

// Legacy compatibility
function Check() { createList(); }
