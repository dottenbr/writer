/**
 * Tests for supabase-service.ts
 *
 * Uses a mock Supabase client to test the highest-leverage code paths
 * without requiring a running Supabase instance.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Chapter, WritingDials } from "../types";

// ────────────────────────────────────────────────────────────
// Mock Supabase client
// ────────────────────────────────────────────────────────────

// Chainable query builder that records calls and returns configurable results
function createQueryBuilder(resolvedValue: any = { data: null, error: null }) {
  const builder: any = {};
  const methods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "is", "not", "order", "limit", "single", "maybeSingle",
  ];
  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  // Terminal methods that return promises
  builder.then = (resolve: any) => resolve(resolvedValue);
  // Allow overriding the resolved value
  builder._resolve = (val: any) => {
    resolvedValue = val;
    builder.then = (resolve: any) => resolve(val);
    return builder;
  };
  return builder;
}

// Track the most recent builder per table so tests can inspect/configure it
const tableBuilders: Record<string, any> = {};

const mockSupabase = {
  from: vi.fn((table: string) => {
    const builder = createQueryBuilder();
    tableBuilders[table] = builder;
    return builder;
  }),
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(),
  },
  channel: vi.fn(),
  removeChannel: vi.fn(),
  storage: { from: vi.fn() },
};

vi.mock("./supabase-client", () => ({
  supabase: mockSupabase,
}));

// Now import the functions under test (after the mock is set up)
const {
  saveChapter,
  signIn,
  signOut,
  subscribeToProject,
} = await import("./supabase-service");

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  const defaultDials: WritingDials = {
    words: 3000, lyricism: 2, dialogue: 2, metaphor: 2,
    pacing: 2, humour: 1, texture: 2, clarity: 2,
  };
  return {
    id: "ch-1",
    number: 1,
    sectionType: "chapter",
    title: "Test Chapter",
    act: null,
    summary: "",
    scenes: [],
    content: "<p>Hello world</p>",
    notes: "",
    wordCount: 2,
    status: "draft",
    writingDials: defaultDials,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear table builder cache
  for (const key of Object.keys(tableBuilders)) delete tableBuilders[key];
});

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe("saveChapter", () => {
  it("upserts without version locking when expectedVersion is omitted", async () => {
    // Configure the mock chain to resolve successfully (upsert returns version data)
    mockSupabase.from.mockImplementation((table: string) => {
      const builder = createQueryBuilder({ data: { version: 1, updated_at: "2026-01-01T00:00:00Z" }, error: null });
      tableBuilders[table] = builder;
      return builder;
    });

    const chapter = makeChapter();
    const result = await saveChapter("proj-1", chapter);

    expect(result.conflict).toBe(false);
    expect(result.newVersion).toBeDefined();
    expect(mockSupabase.from).toHaveBeenCalledWith("chapters");
    // The upsert path should be called (no version parameter)
    const builder = tableBuilders["chapters"];
    expect(builder.upsert).toHaveBeenCalled();
  });

  it("returns conflict: false when optimistic lock succeeds", async () => {
    // The update().eq().eq().select().maybeSingle() chain returns data
    mockSupabase.from.mockImplementation((table: string) => {
      const builder = createQueryBuilder({ data: { version: 6, updated_at: "2026-01-01T00:00:00Z" }, error: null });
      tableBuilders[table] = builder;
      return builder;
    });

    const chapter = makeChapter();
    const result = await saveChapter("proj-1", chapter, 5);

    expect(result.conflict).toBe(false);
    expect(result.newVersion).toBe(6);
    const builder = tableBuilders["chapters"];
    expect(builder.update).toHaveBeenCalled();
    // Should have called eq twice: once for id, once for version
    expect(builder.eq).toHaveBeenCalledWith("id", "ch-1");
    expect(builder.eq).toHaveBeenCalledWith("version", 5);
  });

  it("returns conflict: true with serverVersion when optimistic lock fails", async () => {
    // First call (update path): returns no data (conflict)
    // Second call (fetch current version): returns current version
    let callCount = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        // The update returns null data — version mismatch
        return createQueryBuilder({ data: null, error: null });
      }
      // The second call fetches the current version
      return createQueryBuilder({ data: { version: 8 }, error: null });
    });

    const chapter = makeChapter();
    const result = await saveChapter("proj-1", chapter, 5);

    expect(result).toEqual({ conflict: true, serverVersion: 8 });
    // Should have called from("chapters") twice
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });

  it("throws when upsert (no version) returns an error", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      return createQueryBuilder({ data: null, error: new Error("DB down") });
    });

    const chapter = makeChapter();
    await expect(saveChapter("proj-1", chapter)).rejects.toThrow("DB down");
  });
});

describe("signIn", () => {
  it("throws on auth error", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      error: new Error("Invalid credentials"),
    });

    await expect(signIn("user@test.com", "wrong")).rejects.toThrow("Invalid credentials");
  });

  it("succeeds when no error", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(signIn("user@test.com", "correct")).resolves.toBeUndefined();
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "user@test.com",
      password: "correct",
    });
  });
});

describe("signOut", () => {
  it("throws on auth error", async () => {
    mockSupabase.auth.signOut.mockResolvedValue({
      error: new Error("Session expired"),
    });
    await expect(signOut()).rejects.toThrow("Session expired");
  });

  it("succeeds when no error", async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).resolves.toBeUndefined();
  });
});

describe("subscribeToProject", () => {
  it("sets up presence and postgres_changes listeners and returns unsubscribe fn", () => {
    const mockChannel: any = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    };
    mockSupabase.channel.mockReturnValue(mockChannel);

    const callbacks = {
      onPresenceChange: vi.fn(),
      onChapterChange: vi.fn(),
      onCommentChange: vi.fn(),
    };

    const unsubscribe = subscribeToProject("proj-1", callbacks);

    // Should create channel with project-specific name
    expect(mockSupabase.channel).toHaveBeenCalledWith("project:proj-1", {
      config: { presence: { key: "editors" } },
    });

    // Should register presence sync handler
    expect(mockChannel.on).toHaveBeenCalledWith(
      "presence",
      { event: "sync" },
      expect.any(Function),
    );

    // Should register postgres_changes for chapters and comments (2 calls)
    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ event: "*", table: "chapters" }),
      expect.any(Function),
    );
    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ event: "*", table: "comments" }),
      expect.any(Function),
    );

    // Should subscribe
    expect(mockChannel.subscribe).toHaveBeenCalled();

    // Unsubscribe should remove channel
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("invokes onPresenceChange when presence sync fires", () => {
    const presenceState = {
      editors: [
        { userId: "u1", displayName: "Alice", activeChapterId: null, activeTab: "manuscript", lastSeen: "2026-01-01" },
      ],
    };
    const mockChannel: any = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      presenceState: vi.fn().mockReturnValue(presenceState),
    };
    mockSupabase.channel.mockReturnValue(mockChannel);

    const callbacks = {
      onPresenceChange: vi.fn(),
      onChapterChange: vi.fn(),
      onCommentChange: vi.fn(),
    };

    subscribeToProject("proj-2", callbacks);

    // Find the presence sync handler and invoke it
    const presenceCall = mockChannel.on.mock.calls.find(
      (call: any[]) => call[0] === "presence" && call[1]?.event === "sync"
    );
    expect(presenceCall).toBeDefined();

    const syncHandler = presenceCall![2];
    syncHandler();

    expect(mockChannel.presenceState).toHaveBeenCalled();
    expect(callbacks.onPresenceChange).toHaveBeenCalledWith(presenceState.editors);
  });
});
