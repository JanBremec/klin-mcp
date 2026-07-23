# Klin — Visual Idea Creator (Claude Plugin & MCP Server)

**Klin** gives Claude the ability to proactively visualize ideas, UI/UX designs, diagrams, flowcharts, architecture maps, concept art, wireframes, and illustrations directly inside conversations. 

Users connect their Klin account once via OAuth — no manual API keys required.

---

## Highlights

- 🎨 **Proactive Visualization**: Claude doesn't wait to be asked. Whenever a visual aid communicates better than text, Claude calls `visualize_idea` automatically.
- ⚡ **Zero-Config OAuth**: Built-in OAuth 2.1 authentication linked with Firebase & Cloudflare Workers.
- 🧩 **Native Claude Plugin**: Built to official Claude Plugin specifications (`.claude-plugin/plugin.json`, `.mcp.json`, `SKILL.md`).

---

## What Claude Can Visualize

- **UI & UX** — Mobile app screens, web dashboards, hero sections, button layouts
- **Diagrams & Workflows** — Architecture diagrams, flowcharts, decision trees, infrastructure maps
- **Branding & Assets** — Logos, app icons, vector concepts, brand identity
- **Concept Art & Renders** — Product designs, 3D renders, game assets, environment art
- **Educational Graphics** — Scientific illustrations, infographics, timelines, comparisons

---

## Plugin File Structure

```text
klin-mcp/
├── .claude-plugin/
│   └── plugin.json       # Official Claude Plugin Manifest
├── .mcp.json             # Remote MCP server endpoint definition
├── skills/
│   └── klin/
│       └── SKILL.md      # Proactive visual generation skill rules
├── src/
│   ├── auth-handler.ts   # OAuth 2.1 + Firebase Auth handler
│   ├── index.ts          # Worker entrypoint
│   └── mcp.ts            # MCP tools (visualize_idea, get_balance, get_plans, get_jobs)
├── wrangler.toml         # Cloudflare Worker configuration
└── README.md
```

---

## MCP Tools Reference

| Tool | Purpose |
|---|---|
| `visualize_idea` | Creates visual explanations, mockups, diagrams, illustrations, UI designs, and photorealistic images |
| `get_balance` | Checks user's active plan and remaining token balance |
| `get_plans` | Lists available subscription tiers ($7 Starter, $10 Pro, $14.99 Unlimited) |
| `get_jobs` | Retrieves recent generation job history |

---

## Installation & Setup

### Option 1: Install in Claude Code (CLI)

Install directly from GitHub:
```bash
claude plugin add github:JanBremec/klin-mcp
```

Or install locally:
```bash
claude plugin add ./
```

### Option 2: Add to Claude Desktop or Claude.ai (Web)

1. Go to **Claude → Settings → Connectors**.
2. Click **Add custom MCP**.
3. Enter the connector URL:  
   `https://klin-mcp.klin.workers.dev/mcp`
4. Complete the Firebase sign-in once.

---

## Deploying Your Own Instance

```bash
npm install
npx wrangler secret put KLIN_SERVICE_KEY
npx wrangler secret put COOKIE_SECRET
npx wrangler deploy
```

Website & Subscription Management: [https://klin-skill.netlify.app](https://klin-skill.netlify.app)
