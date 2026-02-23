FROM debian:bookworm-slim

ARG BINARY_PATH=build/binaries/linkinator-linux

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY ${BINARY_PATH} /usr/local/bin/linkinator
RUN chmod +x /usr/local/bin/linkinator

ENTRYPOINT ["linkinator"]