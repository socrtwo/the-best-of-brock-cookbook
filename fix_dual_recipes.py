#!/usr/bin/env python3
"""
Fix recipes that have dual food-service/home annotations.
These recipes have patterns like "10 eggs (1 egg)" where the parenthetical
is the home version. We keep the parenthetical amount.
"""

import re
import os

ORIG_DIR = '/tmp/epub_orig/OEBPS/Text'
DEST_DIR = '/home/user/the-best-of-brock-cookbook/epub_work/OEBPS/Text'

FILES = {
    'Section0004.xhtml': {'orig_yield': 80, 'home_yield': 8, 'target': 5},
    'Section0053.xhtml': {'orig_yield': 50, 'home_yield': 8, 'target': 5},
    'Section0095.xhtml': {'orig_yield': 32, 'home_yield': 10, 'target': 5},
    'Section0130.xhtml': {'orig_yield': 25, 'home_yield': 6, 'target': 5},
    'Section0152.xhtml': {'orig_yield': 20, 'home_yield': 6, 'target': 5},
}


def process_dual_recipe(orig_path, dest_path, info):
    """Process a dual-annotated recipe by keeping the home version amounts."""
    with open(orig_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix Recepie typo
    content = content.replace('Recepie', 'Recipe')
    content = content.replace('recepie', 'recipe')

    # For ingredient lines with "FOOD_SERVICE_AMT (HOME_AMT) ingredient":
    # Replace with just "HOME_AMT ingredient"
    # Pattern: number/fraction (parenthetical amount) rest-of-ingredient
    def replace_dual_amount(match):
        """Replace dual amount with just the parenthetical (home) version."""
        prefix = match.group(1)  # opening span/tag
        food_service_qty = match.group(2)  # the food service amount
        home_amount = match.group(3)  # parenthetical home amount
        ingredient = match.group(4)  # rest of ingredient text
        suffix = match.group(5)  # closing tag

        return f'{prefix}{home_amount} {ingredient}{suffix}'

    # Match patterns like: <span...>10 eggs (1 egg), separated</span>
    # More precisely: QUANTITY (QUANTITY) REST
    content = re.sub(
        r'(<span[^>]*>)'  # Opening span
        r'([\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*/\s*\d+)?(?:\s+[\d\u00BC-\u00BE\u2150-\u215E]+(?:\s*/\s*\d+)?)?'  # Food service qty
        r'(?:\s*[a-zA-Z.]+(?:\s+[a-zA-Z.]+)?)?'  # Optional unit (e.g. "lbs", "oz", "cups")
        r')\s*'
        r'\(([^)]+)\)\s*'  # Parenthetical home amount
        r'([^<]*)'  # Rest of ingredient
        r'(</span>)',  # Closing span
        replace_dual_amount,
        content,
        flags=re.UNICODE
    )

    # Also handle cases where the pattern spans across multiple spans
    # e.g., <span...>1 pint (</span><span...>⅓</span> <span...>cup) milk</span>
    # These are trickier - let's handle the simpler ones and fix residuals

    # Update yield line to home version
    target = info['target']
    content = re.sub(
        r'(>)(Yield:\s*[^<]+?)(<)',
        lambda m: f'{m.group(1)}Yield: {target} servings{m.group(3)}',
        content,
        count=1,
        flags=re.IGNORECASE
    )

    with open(dest_path, 'w', encoding='utf-8') as f:
        f.write(content)

    return True


for fname, info in FILES.items():
    orig = os.path.join(ORIG_DIR, fname)
    dest = os.path.join(DEST_DIR, fname)
    if os.path.exists(orig):
        process_dual_recipe(orig, dest, info)
        print(f'Fixed {fname}: kept home version amounts, yield updated to {info["target"]}')
    else:
        print(f'WARNING: {orig} not found')
