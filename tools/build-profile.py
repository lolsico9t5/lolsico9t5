"""Build the animated README from the selectable Markdown in profile.md.

Run with Pillow installed. Pass --fonts to use Arial's TTF directory on another OS.
"""
from argparse import ArgumentParser
from functools import lru_cache
from html import escape
from pathlib import Path
import math
import re
from PIL import ImageFont

parser = ArgumentParser(description=__doc__)
parser.add_argument("--fonts", type=Path, default=Path("C:/Windows/Fonts"))
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
art = root / "assets/type"
art.mkdir(exist_ok=True)
source = (root / "profile.md").read_text(encoding="utf-8")
scene = "https://lolsico9t5.github.io/lolsico9t5/"
e = escape

@lru_cache(maxsize=None)
def font(size, style):
    fname = {"strong":"arialbd.ttf","em":"ariali.ttf","code":"cour.ttf"}.get(style,"arial.ttf")
    return ImageFont.truetype(str(args.fonts / fname),size)

def tokens(markup):
    parts = re.split(r"(\*\*.*?\*\*|\*[^*\n]+?\*|`[^`]+`)",markup)
    result = []
    for part in parts:
        style = "body"
        if part.startswith("**"):
            style, part = "strong", part[2:-2]
        elif part.startswith("*"):
            style, part = "em", part[1:-1]
        elif part.startswith("`"):
            style, part = "code", part[1:-1]
        for token in re.findall(r"\s+|\S+",part):
            result.append((style,token))
    return result

def plain(text):
    return "".join(word for _,word in tokens(text))

def wrap(markup, size, limit):
    lines, line, occupied = [], [], 0
    for style, word in tokens(markup):
        length = font(size,style).getlength(word)
        if word.isspace() and not line:
            continue
        if not word.isspace() and occupied + length > limit and line:
            if line[-1][1].isspace():
                line.pop()
            lines.append(line)
            line, occupied = [], 0
        line.append((style,word))
        occupied += length
    if line:
        lines.append(line)
    return lines

# A light pass moves across the letters; the resting palette stays fully legible.
def defs():
    shades = ["#e0dff3","#d1d2ed","#d9d9f0","#d7d6ec","#dfdced"]
    stops = "".join(f'<stop class="s{i}" offset="{i/4}" stop-color="{c}"/>' for i,c in enumerate(shades))
    delays = "".join(f'#ink .s{i}{{animation-delay:{i*.34-2.2:.2f}s}}' for i in range(5))
    return f"""<defs>
    <linearGradient id="plate" x2="1" y2=".26"><stop stop-color="#13182d"/><stop offset=".68" stop-color="#131526"/><stop offset="1" stop-color="#1c192f"/></linearGradient>
    <linearGradient id="ink">{stops}</linearGradient>
    <linearGradient id="wire" gradientUnits="userSpaceOnUse" x1="16" x2="186"><stop stop-color="#a5b6ed"/><stop offset=".5" stop-color="#b8a5de"/><stop offset="1" stop-color="#efc6b4"/></linearGradient>
    </defs>
    <style>
    .strong{{font-weight:700}}.em{{font-style:italic}}.code{{font-family:'Courier New',monospace}}
    @keyframes luster{{0%,53%,100%{{stop-color:#d7d9ef}}68%{{stop-color:#fff0df}}81%{{stop-color:#c7c9ff}}}}
    @keyframes trace{{0%,12%{{stroke-dashoffset:108;opacity:0}}22%{{opacity:.95}}78%{{opacity:.8}}89%,100%{{stroke-dashoffset:-12;opacity:0}}}}
    @media(prefers-reduced-motion:no-preference){{#ink stop{{animation:luster 7s ease-in-out infinite}}{delays}.trace{{animation:trace 6.4s ease-in-out infinite}}}}
    </style>"""

def svg(label, width, height, content):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{e(label)}">\n{defs()}\n{content}\n</svg>\n'

def wire(x,y,length):
    path=f'M{x} {y}h{length}'
    return f'<path d="{path}" fill="none" stroke="url(#wire)" opacity=".52"/><path class="trace" d="{path}" pathLength="100" fill="none" stroke="#f5ddce" stroke-width="1.6" stroke-dasharray="9 108" opacity="0"/><path transform="translate({x+length+6} {y})" d="M0-2.6Q.35-.4 2.5 0Q.35.4 0 2.6Q-.35.4-2.5 0Q-.35-.4 0-2.6Z" fill="#e5c5c3"/>'

def card(name, groups):
    # Each group is a paragraph; explicit line breaks preserve role, date and description.
    description = " ".join(plain(line) for group in groups for line in group)
    for suffix, width in [("wide",756),("medium",500),("small",326)]:
        size = 17 if suffix=="wide" else 16
        pad = 20 if suffix=="wide" else 15
        y = pad + size - 3
        lines = []
        if name == "skills" and width >= 500:
            label_width = 194 if width == 756 else 172
            for index, (key, value) in enumerate(groups):
                if index:
                    lines.append(f'<path d="M{pad} {y-size-7}h{width-2*pad}" stroke="#33354b"/>')
                lines.append(f'<text x="{pad}" y="{y}" class="strong">{e(plain(key))}</text>')
                for words in wrap(value,size,width-2*pad-label_width):
                    row=e("".join(word for _,word in words))
                    lines.append(f'<text x="{pad+label_width}" y="{y}">{row}</text>')
                    y += size+7
                y += 7
        for group in ([] if name == "skills" and width >= 500 else groups):
            for paragraph in group:
                indent = 14 if name == "learning" else 0
                if indent:
                    lines.append(f'<circle cx="{pad+3}" cy="{y-5}" r="2" fill="#c8b4e2"/>')
                for words in wrap(paragraph,size,width-2*pad-3-indent):
                    spans = "".join(f'<tspan class="{style}">{e(word)}</tspan>' for style,word in words)
                    lines.append(f'<text x="{pad+indent}" y="{y}" xml:space="preserve">{spans}</text>')
                    y += size+7
            y += 9
        height=y-9+3
        rect=f'<rect x=".5" y=".5" width="{width-1}" height="{height-1}" rx="9" fill="url(#plate)" stroke="#424059"/>'
        text='<g font-family="Arial,Helvetica,sans-serif" font-size="'+str(size)+'" fill="url(#ink)">'+"\n".join(lines)+'</g>'
        (art/f'{name}-{suffix}.svg').write_text(svg(description,width,height,rect+text+wire(pad,height-9,min(168,width*.27))),encoding='utf-8')
    return (f'<picture>\n  <source media="(max-width: 480px)" srcset="assets/type/{name}-small.svg">\n'
            f'  <source media="(max-width: 700px), (min-width: 768px) and (max-width: 1060px)" srcset="assets/type/{name}-medium.svg">\n'
            f'  <img src="assets/type/{name}-wide.svg" width="100%" alt="{e(description)}">\n</picture>')

def label(text, name, heading=False, italic=False):
    size=24 if heading else 16
    if heading:
        size=min(size, math.floor(24*229/font(24,"strong").getlength(text)))
    width=math.ceil(font(size,"strong" if not italic else "em").getlength(text))+21
    height=34 if heading else 27
    bg=f'<rect x=".5" y=".5" width="{width-1}" height="{height-1}" rx="{7 if heading else 5}" fill="url(#plate)" stroke="#55516c"/>'
    style='font-style="italic"' if italic else 'font-weight="700"'
    t=f'<text x="10" y="{25 if heading else 19}" font-family="Arial,Helvetica,sans-serif" font-size="{size}" {style} fill="url(#ink)">{e(text)}</text>'
    (art/f'{name}.svg').write_text(svg(text,width,height,bg+t),encoding='utf-8')
    return f'<picture><img src="assets/type/{name}.svg" width="{width}" height="{height}" align="absmiddle" alt="{e(text)}"></picture>'

blocks = source.strip().split("\n\n")
out = []
i=0
project_ids=iter(["restock","email-system"])
while i<len(blocks):
    b=blocks[i]
    if b.startswith("## <picture>"):
        icon, title = b.split("</picture>",1)
        key=re.search(r'icons/([\w-]+)',icon)[1]
        # README heading slugs come from visible text; supply their original names for image titles.
        slug=re.sub(r'[^\w -]','',title.lower()).replace(' ','-')
        if not out or out[-1] != f'<a name="{slug}"></a>':
            out.append(f'<a name="{slug}"></a>')
        b=icon+'</picture>'+label(title,"heading-"+key,True)
    elif b.startswith("### "):
        m=re.search(r'>([^<]+)<picture>',b)
        title=m[1]
        slug=re.sub(r'[^\w -]','',title.lower()).replace(' ','-')
        out.append(f'<a name="{slug}"></a>')
        b=b[:m.start(1)]+label(title,"project-"+slug)+b[m.end(1):]
    elif b.startswith("Second-year computer"):
        b=card("intro",[[b]])
    elif b.startswith("Second-year **"):
        b=card("about",[[b],[blocks[i+1]]]); i+=1
    elif b.startswith("`"):
        b=card(next(project_ids),[[b],[blocks[i+1]]]); i+=1
    elif b.startswith("**C++ Programming Intern"):
        b=card("experience",[v.split("<br>\n") for v in blocks[i:i+3]]); i+=2
    elif b.startswith("**EUREKA!"):
        b=card("recognition",[v.split("<br>\n") for v in blocks[i:i+2]]); i+=1
    elif b.startswith("<table>"):
        rows=re.findall(r'<th[^>]*>(.*?)</th>\s*<td>(.*?)</td>',b)
        assert len(rows)==4
        b=card("skills",[[f'**{key}**',value] for key,value in rows])
    elif b.startswith("- **n8n**"):
        b=card("learning",[[line[2:] for line in b.splitlines()]])
    elif b.startswith("*Built in"):
        b=label(plain(b),"signature",italic=True)
    elif "<strong>" in b:
        def link_label(match):
            text=match[1]
            return label(text,"link-"+text.lower().replace(" ","-"))
        b=re.sub(r'<strong>([^<]+)</strong>',link_label,b)
    out.append(b)
    i+=1
out += [f'<p align="center">\n<a href="{scene}"><picture>\n  <source media="(prefers-reduced-motion: reduce)" srcset="assets/still/space-dragon.webp">\n  <img src="assets/space-dragon.webp" width="100%" alt="A silver-lavender space dragon beats its wings above a violet nebula. Open the scene to drag it.">\n</picture></a>\n</p>',
        f'<a href="{scene}">{label("Drag the dragon ↗","drag")}</a> · <a href="profile.md">{label("Read as text","read-as-text")}</a>']
# GitHub embeds SVGs as external images. Choose an actual still file in the
# parent picture so motion preferences also work across that image boundary.
def still_asset(src):
    still_path = src.replace("assets/", "assets/still/", 1)
    destination = root / still_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = (root / src).read_text(encoding="utf-8")
    fixed = re.sub(r"<style>.*?</style>", '<style>.strong{font-weight:700}.em{font-style:italic}.code{font-family:Courier New,monospace}</style>', data, flags=re.S)
    destination.write_text(fixed,encoding="utf-8")
    return still_path

def still_sources(match):
    picture = match.group()
    img = re.search(r'<img src="(assets/(?:type/[^"]+|links/nav-[^"]+))"',picture)
    if not img:
        return picture
    sources = []
    reduced = "(prefers-reduced-motion: reduce)"
    for media, src in re.findall(r'<source media="([^"]+)" srcset="([^"]+)">',picture):
        selector = ", ".join(reduced+" and "+q.strip() for q in media.split(","))
        sources.append(f'<source media="{selector}" srcset="{still_asset(src)}">')
    sources.append(f'<source media="{reduced}" srcset="{still_asset(img[1])}">')
    separator = "\n  " if "\n" in picture else ""
    return picture.replace("<picture>","<picture>"+separator+separator.join(sources),1)

readme = "\n\n".join(out)+"\n"
readme = re.sub(r'(<img src="assets/links/nav-[^"]+"[^>]+>)',r'<picture>\1</picture>',readme)
readme = re.sub(r'<picture>.*?</picture>',still_sources,readme,flags=re.S)
(root/"README.md").write_text(readme,encoding="utf-8")
