# Build a ZIP for the managed Python runtime. This image is local build tooling.
FROM public.ecr.aws/lambda/python:3.12 AS build
RUN dnf install -y gcc-c++ make sqlite-devel zlib-devel tar gzip && dnf clean all
WORKDIR /build
RUN curl -fsSL https://codeload.github.com/felt/tippecanoe/tar.gz/refs/tags/2.79.0 -o tippecanoe.tar.gz \
 && echo 'b0fd9df49b6efc988288ea48774822c6de19eb48428017f27ee0b3b01d44f05d  tippecanoe.tar.gz' | sha256sum -c - \
 && tar -xzf tippecanoe.tar.gz && make -C tippecanoe-2.79.0 -j4
COPY tools/data/pyproject.toml tools/data/uv.lock /build/tools/data/
RUN pip install --no-cache-dir uv==0.12.3 \
 && uv export --quiet --project tools/data --frozen --no-dev --no-emit-project --format requirements-txt -o /build/requirements.txt \
 && pip install --no-cache-dir --require-hashes --no-deps --target /package -r /build/requirements.txt
COPY tools/data/atlas_data /package/atlas_data
COPY data /package/data
RUN mkdir -p /package/bin /package/lib \
 && cp /build/tippecanoe-2.79.0/tippecanoe /package/bin/ \
 && strip /package/bin/tippecanoe \
 && cp -L /usr/lib64/libsqlite3.so.0 /usr/lib64/libstdc++.so.6 /usr/lib64/libgcc_s.so.1 /usr/lib64/libz.so.1 /package/lib/
COPY tools/data/package.py /build/package.py
RUN python /build/package.py /package /lambda.zip

# Check the ZIP contents in a clean managed-runtime image, without build tools.
FROM public.ecr.aws/lambda/python:3.12 AS check
COPY --from=build /lambda.zip /tmp/lambda.zip
# zipfile's test extractor does not restore the executable mode stored in ZIP.
RUN python -m zipfile -e /tmp/lambda.zip /var/task && chmod 755 /var/task/bin/tippecanoe
ENV PATH="/var/task/bin:/var/lang/bin:/usr/local/bin:/usr/bin:/bin" LD_LIBRARY_PATH="/var/task/lib:/var/lang/lib:/lib64:/usr/lib64:/var/runtime:/var/task" TIPPECANOE_MAX_THREADS=2
RUN python -c "import atlas_data.worker; from pathlib import Path; from tempfile import TemporaryDirectory; from atlas_data.io import write_json; from atlas_data.tiles import compile_tiles; t=TemporaryDirectory(); p=Path(t.name); write_json(p/'point.json', {'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[0,0]}}]}); compile_tiles({'test':p/'point.json'},p/'test.pmtiles',0)"

FROM scratch AS package
COPY --from=check /tmp/lambda.zip /lambda.zip
