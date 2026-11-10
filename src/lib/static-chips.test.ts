import { describe, expect, it } from "vitest";
import { staticChips } from "./static-chips";
import { markdownToHtml } from "./markdown-doc";

describe("staticChips", () => {
  it("turns trailing anchors into chips beside the fact", () => {
    const html = staticChips(markdownToHtml("- Thirty-eight at the vote. (*Ch. 5, Scene 9*: “I was thirty-eight”; *Ch. 6*)").html, {});
    expect(html).toContain('<span class="anchor-chips">');
    expect(html).toContain("has-quote");
    expect(html).toContain(">Ch. 5 · Sc. 9<");
    expect(html).not.toContain("(<");
    expect(html).toContain("Thirty-eight at the vote.");
  });
  it("numbers footnotes and shows their notes", () => {
    const html = staticChips(markdownToHtml("Text.[^a] More.[^b]\n\n[^a]: First note.\n\n[^b]: Second.").html, {});
    expect(html).toMatch(/<sup class="fn-ref" title="First note.">1<\/sup>/);
    expect(html).toContain('<p class="fn-def"><span class="fn-num">2</span>Second.</p>');
  });
  it("shows citations as short cites", () => {
    const html = staticChips(markdownToHtml("Pray[@luther1912, Matt 6:7].").html, { cite: i => ({ short: `Luther 1912, ${i.locator}`, known: true }) });
    expect(html).toContain('<span class="cite-chip" title="">Luther 1912, Matt 6:7</span>');
  });
});
