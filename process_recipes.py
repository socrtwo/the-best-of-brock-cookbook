#!/usr/bin/env python3
"""
Process all recipes in The Best of Brock cookbook EPUB:
1. Scale food service recipes down to ~4-5 servings
2. Fix common errors (typos, ingredient issues)
3. Fix "Recepie" typo throughout
"""

import os
import re
import glob
import math
from fractions import Fraction

EPUB_DIR = '/home/user/the-best-of-brock-cookbook/epub_work/OEBPS/Text'

# ============================================================
# Fraction handling utilities
# ============================================================

UNICODE_FRACS = {
    '\u00BC': Fraction(1, 4),    # ¼
    '\u00BD': Fraction(1, 2),    # ½
    '\u00BE': Fraction(3, 4),    # ¾
    '\u2153': Fraction(1, 3),    # ⅓
    '\u2154': Fraction(2, 3),    # ⅔
    '\u2155': Fraction(1, 5),    # ⅕
    '\u2156': Fraction(2, 5),    # ⅖
    '\u2157': Fraction(3, 5),    # ⅗
    '\u2158': Fraction(4, 5),    # ⅘
    '\u2159': Fraction(1, 6),    # ⅙
    '\u215A': Fraction(5, 6),    # ⅚
    '\u215B': Fraction(1, 8),    # ⅛
    '\u215C': Fraction(3, 8),    # ⅜
    '\u215D': Fraction(5, 8),    # ⅝
    '\u215E': Fraction(7, 8),    # ⅞
}

FRAC_TO_UNICODE = {
    (1, 4): '\u00BC', (1, 2): '\u00BD', (3, 4): '\u00BE',
    (1, 3): '\u2153', (2, 3): '\u2154',
    (1, 8): '\u215B', (3, 8): '\u215C', (5, 8): '\u215D', (7, 8): '\u215E',
}


def parse_quantity(text):
    """Parse a quantity that might be a number, fraction, or mixed number."""
    text = text.strip()
    if not text:
        return None

    # Replace unicode fractions
    for uf, val in UNICODE_FRACS.items():
        text = text.replace(uf, f' {val}')
    text = text.strip()

    # Mixed number: "1 1/2"
    m = re.match(r'^(\d+)\s+(\d+)\s*/\s*(\d+)$', text)
    if m:
        return float(int(m.group(1)) + Fraction(int(m.group(2)), int(m.group(3))))

    # Fraction: "1/2"
    m = re.match(r'^(\d+)\s*/\s*(\d+)$', text)
    if m:
        return float(Fraction(int(m.group(1)), int(m.group(2))))

    # Mixed with decimal from unicode replacement
    m = re.match(r'^(\d+)\s+([\d.]+(?:/\d+)?)$', text)
    if m:
        try:
            second = float(Fraction(m.group(2)))
            return int(m.group(1)) + second
        except (ValueError, ZeroDivisionError):
            pass

    try:
        return float(text)
    except ValueError:
        return None


def format_quantity(n):
    """Format a number as a nice fraction string."""
    if n <= 0:
        return '0'

    whole = int(n)
    frac = n - whole

    # Common fractions
    fracs = [
        (1/8, (1, 8)), (1/4, (1, 4)), (1/3, (1, 3)),
        (3/8, (3, 8)), (1/2, (1, 2)), (5/8, (5, 8)),
        (2/3, (2, 3)), (3/4, (3, 4)), (7/8, (7, 8)),
    ]

    for target, key in fracs:
        if abs(frac - target) < 0.06:
            uf = FRAC_TO_UNICODE.get(key, f'{key[0]}/{key[1]}')
            if whole == 0:
                return uf
            return f'{whole} {uf}'

    if frac < 0.06:
        return str(whole) if whole > 0 else '1'
    if frac > 0.94:
        return str(whole + 1)

    # Round to reasonable decimal
    return f'{n:.1f}'.rstrip('0').rstrip('.')


# ============================================================
# Recipe parsing and scaling
# ============================================================

# Pattern to match quantity at start of ingredient text
QTY_PATTERN = re.compile(
    r'^([\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*/\s*\d+)?(?:\s+[\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*/\s*\d+)?)?)\s+(.+)',
    re.UNICODE
)


def scale_ingredient_text(text, ratio, is_seasoning=False):
    """Scale an ingredient quantity by a ratio."""
    m = QTY_PATTERN.match(text.strip())
    if not m:
        return text

    qty_str = m.group(1)
    rest = m.group(2)

    qty = parse_quantity(qty_str)
    if qty is None:
        return text

    # Non-linear scaling adjustments
    effective_ratio = ratio

    rest_lower = rest.lower()

    # Seasonings, spices, and leavening scale less aggressively
    seasoning_words = ['salt', 'pepper', 'cayenne', 'paprika', 'cumin', 'oregano',
                       'thyme', 'basil', 'cinnamon', 'nutmeg', 'clove', 'ginger',
                       'garlic powder', 'onion powder', 'chili powder', 'curry',
                       'turmeric', 'allspice', 'bay lea', 'rosemary', 'sage',
                       'dill', 'parsley flake', 'red pepper flake', 'cajun',
                       'old bay', 'seasoning', 'mrs. dash', 'italian season']
    leavening_words = ['baking soda', 'baking powder', 'yeast', 'cream of tartar']
    acid_words = ['vinegar', 'lemon juice', 'lime juice', 'worcestershire']

    is_seasoning_ingredient = any(w in rest_lower for w in seasoning_words)
    is_leavening = any(w in rest_lower for w in leavening_words)
    is_acid = any(w in rest_lower for w in acid_words)

    if is_seasoning_ingredient:
        # Spices/seasonings: use square root scaling for large reductions
        if ratio < 0.5:
            effective_ratio = math.sqrt(ratio)
        else:
            effective_ratio = ratio * 0.85 + 0.15  # Less aggressive
    elif is_leavening:
        # Leavening: use cube root scaling for large reductions
        if ratio < 0.5:
            effective_ratio = ratio ** (1/3) * 0.6
        else:
            effective_ratio = ratio * 0.7 + 0.3
    elif is_acid:
        # Acids: scale slightly less
        effective_ratio = ratio * 0.9 + 0.1

    new_qty = qty * effective_ratio

    # Clamp to reasonable minimums
    unit_match = re.match(r'(tsp|teaspoon|tbsp|tablespoon|dash|pinch)', rest_lower)
    if unit_match or is_seasoning_ingredient:
        if new_qty < 0.125 and qty > 0:
            new_qty = 0.125  # minimum ⅛ tsp

    return f'{format_quantity(new_qty)} {rest}'


def extract_yield_number(yield_text):
    """Extract the primary yield number from a yield string."""
    # Handle cases like "80 servings (8 servings)" - use the FIRST number
    # as the original, and note if there's a parenthetical home version
    text = yield_text.strip()

    # Check for parenthetical home version
    paren_match = re.search(r'\((\d+)[–-]?(\d*)\s*servings?\)', text, re.IGNORECASE)
    first_num = re.search(r'(\d+)', text)

    if paren_match and first_num:
        food_service_num = int(first_num.group(1))
        home_num = int(paren_match.group(1))
        if food_service_num > 15 and home_num < 12:
            return food_service_num  # Use food service number for scaling

    # Handle "X gallons or Y servings" patterns
    gallon_match = re.search(r'(\d+)\s*gallons?\s+or\s+(\d+)', text, re.IGNORECASE)
    if gallon_match:
        return int(gallon_match.group(2))

    quart_match = re.search(r'(\d+)\s*quarts?\s+or\s+(\d+)', text, re.IGNORECASE)
    if quart_match:
        return int(quart_match.group(2))

    # Handle "X, Y oz servings"
    portion_match = re.search(r'(\d+),?\s*\d+\s*oz\s*servings?', text, re.IGNORECASE)
    if portion_match:
        return int(portion_match.group(1))

    # Handle ranges "X-Y servings"
    range_match = re.search(r'(\d+)\s*[–-]\s*(\d+)\s*servings?', text, re.IGNORECASE)
    if range_match:
        return int(range_match.group(1))  # Use the higher end

    # Simple number
    num_match = re.search(r'(\d+)\s*servings?', text, re.IGNORECASE)
    if num_match:
        return int(num_match.group(1))

    # Last resort: first number
    if first_num:
        return int(first_num.group(1))

    return None


# ============================================================
# HTML Processing
# ============================================================

def process_recipe_file(filepath):
    """Process a single recipe XHTML file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    changes_made = []

    # ---- Fix typos throughout ----
    if 'Recepie' in content or 'recepie' in content:
        content = content.replace('Recepie', 'Recipe')
        content = content.replace('recepie', 'recipe')
        changes_made.append('Fixed "Recepie" -> "Recipe" typo')

    if 'Make You shopping' in content:
        content = content.replace('Make You shopping', 'Make Your Shopping')
        changes_made.append('Fixed "Make You shopping" -> "Make Your Shopping"')

    # Fix common ingredient typos
    typo_fixes = {
        'worchestershire': 'Worcestershire',
        'worchester': 'Worcestershire',
        'Worchestershire': 'Worcestershire',
        'parsely': 'parsley',
        'Parsely': 'Parsley',
        'cummin': 'cumin',
        'Cummin': 'Cumin',
        'mozarella': 'mozzarella',
        'Mozarella': 'Mozzarella',
        'mozzerella': 'mozzarella',
        'Mozzerella': 'Mozzarella',
        'margerine': 'margarine',
        'Margerine': 'Margarine',
        'cillantro': 'cilantro',
        'Cillantro': 'Cilantro',
        'cilanro': 'cilantro',
        'Cilanro': 'Cilantro',
        'brocoli': 'broccoli',
        'Brocoli': 'Broccoli',
        'brocolli': 'broccoli',
        'Brocolli': 'Broccoli',
        'tumeric': 'turmeric',
        'Tumeric': 'Turmeric',
        'calender': 'colander',
        'Calender': 'Colander',
        'seperately': 'separately',
        'Seperately': 'Separately',
        'seperate': 'separate',
        'Seperate': 'Separate',
        'occassionally': 'occasionally',
        'untill': 'until',
        'Untill': 'Until',
        'stirr ': 'stir ',
        'Stirr ': 'Stir ',
        'potatoe ': 'potato ',
        'potatoe,': 'potato,',
        'potatoe.': 'potato.',
        'tomatoe ': 'tomato ',
        'tomatoe,': 'tomato,',
        'tomatoe.': 'tomato.',
        'cranberrie s': 'cranberries',
        ' 0f ': ' of ',
    }

    for wrong, right in typo_fixes.items():
        if wrong in content:
            content = content.replace(wrong, right)
            changes_made.append(f'Fixed "{wrong}" -> "{right}"')

    # ---- Check if this is a food service recipe ----
    yield_match = re.search(
        r'Yield:\s*(.+?)(?:</span>|<br|<)',
        content, re.IGNORECASE | re.DOTALL
    )

    if yield_match:
        yield_text = re.sub(r'<[^>]+>', '', yield_match.group(1))
        yield_text = yield_text.replace('&nbsp;', ' ')
        original_yield = extract_yield_number(yield_text)

        # Only scale if 10+ servings
        target_servings = 5
        if original_yield and original_yield >= 10:
            ratio = target_servings / original_yield
            changes_made.append(f'Scaled from {original_yield} to {target_servings} servings (ratio={ratio:.3f})')

            # Scale ingredient quantities in the HTML
            content = scale_recipe_content(content, ratio, original_yield, target_servings)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return changes_made

    return []


def scale_recipe_content(content, ratio, original_yield, target_servings):
    """Scale ingredient quantities in recipe HTML content."""

    # Find ingredient paragraphs (they have CharOverride-3 or sgc classes and contain quantities)
    # Ingredients are in <span class="CharOverride-3">...</span> patterns

    def scale_span_content(match):
        """Process a single span that might contain an ingredient."""
        full_match = match.group(0)
        span_content = match.group(1)

        # Check if this looks like an ingredient line (starts with number or fraction)
        stripped = span_content.strip()
        if not stripped:
            return full_match

        # Skip if it's a direction/instruction (usually longer prose)
        # Ingredients tend to be shorter and start with a quantity
        if len(stripped) > 200:
            return full_match

        # Skip yield lines, chef names, etc.
        if re.match(r'Yield:', stripped, re.IGNORECASE):
            return full_match

        # Try to scale if it starts with a number
        has_leading_qty = re.match(
            r'^[\d\u00BC-\u00BE\u2150-\u215E]',
            stripped, re.UNICODE
        )
        if has_leading_qty:
            scaled = scale_ingredient_text(stripped, ratio)
            if scaled != stripped:
                return full_match.replace(span_content, scaled)

        return full_match

    # Scale ingredients in CharOverride-3 spans (Berlin Sans FB - ingredient font)
    content = re.sub(
        r'(<span class="CharOverride-3">)(.*?)(</span>)',
        lambda m: m.group(1) + (scale_ingredient_text(m.group(2).strip(), ratio) if re.match(r'^[\d\u00BC-\u00BE\u2150-\u215E]', m.group(2).strip(), re.UNICODE) and len(m.group(2).strip()) < 200 and not re.match(r'Yield:', m.group(2).strip(), re.IGNORECASE) else m.group(2)) + m.group(3),
        content,
        flags=re.DOTALL | re.UNICODE
    )

    # Also scale ingredients in spans with sgc classes that contain quantities
    content = re.sub(
        r'(<span class="(?:sgc-\d+|CharOverride-\d+)(?:\s+(?:sgc-\d+|CharOverride-\d+))*">)([\d\u00BC-\u00BE\u2150-\u215E][^<]{3,120})(</span>)',
        lambda m: m.group(1) + (scale_ingredient_text(m.group(2).strip(), ratio) if not re.match(r'Yield:', m.group(2).strip(), re.IGNORECASE) else m.group(2)) + m.group(3),
        content,
        flags=re.DOTALL | re.UNICODE
    )

    # Update the yield line
    def replace_yield(m):
        prefix = m.group(1)
        yield_content = m.group(2)
        suffix = m.group(3)
        return f'{prefix}Yield: {target_servings} servings{suffix}'

    content = re.sub(
        r'(>)(Yield:\s*[^<]+?)(<)',
        replace_yield,
        content,
        count=1,
        flags=re.IGNORECASE
    )

    return content


# ============================================================
# Main processing
# ============================================================

def main():
    files = sorted(glob.glob(os.path.join(EPUB_DIR, 'Section*.xhtml')))
    print(f'Found {len(files)} recipe section files')

    # Also fix typos in tool pages
    tool_files = [
        os.path.join(EPUB_DIR, 'ShoppingList.xhtml'),
        os.path.join(EPUB_DIR, 'Multiplier.xhtml'),
    ]

    all_files = files + [f for f in tool_files if os.path.exists(f)]

    total_changes = 0
    scaled_recipes = []

    for filepath in all_files:
        fname = os.path.basename(filepath)
        changes = process_recipe_file(filepath)
        if changes:
            total_changes += 1
            print(f'\n{fname}:')
            for c in changes:
                print(f'  - {c}')
            if any('Scaled from' in c for c in changes):
                scaled_recipes.append(fname)

    print(f'\n{"="*60}')
    print(f'Total files modified: {total_changes}')
    print(f'Recipes scaled down: {len(scaled_recipes)}')
    if scaled_recipes:
        print(f'Scaled recipe files: {", ".join(scaled_recipes)}')


if __name__ == '__main__':
    main()
