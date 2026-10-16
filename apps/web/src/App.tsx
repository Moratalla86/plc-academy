import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  type UIEvent,
} from "react";

const plannedModules = [
  {
    number: "01",
    name: "Runtime IEC 61131-3",
    detail: "Un ciclo de scan determinista para ejecutar la lógica del programa.",
    status: "En desarrollo",
    state: "active",
  },
  {
    number: "02",
    name: "Editor de programas",
    detail: "Escribe Structured Text y observa cómo evoluciona su memoria.",
    status: "En desarrollo",
    state: "active",
  },
  {
    number: "03",
    name: "Planta virtual",
    detail: "Conecta las entradas y salidas del PLC con escenas interactivas.",
    status: "Pendiente",
    state: "upcoming",
  },
];

const scanSteps = [
  {
    number: "01",
    name: "Lee las entradas",
    detail: "El PLC captura el estado de los sensores.",
    symbol: "I",
  },
  {
    number: "02",
    name: "Ejecuta el programa",
    detail: "La lógica se resuelve con esos valores.",
    symbol: "ƒ",
  },
  {
    number: "03",
    name: "Actualiza las salidas",
    detail: "El proceso responde al resultado del scan.",
    symbol: "Q",
  },
];

const demoProgram = `VAR_INPUT
  Start : BOOL;
  Stop : BOOL;
END_VAR
VAR
  Running : BOOL;
END_VAR
VAR_OUTPUT
  Motor : BOOL;
END_VAR
Running := (Running OR Start) AND NOT Stop;
Motor := Running;`;
const scanPeriodMs = 100;

type PlcMachineHandle = {
  input_count(): number;
  input_name(index: number): string;
  output_count(): number;
  output_name(index: number): string;
  variable_count(): number;
  variable_name(index: number): string;
  variable(index: number): boolean;
  set_input(index: number, value: boolean): void;
  scan(): bigint;
  output(index: number): boolean;
  free(): void;
};

type PlcMachineConstructor = new (
  source: string,
  scanPeriodMs: number,
) => PlcMachineHandle;

type CompileDiagnostic = {
  line: number;
  column: number;
  message: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compileDiagnostic(error: unknown): CompileDiagnostic | null {
  const match = /^Línea (\d+), columna (\d+):\s*(.*)$/s.exec(errorMessage(error));
  if (!match) return null;

  return {
    line: Number(match[1]),
    column: Number(match[2]),
    message: match[3],
  };
}

function structuredTextContext(source: string, position: number) {
  let inBlockComment = false;
  let inLineComment = false;
  let parenthesisDepth = 0;
  let offset = 0;

  while (offset < position) {
    if (inBlockComment) {
      if (source.startsWith("*)", offset) && offset + 2 <= position) {
        inBlockComment = false;
        offset += 2;
      } else {
        offset += 1;
      }
      continue;
    }

    if (inLineComment) {
      if (source[offset] === "\n") inLineComment = false;
      offset += 1;
      continue;
    }

    if (
      source.startsWith("(*", offset) &&
      offset + 2 <= position
    ) {
      inBlockComment = true;
      offset += 2;
    } else if (
      source.startsWith("//", offset) &&
      offset + 2 <= position
    ) {
      inLineComment = true;
      offset += 2;
    } else {
      if (source[offset] === "(") parenthesisDepth += 1;
      if (source[offset] === ")") parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      offset += 1;
    }
  }

  return {
    inComment: inBlockComment || inLineComment,
    inBlockComment,
    inLineComment,
    parenthesisDepth,
  };
}

function programAssignments(source: string) {
  let inBlockComment = false;
  return source
    .split("\n")
    .flatMap((line, index) => {
      let code = "";
      let offset = 0;

      while (offset < line.length) {
        if (inBlockComment || line.startsWith("(*", offset)) {
          if (!inBlockComment) offset += 2;
          const commentEnd = line.indexOf("*)", offset);
          if (commentEnd === -1) {
            inBlockComment = true;
            break;
          }
          offset = commentEnd + 2;
          inBlockComment = false;
          continue;
        }
        if (line.startsWith("//", offset)) break;
        code += line[offset];
        offset += 1;
      }

      const match = /^\s*([A-Za-z_]\w*)\s*:=/.exec(code);
      return match ? [{ line: index, target: match[1] }] : [];
    });
}

function renderStructuredTextLine(line: string, startsInComment: boolean) {
  const keywords = new Set(["VAR_INPUT", "VAR_OUTPUT", "END_VAR", "VAR", "BOOL"]);
  const booleanWords = new Set(["TRUE", "FALSE"]);
  const operators = new Set(["AND", "OR", "NOT"]);
  const parts: ReactNode[] = [];
  let inBlockComment = startsInComment;
  let offset = 0;

  while (offset < line.length) {
    if (inBlockComment || line.startsWith("(*", offset)) {
      const commentStart = offset;
      if (!inBlockComment) offset += 2;
      const commentEnd = line.indexOf("*)", offset);
      if (commentEnd === -1) {
        parts.push(
          <span className="st-token-comment" key={parts.length}>
            {line.slice(commentStart)}
          </span>,
        );
        inBlockComment = true;
        break;
      }
      offset = commentEnd + 2;
      parts.push(
        <span className="st-token-comment" key={parts.length}>
          {line.slice(commentStart, offset)}
        </span>,
      );
      inBlockComment = false;
      continue;
    }

    if (line.startsWith("//", offset)) {
      parts.push(
        <span className="st-token-comment" key={parts.length}>
          {line.slice(offset)}
        </span>,
      );
      break;
    }

    const token = /^(?:(?:VAR_INPUT|VAR_OUTPUT|END_VAR|VAR|BOOL|AND|OR|NOT|TRUE|FALSE)\b|:=|[():;]|[A-Za-z_]\w*)/i.exec(
      line.slice(offset),
    )?.[0];
    if (!token) {
      parts.push(line[offset]);
      offset += 1;
      continue;
    }

    const normalized = token.toUpperCase();
    const className = keywords.has(normalized)
      ? "st-token-keyword"
      : booleanWords.has(normalized)
        ? "st-token-boolean"
        : operators.has(normalized) || token === ":="
          ? "st-token-operator"
          : /^[():;]$/.test(token)
            ? "st-token-punctuation"
            : "st-token-identifier";
    parts.push(
      <span className={className} key={parts.length}>
        {token}
      </span>,
    );
    offset += token.length;
  }

  return { content: parts.length ? parts : [" "], inBlockComment };
}

function highlightStructuredText(source: string) {
  let startsInComment = false;
  return source.split("\n").map((line) => {
    const rendered = renderStructuredTextLine(line, startsInComment);
    startsInComment = rendered.inBlockComment;
    return rendered.content;
  });
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="arrow-icon"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M3.25 8h9.5m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ScanPreview() {
  const editorDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const programSourceRef = useRef<HTMLTextAreaElement | null>(null);
  const stCodeRef = useRef<HTMLDivElement | null>(null);
  const editorLineNumbersRef = useRef<HTMLDivElement | null>(null);
  const editorHighlightRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<PlcMachineHandle | null>(null);
  const machineConstructorRef = useRef<PlcMachineConstructor | null>(null);
  const intervalRef = useRef<number | null>(null);
  const traceTimersRef = useRef<number[]>([]);
  const editorSourceRef = useRef(demoProgram);
  const editorUndoRef = useRef<string[]>([]);
  const editorRedoRef = useRef<string[]>([]);
  const scanInProgressRef = useRef(false);
  const scanActionRef = useRef<() => void>(() => {});
  const activeProgramRef = useRef(demoProgram);
  const [ready, setReady] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeStatementLine, setActiveStatementLine] = useState<number | null>(
    null,
  );
  const [activeAssignmentTarget, setActiveAssignmentTarget] = useState<
    string | null
  >(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<CompileDiagnostic | null>(
    null,
  );
  const [isValidatingProgram, setIsValidatingProgram] = useState(false);
  const [editorCursorLine, setEditorCursorLine] = useState<number | null>(null);
  const [programSource, setProgramSource] = useState(demoProgram);
  const [activeProgram, setActiveProgram] = useState(demoProgram);
  const [inputNames, setInputNames] = useState<string[]>([]);
  const [outputNames, setOutputNames] = useState<string[]>([]);
  const [variableNames, setVariableNames] = useState<string[]>([]);
  const [inputs, setInputs] = useState<boolean[]>([]);
  const [scannedInputs, setScannedInputs] = useState<boolean[]>([]);
  const [outputs, setOutputs] = useState<boolean[]>([]);
  const [variables, setVariables] = useState<boolean[]>([]);
  const [scanNumber, setScanNumber] = useState("0");

  function loadProgram(machine: PlcMachineHandle) {
    setInputNames(
      Array.from({ length: machine.input_count() }, (_, index) =>
        machine.input_name(index),
      ),
    );
    setOutputNames(
      Array.from({ length: machine.output_count() }, (_, index) =>
        machine.output_name(index),
      ),
    );
    setVariableNames(
      Array.from({ length: machine.variable_count() }, (_, index) =>
        machine.variable_name(index),
      ),
    );
    setInputs(Array(machine.input_count()).fill(false));
    setScannedInputs(Array(machine.input_count()).fill(false));
    setOutputs(Array(machine.output_count()).fill(false));
    setVariables(Array(machine.variable_count()).fill(false));
    setScanNumber("0");
    setActiveStatementLine(null);
    setActiveAssignmentTarget(null);
  }

  function clearTrace() {
    traceTimersRef.current.forEach(window.clearTimeout);
    traceTimersRef.current = [];
    scanInProgressRef.current = false;
    setIsScanning(false);
    setActiveStatementLine(null);
    setActiveAssignmentTarget(null);
  }

  useEffect(() => {
    if (activeStatementLine === null || !stCodeRef.current) return;
    const codePanel = stCodeRef.current;
    const activeLine = codePanel.children.item(activeStatementLine);
    if (!(activeLine instanceof HTMLElement)) return;

    const lineTop =
      activeLine.getBoundingClientRect().top -
      codePanel.getBoundingClientRect().top +
      codePanel.scrollTop;
    const lineBottom = lineTop + activeLine.offsetHeight;
    const visibleTop = codePanel.scrollTop;
    const visibleBottom = visibleTop + codePanel.clientHeight;
    if (lineTop < visibleTop) {
      codePanel.scrollTop = lineTop;
    } else if (lineBottom > visibleBottom) {
      codePanel.scrollTop = lineBottom - codePanel.clientHeight;
    }
  }, [activeStatementLine]);

  useEffect(() => {
    if (!ready || programSource === activeProgram) {
      setIsValidatingProgram(false);
      return;
    }

    setIsValidatingProgram(true);
    const timeoutId = window.setTimeout(() => {
      const Machine = machineConstructorRef.current;
      if (!Machine) {
        setIsValidatingProgram(false);
        return;
      }

      try {
        const validationMachine = new Machine(programSource, scanPeriodMs);
        validationMachine.free();
        setCompileError(null);
      } catch (error) {
        const diagnostic = compileDiagnostic(error);
        if (diagnostic) {
          setCompileError(diagnostic);
        } else {
          setCompileError(null);
          setRuntimeError(errorMessage(error));
        }
      } finally {
        setIsValidatingProgram(false);
      }
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [activeProgram, programSource, ready]);

  useEffect(() => {
    let mounted = true;

    async function initializeRuntime() {
      try {
        const wasm = await import("./wasm/plc_runtime.js");
        await wasm.default();
        if (!mounted) return;

        machineConstructorRef.current = wasm.PlcMachine;
        const machine = new wasm.PlcMachine(demoProgram, scanPeriodMs);
        runtimeRef.current = machine;
        loadProgram(machine);
        setReady(true);
      } catch (error) {
        if (mounted) setRuntimeError(errorMessage(error));
      }
    }

    void initializeRuntime();
    return () => {
      mounted = false;
      traceTimersRef.current.forEach(window.clearTimeout);
      traceTimersRef.current = [];
      runtimeRef.current?.free();
      runtimeRef.current = null;
      machineConstructorRef.current = null;
    };
  }, []);

  function compileProgram() {
    const Machine = machineConstructorRef.current;
    if (!Machine) return;

    stopAutoScan();
    clearTrace();
    try {
      const nextMachine = new Machine(programSource, scanPeriodMs);
      runtimeRef.current?.free();
      runtimeRef.current = nextMachine;
      activeProgramRef.current = programSource;
      setActiveProgram(programSource);
      loadProgram(nextMachine);
      setCompileError(null);
      setRuntimeError(null);
    } catch (error) {
      const diagnostic = compileDiagnostic(error);
      setCompileError(diagnostic);
      setRuntimeError(
        diagnostic
          ? "No se pudo compilar el programa. Revisa el diagnóstico del editor."
          : errorMessage(error),
      );
      if (diagnostic) {
        editorDetailsRef.current?.setAttribute("open", "");
        const sourceLines = programSource.split("\n");
        const lineStart = sourceLines
          .slice(0, diagnostic.line - 1)
          .reduce((offset, line) => offset + line.length + 1, 0);
        const line = sourceLines[diagnostic.line - 1] ?? "";
        const columnOffset = Array.from(line)
          .slice(0, Math.max(0, diagnostic.column - 1))
          .join("").length;
        const selectionStart = Math.min(lineStart + columnOffset, programSource.length);
        programSourceRef.current?.focus();
        programSourceRef.current?.setSelectionRange(
          selectionStart,
          Math.min(selectionStart + 1, programSource.length),
        );
      }
    }
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();
      restoreEditorHistory(event.currentTarget, event.shiftKey);
      return;
    }

    if (
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key.toLowerCase() === "y"
    ) {
      event.preventDefault();
      restoreEditorHistory(event.currentTarget, true);
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key === "Enter" ||
        (event.key.toLowerCase() === "s" && !event.shiftKey && !event.altKey))
    ) {
      event.preventDefault();
      compileProgram();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "/") {
      event.preventDefault();
      const editor = event.currentTarget;
      const selectionStart = editor.selectionStart;
      const selectionEnd = editor.selectionEnd;
      const firstLineStart =
        programSource.lastIndexOf("\n", selectionStart - 1) + 1;
      const selectedEnd =
        selectionEnd > selectionStart &&
        programSource[selectionEnd - 1] === "\n"
          ? selectionEnd - 1
          : selectionEnd;
      const nextLineBreak = programSource.indexOf("\n", selectedEnd);
      const lastLineEnd =
        nextLineBreak === -1 ? programSource.length : nextLineBreak;
      const lines = programSource
        .slice(firstLineStart, lastLineEnd)
        .split("\n");
      const indentation = lines.map(
        (line) => /^[ \t]*/.exec(line)?.[0].length ?? 0,
      );
      const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
      const uncomment =
        nonEmptyLines.length > 0 &&
        nonEmptyLines.every((line) => /^[ \t]*\/\//.test(line));
      const markerLengths = lines.map((line, index) =>
        uncomment && line.slice(indentation[index]).startsWith("//")
          ? line[indentation[index] + 2] === " "
            ? 3
            : 2
          : 0,
      );
      const updatedLines = lines.map((line, index) => {
        if (uncomment) {
          const markerLength = markerLengths[index];
          return markerLength
            ? `${line.slice(0, indentation[index])}${line.slice(indentation[index] + markerLength)}`
            : line;
        }
        const prefix = line.slice(0, indentation[index]);
        return `${prefix}// ${line.slice(indentation[index])}`;
      });
      const nextSource = `${programSource.slice(0, firstLineStart)}${updatedLines.join("\n")}${programSource.slice(lastLineEnd)}`;
      const mapPosition = (position: number) => {
        let oldLineStart = firstLineStart;
        let delta = 0;

        for (let index = 0; index < lines.length; index += 1) {
          const oldLineEnd = oldLineStart + lines[index].length;
          const isOnLine = position <= oldLineEnd || index === lines.length - 1;
          if (isOnLine) {
            let localPosition = Math.min(
              Math.max(0, position - oldLineStart),
              lines[index].length,
            );
            if (uncomment) {
              const markerStart = indentation[index];
              const markerLength = markerLengths[index];
              if (markerLength && localPosition >= markerStart + markerLength) {
                localPosition -= markerLength;
              } else if (markerLength && localPosition > markerStart) {
                localPosition = markerStart;
              }
            } else if (localPosition >= indentation[index]) {
              localPosition += 3;
            }
            return oldLineStart + delta + localPosition;
          }

          delta += updatedLines[index].length - lines[index].length;
          oldLineStart = oldLineEnd + 1;
        }
        return position + delta;
      };

      const nextSelectionStart = mapPosition(selectionStart);
      const nextSelectionEnd = mapPosition(selectionEnd);
      updateProgramSource(nextSource);
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      });
      return;
    }

    if (event.key === "(") {
      const editor = event.currentTarget;
      if (structuredTextContext(programSource, editor.selectionStart).inComment) {
        return;
      }
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const selectedText = programSource.slice(start, end);
      const insertion = selectedText ? `(${selectedText})` : "()";
      const nextSource = `${programSource.slice(0, start)}${insertion}${programSource.slice(end)}`;
      const selectionStart = start + 1;
      const selectionEnd = selectedText ? start + insertion.length - 1 : start + 1;
      updateProgramSource(nextSource);
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(selectionStart, selectionEnd);
      });
      return;
    }

    if (event.key === "*") {
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const context = structuredTextContext(programSource, start);
      if (
        start === end &&
        !context.inComment &&
        programSource[start - 1] === "(" &&
        programSource[start] === ")"
      ) {
        event.preventDefault();
        const nextSource = `${programSource.slice(0, start - 1)}(**)${programSource.slice(start + 1)}`;
        const caret = start + 1;
        updateProgramSource(nextSource);
        requestAnimationFrame(() => {
          editor.focus();
          editor.setSelectionRange(caret, caret);
        });
        return;
      }
    }

    if (event.key === "*" && !event.ctrlKey && !event.metaKey) {
      const editor = event.currentTarget;
      const context = structuredTextContext(
        programSource,
        editor.selectionStart,
      );
      if (
        editor.selectionStart === editor.selectionEnd &&
        context.inBlockComment &&
        programSource.startsWith("*)", editor.selectionStart)
      ) {
        event.preventDefault();
        const caret = editor.selectionStart + 1;
        editor.setSelectionRange(caret, caret);
        return;
      }
    }

    if (event.key === ")" && !event.ctrlKey && !event.metaKey) {
      const editor = event.currentTarget;
      const context = structuredTextContext(
        programSource,
        editor.selectionStart,
      );
      if (
        editor.selectionStart === editor.selectionEnd &&
        ((context.inBlockComment &&
          programSource[editor.selectionStart - 1] === "*" &&
          programSource[editor.selectionStart] === ")") ||
          (!context.inComment &&
            context.parenthesisDepth > 0 &&
            programSource[editor.selectionStart] === ")"))
      ) {
        event.preventDefault();
        editor.setSelectionRange(
          editor.selectionStart + 1,
          editor.selectionStart + 1,
        );
        return;
      }
    }

    if (event.key === "Backspace" && !event.ctrlKey && !event.metaKey) {
      const editor = event.currentTarget;
      const caret = editor.selectionStart;
      if (caret !== editor.selectionEnd) return;
      const context = structuredTextContext(programSource, caret);

      const isEmptyBlockComment =
        context.inBlockComment &&
        programSource.slice(caret - 2, caret) === "(*" &&
        programSource.slice(caret, caret + 2) === "*)";
      const isEmptyParenthesis =
        !context.inComment &&
        context.parenthesisDepth > 0 &&
        programSource[caret - 1] === "(" && programSource[caret] === ")";
      if (isEmptyBlockComment || isEmptyParenthesis) {
        event.preventDefault();
        const pairLength = isEmptyBlockComment ? 2 : 1;
        const nextSource = `${programSource.slice(0, caret - pairLength)}${programSource.slice(caret + pairLength)}`;
        const nextCaret = caret - pairLength;
        updateProgramSource(nextSource);
        requestAnimationFrame(() => {
          editor.focus();
          editor.setSelectionRange(nextCaret, nextCaret);
        });
        return;
      }

      const lineStart = programSource.lastIndexOf("\n", caret - 1) + 1;
      const indentation = /^[ \t]*/.exec(
        programSource.slice(lineStart, caret),
      )?.[0] ?? "";
      const removedIndent = indentation.endsWith("  ")
        ? 2
        : indentation.endsWith(" ") || indentation.endsWith("\t")
          ? 1
          : 0;
      if (removedIndent === 0) return;

      event.preventDefault();
      const nextSource = `${programSource.slice(0, caret - removedIndent)}${programSource.slice(caret)}`;
      const nextCaret = caret - removedIndent;
      updateProgramSource(nextSource);
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(nextCaret, nextCaret);
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const lineStart = programSource.lastIndexOf("\n", start - 1) + 1;
      const currentLine = programSource.slice(lineStart, start);
      const baseIndent = /^[ \t]*/.exec(currentLine)?.[0] ?? "";
      const trimmedLine = currentLine.trim();
      const context = structuredTextContext(programSource, start);
      if (
        context.inLineComment ||
        (context.inBlockComment && !programSource.startsWith("*)", start))
      ) {
        const commentContinuation = context.inLineComment ? "// " : " * ";
        const insertion = `\n${baseIndent}${commentContinuation}`;
        const nextSource = `${programSource.slice(0, start)}${insertion}${programSource.slice(end)}`;
        const caret = start + insertion.length;
        updateProgramSource(nextSource);
        requestAnimationFrame(() => {
          editor.focus();
          editor.setSelectionRange(caret, caret);
        });
        return;
      }

      const isEmptyBlockComment =
        start === end &&
        context.inBlockComment &&
        programSource.slice(start - 2, start) === "(*" &&
        programSource.slice(start, start + 2) === "*)";
      const isEmptyParenthesis =
        start === end &&
        !context.inComment &&
        context.parenthesisDepth > 0 &&
        programSource[start - 1] === "(" &&
        programSource[start] === ")";
      if (isEmptyBlockComment || isEmptyParenthesis) {
        const opening = isEmptyBlockComment ? "(*" : "(";
        const closing = isEmptyBlockComment ? "*)" : ")";
        const innerIndent = `${baseIndent}  `;
        const insertion = `${opening}\n${innerIndent}\n${baseIndent}${closing}`;
        const nextSource = `${programSource.slice(0, start - opening.length)}${insertion}${programSource.slice(start + closing.length)}`;
        const caret =
          start - opening.length + opening.length + 1 + innerIndent.length;
        updateProgramSource(nextSource);
        requestAnimationFrame(() => {
          editor.focus();
          editor.setSelectionRange(caret, caret);
        });
        return;
      }

      const isBeforeBlockCommentClose =
        start === end &&
        context.inBlockComment &&
        programSource.startsWith("*)", start);
      const isBeforeParenthesisClose =
        start === end &&
        !context.inComment &&
        context.parenthesisDepth > 0 &&
        programSource[start] === ")";
      if (isBeforeBlockCommentClose || isBeforeParenthesisClose) {
        const innerIndent = `${baseIndent}  `;
        const insertion = `\n${innerIndent}\n${baseIndent}`;
        const nextSource = `${programSource.slice(0, start)}${insertion}${programSource.slice(start)}`;
        const caret = start + 1 + innerIndent.length;
        updateProgramSource(nextSource);
        requestAnimationFrame(() => {
          editor.focus();
          editor.setSelectionRange(caret, caret);
        });
        return;
      }

      const indent = /^(VAR_INPUT|VAR_OUTPUT|VAR)$/i.test(trimmedLine)
        ? `${baseIndent}  `
        : /^END_VAR$/i.test(trimmedLine)
          ? baseIndent.slice(0, Math.max(0, baseIndent.length - 2))
          : baseIndent;
      const insertion = `\n${indent}`;
      const nextSource = `${programSource.slice(0, start)}${insertion}${programSource.slice(end)}`;
      const caret = start + insertion.length;
      updateProgramSource(nextSource);
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(caret, caret);
      });
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      if (event.shiftKey) {
        const lineStart = programSource.lastIndexOf("\n", start - 1) + 1;
        if (start === end) {
          const indent = programSource.slice(lineStart, lineStart + 2);
          const removedSpaces = indent === "  " ? 2 : indent === " " ? 1 : 0;
          if (removedSpaces === 0) return;

          const nextSource = `${programSource.slice(0, lineStart)}${programSource.slice(lineStart + removedSpaces)}`;
          updateProgramSource(nextSource);
          requestAnimationFrame(() => {
            editor.focus();
            const caret = Math.max(lineStart, start - removedSpaces);
            editor.setSelectionRange(caret, caret);
          });
          return;
        }

        const selectionEnd =
          end > start && programSource[end - 1] === "\n" ? end - 1 : end;
        const nextLineBreak = programSource.indexOf("\n", selectionEnd);
        const lineEnd =
          nextLineBreak === -1 ? programSource.length : nextLineBreak;
        const selectedLines = programSource.slice(lineStart, lineEnd).split("\n");
        const removedSpaces = selectedLines.map((line) =>
          line.startsWith("  ") ? 2 : line.startsWith(" ") ? 1 : 0,
        );
        if (removedSpaces.every((count) => count === 0)) return;

        const nextSource = `${programSource.slice(0, lineStart)}${selectedLines
          .map((line, index) => line.slice(removedSpaces[index]))
          .join("\n")}${programSource.slice(lineEnd)}`;
        const removedBeforeStart = Math.min(
          removedSpaces[0],
          start - lineStart,
        );
        let offsetInSelection = 0;
        let removedBeforeEnd = 0;
        removedSpaces.forEach((count, index) => {
          removedBeforeEnd += Math.min(count, Math.max(0, end - (lineStart + offsetInSelection)));
          offsetInSelection += selectedLines[index].length + 1;
        });
        updateProgramSource(nextSource);
        requestAnimationFrame(() => {
          editor.focus();
          editor.setSelectionRange(
            start - removedBeforeStart,
            end - removedBeforeEnd,
          );
        });
        return;
      }

      if (start !== end) {
        const lineStart = programSource.lastIndexOf("\n", start - 1) + 1;
        const selectionEnd =
          end > start && programSource[end - 1] === "\n" ? end - 1 : end;
        const nextLineBreak = programSource.indexOf("\n", selectionEnd);
        const lineEnd =
          nextLineBreak === -1 ? programSource.length : nextLineBreak;
        const selectedLines = programSource
          .slice(lineStart, lineEnd)
          .split("\n");
        const nextSource = `${programSource.slice(0, lineStart)}${selectedLines
          .map((line) => `  ${line}`)
          .join("\n")}${programSource.slice(lineEnd)}`;
        updateProgramSource(nextSource);
        requestAnimationFrame(() => {
          editor.focus();
          editor.setSelectionRange(
            start + 2,
            end + selectedLines.length * 2,
          );
        });
        return;
      }

      const nextSource = `${programSource.slice(0, start)}  ${programSource.slice(end)}`;
      updateProgramSource(nextSource);
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(start + 2, start + 2);
      });
    }
  }

  function updateInput(index: number) {
    const machine = runtimeRef.current;
    if (!machine || programSource !== activeProgramRef.current) return;

    const value = !inputs[index];
    try {
      machine.set_input(index, value);
      setInputs((current) =>
        current.map((input, inputIndex) =>
          inputIndex === index ? value : input,
        ),
      );
      setRuntimeError(null);
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }

  function executeScan() {
    const machine = runtimeRef.current;
    if (
      !machine ||
      scanInProgressRef.current ||
      programSource !== activeProgramRef.current
    ) {
      return;
    }

    try {
      const nextScan = machine.scan();
      const nextOutputs = Array.from(
        { length: machine.output_count() },
        (_, index) => machine.output(index),
      );
      const nextVariables = Array.from(
        { length: machine.variable_count() },
        (_, index) => machine.variable(index),
      );
      const assignments = programAssignments(activeProgramRef.current);
      const commitScan = () => {
        setOutputs(nextOutputs);
        setVariables(nextVariables);
        setScannedInputs([...inputs]);
        setScanNumber(nextScan.toString());
        setRuntimeError(null);
      };
      if (assignments.length === 0) {
        commitScan();
        return;
      }

      scanInProgressRef.current = true;
      setIsScanning(true);
      assignments.forEach(({ line, target }, index) => {
        const timer = window.setTimeout(() => {
          setActiveStatementLine(line);
          setActiveAssignmentTarget(target);
          if (index === assignments.length - 1) {
            const finishTimer = window.setTimeout(() => {
              commitScan();
              setActiveStatementLine(null);
              setActiveAssignmentTarget(null);
              setIsScanning(false);
              scanInProgressRef.current = false;
              traceTimersRef.current = [];
            }, 280);
            traceTimersRef.current.push(finishTimer);
          }
        }, index * 360);
        traceTimersRef.current.push(timer);
      });
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }

  scanActionRef.current = executeScan;

  useEffect(() => {
    if (!ready || !autoRunning) return;

    const intervalDelay = Math.max(
      1500,
      programAssignments(activeProgram).length * 360 + 500,
    );
    const intervalId = window.setInterval(() => scanActionRef.current(), intervalDelay);
    intervalRef.current = intervalId;
    return () => {
      window.clearInterval(intervalId);
      if (intervalRef.current === intervalId) intervalRef.current = null;
    };
  }, [activeProgram, autoRunning, ready]);

  function stopAutoScan() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoRunning(false);
  }

  function updateProgramSource(source: string) {
    if (source === editorSourceRef.current) return;
    editorUndoRef.current = [...editorUndoRef.current, editorSourceRef.current].slice(-100);
    editorRedoRef.current = [];
    editorSourceRef.current = source;
    if (source !== activeProgramRef.current) stopAutoScan();
    setCompileError(null);
    setRuntimeError(null);
    setProgramSource(source);
  }

  function restoreEditorHistory(
    editor: HTMLTextAreaElement,
    redo: boolean,
  ) {
    const sourceStack = redo ? editorRedoRef.current : editorUndoRef.current;
    const destinationStack = redo ? editorUndoRef.current : editorRedoRef.current;
    const source = sourceStack.pop();
    if (source === undefined) return;

    destinationStack.push(editorSourceRef.current);
    editorSourceRef.current = source;
    if (source !== activeProgramRef.current) stopAutoScan();
    setCompileError(null);
    setRuntimeError(null);
    setProgramSource(source);
    const selectionStart = Math.min(editor.selectionStart, source.length);
    const selectionEnd = Math.min(editor.selectionEnd, source.length);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function syncEditorGutter(event: UIEvent<HTMLTextAreaElement>) {
    if (editorLineNumbersRef.current) {
      editorLineNumbersRef.current.style.transform = `translateY(-${event.currentTarget.scrollTop}px)`;
    }
    if (editorHighlightRef.current) {
      editorHighlightRef.current.style.transform = `translate(-${event.currentTarget.scrollLeft}px, -${event.currentTarget.scrollTop}px)`;
    }
  }

  function updateEditorCursorLine(
    event: SyntheticEvent<HTMLTextAreaElement>,
  ) {
    setEditorCursorLine(
      event.currentTarget.value
        .slice(0, event.currentTarget.selectionStart)
        .split("\n").length,
    );
  }

  function focusCompileError() {
    if (!compileError || !programSourceRef.current) return;

    const sourceLines = programSource.split("\n");
    const lineStart = sourceLines
      .slice(0, Math.max(0, compileError.line - 1))
      .reduce((offset, line) => offset + line.length + 1, 0);
    const errorLine = sourceLines[compileError.line - 1] ?? "";
    const columnOffset = Array.from(errorLine)
      .slice(0, Math.max(0, compileError.column - 1))
      .join("").length;
    const selectionStart = Math.min(
      lineStart + columnOffset,
      programSource.length,
    );
    const editor = programSourceRef.current;
    editor.focus();
    editor.setSelectionRange(
      selectionStart,
      Math.min(selectionStart + 1, programSource.length),
    );
    setEditorCursorLine(compileError.line);
  }

  function resetSimulator() {
    const Machine = machineConstructorRef.current;
    if (!Machine) return;

    stopAutoScan();
    clearTrace();
    try {
      const nextMachine = new Machine(activeProgramRef.current, scanPeriodMs);
      runtimeRef.current?.free();
      runtimeRef.current = nextMachine;
      loadProgram(nextMachine);
      editorSourceRef.current = activeProgramRef.current;
      editorUndoRef.current = [];
      editorRedoRef.current = [];
      setProgramSource(activeProgramRef.current);
      setCompileError(null);
      setEditorCursorLine(null);
      setRuntimeError(null);
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }

  const hasUncompiledChanges = programSource !== activeProgram;

  const programLines = activeProgram.split("\n");
  const highlightedProgramLines = highlightStructuredText(activeProgram);
  const editorLines = programSource.split("\n");
  const highlightedEditorLines = highlightStructuredText(programSource);

  return (
    <div className="simulator-workspace">
    <section className="preview-card" aria-labelledby="simulator-title">
      <div className="preview-topbar">
        <div className="preview-title">
          <span
            className={`preview-led${ready ? "" : runtimeError ? " is-error" : " is-loading"}`}
            aria-hidden="true"
          />
          <span id="simulator-title">Prueba el programa</span>
        </div>
        <span
          className={`runtime-badge${runtimeError ? " is-error" : ready ? " is-ready" : ""}`}
          role="status"
        >
          {ready ? "Listo" : runtimeError ? "Error" : "Cargando"}
        </span>
      </div>

      <p className="simulator-instructions">
        Activa Start y ejecuta un scan. Suelta Start: el motor sigue activo.
        Pulsa Stop para detenerlo.
      </p>

      <div className="preview-body">
        <section className="io-column input-panel" aria-labelledby="input-heading">
          <div className="io-heading">
            <span className="step-label">1</span>
            <span id="input-heading">Entradas</span>
          </div>
          {inputNames.map((name, index) => (
            <button
              className={`io-row io-input${inputs[index] ? " is-on" : ""}`}
              key={name}
              type="button"
              aria-pressed={inputs[index]}
              disabled={!ready || hasUncompiledChanges || isScanning}
              onClick={() => updateInput(index)}
            >
              <span className="io-indicator" aria-hidden="true" />
              <span className="input-copy">
                <span className="signal-name">{name}</span>
                <span className="signal-address">{`I0.${index}`}</span>
              </span>
              <span className={`signal-state${inputs[index] ? " is-on" : ""}`}>
                {inputs[index] ? "ACTIVA" : "INACTIVA"}
              </span>
            </button>
          ))}
          <p className="panel-hint">
            Start arranca el motor; Stop lo detiene.
          </p>
        </section>

        <div className="scan-controls">
          <div className="scan-action-copy">
            <span className="step-label">2</span>
            <span>
              <strong>
                {autoRunning
                  ? "Ciclo automático"
                  : isScanning
                    ? "Ejecutando programa"
                    : "Modo paso a paso"}
              </strong>
              <small>
                Scan {scanNumber} · {scanPeriodMs} ms
              </small>
            </span>
          </div>
          <div className="scan-actions">
            <button
              className="scan-step-button"
              type="button"
              disabled={
                !ready || autoRunning || hasUncompiledChanges || isScanning
              }
              onClick={executeScan}
            >
              Un scan
            </button>
            <button
              className={`scan-button${autoRunning ? " is-running" : ""}`}
              type="button"
              disabled={!ready || hasUncompiledChanges || (isScanning && !autoRunning)}
              aria-pressed={autoRunning}
              onClick={() =>
                autoRunning ? stopAutoScan() : setAutoRunning(true)
              }
            >
              {autoRunning ? "Pausar" : "Iniciar"}{" "}
              <span aria-hidden="true">{autoRunning ? "Ⅱ" : "▶"}</span>
            </button>
          </div>
        </div>

        <section
          className="io-column output-panel"
          aria-labelledby="output-heading"
          aria-live="polite"
        >
          <div className="io-heading">
            <span className="step-label">3</span>
            <span id="output-heading">Salidas</span>
          </div>
          {outputNames.map((name, index) => (
            <div
              className={`io-output${outputs[index] ? " is-on" : ""}${activeAssignmentTarget?.toUpperCase() === name.toUpperCase() ? " is-traced" : ""}`}
              key={name}
              aria-label={`${name}: ${outputs[index] ? "activa" : "inactiva"}`}
            >
              <span className="io-indicator" aria-hidden="true" />
              <span className="input-copy">
                <span className="signal-name">{name}</span>
                <span className="signal-address">{`Q0.${index}`}</span>
              </span>
              <span className={`signal-state${outputs[index] ? " is-on" : ""}`}>
                {outputs[index] ? "ACTIVA" : "INACTIVA"}
              </span>
            </div>
          ))}
          <p className="panel-hint">
            Las salidas se actualizan al ejecutar el scan.
          </p>
        </section>
      </div>

      {hasUncompiledChanges && (
        <p className="pending-program" role="status">
          El código ha cambiado. Compílalo antes de continuar ejecutando el PLC.
        </p>
      )}
      {inputs.some((input, index) => input !== scannedInputs[index]) && (
        <p className="pending-inputs" role="status">
          Entradas cambiadas: ejecuta un scan para aplicar los cambios.
        </p>
      )}
      {variableNames.length > 0 && (
        <div className="memory-state" aria-live="polite">
          <span className="memory-heading">Memoria interna</span>
          {variableNames.map((name, index) => (
            <span
              className={`memory-value${variables[index] ? " is-on" : ""}${activeAssignmentTarget?.toUpperCase() === name.toUpperCase() ? " is-traced" : ""}`}
              key={name}
            >
              <span className="io-indicator" aria-hidden="true" />
              {name} = {variables[index] ? "TRUE" : "FALSE"}
            </span>
          ))}
        </div>
      )}
      <div className="simulator-tools">
        <span>
          {autoRunning
            ? "El PLC está repitiendo el ciclo."
            : "Ejecuta un scan manual o inicia el ciclo automático."}
        </span>
        <button type="button" disabled={!ready} onClick={resetSimulator}>
          Reiniciar
        </button>
      </div>
      {runtimeError && (
        <p className="runtime-error" role="alert">
          Error de compilación o ejecución: {runtimeError}
        </p>
      )}

    </section>
    <aside className="st-panel" aria-labelledby="st-panel-title">
      <div className="st-panel-header">
        <div>
          <p className="st-panel-eyebrow">PROGRAMA DEL PLC</p>
          <h2 id="st-panel-title">Structured Text</h2>
        </div>
        <span className="st-language-tag">ST</span>
      </div>
      <p className="st-panel-help">
        Cada scan resuelve las líneas en orden. La línea activa se ilumina.
      </p>
      <div
        className="st-code"
        aria-label="Programa en ejecución"
        ref={stCodeRef}
      >
        {programLines.map((line, index) => (
          <div
            className={`st-code-line${activeStatementLine === index ? " is-active" : ""}`}
            key={`${index}-${line}`}
            aria-current={activeStatementLine === index ? "step" : undefined}
          >
            <span className="st-line-number">{index + 1}</span>
            <code>{highlightedProgramLines[index]}</code>
          </div>
        ))}
      </div>
      <div className="st-trace-status" aria-live="polite">
        <span className={`st-trace-dot${isScanning ? " is-running" : ""}`} />
        {isScanning
          ? `Línea ${(activeStatementLine ?? 0) + 1} · ${activeAssignmentTarget}`
          : `Scan ${scanNumber} · ${scanPeriodMs} ms`}
      </div>
      <details className="program-editor" ref={editorDetailsRef}>
        <summary>Editar programa</summary>
        <label className="editor-label" htmlFor="program-source">
          PROGRAMA PLC
        </label>
        <p id="program-help" className="editor-help">
          BOOL, memoria VAR, asignaciones, comentarios // y (* … *), AND, OR,
          NOT y paréntesis. Enter conserva sangría, continúa comentarios de
          línea y bloque, expande pares vacíos y ajusta tras VAR/END_VAR;
          Tab/Shift+Tab ajustan sangría y Backspace la reduce;
          Ctrl/Cmd + / comenta líneas; (), (* *) se completan y Backspace los
          elimina juntos si están vacíos; Ctrl/Cmd + Z deshace y Ctrl/Cmd +
          Shift+Z rehace; la sintaxis se comprueba al escribir;
          Ctrl/Cmd + Enter/S compila.
        </p>
        <div className="source-editor">
          <div className="source-editor-viewport">
            <div className="source-editor-highlight" aria-hidden="true">
              <div ref={editorHighlightRef}>
                {editorLines.map((_, index) => (
                  <div
                    className={[
                      "source-editor-highlight-line",
                      editorCursorLine === index + 1 ? "is-active" : "",
                      compileError?.line === index + 1 ? "has-error" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={index}
                  >
                    {highlightedEditorLines[index]}
                    {compileError?.line === index + 1 && (
                      <span
                        className="source-editor-error-column"
                        style={{
                          left: `calc(10px + ${Array.from(editorLines[index])
                            .slice(0, Math.max(0, compileError.column - 1))
                            .reduce(
                              (column, character) =>
                                character === "\t"
                                  ? column + (2 - (column % 2))
                                  : column + 1,
                              0,
                            )}ch)`,
                      }}
                    />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <textarea
              id="program-source"
              ref={programSourceRef}
              className="program-source"
              value={programSource}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              aria-describedby={`program-help${compileError ? " program-diagnostic" : ""}`}
              aria-invalid={compileError !== null}
              onChange={(event) => updateProgramSource(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              onSelect={updateEditorCursorLine}
              onFocus={updateEditorCursorLine}
              onBlur={() => setEditorCursorLine(null)}
              onScroll={syncEditorGutter}
            />
          </div>
          <div className="source-editor-gutter" aria-hidden="true">
            <div ref={editorLineNumbersRef}>
              {editorLines.map((_, index) => (
                <span
                  className={[
                    editorCursorLine === index + 1 ? "is-active" : "",
                    compileError?.line === index + 1 ? "has-error" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={index}
                >
                  {index + 1}
                </span>
              ))}
            </div>
          </div>
        </div>
        {compileError && (
          <div
            id="program-diagnostic"
            className="program-diagnostic"
            role="alert"
          >
            <span>
              Línea {compileError.line}, columna {compileError.column}:{" "}
              {compileError.message}
            </span>
            <button type="button" onClick={focusCompileError}>
              Ir al error
            </button>
          </div>
        )}
        <p
          className={`program-status${hasUncompiledChanges ? " is-pending" : ""}${isValidatingProgram ? " is-checking" : ""}`}
          aria-live="polite"
        >
          {isValidatingProgram
            ? "Comprobando sintaxis…"
            : hasUncompiledChanges
            ? "Hay cambios sin compilar."
            : "Este es el programa que está ejecutando el PLC."}
        </p>
        <button
          className="compile-button"
          type="button"
          disabled={!ready}
          title="Compilar y reiniciar (Ctrl/Cmd + Enter o Ctrl/Cmd + S)"
          onClick={compileProgram}
        >
          Compilar y reiniciar
        </button>
        {hasUncompiledChanges && (
          <button
            className="discard-button"
            type="button"
            onClick={() => updateProgramSource(activeProgram)}
          >
            Descartar cambios
          </button>
        )}
      </details>
    </aside>
    </div>
  );
}

export default function App() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="#inicio" aria-label="PLC Academy, inicio">
          <span className="wordmark-icon" aria-hidden="true">
            P
          </span>
          <span>PLC Academy</span>
        </a>

        <nav className="main-nav" aria-label="Navegación principal">
          <a href="#ciclo">El ciclo de scan</a>
          <a href="#ruta">Hoja de ruta</a>
        </nav>

        <span className="release-tag">
          <span aria-hidden="true" />
          Prototipo · 0.1
        </span>
      </header>

      <section className="hero" id="inicio" aria-labelledby="hero-title">
        <div className="hero-copy-column">
          <p className="eyebrow">
            <span className="eyebrow-line" aria-hidden="true" />
            AUTOMATIZACIÓN, PASO A PASO
          </p>
          <h1 id="hero-title">
            Aprende PLC.
            <br />
            <span>Entiende cada scan.</span>
          </h1>
          <p className="hero-copy">
            Escribe programas, ejecútalos y observa cómo responde una planta
            virtual. Aprende automatización haciendo, no solo leyendo.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#ruta">
              Explorar el proyecto
              <ArrowIcon />
            </a>
            <a className="button button-secondary" href="#ciclo">
              Cómo funciona
            </a>
          </div>
          <div className="runtime-status" role="status">
            <span className="status-indicator" aria-hidden="true" />
            Runtime Rust · WebAssembly
          </div>
        </div>

        <div className="hero-visual">
          <ScanPreview />
        </div>
      </section>

      <section className="learning-section" aria-labelledby="learning-title">
        <div className="section-intro">
          <p className="eyebrow">APRENDER CON CONTEXTO</p>
          <h2 id="learning-title">La lógica cobra vida.</h2>
          <p>
            Cada concepto se conecta con lo que ocurre dentro del controlador
            y fuera de él.
          </p>
        </div>
        <div className="learning-grid">
          <article className="learning-card">
            <span className="learning-index">01 / ESCRIBE</span>
            <div className="learning-icon code-icon" aria-hidden="true">
              <span>&lt; / &gt;</span>
            </div>
            <h3>Programa a tu manera</h3>
            <p>
              Empieza con Ladder y Structured Text, los lenguajes que se usan
              para resolver problemas reales de automatización.
            </p>
          </article>
          <article className="learning-card">
            <span className="learning-index">02 / EJECUTA</span>
            <div className="learning-icon cycle-icon" aria-hidden="true">
              <span>↻</span>
            </div>
            <h3>Entiende cada scan</h3>
            <p>
              Sigue el recorrido de las entradas, la lógica y las salidas en
              un runtime creado para aprender.
            </p>
          </article>
          <article className="learning-card">
            <span className="learning-index">03 / OBSERVA</span>
            <div className="learning-icon plant-icon" aria-hidden="true">
              <span>⌁</span>
            </div>
            <h3>Conecta con la planta</h3>
            <p>
              Comprueba cómo una decisión en el programa cambia el
              comportamiento de un proceso virtual.
            </p>
          </article>
        </div>
      </section>

      <section className="scan-section" id="ciclo" aria-labelledby="scan-title">
        <div className="scan-heading">
          <div>
            <p className="eyebrow">EL CORAZÓN DE UN PLC</p>
            <h2 id="scan-title">Un ciclo. Tres pasos. Todo conectado.</h2>
          </div>
          <p>
            El scan se repite continuamente. Entender su orden es entender cómo
            el programa percibe y controla el mundo.
          </p>
        </div>
        <div className="scan-steps">
          {scanSteps.map((step) => (
            <article className="scan-step" key={step.number}>
              <div className="step-topline">
                <span>{step.number}</span>
                <span className="step-symbol" aria-hidden="true">
                  {step.symbol}
                </span>
              </div>
              <h3>{step.name}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
        <div className="scan-loop">
          <span className="loop-indicator" aria-hidden="true">
            ↻
          </span>
          El ciclo vuelve a empezar
          <span className="loop-line" aria-hidden="true" />
        </div>
      </section>

      <section className="module-section" id="ruta" aria-labelledby="module-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">HOJA DE RUTA TÉCNICA</p>
            <h2 id="module-title">Construyendo las bases</h2>
          </div>
          <span className="module-count">01 <span>/</span> 03</span>
        </div>
        <div className="module-list">
          {plannedModules.map((module) => (
            <article className="module-card" key={module.number}>
              <span className="module-number">{module.number}</span>
              <div className="module-copy">
                <h3>{module.name}</h3>
                <p>{module.detail}</p>
              </div>
              <span className={`module-status is-${module.state}`}>
                <span aria-hidden="true" />
                {module.status}
              </span>
              <span className="module-arrow" aria-hidden="true">
                ↗
              </span>
            </article>
          ))}
        </div>
        <p className="roadmap-note">
          Estamos construyendo los módulos en este orden para que cada pieza se
          apoye en la anterior.
        </p>
      </section>

      <footer className="footer">
        <a className="footer-brand" href="#inicio">
          <span className="wordmark-icon" aria-hidden="true">
            P
          </span>
          PLC Academy
        </a>
        <span>Aprender haciendo.</span>
        <a className="back-to-top" href="#inicio">
          Volver arriba <span aria-hidden="true">↑</span>
        </a>
      </footer>
    </main>
  );
}
