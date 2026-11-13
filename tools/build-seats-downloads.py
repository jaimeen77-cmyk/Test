#!/usr/bin/env python3
"""Publish SDK-free Seats downloads using the same Store builder as repo installs."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
entry = json.loads((ROOT / 'mgu-repo.json').read_text(encoding='utf-8'))['components'][0]
version = entry['version']
downloads = ROOT / 'downloads'
with tempfile.TemporaryDirectory(prefix='seats-downloads-') as temp:
    out = Path(temp)
    subprocess.run(['node', str(ROOT / 'tools/store-build.js'), '--template', entry['id'],
                    '--id', entry['id'], '--version', version, '--dir', entry['path'],
                    '--language', 'ko', '--out', str(out)], cwd=ROOT, check=True)
    package = out / (entry['id'] + '@' + version + '.tgz')
    item = {key: entry[key] for key in ('id', 'kind', 'version', 'title', 'description', 'mguHmi', 'requires', 'uninstallable')}
    artifact = {'name': package.name, 'url': package.name, 'size': package.stat().st_size,
                'sha256': hashlib.sha256(package.read_bytes()).hexdigest()}
    item['artifact'] = artifact
    catalog = {'schema': 2, 'components': [item]}
    downloads.mkdir(exist_ok=True)
    shutil.copy2(package, downloads / package.name)
    with zipfile.ZipFile(downloads / ('seats-easy-access-' + version + '-usb.zip'), 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.write(package, 'mgu-repo/seats-easy-access/' + package.name)
        archive.writestr('mgu-repo/seats-easy-access/catalog.json', json.dumps(catalog, ensure_ascii=False, indent=2))
        archive.write(ROOT / 'apps/seats_easy_access/README.ko.md', 'README.ko.md')
    artifact['url'] = 'https://raw.githubusercontent.com/jaimeen77-cmyk/Test/main/downloads/' + package.name
    (ROOT / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Published downloads/catalog for', version)
