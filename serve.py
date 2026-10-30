#!/usr/bin/env python3
"""Serve the game on this computer and open it in the default browser."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, errno, threading, webbrowser

parser=argparse.ArgumentParser(description='Play Labirintos locally')
parser.add_argument('--no-open',action='store_true')
parser.add_argument('--port',type=int,default=4173)
args=parser.parse_args()
root=Path(__file__).resolve().parent
directory=root/'dist' if (root/'dist/index.html').is_file() else root
try:
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(SimpleHTTPRequestHandler,directory=str(directory)))
except OSError as error:
    if error.errno != errno.EADDRINUSE:
        parser.exit(1,f'Could not start the local game server: {error}\n')
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(directory)))
url=f'http://127.0.0.1:{server.server_port}/'
print(f'\nLabirintos is ready: {url}\nKeep this window open while playing. Press Ctrl+C to stop.\n',flush=True)
if not args.no_open:threading.Timer(.5,lambda:webbrowser.open(url)).start()
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
