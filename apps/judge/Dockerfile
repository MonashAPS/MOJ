# MOJ judge image.
#
# TIER selects the runtime base image published by DMOJ:
#   tier1  Python, C, C++, Java, Pascal and the other common contest languages (a few GB)
#   tier2  tier1 plus the less common runtimes
#   tier3  everything DMOJ supports
#
# The images come from Docker Hub, not from ghcr.io. DMOJ stopped rebuilding the ghcr.io
# mirror in March 2022, so `ghcr.io/dmoj/runtimes-tier1` still ships GCC 11, which has no
# C++23 (`__cplusplus` is 202100L) and no `-std=c23` at all. The Docker Hub tag is current.
#
# Build from the repository root so the judge-server subtree is in the context:
#   docker build --build-arg TIER=tier1 -t moj-judge:tier1 apps/judge
ARG TIER=tier1
FROM dmoj/runtimes-${TIER}

COPY judge-server /judge

RUN mkdir -p /problems && cd /judge && \
	# Current runtimes images ship a Python with ensurepip, so `venv` bootstraps itself. Older
	# ones ship pip without ensurepip, and are not marked externally managed, so virtualenv --
	# which carries its own pip and setuptools wheels -- fills in there.
	{ python3 -m venv /env || { python3 -m pip install --no-cache-dir virtualenv && \
		python3 -m virtualenv --prompt=DMOJ /env; }; } && \
	/env/bin/pip3 install --no-cache-dir cython setuptools && \
	/env/bin/pip3 install --no-cache-dir -e . && \
	/env/bin/python3 setup.py develop && \
	HOME=~judge . ~judge/.profile && \
	runuser -u judge -w PATH -- /env/bin/dmoj-autoconf -V > /judge-runtime-paths.yml && \
	echo '  crt_x86_in_lib32: true' >> /judge-runtime-paths.yml

COPY judge.yml.template /judge.yml.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DMOJ_IN_DOCKER=1 \
	PYTHONUNBUFFERED=1 \
	LANG=C.UTF-8 \
	PYTHONIOENCODING=utf8

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
