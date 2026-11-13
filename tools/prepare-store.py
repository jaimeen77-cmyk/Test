#!/usr/bin/env python3
"""Prepare SDK-free UI/runtime templates; app JavaScript stays in source."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def fingerprint(manifest, template):
    # Use the exact JavaScript canonicalization used by the Node 8 car builder,
    # including JSON number formatting for future fractional settings.
    code = "const fs=require('fs'),path=require('path');const b=require(path.join(process.argv[1],'tools/store-build.js'));process.stdout.write(b.fingerprint(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),process.argv[3]));"
    return subprocess.check_output(['node', '-e', code, str(ROOT), str(manifest), template], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, required=True, help='existing builds; never copied wholesale')
    parser.add_argument('--language', choices=('ko', 'en'), default='ko')
    parser.add_argument('--apps', nargs='+', help='only prepare selected original app IDs')
    args = parser.parse_args()
    destination = ROOT / 'store/runtime'
    destination.mkdir(parents=True, exist_ok=True)
    entries = json.loads((ROOT / 'mgu-repo.json').read_text(encoding='utf-8'))['components']
    for entry in entries:
        if entry['path'].startswith('store/apps/'):
            continue  # Language variants share these two original app sources.
        app_id = entry['id']
        if args.apps and app_id not in args.apps:
            continue
        app_dir = ROOT / entry['path']
        spec = json.loads((app_dir / 'app.json').read_text(encoding='utf-8'))
        if spec.get('supportedLanguages') and args.language not in spec['supportedLanguages']:
            continue
        suffix = '-ko.1' if args.language == 'ko' else ''
        package_path = args.dist / (app_id + '@' + spec['version'] + suffix + '.tgz')
        own = {'app.js'} | {p.name for p in app_dir.glob('*.js')}
        own.discard('main.js')
        with tempfile.TemporaryDirectory(prefix='jam-store-prepare-') as temp:
            stage = Path(temp) / 'package'
            stage.mkdir()
            with tarfile.open(package_path) as source:
                for member in source:
                    parts = PurePosixPath(member.name).parts
                    if not parts or parts[0] != 'package' or '..' in parts or member.issym() or member.islnk():
                        raise ValueError('Unexpected archive member: ' + member.name)
                    if 'node_modules' in parts:
                        continue  # Never extract or redistribute any SDK file.
                    relative = PurePosixPath(*parts[1:])
                    if len(parts) == 3 and parts[1] == 'javascript' and parts[2] in own:
                        continue  # Built from current repository JS on the head unit.
                    target = stage.joinpath(*relative.parts)
                    if member.isdir():
                        target.mkdir(parents=True, exist_ok=True)
                    elif member.isfile():
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(source.extractfile(member).read())
                    else:
                        raise ValueError('Unsupported archive member: ' + member.name)
            built_locale = json.loads((stage / 'javascript/kit/locale.json').read_text(encoding='utf-8'))
            assert built_locale['language'] == args.language
            assert not (stage / 'node_modules').exists()
            icon = stage / 'rhmiData/variantGroups/Common/images' / (app_id + '_icon.png')
            if not (app_dir / 'icon.png').exists():
                shutil.copy2(icon, app_dir / 'icon.png')
            runtime = app_id + ('.en' if args.language == 'en' else '')
            archive = destination / (runtime + '.tgz')
            with gzip.GzipFile(filename=str(archive), mode='wb', mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode='w') as result:
                    for file in sorted(stage.rglob('*')):
                        if not file.is_file():
                            continue
                        relative = file.relative_to(stage).as_posix()
                        info = tarfile.TarInfo('package/' + relative)
                        info.size = file.stat().st_size
                        info.mode = 0o644
                        with file.open('rb') as content:
                            result.addfile(info, content)
            with tarfile.open(archive) as result:
                names = result.getnames()
                assert not any('node_modules/' in name or '/oap-sdk/' in name for name in names)
                assert not any('package/javascript/' + name in names for name in own)
            data = archive.read_bytes()
            metadata = dict(schema=1, id=app_id, language=args.language, source_version=spec['version'],
                            ui_sha256=fingerprint(app_dir / 'app.json', app_id),
                            size=len(data), sha256=hashlib.sha256(data).hexdigest())
            # Small committed parts avoid oversized connector uploads. The car
            # joins them offline and verifies the complete archive checksum.
            metadata['parts'] = []
            for old_part in destination.glob(runtime + '.tgz.part-*'):
                old_part.unlink()
            for index, offset in enumerate(range(0, len(data), 192 * 1024)):
                name = runtime + '.tgz.part-' + str(index).zfill(2)
                (destination / name).write_bytes(data[offset:offset + 192 * 1024])
                metadata['parts'].append(name)
            (destination / (runtime + '.json')).write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
            # Small Store manifests only; app logic remains in apps/<original-id>.
            if not spec.get('supportedLanguages') or 'en' in spec['supportedLanguages']:
                variant = ROOT / 'store/apps' / (app_id + '_en')
                variant.mkdir(parents=True, exist_ok=True)
                (variant / 'app.json').write_text(json.dumps(dict(id=app_id + '_en', version=spec['version']), indent=2) + '\n', encoding='utf-8')
                shutil.copy2(app_dir / 'icon.png', variant / 'icon.png')
            print(app_id + ': ' + str(len(data)) + ' bytes; no SDK or app JavaScript in runtime template')


if __name__ == '__main__':
    main()
