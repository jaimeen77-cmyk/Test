#!/usr/bin/env python3
"""Test Seats through the real overlay, native builder and kit packer."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('upstream', type=Path)
parser.add_argument('--prepare-store', action='store_true')
args = parser.parse_args()


def run(project, *command, success=True):
    p = subprocess.run(command, cwd=project, text=True, capture_output=True, input='')
    if success:
        assert p.returncode == 0, p.stdout + p.stderr
    else:
        assert p.returncode != 0, p.stdout
    return p


with tempfile.TemporaryDirectory(prefix='seats-standard-build-') as temp:
    project = Path(temp)
    for folder in ('kit', 'deploy'):
        shutil.copytree(args.upstream / folder, project / folder, ignore=shutil.ignore_patterns('__pycache__'))
    (project / 'apps').mkdir()
    native = (project / 'kit/tools/build.py').read_bytes()
    selected = ['seats_easy_access'] + [app for app in ('storage', 'cluster_redline', 'idrive_circuit')
                                      if (ROOT / 'apps' / app / 'app.json').is_file()]
    command = [sys.executable, str(ROOT / 'tools/install-overlay.py'), str(project), '--apps'] + selected
    run(ROOT, *command)
    revised = (project / 'kit/tools/build.py').read_bytes()
    assert b'def build(app_id,' in revised and b'from seats_build' not in revised
    assert b'--preview-only' in revised
    run(ROOT, *command)
    assert revised == (project / 'kit/tools/build.py').read_bytes()
    run(project, sys.executable, 'kit/tools/build.py', '--preview-only', 'seats_easy_access')
    default_source = project / 'dist/seats_easy_access/source'
    default_locale = json.loads((default_source / 'javascript/kit/locale.json').read_text(encoding='utf-8'))
    assert default_locale['language'] == 'en'
    default_strings = json.loads((default_source / 'rhmiData/variantGroups/Common/texts/en_GB.json').read_text(encoding='utf-8'))
    assert default_strings['SID_SEATS_EASY_ACCESS_TITLE'] == 'Seats Easy Access'
    run(project, sys.executable, 'kit/tools/build.py', '--language', 'ko', '--preview-only', *selected)
    preview = project / 'dist/seats_easy_access/source'
    assert (preview / 'javascript/app.js').is_file()
    assert (preview / 'javascript/core.js').is_file()
    app = json.loads((preview / 'rhmiData/application.json').read_text(encoding='utf-8'))
    images = preview / 'rhmiData/variantGroups/Common/images'
    assert (images / 'seats_easy_access_icon.png').read_bytes() == (ROOT / 'apps/seats_easy_access/icon.png').read_bytes()
    assert (images / 'seat-control.png').is_file()
    ui = json.loads((preview / 'rhmiData/uiDescriptions/ID7/uiDescription.json').read_text(encoding='utf-8'))
    names = {c['name'] for s in ui['containers'].values() for c in s['components'].values()}
    assert {'SELECT_DRIVER', 'SELECT_PASSENGER', 'MAKE_ROOM', 'M1', 'M2', 'M3', 'STOP'} <= names
    ko_strings = json.loads((preview / 'rhmiData/variantGroups/Common/texts/en_GB.json').read_text(encoding='utf-8'))
    assert ko_strings['SID_SEATS_EASY_ACCESS_TITLE'] == '시트 Easy Access'
    # Only package assembly is tested with this nonfunctional, clearly marked SDK.
    sdk = project / 'oap-sdk'
    sdk.mkdir()
    (sdk / 'index.js').write_text("throw new Error('TEST FIXTURE SDK: never install');\n", encoding='utf-8')
    (sdk / 'package.json').write_text('{"name":"oap-sdk","version":"0.0.0-test"}', encoding='utf-8')
    # Simulate the user's no-Docker machine; real make_kit handles its own renderer fallback.
    boot = "import runpy,shutil,sys; sys.path.insert(0,'kit/tools'); w=shutil.which; shutil.which=lambda n:None if n=='docker' else w(n); sys.argv=" + repr(['kit/tools/make_kit.py'] + selected + ['--language', 'ko']) + "; runpy.run_path(sys.argv[0],run_name='__main__')"
    run(project, sys.executable, '-c', boot)
    kits = project / 'dist/mgu-custom-apps-ko'
    packages = list((kits / 'apps').glob('*.mgu'))
    assert len(packages) == len(selected)
    seat = next(p for p in packages if p.name.startswith('seats_easy_access@0.5.0-ko.'))
    with tarfile.open(seat) as archive:
        meta = json.load(archive.extractfile('meta.json'))
        pkg = json.load(archive.extractfile('source/package.json'))
        assert meta['version'] == pkg['version']
        assert 'source/node_modules/oap-sdk/index.js' in archive.getnames()
        assert 'rhmiData/resources/seat-control.png' in archive.getnames()
        assert 'oapgen/gen.js' in archive.getnames()
    for row in (kits / 'KIT_SUMS').read_text(encoding='utf-8').splitlines():
        digest, name = row.split('  ', 1)
        assert hashlib.md5((kits / name).read_bytes()).hexdigest() == digest
    with tarfile.open(project / 'dist/mgu-custom-apps-ko.tar.gz') as archive:
        assert 'mgu-custom-apps/apps/' + seat.name in archive.getnames()
    # No language argument must produce the English kit, with the normal unsuffixed version.
    english_boot = boot.replace(repr(['kit/tools/make_kit.py'] + selected + ['--language', 'ko']),
                                repr(['kit/tools/make_kit.py', 'seats_easy_access']))
    run(project, sys.executable, '-c', english_boot)
    english_package = project / 'dist/mgu-custom-apps/apps/seats_easy_access@0.5.0.mgu'
    with tarfile.open(english_package) as archive:
        assert json.load(archive.extractfile('source/javascript/kit/locale.json'))['language'] == 'en'
        assert 'source/javascript/i18n.js' in archive.getnames()
    (project / 'apps/seats_easy_access/main.js').write_text('// user edit', encoding='utf-8')
    before = (project / 'kit/tools/build.py').read_bytes()
    run(ROOT, *command, success=False)
    assert (project / 'apps/seats_easy_access/main.js').read_text() == '// user edit'
    assert (project / 'kit/tools/build.py').read_bytes() == before
    run(ROOT, *command, '--force')
    if args.prepare_store:
        for language in ['ko', 'en']:
            run(ROOT, sys.executable, 'tools/prepare-store.py', '--dist', str(project / 'dist'), '--language', language, '--apps', 'seats_easy_access')
            out = project / ('store-output-' + language)
            out.mkdir()
            run(ROOT, 'node', 'tools/store-build.js', '--template', 'seats_easy_access', '--id', 'seats_easy_access', '--version', '0.5.0', '--dir', 'apps/seats_easy_access', '--language', language, '--out', str(out))
            with tarfile.open(out / 'seats_easy_access@0.5.0.tgz') as archive:
                assert not any('node_modules' in name for name in archive.getnames())
                assert 'package/javascript/core.js' in archive.getnames()
                assert 'package/javascript/i18n.js' in archive.getnames()
                assert 'TEST FIXTURE SDK' not in ''.join(archive.getnames())
    print('PASS: native overlay + conflicts + English default + Korean + bilingual make_kit (' + ', '.join(selected) + ') + MGU resources + checksums')
    print('Package structure tested with a nonfunctional SDK fixture; real SDK/vehicle execution not tested.')
