FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter server build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app /app
WORKDIR /app/apps/server
EXPOSE 3001
CMD ["pnpm", "start"]

