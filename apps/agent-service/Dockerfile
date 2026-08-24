# ---------------------------------------------------------------------------
# reservAI agent service
#
# Runs as a long-lived process, not a serverless function, because it holds a
# scheduler: reminders, SLA escalation and proactive nudges are swept every
# minute from inside the process. That is also why it does not go on Vercel.
# ---------------------------------------------------------------------------

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

FROM base AS builder
WORKDIR /app
# The whole workspace: the service bundles @reservai/* from source, so the
# packages have to be present at build time.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @reservai/agent-service build
# Just this service and its production dependencies. Copying the workspace
# node_modules instead would ship Expo, React Native and Next.js — about 1.8GB
# of things this process never loads.
RUN pnpm --filter @reservai/agent-service deploy --prod --legacy /deploy

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# The bundle inlines the workspace packages; everything else is a real
# dependency and has to be present.
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/package.json ./package.json
COPY --from=builder /app/apps/agent-service/dist ./dist

# Never root. A compromised webhook handler should not own the container.
USER node

EXPOSE 3030

# The platform's own health check hits this; a failing boot should not be
# reported as a healthy deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.AGENT_SERVICE_PORT||3030)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
