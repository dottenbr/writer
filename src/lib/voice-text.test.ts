import { describe, expect, it } from "vitest";
import { applyHouseStyle, applySpokenCommands, correctVoiceTerms, onlyPunctuationChanged, readingChunks, voiceVocabulary } from "./voice-text";
import { extractReadableBlocksFromBody } from "../store/useListenStore";

describe("dictation", () => {
  const vocab = voiceVocabulary(["Nora", "The Owl", "Agathe", "Ennet"], ["Gerold waited by the well."]);
  it("collects names", () => {
    expect(vocab).toEqual(expect.arrayContaining(["Nora", "Owl", "Agathe", "Ennet", "Gerold"]));
  });
  it("accepts only single-word swaps to known names", () => {
    expect(correctVoiceTerms("Nora went to see a gath at the well.", "Nora went to see Agathe at the well.", vocab)).toBe("Nora went to see a gath at the well.");
    expect(correctVoiceTerms("Nora went to see Agata at the well.", "Nora went to see Agathe at the well.", vocab)).toBe("Nora went to see Agathe at the well.");
    expect(correctVoiceTerms("She did not go to Enet.", "She did go to Ennet.", vocab)).toBe("She did not go to Ennet.");
    expect(correctVoiceTerms("Forty one goats.", "Forty two goats.", vocab)).toBe("Forty one goats.");
    expect(correctVoiceTerms("The goats came home.", "The goats came home to Nora tonight.", vocab)).toBe("The goats came home.");
  });
  it("turns spoken layout commands into layout, and leaves punctuation words alone", () => {
    expect(applySpokenCommands("She ran. New paragraph. the storm broke.")).toBe("She ran.\n\nThe storm broke.");
    expect(applySpokenCommands("He said open quote come back close quote and left.")).toBe("He said “come back” and left.");
    expect(applySpokenCommands("It was the Victorian period, a comma in history.")).toBe("It was the Victorian period, a comma in history.");
  });
  it("applies the book's quotes, ellipses and dashes", () => {
    expect(applyHouseStyle(`"Don't," she said... "it's 'mine'" -- he left.`, { quotes: "double", ellipsis: "character", dashes: "em-closed" })).toBe(`“Don’t,” she said… “it’s ‘mine’”—he left.`);
    expect(applyHouseStyle(`"No," she said.`, { quotes: "single" })).toBe(`‘No,’ she said.`);
    expect(applyHouseStyle(`wait -- now`, { dashes: "en-spaced" })).toBe(`wait – now`);
  });
  it("only accepts a tidy-up that keeps every spoken word and does not invent paragraph breaks", () => {
    expect(onlyPunctuationChanged("she said come back and he left", "She said, “Come back,” and he left.")).toBe(true);
    expect(onlyPunctuationChanged("she said come back", "She said, “Come back quickly.”")).toBe(false);
    expect(onlyPunctuationChanged("dont go", "Don’t go.")).toBe(false);
    expect(onlyPunctuationChanged("she said come back and he left", "She said, “Come back.”\n\nAnd he left.")).toBe(false);
    expect(onlyPunctuationChanged("she said come back\n\nand he left", "She said, “Come back.”\n\nAnd he left.")).toBe(true);
  });
});

describe("reading aloud", () => {
  it("groups paragraphs into chunks and remembers where each starts", () => {
    const chunks = readingChunks(["a".repeat(500), "b".repeat(500), "c".repeat(500), "", "d".repeat(100)], 1200);
    expect(chunks.map(c => [c.first, c.last])).toEqual([[0, 1], [2, 4]]);
  });
  it("splits a very long paragraph at sentence ends", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} goes here.`).join(" ");
    const chunks = readingChunks([long], 400);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every(c => c.text.length <= 400 && c.first === 0)).toBe(true);
    expect(chunks.slice(0, -1).every(c => c.text.endsWith("."))).toBe(true);
  });
  it("extracts paragraphs, list items, and blockquotes in exact DOM order so read-aloud highlighting stays aligned", () => {
    const md = `## Scene 1 – Morning\n\nFirst paragraph.\n\n- Bullet one\n- Bullet two\n\n> Quoted line\n\nFinal paragraph.\n`;
    expect(extractReadableBlocksFromBody(md)).toEqual([
      "First paragraph.",
      "Bullet one",
      "Bullet two",
      "Quoted line",
      "Final paragraph.",
    ]);
  });
});

describe("name correction against real Whisper output", () => {
  const vocab = ["Nora", "Agathe", "Gerold", "Owl", "Ennet"];
  it("keeps punctuation and spacing, fixes names that sound alike", () => {
    const plain = "Nora went up to the hollow to see agothy. Come back, said the owl, and Gerald waited by the well.";
    const biased = "Nora went up to the hollow to see Agathe. Come back, said the Owl, and Gerold waited by the well.";
    expect(correctVoiceTerms(plain, biased, vocab)).toBe("Nora went up to the hollow to see Agathe. Come back, said the Owl, and Gerold waited by the well.");
  });
  it("never lets the biased pass add or drop words", () => {
    expect(correctVoiceTerms("She came back.", "She came back to Nora.", vocab)).toBe("She came back.");
    expect(correctVoiceTerms("She came back to the well.", "She came to Ennet.", vocab)).toBe("She came back to the well.");
  });
});
