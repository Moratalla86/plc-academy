export function structuredTextContext(source: string, position: number) {
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

    if (source.startsWith("(*", offset) && offset + 2 <= position) {
      inBlockComment = true;
      offset += 2;
    } else if (source.startsWith("//", offset) && offset + 2 <= position) {
      inLineComment = true;
      offset += 2;
    } else {
      if (source[offset] === "(") parenthesisDepth += 1;
      if (source[offset] === ")") {
        parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      }
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

export function toggleLineComments(
  source: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const firstLineStart = source.lastIndexOf("\n", selectionStart - 1) + 1;
  const selectedEnd =
    selectionEnd > selectionStart && source[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const nextLineBreak = source.indexOf("\n", selectedEnd);
  const lastLineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  const lines = source.slice(firstLineStart, lastLineEnd).split("\n");
  const indentation = lines.map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
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
  const updatedSource = `${source.slice(0, firstLineStart)}${updatedLines.join("\n")}${source.slice(lastLineEnd)}`;
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

  return {
    source: updatedSource,
    selectionStart: mapPosition(selectionStart),
    selectionEnd: mapPosition(selectionEnd),
  };
}
