import { verifyToken } from "@clerk/backend";
import {
  canRead,
  createState,
  type Action,
  type ClinicState,
  type Role,
} from "../src/clinic";
import { cloudTransition } from "../src/cloud-transition";

type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  CLERK_JWT_KEY: string;
  CLERK_ISSUER: string;
  ALLOWED_ORIGINS: string;
  AUTHORIZED_PARTIES: string;
};
type Member = { role: Role; provider_id: string };
type Row = { state: string; revision: number };
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const actions = new Set([
  "profile",
  "book",
  "status",
  "reschedule",
  "check",
  "visitNote",
  "consult",
  "medicine",
  "dose",
  "archiveMedicine",
  "record",
  "deleteRecord",
  "read",
  "approve",
  "issue",
  "resolve",
  "sos",
]);
const allowedMime = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const split = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function emptyState() {
  const state = createState();
  state.profile = {
    name: "",
    age: "",
    gender: "Prefer not to say",
    contact: "",
    language: "English",
    conditions: "",
    allergies: "",
    medicines: "",
    notes: "",
    consent: false,
    address: "",
  };
  state.visits = [];
  state.medicines = [];
  state.records = [];
  state.activities = [];
  return state;
}
async function userId(request: Request, env: Env) {
  if (!env.CLERK_JWT_KEY || !env.CLERK_ISSUER)
    throw new HttpError(503, "Authentication is not configured on the server.");
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, "Sign in with Google to continue.");
  try {
    const claims = await verifyToken(token, {
      jwtKey: env.CLERK_JWT_KEY,
      ...(split(env.AUTHORIZED_PARTIES).length
        ? { authorizedParties: split(env.AUTHORIZED_PARTIES) }
        : {}),
    });
    if (claims.iss !== env.CLERK_ISSUER || !claims.sub || !claims.sid)
      throw new Error("Invalid session");
    return claims.sub;
  } catch {
    throw new HttpError(401, "Session expired. Sign in again.");
  }
}
async function ensureAccount(env: Env, user: string) {
  const space = "personal_" + user;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO care_spaces (id,state) VALUES (?,?)",
    ).bind(space, JSON.stringify(emptyState())),
    env.DB.prepare(
      "INSERT OR IGNORE INTO memberships (user_id,space_id,role) VALUES (?,?,'Patient')",
    ).bind(user, space),
  ]);
  return space;
}
async function access(env: Env, user: string, space: string) {
  const member = await env.DB.prepare(
    "SELECT role,provider_id FROM memberships WHERE user_id=? AND space_id=?",
  )
    .bind(user, space)
    .first<Member>();
  if (!member)
    throw new HttpError(403, "You do not have access to this care space.");
  const row = await env.DB.prepare(
    "SELECT state,revision FROM care_spaces WHERE id=?",
  )
    .bind(space)
    .first<Row>();
  if (!row) throw new HttpError(404, "Care space not found.");
  const state: ClinicState = JSON.parse(row.state);
  state.session = {
    role: member.role,
    providerId: member.provider_id,
    identifier: user,
  };
  if (!canRead(state))
    throw new HttpError(
      403,
      "Family consent is not enabled for this care space.",
    );
  return { state, revision: row.revision, spaceId: space };
}
async function boundedJson(request: Request) {
  const text = await request.text();
  if (text.length > 128000) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET")
    return Response.json({ ok: true });
  const user = await userId(request, env);
  const personal = await ensureAccount(env, user);
  if (url.pathname === "/v1/spaces" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT c.id,c.state,m.role,m.provider_id FROM memberships m JOIN care_spaces c ON c.id=m.space_id WHERE m.user_id=?",
    )
      .bind(user)
      .all<{ id: string; state: string; role: Role; provider_id: string }>();
    return Response.json(
      rows.results.map((r) => ({
        id: r.id,
        name:
          r.role === "Family" && !JSON.parse(r.state).profile.consent
            ? "Consent required"
            : JSON.parse(r.state).profile.name || "My care space",
        role: r.role,
        providerId: r.provider_id,
      })),
    );
  }
  const space = url.searchParams.get("space") || personal;
  const snapshot = await access(env, user, space);
  if (url.pathname === "/v1/state" && request.method === "GET")
    return Response.json(snapshot);
  if (url.pathname === "/v1/actions" && request.method === "POST") {
    const { revision, action, operationId } = (await boundedJson(request)) as {
      revision: number;
      action: Action;
      operationId: string;
    };
    if (!/^[a-f0-9-]{36}$/.test(operationId || ""))
      throw new HttpError(400, "Invalid operation ID.");
    if (!action || !actions.has(action.type))
      throw new HttpError(
        400,
        "Unsupported action. Roles are assigned by the server.",
      );
    if (revision !== snapshot.revision)
      throw new HttpError(
        409,
        "Care data changed on another device. Refresh and try again.",
      );
    if (JSON.stringify(snapshot.state).includes(operationId))
      throw new HttpError(
        409,
        "This update has already been applied. Refresh your care data.",
      );
    if (action.type === "record") {
      if (action.record.uri)
        throw new HttpError(
          400,
          "Device file paths cannot be saved to cloud records.",
        );
      if (!action.record.fileId)
        throw new HttpError(400, "Upload the attachment first.");
      const attachment = await env.DB.prepare(
        "SELECT id,name,mime FROM attachments WHERE id=? AND space_id=?",
      )
        .bind(action.record.fileId, space)
        .first<{ id: string; name: string; mime: string }>();
      if (!attachment)
        throw new HttpError(
          403,
          "Attachment is not available in this care space.",
        );
      action.record = {
        ...action.record,
        name: attachment.name,
        mime: attachment.mime,
      };
    }
    let next: ClinicState;
    try {
      next = cloudTransition(snapshot.state, action, operationId);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Invalid care update.",
      );
    }
    const payload = JSON.stringify({ ...next, session: null });
    if (payload.length > 750000)
      throw new HttpError(413, "Care space storage limit reached.");
    const saved = await env.DB.prepare(
      "UPDATE care_spaces SET state=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?",
    )
      .bind(payload, space, revision)
      .run();
    if (!saved.meta.changes)
      throw new HttpError(409, "Care data changed. Refresh and try again.");
    if (action.type === "deleteRecord") {
      const fileId = snapshot.state.records.find(
        (r) => r.id === action.recordId,
      )?.fileId;
      if (fileId && !next.records.some((r) => r.fileId === fileId))
        ctx.waitUntil(
          (async () => {
            await env.FILES.delete(space + "/" + fileId);
            await env.DB.prepare(
              "DELETE FROM attachments WHERE id=? AND space_id=?",
            )
              .bind(fileId, space)
              .run();
          })(),
        );
    }
    return Response.json({
      state: next,
      revision: revision + 1,
      spaceId: space,
    });
  }
  if (url.pathname === "/v1/files" && request.method === "POST") {
    if (!["Patient", "Admin"].includes(snapshot.state.session!.role))
      throw new HttpError(403, "Only the patient can upload records.");
    const mime = request.headers.get("Content-Type")?.split(";")[0] || "";
    if (!allowedMime.has(mime))
      throw new HttpError(415, "Choose a PDF, JPEG, PNG or WebP file.");
    const advertisedSize = Number(request.headers.get("Content-Length"));
    if (advertisedSize > 15 * 1024 * 1024)
      throw new HttpError(413, "File exceeds 15 MB.");
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 15 * 1024 * 1024)
      throw new HttpError(413, "Choose a file between 1 byte and 15 MB.");
    const fileId = crypto.randomUUID();
    const name = (url.searchParams.get("name") || "attachment")
      .replace(/[\r\n]/g, "")
      .slice(0, 200);
    await env.FILES.put(space + "/" + fileId, bytes, {
      httpMetadata: { contentType: mime },
    });
    try {
      await env.DB.prepare(
        "INSERT INTO attachments (id,space_id,name,mime,size) VALUES (?,?,?,?,?)",
      )
        .bind(fileId, space, name, mime, bytes.byteLength)
        .run();
    } catch (e) {
      await env.FILES.delete(space + "/" + fileId);
      throw e;
    }
    return Response.json({ fileId, name, mime });
  }
  const fileMatch = url.pathname.match(/^\/v1\/files\/([a-f0-9-]{36})$/);
  if (fileMatch && request.method === "GET") {
    const fileId = fileMatch[1];
    const attached = snapshot.state.records.some((r) => r.fileId === fileId);
    if (!attached) throw new HttpError(404, "Attachment not found.");
    const object = await env.FILES.get(space + "/" + fileId);
    if (!object) throw new HttpError(404, "Attachment not found.");
    return new Response(object.body, {
      headers: {
        "Content-Type":
          object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  throw new HttpError(404, "Endpoint not found.");
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const origin = request.headers.get("Origin");
    const allowed = split(env.ALLOWED_ORIGINS);
    if (origin && !allowed.includes(origin))
      return Response.json(
        { error: "Origin is not allowed." },
        { status: 403 },
      );
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    let response: Response;
    try {
      response = await route(request, env, ctx);
    } catch (e) {
      response = Response.json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : "Unable to complete the cloud request.",
        },
        { status: e instanceof HttpError ? e.status : 500 },
      );
    }
    const merged = new Headers(response.headers);
    headers.forEach((v, k) => merged.set(k, v));
    return new Response(response.body, {
      status: response.status,
      headers: merged,
    });
  },
};
