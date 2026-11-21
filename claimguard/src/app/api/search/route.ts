import { NextResponse } from "next/server";

/**
 * Server-side Tavily proxy.
 *
 * Keeps TAVILY_API_KEY out of the browser bundle. When the key is absent the
 * route answers `{ available: false }` with HTTP 200 so the client adapter can
 * degrade to the seeded corpus and badge the result [SIMULATED] — it never
 * throws, because "no key" is a supported configuration, not an error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SearchRequestBody {
  query?: string;
  depth?: "basic" | "advanced";
  maxResults?: number;
}

const UPSTREAM = "https://api.tavily.com/search";

export async function POST(request: Request) {
  const apiKey = process.env.TAVILY_API_KEY ?? process.env.NEXT_PUBLIC_TAVILY_API_KEY ?? "";

  if (!apiKey.trim()) {
    return NextResponse.json({ available: false, reason: "TAVILY_API_KEY is not configured on the server." });
  }

  let body: SearchRequestBody;
  try {
    body = (await request.json()) as SearchRequestBody;
  } catch {
    return NextResponse.json({ available: false, reason: "Request body was not valid JSON." }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ available: false, reason: "query is required." }, { status: 400 });
  }

  const depth = body.depth === "advanced" ? "advanced" : "basic";
  const maxResults = Math.max(1, Math.min(10, body.maxResults ?? 5));

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: depth,
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { available: false, reason: `Tavily responded ${upstream.status}${text ? `: ${text.slice(0, 200)}` : ""}` },
        { status: 200 },
      );
    }

    const data = (await upstream.json()) as {
      answer?: string;
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        published_date?: string;
        score?: number;
      }>;
    };

    const results = (data.results ?? [])
      .filter((r) => typeof r.url === "string" && r.url.startsWith("http"))
      .map((r) => ({
        title: r.title ?? r.url ?? "Untitled source",
        url: r.url as string,
        content: r.content ?? "",
        published_date: r.published_date ?? null,
        score: typeof r.score === "number" ? r.score : 0.5,
      }));

    return NextResponse.json({ available: true, answer: data.answer ?? null, results });
  } catch (err) {
    return NextResponse.json({
      available: false,
      reason: err instanceof Error ? err.message : "Tavily request failed.",
    });
  }
}
