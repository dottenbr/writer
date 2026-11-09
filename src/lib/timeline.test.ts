import { describe, expect, it } from "vitest";
import { addEvent, addPeriod, columns, moveEvent, parseTimeline, removeEvent, updateEvent } from "./timeline";

const T = `---
checked: 2026-11-08
---

# Timeline

Summers since the Burning.

## Before the story

| When | What | Anchor |
| --- | --- | --- |
| Before the war | Counsel is taught to speak. | *Ch. 6* |
| The war | The Burning; a \\| pipe. | *Chs. 10, 17* |

## The first summer

Notes first.
`;

describe("timeline", () => {
  it("reads periods, intro text and events", () => {
    const t = parseTimeline(T);
    expect(t.intro).toBe("Summers since the Burning.");
    expect(t.periods.map(p => [p.title, p.events.length, p.hasTable])).toEqual([["Before the story", 2, true], ["The first summer", 0, false]]);
    expect(t.periods[0].events[1].cells).toEqual(["The war", "The Burning; a | pipe.", "*Chs. 10, 17*"]);
    expect(columns(t.periods[0].header)).toEqual({ when: 0, what: 1, anchor: 2 });
    expect(t.periods[1].intro).toBe("Notes first.");
  });

  it("edits, adds, moves and removes rows, touching nothing else", () => {
    const edited = updateEvent(T, "before-the-story", 0, ["Long before", "Counsel learns.", "*Ch. 6*"]);
    expect(edited).toBe(T.replace("| Before the war | Counsel is taught to speak. | *Ch. 6* |", "| Long before | Counsel learns. | *Ch. 6* |"));
    const added = addEvent(T, "before-the-story", ["After", "Pipes | stay", ""]);
    expect(added).toContain("| The war | The Burning; a \\| pipe. | *Chs. 10, 17* |\n| After | Pipes \\| stay |  |\n\n## The first summer");
    expect(parseTimeline(moveEvent(T, "before-the-story", 1, -1)).periods[0].events.map(e => e.cells[0])).toEqual(["The war", "Before the war"]);
    expect(parseTimeline(removeEvent(T, "before-the-story", 0)).periods[0].events.map(e => e.cells[0])).toEqual(["The war"]);
  });

  it("starts a table in a period without one, and adds periods", () => {
    const started = addEvent(T, "the-first-summer", ["June", "The storm.", "*Ch. 1*"]);
    expect(started.endsWith("## The first summer\n\nNotes first.\n\n| When | What | Anchor |\n| --- | --- | --- |\n| June | The storm. | *Ch. 1* |\n")).toBe(true);
    expect(parseTimeline(started).periods[1].events).toHaveLength(1);
    const more = addPeriod(T, "The second winter");
    expect(parseTimeline(more).periods.map(p => p.title)).toEqual(["Before the story", "The first summer", "The second winter"]);
  });
});
