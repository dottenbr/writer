import { Mark, mergeAttributes } from "@tiptap/core";

export interface CommentMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentMark: {
      setComment: (commentId: string) => ReturnType;
      unsetComment: (commentId: string) => ReturnType;
    };
  }
}

export const CommentMark = Mark.create<CommentMarkOptions>({
  name: "comment",

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs) => {
          if (!attrs.commentId) return {};
          return { "data-comment-id": attrs.commentId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "comment-mark",
      }),
      0,
    ];
  },

  excludes: "",
  inclusive: false,

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),

      unsetComment:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state;
          const markType = state.schema.marks[this.name];
          if (!markType) return false;

          doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (mark.type === markType && mark.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, mark);
              }
            });
          });

          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});
