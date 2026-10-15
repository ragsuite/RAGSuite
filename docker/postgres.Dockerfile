# Postgres 15 (Alpine) + pgvector — vector store for RAG chunks.
#
# Stays on the Alpine (musl) base the existing postgres_data volumes were created with:
# switching to the Debian pgvector/pgvector image would change libc collation and can
# silently corrupt text btree indexes on an existing data directory.
FROM postgres:15-alpine

ARG PGVECTOR_VERSION=0.8.7

# with_llvm=no: skip JIT bitcode (needs a matching clang); OPTFLAGS="": portable build,
# no -march=native, so the image runs on any host CPU of the same architecture.
RUN apk add --no-cache --virtual .pgvector-build-deps git build-base \
    && git clone --branch "v${PGVECTOR_VERSION}" --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && cd /tmp/pgvector \
    && make with_llvm=no OPTFLAGS="" \
    && make with_llvm=no OPTFLAGS="" install \
    && cd / \
    && rm -rf /tmp/pgvector \
    && apk del .pgvector-build-deps
