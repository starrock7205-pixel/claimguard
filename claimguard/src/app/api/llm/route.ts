import { NextResponse } from "next/server";

/**
 * Server-side Bifrost proxy.
 *
 * Bifrost exposes an OpenAI-compatible API, so this forwards a chat-completions
 * request to `<BIFROST_BASE_URL>/chat/completions` using the server-side key.
 * With no key configured it answers `{ available: false }` (HTTP 200) so the
 * client adapter can run the deterministic mock engine and badge the response
 * [SIMULATED].
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LlmRequestBody {
  model?: string;
  messages?: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

function endpointFor(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

export async function POST(request: Request) {
  const apiKey = process.env.BIFROST_API_KEY ?? process.env.NEXT_PUBLIC_BIFROST_API_KEY ?? "";
  const baseUrl =
    process.env.BIFROST_BASE_URL ?? process.env.NEXT_PUBLIC_BIFROST_BASE_URL ?? "http://localhost:8080/v1";

  if (!apiKey.trim()) {
    return NextResponse.json({ available: false, reason: "BIFROST_API_KEY is not configured on the server." });
  }

  let body: LlmRequestBody;
  try {
    body = (await request.json()) as LlmRequestBody;
  } catch {
    return NextResponse.json({ available: false, reason: "Request body was not valid JSON." }, { status: 400 });
  }

  if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { available: false, reason: "model and a non-empty messages array are required." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(endpointFor(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.1,
        max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 900,
        stream: false,
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json({
        available: false,
        reason: `Bifrost responded ${upstream.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      });
    }

    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ available: false, reason: "Bifrost returned an empty completion." });
    }

    return NextResponse.json({
      available: true,
      content,
      model: data.model ?? body.model,
      usage: data.usage ?? null,
    });
  } catch (err) {
    return NextResponse.json({
      available: false,
      reason: err instanceof Error ? err.message : "Bifrost request failed.",
    });
  }
}
