export type ExportPreset = "manuscript" | "custom";
export type ExportFormat = "docx" | "epub" | "pdf";
export type ParagraphStyle = "indent" | "spacing";

export interface ExportConfig {
  actHeadings: boolean;
  chapterHeadings: boolean;
  sceneHeadings: boolean;
  sceneSeparator: string;
  titlePage: boolean;
  author: string;
  wordCountOnTitle: boolean;
  fontFamily: string;
  fontSize: number;
  lineSpacing: number;
  paragraphStyle: ParagraphStyle;
  pageFormat: "a4" | "letter";
  excludeNonChapters: boolean;
  exportFormat: ExportFormat;
  preset: ExportPreset;
}

export const MANUSCRIPT_PRESET: Partial<ExportConfig> = {
  fontFamily: "Times New Roman",
  fontSize: 12,
  lineSpacing: 2.0,
  paragraphStyle: "indent",
  actHeadings: false,
  chapterHeadings: true,
  sceneHeadings: false,
  sceneSeparator: "* * *",
  titlePage: true,
  wordCountOnTitle: true,
  pageFormat: "letter",
  exportFormat: "pdf",
};

export const defaultExportConfig: ExportConfig = {
  actHeadings: false,
  chapterHeadings: true,
  sceneHeadings: false,
  sceneSeparator: "* * *",
  titlePage: true,
  author: "",
  wordCountOnTitle: true,
  fontFamily: "Times New Roman",
  fontSize: 12,
  lineSpacing: 2.0,
  paragraphStyle: "indent",
  pageFormat: "letter",
  excludeNonChapters: true,
  exportFormat: "pdf",
  preset: "manuscript",
};
