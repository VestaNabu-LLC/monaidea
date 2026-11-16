"""Turns a full hand-built page into the content-only source the stamper takes.
usage: tocontent.py <in.html> <out.html>   (links are not touched here)"""
import re, sys
def convert(s):
    head = s[:s.index('</head>')]
    out = []
    t = re.search(r'<title>([^<]+)</title>', head); out.append(f'<title>{t.group(1)}</title>')
    d = re.search(r'<meta name="description" content="([^"]+)">', head); out.append(f'<meta name="description" content="{d.group(1)}">')
    for k in ('type', 'title', 'description'):
        m = re.search(rf'<meta property="og:{k}" content="([^"]+)">', head)
        if m: out.append(f'<meta property="og:{k}" content="{m.group(1)}">')
    j = re.search(r'<script type="application/ld\+json">(.*?)</script>', head, re.S)
    if j: out.append(f'<script type="application/ld+json">{j.group(1)}</script>')
    mains = re.findall(r'<main\b.*?</main>', s, re.S)
    assert len(mains) == 1
    return '\n'.join(out) + '\n' + mains[0] + '\n', mains[0]
if __name__ == '__main__':
    src = open(sys.argv[1], encoding='utf-8').read()
    text, _ = convert(src)
    open(sys.argv[2], 'w', encoding='utf-8').write(text)
