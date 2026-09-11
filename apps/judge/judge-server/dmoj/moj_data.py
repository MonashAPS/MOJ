"""
Site-owned test data for MOJ, the MAPS Online Judge.

Upstream a judge grades from whatever `problem_storage_globs` points at, and getting the data there is
somebody else's problem -- usually an rsync from a problem repository over SSH. MOJ lets the site own the
data instead: a claim carries `problemDataHash`, and the judge fetches the matching archive over HTTPS with
the judge credentials it already has and grades from a local cache of it. A judge then needs no problem tree
and no SSH key, and every judge grades the same bytes.

This module is that cache. It is the only thing in the judge that talks to `GET /judge/data`:

    ensure_problem_data(code, expected_hash, url=..., judge_name=..., judge_key=...) -> str

returns the directory to grade from, having downloaded and unpacked the archive if the cache did not already
hold that exact hash. `dmoj/judgeenv.py` uses `problem_glob` and `cached_problem_root` so the rest of the
judge finds a fetched problem the same way it finds a local one, with the cache winning.

Configuration, both optional:

    MOJ_DATA_CACHE   directory for fetched archives, default /judge-data-cache
    MOJ_DATA_MAX_GB  cache ceiling in GB, default 20, evicted least-recently-used; 0 disables eviction

Nothing here is trusted: the downloaded bytes are hashed before they are unpacked, members that would escape
the problem directory are refused rather than sanitised, and the new directory is moved into place only once
it is complete, so a failed fetch leaves the previous copy exactly as it was. Only the standard library is
used, and nothing in `dmoj` is imported, so the cache can be exercised on its own.
"""

import hashlib
import io
import logging
import os
import shutil
import stat
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from typing import List, Optional, Tuple

log = logging.getLogger(__name__)

DEFAULT_CACHE_ROOT = '/judge-data-cache'
DEFAULT_MAX_GB = 20.0
GIGABYTE = 1 << 30

# Written inside a problem directory once it is complete, so an interrupted judge never mistakes a partial
# directory for a usable one.
HASH_FILE = '.moj-hash'
INIT_FILE = 'init.yml'

# Both start with a dot, so `problem_glob` never matches one while it is in flight.
STAGING_PREFIX = '.staging-'
DISCARD_PREFIX = '.discard-'

DOWNLOAD_TIMEOUT = 120.0

# One submission is graded at a time, but the control API and the heartbeat thread can look at the cache
# while a fetch is running.
_lock = threading.RLock()


class ProblemDataError(Exception):
    """Test data the judge will not grade: a hash that does not verify, no init.yml, or an unsafe member."""


def cache_root() -> str:
    return os.environ.get('MOJ_DATA_CACHE') or DEFAULT_CACHE_ROOT


def max_cache_bytes() -> int:
    """The cache ceiling in bytes, or 0 when eviction is disabled."""
    raw = (os.environ.get('MOJ_DATA_MAX_GB') or '').strip()
    if not raw:
        gigabytes = DEFAULT_MAX_GB
    else:
        try:
            gigabytes = float(raw)
        except ValueError:
            log.warning('MOJ_DATA_MAX_GB is not a number (%r), falling back to %g', raw, DEFAULT_MAX_GB)
            gigabytes = DEFAULT_MAX_GB
    return int(gigabytes * GIGABYTE) if gigabytes > 0 else 0


def problem_glob() -> str:
    """The cache as a `problem_storage_globs` entry, so the judge reports what it has fetched."""
    return os.path.join(cache_root(), '*') + os.sep


def problem_dir(code: str) -> str:
    """Where a problem code is cached. The cache is flat: a dotted code is one directory, dots and all."""
    return os.path.join(cache_root(), _checked_code(code))


def cached_problem_root(code: str) -> Optional[str]:
    """The cached directory for a problem, or None when the cache does not hold a usable copy of it."""
    try:
        directory = problem_dir(code)
    except ProblemDataError:
        return None
    return directory if os.path.isfile(os.path.join(directory, INIT_FILE)) else None


def cached_hash(code: str) -> Optional[str]:
    """The hash the cache holds for a problem, or None when it holds nothing usable."""
    root = cached_problem_root(code)
    return read_hash(root) if root is not None else None


def read_hash(directory: str) -> Optional[str]:
    try:
        with open(os.path.join(directory, HASH_FILE)) as f:
            return f.read().strip() or None
    except OSError:
        return None


def ensure_problem_data(code: str, expected_hash: str, *, url: str, judge_name: str, judge_key: str) -> str:
    """Return the directory to grade `code` from, downloading the site's archive unless it is already cached.

    Raises `ProblemDataError` when the site's copy cannot be trusted or cannot be fetched. The previously
    cached copy, if any, is left untouched in that case: the caller must not grade rather than grade stale
    data.
    """
    code = _checked_code(code)
    expected_hash = _checked_hash(code, expected_hash)
    directory = problem_dir(code)

    with _lock:
        if read_hash(directory) == expected_hash and os.path.isfile(os.path.join(directory, INIT_FILE)):
            log.debug('Test data for %s at %s is already cached', code, expected_hash)
            _touch(directory)
            return directory

        log.info('Fetching test data for %s at %s from %s', code, expected_hash, url)
        archive = _fetch_archive(url, code, expected_hash, judge_name, judge_key)

        downloaded_hash = hashlib.sha256(archive).hexdigest()
        if downloaded_hash != expected_hash:
            raise ProblemDataError(
                'test data for %s does not match the hash the site advertised: expected %s, downloaded %s (%d bytes)'
                % (code, expected_hash, downloaded_hash, len(archive))
            )

        _install(code, directory, archive, expected_hash)
        log.info('Cached test data for %s at %s in %s', code, expected_hash, directory)
        _touch(directory)
        _evict(keep=directory)
        return directory


# -- fetching ------------------------------------------------------------------------------------------------


def _fetch_archive(url: str, code: str, expected_hash: str, judge_name: str, judge_key: str) -> bytes:
    query = urllib.parse.urlencode(
        {'judgeName': judge_name, 'judgeKey': judge_key, 'code': code, 'hash': expected_hash}
    )
    request = urllib.request.Request(
        url.rstrip('/') + '/judge/data?' + query,
        headers={'Accept': 'application/zip', 'User-Agent': 'moj-judge'},
    )

    try:
        with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT) as response:
            advertised = response.headers.get('X-Moj-Data-Hash')
            body = response.read()
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode('utf-8', 'replace')[:512]
        except Exception:
            pass
        raise ProblemDataError('the site refused test data for %s: HTTP %s %s' % (code, e.code, detail)) from e
    except Exception as e:
        raise ProblemDataError('could not download test data for %s: %s' % (code, e)) from e

    if advertised and advertised != expected_hash:
        raise ProblemDataError(
            'the site served test data for %s at %s, not the %s the claim named' % (code, advertised, expected_hash)
        )
    return body


# -- unpacking -----------------------------------------------------------------------------------------------


def _install(code: str, directory: str, archive: bytes, expected_hash: str) -> None:
    """Unpack `archive` and move it into place as `directory`, or leave what is already there alone."""
    root = cache_root()
    os.makedirs(root, exist_ok=True)
    staging = tempfile.mkdtemp(prefix=STAGING_PREFIX, dir=root)
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as zip_file:
            _extract(zip_file, staging)

        if not os.path.isfile(os.path.join(staging, INIT_FILE)):
            raise ProblemDataError('test data for %s has no %s at the root of the archive' % (code, INIT_FILE))

        with open(os.path.join(staging, HASH_FILE), 'w') as f:
            f.write(expected_hash + '\n')

        _replace(staging, directory)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def _extract(archive: zipfile.ZipFile, destination: str) -> None:
    root = os.path.realpath(destination)
    limit = max_cache_bytes()
    unpacked = 0

    for info in archive.infolist():
        target = _member_path(info.filename, root)
        mode = (info.external_attr >> 16) & 0xFFFF
        # Plenty of zip writers record permissions without a file type; only refuse a type we know is wrong.
        file_type = stat.S_IFMT(mode)

        if file_type == stat.S_IFLNK:
            raise ProblemDataError('archive member %r is a symlink, which could point anywhere' % info.filename)

        if info.is_dir():
            os.makedirs(target, exist_ok=True)
            continue

        if file_type not in (0, stat.S_IFREG):
            raise ProblemDataError('archive member %r is not a regular file' % info.filename)

        unpacked += info.file_size
        if limit and unpacked > limit:
            raise ProblemDataError('archive unpacks to more than the %.1f GB cache ceiling' % (limit / GIGABYTE))

        os.makedirs(os.path.dirname(target), exist_ok=True)
        with archive.open(info) as source, open(target, 'wb') as sink:
            shutil.copyfileobj(source, sink)

        # Checkers and graders can be shipped as binaries; keep the bit the archive recorded.
        if mode & 0o111:
            os.chmod(target, 0o755)


def _member_path(name: str, root: str) -> str:
    """Resolve an archive member against the extraction root, refusing anything that would leave it."""
    if not name or name.startswith('/') or name.startswith('\\') or os.path.isabs(name):
        raise ProblemDataError('archive member %r is an absolute path' % name)

    parts = [part for part in name.replace('\\', '/').split('/') if part not in ('', '.')]
    if not parts:
        raise ProblemDataError('archive member %r has no name' % name)
    if '..' in parts:
        raise ProblemDataError('archive member %r escapes the problem directory' % name)

    target = os.path.join(root, *parts)
    resolved = os.path.realpath(target)
    if resolved != root and not resolved.startswith(root + os.sep):
        raise ProblemDataError('archive member %r escapes the problem directory' % name)
    return target


def _replace(staging: str, directory: str) -> None:
    """Swap a finished staging directory in for `directory`, never leaving it half written."""
    discard = os.path.join(os.path.dirname(directory), DISCARD_PREFIX + os.path.basename(directory))
    shutil.rmtree(discard, ignore_errors=True)

    replaced = False
    if os.path.exists(directory) and not os.path.isdir(directory):
        os.remove(directory)
    elif os.path.isdir(directory):
        os.replace(directory, discard)
        replaced = True

    try:
        os.replace(staging, directory)
    except OSError:
        if replaced:
            os.replace(discard, directory)
        raise

    if replaced:
        shutil.rmtree(discard, ignore_errors=True)


# -- housekeeping --------------------------------------------------------------------------------------------


def _touch(directory: str) -> None:
    try:
        os.utime(directory, None)
    except OSError as e:
        log.warning('Could not touch %s: %s', directory, e)


def _evict(keep: Optional[str] = None) -> None:
    """Delete least-recently-used problems until the cache is back under its ceiling."""
    limit = max_cache_bytes()
    if not limit:
        return

    entries = _cached_directories()
    total = sum(size for _mtime, _path, size in entries)
    if total <= limit:
        return

    for _mtime, path, size in sorted(entries):
        if path == keep:
            continue
        log.info('Evicting cached test data %s (%.1f MB) to stay under %.1f GB', path, size / 1e6, limit / GIGABYTE)
        shutil.rmtree(path, ignore_errors=True)
        total -= size
        if total <= limit:
            return

    log.warning('Cache is %.1f GB after eviction, over the %.1f GB ceiling', total / GIGABYTE, limit / GIGABYTE)


def _cached_directories() -> List[Tuple[float, str, int]]:
    """Every complete problem in the cache as (mtime, path, size), oldest use first once sorted."""
    root = cache_root()
    entries: List[Tuple[float, str, int]] = []
    try:
        names = os.listdir(root)
    except OSError:
        return entries

    for name in sorted(names):
        path = os.path.join(root, name)
        if name.startswith('.') or not os.path.isdir(path):
            continue
        if not os.path.isfile(os.path.join(path, HASH_FILE)):
            continue
        try:
            entries.append((os.path.getmtime(path), path, _directory_size(path)))
        except OSError:
            continue
    return entries


def _directory_size(path: str) -> int:
    total = 0
    for dirpath, _dirnames, filenames in os.walk(path):
        for filename in filenames:
            try:
                total += os.lstat(os.path.join(dirpath, filename)).st_size
            except OSError:
                continue
    return total


# -- validation ----------------------------------------------------------------------------------------------


def _checked_code(code: str) -> str:
    """A problem code the site sent us becomes a directory name, so it may not be a path of its own."""
    if not code or code != code.strip() or code.startswith('.'):
        raise ProblemDataError('refusing to cache test data under problem code %r' % code)
    if os.sep in code or '/' in code or '\\' in code or '\0' in code:
        raise ProblemDataError('refusing to cache test data under problem code %r' % code)
    return code


def _checked_hash(code: str, expected_hash: str) -> str:
    value = (expected_hash or '').strip().lower()
    if len(value) != 64 or any(character not in '0123456789abcdef' for character in value):
        raise ProblemDataError('%s was claimed with %r, which is not a sha256 hash' % (code, expected_hash))
    return value
