#!/bin/bash
# Entrypoint for the MOJ judge image.
#
# Renders /problems/judge.yml from the template if it is not there yet, then runs the judge in pull mode
# against MOJ_URL. Everything the judge needs at run time comes from the environment:
#
#   MOJ_URL         base URL of the MOJ deployment serving /judge/* (required)
#   JUDGE_NAME      judge name as created in the staff console (MOJ_JUDGE_NAME is also accepted)
#   JUDGE_KEY       judge key as created in the staff console (MOJ_JUDGE_KEY is also accepted)
#   JUDGE_CONFIG    path to the judge config file, default /problems/judge.yml
set -euo pipefail

export DMOJ_IN_DOCKER=1
export PYTHONUNBUFFERED=1
export LANG=C.UTF-8
export PYTHONIOENCODING=utf8

if [ -z "${MOJ_URL:-}" ]; then
	echo "MOJ_URL is not set; the judge has no site to pull submissions from" >&2
	exit 1
fi

JUDGE_NAME="${MOJ_JUDGE_NAME:-${JUDGE_NAME:-}}"
JUDGE_KEY="${MOJ_JUDGE_KEY:-${JUDGE_KEY:-}}"
JUDGE_CONFIG="${JUDGE_CONFIG:-/problems/judge.yml}"
export MOJ_JUDGE_NAME="$JUDGE_NAME"
export MOJ_JUDGE_KEY="$JUDGE_KEY"

if [ ! -f "$JUDGE_CONFIG" ]; then
	if [ -z "$JUDGE_NAME" ] || [ -z "$JUDGE_KEY" ]; then
		echo "$JUDGE_CONFIG does not exist and JUDGE_NAME/JUDGE_KEY are not set" >&2
		exit 1
	fi
	echo "Writing $JUDGE_CONFIG for judge $JUDGE_NAME"
	mkdir -p "$(dirname "$JUDGE_CONFIG")"
	sed -e "s|__JUDGE_NAME__|$JUDGE_NAME|" -e "s|__JUDGE_KEY__|$JUDGE_KEY|" \
		/judge.yml.template > "$JUDGE_CONFIG"
	chmod 0644 "$JUDGE_CONFIG"
fi

# Problem data is owned by whoever mounted it; the judge only ever reads it.
chown -R judge:judge /judge 2>/dev/null || true

export HOME=~judge
# shellcheck disable=SC1090
. ~judge/.profile

exec setpriv --reuid judge --regid judge --clear-groups \
	/env/bin/dmoj -c "$JUDGE_CONFIG" -A "${JUDGE_API_HOST:-127.0.0.1}" -a "${JUDGE_API_PORT:-9998}" "$@"
