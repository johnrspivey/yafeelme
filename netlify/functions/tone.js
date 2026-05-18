exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: "Invalid JSON" };
  }

  const { text } = body;
  if (!text || !text.trim()) {
    return { statusCode: 400, headers: CORS, body: "No text provided" };
  }

  // Split into sentences server-side for consistency
  const sentences =
    text.match(/[^.!?…]+[.!?…]+["']?\s*|[^.!?…]+$/g) || [text];
  const cleaned = sentences.map((s) => s.trim()).filter((s) => s.length > 1);

  const prompt = cleaned.map((s, i) => `${i + 1}. ${s}`).join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: `Return ONLY a raw JSON array. No markdown, no backticks, no explanation, no text before or after.
Format: [{"sentence":"exact sentence text","tone":"tone_word"},...]
Tone must be exactly one of: happy excited flirty hopeful chill sad melancholy sarcastic angry frustrated passive neutral`,
        messages: [
          {
            role: "user",
            content: `Score each sentence for emotional tone:\n${prompt}`,
          },
        ],
      }),
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text || "[]";

    // Robust parse — try multiple strategies
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {}
    if (!parsed) {
      const stripped = raw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      try { parsed = JSON.parse(stripped); } catch {}
    }
    if (!parsed) {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }
    if (!parsed) {
      const rows = [
        ...raw.matchAll(/"sentence"\s*:\s*"([^"]+)"[^}]*"tone"\s*:\s*"([^"]+)"/g),
      ];
      if (rows.length) parsed = rows.map((r) => ({ sentence: r[1], tone: r[2] }));
    }

    if (!parsed || !parsed.length) {
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ error: "Parse failed", raw: raw.slice(0, 200) }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: parsed }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
