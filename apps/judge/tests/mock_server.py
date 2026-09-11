"""
A stand-in for the MOJ site's judge API.

It implements exactly the endpoints `dmoj/moj_packet.py` calls, backed by an in-memory queue, an event log
and a dictionary of test data archives, so the judge container can be exercised without a Convex deployment.
The Convex implementation must accept and return the same shapes; see apps/judge/README.md for the wire
format.

Run it standalone with:

    python3 apps/judge/tests/mock_server.py --port 3211 --judge-name local --judge-key local
"""

import argparse
import hashlib
import io
import json
import threading
import time
import urllib.parse
import zipfile
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Deque, Dict, List, Optional, Union

EVENT_TYPES = {
    'grading-begin',
    'batch-begin',
    'batch-end',
    'test-case-status',
    'grading-end',
    'compile-error',
    'compile-message',
    'internal-error',
    'submission-terminated',
}


class MockJudgeServer:
    def __init__(self, host: str = '0.0.0.0', port: int = 3211, judge_name: str = 'local', judge_key: str = 'local'):
        self.host = host
        self.port = port
        self.judge_name = judge_name
        self.judge_key = judge_key

        # Reentrant: `wait_until` holds the condition's lock while its predicate reads the log through
        # `events_for`, which takes the same lock.
        self.lock = threading.RLock()
        self.condition = threading.Condition(self.lock)

        self.handshakes: List[dict] = []
        self.heartbeats: List[dict] = []
        self.disconnects = 0
        self.queue: Deque[dict] = deque()
        self.claimed: Dict[int, dict] = {}
        self.events: List[dict] = []
        self.aborts: Dict[int, bool] = {}
        self.requests: List[str] = []
        # Test data the site owns, by problem code: the archive bytes and the hash the site advertises for
        # them, which is deliberately allowed to disagree with the bytes so corruption can be tested.
        self.problem_data: Dict[str, Dict[str, Any]] = {}
        self.data_requests: List[str] = []
        self.verbose = False

        self._server: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    # -- lifecycle -------------------------------------------------------------------------------------------

    def start(self) -> 'MockJudgeServer':
        outer = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
            server_version = 'MockMOJ/1'

            def log_message(self, fmt, *args):
                if outer.verbose:
                    print('[mock] ' + fmt % args, flush=True)

            def _body(self) -> dict:
                length = int(self.headers.get('Content-Length') or 0)
                if not length:
                    return {}
                try:
                    return json.loads(self.rfile.read(length).decode('utf-8'))
                except ValueError:
                    return {}

            def _reply(self, payload: Any, status: int = 200) -> None:
                data = json.dumps(payload).encode('utf-8')
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _authorized(self, payload: dict) -> bool:
                return payload.get('judgeName') == outer.judge_name and payload.get('judgeKey') == outer.judge_key

            def do_POST(self):
                path = urllib.parse.urlparse(self.path).path
                payload = self._body()
                with outer.lock:
                    outer.requests.append('POST ' + path)
                if not self._authorized(payload):
                    return self._reply({'error': 'unauthorized'}, 403)
                handler = {
                    '/judge/handshake': outer._handshake,
                    '/judge/heartbeat': outer._heartbeat,
                    '/judge/claim': outer._claim,
                    '/judge/event': outer._event,
                    '/judge/disconnect': outer._disconnect,
                }.get(path)
                if handler is None:
                    return self._reply({'error': 'not found'}, 404)
                try:
                    return self._reply(handler(payload))
                except Exception as e:  # never take the mock down mid-test
                    return self._reply({'error': str(e)}, 500)

            def do_GET(self):
                parsed = urllib.parse.urlparse(self.path)
                query = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
                with outer.lock:
                    outer.requests.append('GET ' + parsed.path)
                if not self._authorized(query):
                    return self._reply({'error': 'unauthorized'}, 403)
                if parsed.path == '/judge/data':
                    return outer._data(self, query)
                if parsed.path != '/judge/abort':
                    return self._reply({'error': 'not found'}, 404)
                return self._reply(outer._abort(query))

        self._server = ThreadingHTTPServer((self.host, self.port), Handler)
        self._server.daemon_threads = True
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None

    def __enter__(self) -> 'MockJudgeServer':
        return self.start()

    def __exit__(self, *exc) -> None:
        self.stop()

    # -- endpoints -------------------------------------------------------------------------------------------

    def _handshake(self, payload: dict) -> dict:
        with self.condition:
            self.handshakes.append(payload)
            self.condition.notify_all()
        return {'ok': True, 'judgeId': 'mock-judge'}

    def _heartbeat(self, payload: dict) -> dict:
        with self.condition:
            self.heartbeats.append(dict(payload, at=time.monotonic()))
            self.condition.notify_all()
        return {'ok': True, 'serverTime': int(time.time() * 1000)}

    def _claim(self, _payload: dict) -> dict:
        with self.condition:
            if not self.queue:
                return {'submission': None}
            submission = self.queue.popleft()
            self.claimed[submission['submissionId']] = submission
            self.condition.notify_all()
        return {'submission': submission}

    def _event(self, payload: dict) -> dict:
        event = payload.get('event') or {}
        record = {
            'submissionId': payload.get('submissionId'),
            'type': event.get('type'),
            'event': event,
            'at': time.time(),
        }
        with self.condition:
            self.events.append(record)
            self.condition.notify_all()
        if record['type'] not in EVENT_TYPES:
            return {'ok': False, 'error': 'unknown event type %r' % (record['type'],)}
        return {'ok': True}

    def _data(self, handler: BaseHTTPRequestHandler, query: dict) -> None:
        code = query.get('code', '')
        with self.condition:
            self.data_requests.append(code)
            entry = self.problem_data.get(code)
            self.condition.notify_all()

        if entry is None:
            return handler._reply({'ok': False, 'error': 'no data'}, 404)  # type: ignore[attr-defined]
        wanted = query.get('hash')
        if wanted and wanted != entry['hash']:
            return handler._reply({'ok': False, 'error': 'hash mismatch'}, 409)  # type: ignore[attr-defined]

        body = entry['body']
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/zip')
        handler.send_header('Content-Length', str(len(body)))
        handler.send_header('X-Moj-Data-Hash', entry['hash'])
        handler.send_header('X-Moj-Data-Size', str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)

    def _abort(self, query: dict) -> dict:
        try:
            submission_id = int(query.get('submissionId', ''))
        except ValueError:
            return {'abort': False}
        with self.lock:
            return {'abort': bool(self.aborts.get(submission_id))}

    def _disconnect(self, _payload: dict) -> dict:
        with self.condition:
            self.disconnects += 1
            self.condition.notify_all()
        return {'ok': True}

    # -- test helpers ----------------------------------------------------------------------------------------

    def enqueue(
        self,
        submission_id: int,
        problem_code: str,
        language_key: str,
        source: str,
        time_limit: float = 1.0,
        memory_limit: int = 262144,
        short_circuit: bool = False,
        meta: Optional[dict] = None,
        problem_data_hash: Optional[str] = None,
    ) -> int:
        submission = {
            'submissionId': submission_id,
            'problemCode': problem_code,
            'languageKey': language_key,
            'source': source,
            'timeLimit': time_limit,
            'memoryLimit': memory_limit,
            'shortCircuit': short_circuit,
            'problemDataHash': problem_data_hash,
            'meta': (
                meta
                if meta is not None
                else {'pretestsOnly': False, 'inContest': None, 'attemptNo': 1, 'user': 1, 'userNotes': ''}
            ),
        }
        with self.condition:
            self.queue.append(submission)
            self.condition.notify_all()
        return submission_id

    def set_problem_data(self, code: str, body: bytes, advertised_hash: Optional[str] = None) -> str:
        """Hold `body` as the site's archive for `code` and return the hash a claim should carry.

        `advertised_hash` defaults to the real sha256 of the bytes. Passing a different one is how a
        corrupted download is tested: the site promises one archive and the judge receives another.
        """
        digest = advertised_hash or hashlib.sha256(body).hexdigest()
        with self.condition:
            self.problem_data[code] = {'hash': digest, 'body': body}
            self.condition.notify_all()
        return digest

    def data_requests_for(self, code: str) -> int:
        with self.lock:
            return sum(1 for requested in self.data_requests if requested == code)

    def set_abort(self, submission_id: int, value: bool = True) -> None:
        with self.lock:
            self.aborts[submission_id] = value

    def events_for(self, submission_id: int) -> List[dict]:
        with self.lock:
            return [e for e in self.events if e['submissionId'] == submission_id]

    def wait_until(self, predicate: Callable[['MockJudgeServer'], bool], timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        with self.condition:
            while not predicate(self):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return False
                self.condition.wait(min(remaining, 0.25))
            return True


def build_archive(files: Dict[str, Union[str, bytes]]) -> bytes:
    """A problem archive in the shape the site stores: a zip whose root holds init.yml and its test data."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(files.items()):
            archive.writestr(name, content if isinstance(content, bytes) else content.encode('utf-8'))
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description='Mock MOJ judge API for local judge testing.')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=3211)
    parser.add_argument('--judge-name', default='local')
    parser.add_argument('--judge-key', default='local')
    parser.add_argument('-v', '--verbose', action='store_true')
    args = parser.parse_args()

    server = MockJudgeServer(args.host, args.port, args.judge_name, args.judge_key)
    server.verbose = args.verbose
    server.start()
    print('mock judge API listening on %s:%d' % (args.host, args.port), flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        server.stop()


if __name__ == '__main__':
    main()
