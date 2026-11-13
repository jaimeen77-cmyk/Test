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
entries = json.loads((ROOT / 'mgu-repo.json').read_text(encoding='utf-8'))['components']
downloads = ROOT / 'downloads'
catalog = {'schema': 2, 'components': []}
for entry in entries:
    version = entry['version']
    with tempfile.TemporaryDirectory(prefix='seats-downloads-') as temp:
        out = Path(temp)
        args = [value.replace('{id}', entry['id']).replace('{version}', version).replace('{dir}', entry['path'])
                for value in entry['build']['args']]
        subprocess.run(['node', str(ROOT / 'tools/store-build.js')] + args + ['--out', str(out)], cwd=ROOT, check=True)
        package = out / (entry['id'] + '@' + version + '.tgz')
        item = {key: entry[key] for key in ('id', 'kind', 'version', 'title', 'description', 'mguHmi', 'requires', 'uninstallable')}
        artifact = {'name': package.name, 'url': package.name, 'size': package.stat().st_size,
                    'sha256': hashlib.sha256(package.read_bytes()).hexdigest()}
        item['artifact'] = artifact
        downloads.mkdir(exist_ok=True)
        shutil.copy2(package, downloads / package.name)
        language = args[args.index('--language') + 1]
        suffix = '-ko' if language == 'ko' else ''
        with zipfile.ZipFile(downloads / ('seats-easy-access' + suffix + '-' + version + '-usb.zip'), 'w', zipfile.ZIP_DEFLATED) as archive:
            prefix = 'mgu-repo/' + entry['id'] + '/'
            archive.write(package, prefix + package.name)
            archive.writestr(prefix + 'catalog.json', json.dumps({'schema': 2, 'components': [item]}, ensure_ascii=False, indent=2))
            archive.write(ROOT / 'apps/seats_easy_access/README.ko.md', 'README.ko.md')
        artifact['url'] = 'https://raw.githubusercontent.com/jaimeen77-cmyk/Test/main/downloads/' + package.name
        catalog['components'].append(item)
        print('Published downloads for', entry['id'], version)
(ROOT / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
