#!/usr/bin/env python3
"""Build registered MGU apps through the shared command line."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--language', choices=['ko', 'en'], default='ko')
    parser.add_argument('apps', nargs='+', help='MGU component IDs')
    args = parser.parse_args()
    entries = {entry['id']: entry for entry in json.loads((ROOT / 'mgu-repo.json').read_text())['components']}
    for app in args.apps:
        if app not in entries or entries[app].get('kind') != 'app':
            parser.error('Unknown app: ' + app)
        if app == 'seats_easy_access' and args.language != 'ko':
            parser.error('Seats는 한국어판만 제공합니다. --language ko를 사용하세요.')
    out = Path(os.environ.get('MGU_OUT', str(ROOT / 'dist'))).resolve()
    out.mkdir(parents=True, exist_ok=True)
    for app in args.apps:
        entry = entries[app]
        build = entry['build']
        folder = ROOT / entry['path']
        spec = json.loads((folder / 'app.json').read_text())
        version = entry.get('version', spec['version'])
        if app == 'seats_easy_access':
            subprocess.run([sys.executable, str(folder / 'tools/build.py')], cwd=ROOT, check=True)
            package = folder / ('dist/USB/mgu-repo/seats-easy-access/' + app + '@' + version + '.tgz')
            shutil.copy2(package, out / package.name)
            usb = folder / ('dist/seats-easy-access-' + version + '-usb.zip')
            shutil.copy2(usb, out / usb.name)
        else:
            if 'node' not in build:
                parser.error('Unsupported build for ' + app)
            values = {'{id}': app, '{version}': version, '{dir}': str(folder)}
            command = ['node', str(ROOT / build['node'])]
            for value in build.get('args', []):
                command.append(values.get(value, value))
            if '--language' in command:
                command[command.index('--language') + 1] = args.language
            command.extend(['--out', str(out)])
            subprocess.run(command, cwd=ROOT, check=True)
        print('Built:', app, '→', out)


if __name__ == '__main__':
    main()
