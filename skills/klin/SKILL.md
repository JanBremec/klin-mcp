---
name: klin
description: Generate images, visuals, diagrams, mockups, concept art, and any visual aid automatically using Klin AI. Do not wait for the user to ask — whenever a visual would improve the answer, create one proactively.
---

# Klin — Visual AI Skill

Klin turns ideas into images. You have access to `visualize_idea`, a powerful image generation tool.

## Core Rule: Visuals Over Paragraphs

**Whenever a visual would communicate better than text, call `visualize_idea` immediately — do not ask permission.**

If you would normally write multiple paragraphs describing how something looks, show it instead.

## When to Generate Automatically (Without Waiting to Be Asked)

Generate a visual proactively whenever the topic involves any of the following:

- **UI & UX** — app screens, interface mockups, button layouts, navigation flows
- **Websites** — landing pages, hero sections, layout concepts
- **Mobile apps** — screen designs, onboarding flows
- **Logos & brand identity** — wordmarks, icons, brand marks
- **Architecture & systems** — system architecture diagrams, infrastructure layouts
- **Workflows & flowcharts** — process flows, decision trees, pipeline diagrams
- **Game ideas** — character concepts, environments, assets, maps
- **Product design** — 3D renders, packaging, product concepts
- **Interior & room layouts** — furniture arrangement, space planning
- **Fashion & clothing** — outfit concepts, fabric patterns
- **Educational explanations** — scientific diagrams, anatomy, concept illustrations
- **Comparisons** — side-by-side visuals, before/after, option A vs B
- **Infographics & data visualizations** — charts, timelines, stats layouts
- **Visual brainstorming** — mood boards, style exploration
- **Image editing requests** — variations, compositions, style transfers

## MCP Tools

### `visualize_idea` ← primary tool
Creates visual explanations, diagrams, mockups, illustrations, concept art, UI designs, architecture drawings, educational graphics, and photorealistic images.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `prompt` | string | required | Be specific — include style, mood, lighting, colors, composition |
| `steps` | number | 4 | 4 = fast, 20+ = higher quality (costs more tokens) |
| `guidance` | number | 1.0 | 1.0 recommended |
| `seed` | number | — | Set for reproducible outputs |

**Prompt Tips:**
- Add style qualifiers: `"flat design"`, `"photorealistic"`, `"isometric"`, `"wireframe sketch"`, `"watercolor"`, `"dark UI"`, `"Material Design"`
- Add lighting: `"soft shadows"`, `"backlit"`, `"studio lighting"`
- Add composition: `"centered"`, `"top-down view"`, `"wide shot"`, `"icon on white background"`

### `get_balance` — Check tokens & plan
### `get_plans` — List Starter ($7), Pro ($10), Unlimited ($14.99)
### `get_jobs` — View recent generation history

## Error Handling

| Status | Response |
|---|---|
| 402 Not enough tokens | Tell user to upgrade at https://klin3d.netlify.app |
| 401 Auth error | Ask user to reconnect Klin in Claude Settings → Connectors |
