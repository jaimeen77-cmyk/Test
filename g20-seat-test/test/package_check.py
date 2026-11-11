"""Validate the delivered USB catalog, archive, native screen and command boundaries."""
import hashlib
import json
from pathlib import Path
import tarfile
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
usb = root / 'dist/USB/mgu-repo/g20-seat-test'
catalog = json.loads((usb / 'catalog.json').read_text())
entry = catalog['components'][0]
package = usb / entry['artifact']['name']
assert entry['mguHmi'] == ['ID7']
assert entry['artifact']['size'] == package.stat().st_size
assert hashlib.sha256(package.read_bytes()).hexdigest() == entry['artifact']['sha256']
with tarfile.open(package) as archive:
    names = archive.getnames()
    assert all(n.startswith('package/') and '..' not in Path(n).parts for n in names)
    assert not any('/node_modules/' in n or n.endswith('hmictl') for n in names)
    def read(name): return archive.extractfile('package/' + name).read()
    pkg = json.loads(read('package.json'))
    assert pkg['name'] == entry['id'] and pkg['version'] == entry['version']
    assert pkg['mguHmi'] == ['ID7']
    assert 'package/' + pkg['main'] in names
    assert json.loads(read('config/base.json'))['rhmiLoadingEnabled'] is True
    ET.fromstring(read('rhmiData/uiDescriptions/ID7/application.xml'))
    ui = json.loads(read('rhmiData/uiDescriptions/ID7/uiDescription.json'))
    components = {c['name']: c for state in ui['containers'].values() for c in state['components'].values()}
    for name in ['ARM', 'PLUS', 'MINUS']:
        assert components[name]['properties']['Enabled']['value'] == 0
    korean = json.loads(read('rhmiData/variantGroups/Common/texts/ko_KR.json'))
    assert '시트' in korean['SID_G20_SEAT_TEST_TITLE']
    manifest = json.loads(read('manifest.json'))
    assert not any('Tasu' in iface for iface in manifest['proxies'])
    for iface in ['de.bmw.infotainment.vehicle.Vehicle2', 'de.bmw.infrastructure.VehicleInformation']:
        assert set(manifest['proxies'][iface]['attributes'].values()) == {'r'}
    assert b'iteriodev-comfort' in read('NOTICE')
print('PASS USB hash, OAP structure, RHMI XML/JSON, Korean resources, disabled controls, read-only vehicle interfaces and license notices')
