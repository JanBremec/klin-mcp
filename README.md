# Klin — Visual Idea Creator (Claude Plugin)

**Klin** is an official Claude Plugin that empowers Claude to proactively visualize ideas, UI/UX designs, diagrams, flowcharts, architecture maps, concept art, wireframes, and illustrations.

Installing the plugin automatically provisions:
- 🔌 **Remote MCP Server**: Connects to Klin's image generation backend (`https://klin-mcp.klin.workers.dev/mcp`).
- 🧠 **Proactive Visual Skill**: Instructs Claude to create visual aids automatically without waiting to be asked.

---

## 🚀 Installation (One-Click Plugin Flow)

### 1. Add the Klin Marketplace & Install Plugin

In **Claude Code**, run:

```bash
/plugin marketplace add JanBremec/klin-mcp
/plugin install klin@klin-marketplace
```

Or install directly from the repository:

```bash
claude plugin add github:JanBremec/klin-mcp
```

### 2. In Claude Desktop & Web

Users can install the plugin via the **Plugins & Marketplace** UI by browsing or adding the marketplace `JanBremec/klin-mcp`.

---

## 🎨 What Claude Can Visualize

- **UI & UX** — Mobile app screens, web dashboards, hero sections, button layouts
- **Diagrams & Workflows** — Architecture diagrams, flowcharts, decision trees, infrastructure maps
- **Branding & Assets** — Logos, app icons, vector concepts, brand identity
- **Concept Art & Renders** — Product designs, 3D renders, game assets, environment art
- **Educational Graphics** — Scientific illustrations, infographics, timelines, comparisons

---

## 📦 Plugin Repository Architecture

```text
klin-mcp/
├── .claude-plugin/
│   ├── plugin.json          # Plugin manifest
│   └── marketplace.json     # Marketplace catalog definition
├── .mcp.json                # MCP connector configuration
├── skills/
│   └── klin/
│       └── SKILL.md         # Proactive visual generation skill rules
├── src/                     # Cloudflare Worker source code
├── LICENSE                  # MIT License
└── README.md
```

---

## 🛠️ MCP Tools Reference

| Tool | Purpose |
|---|---|
| `visualize_idea` | Creates visual explanations, mockups, diagrams, illustrations, UI designs, and photorealistic images |
| `get_balance` | Checks active plan and remaining token balance |
| `get_plans` | Lists available subscription tiers ($7 Starter, $10 Pro, $14.99 Unlimited) |
| `get_jobs` | Retrieves recent generation job history |

---

## 🔗 Links & Account Management

- Website & Subscriptions: [https://klin-skill.netlify.app](https://klin-skill.netlify.app)
- License: [MIT](LICENSE)
