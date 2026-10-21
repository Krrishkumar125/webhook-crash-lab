# Contributing

The most useful contribution is a **broken handler + the invariant that catches it**: add a scenario or a demo case with a failing test first, then the fix.

```bash
npm ci
docker run -d -p 6379:6379 redis:7-alpine   # BullMQ tests need real Redis
REDIS_URL=redis://localhost:6379 npm test
npm run lint && npm run typecheck && npm run build
```

Keep the core dependency-free. Provider adapters go behind subpath exports with optional peer dependencies.
