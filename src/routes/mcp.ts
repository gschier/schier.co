import { createFileRoute } from '@tanstack/react-router'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createAdminServer } from '#/server/mcp/server'
import { error, sameSecret } from '#/server/http'

/// The admin MCP (src/server/mcp/server.ts) over streamable HTTP,
/// stateless: a fresh server and transport per request, answered in JSON.
/// Auth is the bearer MCP_TOKEN; without one set, the MCP is off.
async function handle(request: Request): Promise<Response> {
  const token = process.env.MCP_TOKEN
  if (!token) return error(503, 'MCP_TOKEN is not configured')
  const auth = request.headers.get('authorization') ?? ''
  const given = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
  if (!given || !sameSecret(given, token)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer realm="schier-co-admin"' },
    })
  }
  const server = createAdminServer()
  // Stateless and JSON-bodied: each call is one request and response, which
  // is all the admin tools need and keeps curl and proxies simple.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    void transport.close()
  }
}

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
})
