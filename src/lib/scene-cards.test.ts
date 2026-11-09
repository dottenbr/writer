import { describe, expect, it } from "vitest";
import { addScene, deleteScene, moveScene, parseScenes, updateScene } from "./scene-cards";

const FILE = `---
chapter: 2
---

# 2. You Came Back

## Scene 1 – Thirty-six

- **Where and when:** the hut; the night after the storm.
- **Who:** Nora, the flock.
- **What happens:**
  - At first light she counts: thirty-six, twice.
  - Two found dead before noon.
- **Ends on:** “By noon she had decided.”

## Scene 2 – The offering

- **Purpose:** find the fallen pine.

A note under the card.
`;

describe("scene cards", () => {
  it("reads scenes, fields and sub-bullets", () => {
    const cards = parseScenes(FILE);
    expect(cards.map(c => [c.number, c.title])).toEqual([[1, "Thirty-six"], [2, "The offering"]]);
    expect(cards[0].fields.map(f => f.label)).toEqual(["Where and when", "Who", "What happens", "Ends on"]);
    expect(cards[0].fields[2].items).toEqual(["At first light she counts: thirty-six, twice.", "Two found dead before noon."]);
    expect(cards[1].extra).toBe("A note under the card.");
  });

  it("writes back only the edited scene, and nothing when nothing changed", () => {
    const [one, two] = parseScenes(FILE);
    expect(updateScene(FILE, one, { fields: one.fields }).text).toBe(FILE);
    expect(updateScene(FILE, two, { fields: two.fields }).text).toBe(FILE);
    const fields = one.fields.map(f => f.label === "Who" ? { ...f, value: "Nora, the flock, Smoke." } : f);
    const next = updateScene(FILE, one, { fields });
    expect(next.text).toBe(FILE.replace("Nora, the flock.", "Nora, the flock, Smoke."));
    const renamed = updateScene(FILE, one, { title: "Thirty-five" });
    expect(renamed.slug).toBe("scene-1-thirty-five");
    expect(renamed.text).toContain("## Scene 1 – Thirty-five\n");
  });

  it("adds, moves and deletes scenes and keeps the numbers in order", () => {
    const added = addScene(FILE, "The card");
    expect(added.slug).toBe("scene-3-the-card");
    expect(added.text).toContain("## Scene 3 – The card\n\n- **Where and when:**\n- **Who:**");
    const moved = moveScene(added.text, "scene-3-the-card", -1);
    expect(parseScenes(moved).map(c => [c.number, c.title])).toEqual([[1, "Thirty-six"], [2, "The card"], [3, "The offering"]]);
    expect(moved).toContain("A note under the card.");
    const deleted = deleteScene(moved, "scene-1-thirty-six");
    expect(parseScenes(deleted).map(c => [c.number, c.title])).toEqual([[1, "The card"], [2, "The offering"]]);
  });

  it("inserts a scene between two others and renumbers the rest", () => {
    const added = addScene(FILE, "Between", 1);
    expect(added.slug).toBe("scene-2-between");
    expect(parseScenes(added.text).map(c => [c.number, c.title])).toEqual([[1, "Thirty-six"], [2, "Between"], [3, "The offering"]]);
    expect(added.text).toContain("- **Ends on:** “By noon she had decided.”\n\n## Scene 2 – Between\n\n- **Where and when:**");
    expect(added.text).toContain("- **Ends on:**\n\n## Scene 3 – The offering\n");
    expect(added.text).toContain("A note under the card.");
    expect(addScene(FILE, "First", 0).text).toMatch(/# 2\. You Came Back\n\n## Scene 1 – First\n[\s\S]*## Scene 2 – Thirty-six\n/);
    expect(addScene(FILE, "Last", 9).slug).toBe("scene-3-last");
  });
});
