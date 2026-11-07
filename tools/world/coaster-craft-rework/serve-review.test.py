"""Exercise actual local HTTP media ranges, including immutable asset fallback."""
import http.client
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest


class MediaRanges(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        candidate, baseline = root / 'candidate', root / 'baseline'
        for folder in (candidate, baseline):
            (folder / 'world').mkdir(parents=True)
            (folder / 'world/index.html').write_text('audio range fixture')
        (baseline / 'track.mp3').write_bytes(bytes(range(100)))
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.server = subprocess.Popen([sys.executable, str(Path(__file__).with_name('serve-review.py')),
                                       str(candidate), str(baseline), str(root / 'server.pid'),
                                       '--port', str(cls.port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                cls.request()
                return
            except ConnectionRefusedError:
                time.sleep(.02)
        cls.server.terminate()
        raise RuntimeError('preview fixture did not start')

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=3)
        cls.temp.cleanup()

    @classmethod
    def request(cls, value=None, method='GET', extra=None):
        client = http.client.HTTPConnection('127.0.0.1', cls.port, timeout=2)
        headers = dict(extra or {})
        if value is not None:
            headers['Range'] = value
        client.request(method, '/track.mp3', headers=headers)
        response = client.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        client.close()
        return result

    def test_full_fallback(self):
        status, _, body = self.request()
        self.assertEqual((status, body), (200, bytes(range(100))))

    def test_partial_and_head(self):
        status, headers, body = self.request('bytes=20-39')
        self.assertEqual((status, body), (206, bytes(range(20, 40))))
        self.assertEqual(headers['Content-Range'], 'bytes 20-39/100')
        status, headers, body = self.request('bytes=20-39', 'HEAD')
        self.assertEqual((status, headers['Content-Length'], body), (206, '20', b''))

    def test_suffix_and_open_end(self):
        for value in ('bytes=95-', 'bytes=-5', 'bytes=95-999'):
            self.assertEqual(self.request(value)[::2], (206, bytes(range(95, 100))))

    def test_invalid_ranges_and_conservative_if_range(self):
        for value in ('bytes=100-', 'bytes=20-10', 'bytes=-0', 'bytes=-'):
            status, headers, body = self.request(value)
            self.assertEqual((status, headers['Content-Range'], body), (416, 'bytes */100', b''))
        self.assertEqual(self.request('bytes=0-1,4-5')[0], 200)
        self.assertEqual(self.request('bytes=20-', extra={'If-Range': '"old"'})[0], 200)


if __name__ == '__main__':
    unittest.main()
