import { describe, expect, it } from "vitest";
import { structuredTextContext, toggleLineComments } from "./textUtils";

describe("structuredTextContext", () => {
  it("tracks comments and parentheses before the cursor", () => {
    expect(structuredTextContext("foo(bar) (* note", 16)).toEqual({
      inComment: true,
      inBlockComment: true,
      inLineComment: false,
      parenthesisDepth: 0,
    });
    expect(structuredTextContext("foo( // note\n", 10)).toEqual({
      inComment: true,
      inBlockComment: false,
      inLineComment: true,
      parenthesisDepth: 1,
    });
  });

  it("ends line comments at a newline", () => {
    expect(structuredTextContext("// note\nvalue", 8)).toEqual({
      inComment: false,
      inBlockComment: false,
      inLineComment: false,
      parenthesisDepth: 0,
    });
  });
});

describe("toggleLineComments", () => {
  it("comments selected lines and preserves the selected text", () => {
    const source = "  Motor := TRUE;\n  Start := FALSE;";
    const result = toggleLineComments(source, 2, source.length);

    expect(result.source).toBe("  // Motor := TRUE;\n  // Start := FALSE;");
    expect(result.source.slice(result.selectionStart, result.selectionEnd)).toBe(
      "Motor := TRUE;\n  // Start := FALSE;",
    );
  });

  it("uncomments lines when every non-empty line is commented", () => {
    const source = "  // Motor := TRUE;\n  // Start := FALSE;";
    const result = toggleLineComments(source, 0, source.length);

    expect(result.source).toBe("  Motor := TRUE;\n  Start := FALSE;");
  });
});
