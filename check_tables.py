import urllib.request
import re

with urllib.request.urlopen('http://localhost:5173') as f:
    html = f.read().decode('utf-8')

print('EnhancedTable in HTML:', 'enhanced-table' in html.lower())

tables = re.findall(r'<table[^>]*class="([^"]*)', html)
for t in tables:
    print('Table class:', t)