import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { HUMAN_AUTHORSHIP_POLICY } from "./ai-policy";

afterEach(() => vi.unstubAllGlobals());
const PID = "12345678-1234-1234-1234-123456789abc";
const baseEnv = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public", ASSETS: { fetch: async () => new Response("asset") } };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://bookkit.test" + path, { method: "POST", headers: { Authorization: "Bearer session", ...headers }, body: JSON.stringify(body) });

describe("included AI (Workers AI)", () => {
  it("answers without a provider key and applies the authorship policy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user" })).mockResolvedValueOnce(Response.json(true)));
    const run = vi.fn().mockResolvedValue({ choices: [{ finish_reason: "stop", message: { content: "Note: tighten the opening." } }] });
    const res = await worker.fetch(post("/api/ai", { provider: "bookkit", action: "complete", mode: "review", prompt: "Text", model: "@cf/zai-org/glm-5.3", projectId: PID }), { ...baseEnv, AI: { run } } as any);
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe("Note: tighten the opening.");
    expect(run.mock.calls[0][0]).toBe("@cf/zai-org/glm-5.3");
    expect(run.mock.calls[0][1].messages[0].content).toContain(HUMAN_AUTHORSHIP_POLICY);
  });

  it("refuses without book access and rejects truncated answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user" })).mockResolvedValueOnce(Response.json(false)));
    const run = vi.fn();
    const denied = await worker.fetch(post("/api/ai", { provider: "bookkit", action: "complete", mode: "review", prompt: "Text", model: "x", projectId: PID }), { ...baseEnv, AI: { run } } as any);
    expect(denied.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ id: "user" })).mockResolvedValueOnce(Response.json(true)));
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

  it("emails the invitation from bookkit.net when asked", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ id: "u1", email: "author@example.com", user_metadata: { display_name: "Ann <Author>" } }))
      .mockResolvedValueOnce(Response.json([{ id: PID }]))
      .mockResolvedValueOnce(Response.json([{ id: "inv" }]))
      .mockResolvedValueOnce(Response.json({ action_link: "https://project.supabase.co/auth/v1/verify?token=t", email_otp: "12345678" }))
      .mockResolvedValueOnce(Response.json([{ name: "Cold Solder" }])));
    const send = vi.fn().mockResolvedValue({ messageId: "m1" });
    const res = await worker.fetch(post("/api/invite-link", { projectId: PID, email: "a@b.co", send: true }), { ...env, EMAIL: { send } });
    expect(await res.json()).toEqual({ sent: true, messageId: "m1" });
    const msg = send.mock.calls[0][0];
    expect(msg).toMatchObject({ to: "a@b.co", from: { email: "invitations@bookkit.net", name: "Bookkit" }, replyTo: "author@example.com" });
    expect(msg.subject).toBe("Ann <Author> invited you to “Cold Solder” on Bookkit");
    expect(msg.html).toContain("Ann &lt;Author&gt;");
    expect(msg.text).toContain("https://project.supabase.co/auth/v1/verify?token=t");
    expect(msg.text).toContain("1234 5678");
    expect(msg.html).toContain("1234 5678");
  });

  it("rejects anonymous and cross-origin requests", async () => {
    expect((await worker.fetch(new Request("https://bookkit.test/api/invite-link", { method: "POST", body: "{}" }), env)).status).toBe(401);
    expect((await worker.fetch(post("/api/invite-link", {}, { Origin: "https://evil.example" }), env)).status).toBe(403);
  });
});

describe("sign-in codes", () => {
  const env = { ...baseEnv, SUPABASE_SECRET_KEY: "secret" } as any;
  const req = (email: string) => new Request("https://bookkit.test/api/sign-in-code", { method: "POST", body: JSON.stringify({ email }) });
  it("answers the same for unknown emails and never creates an account", async () => {
    const f = vi.fn().mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", f);
    const send = vi.fn();
    const res = await worker.fetch(req("nobody@example.com"), { ...env, EMAIL: { send } });
    expect(await res.json()).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
  it("emails an existing account at most once a minute", async () => {
    const send = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json([{ id: "u1" }]))
      .mockResolvedValueOnce(Response.json({ id: "u1", app_metadata: { provider: "email" } }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ action_link: "https://p/verify?token=x", email_otp: "87654321" })));
    expect(await (await worker.fetch(req("Me@Example.com"), { ...env, EMAIL: { send } })).json()).toEqual({ ok: true });
    const msg = send.mock.calls[0][0];
    expect(msg).toMatchObject({ to: "me@example.com", from: { email: "sign-in@bookkit.net", name: "Bookkit" }, subject: "Your Bookkit code: 8765 4321" });
    expect(msg.text).toContain("8765 4321");
    expect(msg.html).toContain("bookkit</td>");
    // The code email carries no sign-in link.
    expect(msg.text).not.toContain("https://p/verify");
    expect(msg.html).not.toContain("https://p/verify");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json([{ id: "u1" }]))
      .mockResolvedValueOnce(Response.json({ id: "u1", app_metadata: { bookkit_link_sent_at: Date.now() - 5000 } })));
    await worker.fetch(req("me@example.com"), { ...env, EMAIL: { send } });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("still answers on the old sign-in-link route for open tabs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json([])));
    const res = await worker.fetch(new Request("https://bookkit.test/api/sign-in-link", { method: "POST", body: JSON.stringify({ email: "x@y.co" }) }), { ...env, EMAIL: { send: vi.fn() } });
    expect(await res.json()).toEqual({ ok: true });
  });
});
