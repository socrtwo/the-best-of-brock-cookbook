#!/usr/bin/env python3
"""
Modernize each recipe page using BeautifulSoup for safe XHTML editing.

For every Section*.xhtml that looks like a recipe page:

1. Ensure book-modern.css is linked.
2. Add class="recipe-page" and data-baseline-yield="N" to <body>.
3. Remove the old toolbar (both the <p><strong>Kitchen Timer...</strong></p>
   label and the subsequent row of 4 icon links) and replace it with a
   clean, accessible pill-style <nav class="recipe-toolbar"> that includes
   a "Scale this recipe" deep link preloading the Multiplier with the
   baseline yield and ingredient lines.
4. Replace the nutrition PNG with a modern .nutrition-card that supersedes
   the image (the original image is kept inside a <details>).
"""

import glob
import html
import os
import re
import urllib.parse

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = os.path.dirname(os.path.abspath(__file__))
TEXT_DIR = os.path.join(ROOT, 'epub_work/OEBPS/Text')

TOOL_LABEL_RE = re.compile(r'Kitchen\s+Timer.*Unit\s+Converter', re.DOTALL | re.IGNORECASE)
TOOL_HREFS = {'Text/Timer.xhtml', 'Text/Multiplier.xhtml', 'Text/ShoppingList.xhtml', 'Text/Converter.xhtml'}

INSTRUCTION_VERBS = re.compile(
    r'^\s*(preheat|bake|cook|mix|combine|whisk|stir|serve|heat|boil|saut[eé]|'
    r'chop|slice|fry|grill|fold|drain|chill|add|pour|beat|cream|blend|'
    r'remove|spread|sprinkle|arrange|place|cover|uncover|set\s+aside|season|'
    r'bring\s+to|transfer|roll|knead|let\s+rise|refrigerate|marinate|'
    r'coat|dredge|dip|reduce|deglaze|simmer|braise|roast|garnish|cut)\b',
    re.IGNORECASE,
)

BOILERPLATE_RE = re.compile(r'Kitchen\s+Timer|Recipe\s+Multiplier|Shopping\s+List|Unit\s+Converter|Yield\s*:|Makes\b', re.IGNORECASE)


def text_of(tag):
    """Plain text with normalized whitespace."""
    return re.sub(r'\s+', ' ', tag.get_text(' ')).strip()


def find_title(soup):
    h2 = soup.find('h2', id='heading_id_2')
    if h2:
        return text_of(h2)
    h2 = soup.find('h2')
    return text_of(h2) if h2 else ''


def extract_baseline_yield(soup):
    """Find the smallest sensible integer on the Yield:/Makes line.

    Operates on the specific <p> containing the word, so we don't bleed
    into the author's name on the following paragraph.
    """
    raw = None
    for p in soup.find_all('p'):
        t = text_of(p)
        if not t:
            continue
        m = re.search(r'Yield\s*:\s*([^.\n]+)', t, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            break
        m = re.search(r'^Makes\s+(.+)$', t, re.IGNORECASE)
        if m:
            raw = 'Makes ' + m.group(1).strip()
            break
    if not raw:
        return None, None

    nums = re.findall(r'\d+', raw)
    if not nums:
        return None, raw
    n = int(nums[0])
    if n > 20:
        for cand in nums[1:]:
            c = int(cand)
            if 1 <= c <= 20:
                n = c
                break
    return n, raw


def find_old_toolbar_parts(soup):
    """Return the set of tags that together compose the old toolbar:
       - paragraph with Kitchen Timer/...Unit Converter label
       - paragraph-or-anchor row with 4 icon links to the tool pages
    """
    victims = []
    # Strong-label paragraph: first <p> containing "Kitchen Timer ... Unit Converter"
    for p in soup.find_all('p'):
        t = text_of(p)
        if t and TOOL_LABEL_RE.search(t) and len(t) < 80:
            victims.append(p)
            break
    # Icon row: any paragraph whose anchors mostly link to the tool files.
    for p in soup.find_all('p'):
        anchors = p.find_all('a', href=True)
        if len(anchors) >= 3:
            hits = sum(1 for a in anchors if any(h in a['href'] for h in TOOL_HREFS))
            if hits >= 3:
                victims.append(p)
    # Also handle the "class=sgc-5" anchor style (anchors are siblings of a <p>, not inside one).
    for a in soup.find_all('a', href=True):
        if 'sgc-5' in (a.get('class') or []) and any(h in a['href'] for h in TOOL_HREFS):
            # Remove this anchor and any adjacent NavigableString / <br/> / <img/> glue.
            victims.append(a)
    # Dedupe while preserving order
    seen = set()
    unique = []
    for v in victims:
        if id(v) in seen:
            continue
        seen.add(id(v))
        unique.append(v)
    return unique


def extract_ingredient_lines(soup, title):
    """Return a list of short ingredient-like lines.

    Heuristic: gather all <p> paragraphs that come after the old toolbar
    and before the first clearly instructional paragraph.
    """
    all_ps = soup.find_all('p')
    if not all_ps:
        return []

    # Find index of the toolbar label paragraph (if any); ingredients start
    # AFTER that. If not found, start from 0.
    start = 0
    for i, p in enumerate(all_ps):
        t = text_of(p)
        if TOOL_LABEL_RE.search(t) and len(t) < 80:
            start = i + 1
            break

    lines = []
    for p in all_ps[start:]:
        t = text_of(p)
        if not t:
            continue
        # Stop once we hit an instruction verb.
        if INSTRUCTION_VERBS.match(t):
            break
        if len(t) > 110:
            break
        # Skip obvious boilerplate and yield/author lines
        if BOILERPLATE_RE.search(t):
            continue
        if title and title.lower() in t.lower() and len(t) < len(title) + 20:
            continue
        # Skip ingredient subheaders that are uppercase words only
        if re.match(r'^[A-Z][A-Za-z /&()\-]{1,40}$', t) and t.isupper() is False and ' ' not in t:
            continue
        # Require the line to look like a starting ingredient: starts with digit/fraction/letter
        lines.append(t)
    # Deduplicate while preserving order; drop the author name and anything after a blank
    cleaned = []
    seen = set()
    for l in lines:
        if l in seen:
            continue
        seen.add(l)
        cleaned.append(l)
    return cleaned


def build_toolbar(soup, baseline, ingredients_text, title):
    scale_params = {
        'from': str(baseline or ''),
        'to': str(baseline or ''),
        'ingredients': ingredients_text,
        'recipe': title,
    }
    shop_params = {'add': f'{title}|{ingredients_text}'}

    def href(base, params):
        qs = urllib.parse.urlencode({k: v for k, v in params.items() if v},
                                    quote_via=urllib.parse.quote)
        return f'{base}?{qs}' if qs else base

    nav = soup.new_tag('nav', **{'class': 'recipe-toolbar'})

    def add_link(text, href_val, img_src, img_alt, primary=False):
        a = soup.new_tag('a', href=href_val, title=text)
        if primary:
            a['class'] = 'recipe-toolbar-primary'
        img = soup.new_tag('img', alt=img_alt, src=img_src)
        a.append(img)
        a.append(' ' + text)
        nav.append('\n  ')
        nav.append(a)

    add_link(
        'Scale this recipe',
        href('../Text/Multiplier.xhtml', scale_params) if baseline else '../Text/Multiplier.xhtml',
        '../Images/Multiplier.jpg', 'Scale', primary=True,
    )
    add_link('Timer', '../Text/Timer.xhtml', '../Images/Timer.png', 'Timer')
    add_link(
        'Shopping List',
        href('../Text/ShoppingList.xhtml', shop_params) if baseline else '../Text/ShoppingList.xhtml',
        '../Images/shopping-list.png', 'Shopping List',
    )
    add_link('Convert', '../Text/Converter.xhtml', '../Images/Converter.jpg', 'Convert')
    nav.append('\n')
    return nav


def build_nutrition_card(soup, baseline, yield_raw, img_tag):
    card = soup.new_tag('div', **{'class': 'nutrition-card'})
    head = soup.new_tag('div', **{'class': 'nutrition-card-head'})
    title_span = soup.new_tag('span', **{'class': 'nutrition-card-title'})
    title_span.string = 'Nutrition & Yield'
    yield_span = soup.new_tag('span', **{'class': 'nutrition-card-yield'})
    yield_text = yield_raw or (f'{baseline} servings' if baseline else 'See recipe')
    yield_span.string = yield_text
    head.append(title_span)
    head.append(yield_span)
    card.append(head)

    note = soup.new_tag('p', **{'class': 'nutrition-card-note'})
    note.string = ('The nutrition panel below reflects the printed per-serving values. '
                   'When you scale this recipe, totals change proportionally — salt, '
                   'spices, and leavening are scaled sub-linearly by the smart scaler.')
    card.append(note)

    actions = soup.new_tag('div', **{'class': 'nutrition-card-actions'})
    a1 = soup.new_tag('a', href='../Text/Multiplier.xhtml')
    a1.string = 'Open Scaler'
    a2 = soup.new_tag('a', href='../Text/Converter.xhtml', **{'class': 'secondary'})
    a2.string = 'Unit Converter'
    actions.append(a1)
    actions.append(a2)
    card.append(actions)

    if img_tag is not None:
        details = soup.new_tag('details', **{'class': 'nutrition-original'})
        summ = soup.new_tag('summary')
        summ.string = 'Original nutrition panel'
        details.append(summ)
        # Clone the img_tag into the card (it will be detached from its old parent).
        new_img = soup.new_tag('img', alt=img_tag.get('alt', 'Nutrition Information'),
                               src=img_tag.get('src', ''))
        details.append(new_img)
        card.append(details)
    return card


def ensure_css(soup):
    head = soup.find('head')
    if not head:
        return False
    for link in head.find_all('link', href=True):
        if link['href'].endswith('book-modern.css'):
            return False
    link = soup.new_tag('link', href='../Styles/book-modern.css', rel='stylesheet', type='text/css')
    head.append('\n  ')
    head.append(link)
    head.append('\n')
    return True


def patch_body(soup, baseline):
    body = soup.find('body')
    if not body:
        return False
    classes = set(body.get('class') or [])
    classes.add('recipe-page')
    body['class'] = sorted(classes)
    if baseline:
        body['data-baseline-yield'] = str(baseline)
    return True


def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        raw = f.read()

    soup = BeautifulSoup(raw, 'html.parser')

    # Skip non-recipe pages
    body_text = soup.get_text(' ', strip=True)
    if ('Kitchen Timer' not in body_text and 'Recipe Multiplier' not in body_text):
        return False

    title = find_title(soup)
    baseline, yield_raw = extract_baseline_yield(soup)
    ingredients = extract_ingredient_lines(soup, title)
    ingredients_text = '\n'.join(ingredients)

    # 1. CSS
    ensure_css(soup)

    # 2. Body class + data-baseline-yield
    patch_body(soup, baseline)

    # 3. Remove old toolbar parts
    victims = find_old_toolbar_parts(soup)
    anchor_point = None
    for v in victims:
        if anchor_point is None and v.parent:
            anchor_point = v
        v.decompose()

    # Build + insert new toolbar. Place it as a sibling immediately after
    # the h2 title. That way it lands in the same frame as the title even
    # if the whole recipe is wrapped in one big Basic-Text-Frame.
    new_toolbar = build_toolbar(soup, baseline, ingredients_text, title)
    h2 = soup.find('h2', id='heading_id_2') or soup.find('h2')
    if h2:
        h2.insert_after('\n')
        h2.insert_after(new_toolbar)
    else:
        body = soup.find('body')
        if body:
            body.insert(0, new_toolbar)

    # 4. Replace nutrition PNG with card
    img = None
    for candidate in soup.find_all('img'):
        src = candidate.get('src', '')
        alt = candidate.get('alt', '')
        if 'Nutrition' in alt:
            img = candidate
            break
        if re.search(r'Images/\d{4,}\.png$', src):
            img = candidate
            # Don't break — prefer an explicit alt="Nutrition Information" if one exists later.
    if img:
        # Walk up to the enclosing <p> or <div> that wraps only this image
        container = img.parent
        while container and container.name not in ('p', 'div') and container.name != 'body':
            container = container.parent
        card = build_nutrition_card(soup, baseline, yield_raw, img)
        if container and container.name in ('p', 'div'):
            container.replace_with(card)
        else:
            img.replace_with(card)

    # Serialize — preserve XHTML self-closing tags.
    out = soup.encode(formatter='minimal').decode('utf-8')

    # Add XML prolog + DOCTYPE back if they got stripped (they usually survive in html.parser)
    if not out.lstrip().startswith('<?xml'):
        prolog = '<?xml version="1.0" encoding="utf-8"?>\n'
        doctype = ('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN"\n'
                   '  "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n\n')
        out = prolog + doctype + out

    # Self-close void elements (XHTML)
    out = re.sub(r'<(img|br|hr|meta|link|input)([^>]*?)(?<!/)>', r'<\1\2/>', out)

    if out != raw:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(out)
        return True
    return False


def main():
    files = sorted(glob.glob(os.path.join(TEXT_DIR, 'Section*.xhtml')))
    ok, skipped, errors = 0, 0, 0
    for path in files:
        try:
            if process_file(path):
                ok += 1
            else:
                skipped += 1
        except Exception as e:
            errors += 1
            print(f'ERROR {os.path.basename(path)}: {e}')
    print(f'Modernized: {ok}, skipped: {skipped}, errors: {errors}')


if __name__ == '__main__':
    main()
