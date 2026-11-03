"""Preserve a legacy Compiler 2 file as a traceable, explicitly incomplete record."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import uuid

SCHEMA = 'AUEVO-LegacyLineage/v0.1'
VERSION = '0.1.0'
FIELDS = ('stateVersion', 'intensity', 'focus', 'initial', 'patternStyle', 'colorHue', 'symbolicResonance')


class LineageError(ValueError):
    def __init__(self, code, message, path=None):
        super().__init__(message)
        self.code = code
        self.path = path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical_bytes(value):
    # This is a named Python JSON encoding, not a claim of RFC 8785/JCS compliance.
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def bounded(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise LineageError('INPUT_INVALID', f'{name} must be a finite number from 0 to 1.', name)
    return float(value)


def parse_legacy(raw):
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError as error:
        raise LineageError('INPUT_INVALID', 'Legacy state must be UTF-8.', 'source') from error
    lines = text.splitlines()
    if len(lines) != 7:
        raise LineageError('INPUT_INVALID', 'Exactly seven legacy state lines are required; no trailing records are discarded.', 'source')
    if not re.fullmatch(r'[1-9][0-9]*', lines[0]) or int(lines[0]) > 2147483647:
        raise LineageError('INPUT_INVALID', 'Invalid state version.', 'stateVersion')
    if not re.fullmatch(r'(?:[1-9]|10)', lines[1]):
        raise LineageError('INPUT_INVALID', 'Intensity must be an integer from 1 to 10.', 'intensity')
    try:
        focus = bounded(float(lines[2]), 'focus')
    except ValueError as error:
        if isinstance(error, LineageError):
            raise
        raise LineageError('INPUT_INVALID', 'Focus must be numeric.', 'focus') from error
    if not re.fullmatch('[A-Za-z]', lines[3]):
        raise LineageError('INPUT_INVALID', 'Initial must be one ASCII letter.', 'initial')
    if not all(line and not any(ord(c) < 32 for c in line) for line in lines[4:6]):
        raise LineageError('INPUT_INVALID', 'Pattern and color must be nonempty text.', 'source')
    if lines[6] != '369':
        raise LineageError('INPUT_INVALID', 'Legacy symbolic resonance must be the defined constant 369.', 'symbolicResonance')
    return dict(zip(FIELDS, (int(lines[0]), int(lines[1]), focus, lines[3], lines[4], lines[5], 369)))


def adapt(raw, activity, complexity):
    """Pure adapter: no file writes, generated authorship, rights or prior-state claims."""
    parsed = parse_legacy(raw)
    source_hash = digest(raw)
    implementation_hash = digest(Path(__file__).read_bytes())
    payload = {
        'schema': SCHEMA,
        'status': 'legacy-adapted-incomplete',
        'source': {
            'recordId': f'legacy-source:sha256:{source_hash}',
            'sha256': source_hash,
            'encoding': 'utf-8',
            'originalBytesBase64': base64.b64encode(raw).decode('ascii'),
            'parsed': parsed,
        },
        'configuredInputs': {
            'activity': {'value': bounded(activity, 'activity'), 'range': [0, 1], 'unit': 'unitless', 'evidenceClass': 'CONFIGURED'},
            'complexity': {'value': bounded(complexity, 'complexity'), 'range': [0, 1], 'unit': 'unitless', 'evidenceClass': 'CONFIGURED'},
        },
        'symbolic': {'value': 369, 'origin': 'AUEVO_DEFINED', 'measured': False},
        'parseReport': {'consumed': list(FIELDS), 'retainedOnly': [], 'discarded': [], 'defaulted': []},
        'provenance': {
            'originalSource': 'UNKNOWN', 'priorLogic': 'UNKNOWN',
            'priorOutput': 'UNKNOWN', 'founderHistory': 'UNKNOWN',
            'newEvidence': 'UNKNOWN', 'newLearning': 'UNKNOWN',
            'author': None, 'rights': None, 'priorStateId': None,
            'priorStateStatus': 'UNRESOLVED',
            'note': 'The legacy version counter does not establish immutable history, source rights or founder authorship.',
        },
        'uncertainty': {'status': 'UNKNOWN', 'reason': 'Historical inputs and measurement methods are absent from this legacy format.'},
        'adapter': {'name': 'AUEVO legacy lineage adapter', 'version': VERSION, 'buildHash': implementation_hash},
        'hashEncoding': 'python-sorted-json-utf8-v1',
        'limitations': ['Not a complete Compiler2Lineage or Compiler 3 package.',
                        'No evidence reconciliation, correction acceptance or canonical dimensions implemented.',
                        'No compile, recording, sharing or source-rights grant inferred.'],
    }
    return {'recordId': f'legacy-lineage:sha256:{digest(canonical_bytes(payload))}',
            'contentHash': digest(canonical_bytes(payload)), 'payload': payload}


def validate_record(record):
    """Verify hashes and recompute parsing/configuration instead of trusting derived fields."""
    try:
        payload = record['payload']
        if payload['schema'] != SCHEMA:
            raise LineageError('SCHEMA_UNSUPPORTED', 'Unsupported legacy lineage schema.', 'schema')
        raw = base64.b64decode(payload['source']['originalBytesBase64'], validate=True)
        if digest(raw) != payload['source']['sha256']:
            raise LineageError('HASH_MISMATCH', 'Preserved source bytes do not match their hash.', 'source')
        calculated = digest(canonical_bytes(payload))
        if record['contentHash'] != calculated or record['recordId'] != f'legacy-lineage:sha256:{calculated}':
            raise LineageError('HASH_MISMATCH', 'Lineage payload does not match its content identifier.', 'contentHash')
        expected = adapt(raw, payload['configuredInputs']['activity']['value'], payload['configuredInputs']['complexity']['value'])
        if expected['payload'] != payload:
            raise LineageError('INPUT_INVALID', 'Parsed fields or adapter contract do not match preserved source/configuration.', 'payload')
    except LineageError:
        raise
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        raise LineageError('INPUT_INVALID', 'Malformed lineage record.', 'record') from error
    return record


def write_record(path, record, *, allow_persist=False):
    """Exclusive creation: existing output/history is never silently replaced."""
    if not allow_persist:
        raise LineageError('PERMISSION_DENIED', 'Explicit --allow-persist is required for this local snapshot.', 'output')
    validate_record(record)
    envelope = {
        **record, 'createdAt': datetime.now(timezone.utc).isoformat(), 'runId': str(uuid.uuid4()),
        'operation': {'localSnapshotRequested': True, 'scope': 'this-adapter-run-only',
                      'grantsSourceRights': False, 'grantsCloudUpload': False},
    }
    data = json.dumps(envelope, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    staged = None
    try:
        # Stage in the destination directory, then create an exclusive hard link.
        # Existing records are never replaced and incomplete writes never become output.
        target = Path(path)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n',
                                         dir=target.parent, prefix='.lineage-', delete=False) as stream:
            staged = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(staged, target)
    except FileExistsError as error:
        raise LineageError('OUTPUT_EXISTS', 'Output exists; choose a new filename to preserve history.', 'output') from error
    except OSError as error:
        raise LineageError('OUTPUT_WRITE_FAILED', 'Unable to save local snapshot; destination must support atomic hard links.', 'output') from error
    finally:
        if staged is not None:
            staged.unlink(missing_ok=True)
    return envelope


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--activity', required=True, type=float)
    parser.add_argument('--complexity', required=True, type=float)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--allow-persist', action='store_true', help='Explicitly save this local snapshot only; does not grant source rights or upload permission')
    args = parser.parse_args()
    try:
        if args.input.resolve() == args.output.resolve():
            raise LineageError('OUTPUT_EXISTS', 'Input and output must be different files.', 'output')
        try:
            raw = args.input.read_bytes()
        except OSError as error:
            raise LineageError('INPUT_MISSING', 'Unable to read legacy state.', 'input') from error
        record = adapt(raw, args.activity, args.complexity)
        write_record(args.output, record, allow_persist=args.allow_persist)
    except LineageError as error:
        print(json.dumps({'code': error.code, 'stage': 'legacy-adapter', 'path': error.path, 'message': str(error)}), file=sys.stderr)
        return 1
    print(f'Saved {SCHEMA} local snapshot; lineage and rights remain incomplete.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
