import { describe, expect, it } from "vitest";
import { sanitizeSvg, sanitizeSvgForProxy } from "./sanitize-svg";

describe("sanitizeSvg", () => {
  describe("script tag stripping", () => {
    it("removes script tags and their content", () => {
      const input = "<svg><script>alert(1)</script><rect/></svg>";
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<script");
      expect(result).not.toContain("alert(1)");
    });

    it("removes script tags with src attribute", () => {
      const input = '<svg><script src="https://evil.com/bad.js"></script><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<script");
      expect(result).not.toContain("evil.com");
    });

    it("removes self-closing script tags", () => {
      // HTML/SVG parsers don't support self-closing <script/> -- the content
      // up to </script> or end of parent becomes the script body. DOMPurify
      // removes the script element; orphaned text nodes remain as harmless
      // visible text (not executable code) in the SVG.
      const input = "<svg><script/>alert(1)</script><rect/></svg>";
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<script");
    });
  });

  describe("event handler removal", () => {
    it("removes onclick event handler", () => {
      const input = '<svg><rect onclick="alert(1)"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("alert(1)");
    });

    it("removes onload event handler", () => {
      const input = '<svg onload="evil()"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("onload");
      expect(result).not.toContain("evil()");
    });

    it("removes onerror event handler", () => {
      const input = '<svg><image onerror="stealData()" href="x.png"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("stealData");
    });

    it("removes onmouseover event handler", () => {
      const input = '<svg><rect onmouseover="doEvil()"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("onmouseover");
    });
  });

  describe("XML declaration stripping", () => {
    it("removes XML declaration before SVG", () => {
      const input = '<?xml version="1.0" encoding="UTF-8"?><svg><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<?xml");
      expect(result).not.toContain("?>");
    });

    it("removes XML declaration with leading whitespace", () => {
      const input = '  <?xml version="1.0"?>  <svg><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<?xml");
    });

    it("handles SVG without XML declaration normally", () => {
      const input = '<svg><rect fill="blue"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<?xml");
      expect(result).toContain("rect");
    });
  });

  describe("viewBox injection from width/height", () => {
    it("injects viewBox when width and height are present but viewBox is absent", () => {
      const input = '<svg width="100" height="100"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain('viewBox="0 0 100 100"');
    });

    it("injects viewBox with decimal dimensions", () => {
      const input = '<svg width="48.5" height="48.5"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain('viewBox="0 0 48.5 48.5"');
    });

    it("does not inject viewBox when width is missing", () => {
      const input = '<svg height="100"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("viewBox");
    });

    it("does not inject viewBox when height is missing", () => {
      const input = '<svg width="100"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("viewBox");
    });
  });

  describe("viewBox preservation", () => {
    it("preserves existing viewBox and does not override it with width/height", () => {
      const input = '<svg viewBox="0 0 50 50" width="100" height="100"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain('viewBox="0 0 50 50"');
      // Should not have a second viewBox injected
      expect((result.match(/viewBox/gi) ?? []).length).toBe(1);
    });

    it("preserves viewBox with different origin", () => {
      const input = '<svg viewBox="10 20 80 80"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain('viewBox="10 20 80 80"');
    });
  });

  describe("baseProfile removal", () => {
    it("removes baseProfile with double quotes", () => {
      const input = '<svg baseProfile="tiny"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("baseProfile");
    });

    it("removes baseProfile with single quotes", () => {
      const input = "<svg baseProfile='tiny-ps'><rect/></svg>";
      const result = sanitizeSvg(input);
      expect(result).not.toContain("baseProfile");
    });

    it("removes baseProfile=full", () => {
      const input = '<svg baseProfile="full" viewBox="0 0 100 100"><rect/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("baseProfile");
    });
  });

  describe("HTML comment removal", () => {
    it("removes HTML comments", () => {
      const input = "<svg><!-- this is a comment --><rect/></svg>";
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<!--");
      expect(result).not.toContain("-->");
      expect(result).not.toContain("this is a comment");
    });

    it("removes multiline HTML comments", () => {
      const input = "<svg><!--\n  multiline\n  comment\n--><rect/></svg>";
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<!--");
      expect(result).not.toContain("multiline");
    });
  });

  describe("allowed tags pass through", () => {
    it("preserves rect elements", () => {
      const input = '<svg><rect fill="red"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain("rect");
    });

    it("preserves circle elements", () => {
      const input = '<svg><circle cx="50" cy="50" r="40"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain("circle");
    });

    it("preserves path elements", () => {
      const input = '<svg><path d="M10 10 L90 90"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain("path");
    });

    it("preserves g elements", () => {
      const input = '<svg><g id="group"><rect/></g></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain("<g");
    });

    it("preserves linearGradient elements", () => {
      const input =
        '<svg><defs><linearGradient id="grad"><stop offset="0%" stop-color="red"/></linearGradient></defs></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain("linearGradient");
      expect(result).toContain("stop");
    });

    it("preserves text elements", () => {
      const input = '<svg><text x="10" y="20">Hello</text></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain("text");
      expect(result).toContain("Hello");
    });

    it("preserves title and desc elements", () => {
      const input = "<svg><title>My Logo</title><desc>Description</desc><rect/></svg>";
      const result = sanitizeSvg(input);
      expect(result).toContain("title");
      expect(result).toContain("My Logo");
      expect(result).toContain("desc");
    });

    it("preserves fill attribute on rect", () => {
      const input = '<svg><rect fill="blue"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain('fill="blue"');
    });

    it("preserves transform attribute", () => {
      const input = '<svg><g transform="translate(10, 10)"><rect/></g></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain("transform");
    });
  });

  describe("disallowed tags removed", () => {
    it("removes foreignObject elements", () => {
      const input = "<svg><foreignObject><div>html content</div></foreignObject></svg>";
      const result = sanitizeSvg(input);
      expect(result).not.toContain("foreignObject");
      expect(result).not.toContain("html content");
    });

    it("removes iframe elements", () => {
      const input = '<svg><iframe src="https://evil.com"></iframe></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("iframe");
    });

    it("removes use elements with external href (javascript: URI)", () => {
      const input = '<svg><use href="javascript:alert(1)"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("javascript:");
    });

    it("removes animate elements", () => {
      const input = '<svg><rect/><animate attributeName="x" from="0" to="100"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).toContain("rect");
      // DOMPurify strips animate since it's not in ALLOWED_TAGS
      expect(result).not.toContain("animate");
    });

    it("strips xlink:href with javascript: URI", () => {
      const input = '<svg><use xlink:href="javascript:alert(1)"/></svg>';
      const result = sanitizeSvg(input);
      expect(result).not.toContain("javascript:");
    });
  });

  describe("output validity", () => {
    it("returns a non-empty string for valid SVG input", () => {
      const input = '<svg viewBox="0 0 100 100"><rect fill="red" width="100" height="100"/></svg>';
      const result = sanitizeSvg(input);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns a string (possibly empty) for empty input", () => {
      const result = sanitizeSvg("");
      expect(typeof result).toBe("string");
    });

    it("handles complex SVG with multiple elements", () => {
      const input = `
        <?xml version="1.0" encoding="UTF-8"?>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
          <title>Brand Logo</title>
          <desc>Company brand mark</desc>
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#ff0000"/>
              <stop offset="100%" stop-color="#0000ff"/>
            </linearGradient>
          </defs>
          <rect width="200" height="200" fill="url(#bg)"/>
          <circle cx="100" cy="100" r="50" fill="white"/>
          <script>alert("xss")</script>
        </svg>
      `;
      const result = sanitizeSvg(input);
      expect(result).not.toContain("<?xml");
      expect(result).not.toContain("<script");
      expect(result).not.toContain("alert");
      expect(result).toContain("linearGradient");
      expect(result).toContain("circle");
      expect(result).toContain("rect");
    });
  });
});

describe("sanitizeSvgForProxy", () => {
  it("strips script tags", () => {
    const input = "<svg><script>alert(1)</script><rect/></svg>";
    const result = sanitizeSvgForProxy(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("rect");
  });

  it("strips self-closing script tags", () => {
    // Self-closing <script/> followed by a closing </script> is handled
    // by the HTML parser and DOMPurify strips the element entirely.
    const input = "<svg><script/>alert(1)</script><rect/></svg>";
    const result = sanitizeSvgForProxy(input);
    expect(result).not.toContain("<script");
  });

  it("strips animate elements that could trigger JS", () => {
    const input = '<svg><animate onbegin="alert(1)"/><rect/></svg>';
    const result = sanitizeSvgForProxy(input);
    expect(result).not.toContain("animate");
    expect(result).not.toContain("alert");
  });

  it("strips xlink:href with javascript: URI", () => {
    const input = '<svg><use xlink:href="javascript:alert(1)"/></svg>';
    const result = sanitizeSvgForProxy(input);
    expect(result).not.toContain("javascript:");
  });

  it("strips foreignObject elements", () => {
    const input = "<svg><foreignObject><body><script>evil()</script></body></foreignObject><rect/></svg>";
    const result = sanitizeSvgForProxy(input);
    expect(result).not.toContain("foreignObject");
    expect(result).not.toContain("evil");
  });

  it("strips event handlers", () => {
    const input = '<svg onload="evil()"><rect onclick="steal()"/></svg>';
    const result = sanitizeSvgForProxy(input);
    expect(result).not.toContain("onload");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("evil");
    expect(result).not.toContain("steal");
  });

  it("preserves valid SVG content", () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="blue" width="100" height="100"/></svg>';
    const result = sanitizeSvgForProxy(input);
    expect(result).toContain("rect");
    expect(result).toContain('fill="blue"');
  });
});
