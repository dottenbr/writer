import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { policy } from "./policy-blocks";

afterEach(() => vi.unstubAllGlobals());
const PID = "12345678-1234-1234-1234-123456789abc";
const baseEnv = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public", ASSETS: { fetch: async () => new Response("asset") } };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://bookkit.test" + path, { method: "POST", headers: { Authorization: "Bearer session", ...headers }, body: JSON.stringify(body) });

describe("included AI (Workers AI)", () => {
  it("answers without a provider key and applies the book's own AI policy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user" })).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([{ content: "title: X\nai_policy: ai-assisted\n" }])));
    const run = vi.fn().mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: "Note: tighten the opening." } }] });
    const res = await worker.fetch(post("/api/ai", { provider: "bookkit", action: "complete", mode: "review", prompt: "Text", model: "@cf/zai-org/glm-5.3", projectId: PID }), { ...baseEnv, AI: { run } } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe("Note: tighten the opening.");
    expect(run.mock.calls[0][0]).toBe("@cf/zai-org/glm-5.3");
    const system = run.mock.calls[0][1].messages[0].content;
    expect(system).toContain('bookkit AI policy "ai-assisted"');
    expect(system).toContain(policy("ai-assisted")!.block.slice(0, 120));
    expect(system).toContain("Never generate, continue, rewrite");
  });

  it("refuses without book access and rejects truncated answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user" })).mockResolvedValueOnce(Response.json(false)));
    const run = vi.fn();
    const denied = await worker.fetch(post("/api/ai", { provider: "bookkit", action: "complete", mode: "review", prompt: "Text", model: "x", projectId: PID }), { ...baseEnv, AI: { run } } as any);
    expect(denied.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user" })).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([])));
    const cut = await worker.fetch(post("/api/ai", { provider: "bookkit", action: "complete", mode: "review", prompt: "Text", model: "x", projectId: PID }), { ...baseEnv, AI: { run: async () => ({ choices: [{ finish_reason: "length", message: { content: "Half" } }] }) } } as any);
    expect(cut.status).toBe(422);
  });
});

describe("invitation links", () => {
  const env = { ...baseEnv, SUPABASE_SECRET_KEY: "secret" } as any;
  it("only the owner can create a link, and only for an invited email", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "u1" })).mockResolvedValueOnce(Response.json([])));
    expect((await worker.fetch(post("/api/invite-link", { projectId: PID, email: "a@b.co" }), env)).status).toBe(403);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "u1" })).mockResolvedValueOnce(Response.json([{ id: PID }])).mockResolvedValueOnce(Response.json([])));
    expect((await worker.fetch(post("/api/invite-link", { projectId: PID, email: "a@b.co" }), env)).status).toBe(404);
  });

  it("returns a link generated with the server key, never emailing", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "u1" }))
      .mockResolvedValueOnce(Response.json([{ id: PID }]))
      .mockResolvedValueOnce(Response.json([{ id: "inv" }]))
      .mockResolvedValueOnce(Response.json({ action_link: "https://project.supabase.co/auth/v1/verify?token=t" }));
    vi.stubGlobal("fetch", f);
    const res = await worker.fetch(post("/api/invite-link", { projectId: PID, email: "A@B.co" }), env);
    expect(res.status).toBe(200);
    expect((await res.json()).link).toContain("/auth/v1/verify");
    const [url, init] = f.mock.calls[3];
    expect(url).toBe("https://project.supabase.co/auth/v1/admin/generate_link");
    expect(JSON.parse(init.body)).toMatchObject({ type: "invite", email: "a@b.co", redirect_to: "https://bookkit.test/" });
  });

  it("emails the invitation from bookkit.net with a Bookkit code", async () => {
    const fake = fakeSupabase();
    const send = vi.fn().mockResolvedValue({ messageId: "m1" });
    vi.stubGlobal("fetch", fake.fetch);
    const res = await worker.fetch(post("/api/invite-link", { projectId: PID, email: "a@b.co", send: true }), { ...env, EMAIL: { send } });
    expect(await res.json()).toEqual({ sent: true, messageId: "m1" });
    const msg = send.mock.calls[0][0];
    expect(msg).toMatchObject({ to: "a@b.co", from: { email: "invitations@bookkit.net", name: "Bookkit" }, replyTo: "author@example.com" });
    expect(msg.subject).toBe("Ann <Author> invited you to “Cold Solder” on Bookkit");
    expect(msg.html).toContain("Ann &lt;Author&gt;");
    const code = msg.text.match(/\b(\d{3}) (\d{3})\b/);
    expect(code).toBeTruthy();
    expect(msg.text).toContain(`https://bookkit.test/sign-in?email=a%40b.co&code=${code[1]}${code[2]}`);
    expect(fake.codes.get("invitee")?.token_type).toBe("invite");
  });

  it("rejects anonymous and cross-origin requests", async () => {
    expect((await worker.fetch(new Request("https://bookkit.test/api/invite-link", { method: "POST", body: "{}" }), env)).status).toBe(401);
    expect((await worker.fetch(post("/api/invite-link", {}, { Origin: "https://evil.example" }), env)).status).toBe(403);
  });
});

function fakeSupabase() {
  const codes = new Map<string, any>();
  const meta: Record<string, any> = { me: {} };
  let verified = 0;
  const fetch = vi.fn(async (input: string, init: any = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    const path = url.pathname;
    if (path === "/auth/v1/user") return Response.json({ id: "owner", email: "author@example.com", user_metadata: { display_name: "Ann <Author>" } });
    if (path === "/rest/v1/projects" && url.searchParams.get("select") === "id") return Response.json([{ id: PID }]);
    if (path === "/rest/v1/projects") return Response.json([{ name: "Cold Solder" }]);
    if (path === "/rest/v1/project_invitations") return Response.json([{ id: "inv" }]);
    if (path === "/rest/v1/profiles") return Response.json(url.searchParams.get("email") === "eq.me@example.com" ? [{ id: "me" }] : []);
    if (path === "/auth/v1/admin/users/me" && method === "GET") return Response.json({ id: "me", app_metadata: meta.me });
    if (path === "/auth/v1/admin/users/me" && method === "PUT") { meta.me = body.app_metadata; return Response.json({}); }
    if (path === "/auth/v1/admin/generate_link") return Response.json(body.type === "invite"
      ? { id: "invitee", action_link: "https://project.supabase.co/auth/v1/verify?token=t", hashed_token: "hash-invite", verification_type: "invite" }
      : { id: "me", action_link: "https://project.supabase.co/auth/v1/verify?token=x", hashed_token: "hash-me", email_otp: "87654321", verification_type: "magiclink" });
    if (path === "/rest/v1/bookkit_sign_in_codes") {
      const id = (url.searchParams.get("user_id") ?? "").replace("eq.", "");
      if (method === "POST") { codes.set(body.user_id, body); return new Response(null, { status: 201 }); }
      if (method === "GET") return Response.json(codes.has(id) ? [codes.get(id)] : []);
      if (method === "PATCH") { codes.set(id, { ...codes.get(id), ...body }); return new Response(null, { status: 204 }); }
      if (method === "DELETE") { codes.delete(id); return new Response(null, { status: 204 }); }
    }
    if (path === "/auth/v1/verify") { verified++; return Response.json({ access_token: "at-" + body.token_hash, refresh_token: "rt" }); }
    return new Response("unexpected " + method + " " + path, { status: 500 });
  });
  return { fetch, codes, meta, get verified() { return verified; } };
}

describe("sign-in codes", () => {
  const env = { ...baseEnv, SUPABASE_SECRET_KEY: "secret-key-for-tests" } as any;
  const req = (email: string) => new Request("https://bookkit.test/api/sign-in-code", { method: "POST", body: JSON.stringify({ email }) });
  const verify = (email: string, code: string) => worker.fetch(new Request("https://bookkit.test/api/sign-in-verify", { method: "POST", body: JSON.stringify({ email, code }) }), env);
  const sendCode = async (fake: ReturnType<typeof fakeSupabase>) => {
    const send = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", fake.fetch);
    expect(await (await worker.fetch(req("Me@Example.com"), { ...env, EMAIL: { send } })).json()).toEqual({ ok: true });
    return send;
  };

  it("answers the same for unknown emails and never creates an account", async () => {
    const fake = fakeSupabase();
    vi.stubGlobal("fetch", fake.fetch);
    const send = vi.fn();
    const res = await worker.fetch(req("nobody@example.com"), { ...env, EMAIL: { send } });
    expect(await res.json()).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
    expect(fake.codes.size).toBe(0);
  });

  it("emails a 6-digit code in two halves and a link with the same code, at most once a minute", async () => {
    const fake = fakeSupabase();
    const send = await sendCode(fake);
    const msg = send.mock.calls[0][0];
    const [, a, b] = msg.subject.match(/^Your Bookkit code: (\d{3}) (\d{3})$/);
    expect(msg).toMatchObject({ to: "me@example.com", from: { email: "sign-in@bookkit.net", name: "Bookkit" } });
    expect(msg.html).toContain(`${a} ${b}`);
    expect(msg.text).toContain(`https://bookkit.test/sign-in?email=me%40example.com&code=${a}${b}`);
    expect(msg.text).not.toContain("87654321");
    expect(msg.text).not.toContain("supabase.co");
    expect(fake.codes.get("me").code_hash).not.toContain(a + b);
    await worker.fetch(req("me@example.com"), { ...env, EMAIL: { send } });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("signs in with the right code once, counts wrong tries and forgets expired codes", async () => {
    const fake = fakeSupabase();
    const send = await sendCode(fake);
    const code = send.mock.calls[0][0].subject.replace(/\D/g, "");
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await verify("me@example.com", wrong)).status).toBe(400);
    expect(fake.codes.get("me").attempts).toBe(1);
    const ok = await verify("me@example.com", code.slice(0, 3) + " " + code.slice(3));
    expect(await ok.json()).toEqual({ access_token: "at-hash-me", refresh_token: "rt" });
    expect((await verify("me@example.com", code)).status).toBe(400);
    expect(fake.verified).toBe(1);

    fake.meta.me = {};
    const again = await sendCode(fake);
    const second = again.mock.calls[0][0].subject.replace(/\D/g, "");
    fake.codes.set("me", { ...fake.codes.get("me"), attempts: 5 });
    expect((await verify("me@example.com", second)).status).toBe(400);
    expect(fake.codes.has("me")).toBe(false);

    fake.meta.me = {};
    const third = await sendCode(fake);
    const late = third.mock.calls[0][0].subject.replace(/\D/g, "");
    fake.codes.set("me", { ...fake.codes.get("me"), expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await verify("me@example.com", late)).status).toBe(400);
    expect(fake.verified).toBe(1);
  });

  it("still answers on the old sign-in-link route for open tabs", async () => {
    vi.stubGlobal("fetch", fakeSupabase().fetch);
    const res = await worker.fetch(new Request("https://bookkit.test/api/sign-in-link", { method: "POST", body: JSON.stringify({ email: "x@y.co" }) }), { ...env, EMAIL: { send: vi.fn() } });
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("voice", () => {
  const env = { ...baseEnv } as any;
  const req = (path: string, body: unknown) => new Request("https://bookkit.test" + path, { method: "POST", headers: { Authorization: "Bearer session" }, body: JSON.stringify(body) });
  const audio = "A".repeat(400);

  it("refuses people who can't open the book", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(false)));
    const run = vi.fn();
    const res = await worker.fetch(req("/api/voice/transcribe", { projectId: PID, audio }), { ...env, AI: { run } });
    expect(res.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("transcribes twice, takes only name fixes from the biased pass, and rejects a tidy-up that changes words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(true)));
    const run = vi.fn(async (model: string, input: any) => {
      if (model.includes("whisper")) return { text: String(input.initial_prompt).startsWith("Names") ? "Nora went to see Agathe. new paragraph she waited" : "Nora went to see Agata. new paragraph she waited" };
      return { choices: [{ message: { content: "Nora went quickly to see Agathe.\n\nShe waited." } }] };
    });
    const res = await worker.fetch(req("/api/voice/transcribe", { projectId: PID, audio, vocabulary: ["Agathe", "Nora"], context: "The well." }), { ...env, AI: { run } });
    const body = await res.json();
    expect(body).toMatchObject({ original: "Nora went to see Agata. new paragraph she waited", corrected: true, polished: false });
    expect(body.text).toBe("Nora went to see Agathe.\n\nShe waited");
    expect(run.mock.calls.filter(c => String(c[0]).includes("whisper"))).toHaveLength(2);
    expect(run.mock.calls.find(c => String(c[1].initial_prompt).startsWith("Names"))![1].initial_prompt).toContain("Names: Agathe, Nora.");
    expect(run.mock.calls.find(c => !String(c[1].initial_prompt).startsWith("Names"))![1].initial_prompt).toContain("next passage");
  });

  it("accepts a tidy-up that only adds punctuation, then applies the house style", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(true)));
    const run = vi.fn(async (model: string) => model.includes("whisper") ? { text: "she said come back" } : { choices: [{ message: { content: 'She said, "Come back."' } }] });
    const body = await (await worker.fetch(req("/api/voice/transcribe", { projectId: PID, audio, style: { quotes: "single" } }), { ...env, AI: { run } })).json();
    expect(body).toMatchObject({ polished: true, text: "She said, ‘Come back.’" });
  });

  it("reads text aloud with a known voice", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(true)));
    const run = vi.fn(async (_model: string, _input: unknown) => new Uint8Array(500).buffer);
    const res = await worker.fetch(req("/api/voice/speak", { projectId: PID, text: "Nora counted the goats.", voice: "evil" }), { ...env, AI: { run } });
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect((await res.arrayBuffer()).byteLength).toBe(500);
    expect(run.mock.calls[0][1]).toMatchObject({ text: "Nora counted the goats.", speaker: "thalia", encoding: "mp3" });
  });
});
