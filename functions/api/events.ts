interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  PORTFOLIO_ANALYTICS: D1Database;
}

interface EventPayload {
  event?: unknown;
  target?: unknown;
  lang?: unknown;
  theme?: unknown;
  viewport?: unknown;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const ALLOWED_EVENTS = new Set([
  "project_card_open",
  "project_live_click",
  "project_details_click",
  "experience_workflow_open",
  "motion_video_load",
  "contact_email_click",
  "mobile_desktop_hint_dismiss",
]);

const ALLOWED_LANGUAGES = new Set(["en", "zh"]);
const ALLOWED_THEMES = new Set(["light", "dark"]);
const ALLOWED_VIEWPORTS = new Set(["mobile", "tablet", "desktop"]);

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("application/json")) {
    return new Response("Unsupported media type", { status: 415 });
  }

  const rawPayload = await request.text();
  if (rawPayload.length > 1024) return new Response("Payload too large", { status: 413 });

  let payload: EventPayload;
  try {
    payload = JSON.parse(rawPayload) as EventPayload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (
    typeof payload.event !== "string" ||
    !ALLOWED_EVENTS.has(payload.event) ||
    typeof payload.target !== "string" ||
    !/^[a-z0-9-]{1,64}$/.test(payload.target) ||
    typeof payload.lang !== "string" ||
    !ALLOWED_LANGUAGES.has(payload.lang) ||
    typeof payload.theme !== "string" ||
    !ALLOWED_THEMES.has(payload.theme) ||
    typeof payload.viewport !== "string" ||
    !ALLOWED_VIEWPORTS.has(payload.viewport)
  ) {
    return new Response("Invalid event", { status: 400 });
  }

  const day = new Date().toISOString().slice(0, 10);
  await env.PORTFOLIO_ANALYTICS.prepare(`
    INSERT INTO event_counts (day, event, target, lang, theme, viewport, count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (day, event, target, lang, theme, viewport)
    DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP
  `).bind(
    day,
    payload.event,
    payload.target,
    payload.lang,
    payload.theme,
    payload.viewport,
  ).run();

  return noContent();
}

function methodNotAllowed(): Response {
  return new Response("Method not allowed", {
    status: 405,
    headers: { allow: "POST", "cache-control": "no-store" },
  });
}

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
