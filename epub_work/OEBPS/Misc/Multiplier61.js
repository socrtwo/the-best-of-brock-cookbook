// Recipe Multiplier - The Best of Brock Cookbook
// Modern rewrite with fraction support

// Parse a number that may be a fraction, mixed number, or decimal
function parseQuantity(str) {
  str = str.trim();
  if (!str) return NaN;

  // Unicode fractions
  var unicodeFracs = {
    '\u00BC': 0.25, '\u00BD': 0.5, '\u00BE': 0.75,
    '\u2153': 1/3, '\u2154': 2/3, '\u2155': 0.2,
    '\u2156': 0.4, '\u2157': 0.6, '\u2158': 0.8,
    '\u2159': 1/6, '\u215A': 5/6, '\u215B': 0.125,
    '\u215C': 0.375, '\u215D': 0.625, '\u215E': 0.875
  };

  // Replace unicode fractions with decimal
  for (var uf in unicodeFracs) {
    if (str.indexOf(uf) >= 0) {
      str = str.replace(uf, ' ' + unicodeFracs[uf]);
    }
  }
  str = str.trim();

  // Mixed number: "1 1/2" or "2 3/4"
  var mixedMatch = str.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1], 10) + parseInt(mixedMatch[2], 10) / parseInt(mixedMatch[3], 10);
  }

  // Simple fraction: "1/2" or "3/4"
  var fracMatch = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    return parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
  }

  // Mixed with replaced unicode: "1 0.5"
  var mixedDec = str.match(/^(\d+)\s+([\d.]+)$/);
  if (mixedDec) {
    return parseInt(mixedDec[1], 10) + parseFloat(mixedDec[2]);
  }

  // Plain number
  var n = parseFloat(str);
  return isNaN(n) ? NaN : n;
}

// Format a number nicely: use fractions when close
function formatQuantity(n) {
  if (n <= 0) return '0';

  var whole = Math.floor(n);
  var frac = n - whole;

  // Common fractions
  var fractions = [
    [1/8, '\u215B'], [1/6, '1/6'], [1/4, '\u00BC'], [1/3, '\u2153'],
    [3/8, '\u215C'], [1/2, '\u00BD'], [5/8, '\u215D'], [2/3, '\u2154'],
    [3/4, '\u00BE'], [5/6, '5/6'], [7/8, '\u215E']
  ];

  // Check if fractional part is close to a common fraction
  for (var i = 0; i < fractions.length; i++) {
    if (Math.abs(frac - fractions[i][0]) < 0.04) {
      if (whole === 0) return fractions[i][1];
      return whole + ' ' + fractions[i][1];
    }
  }

  // Near whole number
  if (frac < 0.04) return '' + whole;
  if (frac > 0.96) return '' + (whole + 1);

  // Otherwise show decimal
  if (whole === 0) return n.toFixed(2).replace(/\.?0+$/, '');
  return n.toFixed(2).replace(/\.?0+$/, '');
}

function Calculate() {
  var oldVal = document.getElementById('old').value;
  var newVal = document.getElementById('new').value;

  if (!oldVal || !newVal) {
    showRatio(false);
    return;
  }

  var oldServing = parseFloat(oldVal);
  var newServing = parseFloat(newVal);

  if (isNaN(oldServing) || isNaN(newServing) || oldServing <= 0 || newServing <= 0) {
    showRatio(false);
    return;
  }

  var ratio = newServing / oldServing;
  showRatio(true, ratio);

  var text = document.getElementById('area').value.trim();
  if (!text) {
    document.getElementById('results').value = '';
    return;
  }

  var lines = text.split('\n');
  var output = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) {
      output.push('');
      continue;
    }

    // Try to find leading quantity (number, fraction, mixed number)
    // Match patterns like: "2", "1/2", "1 1/2", "0.5", Unicode fractions
    var qtyMatch = line.match(/^([\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*\/\s*\d+)?(?:\s+[\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*\/\s*\d+)?)?)\s+(.*)/);

    if (qtyMatch) {
      var qty = parseQuantity(qtyMatch[1]);
      var rest = qtyMatch[2];
      if (!isNaN(qty)) {
        var scaled = qty * ratio;
        output.push(formatQuantity(scaled) + ' ' + rest);
      } else {
        output.push(line);
      }
    } else {
      // No leading number - keep as-is (e.g. "Salt and pepper, to taste")
      output.push(line);
    }
  }

  document.getElementById('results').value = output.join('\n');
}

function showRatio(show, ratio) {
  var el = document.getElementById('ratioDisplay');
  if (show && ratio) {
    el.style.display = 'block';
    document.getElementById('ratioValue').innerHTML = ratio.toFixed(2) + 'x';
  } else {
    el.style.display = 'none';
  }
}

function clearAll() {
  document.getElementById('old').value = '';
  document.getElementById('new').value = '';
  document.getElementById('area').value = '';
  document.getElementById('results').value = '';
  showRatio(false);
}

// Legacy compatibility
function Check() { Calculate(); }
function Preview() {}
