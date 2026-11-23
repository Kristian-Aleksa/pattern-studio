#!/usr/bin/env python3
"""Build Pattern Studio into ONE self-contained HTML file (no network, no dependencies).

    python3 build.py            -> public/index.html

Inlines every  /*@inline path*/  marker in src/index.html with the file at src/<path>.
public/index.html is the whole app: the page the website serves, and the file to share or open offline.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "public" / "index.html"


def main():
    html = (SRC / "index.html").read_text(encoding="utf-8")

    def inline(m):
        path = SRC / m.group(1).strip()
        return path.read_text(encoding="utf-8").rstrip() + "\n"

    html = re.sub(r"/\*@inline ([^*]+)\*/\n?", inline, html)

    # Safety checks: inline JS must not contain sequences that end or confuse a <script> block.
    scripts = re.findall(r"<script>(.*?)</script>", html, flags=re.S)
    for js in scripts:
        low = js.lower()
        if "</script" in low or "<!--" in js:
            sys.exit("ERROR: inline JS contains '</script' or '<!--' — escape it.")

    # Nothing may be fetched from the network: only the SVG and XLink namespace strings are allowed.
    urls = set(re.findall(r"https?://[^\s\"')<>]+", html))
    allowed = {"http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"}
    bad = sorted(u for u in urls if u not in allowed and not u.startswith("http://www.w3.org/2000/svg"))
    if bad:
        sys.exit("ERROR: external URLs found: " + ", ".join(bad))

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8", newline="\n")
    print(f"Built {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
