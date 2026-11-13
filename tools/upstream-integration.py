#!/usr/bin/env python3
"""Small, guarded edits for upstream's normal build and car installer paths."""
from pathlib import Path

BUILD_MARKER = '# Jam package metadata v1'
INSTALL_MARKER = '# Jam package start type v1'


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Unsupported upstream version: expected one integration anchor: ' + old[:95])
    return text.replace(old, new, 1)


def navigation_fonts_source(text):
    if '# Jam navigation Hangul fonts v2' in text:
        return shared_app_source(text)
    anchor = '    if preview_only:\n'
    addition = """    # Jam navigation Hangul fonts v2: phone labels can be Korean in the English app too.
    if app_id == 'cluster_redline' and language != 'ko':
        for filename in ('korean.json', 'OFL-NotoSansKR.txt'):
            shutil.copy(os.path.join(KIT, 'localization', 'fonts', filename),
                        os.path.join(src, 'javascript', 'kit', 'fonts', filename))
"""
    return shared_app_source(replace_once(text, anchor, addition + anchor))


def shared_app_source(text):
    """Generic app.json features, using the existing upstream build and archives."""
    if '# Jam shared app resources v1' in text:
        return app_locale_source(text)
    text = replace_once(text, "    spec = localize_spec(spec, language)",
        "    if spec.get('supportedLanguages') and language not in spec['supportedLanguages']:\n"
        "        raise SystemExit(app_id + ': supported languages: ' + ', '.join(spec['supportedLanguages']))\n"
        "    spec = localize_spec(spec, language)")
    text = replace_once(text, '        groups = []\n',
        "        groups = []\n"
        "        if scr.get('tabs'):\n"
        "            groups.append(('Bar', [comp('barbutton', b[0], rows=[text_row(b[0], b[1])]) for b in scr['tabs']]))\n")
    text = replace_once(text, "rows = [{'Graphic': {'value': '', 'type': 'Text'}}]\n                elif kindi",
        "rows = [{'Graphic': {'value': label, 'type': 'Text'}}]\n                elif kindi")
    anchor = "    make_icon(spec, os.path.join(pr, 'variantGroups', 'Common', 'images', icon))"
    addition = '''
    # Jam shared app resources v1: native packages and preview templates use the same assets.
    image_dir = os.path.join(pr, 'variantGroups', 'Common', 'images')
    if os.path.isfile(os.path.join(adir, 'icon.png')):
        shutil.copy(os.path.join(adir, 'icon.png'), os.path.join(image_dir, icon))
    for relative in spec.get('staticImages', []):
        source_image = os.path.abspath(os.path.join(adir, relative))
        if os.path.commonpath([source_image, os.path.abspath(adir)]) != os.path.abspath(adir):
            raise ValueError('Image must be inside app folder')
        shutil.copy(source_image, os.path.join(image_dir, os.path.basename(relative)))
'''
    text = replace_once(text, anchor, anchor + addition)
    # Installed RHMI resources must contain the same static images as the OAP tree.
    anchor = "    shutil.copy(os.path.join(pr, 'variantGroups', 'Common', 'images', icon), os.path.join(ir, 'resources', icon))"
    text = replace_once(text, anchor, anchor + "\n    for relative in spec.get('staticImages', []):\n        name = os.path.basename(relative)\n        shutil.copy(os.path.join(image_dir, name), os.path.join(ir, 'resources', name))")
    return app_locale_source(text)


def app_locale_source(text):
    if '# Jam per-app runtime translations v1' in text:
        return text
    anchor = "    locale = {'language': language, 'strings': load_locale(language)}"
    return replace_once(text, anchor, anchor + "\n    # Jam per-app runtime translations v1: do not alter another app's shared catalog.\n    locale['strings'] = dict(locale['strings'])\n    locale['strings'].update(spec.get('translations', {}).get(language, {}))")


def localize_source(text):
    if '# Jam per-app spec translations v1' in text:
        return text
    anchor = "    words = load_locale(language)\n    s = copy.deepcopy(spec)"
    addition = "    # Jam per-app spec translations v1\n    words = dict(load_locale(language))\n    words.update(spec.get('translations', {}).get(language, {}))\n    s = copy.deepcopy(spec)"
    text = replace_once(text, anchor, addition)
    return replace_once(text, "        for button in screen.get('buttons', []):", "        for button in screen.get('buttons', []) + screen.get('tabs', []):")


def build_source(text):
    if BUILD_MARKER in text:
        return navigation_fonts_source(text)
    anchor = "    json.dump(pkg, open(os.path.join(src, 'package.json'), 'w', encoding='utf-8', newline='\\n'), indent=2)"
    addition = '''    # Jam package metadata v1: normal apps keep their existing manual startup.
    if 'mguAppStartType' in spec:
        if spec['mguAppStartType'] not in ('manually', 'autostart'):
            raise ValueError('Invalid mguAppStartType')
        pkg['mguAppStartType'] = spec['mguAppStartType']
    if 'mguLocalOnly' in spec:
        if not isinstance(spec['mguLocalOnly'], bool):
            raise ValueError('Invalid mguLocalOnly')
        pkg['mguLocalOnly'] = spec['mguLocalOnly']
    if 'mguClusterRenderMinVersion' in spec:
        if not isinstance(spec['mguClusterRenderMinVersion'], str) or not re.fullmatch(r'\\d+\\.\\d+\\.\\d+', spec['mguClusterRenderMinVersion']):
            raise ValueError('Invalid mguClusterRenderMinVersion')
        pkg['mguClusterRenderMinVersion'] = spec['mguClusterRenderMinVersion']
'''
    return navigation_fonts_source(replace_once(text, anchor, addition + anchor))


APP_START_HELPER = '''# Jam package start type v1: validate before registry or app files are changed.
app_start_type() {
    "$NODE" - "$1" <<'JAM_METADATA'
const fs = require('fs');
try {
    const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const start = p.mguAppStartType === undefined ? 'manually' : p.mguAppStartType;
    if (start !== 'manually' && start !== 'autostart') throw new Error('Invalid mguAppStartType');
    if (p.mguClusterRenderMinVersion !== undefined) {
        const minimum = p.mguClusterRenderMinVersion;
        if (typeof minimum !== 'string' || !/^\\d+\\.\\d+\\.\\d+$/.test(minimum)) throw new Error('Invalid cluster-render requirement');
        // Jam renderer discovery v2: prefer active metadata; old layouts store it at the tool root.
        let component;
        for (const file of ['/var/opt/cluster-render/current/component.json', '/var/opt/cluster-render/component.json']) {
            try { component = JSON.parse(fs.readFileSync(file, 'utf8')); break; }
            catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
        if (!component) throw new Error('cluster-render metadata missing; need >= ' + minimum + ' (0.3.1 is older than 0.3.10)');
        if (component.id !== 'cluster-render' || typeof component.version !== 'string' || !/^\\d+\\.\\d+\\.\\d+$/.test(component.version)) throw new Error('cluster-render metadata is invalid');
        const have = component.version.split('.').map(Number), want = minimum.split('.').map(Number);
        let enough = true;
        for (let i = 0; i < 3; i++) {
            if (have[i] !== want[i]) { enough = have[i] > want[i]; break; }
        }
        if (!enough) throw new Error('cluster-render >= ' + minimum + ' required; found ' + component.version + '. Update the renderer (current upstream: 0.4.0).');
    }
    process.stdout.write(start);
} catch (e) { console.error('[mgu-app] package requirements: ' + e.message); process.exit(1); }
JAM_METADATA
}

'''


OPTIONAL_GUIDANCE_MARKER = '// Jam optional guidance fields v3'


def _optional_guidance_source_v3(text):
    if OPTIONAL_GUIDANCE_MARKER in text:
        if '// Jam optional guidance field persistence v3' in text:
            return text
        return replace_once(text, '        if (!Object.keys(missing).length) process.exit(0);',
            '        // Jam optional guidance field persistence v3\n        fs.writeFileSync(mf, JSON.stringify(m, null, 1));\n        if (!Object.keys(missing).length) process.exit(0);')
    original = '        for (const i of Object.keys(opt)) if (!have[i]) { missing[i] = opt[i]; delete m.proxies[i]; }'
    prior = """        // Jam optional guidance getter v1: polling needs a getter, not only a notifier.
        const supportsOptional = (i) => {
            if (!have[i]) return false;
            if (i !== "de.bmw.infotainment.navigation.guiding.Guidance") return true;
            const field = have[i].fields && have[i].fields.guidanceState;
            return !!(field && field.getter);
        };
        for (const i of Object.keys(opt)) if (!supportsOptional(i)) { missing[i] = opt[i]; delete m.proxies[i]; }"""
    after = """        // Jam optional guidance fields v3: the runtime connects to Main_Instance.
        const all = JSON.parse(fs.readFileSync(catalog, "utf8"));
        const supportsOptional = (i) => {
            if (!have[i]) return false;
            if (i !== "de.bmw.infotainment.navigation.guiding.Guidance") return true;
            const field = have[i].fields && have[i].fields.guidanceState;
            const instances = all.instanceIDs && all.instanceIDs[i];
            const named = instances && Object.prototype.hasOwnProperty.call(instances, "Main_Instance") && instances.Main_Instance != null;
            return !!(field && field.getter && field.getter.id && named);
        };
        for (const i of Object.keys(opt)) if (!supportsOptional(i)) { missing[i] = opt[i]; delete m.proxies[i]; }
        const nav="de.bmw.infotainment.navigation.guiding.Guidance";
        if(opt[nav] && m.proxies[nav]) {
            const attrs=m.proxies[nav].attributes||{};
            ["guidanceState","guidingProvider","conclusiveDart"].forEach((key)=>{
                const item=have[nav].fields&&have[nav].fields[key];
                if(!item||!item.getter||!item.getter.id)delete attrs[key];
                else if(attrs[key]&&(!item.notifier||!item.notifier.id))attrs[key]=attrs[key].replace(/s/g,"");
            });
        }"""
    # Upstream since issue #145 (2026-11-11) prunes fields, instances and optional interfaces itself in one
    # loop and exits on `changed`; the Jam checks then run after it, before that exit.
    generic_exit = '        if (!changed) process.exit(0);'
    if original not in text and '// Jam optional guidance getter v1' not in text and '// Jam optional guidance instance v2' not in text \
            and text.count(generic_exit) == 1 and 'const db = JSON.parse(fs.readFileSync(catalog, "utf8"))' in text:
        generic = after.replace('        for (const i of Object.keys(opt)) if (!supportsOptional(i)) { missing[i] = opt[i]; delete m.proxies[i]; }',
            '        for (const i of Object.keys(opt)) if (m.proxies[i] && !supportsOptional(i)) { missing[i] = opt[i]; delete m.proxies[i]; changed = true; }')
        persistence = ('        // Jam optional guidance field persistence v3\n'
                       '        fs.writeFileSync(mf, JSON.stringify(m, null, 1));\n'
                       '        if (Object.keys(missing).length) changed = true;\n')
        return text.replace(generic_exit, generic + '\n' + persistence + generic_exit, 1)
    if '// Jam optional guidance instance v2' in text:
        start=text.index('        // Jam optional guidance instance v2')
        end=text.index('        for (const i of Object.keys(opt)) if (!supportsOptional(i)) { missing[i] = opt[i]; delete m.proxies[i]; }',start)
        end+=len('        for (const i of Object.keys(opt)) if (!supportsOptional(i)) { missing[i] = opt[i]; delete m.proxies[i]; }')
        return _optional_guidance_source_v3(text[:start]+after+text[end:])
    return _optional_guidance_source_v3(replace_once(text, prior if '// Jam optional guidance getter v1' in text else original, after))


OPTIONAL_PROJECTION_MARKER = '// Jam optional projection managers v4'



OPTIONAL_HUD_MARKER = '// Jam optional HUD rendered guidance v5'
OPTIONAL_ROUTE_EVENTS_MARKER = '// Jam optional route events query v6'


def optional_lane_source(text):
    if '// Jam optional lane guidance v9' in text:
        return text
    addition = r"""        // Jam optional lane guidance v9: read the supplied CarPlay lane group only.
        const laneName = "de.bmw.infotainment.navigation.projectedmodeguiding.ProjectedModeGuiding";
        if (opt[laneName] && m.proxies[laneName]) {
            const d=have[laneName], ids=all.instanceIDs&&all.instanceIDs[laneName];
            const f=d&&d.fields&&d.fields.currentLaneGuiding;
            if(!d||d.serviceId!==64309||!d.version||d.version.major!==1||!ids||ids.Main_Instance!==128||!f||!f.getter||f.getter.id!==7){
                missing[laneName]=opt[laneName];delete m.proxies[laneName];
            }else{
                const p=m.proxies[laneName];p.instances="Main_Instance";
                p.attributes={currentLaneGuiding:f.notifier&&f.notifier.id===32772?"rs":"r"};
                delete p.methods;delete p.broadcasts;
            }
        }
"""
    anchor = '        // Jam optional guidance field persistence v3'
    return replace_once(text, anchor, addition + anchor)


def optional_aux_source(text):
    if '// Jam optional auxiliary fields v10' in text:
        return optional_lane_source(text)
    if '// Jam optional auxiliary fields v9' in text:
        v9 = '        // Jam optional auxiliary fields v9: never drop required RPM/torque for an absent extra field; notifier-only fields are subscribed.'
        text = replace_once(text, v9, '        // Jam optional auxiliary fields v10: never drop required RPM/torque for an absent extra field; notifier-only fields and the exterior temperature (as eDrive) are subscribed.')
        text = replace_once(text, '            else proxy.attributes[name]=getter ? (notifier ? "rs" : "r") : "s";\n', '            else proxy.attributes[name]=notifier && name==="ExteriorTemperature" ? "s" : getter ? (notifier ? "rs" : "r") : "s";\n')
        return optional_lane_source(text)
    addition = r"""        // Jam optional auxiliary fields v10: never drop required RPM/torque for an absent extra field; notifier-only fields and the exterior temperature (as eDrive) are subscribed.
        const auxiliaryFields = [
            ["de.bmw.infotainment.vehicle.CDS", "statusEngineTemperature"],
            ["de.bmw.infotainment.vehicle.CDS", "statusBattery2"],
            ["de.bmw.infotainment.KombiIF", "statusBordcomputerAverage"],
            ["de.bmw.infotainment.drivingexcitement.FES", "statusSwitchDriveDynamicSport2"],
            ["de.bmw.infotainment.vehicle.CDS2", "statusInjectionVolume"],
            ["de.bmw.infotainment.vehicle.CDS2", "statusLateralAccelerationMassCenter"],
            ["de.bmw.infotainment.vehicle.CDS2", "statusLongitudinalAccelerationMassCenter"],
            ["de.bmw.infrastructure.EnvironmentalInformation", "ExteriorTemperature"]
        ];
        auxiliaryFields.forEach(entry => {
            const proxy=m.proxies[entry[0]], name=entry[1];
            if(!proxy || !proxy.attributes || proxy.attributes[name]===undefined)return;
            const field=have[entry[0]] && have[entry[0]].fields && have[entry[0]].fields[name];
            const validId=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
            const getter=field && field.getter && validId(field.getter.id,1,32767), notifier=field && field.notifier && validId(field.notifier.id,32768,65535);
            if(!getter && !notifier)delete proxy.attributes[name];
            else proxy.attributes[name]=notifier && name==="ExteriorTemperature" ? "s" : getter ? (notifier ? "rs" : "r") : "s";
        });
        ["de.bmw.infotainment.vehicle.CDS2","de.bmw.infotainment.KombiIF"].forEach(iface=>{if(m.proxies[iface]&&!Object.keys(m.proxies[iface].attributes||{}).length)delete m.proxies[iface];});
        const tasu="com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu",def=have[tasu],ids=all.instanceIDs&&all.instanceIDs[tasu];
        if(m.proxies[tasu]){
            if(!def||def.serviceId!==63654||!def.version||def.version.major!==1||!ids||ids.SystemFunctionsInternalTasuInst1!==128||!def.methods||!def.methods.sendTasuRequest||def.methods.sendTasuRequest.methodId!==1||!def.events||!def.events.sendTasuResponse||def.events.sendTasuResponse.eventId!==32769)delete m.proxies[tasu];
            else m.proxies[tasu]={instances:"SystemFunctionsInternalTasuInst1",methods:["sendTasuRequest"],broadcasts:["sendTasuResponse"]};
        }
"""
    marker = next((m for m in ('        // Jam optional auxiliary fields v8', '        // Jam optional auxiliary fields v7') if m in text), None)
    if marker:
        start = text.index(marker)
        end = text.index('        // Jam optional guidance field persistence v3', start)
        return optional_lane_source(text[:start] + addition + text[end:])
    return optional_lane_source(replace_once(text, '        // Jam optional guidance field persistence v3', addition + '        // Jam optional guidance field persistence v3'))


def optional_route_events_source(text):
    if OPTIONAL_ROUTE_EVENTS_MARKER in text:
        return optional_aux_source(text)
    addition = r"""        // Jam optional route events query v6
        const eventList = "de.bmw.infotainment.navigation.guiding.GuidanceEventList";
        if (opt[eventList] && m.proxies[eventList]) {
            const definition = have[eventList], named = all.instanceIDs && all.instanceIDs[eventList];
            const method = definition && definition.methods && definition.methods.queryContent;
            if (!definition || definition.serviceId !== 64283 || !definition.version || definition.version.major !== 5 ||
                !named || named.Main_Instance !== 128 || !method || method.methodId !== 4) {
                missing[eventList] = opt[eventList]; delete m.proxies[eventList];
            } else {
                m.proxies[eventList].attributes = {};
                m.proxies[eventList].methods = ["queryContent"];
                m.proxies[eventList].instances = "Main_Instance";
                delete m.proxies[eventList].broadcasts;
            }
        }
"""
    return optional_aux_source(replace_once(text, '        // Jam optional guidance field persistence v3', addition + '        // Jam optional guidance field persistence v3'))


def optional_hud_source(text):
    if OPTIONAL_HUD_MARKER in text:
        return optional_route_events_source(text)
    addition = r"""        // Jam optional HUD rendered guidance v5
        const hudName = "de.bmw.infotainment.navigation.guiding.GuidanceRenderedContent";
        if (opt[hudName] && m.proxies[hudName]) {
            const definition = have[hudName], named = all.instanceIDs && all.instanceIDs[hudName];
            const instance = named && named.Main_Instance;
            const field = definition && definition.fields && definition.fields.registeredViews;
            const methods = ["getViewConfig", "getViewContent"];
            const valid = v => typeof v === "number" && isFinite(v) && Math.floor(v) === v && v > 0 && v < 0x8000;
            if (!field || !field.getter || !valid(field.getter.id) || typeof instance !== "number" || !isFinite(instance) ||
                Math.floor(instance) !== instance || instance < 0 || instance > 65535 ||
                methods.some(n => !definition.methods || !definition.methods[n] || !valid(definition.methods[n].methodId))) {
                missing[hudName] = opt[hudName]; delete m.proxies[hudName];
            } else {
                m.proxies[hudName].attributes = {registeredViews: "r"};
                m.proxies[hudName].methods = methods;
            }
        }
"""
    return optional_route_events_source(replace_once(text, '        // Jam optional guidance field persistence v3', addition + '        // Jam optional guidance field persistence v3'))

def optional_guidance_source(text):
    text = _optional_guidance_source_v3(text)
    if OPTIONAL_PROJECTION_MARKER in text:
        return optional_hud_source(text)
    projection = r"""        // Jam optional projection managers v4: named phone guidance inputs.
        // Keep this whitelist here; do not execute app-provided JS as root.
        const projected = [
            ["de.bmw.infotainment.sdi.aap.androidautoprojectedmanager.AndroidAutoProjectedManager", "AndroidAutoProjectedManagerInst1"],
            ["de.bmw.infotainment.a4a.carplay.CarPlayManager", "CarPlayManagerInst1"]
        ];
        const projectionGetter = (v) => typeof v === "number" && isFinite(v) && Math.floor(v) === v && v > 0 && v < 0x8000;
        const projectionNotifier = (v) => v && typeof v.id === "number" && isFinite(v.id) && Math.floor(v.id) === v.id && v.id >= 0x8000 && v.id <= 0xffff;
        projected.forEach((entry) => {
            const name = entry[0], instanceName = entry[1], proxy = m.proxies[name];
            if (!opt[name] || !proxy) return;
            const fields = have[name] && have[name].fields || {}, active = fields.projectedGuidanceActive;
            const named = all.instanceIDs && all.instanceIDs[name];
            const instance = named && Object.prototype.hasOwnProperty.call(named, instanceName) ? named[instanceName] : null;
            const attributes = proxy.attributes || {}, flags = attributes.projectedGuidanceActive;
            if (!active || !active.getter || !projectionGetter(active.getter.id) || typeof instance !== "number" ||
                !isFinite(instance) || Math.floor(instance) !== instance || instance < 0 || instance > 0xffff ||
                typeof flags !== "string" || flags.indexOf("r") < 0) {
                missing[name] = opt[name]; delete m.proxies[name]; return;
            }
            ["projectedGuidanceActive", "projectedGuidanceMetadataAvailable"].forEach((key) => {
                const field = fields[key], requested = attributes[key];
                if (requested === undefined) return;
                if (!field || !field.getter || !projectionGetter(field.getter.id) || typeof requested !== "string") {
                    delete attributes[key]; return;
                }
                const readable = requested.replace(/w/g, "");
                const supported = projectionNotifier(field.notifier) ? readable : readable.replace(/s/g, "");
                if (supported) attributes[key] = supported;
                else delete attributes[key];
            });
        });
"""
    anchor = '        // Jam optional guidance field persistence v3'
    return optional_hud_source(replace_once(text, anchor, projection + anchor))


def installer_source(text):
    text = optional_guidance_source(text)
    if INSTALL_MARKER in text:
        if 'Jam renderer discovery v2' not in text:
            text = replace_once(text, "        const component = JSON.parse(fs.readFileSync('/var/opt/cluster-render/current/component.json', 'utf8'));", """        // Jam renderer discovery v2: prefer active metadata; old layouts store it at the tool root.
        let component;
        for (const file of ['/var/opt/cluster-render/current/component.json', '/var/opt/cluster-render/component.json']) {
            try { component = JSON.parse(fs.readFileSync(file, 'utf8')); break; }
            catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
        if (!component) throw new Error('cluster-render metadata missing; need >= ' + minimum + ' (0.3.1 is older than 0.3.10)');""")
            text = replace_once(text, "if (!enough) throw new Error('cluster-render ' + minimum + '+ required');", "if (!enough) throw new Error('cluster-render >= ' + minimum + ' required; found ' + component.version + '. Update the renderer (current upstream: 0.4.0).');")
        return text
    text = replace_once(text, 'custom_list() {', APP_START_HELPER + 'custom_list() {')
    text = replace_once(text,
        'const fs = require("fs"), f = process.argv[1], op = process.argv[2], id = process.argv[3];',
        'const fs = require("fs"), f = process.argv[1], op = process.argv[2], id = process.argv[3], start = process.argv[4] || "manually";')
    text = replace_once(text,
        'if (op === "add") c[id] = c[id] || { "-appStartType": "manually", "-userLoginRequired": "false" };',
        'if (op === "add") c[id] = Object.assign({}, c[id] || {}, { "-appStartType": start, "-userLoginRequired": "false" });')
    text = replace_once(text,
        '\' "$CUSTOM" "$1" "$2" || warn "could not update $CUSTOM"',
        '\' "$CUSTOM" "$1" "$2" "${3:-manually}" || warn "could not update $CUSTOM"')
    anchor = '    optional_missing "$TMP" || die "cannot read $pkg or $CATALOG"'
    if text.count(anchor) != 2:
        raise ValueError('Unsupported installer: verify and install requirement anchors changed')
    text = text.replace(anchor,
        '    start_type=$(app_start_type "$TMP/source/package.json") || die "package requirements failed for $id"\n' + anchor)
    text = replace_once(text, '"-appStartType":"manually"', '"-appStartType":"%s"')
    text = replace_once(text, '\' "$u" > "$REG/$id.json"', '\' "$u" "$start_type" > "$REG/$id.json"')
    text = replace_once(text, '    custom_list add "$id"', '    custom_list add "$id" "$start_type"')
    return text



def kit_source(text):
    if '# Jam cluster diagnostic v1' in text:
        return text
    before = "    for src, dst in CAR_FILES:"
    addition = """    # Jam cluster diagnostic v1: standalone, read-only by default; explicit setup/restore options.
    if 'cluster_redline' in apps:
        shutil.copyfile(os.path.join(ROOT, 'apps', 'cluster_redline', 'renderer.js'),
                        os.path.join(OUT, 'cluster-redline-renderer.js'))
"""
    text = replace_once(text, before, addition + before)
    checksum = "    with open(os.path.join(OUT, 'KIT_SUMS'), 'w', encoding='utf-8', newline='\\n') as f:"
    extra = "    if os.path.isfile(os.path.join(OUT, 'cluster-redline-renderer.js')): names.append('cluster-redline-renderer.js')\n"
    return replace_once(text, checksum, extra + checksum)


def settings_runtime_source(text):
    marker = '// Jam custom settings isolation v1'
    if marker not in text:
        text = replace_once(text, 'function wireSettings(ctx) {', '''function wireSettings(ctx, customUI) {
    // Jam custom settings isolation v1: custom pages own their controls;
    // never refresh the unused generated SETTINGS page for every coordinate.
    if (customUI === true) return;''')
        text = replace_once(text, "wireSettings(ctx), 3000)", "wireSettings(ctx, !!(impl && impl.settingsUI === 'custom')), 3000)")
    if '// Jam batched settings v1' not in text:
        anchor = '    onChange(fn) { this.listeners.push(fn); }'
        addition = '''    // Jam batched settings v1: publish all values before one persisted write.
    // Existing set() semantics and other apps' generic settings stay unchanged.
    setMany(changes) {
        const keys = Object.keys(changes).filter((key) => this.values[key] !== changes[key]);
        if (!keys.length) return false;
        keys.forEach((key) => { this.values[key] = changes[key]; });
        try { fs.writeFileSync(this.file, JSON.stringify(this.values, null, 1)); }
        catch (e) { log.warn('settings save: ' + e); }
        keys.forEach((key) => this.listeners.forEach((fn) => {
            try { fn(key, this.values[key]); } catch (e) { log.error(e); }
        }));
        return true;
    }
'''
        text = replace_once(text, anchor, addition + anchor)
    return text


def plan_upstream(target):
    target = Path(target)
    changes = {}
    for name, transform in [('kit/tools/build.py', build_source), ('deploy/mgu-app-install.sh', installer_source),
                            ('kit/tools/make_kit.py', kit_source), ('kit/runtime/mgu.js', settings_runtime_source)]:
        path = target / name
        if not path.is_file():
            raise ValueError('Missing upstream integration file: ' + str(path))
        original = path.read_bytes().decode('utf-8').replace('\r\n', '\n')
        revised = transform(original)
        if revised != original:
            changes[path] = revised
    locale = target / 'kit/tools/localize.py'
    if locale.is_file():
        original = locale.read_text(encoding='utf-8')
        revised = localize_source(original)
        if revised != original:
            changes[locale] = revised
    return changes
