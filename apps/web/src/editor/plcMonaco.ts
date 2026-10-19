import type * as monacoEditor from "monaco-editor/editor/editor.api";

export const plcLanguageId = "plc-structured-text";

export function configurePlcMonaco(monaco: typeof monacoEditor) {
  if (!monaco.languages.getLanguages().some(({ id }) => id === plcLanguageId)) {
    monaco.languages.register({ id: plcLanguageId });
    monaco.languages.setMonarchTokensProvider(plcLanguageId, {
      tokenizer: {
        root: [
          [/\/\/.*$/, "comment"],
          [/\(\*/, "comment", "@blockComment"],
          [/\b(VAR_INPUT|VAR_OUTPUT|END_VAR|VAR|BOOL)\b/i, "keyword"],
          [/\b(TRUE|FALSE)\b/i, "boolean"],
          [/\b(AND|OR|NOT)\b/i, "operator"],
          [/:=/, "operator"],
          [/[():;]/, "delimiter"],
          [/[A-Za-z_]\w*/, "identifier"],
        ],
        blockComment: [
          [/\*\)/, "comment", "@pop"],
          [/[^*]+/, "comment"],
          [/\*/, "comment"],
        ],
      },
    });
    monaco.languages.setLanguageConfiguration(plcLanguageId, {
      comments: { lineComment: "//", blockComment: ["(*", "*)"] },
      brackets: [["(", ")"]],
      autoClosingPairs: [
        { open: "(", close: ")" },
        { open: "(*", close: "*)", notIn: ["string"] },
      ],
      surroundingPairs: [{ open: "(", close: ")" }, { open: "(*", close: "*)"}],
      indentationRules: {
        increaseIndentPattern: /^\s*(VAR_INPUT|VAR_OUTPUT|VAR)\s*$/i,
        decreaseIndentPattern: /^\s*END_VAR\b/i,
      },
    });
  }

  monaco.editor.defineTheme("plc-academy-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "7c3aed", fontStyle: "bold" },
      { token: "boolean", foreground: "047857", fontStyle: "bold" },
      { token: "operator", foreground: "c2410c" },
      { token: "comment", foreground: "64748b", fontStyle: "italic" },
      { token: "identifier", foreground: "1d4ed8" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#334155",
      "editor.lineHighlightBackground": "#f1f5f9",
      "editorGutter.background": "#ffffff",
    },
  });
  monaco.editor.defineTheme("plc-academy-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "c4b5fd", fontStyle: "bold" },
      { token: "boolean", foreground: "6ee7b7", fontStyle: "bold" },
      { token: "operator", foreground: "fdba74" },
      { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
      { token: "identifier", foreground: "93c5fd" },
    ],
    colors: {
      "editor.background": "#111827",
      "editorLineNumber.foreground": "#64748b",
      "editorLineNumber.activeForeground": "#e2e8f0",
      "editor.lineHighlightBackground": "#1e293b",
      "editorGutter.background": "#111827",
    },
  });
}
