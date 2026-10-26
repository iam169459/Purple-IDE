import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'

const app = express()
app.use(cors())
app.use(bodyParser.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/mcp/context', (req, res) => {
  const { sessionId } = req.body || {}
  res.json({ sessionId: sessionId || null, context: { files: [], notes: [] } })
})

app.post('/mcp/query', (req, res) => {
  const { query } = req.body || {}
  res.json({ query, result: `Echo: ${String(query || '')}` })
})

const port = process.env.PORT || 3999
app.listen(port, () => {
  console.log(`MCP server listening on http://localhost:${port}`)
})
