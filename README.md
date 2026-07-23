# Klin Claude Plugin & MCP Server

Klin turns Claude into an AI Image Generator powered by your Klin account. Users connect once via OAuth — no manual API key setup required.

## Plugin Overview

This repository is structured as an official **Claude Plugin** combining:
1. **MCP Tools** (`generate_image`, `get_balance`, `get_plans`, `get_jobs`) powered by Cloudflare Workers & Durable Objects.
2. **Skill Definition** (`skills/klin/SKILL.md`) providing guidance to Claude on prompt engineering and token error handling.
3. **Plugin Manifest** (`.claude-plugin/plugin.json`) enabling zero-config plugin distribution.

---

## File Structure

```text
klin-mcp/
├── .claude-plugin/
│   └── plugin.json       # Claude Plugin Manifest
├── .mcp.json             # Remote MCP server endpoint config
├── skills/
│   └── klin/
│       └── SKILL.md      # Skill instructions for Claude
├── src/
│   ├── auth-handler.ts   # OAuth 2.1 + Firebase Auth handler
│   ├── index.ts          # Worker router
│   └── mcp.ts            # MCP tools implementation
├── wrangler.toml         # Cloudflare Worker configuration
└── README.md
```

---

## Installation & Deployment

### 1. Deploy the Cloudflare Worker

```bash
npm install
npx wrangler secret put KLIN_SERVICE_KEY
npx wrangler secret put COOKIE_SECRET
npm run deploy
```

Take note of your deployed Worker URL:
`https://klin-mcp.YOUR_ACCOUNT.workers.dev`

### 2. Update `.mcp.json`

In `.mcp.json`, replace `YOUR_ACCOUNT` with your actual Cloudflare Worker domain:

```json
{
  "mcpServers": {
    "klin": {
      "type": "http",
      "url": "https://klin-mcp.YOUR_ACCOUNT.workers.dev/mcp"
    }
  }
}
```

### 3. Using as a Claude Plugin

#### Option A: Claude Code / Claude CLI
Install the plugin locally from this repository:
```bash
claude plugin add ./
```

#### Option B: Claude Desktop & Claude.ai
Add as a Custom Connector in **Claude → Settings → Connectors → Add custom MCP**:
```text
https://klin-mcp.YOUR_ACCOUNT.workers.dev/mcp
```

#### Option C: Push to GitHub & Share
Push this repository to GitHub. Anyone can clone it or add it as a plugin in Claude Code or reference the SKILL and MCP connector!

---

## Available MCP Tools

| Tool | Description |
|---|---|
| `generate_image` | Generates WebP/PNG image from prompt, deducts tokens from account |
| `get_balance` | Shows remaining tokens & subscription plan |
| `get_plans` | Lists available subscription tiers ($7 Starter, $10 Pro, $14.99 Unlimited) |
| `get_jobs` | Lists recent generation history |
