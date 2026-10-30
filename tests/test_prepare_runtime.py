"""Exercise offline preparation and reject missing or altered artifacts."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PrepareRuntimeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'emulator/legacy').mkdir(parents=True)
        (self.root / 'original').mkdir()
        shutil.copy2(ROOT / 'scripts/prepare-runtime.py', self.root / 'scripts')
        shutil.copy2(ROOT / 'original/Labirintos.exe', self.root / 'original')
        self.runtime = self.root / 'emulator/legacy/test.bin'
        self.runtime.write_bytes(b'verified runtime')
        self.application = json.loads((ROOT / 'emulator/manifest.json').read_text())['application']
        manifest = {
            'files': [{
                'file': 'legacy/test.bin',
                'sha256': hashlib.sha256(self.runtime.read_bytes()).hexdigest(),
            }],
            'application': self.application,
        }
        (self.root / 'emulator/manifest.json').write_text(json.dumps(manifest))

    def prepare(self):
        # Any attempted connection fails immediately, even on machines with network access.
        command = '''import runpy
from unittest.mock import patch
with patch('socket.socket', side_effect=AssertionError('Network access forbidden')):
    runpy.run_path('scripts/prepare-runtime.py', run_name='__main__')
'''
        return subprocess.run(
            [sys.executable, '-O', '-c', command], cwd=self.root,
            capture_output=True, text=True,
        )

    def test_prepares_exact_game_archive_offline(self):
        result = self.prepare()
        self.assertEqual(result.returncode, 0, result.stderr)
        archive = (self.root / 'emulator/labirintos.zip').read_bytes()
        self.assertEqual(hashlib.sha256(archive).hexdigest(), self.application['sha256'])

    def test_missing_runtime_fails_without_downloading(self):
        self.runtime.unlink()
        result = self.prepare()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Missing vendored runtime file: legacy/test.bin', result.stderr)
        self.assertFalse((self.root / 'emulator/labirintos.zip').exists())

    def test_corrupt_runtime_is_rejected(self):
        self.runtime.write_bytes(b'corrupt runtime!')
        result = self.prepare()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Runtime checksum mismatch: legacy/test.bin', result.stderr)
        self.assertFalse((self.root / 'emulator/labirintos.zip').exists())

    def test_corrupt_exe_is_rejected_even_with_python_optimization(self):
        (self.root / 'original/Labirintos.exe').write_bytes(b'corrupt executable')
        result = self.prepare()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Original EXE checksum mismatch', result.stderr)
        self.assertFalse((self.root / 'emulator/labirintos.zip').exists())
