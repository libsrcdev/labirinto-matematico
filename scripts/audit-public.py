#!/usr/bin/env python3
"""Conservative credential/path checks for publishable source files (not AV)."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
EXCLUDED={'dist','node_modules','.git','__pycache__'}
RULES={
 'private-key':rb'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY',
 'github-token':rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})',
 'aws-key':rb'AKIA[A-Z0-9]{16}',
 'google-key':rb'AIza[0-9A-Za-z_-]{30,}',
 'local-home-path':rb'(?:/' + rb'Users/[^/\s]+/|C:\\\\Users\\\\[^\\\s]+\\\\)',
 'credential-in-url':rb'https?://[^\s/]+:[^\s/@]+@',
}
findings=[];count=0
for path in ROOT.rglob('*'):
 rel=path.relative_to(ROOT)
 if any(part in EXCLUDED for part in rel.parts):continue
 if path.is_symlink():findings.append({'file':str(rel),'rule':'symlink'});continue
 if not path.is_file():continue
 if '.openai' in rel.parts or path.name.startswith('.env') or path.name in ['.DS_Store','id_rsa','id_ed25519']:
  findings.append({'file':str(rel),'rule':'private-local-file'})
 # Upstream runtime files are independently SHA-256 verified before packaging.
 if rel.parts[:2]==('emulator','legacy') or str(rel)=='emulator/labirintos.zip':continue
 data=path.read_bytes();count+=1
 for name,pattern in RULES.items():
  if re.search(pattern,data):findings.append({'file':str(rel),'rule':name})
print(json.dumps({'files_checked':count,'findings':findings},indent=2))
raise SystemExit(bool(findings))
