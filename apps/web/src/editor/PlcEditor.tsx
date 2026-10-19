import { useEffect, useRef } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { configurePlcMonaco, plcLanguageId } from "./plcMonaco";
import type { CompileDiagnostic } from "../runtime/usePlcMachine";

window.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};
loader.config({ monaco });
configurePlcMonaco(monaco);

type Props = {
  value: string;
  theme: "dark" | "light";
  diagnostic: CompileDiagnostic | null;
  activeLine: number | null;
  onChange: (source: string) => void;
  onCompile: () => void;
  onMount: (editor: monaco.editor.IStandaloneCodeEditor) => void;
};

export function PlcEditor({
  value,
  theme,
  diagnostic,
  activeLine,
  onChange,
  onCompile,
  onMount,
}: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const onCompileRef = useRef(onCompile);
  onCompileRef.current = onCompile;

  const handleMount: OnMount = (editor, monaco) => {
    configurePlcMonaco(monaco);
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, plcLanguageId);
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onCompileRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onCompileRef.current());
    onMount(editor);
  };

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;

    if (!diagnostic) {
      monaco.editor.setModelMarkers(model, "plc-compiler", []);
      return;
    }
    monaco.editor.setModelMarkers(model, "plc-compiler", [{
      startLineNumber: diagnostic.line,
      startColumn: diagnostic.column,
      endLineNumber: diagnostic.line,
      endColumn: diagnostic.column + 1,
      message: diagnostic.message,
      severity: monaco.MarkerSeverity.Error,
    }]);
  }, [diagnostic, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const decorations = activeLine === null ? [] : editor.deltaDecorations([], [{
      range: new monaco.Range(activeLine + 1, 1, activeLine + 1, 1),
      options: {
        isWholeLine: true,
        className: "plc-editor-active-execution-line",
        glyphMarginClassName: "plc-editor-active-glyph",
      },
    }]);
    if (activeLine !== null) editor.revealLineInCenterIfOutsideViewport(activeLine + 1);
    return () => {
      if (decorations.length > 0) editor.deltaDecorations(decorations, []);
    };
  }, [activeLine]);

  return (
    <div className="plc-monaco-editor" aria-label="Editor de Structured Text">
      <Editor
        height="320px"
        language={plcLanguageId}
        theme={theme === "dark" ? "plc-academy-dark" : "plc-academy-light"}
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        onMount={handleMount}
        options={{
          ariaLabel: "Programa PLC en Structured Text",
          automaticLayout: true,
          autoClosingBrackets: "always",
          autoClosingComments: "always",
          autoIndent: "full",
          bracketPairColorization: { enabled: true },
          fontSize: 15,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: "off",
          glyphMargin: true,
          lineNumbersMinChars: 3,
          renderLineHighlight: "all",
        }}
      />
    </div>
  );
}
