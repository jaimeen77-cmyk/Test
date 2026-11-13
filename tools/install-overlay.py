#!/usr/bin/env python3
"""Install the Korean Seats source overlay into an MGU Store repository."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = 'seats_easy_access'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', type=Path, help='대상 apps 저장소 경로')
    parser.add_argument('--force', action='store_true', help='충돌하는 Seats 파일 교체')
    args = parser.parse_args()
    target = args.target.resolve()
    manifest = target / 'mgu-repo.json'
    if target == ROOT or not manifest.is_file():
        parser.error('별도의 MGU Store 저장소(mgu-repo.json 필요)를 지정하세요.')
    data = json.loads(manifest.read_text(encoding='utf-8'))
    components = data.setdefault('components', [])
    if not isinstance(components, list):
        parser.error('components가 목록인 저장소만 지원합니다.')
    entry = {
        'id': APP, 'version': '0.3.2', 'kind': 'app',
        'title': '시트 Easy Access', 'description': '시트 조절·메모리·승하차 편의·조수석 공간 확보',
        'path': 'apps/seats', 'mguHmi': ['ID7'], 'uninstallable': True,
        'requires': {'iteriodev-comfort': '0.5.1', 'mgu-deploy': '0.7.11'},
        'build': {'python': 'kit/tools/build.py', 'args': ['--language', 'ko', APP],
                  'output': 'dist/seats_easy_access@0.3.2.tgz'},
    }
    source = ROOT / 'apps/seats'
    files = {}
    for file in source.rglob('*'):
        relative = file.relative_to(source)
        if not file.is_file() or any(p in ('dist', '__pycache__') for p in relative.parts) or file.suffix == '.pyc':
            continue
        content = file.read_bytes()
        if relative.as_posix() == 'tools/build.py':
            content = content.replace(b"LANGS = ['en_GB', 'en_US', 'ko_KR', 'de_DE']", b"LANGS = ['ko_KR']")
            content = content.replace(b"'defaultLanguage': 'en_GB'", b"'defaultLanguage': 'ko_KR'")
        files[target / 'apps/seats' / relative] = content
    files[target / 'kit/tools/build.py'] = (ROOT / 'kit/tools/build.py').read_bytes()
    conflicts = [str(p) for p, content in files.items()
                 if p.exists() and (not p.is_file() or p.read_bytes() != content)]
    existing = [item for item in components if item.get('id') == APP]
    if existing and existing != [entry]:
        conflicts.append(str(manifest) + ' (Seats 항목)')
    if conflicts and not args.force:
        parser.error('충돌을 확인한 뒤 --force로 교체하세요: ' + ', '.join(conflicts))
    # Resolve all conflicts before writing any app files or metadata.
    for path, content in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    data['components'] = [item for item in components if item.get('id') != APP] + [entry]
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('한국어 Seats overlay 설치 완료:', target)
    print('MGU Store에서 대상 저장소의 main 소스를 새로고침하세요.')


if __name__ == '__main__':
    main()
