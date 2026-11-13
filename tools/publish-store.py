#!/usr/bin/env python3
"""Prepare the MGU Store catalog release assets from verified downloads."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
catalog = json.loads((root / 'catalog.json').read_text())
for component in catalog['components']:
    artifact = component['artifact']
    file = root / 'downloads' / artifact['name']
    assert file.stat().st_size == artifact['size'], file
    assert hashlib.sha256(file.read_bytes()).hexdigest() == artifact['sha256'], file
    artifact['url'] = 'https://github.com/jaimeen77-cmyk/Test/releases/download/catalog/' + file.name
output = root / 'store-release'
output.mkdir(exist_ok=True)
(output / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
print(output / 'catalog.json')
