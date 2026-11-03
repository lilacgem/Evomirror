"""Compile an explicitly local, legacy-derived prototype state package."""
import argparse
import json
import math
import os
from pathlib import Path
import sys
import tempfile

try:
    from scripts.adapt_lineage import LineageError, canonical_bytes, digest, validate_record
except ModuleNotFoundError:
    from adapt_lineage import LineageError, canonical_bytes, digest, validate_record

SCHEMA = 'AUEVO-Compiler3Prototype/v0.1'
TRANSFORM = {
    'id': 'legacy-orb-compatibility', 'version': '0.1',
    'formulas': {'glow': 'intensity/10', 'density': '(focus+complexity)/2', 'motion': 'activity',
                 'complexity': 'complexity', 'coreIntensity': '(intensity/10+focus)/2'},
    'range': [0, 1], 'invalidInput': 'reject', 'scientificallyValidated': False,
}
PROFILE = {'id': 'legacy-orb-baseline', 'version': '0.1', 'liveModulation': 'not implemented'}
PALETTE = {'primaryColor': '#D62BB7', 'secondaryColor': '#27BDE2', 'coreColor': '#FFD98A'}


def fail(code, message, path=None):
    raise LineageError(code, message, path)


def hash_json(value):
    return digest(canonical_bytes(value))


def load_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                fail('INPUT_INVALID', 'Duplicate JSON key.', key)
            result[key] = value
        return result
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=pairs,
                          parse_constant=lambda value: fail('INPUT_INVALID', 'Non-finite JSON number.'))
    except LineageError:
        raise
    except (OSError, ValueError, UnicodeError) as error:
        raise LineageError('INPUT_INVALID', 'Unable to read valid UTF-8 JSON.', str(path)) from error


def validate_permissions(policy):
    expected = {'schema', 'scope', 'allowCompile', 'allowPersist', 'allowExport', 'allowCloudUpload', 'retention'}
    if not isinstance(policy, dict) or set(policy) != expected:
        fail('INPUT_INVALID', 'Permission record must contain exactly the documented fields.', 'permissions')
    if policy['schema'] != 'AUEVO-LocalPermissions/v0.1':
        fail('SCHEMA_UNSUPPORTED', 'Unsupported permissions schema.', 'permissions.schema')
    if policy['scope'] != 'local-prototype' or any(type(policy[key]) is not bool for key in ('allowCompile', 'allowPersist', 'allowExport', 'allowCloudUpload')):
        fail('INPUT_INVALID', 'Local scope and boolean permissions required.', 'permissions')
    if policy['allowCloudUpload'] or policy['allowExport']:
        fail('PERMISSION_DENIED', 'This prototype supports local compilation only, not sharing or cloud grants.', 'permissions')
    if not policy['allowCompile']:
        fail('PERMISSION_DENIED', 'Compilation is not permitted.', 'permissions.allowCompile')
    if not isinstance(policy['retention'], str) or not policy['retention'].strip():
        fail('RETENTION_UNSET', 'Explicit local retention choice required.', 'permissions.retention')


def orb_from_inputs(values):
    intensity, focus, activity, complexity = (values[key] for key in ('intensity', 'focus', 'activity', 'complexity'))
    values = {'glow': intensity / 10, 'density': (focus + complexity) / 2,
              'motion': activity, 'complexity': complexity, 'coreIntensity': (intensity / 10 + focus) / 2}
    return {key: round(value, 12) for key, value in values.items()}


def values_from_lineage(lineage):
    parsed = lineage['payload']['source']['parsed']
    configuration = lineage['payload']['configuredInputs']
    return {'intensity': parsed['intensity'], 'focus': parsed['focus'],
            'activity': configuration['activity']['value'], 'complexity': configuration['complexity']['value']}


def verify_package(package):
    try:
        if package['schema'] != SCHEMA:
            fail('SCHEMA_UNSUPPORTED', 'Unsupported prototype package schema.', 'schema')
        content = {key: value for key, value in package.items() if key != 'packageHash'}
        if hash_json(content) != package['packageHash']:
            fail('HASH_MISMATCH', 'Package hash mismatch.', 'packageHash')
        state = package['state']
        state_content = {key: value for key, value in state.items() if key not in ('stateId', 'stateContentHash')}
        state_hash = hash_json(state_content)
        if state_hash != state['stateContentHash'] or state['stateId'] != f'prototype-state:sha256:{state_hash}':
            fail('HASH_MISMATCH', 'State hash mismatch.', 'state')
        for name, expected in package['manifest'].items():
            if name not in ('state', 'provenance', 'changes', 'experience', 'explanation') or hash_json(package[name]) != expected:
                fail('HASH_MISMATCH', 'Member hash mismatch.', name)
        if set(package['manifest']) != {'state', 'provenance', 'changes', 'experience', 'explanation'}:
            fail('INPUT_INVALID', 'Incomplete member manifest.', 'manifest')
        if type(state['generation']) is not int or state['generation'] < 1:
            fail('PRIOR_STATE_MISMATCH', 'Invalid state generation.', 'state.generation')
        if (state['generation'] == 1) != (state['priorStateId'] is None):
            fail('PRIOR_STATE_MISMATCH', 'Invalid predecessor for generation.', 'state.priorStateId')
        validate_permissions(state['permissions'])
        snapshot = package['provenance']['lineageSnapshot']
        validate_record(snapshot)
        if state['inputs']['lineageId'] != snapshot['recordId'] or state['inputs']['lineageHash'] != snapshot['contentHash']:
            fail('REFERENCE_UNRESOLVED', 'State does not reference the preserved lineage snapshot.', 'state.inputs')
        if state['configuredValues'] != values_from_lineage(snapshot):
            fail('INPUT_INVALID', 'Configured values do not match preserved inputs.', 'state.configuredValues')
        expected_orb = {**orb_from_inputs(state['configuredValues']), **PALETTE}
        if state['legacyOrb'] != expected_orb or package['experience']['legacyOrb'] != expected_orb:
            fail('INPUT_INVALID', 'Orb values do not match compatibility formulas.', 'state.legacyOrb')
        if state['transformSet'] != {'definition': TRANSFORM, 'sha256': hash_json(TRANSFORM)} or state['renderProfile'] != {'definition': PROFILE, 'sha256': hash_json(PROFILE)}:
            fail('TRANSFORM_UNAVAILABLE', 'Unknown transform/profile definition.', 'state.transformSet')
        if package['experience']['stateId'] != state['stateId'] or package['experience']['stateHash'] != state_hash:
            fail('REFERENCE_UNRESOLVED', 'Experience does not reference this state.', 'experience')
        for name, value in orb_from_inputs(state['configuredValues']).items():
            if state['channels'][name]['value'] != value or state['channels'][name]['evidenceClass'] != 'DERIVED':
                fail('INPUT_INVALID', 'Channel value or evidence class is inconsistent.', 'state.channels')

    except LineageError:
        raise
    except (KeyError, TypeError, ValueError) as error:
        raise LineageError('INPUT_INVALID', 'Malformed prototype package.') from error
    return package


def compile_package(lineage, permissions, prior=None, claims=None):
    """Pure compatibility computation; no final dimensions or learned equation inferred."""
    validate_record(lineage)
    validate_permissions(permissions)
    if prior is not None:
        verify_package(prior)
    inputs = values_from_lineage(lineage)
    # Claims are assertions for conflict detection only. They never silently override a source.
    if claims is None:
        claims = []
    if not isinstance(claims, list):
        fail('INPUT_INVALID', 'Claims must be a list.', 'claims')
    seen = set()
    for claim in claims:
        if not isinstance(claim, dict) or set(claim) != {'recordId', 'field', 'value'}:
            fail('INPUT_INVALID', 'Claim requires recordId, field and value.', 'claims')
        field, value, record_id = claim['field'], claim['value'], claim['recordId']
        if not isinstance(field, str) or field not in inputs or not isinstance(record_id, str) or not record_id or record_id in seen:
            fail('INPUT_INVALID', 'Invalid claim field or duplicate/missing record ID.', 'claims')
        seen.add(record_id)
        if type(value) not in (int, float) or not math.isfinite(value):
            fail('INPUT_INVALID', 'Claim value must be finite numeric.', 'claims')
        if value != inputs[field]:
            fail('CONFLICT_UNRESOLVED', 'Claim conflicts with legacy/configured input; explicit correction handling is not implemented.', field)
    build = digest(Path(__file__).read_bytes())
    producer = {'name': 'AUEVO local prototype compiler', 'version': '0.1.0', 'buildHash': build}
    claims = sorted(claims, key=lambda value: value['recordId'])
    if prior is not None and prior['state']['inputs'] == {'lineageId': lineage['recordId'], 'lineageHash': lineage['contentHash'], 'claims': claims} and prior['state']['permissions'] == permissions and prior['state']['producer'] == producer:
        return prior  # An exact replay does not manufacture a new generation.
    orb = orb_from_inputs(inputs)
    state = {
        'schema': 'AUEVO-LegacyDerivedState/v0.1', 'status': 'prototype-legacy-derived',
        'generation': 1 if prior is None else prior['state']['generation'] + 1,
        'priorStateId': None if prior is None else prior['state']['stateId'],
        'priorStateHash': None if prior is None else prior['state']['stateContentHash'],
        'producer': producer,
        'inputs': {'lineageId': lineage['recordId'], 'lineageHash': lineage['contentHash'], 'claims': claims},
        'configuredValues': inputs, 'permissions': permissions,
        'transformSet': {'definition': TRANSFORM, 'sha256': hash_json(TRANSFORM)},
        'renderProfile': {'definition': PROFILE, 'sha256': hash_json(PROFILE)},
        'symbolic': {'resonanceConstant': 369, 'origin': 'AUEVO_DEFINED'},
        'palette': {'values': PALETTE, 'evidenceClass': 'CONFIGURED'},
        'legacyOrb': {**orb, **PALETTE},
        'dimensionStatus': 'Final canonical dimensions are not defined by this prototype.',
        'channels': {key: {'value': value, 'range': [0, 1], 'unit': 'unitless', 'evidenceClass': 'DERIVED',
                           'derivedFrom': [lineage['recordId']], 'transformId': f"{TRANSFORM['id']}/{key}",
                           'uncertainty': {'status': 'UNKNOWN', 'reason': 'Compatibility mapping, not a validated human-state measure.'}}
                     for key, value in orb.items()},
    }
    state_hash = hash_json(state)
    state.update(stateContentHash=state_hash, stateId=f'prototype-state:sha256:{state_hash}')
    before = {} if prior is None else prior['state']['legacyOrb']
    changes = [{'field': f'legacyOrb.{key}', 'before': before.get(key), 'after': value,
                'kind': 'added' if key not in before else 'changed', 'source': lineage['recordId'],
                'reason': 'Observed compatibility output; not an inferred founder correction.'}
               for key, value in state['legacyOrb'].items() if key not in before or before[key] != value]
    provenance = {'lineageSnapshot': lineage, 'priorPackageHash': None if prior is None else prior['packageHash'],
                  'parseReport': lineage['payload']['parseReport'], 'clamps': [], 'defaults': [],
                  'limitations': lineage['payload']['limitations'], 'sourceRights': 'UNKNOWN',
                  'claimsEvidence': 'Unverified caller assertions; not independently retrieved evidence.',
                  'hashEncoding': 'python-sorted-json-utf8-v1'}
    experience = {'status': 'prototype-baseline-only', 'stateId': state['stateId'], 'stateHash': state_hash,
                  'legacyOrb': state['legacyOrb'], 'readOnlyBaseline': True,
                  'liveModulationImplemented': False, 'permissionScope': 'local-prototype'}
    explanation = {'summary': 'Compiled legacy inputs with the pinned compatibility formulas.',
                   'changeCount': len(changes), 'lineageStatus': 'incomplete',
                   'limitations': ['No full provenance, source rights, correction reconciliation or final AUEVO equation.',
                                   'No player integration or scientific interpretation.'],
                   'observedInputs': inputs}
    package = {'schema': SCHEMA, 'state': state, 'provenance': provenance, 'changes': changes,
               'experience': experience, 'explanation': explanation}
    package['manifest'] = {name: hash_json(package[name]) for name in ('state', 'provenance', 'changes', 'experience', 'explanation')}
    package['packageHash'] = hash_json(package)
    return verify_package(package)


def persist(path, package):
    verify_package(package)
    if not package['state']['permissions']['allowPersist']:
        fail('PERMISSION_DENIED', 'Local persistence is not permitted.', 'permissions.allowPersist')
    target = Path(path)
    if target.exists():
        existing = verify_package(load_json(target))
        if existing == package:
            return  # Idempotent replay, never rewrite history.
        fail('OUTPUT_EXISTS', 'Choose a new output filename to preserve prior state.', 'output')
    data = json.dumps(package, indent=2, ensure_ascii=False, allow_nan=False) + '\n'
    staged = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=target.parent, prefix='.package-', encoding='utf-8', newline='\n', delete=False) as stream:
            staged = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(staged, target)
    except FileExistsError as error:
        raise LineageError('OUTPUT_EXISTS', 'Output was created concurrently; no file replaced.', 'output') from error
    except OSError as error:
        raise LineageError('OUTPUT_WRITE_FAILED', 'Unable to write package; use an existing local directory supporting hard links.', 'output') from error
    finally:
        if staged is not None:
            staged.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lineage', type=Path, required=True)
    parser.add_argument('--permissions', type=Path, required=True)
    parser.add_argument('--prior', type=Path)
    parser.add_argument('--claims', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        protected = [args.lineage, args.permissions, *([args.prior] if args.prior else []), *([args.claims] if args.claims else [])]
        if any(args.output.resolve() == path.resolve() for path in protected):
            fail('OUTPUT_EXISTS', 'Output must not replace an input.', 'output')
        package = compile_package(load_json(args.lineage), load_json(args.permissions),
                                  load_json(args.prior) if args.prior else None,
                                  load_json(args.claims) if args.claims else None)
        persist(args.output, package)
    except LineageError as error:
        print(json.dumps({'code': error.code, 'stage': 'prototype-compiler', 'path': error.path, 'message': str(error)}), file=sys.stderr)
        return 1
    print(f"Saved local prototype generation {package['state']['generation']}; lineage remains incomplete.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
