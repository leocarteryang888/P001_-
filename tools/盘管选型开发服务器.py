"""P001 盘管选型本地热更新服务器，仅监听 127.0.0.1。"""
import argparse
import hashlib
import json
import os
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODULE_ROOT = PROJECT_ROOT / 'src' / '02-盘管选型'

def module_version():
    digest = hashlib.sha256()
    for path in sorted(MODULE_ROOT.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in {'.html', '.css', '.js'}:
            continue
        if 'vendor' in path.parts or 'tests' in path.parts:
            continue
        stat = path.stat()
        digest.update(str(path.relative_to(MODULE_ROOT)).encode('utf-8'))
        digest.update(f'{stat.st_mtime_ns}:{stat.st_size}'.encode('ascii'))
    return digest.hexdigest()

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()
    def do_GET(self):
        if urlparse(self.path).path == '/__coil_reload':
            payload = json.dumps({'version': module_version()}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()
    def log_message(self, format, *args):
        if not self.path.startswith('/__coil_reload'):
            super().log_message(format, *args)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8768)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    os.chdir(PROJECT_ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    url = f'http://127.0.0.1:{args.port}/src/02-%E7%9B%98%E7%AE%A1%E9%80%89%E5%9E%8B/index.html'
    print('盘管选型热更新服务：' + url, flush=True)
    print('按 Ctrl+C 停止服务。', flush=True)
    if args.open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
