import { describe, expect, it } from "vitest";
import { pandocMarks } from "./pandoc-marks";
import { withoutLineBlockBars } from "./export-book";

describe("pandocMarks", () => {
  it("finds the bar at the start of each line of a line block", () => {
    const text = "| ὅταν προσεύχησθε\n| cum oratis";
    expect(pandocMarks(text).filter(m => m.kind === "line").map(m => text.slice(m.from, m.to))).toEqual(["| ", "| "]);
  });
  it("ignores bars inside a line", () => {
    expect(pandocMarks("a | b")).toEqual([]);
  });
  it("finds citations", () => {
    const text = "Wenn ihr betet[@lutherbibel1912, Matt 6:7] and [see @cyprian, 4]";
    expect(pandocMarks(text).map(m => text.slice(m.from, m.to))).toEqual(["[@lutherbibel1912, Matt 6:7]", "[see @cyprian, 4]"]);
  });
  it("leaves links and footnotes alone", () => {
    expect(pandocMarks("[a link](x) and a note[^1] and an email [me@example.com]")).toEqual([]);
  });
});

describe("withoutLineBlockBars", () => {
  it("turns a quoted line block into lines with hard breaks", () => {
    expect(withoutLineBlockBars("> | one\n> | two\n\nRead: x")).toBe("> one  \n> two\n\nRead: x");
  });
});
