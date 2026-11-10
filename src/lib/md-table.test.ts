import { describe, expect, it } from "vitest";
import { columnKind, parseTable, rowNoun, serializeTable } from "./md-table";

const SRC = `| Fact | Anchor | Label |
| --- | --- | --- |
| Wilhelm is born in 1840. | *off the page* | invented |
|Karl is born in 1878 \\| or so.|*Ch. 5*|invented|`;

describe("md-table", () => {
  it("parses and writes back unchanged rows byte for byte", () => {
    const t = parseTable(SRC)!;
    expect(t.header).toEqual(["Fact", "Anchor", "Label"]);
    expect(t.rows[1].cells).toEqual(["Karl is born in 1878 \\| or so.", "*Ch. 5*", "invented"]);
    expect(serializeTable(t)).toBe(SRC);
  });
  it("rewrites only the edited row", () => {
    const t = parseTable(SRC)!;
    t.rows[0].cells[2] = "inferred";
    t.rows.push({ cells: ["New fact | with a bar", "", "invented"] });
    const out = serializeTable(t).split("\n");
    expect(out[2]).toBe("| Wilhelm is born in 1840. | *off the page* | inferred |");
    expect(out[3]).toBe("|Karl is born in 1878 \\| or so.|*Ch. 5*|invented|");
    expect(out[4]).toBe("| New fact \\| with a bar |  | invented |");
  });
  it("knows anchor and label columns", () => {
    expect(columnKind("Anchor", []).kind).toBe("anchor");
    expect(columnKind("Label", ["invented", "odd one"]).options).toContain("odd one");
    expect(columnKind("Status", []).options).toContain("verified-primary");
    expect(rowNoun(["Decision", "This book"])).toBe("decision");
  });
});
