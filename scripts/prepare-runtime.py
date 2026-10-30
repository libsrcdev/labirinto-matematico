#!/usr/bin/env python3
"""Fetch the exact official emulator artifacts; reject changed/corrupt downloads."""
import hashlib,json,urllib.request
from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_STORED
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'emulator/manifest.json').read_text())
for item in manifest['files']:
    path=ROOT/'emulator'/item['file']
    if not path.is_file():
        path.parent.mkdir(parents=True,exist_ok=True)
        with urllib.request.urlopen(item['source'],timeout=120) as response:
            data=response.read()
        if hashlib.sha256(data).hexdigest()!=item['sha256']:
            raise SystemExit('Runtime checksum mismatch: '+item['file'])
        path.write_bytes(data)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
        raise SystemExit('Runtime checksum mismatch: '+item['file'])
exe=(ROOT/'original/Labirintos.exe').read_bytes()
assert hashlib.sha256(exe).hexdigest()==manifest['application']['exe_sha256'],'Original EXE checksum mismatch'
entry=ZipInfo('Labirintos.exe',date_time=(1980,1,1,0,0,0))
entry.compress_type=ZIP_STORED
entry.external_attr=0o100644<<16
with ZipFile(ROOT/'emulator/labirintos.zip','w') as archive:archive.writestr(entry,exe)
assert hashlib.sha256((ROOT/'emulator/labirintos.zip').read_bytes()).hexdigest()==manifest['application']['sha256']
print('Verified official runtime and unchanged EXE.')
