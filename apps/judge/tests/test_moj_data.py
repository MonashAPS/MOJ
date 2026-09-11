"""
Unit tests for the judge's test data cache, `dmoj/moj_data.py`.

These need no Docker and no site: the download is stubbed out, so what is under test is everything the judge
does with the bytes afterwards -- verifying the hash, refusing an archive that would write outside the
problem directory, replacing a cached copy atomically, and evicting least-recently-used problems.

    python3 -m unittest discover -s apps/judge/tests
    python3 apps/judge/tests/test_moj_data.py
"""

import hashlib
import io
import os
import shutil
import stat
import sys
import tempfile
import unittest
import zipfile
from typing import Dict, List, Optional, Tuple, Union
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'judge-server'))

from dmoj import moj_data  # noqa: E402

URL = 'https://moj.example.org'
JUDGE_NAME = 'local'
JUDGE_KEY = 'local'


def archive(files: Dict[str, Union[str, bytes]], *, symlinks: Optional[Dict[str, str]] = None) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for name, content in files.items():
            zip_file.writestr(name, content if isinstance(content, bytes) else content.encode('utf-8'))
        for name, target in (symlinks or {}).items():
            info = zipfile.ZipInfo(name)
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            zip_file.writestr(info, target)
    return buffer.getvalue()


def problem(cases: int = 1, padding: int = 0) -> bytes:
    files: Dict[str, Union[str, bytes]] = {
        'init.yml': 'test_cases:\n- {in: tests/1.in, out: tests/1.out, points: 100}\n',
    }
    for position in range(1, cases + 1):
        files['tests/%d.in' % position] = '%d\n' % position
        files['tests/%d.out' % position] = '%d\n' % position
    if padding:
        files['tests/pad.bin'] = b'\0' * padding
    return archive(files)


class MojDataTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.cache = tempfile.mkdtemp(prefix='moj-data-test-')
        self.addCleanup(shutil.rmtree, self.cache, ignore_errors=True)

        self.outside = tempfile.mkdtemp(prefix='moj-data-outside-')
        self.addCleanup(shutil.rmtree, self.outside, ignore_errors=True)

        # patch.dict puts the whole environment back afterwards, including the two variables below.
        environment = mock.patch.dict(os.environ, {'MOJ_DATA_CACHE': self.cache})
        environment.start()
        self.addCleanup(environment.stop)
        os.environ.pop('MOJ_DATA_MAX_GB', None)

        self.served: Optional[bytes] = None
        self.fetches: List[Tuple[str, str]] = []

        def fake_fetch(url: str, code: str, expected_hash: str, judge_name: str, judge_key: str) -> bytes:
            self.assertEqual(url, URL)
            self.assertEqual((judge_name, judge_key), (JUDGE_NAME, JUDGE_KEY))
            self.fetches.append((code, expected_hash))
            assert self.served is not None, 'the test did not say what the site should serve'
            return self.served

        patcher = mock.patch.object(moj_data, '_fetch_archive', fake_fetch)
        patcher.start()
        self.addCleanup(patcher.stop)

    # -- helpers ---------------------------------------------------------------------------------------------

    def serve(self, body: bytes) -> str:
        self.served = body
        return hashlib.sha256(body).hexdigest()

    def ensure(self, code: str, expected_hash: str) -> str:
        return moj_data.ensure_problem_data(code, expected_hash, url=URL, judge_name=JUDGE_NAME, judge_key=JUDGE_KEY)

    def cache_entries(self) -> List[str]:
        return sorted(name for name in os.listdir(self.cache) if not name.startswith('.'))

    def assertNoLeftovers(self) -> None:
        leftovers = [name for name in os.listdir(self.cache) if name.startswith('.')]
        self.assertEqual(leftovers, [], 'a failed fetch left a staging directory behind')

    # -- the happy path --------------------------------------------------------------------------------------

    def test_fetches_extracts_and_records_the_hash(self) -> None:
        digest = self.serve(problem(cases=2))
        directory = self.ensure('aplusb', digest)

        self.assertEqual(directory, os.path.join(self.cache, 'aplusb'))
        self.assertTrue(os.path.isfile(os.path.join(directory, 'init.yml')))
        self.assertTrue(os.path.isfile(os.path.join(directory, 'tests', '2.in')))
        with open(os.path.join(directory, moj_data.HASH_FILE)) as f:
            self.assertEqual(f.read().strip(), digest)
        self.assertEqual(self.fetches, [('aplusb', digest)])
        self.assertEqual(moj_data.cached_problem_root('aplusb'), directory)
        self.assertEqual(moj_data.cached_hash('aplusb'), digest)

    def test_a_cached_hash_is_not_downloaded_again(self) -> None:
        digest = self.serve(problem())
        self.ensure('aplusb', digest)
        self.served = None  # a second download would now assert
        self.assertEqual(self.ensure('aplusb', digest), os.path.join(self.cache, 'aplusb'))
        self.assertEqual(len(self.fetches), 1)

    def test_a_new_hash_replaces_the_cached_copy(self) -> None:
        first = self.serve(problem(cases=1))
        self.ensure('aplusb', first)
        second = self.serve(problem(cases=3))
        directory = self.ensure('aplusb', second)

        self.assertEqual(len(self.fetches), 2)
        self.assertTrue(os.path.isfile(os.path.join(directory, 'tests', '3.in')))
        self.assertEqual(moj_data.cached_hash('aplusb'), second)
        self.assertNoLeftovers()

    def test_the_cache_is_a_problem_root_keyed_by_the_full_dotted_code(self) -> None:
        digest = self.serve(problem())
        directory = self.ensure('algo101.a1.knapsack', digest)
        self.assertEqual(directory, os.path.join(self.cache, 'algo101.a1.knapsack'))
        self.assertEqual(moj_data.cached_problem_root('algo101.a1.knapsack'), directory)
        self.assertEqual(moj_data.problem_glob(), os.path.join(self.cache, '*') + os.sep)

    # -- refusals --------------------------------------------------------------------------------------------

    def test_a_hash_that_does_not_verify_is_refused_and_keeps_the_old_copy(self) -> None:
        good = self.serve(problem(cases=2))
        self.ensure('aplusb', good)

        self.served = problem(cases=5)  # served bytes that are not what the hash below promises
        promised = hashlib.sha256(b'something else entirely').hexdigest()
        with self.assertRaises(moj_data.ProblemDataError) as caught:
            self.ensure('aplusb', promised)
        self.assertIn('does not match', str(caught.exception))

        self.assertEqual(moj_data.cached_hash('aplusb'), good)
        self.assertFalse(os.path.exists(os.path.join(self.cache, 'aplusb', 'tests', '5.in')))
        self.assertNoLeftovers()

    def test_an_archive_without_init_yml_is_refused(self) -> None:
        digest = self.serve(archive({'tests/1.in': '1\n'}))
        with self.assertRaises(moj_data.ProblemDataError) as caught:
            self.ensure('aplusb', digest)
        self.assertIn('init.yml', str(caught.exception))
        self.assertEqual(self.cache_entries(), [])
        self.assertNoLeftovers()

    def test_a_member_climbing_out_of_the_problem_directory_is_refused(self) -> None:
        digest = self.serve(archive({'init.yml': 'test_cases: []\n', '../escaped.txt': 'pwned'}))
        with self.assertRaises(moj_data.ProblemDataError) as caught:
            self.ensure('aplusb', digest)
        self.assertIn('escapes', str(caught.exception))
        self.assertFalse(os.path.exists(os.path.join(self.cache, 'escaped.txt')))
        self.assertEqual(self.cache_entries(), [])
        self.assertNoLeftovers()

    def test_a_deeply_nested_climb_is_refused(self) -> None:
        outside = os.path.join(self.outside, 'escaped.txt')
        name = os.path.relpath(outside, os.path.join(self.cache, 'aplusb'))
        self.assertTrue(name.startswith('..'))
        digest = self.serve(archive({'init.yml': 'test_cases: []\n', name: 'pwned'}))
        with self.assertRaises(moj_data.ProblemDataError):
            self.ensure('aplusb', digest)
        self.assertFalse(os.path.exists(outside))
        self.assertNoLeftovers()

    def test_an_absolute_member_is_refused(self) -> None:
        digest = self.serve(archive({'init.yml': 'test_cases: []\n', '/etc/moj-escaped': 'pwned'}))
        with self.assertRaises(moj_data.ProblemDataError) as caught:
            self.ensure('aplusb', digest)
        self.assertIn('absolute', str(caught.exception))
        self.assertNoLeftovers()

    def test_a_symlink_member_is_refused(self) -> None:
        digest = self.serve(archive({'init.yml': 'test_cases: []\n'}, symlinks={'tests': '/etc'}))
        with self.assertRaises(moj_data.ProblemDataError) as caught:
            self.ensure('aplusb', digest)
        self.assertIn('symlink', str(caught.exception))
        self.assertFalse(os.path.islink(os.path.join(self.cache, 'aplusb', 'tests')))
        self.assertNoLeftovers()

    def test_a_problem_code_that_is_a_path_is_refused(self) -> None:
        digest = self.serve(problem())
        for code in ('../escaped', 'a/b', '', '.hidden'):
            with self.assertRaises(moj_data.ProblemDataError):
                self.ensure(code, digest)
            self.assertIsNone(moj_data.cached_problem_root(code))
        self.assertEqual(self.cache_entries(), [])

    def test_a_hash_that_is_not_a_sha256_is_refused(self) -> None:
        self.serve(problem())
        for bad in ('', 'nope', 'z' * 64, '0' * 63):
            with self.assertRaises(moj_data.ProblemDataError):
                self.ensure('aplusb', bad)
        self.assertEqual(self.fetches, [])

    def test_an_archive_bigger_than_the_ceiling_is_refused(self) -> None:
        os.environ['MOJ_DATA_MAX_GB'] = repr(4096 / moj_data.GIGABYTE)
        digest = self.serve(problem(padding=64 * 1024))
        with self.assertRaises(moj_data.ProblemDataError) as caught:
            self.ensure('aplusb', digest)
        self.assertIn('ceiling', str(caught.exception))
        self.assertNoLeftovers()

    # -- eviction --------------------------------------------------------------------------------------------

    def test_evicts_least_recently_used_problems_over_the_ceiling(self) -> None:
        # Room for two problems of roughly 4 KB each, not three.
        os.environ['MOJ_DATA_MAX_GB'] = repr(9000 / moj_data.GIGABYTE)

        for code in ('first', 'second'):
            self.ensure(code, self.serve(problem(padding=4096)))

        # Explicit mtimes: the LRU order is the directory mtime, which `ensure_problem_data` touches on use.
        os.utime(os.path.join(self.cache, 'first'), (1000, 1000))
        os.utime(os.path.join(self.cache, 'second'), (2000, 2000))

        self.ensure('third', self.serve(problem(padding=4096)))

        self.assertEqual(self.cache_entries(), ['second', 'third'])
        self.assertIsNone(moj_data.cached_problem_root('first'))

    def test_using_a_problem_saves_it_from_the_next_eviction(self) -> None:
        os.environ['MOJ_DATA_MAX_GB'] = repr(9000 / moj_data.GIGABYTE)

        first = self.serve(problem(padding=4096))
        self.ensure('first', first)
        self.ensure('second', self.serve(problem(padding=4096)))

        os.utime(os.path.join(self.cache, 'first'), (1000, 1000))
        os.utime(os.path.join(self.cache, 'second'), (2000, 2000))

        # Grading `first` again touches it, so `second` becomes the oldest and goes instead.
        self.served = None
        self.ensure('first', first)

        self.ensure('third', self.serve(problem(padding=4096)))
        self.assertEqual(self.cache_entries(), ['first', 'third'])

    def test_eviction_is_off_when_the_ceiling_is_zero(self) -> None:
        os.environ['MOJ_DATA_MAX_GB'] = '0'
        for code in ('first', 'second', 'third'):
            self.ensure(code, self.serve(problem(padding=4096)))
        self.assertEqual(self.cache_entries(), ['first', 'second', 'third'])

    def test_a_nonsense_ceiling_falls_back_to_the_default(self) -> None:
        os.environ['MOJ_DATA_MAX_GB'] = 'twenty'
        self.assertEqual(moj_data.max_cache_bytes(), int(moj_data.DEFAULT_MAX_GB * moj_data.GIGABYTE))


if __name__ == '__main__':
    unittest.main()
