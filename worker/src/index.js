// Contact form endpoint for Monaidea's sites (www.monaidea.com and any https://*.monaidea.com):
// checks Cloudflare Turnstile, then emails the message to support@monaidea.com through Postmark.
// Runs as the Worker "monaidea-contact" in Monaidea's own Cloudflare account, at https://forms.monaidea.com
// (owner, 2026-11-02). Set in the Cloudflare dashboard, never in code:
//   secrets  TURNSTILE_SECRET (secret key of Monaidea's Turnstile widget), POSTMARK_SERVER_TOKEN
//   optional FROM_EMAIL (default noreply@monaidea.com), TO_EMAIL (default support@monaidea.com)
// GET / says whether both secrets are set (never their values), so the setup can be checked in a browser.
// No database: Postmark and the inbox hold the record of every submission.

const DOMAIN = "monaidea.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TOPIC = "General question";

function allowedOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname;
  const ours = host === DOMAIN || host.endsWith(`.${DOMAIN}`);
  return url.protocol === "https:" && !url.port && url.origin === origin && ours;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : `https://www.${DOMAIN}`,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

// For subject lines: one line, no control characters.
function oneLine(value) {
  return value.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
}

// Returns "" when the visitor passed, otherwise a short reason (Turnstile's error code).
async function turnstileProblem(token, ip, secret) {
  if (!secret) return "not-configured";
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const result = await res.json();
    if (result.success === true) return "";
    return String((result["error-codes"] ?? [])[0] ?? "failed");
  } catch {
    return "unreachable";
  }
}

// Returns "" when Postmark accepted the message, otherwise a short reason (Postmark's error code).
async function postmarkProblem(env, message) {
  if (!env.POSTMARK_SERVER_TOKEN) return "not-configured";
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({ ...message, MessageStream: "outbound" }),
    });
    if (res.ok) return "";
    let code = "unknown";
    try {
      code = (await res.json()).ErrorCode ?? code;
    } catch {
      // Not JSON: keep "unknown".
    }
    return `postmark-${code}`;
  } catch {
    return "unreachable";
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") ?? "";
    const from = env.FROM_EMAIL || `noreply@${DOMAIN}`;
    const to = env.TO_EMAIL || `support@${DOMAIN}`;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method === "GET") {
      return json(
        {
          ok: true,
          service: "Monaidea contact form",
          turnstileSecretSet: Boolean(env.TURNSTILE_SECRET),
          postmarkTokenSet: Boolean(env.POSTMARK_SERVER_TOKEN),
          from,
          to,
        },
        200,
        origin,
      );
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, origin);
    }
    if (!allowedOrigin(origin)) {
      return json({ ok: false, error: "Origin not allowed" }, 403, origin);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid request" }, 400, origin);
    }
    if (!data || typeof data !== "object") {
      return json({ ok: false, error: "Invalid request" }, 400, origin);
    }

    // Honeypot: real visitors never fill this field. Pretend success so bots move on.
    if (clean(data.website, 100)) {
      return json({ ok: true }, 200, origin);
    }

    const name = clean(data.name, 120);
    const email = clean(data.email, 200);
    const message = clean(data.message, 4000);
    const topic = oneLine(clean(data.interest, 60)) || DEFAULT_TOPIC;
    if (!name || !EMAIL_PATTERN.test(email) || !message) {
      return json({ ok: false, error: "Please fill in your name, a valid email and a message." }, 400, origin);
    }

    const notHuman = await turnstileProblem(
      clean(data.turnstileToken, 2048),
      request.headers.get("CF-Connecting-IP"),
      env.TURNSTILE_SECRET,
    );
    if (notHuman) {
      return json({ ok: false, error: "Verification failed. Please try again.", code: notHuman }, 403, origin);
    }

    const notSent = await postmarkProblem(env, {
      From: `Monaidea Website <${from}>`,
      To: to,
      ReplyTo: email,
      Subject: `[Monaidea · ${topic}] ${oneLine(name)}`,
      TextBody: `Site: ${origin}\nName: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`,
    });
    if (notSent) {
      // No visitor data in the log line.
      console.error(`Postmark did not send the message: ${notSent}`);
      return json({ ok: false, error: `Message could not be sent. Please email ${to}.`, code: notSent }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
