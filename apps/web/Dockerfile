FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter web build

FROM base AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
COPY --from=builder /app /app
CMD ["pnpm", "start"]

