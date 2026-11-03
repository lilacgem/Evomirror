"""Run the synthetic Compiler 3 compatibility slice; no microphone or network."""
from pathlib import Path
import json
import argparse
import subprocess
import sys
import tempfile

try:
    from scripts.adapt_lineage import adapt, LineageError
    from scripts.compile_package import compile_package, load_json, persist
except ModuleNotFoundError:
    from adapt_lineage import adapt, LineageError
    from compile_package import compile_package, load_json, persist


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--view', action='store_true', help='Open a local baseline-view server after the demo')
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    fixture = root / 'tests/fixtures/lineage'
    runtime = root / 'runtime'
    runtime.mkdir(exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix='compiler3-demo-', dir=runtime))
    policy = load_json(fixture / 'local-permissions.json')
    baseline = adapt((fixture / 'baseline.txt').read_bytes(), .7, .4)
    initial = compile_package(baseline, policy)
    persist(output / 'baseline-package.json', initial)
    changed = compile_package(adapt((fixture / 'changed.txt').read_bytes(), .7, .4), policy, initial)
    persist(output / 'changed-package.json', changed)
    replay = compile_package(baseline, policy, initial)
    assert replay['state']['stateId'] == initial['state']['stateId']
    try:
        compile_package(baseline, policy, initial, load_json(fixture / 'conflicting-claims.json'))
    except LineageError as error:
        if error.code != 'CONFLICT_UNRESOLVED':
            raise
        conflict = {'code': error.code, 'message': str(error), 'newPackageCreated': False}
    else:
        raise AssertionError('Conflicting claims were unexpectedly accepted.')
    report = {
        'status': 'synthetic prototype demonstration passed',
        'baselineGeneration': initial['state']['generation'],
        'changedGeneration': changed['state']['generation'],
        'changes': changed['changes'],
        'replayPreservedStateId': True,
        'conflict': conflict,
        'limitations': 'Legacy-derived prototype only; not the full Compiler 3 architecture or player integration.',
    }
    (output / 'demo-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Saved demo to {output}')
    print('PASS: baseline, linked changed state, deterministic replay, conflicting claims rejected.')
    print('No source files replaced, no audio captured, no upload performed.')
    if args.view:
        sys.stdout.flush()
        try:
            subprocess.run([sys.executable, str(root / 'scripts/serve_package.py'),
                            '--package', str(output / 'baseline-package.json'),
                            '--package', str(output / 'changed-package.json'), '--port', str(args.port)], check=True)
        except KeyboardInterrupt:
            pass
        except subprocess.CalledProcessError as error:
            raise SystemExit(error.returncode)



if __name__ == '__main__':
    main()
