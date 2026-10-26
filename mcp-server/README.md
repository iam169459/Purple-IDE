# MCP Server

This is a minimal Model Context Protocol (MCP) server used by Purple IDE for local development.

Quick start:

1. Install dependencies:

```bash
cd mcp-server
npm install
```

2. Run in development (auto-restarts):

```bash
npm run dev
```

3. Health check:

```bash
curl http://localhost:3999/health
```

Endpoints:

- `GET /health` — basic health check
- `POST /mcp/context` — returns a minimal context JSON (expects `{ sessionId }`)
- `POST /mcp/query` — echoes back the `query` in the request body
