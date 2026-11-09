import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BOOKKIT_POLICIES } from "./bookkit-policies";
import { assistantPolicy, carriers, declaredPolicy, findBlock, policy, policyBlock, setDeclaredPolicy, syncPolicy, verifyPolicy } from "./policy-blocks";

const human = policy("human-authored")!;
const assisted = policy("ai-assisted")!;

describe("bookkit AI policies on the website", () => {
  it("knows bookkit's three policies", () => {
    expect(BOOKKIT_POLICIES.map(p => p.name).sort()).toEqual(["ai-assisted", "ai-generated", "human-authored"]);
    expect(human.manuscriptWrites).toBe("forbidden");
  });

  it("matches the bookkit repo when it is checked out beside the website", () => {
    const dir = join(__dirname, "../../../../writing/bookkit/policies");
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir).filter(f => f.endsWith(".md") && f !== "README.md")) {
      const text = readFileSync(join(dir, file), "utf8");
      const p = policy(file.replace(/\.md$/, ""));
      expect(p, `${file} is missing; run scripts/sync-bookkit-policies.mjs`).toBeTruthy();
      expect(text).toContain(`version: ${p!.version}`);
      expect(text.replace(/\s+/g, " ")).toContain(p!.block.slice(0, 200).replace(/\s+/g, " "));
    }
  });

  it("reads and sets the declared policy", () => {
    expect(declaredPolicy("title: X\nai_policy: human-authored\n")).toBe("human-authored");
    expect(declaredPolicy("title: X\n")).toBeNull();
    expect(setDeclaredPolicy("title: X\nai_policy: human-authored\nlanguage: en\n", "ai-assisted")).toBe("title: X\nai_policy: ai-assisted\nlanguage: en\n");
  });

  it("writes the block like bin/policy --sync: after the title and first paragraph, between bookkit's markers", () => {
    const files = { "README.md": "# My Book\n\nA book.\n\n## More\n\nText.\n", "CLAUDE.md": "# CLAUDE.md\n\nGuidance.\n" };
    const writes = syncPolicy(files, human);
    expect(Object.keys(writes).sort()).toEqual(["CLAUDE.md", "README.md"]);
    expect(writes["README.md"]).toBe(`# My Book\n\nA book.\n\n${policyBlock(human)}\n\n## More\n\nText.\n`);
    expect(verifyPolicy({ ...files, ...writes }, human)).toEqual([]);
    expect(syncPolicy({ ...files, ...writes }, human)).toEqual({});
  });

  it("replaces an existing block when the policy changes, and reports stale copies", () => {
    const files = { "README.md": `# B\n\nIntro.\n\n${policyBlock(human)}\n\nAfter.\n`, "CLAUDE.md": "@AGENTS.md\n", "AGENTS.md": `# AGENTS.md\n\n${policyBlock(human)}\n\n## The book\n` };
    expect(carriers(files)).toEqual(["README.md", "AGENTS.md"]);
    expect(verifyPolicy(files, assisted)).toHaveLength(2);
    const writes = syncPolicy(files, assisted);
    expect(findBlock(writes["AGENTS.md"])!.name).toBe("ai-assisted");
    expect(writes["README.md"]).toBe(`# B\n\nIntro.\n\n${policyBlock(assisted)}\n\nAfter.\n`);
    expect(writes["CLAUDE.md"]).toBeUndefined();
  });

  it("gives the assistant the book's own policy text", () => {
    expect(assistantPolicy("ai-assisted")).toContain(assisted.block.slice(0, 80));
    expect(assistantPolicy(null)).toContain("human-authored");
    expect(assistantPolicy("human-authored")).toContain("Never generate, continue, rewrite");
  });
});
