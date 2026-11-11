#!/usr/bin/env python3
"""Build an SDK-free OAP package and a USB catalog. Python standard library only."""
import copy
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import struct
import sys
import tarfile
import uuid
import zipfile
import zlib

from rhmi_layout import build_ui, manifest_for, sid

ROOT = Path(__file__).resolve().parent.parent
ID = 'g20_seat_test'
VERSION = '0.1.0'
NS = uuid.UUID('367cc856-ae4d-4aef-b5a3-cd8b1997d25e')
LANGS = ['en_GB', 'en_US', 'ko_KR', 'de_DE']
ITEMS = [
    ['text3', 'STATUS', 'Read-only. Refresh status first.'],
    ['twocol', 'MODE', 'Mode'],
    ['twocol', 'DRIVER', 'Driver axes'],
    ['twocol', 'PASSENGER', 'Passenger axes'],
    ['twocol', 'VEHICLE', 'Vehicle'],
    ['button', 'REFRESH', 'Refresh status'],
    ['button', 'ARM', 'Passenger seat EMPTY: enable one test'],
    ['button', 'PLUS', 'Passenger fore/aft + : short test'],
    ['button', 'MINUS', 'Passenger fore/aft - : short test'],
    ['button', 'STOP', 'STOP / LOCK'],
    ['button', 'SAVE', 'Save diagnostic report'],
    ['text3', 'GUIDE', 'Park in P; parking brake on. Passenger seat empty.\nSTOP is a request, not a verified physical stop.'],
]
KOREAN = {
    'TITLE': '시트 테스트', 'MAIN_TITLE': '시트 테스트 0.1',
    'STATUS': '조회 전용으로 시작합니다. 상태를 먼저 확인하세요.',
    'MODE': '시험 상태', 'DRIVER': '운전석', 'PASSENGER': '조수석', 'VEHICLE': '차량 상태',
    'REFRESH': '상태 새로 확인', 'ARM': '빈 조수석 확인: 한 번만 이동 허용',
    'PLUS': '조수석 전후 + 짧게 시험', 'MINUS': '조수석 전후 - 짧게 시험',
    'STOP': '정지 요청 / 이동 잠금', 'SAVE': '진단 기록 저장',
    'GUIDE': '정차·P단·주차브레이크·빈 조수석에서 시험하세요.\n정지 요청이 실제 정지를 보장하지는 않습니다.',
}

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def uid(what):
    return str(uuid.uuid5(NS, ID + ':' + what))

def icon(path):
    w = h = 140
    pixels = [bytearray([16, 28, 48] * w) for _ in range(h)]
    def rect(x, y, width, height, color):
        for yy in range(y, y + height):
            for xx in range(x, x + width): pixels[yy][xx*3:xx*3+3] = bytes(color)
    rect(35, 25, 18, 62, (115, 195, 255))
    rect(45, 76, 54, 18, (115, 195, 255))
    rect(57, 98, 12, 15, (230, 240, 255))
    rect(30, 113, 73, 5, (230, 240, 255))
    def chunk(name, data):
        return struct.pack('!I', len(data)) + name + data + struct.pack('!I', zlib.crc32(name + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(row) for row in pixels)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', w, h, 8, 2, 0, 0, 0)) +
                     chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))

def archive(folder, output):
    with output.open('wb') as dest, gzip.GzipFile(fileobj=dest, mode='wb', mtime=0, filename='') as gz:
        with tarfile.open(fileobj=gz, mode='w') as tar:
            for file in sorted(folder.rglob('*')):
                if not file.is_file(): continue
                data = file.read_bytes()
                info = tarfile.TarInfo('package/' + file.relative_to(folder).as_posix())
                info.size = len(data); info.mode = 0o644; info.mtime = 0
                tar.addfile(info, io.BytesIO(data))

def main():
    dist = ROOT / 'dist'
    if dist.exists(): shutil.rmtree(dist)
    pkg = dist / 'staged'
    pkg.mkdir(parents=True)
    spec = {'id': ID, 'version': VERSION, 'title': 'Seat Test', 'screens': [
        {'name': 'MAIN', 'kind': 'list', 'title': 'Seat Test 0.1', 'items': ITEMS}],
        'signals': {
            'de.bmw.infotainment.vehicle.Vehicle2': {'statusCarSpeed2': 'r'},
            'de.bmw.infrastructure.VehicleInformation': {'statusGearboxDrive': 'r', 'DataPowerTrain2': 'r'},
        }}
    xml, ui, strings, _ = build_ui(spec)
    # Disabled in the installed resources as well as in the runtime policy.
    for container in ui['containers'].values():
        for component in container['components'].values():
            if component['name'] in ('ARM', 'PLUS', 'MINUS'):
                component.setdefault('properties', {})['Enabled'] = {'value': 0, 'type': 'UInt'}
    pkg_json = {
        'name': ID, 'version': VERSION, 'description': 'G20 experimental seat status and one-shot passenger test',
        'main': 'javascript/app.js', 'license': 'MIT', 'author': 'Custom vehicle test',
        'mguHmi': ['ID7'], 'engines': {'node': '>=8.7.0'},
        'oapAppSettings': {'maxDiskUsage': 2097152, 'cpuLimit': 15, 'memoryThresholdKB': 65536,
            'priority': 'PRIO_LOW', 'visibility': 'FOREGROUND', 'latencyClass': 'FOREGROUND',
            'loggingId': 'STST', 'userLoginRequired': False, 'backgroundPriority': 200, 'someipManifest': 'manifest.json'},
    }
    write_json(pkg / 'package.json', pkg_json)
    write_json(pkg / 'manifest.json', manifest_for(copy.deepcopy(spec)))
    write_json(pkg / 'npm-shrinkwrap.json', {'name': ID, 'version': VERSION, 'lockfileVersion': 1})
    write_json(pkg / 'config/base.json', {'rhmiLoadingEnabled': True, 'entryPointLoadingEnabled': True, 'settings': {ID: {}}})
    shutil.copytree(ROOT / 'src', pkg / 'javascript')
    shutil.copy(ROOT / 'vendor/permissions.json', pkg / 'permissions.json')
    shutil.copy(ROOT / 'LICENSE', pkg / 'LICENSE')
    shutil.copy(ROOT / 'NOTICE', pkg / 'NOTICE')
    shutil.copytree(ROOT / 'THIRD_PARTY_LICENSES', pkg / 'THIRD_PARTY_LICENSES')
    rhmi = pkg / 'rhmiData'
    write_json(rhmi / 'application.json', {'schemaVersion': '1.3.0', 'application': {
        'uuid': uid('app'), 'type': 'OnlineApp', 'name': ID, 'vendor': 'Custom vehicle test',
        'version': VERSION, 'defaultLanguage': 'en_GB', 'stringBundleUuid': uid('strings'), 'resourceBundleUuid': uid('resources'),
        'entryPoints': [{'name': 'G20_SEAT_TEST_ENTRY', 'uuid': uid('entry'), 'textId': sid(ID, 'TITLE'),
            'icon': ID + '_icon.png', 'insertionStateId': 20974, 'insertionFocusId': 2, 'insertionMode': 'INSERT_BELOW',
            'insertionOrder': 0, 'insertionPriority': 0, 'previewType': 'NONE', 'bookmarkable': True,
            'private': False, 'appearance': 'DEFAULT', 'isGroupHeader': False, 'insertionGroup': 0}],
        'uiDescriptions': [{'applicationFilePath': './uiDescriptions/ID7/application.xml',
            'uiDescriptionFilePath': './uiDescriptions/ID7/uiDescription.json', 'hmi': ['ID7']}],
        'variantGroups': [{'stringsPath': './variantGroups/Common/texts', 'resourcesPath': './variantGroups/Common/images',
            'hmi': ['ID7'], 'brands': ['BMW']}],
    }})
    write_json(rhmi / 'uiDescriptions/ID7/uiDescription.json', ui)
    (rhmi / 'uiDescriptions/ID7/application.xml').write_text(xml, encoding='utf-8')
    for lang in LANGS:
        translated = dict(strings)
        if lang == 'ko_KR': translated.update({sid(ID, key): value for key, value in KOREAN.items()})
        write_json(rhmi / ('variantGroups/Common/texts/' + lang + '.json'), translated)
    images = rhmi / 'variantGroups/Common/images'
    images.mkdir(parents=True); icon(images / (ID + '_icon.png'))
    usb = dist / 'USB/mgu-repo/g20-seat-test'
    usb.mkdir(parents=True)
    package = usb / (ID + '@' + VERSION + '.tgz')
    archive(pkg, package)
    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    write_json(usb / 'catalog.json', {'schema': 2, 'components': [{
        'id': ID, 'kind': 'app', 'version': VERSION, 'title': 'Seat Test (G20 experimental)',
        'description': 'Read-only startup; optional one-shot passenger fore/aft test.', 'mguHmi': ['ID7'],
        'uninstallable': True, 'requires': {'iteriodev-comfort': '0.5.1', 'mgu-deploy': '0.7.11'},
        'artifact': {'name': package.name, 'url': package.name, 'size': package.stat().st_size, 'sha256': digest},
    }]})
    shutil.copy(ROOT / 'README.ko.md', dist / 'USB/README.ko.md')
    shutil.copy(ROOT / 'TEST_RESULTS.md', dist / 'USB/TEST_RESULTS.md')
    (dist / 'USB/SHA256SUMS.txt').write_text(digest + '  mgu-repo/g20-seat-test/' + package.name + '\n')
    zip_path = dist / 'g20-seat-test-0.1.0-usb.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for file in sorted((dist / 'USB').rglob('*')):
            if file.is_file(): z.write(file, file.relative_to(dist / 'USB'))
    print('Built ' + str(zip_path))
    print('Package SHA256 ' + digest)

if __name__ == '__main__': main()
