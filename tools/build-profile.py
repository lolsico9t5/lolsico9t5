"""Refresh the playable page after editing README.md. Uses GitHub's Markdown renderer."""
import argparse
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REPO = "lolsico9t5/lolsico9t5"
MEDIA = f"https://raw.githubusercontent.com/{REPO}/main/"
PAGE = ROOT / "docs/index.html"

def build(rendered):
    rendered = re.sub(r"</?themed-picture\b[^>]*>", "", rendered)
    # The About portrait and its float clearing belong only to the GitHub README.
    portrait = (r'(?:<p\b[^>]*>\s*)?<picture>\s*(?:<source\b[^>]*>\s*)*'
                r'<img\b[^>]*\bsrc="assets/about-portrait\.svg"[^>]*>\s*</picture>(?:\s*</p>)?')
    match = re.search(portrait, rendered)
    if match:
        after_portrait = rendered[match.end():]
        rendered = rendered[:match.start()] + re.sub(
            r'<br\s+clear="right"\s*/?>', '', after_portrait, count=1)
    rendered = re.sub(r'<p dir="auto"><a name="user-content-[^"]+"></a></p>\s*', "", rendered)
    # The original short navigation anchors correspond to the section icon names.
    rendered = re.sub(r'<h2 dir="auto">(?=<picture><img src="assets/icons/([\w-]+)\.svg")',
                      lambda m: f'<h2 id="{m[1]}">', rendered)
    # Keep the original repository art and relative banner link usable on the project site.
    rendered = re.sub(r'(src|srcset|href)="((?:assets/|banner\.svg)[^"]*)"',
                      lambda m: f'{m[1]}="{MEDIA}{m[2]}"', rendered)
    rendered = rendered.replace(' dir="auto"', '')
    rendered = re.sub(r'\s*<p>\s*<a href="https://lolsico9t5\.github\.io/lolsico9t5/(?:\?[^"]*)?"[^>]*>.*?</a>\s*</p>',
                      '', rendered, count=1, flags=re.S)
    rendered = rendered.replace('href="#user-content-certificates"', 'href="#certificates"')
    # The website has its own portrait header and planet navigation above this content.
    _, about_heading, sections = rendered.partition('<h2 id="about">')
    if not about_heading:
        raise ValueError("Could not locate the About section in the rendered profile")
    rendered = about_heading + sections
    rendered = re.sub(r'<img\b(?![^>]*\bloading=)', '<img loading="lazy" decoding="async"', rendered)
    # Style just the certificate table emitted by GitHub's Markdown renderer.
    rendered = re.sub(r'(<h2 id="certificates">.*?</h2>\s*(?:<markdown-accessiblity-table>\s*)?<table)(?=[ >])',
                      r'\1 class="cert-grid"', rendered, count=1, flags=re.S)
    page = PAGE.read_text(encoding="utf-8")
    page = re.sub(r'(?<=<!-- profile start -->).*?(?=<!-- profile end -->)',
                  lambda _: "\n"+rendered.strip()+"\n    ",page,count=1,flags=re.S)
    PAGE.write_text(page,encoding="utf-8")

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rendered",type=Path,help="Previously rendered GitHub Markdown")
    args=parser.parse_args()
    if args.rendered:
        build(args.rendered.read_text(encoding="utf-8"))
    else:
        source=(ROOT/"README.md").read_text(encoding="utf-8")
        body=json.dumps({"text":source,"mode":"gfm","context":REPO}).encode()
        request=Request("https://api.github.com/markdown",data=body,headers={"Content-Type":"application/json","User-Agent":"profile-builder"})
        with urlopen(request,timeout=30) as response:
            build(response.read().decode())
