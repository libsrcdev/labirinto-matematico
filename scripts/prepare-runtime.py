#!/usr/bin/env python3
"""Verify the vendored emulator artifacts and package the EXE without network access."""
import hashlib,json
from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_STORED
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'emulator/manifest.json').read_text())
for item in manifest['files']:
    path=ROOT/'emulator'/item['file']
    if not path.is_file():
        raise SystemExit('Missing vendored runtime file: '+item['file']+'. Restore it from Git.')
    if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
        raise SystemExit('Runtime checksum mismatch: '+item['file'])
exe=(ROOT/'original/Labirintos.exe').read_bytes()
if hashlib.sha256(exe).hexdigest()!=manifest['application']['exe_sha256']:
    raise SystemExit('Original EXE checksum mismatch')
entry=ZipInfo('Labirintos.exe',date_time=(1980,1,1,0,0,0))
entry.compress_type=ZIP_STORED
entry.external_attr=0o100644<<16
with ZipFile(ROOT/'emulator/labirintos.zip','w') as archive:archive.writestr(entry,exe)
if hashlib.sha256((ROOT/'emulator/labirintos.zip').read_bytes()).hexdigest()!=manifest['application']['sha256']:
    raise SystemExit('Packaged EXE checksum mismatch')
print('Verified vendored runtime and packaged unchanged EXE without downloads.')
