#!/usr/bin/env python3
"""
Fix scaling artifacts in EPUB recipes.

Issues to fix:
1. Split-span number duplication (e.g., <span>1</span> <span>1 cups X</span>)
2. Decimal quantities (e.g., 0.2 tbsp → ¼ tsp)
3. Singular/plural mismatches (e.g., 1 cups → 1 cup)
4. Dual-notation recipes where parenthetical amounts are the home version
5. Section0007 was 4 servings and should not have been scaled

Strategy:
- Re-extract originals from the git-history EPUB
- Re-scale properly with a corrected algorithm
- Handle multi-span ingredients by processing full <p> tag text
"""

import zipfile
import re
import os
import math
from fractions import Fraction

EPUB_PATH = '/tmp/original_epub.epub'
WORK_DIR = '/home/user/the-best-of-brock-cookbook/epub_work/OEBPS/Text'

# Target servings
TARGET = 5

# Unicode fraction map
FRAC_MAP = {
    Fraction(1, 8): '⅛',
    Fraction(1, 4): '¼',
    Fraction(1, 3): '⅓',
    Fraction(3, 8): '⅜',
    Fraction(1, 2): '½',
    Fraction(5, 8): '⅝',
    Fraction(2, 3): '⅔',
    Fraction(3, 4): '¾',
    Fraction(7, 8): '⅞',
}

UNICODE_FRACS = {
    '¼': 0.25, '½': 0.5, '¾': 0.75,
    '⅓': 1/3, '⅔': 2/3,
    '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
    '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
    '⅙': 1/6, '⅚': 5/6,
}

# Seasonings scale non-linearly
SEASONING_WORDS = [
    'salt', 'pepper', 'garlic', 'cumin', 'oregano', 'basil', 'thyme',
    'rosemary', 'paprika', 'cayenne', 'chili powder', 'cinnamon',
    'nutmeg', 'cloves', 'allspice', 'ginger', 'turmeric', 'curry',
    'mustard', 'tabasco', 'hot sauce', 'sriracha', 'worcestershire',
    'soy sauce', 'vanilla', 'almond extract', 'mint', 'dill',
    'parsley', 'cilantro', 'bay leaves?', 'sage', 'tarragon',
    'marjoram', 'fennel seed', 'anise', 'anisette', 'celery seed',
    'onion powder', 'garlic powder'
]

LEAVENING_WORDS = [
    'baking soda', 'baking powder', 'yeast', 'cream of tartar'
]

ACID_WORDS = [
    'vinegar', 'lemon juice', 'lime juice', 'orange juice'
]

# Plural to singular mappings for units
PLURAL_UNITS = {
    'cups': 'cup',
    'lbs': 'lb',
    'tbsps': 'tbsp',
    'tsps': 'tsp',
    'ounces': 'ounce',
    'pounds': 'pound',
    'tablespoons': 'tablespoon',
    'teaspoons': 'teaspoon',
    'heads': 'head',
    'bunches': 'bunch',
    'cloves': 'clove',
    'cans': 'can',
    'boxes': 'box',
    'packages': 'package',
    'sticks': 'stick',
    'slices': 'slice',
    'stalks': 'stalk',
    'sprigs': 'sprig',
    'loaves': 'loaf',
    'pinches': 'pinch',
    'dashes': 'dash',
    'envelopes': 'envelope',
    'bags': 'bag',
    'bottles': 'bottle',
    'jars': 'jar',
    'strips': 'strip',
    'pieces': 'piece',
    'ribs': 'rib',
}

# Singular to plural
SINGULAR_UNITS = {v: k for k, v in PLURAL_UNITS.items()}


def parse_quantity(text):
    """Parse a quantity string into a float. Handles Unicode fractions, mixed numbers, etc."""
    text = text.strip()
    if not text:
        return None

    total = 0.0
    parts = text.split()

    for part in parts:
        # Check for Unicode fractions
        if part in UNICODE_FRACS:
            total += UNICODE_FRACS[part]
        elif '/' in part:
            try:
                num, den = part.split('/')
                total += float(num) / float(den)
            except:
                return None
        else:
            # Check for embedded Unicode fractions like "1½"
            found_frac = False
            for uf, uv in UNICODE_FRACS.items():
                if uf in part:
                    rest = part.replace(uf, '').strip()
                    if rest:
                        try:
                            total += float(rest) + uv
                        except:
                            return None
                    else:
                        total += uv
                    found_frac = True
                    break
            if not found_frac:
                try:
                    total += float(part)
                except:
                    return None

    return total if total > 0 else None


def format_quantity(value):
    """Convert a float to the best human-readable cooking quantity."""
    if value is None or value <= 0:
        return '0'

    # Handle whole numbers
    if abs(value - round(value)) < 0.01:
        n = int(round(value))
        return str(n)

    whole = int(value)
    frac_part = value - whole

    # Find closest fraction
    best_frac = None
    best_dist = float('inf')

    for f, symbol in FRAC_MAP.items():
        dist = abs(float(f) - frac_part)
        if dist < best_dist:
            best_dist = dist
            best_frac = symbol

    if best_dist < 0.06:  # Close enough to a standard fraction
        if whole > 0:
            return f'{whole} {best_frac}'
        else:
            return best_frac
    else:
        # Round to nearest reasonable value
        rounded = round(value * 4) / 4  # Round to nearest quarter
        if abs(rounded - round(rounded)) < 0.01:
            return str(int(round(rounded)))
        return format_quantity(rounded)


def fix_plural(quantity_str, unit):
    """Fix singular/plural of unit based on quantity.
    In cooking, quantities <= 1 use singular (¼ cup, ½ tsp, 1 cup).
    Quantities > 1 use plural (2 cups, 1½ cups)."""
    qty = parse_quantity(quantity_str)
    if qty is None:
        return unit

    if qty <= 1.0 + 0.01:
        # Quantity is 1 or less, use singular
        if unit.lower() in PLURAL_UNITS:
            return PLURAL_UNITS[unit.lower()]
    else:
        # Quantity is more than 1, use plural
        if unit.lower() in SINGULAR_UNITS:
            return SINGULAR_UNITS[unit.lower()]

    return unit


def is_seasoning(ingredient_text):
    lower = ingredient_text.lower()
    return any(s in lower for s in SEASONING_WORDS)


def is_leavening(ingredient_text):
    lower = ingredient_text.lower()
    return any(s in lower for s in LEAVENING_WORDS)


def is_acid(ingredient_text):
    lower = ingredient_text.lower()
    return any(s in lower for s in ACID_WORDS)


def scale_value(value, ratio, ingredient_text):
    """Scale a value with non-linear adjustments for seasonings etc."""
    if is_seasoning(ingredient_text):
        if ratio < 0.5:
            return value * math.sqrt(ratio)
        return value * ratio
    elif is_leavening(ingredient_text):
        if ratio < 0.5:
            return value * (ratio ** (1/3)) * 0.6
        return value * ratio
    elif is_acid(ingredient_text):
        return value * (0.9 * ratio + 0.1)
    else:
        return value * ratio


def extract_yield_number(yield_text):
    """Extract the primary yield number from yield text."""
    # Handle "80 servings (8 servings)" - return 80
    # Handle "15-20 servings" - return average
    # Handle "6 gallons or 96 servings" - return 96

    # Check for "N servings (N servings)" pattern - dual notation
    dual = re.search(r'(\d+)\s*(?:–|-)\s*(\d+)?\s*(?:servings|portions|people)', yield_text, re.I)
    simple = re.search(r'(\d+)\s*(?:servings|portions|people|persons)', yield_text, re.I)

    # First try for "or N servings" pattern
    or_match = re.search(r'or\s+(\d+)\s+servings', yield_text, re.I)
    if or_match:
        return int(or_match.group(1))

    if dual:
        n1 = int(dual.group(1))
        n2 = int(dual.group(2)) if dual.group(2) else n1
        return (n1 + n2) / 2
    elif simple:
        return int(simple.group(1))

    # Try generic number patterns
    # "24 cookies", "35 slices", etc.
    generic = re.search(r'(\d+)\s*(?:–|-)\s*(\d+)?\s*(?:cookies|slices|pieces|bars|rolls|loaves|muffins|biscuits|servings|portions)', yield_text, re.I)
    if generic:
        n1 = int(generic.group(1))
        n2 = int(generic.group(2)) if generic.group(2) else n1
        return (n1 + n2) / 2

    # Last resort: first number
    first_num = re.search(r'(\d+)', yield_text)
    if first_num:
        return int(first_num.group(1))

    return None


def has_dual_notation(content):
    """Check if recipe has dual food-service/home notation in parentheses."""
    # Look for patterns like "10 eggs (1 egg)" or "8 cups (2 cups)"
    pattern = r'(\d+[\s½¼¾⅓⅔⅛⅜⅝⅞]*)\s+(cups?|lbs?|tbsp|tsp|oz|pounds?|ounces?|eggs?|cans?|packages?|containers?|bottles?|heads?|bunches?|stalks?|cloves?|sticks?)[^(]*\((\d+[\s½¼¾⅓⅔⅛⅜⅝⅞]*\s*(?:cups?|lbs?|tbsp|tsp|oz|pounds?|ounces?|eggs?|cans?|packages?|containers?|bottles?|heads?|bunches?|stalks?|cloves?|sticks?))'
    return bool(re.search(pattern, content, re.I))


def process_dual_notation_line(line):
    """For a line with dual notation like '10 cups (2 cups) sugar',
    extract and return just the parenthetical (home) amount + ingredient."""
    # Pattern: "AMOUNT UNIT (HOME_AMOUNT) REST"
    pattern = r'^(.*?)(\d+[\s½¼¾⅓⅔⅛⅜⅝⅞/]*)\s*(cups?|lbs?|tbsp|tsp|oz|pounds?|ounces?|eggs?|cans?|packages?|containers?|bottles?|heads?|bunches?|stalks?|cloves?|sticks?|envelopes?)([^(]*)\(([^)]+)\)\s*(.*)$'
    match = re.match(pattern, line, re.I)
    if match:
        prefix = match.group(1)
        home_amount = match.group(5).strip()
        rest = match.group(6).strip()
        # The home amount might be like "2 cups" or "1 egg" or "½ cup"
        return f'{prefix}{home_amount} {rest}'.strip()
    return line


def scale_ingredient_line(full_text, ratio):
    """Scale an ingredient line. full_text is the complete text content of the <p>."""
    # Pattern: optional leading quantity + unit + ingredient
    # Handle "1 ½ cups flour" or "1½ cups flour" or "½ cup flour"

    qty_pattern = r'^([\d]+[\s]*[½¼¾⅓⅔⅛⅜⅝⅞]?|[½¼¾⅓⅔⅛⅜⅝⅞]|[\d]+\s+[\d]/[\d]|[\d]+/[\d]|[\d]+\.[\d]+|[\d]+)\s+'

    match = re.match(qty_pattern, full_text)
    if not match:
        return full_text

    qty_str = match.group(1).strip()
    rest = full_text[match.end():]

    qty = parse_quantity(qty_str)
    if qty is None:
        return full_text

    scaled = scale_value(qty, ratio, rest)

    # Don't let things go below a pinch (1/8 tsp level)
    if scaled < 0.05 and scaled > 0:
        scaled = 0.125

    new_qty = format_quantity(scaled)

    # Fix singular/plural for the unit
    unit_match = re.match(r'^(cups?|lbs?|tbsps?|tsps?|ounces?|pounds?|tablespoons?|teaspoons?|heads?|bunches?|cans?|boxes?|packages?|sticks?|slices?|stalks?|envelopes?|bags?|bottles?|jars?|strips?|pieces?|sprigs?|ribs?|loaves?|pinches?|dashes?)\b', rest, re.I)
    if unit_match:
        unit = unit_match.group(1)
        fixed_unit = fix_plural(new_qty, unit)
        rest = fixed_unit + rest[len(unit):]

    return f'{new_qty} {rest}'


def rebuild_p_tag(p_html, new_text):
    """Rebuild a <p> tag with new text content, collapsing multiple spans into one."""
    # Extract the p tag opening
    p_open_match = re.match(r'(<p[^>]*>)\s*', p_html)
    if not p_open_match:
        return p_html

    p_open = p_open_match.group(1)

    # Find the primary span class
    span_class_match = re.search(r'<span\s+class="([^"]*)"', p_html)
    span_class = span_class_match.group(1) if span_class_match else 'CharOverride-3'

    # Check if there are special characters like ® that need separate spans
    # For now, just use a single span with the main class
    return f'{p_open}<span class="{span_class}">{new_text}</span></p>'


def get_p_text(p_html):
    """Extract all text content from a <p> tag, stripping HTML tags."""
    # Remove HTML tags but keep text
    text = re.sub(r'<[^>]+>', '', p_html)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def process_file(section_name, original_content, original_yield_text, work_dir):
    """Process a single recipe file."""

    orig_yield = extract_yield_number(original_yield_text)
    if orig_yield is None or orig_yield <= 0:
        print(f"  Skipping {section_name}: couldn't parse yield from '{original_yield_text}'")
        return False

    # Don't scale recipes that are already small (under 8 servings)
    if orig_yield < 8:
        print(f"  Skipping {section_name}: yield {orig_yield} already small enough")
        # But still need to restore original if it was wrongly scaled
        filepath = os.path.join(work_dir, f'{section_name}.xhtml')
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(original_content)
        print(f"  Restored original for {section_name}")
        return True

    ratio = TARGET / orig_yield

    # Check for dual notation
    is_dual = has_dual_notation(original_content)
    if is_dual:
        print(f"  {section_name}: Dual notation detected, will use parenthetical amounts")

    print(f"  {section_name}: yield {orig_yield} → {TARGET}, ratio={ratio:.3f}")

    # Process line by line
    lines = original_content.split('\n')
    new_lines = []
    in_ingredients = False

    for line in lines:
        # Detect ingredient section (between tool icons and instructions/yield)
        stripped = line.strip()

        # Check for yield line to update
        if re.search(r'Yield[:\s]*\d+', stripped, re.I):
            # Update yield
            new_yield_text = re.sub(
                r'(Yield[:\s]*)\d+[\-–\d,\s]*(servings|portions|people|persons|pieces|cookies|biscuits|bars|rolls|loaves|muffins|cups?|pints?|dozen|doz\.?|slices|sandwiches|oz\s+servings|oz\s+cakes|[^<]*)',
                r'\g<1>5 servings',
                stripped,
                flags=re.I
            )
            # Also handle "Yield: 80 servings (8 servings)" pattern
            new_yield_text = re.sub(r'\([^)]*servings[^)]*\)', '', new_yield_text).strip()
            new_lines.append(line.replace(stripped, new_yield_text))
            continue

        # Check if this looks like an ingredient line (has a quantity at start)
        text = get_p_text(stripped)

        # Is this a <p> tag with ingredient content?
        if '<p ' in stripped and re.match(r'[\d½¼¾⅓⅔⅛⅜⅝⅞]', text):
            if is_dual:
                # Use parenthetical amounts if present
                if '(' in text and ')' in text:
                    new_text = process_dual_notation_line(text)
                    new_p = rebuild_p_tag(stripped, new_text)
                    new_lines.append(line[:len(line)-len(line.lstrip())] + new_p)
                else:
                    # No parenthetical, scale normally
                    new_text = scale_ingredient_line(text, ratio)
                    new_p = rebuild_p_tag(stripped, new_text)
                    new_lines.append(line[:len(line)-len(line.lstrip())] + new_p)
            else:
                # Scale the ingredient
                new_text = scale_ingredient_line(text, ratio)
                new_p = rebuild_p_tag(stripped, new_text)
                new_lines.append(line[:len(line)-len(line.lstrip())] + new_p)
        else:
            # Check instructions for food-service references
            # e.g., "Bring 8 cups of..." - scale these too
            if is_dual and '<p ' in stripped:
                # In dual-notation recipes, check for parenthetical references in instructions
                # e.g., "Bring 8 cups (2 cups for home version)"
                # Replace with just the parenthetical amount
                if '(' in text and ')' in text and re.search(r'\d+\s+cups?\s*\(', text):
                    # Has parenthetical cooking instructions
                    pass  # Keep as-is since instructions have context
            new_lines.append(line)

    # Write the processed file
    filepath = os.path.join(work_dir, f'{section_name}.xhtml')
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))

    return True


def main():
    z = zipfile.ZipFile(EPUB_PATH, 'r')

    # Find all recipe files and their yields
    recipe_files = []
    for name in z.namelist():
        if name.startswith('OEBPS/Text/Section') and name.endswith('.xhtml'):
            section = os.path.basename(name).replace('.xhtml', '')
            content = z.read(name).decode('utf-8')

            yield_match = re.search(r'Yield[:\s]*[^<]+', content, re.I)
            if yield_match:
                yield_text = yield_match.group(0)
                yield_num = extract_yield_number(yield_text)
                if yield_num and yield_num >= 8:
                    recipe_files.append((section, content, yield_text))

    print(f"Found {len(recipe_files)} recipes with yield >= 8 servings to re-scale")

    # Also find recipes that were wrongly scaled (yield < 8 in original)
    small_recipes = []
    for name in z.namelist():
        if name.startswith('OEBPS/Text/Section') and name.endswith('.xhtml'):
            section = os.path.basename(name).replace('.xhtml', '')
            content = z.read(name).decode('utf-8')

            yield_match = re.search(r'Yield[:\s]*[^<]+', content, re.I)
            if yield_match:
                yield_text = yield_match.group(0)
                yield_num = extract_yield_number(yield_text)
                if yield_num and yield_num < 8:
                    # Check if the current file in work dir has "5 servings"
                    work_path = os.path.join(WORK_DIR, f'{section}.xhtml')
                    if os.path.exists(work_path):
                        current = open(work_path, 'r', encoding='utf-8').read()
                        if 'Yield: 5 servings' in current and 'Yield: 5 servings' not in content:
                            small_recipes.append((section, content, yield_text))

    print(f"Found {len(small_recipes)} small recipes that were wrongly scaled")

    # Process all food-service recipes with corrected scaling
    processed = 0
    for section, content, yield_text in recipe_files:
        if process_file(section, content, yield_text, WORK_DIR):
            processed += 1

    # Restore wrongly-scaled small recipes
    for section, content, yield_text in small_recipes:
        filepath = os.path.join(WORK_DIR, f'{section}.xhtml')
        # Apply only the typo fixes from the original process_recipes.py
        # Fix common typos
        typo_fixes = {
            'Recepie': 'Recipe',
            'recepie': 'recipe',
            'worchestershire': 'Worcestershire',
            'Worchestershire': 'Worcestershire',
            'worstershire': 'Worcestershire',
            'brocolli': 'broccoli',
            'Brocolli': 'Broccoli',
            'cilanrto': 'cilantro',
            'tumeric': 'turmeric',
            'parsely': 'parsley',
            'margerine': 'margarine',
            'Margerine': 'Margarine',
            'seperately': 'separately',
            'seperate': 'separate',
            'temperture': 'temperature',
            'untill': 'until',
            'occassionally': 'occasionally',
            'throughly': 'thoroughly',
            'thorougly': 'thoroughly',
            'aproximately': 'approximately',
            'aproximate': 'approximate',
        }
        for old, new in typo_fixes.items():
            content = content.replace(old, new)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  Restored original for {section} (yield: {yield_text.strip()})")
        processed += 1

    z.close()
    print(f"\nDone! Processed {processed} files.")


if __name__ == '__main__':
    main()
