/**
 * @vitest-environment jsdom
 */
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodeBlock,
  highlightCode,
  normalizeLanguage,
} from "../src/components/ai-elements/code-block.js";
import { MessageResponse } from "../src/components/ai-elements/message.js";

// Inform React 19 test environment that act() is supported
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const waitForColoredTokens = async (
  container: HTMLElement,
  timeoutMs = 5000
): Promise<HTMLSpanElement[]> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const colored = Array.from(
      container.querySelectorAll("pre code span[style]")
    ).filter((el): el is HTMLSpanElement => {
      if (!(el instanceof HTMLElement)) return false;
      const color = el.style.color;
      return Boolean(color && color !== "inherit");
    });
    if (colored.length > 0) {
      return colored;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  return [];
};

describe("CodeBlock 代码块实时语法高亮与流式渲染测试", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  it("normalizeLanguage 支持常用别名与 Shiki 内置语言（vue/svelte/tf 等），未知语言降级为 text", () => {
    expect(normalizeLanguage("ts")).toBe("typescript");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("golang")).toBe("go");
    expect(normalizeLanguage("Shell")).toBe("bash");
    expect(normalizeLanguage("Vue")).toBe("vue");
    expect(normalizeLanguage("svelte")).toBe("svelte");
    expect(normalizeLanguage("terraform")).toBe("terraform");
    expect(normalizeLanguage("tf")).toBe("tf");
    expect(normalizeLanguage("unknown-lang-xyz")).toBe("text");
    expect(normalizeLanguage(undefined)).toBe("text");
  });

  it("复现刚生成无色回归：微任务先写入缓存或首次异步加载后，无需切换对话即刻显示高亮颜色", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    // 1. First render in StrictMode before highlighter/tokens cache is warm for go
    const sampleGo = 'package main\nfunc main() {\n\tprintln("hello")\n}';
    await act(async () => {
      root!.render(
        <StrictMode>
          <CodeBlock code={sampleGo} language="go" />
        </StrictMode>
      );
    });

    const firstColored = await waitForColoredTokens(container);
    expect(firstColored.length).toBeGreaterThan(2);
    expect(
      firstColored.some((el) =>
        Boolean(el.style.getPropertyValue("--shiki-dark"))
      )
    ).toBe(true);

    // 2. Render a brand-new snippet AFTER highlighter is warm (previous microtask race scenario):
    // must highlight synchronously without staying stuck in inherit monochrome!
    const freshGo = 'const answer: number = 42;\nexport default answer;';
    await act(async () => {
      root!.render(
        <StrictMode>
          <CodeBlock code={freshGo} language="typescript" />
        </StrictMode>
      );
    });

    const tsColored = await waitForColoredTokens(container);
    expect(tsColored.length).toBeGreaterThan(2);
    const constToken = tsColored.find((el) => el.textContent === "const");
    expect(constToken).toBeDefined();
    expect(constToken?.style.color).not.toBe("inherit");
    expect(constToken?.style.getPropertyValue("--shiki-dark")).toBeTruthy();
  });

  it("流式逐块生成 Markdown 代码块期间与生成结束瞬间均保持彩色高亮，不闪烁退化为黑白", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    // Warm python via callback first so we can verify zero-flash synchronous streaming
    await new Promise<void>((resolve) => {
      const sync = highlightCode("x = 1", "python", () => resolve());
      if (sync) resolve();
    });

    const chunks = [
      "下面是一段示例代码：\n\n```python\ndef greet(",
      "下面是一段示例代码：\n\n```python\ndef greet(name: str) -> str:\n",
      '下面是一段示例代码：\n\n```python\ndef greet(name: str) -> str:\n    return f"Hello, {name}!"\n```',
    ];

    for (const chunk of chunks) {
      await act(async () => {
        root!.render(
          <StrictMode>
            <MessageResponse mode="static" isAnimating={true}>
              {chunk}
            </MessageResponse>
          </StrictMode>
        );
      });

      // Immediately after synchronous render while streaming, tokens must ALREADY be colored!
      const spans = Array.from(
        container.querySelectorAll("pre code span[style]")
      ).filter(
        (el): el is HTMLSpanElement =>
          el instanceof HTMLElement &&
          Boolean(el.style.color && el.style.color !== "inherit")
      );
      expect(spans.length).toBeGreaterThan(0);
    }

    // Complete streaming (isAnimating=false) — remains colored immediately
    await act(async () => {
      root!.render(
        <StrictMode>
          <MessageResponse mode="static" isAnimating={false}>
            {chunks[chunks.length - 1]!}
          </MessageResponse>
        </StrictMode>
      );
    });

    const finalColored = await waitForColoredTokens(container);
    const defToken = finalColored.find((el) => el.textContent === "def");
    expect(defToken).toBeDefined();
    expect(defToken?.style.color).not.toBe("inherit");
  });

  it("前后 100 字符与总长度相同、仅中间内容不同的代码不发生缓存键冲突", async () => {
    const prefix = "const a = 1; // " + "x".repeat(90);
    const suffix = "// " + "y".repeat(97);
    const middleA = "function innerOne() { return 123; }";
    const middleB = 'const text = "innerTwoValue789012";';
    expect(middleA.length).toBe(middleB.length);
    const codeWithKeyword = `${prefix}\n${middleA}\n${suffix}`;
    const codeWithString = `${prefix}\n${middleB}\n${suffix}`;
    expect(codeWithKeyword.length).toBe(codeWithString.length);

    const first = await new Promise<{ tokens: { content: string; htmlStyle?: Record<string, string> }[][] }>(
      (resolve) => {
        const res = highlightCode(codeWithKeyword, "typescript", (r) =>
          resolve(r)
        );
        if (res) resolve(res);
      }
    );

    const second = highlightCode(codeWithString, "typescript");
    expect(second).not.toBeNull();

    const firstText = first.tokens
      .map((line) => line.map((t) => t.content).join(""))
      .join("\n");
    const secondText = second!.tokens
      .map((line) => line.map((t) => t.content).join(""))
      .join("\n");

    expect(firstText).toContain("function innerOne");
    expect(secondText).toContain("innerTwoValue7890");
    expect(firstText).not.toBe(secondText);
  });
});
