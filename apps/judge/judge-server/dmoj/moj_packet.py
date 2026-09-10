"""
Packet manager for MOJ, the MAPS Online Judge.

`PacketManager` in `dmoj.packet` speaks DMOJ's bridge protocol: a long-lived TCP connection over which the
site *pushes* submissions to the judge. MOJ has no bridge; the site is a Convex deployment reachable only
over HTTPS, so the judge *pulls* work instead. This module is a drop-in replacement exposing the same public
surface `dmoj.judge.Judge` uses, implemented against the HTTP judge API:

    POST /judge/handshake   announce problems and executors, once at startup
    POST /judge/heartbeat   liveness and load, every 10 seconds
    POST /judge/claim       ask for a submission to grade, every 500 ms while idle
    POST /judge/event       report grading progress for the submission being graded
    GET  /judge/abort       ask whether the current submission should be terminated, every second
    POST /judge/disconnect  announce a clean shutdown

Only the standard library is used, so the judge image needs no extra Python packages.
"""

import json
import logging
import os
import threading
import traceback
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, TYPE_CHECKING, Tuple

from dmoj.judgeenv import get_runtime_versions, get_supported_problems_and_mtimes
from dmoj.result import Result

if TYPE_CHECKING:
    from dmoj.judge import Judge

log = logging.getLogger(__name__)

CLAIM_INTERVAL = 0.5
CLAIM_MAX_BACKOFF = 5.0
HEARTBEAT_INTERVAL = 10.0
ABORT_POLL_INTERVAL = 1.0
TESTCASE_FLUSH_INTERVAL = 0.25
REQUEST_TIMEOUT = 15.0
HANDSHAKE_MAX_BACKOFF = 60.0
EVENT_ATTEMPTS = 12

# DMOJ's submission metadata keys are dashed; the MOJ judge API is camelCase like the rest of Convex.
META_KEYS = {
    'pretestsOnly': 'pretests-only',
    'inContest': 'in-contest',
    'attemptNo': 'attempt-no',
    'user': 'user',
    'userNotes': 'user-notes',
}


class JudgeAuthenticationFailed(Exception):
    pass


def _jsonable(value: Any) -> Any:
    if isinstance(value, bytes):
        # Compilers such as fpc emit output that is not valid UTF-8; never let that kill a report.
        return value.decode('utf-8', 'replace')
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _load_average() -> float:
    try:
        return os.getloadavg()[0]
    except (OSError, AttributeError):
        try:
            with open('/proc/loadavg') as f:
                return float(f.read().split()[0])
        except (OSError, ValueError, IndexError):
            return -1.0


class MojPacketManager:
    judge: 'Judge'

    def __init__(self, url: str, judge: 'Judge', name: str, key: str) -> None:
        self.url = url.rstrip('/')
        self.judge = judge
        self.name = os.environ.get('MOJ_JUDGE_NAME') or os.environ.get('JUDGE_NAME') or name
        self.key = os.environ.get('MOJ_JUDGE_KEY') or os.environ.get('JUDGE_KEY') or key
        self.judge_id: Optional[str] = None
        self.online = False

        self._closed = False
        self._shutdown = threading.Event()
        self._send_lock = threading.RLock()
        self._batch = 0
        self._testcase_queue_lock = threading.Lock()
        self._testcase_queue: List[Tuple[int, Result]] = []
        self._current_submission_id: Optional[int] = None
        self._threads: List[threading.Thread] = []

        # Present for parity with dmoj.packet.PacketManager, which resets it on progress.
        self.fallback = 4

        log.info('Preparing to pull submissions from %s as: %s', self.url, self.name)

    # -- HTTP plumbing ---------------------------------------------------------------------------------------

    def _auth(self) -> Dict[str, Any]:
        return {'judgeName': self.name, 'judgeKey': self.key}

    def _request(
        self,
        path: str,
        payload: Optional[dict] = None,
        query: Optional[dict] = None,
        timeout: float = REQUEST_TIMEOUT,
    ) -> Any:
        url = self.url + path
        if query:
            url += '?' + urllib.parse.urlencode(query)

        data = None
        headers = {'Accept': 'application/json', 'User-Agent': 'moj-judge'}
        if payload is not None:
            data = json.dumps(_jsonable(payload)).encode('utf-8')
            headers['Content-Type'] = 'application/json'

        request = urllib.request.Request(url, data=data, headers=headers, method='POST' if data else 'GET')
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()

        if not body:
            return {}
        return json.loads(body.decode('utf-8'))

    def _try_request(self, path: str, payload: Optional[dict] = None, query: Optional[dict] = None) -> Any:
        try:
            return self._request(path, payload, query)
        except urllib.error.HTTPError as e:
            detail = ''
            try:
                detail = e.read().decode('utf-8', 'replace')[:512]
            except Exception:
                pass
            log.warning('%s returned HTTP %s: %s', path, e.code, detail)
        except Exception as e:
            log.warning('%s failed: %s', path, e)
        return None

    def _sleep(self, seconds: float) -> None:
        self._shutdown.wait(seconds)

    # -- lifecycle -------------------------------------------------------------------------------------------

    def handshake(self, problems, runtimes, id: str, key: str) -> None:
        payload = dict(self._auth(), problems=problems, executors=runtimes)
        response = self._request('/judge/handshake', payload)
        if not isinstance(response, dict) or not response.get('ok'):
            raise JudgeAuthenticationFailed(str(response))
        self.judge_id = response.get('judgeId')

    def _handshake_until_accepted(self) -> bool:
        backoff = 4.0
        while not self._shutdown.is_set():
            problems = get_supported_problems_and_mtimes()
            runtimes = get_runtime_versions()
            try:
                self.handshake(problems, runtimes, self.name, self.key)
            except JudgeAuthenticationFailed as e:
                log.error('Authentication as "%s" failed on %s: %s', self.name, self.url, e)
            except Exception as e:
                log.warning('Handshake with %s failed: %s', self.url, e)
            else:
                self.online = True
                log.info('Judge "%s" online at %s with %d problem(s)', self.name, self.url, len(problems))
                return True

            log.warning('Retrying handshake in %.0fs: %s', backoff, self.url)
            self._sleep(backoff)
            backoff = min(backoff * 1.5, HANDSHAKE_MAX_BACKOFF)
        return False

    def run(self) -> None:
        if not self._handshake_until_accepted():
            return

        for target in (self._heartbeat_thread, self._abort_poll_thread, self._periodically_flush_testcase_queue):
            thread = threading.Thread(target=target, daemon=True)
            thread.start()
            self._threads.append(thread)

        self._claim_loop()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._shutdown.set()
        self.online = False
        self._try_request('/judge/disconnect', self._auth())

    def disconnect(self) -> None:
        log.info('Received disconnect request, shutting down...')
        self.judge.abort_grading()
        self.close()

    def __del__(self):
        self.close()

    # -- background threads ----------------------------------------------------------------------------------

    def _heartbeat_thread(self) -> None:
        while not self._shutdown.is_set():
            self._send_heartbeat()
            self._sleep(HEARTBEAT_INTERVAL)

    def _send_heartbeat(self, problems: Optional[list] = None, executors: Optional[dict] = None) -> None:
        payload = dict(self._auth(), load=_load_average())
        if problems is not None:
            payload['problems'] = problems
        if executors is not None:
            payload['executors'] = executors
        self._try_request('/judge/heartbeat', payload)

    def _abort_poll_thread(self) -> None:
        while not self._shutdown.is_set():
            submission_id = self._current_submission_id
            if submission_id is None:
                self._sleep(ABORT_POLL_INTERVAL)
                continue

            query = dict(self._auth(), submissionId=submission_id)
            response = self._try_request('/judge/abort', query=query)
            if isinstance(response, dict) and response.get('abort') and self._current_submission_id == submission_id:
                log.info('Site requested abort of submission %s', submission_id)
                try:
                    self.judge.abort_grading(submission_id)
                except Exception:
                    log.exception('Failed to abort submission %s', submission_id)
            self._sleep(ABORT_POLL_INTERVAL)

    def _claim_loop(self) -> None:
        backoff = CLAIM_INTERVAL
        while not self._shutdown.is_set():
            response = self._try_request('/judge/claim', self._auth())
            if response is None:
                backoff = min(max(backoff * 2, 1.0), CLAIM_MAX_BACKOFF)
                self._sleep(backoff)
                continue

            backoff = CLAIM_INTERVAL
            submission = response.get('submission') if isinstance(response, dict) else None
            if not submission:
                self._sleep(CLAIM_INTERVAL)
                continue

            self._grade(submission)

    def _grade(self, data: dict) -> None:
        from dmoj.judge import Submission

        submission_id = data['submissionId']
        meta = {META_KEYS.get(key, key): value for key, value in (data.get('meta') or {}).items()}

        self._current_submission_id = submission_id
        self._batch = 0
        log.info(
            'Accept submission: %s: executor: %s, code: %s',
            submission_id,
            data['languageKey'],
            data['problemCode'],
        )

        try:
            self.judge.begin_grading(
                Submission(
                    id=submission_id,
                    problem_id=data['problemCode'],
                    language=data['languageKey'],
                    source=data['source'],
                    time_limit=float(data['timeLimit']),
                    memory_limit=int(data['memoryLimit']),
                    short_circuit=bool(data.get('shortCircuit')),
                    meta=meta,
                ),
                blocking=True,
            )
        except Exception:
            log.exception('Failed to grade submission %s', submission_id)
            self._send_event('internal-error', {'message': traceback.format_exc()}, submission_id=submission_id)
        finally:
            self._flush_testcase_queue()
            self._current_submission_id = None

    # -- event reporting -------------------------------------------------------------------------------------

    def _submission_id(self) -> Optional[int]:
        submission = self.judge.current_submission
        if submission is not None:
            return submission.id
        return self._current_submission_id

    def _send_event(self, event_type: str, body: Optional[dict] = None, submission_id: Optional[int] = None) -> None:
        if submission_id is None:
            submission_id = self._submission_id()
        if submission_id is None:
            log.warning('Dropping %s event with no submission in flight', event_type)
            return

        event = dict(body or {})
        event['type'] = event_type
        payload = dict(self._auth(), submissionId=submission_id, event=event)

        with self._send_lock:
            delay = 0.5
            for attempt in range(EVENT_ATTEMPTS):
                if self._try_request('/judge/event', payload) is not None:
                    self.fallback = 4
                    return
                if self._shutdown.is_set():
                    break
                log.warning(
                    'Retrying %s event for %s in %.1fs (attempt %d)', event_type, submission_id, delay, attempt + 1
                )
                self._sleep(delay)
                delay = min(delay * 2, CLAIM_MAX_BACKOFF)
            log.error('Giving up on %s event for submission %s', event_type, submission_id)

    def _flush_testcase_queue(self) -> None:
        with self._testcase_queue_lock:
            if not self._testcase_queue:
                return

            cases = [
                {
                    'position': position,
                    'status': result.result_flag,
                    'time': result.execution_time,
                    'points': result.points,
                    'totalPoints': result.total_points,
                    'memory': result.max_memory,
                    'output': result.output,
                    'extendedFeedback': result.extended_feedback,
                    'feedback': result.feedback,
                    'voluntaryContextSwitches': result.context_switches[0],
                    'involuntaryContextSwitches': result.context_switches[1],
                    'runtimeVersion': result.runtime_version,
                }
                for position, result in self._testcase_queue
            ]
            self._testcase_queue.clear()

        self._send_event('test-case-status', {'cases': cases})

    def _periodically_flush_testcase_queue(self) -> None:
        while not self._shutdown.is_set():
            try:
                self._sleep(TESTCASE_FLUSH_INTERVAL)
                self._flush_testcase_queue()
            except Exception:
                log.exception('Failed to flush test case queue')

    # -- outgoing packets, mirroring dmoj.packet.PacketManager -----------------------------------------------

    def supported_problems_packet(self, problems: List[Tuple[str, float]]) -> None:
        log.debug('Update problems')
        self._send_heartbeat(problems=problems)

    def executors_packet(self, executors: Optional[dict] = None) -> None:
        log.debug('Update executors')
        self._send_heartbeat(executors=executors if executors is not None else get_runtime_versions())

    def test_case_status_packet(self, position: int, result: Result) -> None:
        log.debug(
            'Test case on %s: #%d, %s [%.3fs | %.2f MB], %.1f/%.0f',
            self._submission_id(),
            position,
            ', '.join(result.readable_codes()),
            result.execution_time,
            result.max_memory / 1024.0,
            result.points,
            result.total_points,
        )
        with self._testcase_queue_lock:
            self._testcase_queue.append((position, result))

    def compile_error_packet(self, message: str) -> None:
        log.debug('Compile error: %s', self._submission_id())
        self.fallback = 4
        self._send_event('compile-error', {'log': message})

    def compile_message_packet(self, message: str) -> None:
        log.debug('Compile message: %s', self._submission_id())
        self._send_event('compile-message', {'log': message})

    def internal_error_packet(self, message: str) -> None:
        log.debug('Internal error: %s', self._submission_id())
        self._flush_testcase_queue()
        self._send_event('internal-error', {'message': message})

    def begin_grading_packet(self, is_pretested: bool) -> None:
        log.debug('Begin grading: %s', self._submission_id())
        self._send_event('grading-begin', {'pretested': bool(is_pretested)})

    def grading_end_packet(self) -> None:
        log.debug('End grading: %s', self._submission_id())
        self.fallback = 4
        self._flush_testcase_queue()
        self._send_event('grading-end')

    def batch_begin_packet(self) -> None:
        self._batch += 1
        log.debug('Enter batch number %d: %s', self._batch, self._submission_id())
        self._flush_testcase_queue()
        self._send_event('batch-begin')

    def batch_end_packet(self) -> None:
        log.debug('Exit batch number %d: %s', self._batch, self._submission_id())
        self._flush_testcase_queue()
        self._send_event('batch-end')

    def current_submission_packet(self) -> None:
        log.debug('Current submission query: %s', self._submission_id())

    def submission_aborted_packet(self) -> None:
        log.debug('Submission aborted: %s', self._submission_id())
        self._flush_testcase_queue()
        self._send_event('submission-terminated')

    # `submission-terminated` is the packet name upstream sends from `submission_aborted_packet`; expose both
    # spellings so callers can use either.
    submission_terminated_packet = submission_aborted_packet

    def ping_packet(self, when: float = 0.0) -> None:
        # There is nothing to answer in a pull protocol; load reaches the site through the heartbeat.
        self._send_heartbeat()

    def submission_acknowledged_packet(self, sub_id: int) -> None:
        # Claiming a submission is the acknowledgement; the site marks it processing when it hands it out.
        log.debug('Submission acknowledged: %s', sub_id)
