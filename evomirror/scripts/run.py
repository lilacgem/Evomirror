"""Generate state and serve a local, disposable copy of EvoSpace."""
from pathlib import Path
import argparse
import functools
import http.server
import os
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--bin-dir', type=Path, default=root / 'build', help='Directory containing both compiler executables')
parser.add_argument('--port', type=int, default=8000)
args = parser.parse_args()
suffix = '.exe' if os.name == 'nt' else ''
bin_dir = args.bin_dir.resolve()
for name in ('second-compiler', 'state-compiler'):
    if not (bin_dir / (name + suffix)).is_file():
        parser.error(f'Missing {name}; build first (see README.md).')
runtime = root / 'runtime'
runtime.mkdir(exist_ok=True)
state = runtime / 'compiler2_state.txt'
try:
    values = [input(prompt) for prompt in ('Intensity (1-10): ', 'Focus (0-1): ', 'Primary initial: ')]
    subprocess.run([str(bin_dir / ('second-compiler' + suffix)), str(state)], input='\n'.join(values) + '\n', text=True, check=True)
    values = [input(prompt) for prompt in ('Activity (0-1): ', 'Complexity (0-1): ')]
    subprocess.run([str(bin_dir / ('state-compiler' + suffix)), str(state), str(runtime / 'evo_state.json')], input='\n'.join(values) + '\n', text=True, check=True)
except subprocess.CalledProcessError as error:
    raise SystemExit(error.returncode)
for name in ('index.html', 'RecordingTelemetry.js', 'StatePlayback.js', 'RecordedSession.js', 'Visualizer.js'):
    shutil.copyfile(root / 'EvoRoot' / 'EvoSpace' / name, runtime / name)
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(runtime))
with http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
    print(f'EvoSpace is listening on port {args.port}. Press Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
