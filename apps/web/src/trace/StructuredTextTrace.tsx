import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

function renderLine(line: string, startsInComment: boolean) {
  const parts: ReactNode[] = [];
  let inBlockComment = startsInComment;
  let offset = 0;

  while (offset < line.length) {
    if (inBlockComment || line.startsWith("(*", offset)) {
      const start = offset;
      if (!inBlockComment) offset += 2;
      const end = line.indexOf("*)", offset);
      if (end === -1) {
        parts.push(<span className="st-token-comment" key={parts.length}>{line.slice(start)}</span>);
        inBlockComment = true;
        break;
      }
      offset = end + 2;
      parts.push(<span className="st-token-comment" key={parts.length}>{line.slice(start, offset)}</span>);
      inBlockComment = false;
      continue;
    }
    if (line.startsWith("//", offset)) {
      parts.push(<span className="st-token-comment" key={parts.length}>{line.slice(offset)}</span>);
      break;
    }
    const token = /^(?:(?:VAR_INPUT|VAR_OUTPUT|END_VAR|VAR|BOOL|AND|OR|NOT|TRUE|FALSE)\b|:=|[():;]|[A-Za-z_]\w*)/i.exec(line.slice(offset))?.[0];
    if (!token) {
      parts.push(line[offset]);
      offset += 1;
      continue;
    }
    const keyword = /^(VAR_INPUT|VAR_OUTPUT|END_VAR|VAR|BOOL)$/i.test(token);
    const boolean = /^(TRUE|FALSE)$/i.test(token);
    const operator = /^(AND|OR|NOT|:=$)/i.test(token);
    const punctuation = /^[():;]$/.test(token);
    const className = keyword
      ? "st-token-keyword"
      : boolean
        ? "st-token-boolean"
        : operator
          ? "st-token-operator"
          : punctuation
            ? "st-token-punctuation"
            : "st-token-identifier";
    parts.push(<span className={className} key={parts.length}>{token}</span>);
    offset += token.length;
  }
  return { content: parts.length ? parts : [" "], inBlockComment };
}

function highlight(source: string) {
  let inBlockComment = false;
  return source.split("\n").map((line) => {
    const rendered = renderLine(line, inBlockComment);
    inBlockComment = rendered.inBlockComment;
    return rendered.content;
  });
}

export function StructuredTextTrace({
  source,
  activeLine,
}: {
  source: string;
  activeLine: number | null;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const renderedLines = highlight(source);
  const lines = source.split("\n");

  useEffect(() => {
    if (activeLine === null || !panelRef.current) return;
    const panel = panelRef.current;
    const element = panel.children.item(activeLine);
    if (!(element instanceof HTMLElement)) return;
    const top = element.offsetTop;
    const bottom = top + element.offsetHeight;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = bottom - panel.clientHeight;
    }
  }, [activeLine]);

  return (
    <div className="st-code" aria-label="Programa en ejecución" ref={panelRef}>
      {lines.map((line, index) => (
        <div
          className={`st-code-line${activeLine === index ? " is-active" : ""}`}
          key={`${index}-${line}`}
          aria-current={activeLine === index ? "step" : undefined}
        >
          <span className="st-line-number">{index + 1}</span>
          <code>{renderedLines[index]}</code>
        </div>
      ))}
    </div>
  );
}
