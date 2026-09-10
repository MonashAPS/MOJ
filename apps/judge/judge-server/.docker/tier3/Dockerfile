FROM ghcr.io/dmoj/runtimes-tier3:latest

ARG TAG=master
RUN mkdir /judge /problems && cd /judge && \
	curl -L https://github.com/MonashAPS/judge-server/archive/"${TAG}".tar.gz | tar -xz --strip-components=1 && \
    # The runtimes image's Python has pip but no ensurepip, so venv cannot bootstrap;
    # virtualenv ships its own pip and setuptools wheels.
    python3 -m pip install --no-cache-dir virtualenv && \
    python3 -m virtualenv --prompt=DMOJ /env && \
	/env/bin/pip3 install cython setuptools && \
	/env/bin/pip3 install -e . && \
	/env/bin/python3 setup.py develop && \
	HOME=~judge . ~judge/.profile && \
	runuser -u judge -w PATH -- /env/bin/dmoj-autoconf -V > /judge-runtime-paths.yml && \
	echo '  crt_x86_in_lib32: true' >> /judge-runtime-paths.yml

ENTRYPOINT ["/usr/bin/tini", "--", "/judge/.docker/entry"]
