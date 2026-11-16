"""Moves one app's old site into atlapps-site/pages/<app>/ as content-only pages.
usage: convert_app.py <old site dir> <app> <atlapps-site dir>"""
import os, re, shutil, sys
sys.path.insert(0, os.path.dirname(__file__))
from tocontent import convert
old, app, dest = sys.argv[1:4]
HOSTS = {'https://ledgerstone.monaidea.com/': '/ledgerstone/', 'https://flagstone.monaidea.com/': '/flagstone/'}
def rewrite(text):
    text = re.sub(r'\b(href|src|poster)="/(?!/)', rf'\1="/{app}/', text)
    for host, path in HOSTS.items():
        text = text.replace(f'href="{host}', f'href="{path}')
    text = text.replace('href="Ledgerstone-Guide.pdf"', 'href="/ledgerstone/guide/Ledgerstone-Guide.pdf"')
    text = text.replace('src="img/', f'src="/{app}/guide/img/')
    # what is left names a full address on purpose (structured data): the new one
    text = text.replace('"publisher":{"@type":"Organization","name":"Monaidea","url":"https://ledgerstone.monaidea.com/"}',
                        '"publisher":{"@type":"Organization","name":"Monaidea","url":"https://www.monaidea.com/"}')
    for host, path in HOSTS.items():
        text = text.replace(host, 'https://atlapps.monaidea.com' + path)
    return text
n = 0
for root, dirs, files in os.walk(old):
    dirs[:] = [d for d in dirs if d != '.git']
    for f in files:
        src = os.path.join(root, f); rel = os.path.relpath(src, old)
        if rel in ('CNAME', 'README.md', 'style.css', 'site.js', 'contact.js', 'sitemap.xml', 'robots.txt', '404.html'): continue
        out = os.path.join(dest, 'pages', app, rel); os.makedirs(os.path.dirname(out), exist_ok=True)
        if f.endswith('.html'):
            text, _ = convert(open(src, encoding='utf-8').read())
            open(out, 'w', encoding='utf-8').write(rewrite(text)); n += 1
        else:
            shutil.copyfile(src, out)
print(app, n, 'pages')
