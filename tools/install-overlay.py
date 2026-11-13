#!/usr/bin/env python3
"""Copy selected Jam app sources and their shared tools into an upstream checkout."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import sys

HERE = Path(__file__).resolve().parent.parent
APPS = tuple(app for app in ('idrive_circuit', 'cluster_redline', 'storage', 'seats_easy_access')
             if (HERE / 'apps' / app / 'app.json').is_file())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', type=Path)
    parser.add_argument('--apps', nargs='+', choices=APPS, default=list(APPS))
    parser.add_argument('--force', action='store_true', help='replace conflicting selected app/tool files')
    parser.add_argument('--no-ko', action='store_true', help='leave the target Korean catalog unchanged')
    args = parser.parse_args()
    target = args.target.expanduser().resolve()
    selected = list(dict.fromkeys(args.apps))
    if target == HERE or not (target / 'kit/tools/build.py').is_file() or not (target / 'apps').is_dir():
        parser.error('Target must be a separate upstream idrive7-apps checkout')
    files = []
    for app in selected:
        files.extend(p.relative_to(HERE) for p in (HERE / 'apps' / app).rglob('*')
                     if p.is_file() and not any(part in ('dist', '__pycache__') for part in p.relative_to(HERE).parts))
        images = HERE / 'screenshots' / app
        if images.is_dir():
            files.extend(p.relative_to(HERE) for p in images.rglob('*') if p.is_file())
        if app == 'idrive_circuit':
            files += [Path('kit/icons/idrive_circuit.svg'), Path('kit/tools/test_idrive_circuit.js')]
        elif app == 'cluster_redline':
            files.extend(p.relative_to(HERE) for p in (HERE / 'tests/cluster_redline').glob('*.js'))
    files += [Path('tools') / p for p in ('cluster-redline-preview.js', 'cluster-redline-preflight.js',
                                       'cluster-redline-settings-preview.js', 'collect-cluster-redline.ps1', 'collect-redline-install.ps1', 'install-overlay.py', 'upstream-integration.py')]
    files += [Path('tests') / p for p in ('metadata.test.js', 'standard-installer.test.py',
                                       'standard-kit.test.py', 'overlay.test.py', 'collect-cluster-redline.test.py', 'collect-redline-install.test.py', 'cluster-redline-manifest.test.py', 'hud-slot-request.test.py', 'cluster-slot-takeover.test.py', 'native-hud-guidance.test.py', 'native-cluster-recovery.test.py', 'optional-guidance.test.py', 'optional-auxiliary.test.py', 'optional-lanes.test.py')]
    files += [Path(p) for p in (
        'docs/JAM-INTEGRATION.ko.md',
        'docs/VALIDATION.ko.md',
        'docs/CLUSTER-REDLINE.ko.md',
        'docs/CLUSTER-REDLINE-HISTORY.ko.md',
        'docs/CLUSTER-REDLINE.md',
        'docs/INSTALL.ko.md',
        'docs/INSTALL.md',
        'localization/ko-additions.tsv',
        'docs/REDLINE-INSTALL-FAILED.ko.md',
        'docs/COLLECT-CLUSTER-REDLINE.ko.md',
        'docs/CLUSTER-OVERLAY-RESEARCH.ko.md',
        'docs/AUTO-RENDERER.ko.md',
        'LICENSES/MPL-2.0.txt',
        'LICENSES/GPL-3.0-or-later.txt',
        'NOTICE.cluster-redline.md',
        'patches/cluster-render-0.4.0-parked-recovery.patch',
    )]
    if selected == ['seats_easy_access']:
        files = [p for p in files if p.parts[:2] == ('apps', 'seats_easy_access')]
        files += [Path(p) for p in ('tools/install-overlay.py', 'tools/upstream-integration.py',
                                   'docs/SEATS-OVERLAY.ko.md', 'localization/ko-additions.tsv')]
    conflicts = [str(p) for p in files if (target / p).exists() and
                 ((target / p).is_dir() or (target / p).read_bytes() != (HERE / p).read_bytes())]
    if conflicts and not args.force:
        parser.error('Inspect conflicting files, then use --force to replace them: ' + ', '.join(conflicts))
    ko = target / 'kit/runtime/locales/ko.json'
    if not args.no_ko and not ko.is_file():
        parser.error('Korean runtime is missing; apply Korean support before merging translations')
    integration_spec = importlib.util.spec_from_file_location('jam_integration', HERE / 'tools/upstream-integration.py')
    integration = importlib.util.module_from_spec(integration_spec)
    integration_spec.loader.exec_module(integration)
    try:
        planned = integration.plan_upstream(target)
    except ValueError as error:
        parser.error(str(error))
    for relative in files:
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(HERE / relative, destination)
    for path, content in planned.items():
        path.write_bytes(content.encode('utf-8'))
        print('integrate', path)
    if not args.no_ko:
        additions = dict(line.split('\t', 1) for line in (HERE / 'localization/ko-additions.tsv').read_text(encoding='utf-8').splitlines()
                         if line and not line.startswith('#') and '\t' in line)
        for app in selected:
            # Apps can keep Korean additions beside their normal English source spec.
            translated = json.loads((HERE / 'apps' / app / 'app.json').read_text(encoding='utf-8')).get('translations', {}).get('ko', {})
            if app == 'seats_easy_access':
                existing = json.loads(ko.read_text(encoding='utf-8'))
                for key, value in translated.items():
                    if key not in existing:
                        additions.setdefault(key, value)
            else:
                additions.update(translated)
        words = json.loads(ko.read_text(encoding='utf-8'))
        words.update(additions)
        tsv = target / 'kit/runtime/locales/ko.tsv'
        if tsv.is_file():
            rows = dict(line.split('\t', 1) for line in tsv.read_text(encoding='utf-8').splitlines()
                        if line and not line.startswith('#') and '\t' in line)
            rows.update(additions)
            tsv.write_text(''.join(key + '\t' + value + '\n' for key, value in rows.items()), encoding='utf-8')
        ko.write_text(json.dumps(words, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Installed source overlay:', ', '.join(selected))
    print('Use normal commands in the target folder:')
    print('  python kit/tools/build.py --preview-only ' + ' '.join(selected))
    print('  python kit/tools/make_kit.py  # all apps, English by default; add --language ko for Korean')
    print('  deploy/push-to-car.ps1 or deploy/push-to-car.sh check / install')


if __name__ == '__main__':
    main()
