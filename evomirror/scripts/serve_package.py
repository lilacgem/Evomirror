"""View verified prototype package baselines locally without C++ or microphone access."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

try:
    from scripts.compile_package import load_json, verify_package
    from scripts.adapt_lineage import LineageError
except ModuleNotFoundError:
    from compile_package import load_json, verify_package
    from adapt_lineage import LineageError

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {'/': ('index.html', 'text/html'), '/index.html': ('index.html', 'text/html'),
          '/Visualizer.js': ('Visualizer.js', 'application/javascript'),
          '/RecordedSession.js': ('RecordedSession.js', 'application/javascript'),
          '/StatePlayback.js': ('StatePlayback.js', 'application/javascript'),
          '/RecordingTelemetry.js': ('RecordingTelemetry.js', 'application/javascript')}


def view_state(package):
    verify_package(package)
    state = package['state']
    return {'schema': 'EvoMirror-State/v3', 'orb': state['legacyOrb'],
            'prototype': {'stateId': state['stateId'], 'stateHash': state['stateContentHash'],
                          'generation': state['generation'], 'packageHash': package['packageHash'],
                          'status': 'verified-prototype-baseline', 'lineageStatus': 'incomplete',
                          'liveAudioAllowed': False, 'recordingAllowed': False,
                          'message': 'Prototype baseline only. Full lineage and recorded-media playback are not implemented.'}}


def make_handler(paths):
    # Validate once and freeze only permitted display directives in memory.
    states = [view_state(load_json(path)) for path in paths]
    if not states:
        raise LineageError('INPUT_MISSING', 'At least one package is required.')
    timeline = {'schema': 'AUEVO-StateTimeline/v0.1', 'timingOrigin': 'configured-demo',
                'description': 'Configured demonstration: each state is held for five seconds; not recorded session timing.',
                'durationMs': len(states) * 5000,
                'frames': [{'atMs': index * 5000, 'packageIndex': index, 'state': state} for index, state in enumerate(states)]}
    choices = [{'index': index, 'name': Path(path).name, 'generation': states[index]['prototype']['generation']}
               for index, path in enumerate(paths)]

    class Handler(BaseHTTPRequestHandler):
        def send_data(self, code, data, mime='application/json'):
            self.send_response(code)
            self.send_header('Content-Type', mime + '; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            # Binding is loopback-only; reject foreign Host values (DNS rebinding).
            host = self.headers.get('Host', '').split(':')[0].lower()
            if host not in ('localhost', '127.0.0.1'):
                self.send_data(403, b'{"error":"LOCAL_HOST_REQUIRED"}')
                return
            route = urlsplit(self.path)
            if route.path in ASSETS:
                name, mime = ASSETS[route.path]
                self.send_data(200, (ROOT / 'EvoRoot/EvoSpace' / name).read_bytes(), mime)
            elif route.path == '/api/timeline':
                self.send_data(200, json.dumps(timeline, allow_nan=False).encode())
            elif route.path == '/api/packages':
                self.send_data(200, json.dumps(choices).encode())
            elif route.path in ('/evo_state.json', '/api/state'):
                try:
                    params = parse_qs(route.query)
                    if set(params) - {'index'} or len(params.get('index', ['0'])) != 1:
                        raise ValueError()
                    index = int(params.get('index', ['0'])[0])
                    if index < 0 or index >= len(states):
                        raise ValueError()
                except ValueError:
                    self.send_data(400, b'{"error":"INVALID_PACKAGE_SELECTION"}')
                    return
                self.send_data(200, json.dumps(states[index], allow_nan=False).encode())
            else:
                # Do not expose package provenance, state files or unrelated local files.
                self.send_data(404, b'{"error":"NOT_FOUND"}')

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', action='append', type=Path, required=True, help='Repeat to offer multiple saved packages')
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()
    try:
        handler = make_handler(args.package)
    except LineageError as error:
        parser.exit(1, f'{error.code}: {error}\n')
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'Package baseline viewer listening on port {args.port}. Ctrl+C to stop.', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
