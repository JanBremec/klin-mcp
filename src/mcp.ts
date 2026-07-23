/**
 * mcp.ts — Klin MCP tools
 *
 * OAuth token is validated by workers-oauth-provider before tools are called.
 * this.props.userId contains the Firebase UID.
 *
 * We forward the UID to Render backend using the service key so existing
 * billing/token deduction logic continues working.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./index";

interface Props {
  userId: string;
  email?: string;
}

export class KlinMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "klin",
    version: "1.0.0",
  });

  // Call Render backend as authenticated user
  private async renderFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.env.RENDER_BACKEND_URL}${path}`;

    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.env.KLIN_SERVICE_KEY}`,
        "X-User-UID": this.props.userId,
        ...(options.headers as Record<string, string> || {}),
      },
    });
  }


  // Convert Uint8Array -> base64 safely
  private bytesToBase64(bytes: Uint8Array): string {
    let binary = "";

    const chunkSize = 8192;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(i, i + chunkSize)
      );
    }

    return btoa(binary);
  }


  async init() {

    // ── Tool: visualize_idea ──────────────────────────────────────────
    this.server.tool(
      "visualize_idea",
      "Creates visual explanations, diagrams, mockups, illustrations, concept art, UI designs, architecture drawings, educational graphics, and photorealistic images. Use for: UI/UX mockups, website designs, logos, icons, architecture diagrams, flowcharts, infographics, wireframes, room layouts, product renders, packaging, fashion concepts, game assets, maps, educational illustrations, scientific diagrams, comparison images, charts, and any visual aid that communicates better than text. Prefer this over writing several paragraphs describing appearance.",
      {
        prompt: z.string()
          .describe("Detailed description of the image to generate"),

        steps: z.number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(4)
          .describe(
            "Inference steps. Higher means better quality but slower. Recommended: 4."
          ),

        guidance: z.number()
          .min(1)
          .max(20)
          .optional()
          .default(1.0)
          .describe(
            "Guidance scale. Recommended: 1.0."
          ),

        seed: z.number()
          .int()
          .optional()
          .describe(
            "Random seed for reproducible generation."
          ),
      },

      async ({ prompt, steps, guidance, seed }) => {

        const resp = await this.renderFetch(
          "/api/jobs/generate-image",
          {
            method: "POST",
            body: JSON.stringify({
              prompt,
              steps,
              guidance,
              seed: seed ?? null,
            }),
          }
        );


        if (resp.status === 402) {
          return {
            content: [
              {
                type: "text",
                text:
                  "⚠️ Not enough tokens to visualize this idea. Visit https://klin-skill.netlify.app to upgrade your plan.",
              },
            ],
          };
        }


        if (resp.status === 401) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Authentication error. Please reconnect the Klin connector in Claude Settings → Connectors.",
              },
            ],
          };
        }


        if (!resp.ok) {
          const err =
            await resp.text().catch(() => resp.statusText);

          return {
            content: [
              {
                type: "text",
                text:
                  `Generation failed (${resp.status}): ${err}`,
              },
            ],
          };
        }


        const { url, job_id } = await resp.json() as {
          url: string;
          job_id: string;
        };

        // Fetch from Render requesting WebP — Render should convert and return image/webp
        const imageResp = await fetch(url, {
          headers: { "Accept": "image/png" },
        });

        if (!imageResp.ok) {
          return {
            content: [
              {
                type: "text",
                text: "Generation completed but image retrieval failed.",
              },
            ],
          };
        }

        const bytes = new Uint8Array(await imageResp.arrayBuffer());
        const base64 = this.bytesToBase64(bytes);

        return {
          content: [
            {
              type: "text",
              text: `Image generated successfully.\n\nSave the following as image.png:\n\ndata:image/png;base64,${base64}`,
            },
          ],
        };
      }
    );



    // ── Tool: get_balance ─────────────────────────────────────────────
    this.server.tool(
      "get_balance",
      "Check the user's current token balance and subscription plan.",
      {},
      async () => {

        const resp = await this.renderFetch("/api/me");


        if (!resp.ok) {
          return {
            content: [
              {
                type: "text",
                text: "Could not fetch account info.",
              },
            ],
          };
        }


        const {
          tokens,
          plan,
          email,
        } = await resp.json() as {
          tokens: number;
          plan: string | null;
          email: string;
        };


        return {
          content: [
            {
              type: "text",
              text:
`Account: ${email}
Plan: ${plan ?? "Free"}
Tokens remaining: ${tokens}`,
            },
          ],
        };
      }
    );



    // ── Tool: get_plans ────────────────────────────────────────────────
    this.server.tool(
      "get_plans",
      "List available Klin subscription plans with pricing and token amounts.",
      {},
      async () => {

        const resp = await this.renderFetch("/api/plans");


        if (!resp.ok) {
          return {
            content: [
              {
                type: "text",
                text: "Could not fetch plans.",
              },
            ],
          };
        }


        const plans =
          await resp.json() as Record<
            string,
            {
              name: string;
              price_usd: number;
              tokens_per_month: number;
            }
          >;


        const lines = Object.values(plans).map(
          p =>
            `• ${p.name} — $${p.price_usd}/mo — ${p.tokens_per_month} tokens/month`
        );


        return {
          content: [
            {
              type: "text",
              text:
`Available plans:
${lines.join("\n")}

Upgrade at https://klin-skill.netlify.app`,
            },
          ],
        };
      }
    );



    // ── Tool: get_jobs ────────────────────────────────────────────────
    this.server.tool(
      "get_jobs",
      "List the user's recent generation jobs and their results.",
      {},
      async () => {

        const resp = await this.renderFetch("/api/jobs");


        if (!resp.ok) {
          return {
            content: [
              {
                type: "text",
                text: "Could not fetch job history.",
              },
            ],
          };
        }


        const jobs =
          await resp.json() as Array<{
            id: string;
            type: string;
            status: string;
            resultUrl: string | null;
            createdAt: number;
          }>;


        if (!jobs.length) {
          return {
            content: [
              {
                type: "text",
                text: "No jobs yet.",
              },
            ],
          };
        }


        const lines = jobs.slice(0, 10).map(j => {

          const date =
            new Date(j.createdAt * 1000)
              .toLocaleString();

          return `• [${j.type}] ${j.status} — ${date}`;
        });


        return {
          content: [
            {
              type: "text",
              text:
`Recent jobs:
${lines.join("\n")}`,
            },
          ],
        };
      }
    );

  }
}