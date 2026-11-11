"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { ComponentProps, CSSProperties, HTMLAttributes } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BundledLanguage,
  BundledTheme,
  HighlighterGeneric,
  ThemedToken,
} from "shiki";
import {
  bundledLanguages,
  bundledLanguagesAlias,
  createHighlighter,
} from "shiki";

// Shiki uses bitflags for font styles: 1=italic, 2=bold, 4=underline
// oxlint-disable-next-line eslint(no-bitwise)
const isItalic = (fontStyle: number | undefined) => fontStyle && fontStyle & 1;
// oxlint-disable-next-line eslint(no-bitwise)
const isBold = (fontStyle: number | undefined) => fontStyle && fontStyle & 2;
const isUnderline = (fontStyle: number | undefined) =>
  // oxlint-disable-next-line eslint(no-bitwise)
  fontStyle && fontStyle & 4;

// Transform tokens to include pre-computed keys to avoid noArrayIndexKey lint
interface KeyedToken {
  token: ThemedToken;
  key: string;
}
interface KeyedLine {
  tokens: KeyedToken[];
  key: string;
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
  lines.map((line, lineIdx) => ({
    key: `line-${lineIdx}`,
    tokens: line.map((token, tokenIdx) => ({
      key: `line-${lineIdx}-${tokenIdx}`,
      token,
    })),
  }));

// Token rendering component
const TokenSpan = ({ token }: { token: ThemedToken }) => (
  <span
    className="dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
    style={
      {
        backgroundColor: token.bgColor,
        color: token.color,
        fontStyle: isItalic(token.fontStyle) ? "italic" : undefined,
        fontWeight: isBold(token.fontStyle) ? "bold" : undefined,
        textDecoration: isUnderline(token.fontStyle) ? "underline" : undefined,
        ...token.htmlStyle,
      } as CSSProperties
    }
  >
    {token.content}
  </span>
);

// Line number styles using CSS counters
const LINE_NUMBER_CLASSES = cn(
  "block",
  "before:content-[counter(line)]",
  "before:inline-block",
  "before:[counter-increment:line]",
  "before:w-8",
  "before:mr-4",
  "before:text-right",
  "before:text-muted-foreground/50",
  "before:font-mono",
  "before:select-none"
);

// Line rendering component
const LineSpan = ({
  keyedLine,
  showLineNumbers,
}: {
  keyedLine: KeyedLine;
  showLineNumbers: boolean;
}) => (
  <span className={showLineNumbers ? LINE_NUMBER_CLASSES : "block"}>
    {keyedLine.tokens.length === 0
      ? "\n"
      : keyedLine.tokens.map(({ token, key }) => (
          <TokenSpan key={key} token={token} />
        ))}
  </span>
);

// Types
type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
};

interface TokenizedCode {
  tokens: ThemedToken[][];
  fg: string;
  bg: string;
}

interface CodeBlockContextType {
  code: string;
}

// Context
const CodeBlockContext = createContext<CodeBlockContextType>({
  code: "",
});

// Shared singleton highlighter & incremental language state
let sharedHighlighter: HighlighterGeneric<BundledLanguage, BundledTheme> | null =
  null;
let highlighterInitPromise: Promise<
  HighlighterGeneric<BundledLanguage, BundledTheme>
> | null = null;
const loadedLanguages = new Set<string>();
const failedLanguages = new Set<string>();
const languageLoadPromises = new Map<string, Promise<void>>();

// Bounded LRU token cache with exact-string collision guard
interface TokensCacheEntry {
  code: string;
  tokenized: TokenizedCode;
}
const MAX_TOKENS_CACHE_SIZE = 200;
const tokensCache = new Map<string, TokensCacheEntry>();

// Subscribers for async token updates (used by highlightCode callback API)
const subscribers = new Map<string, Set<(result: TokenizedCode) => void>>();

const LANGUAGE_ALIASES: Record<string, BundledLanguage | "text"> = {
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  py: "python",
  python: "python",
  sh: "bash",
  bash: "bash",
  shell: "bash",
  zsh: "bash",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  jsonc: "jsonc",
  xml: "xml",
  sql: "sql",
  md: "markdown",
  markdown: "markdown",
  yaml: "yaml",
  yml: "yaml",
  rust: "rust",
  rs: "rust",
  go: "go",
  golang: "go",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cs: "csharp",
  csharp: "csharp",
  "c#": "csharp",
  java: "java",
  php: "php",
  ruby: "ruby",
  rb: "ruby",
  swift: "swift",
  kotlin: "kotlin",
  kt: "kotlin",
  diff: "diff",
  dockerfile: "dockerfile",
  docker: "dockerfile",
  powershell: "powershell",
  ps1: "powershell",
  wasm: "wasm",
  toml: "toml",
  graphql: "graphql",
  text: "text",
  txt: "text",
  plaintext: "text",
  plain: "text",
};

export const normalizeLanguage = (rawLang?: string): BundledLanguage => {
  if (!rawLang || typeof rawLang !== "string") return "text" as BundledLanguage;
  const clean = rawLang.trim().toLowerCase();
  if (!clean) return "text" as BundledLanguage;
  const aliased = LANGUAGE_ALIASES[clean];
  if (aliased) {
    return aliased as BundledLanguage;
  }
  if (
    Object.hasOwn(bundledLanguages, clean) ||
    Object.hasOwn(bundledLanguagesAlias, clean)
  ) {
    return clean as BundledLanguage;
  }
  return "text" as BundledLanguage;
};

const hashCodeString = (str: string): string => {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
};

const getTokensCacheKey = (code: string, language: BundledLanguage) => {
  const safeLang = normalizeLanguage(language);
  return `${safeLang}:${code.length}:${hashCodeString(code)}`;
};

const getCachedTokens = (
  code: string,
  cacheKey: string
): TokenizedCode | null => {
  const entry = tokensCache.get(cacheKey);
  if (!entry || entry.code !== code) {
    return null;
  }
  // Refresh LRU order
  tokensCache.delete(cacheKey);
  tokensCache.set(cacheKey, entry);
  return entry.tokenized;
};

const setCachedTokens = (
  code: string,
  cacheKey: string,
  tokenized: TokenizedCode
): void => {
  tokensCache.delete(cacheKey);
  if (tokensCache.size >= MAX_TOKENS_CACHE_SIZE) {
    const oldestKey = tokensCache.keys().next().value;
    if (oldestKey !== undefined) {
      tokensCache.delete(oldestKey);
    }
  }
  tokensCache.set(cacheKey, { code, tokenized });
};

const getSharedHighlighter = (): Promise<
  HighlighterGeneric<BundledLanguage, BundledTheme>
> => {
  if (sharedHighlighter) {
    return Promise.resolve(sharedHighlighter);
  }
  if (!highlighterInitPromise) {
    highlighterInitPromise = createHighlighter({
      langs: [],
      themes: ["github-light", "github-dark"],
    })
      .then((highlighter) => {
        sharedHighlighter = highlighter;
        for (const lang of highlighter.getLoadedLanguages()) {
          loadedLanguages.add(lang);
        }
        return highlighter;
      })
      .catch((error) => {
        highlighterInitPromise = null;
        throw error;
      });
  }
  return highlighterInitPromise;
};

const isLanguageReadySync = (safeLang: BundledLanguage): boolean => {
  if ((safeLang as string) === "text") return true;
  if (failedLanguages.has(safeLang)) return true;
  if (!sharedHighlighter) return false;
  return (
    loadedLanguages.has(safeLang) ||
    sharedHighlighter.getLoadedLanguages().includes(safeLang)
  );
};

const ensureLanguageLoaded = (safeLang: BundledLanguage): Promise<void> => {
  if (isLanguageReadySync(safeLang)) {
    return Promise.resolve();
  }
  const existing = languageLoadPromises.get(safeLang);
  if (existing) {
    return existing;
  }

  const loadPromise = getSharedHighlighter()
    .then(async (highlighter) => {
      if ((safeLang as string) === "text") {
        return;
      }
      if (!highlighter.getLoadedLanguages().includes(safeLang)) {
        try {
          await highlighter.loadLanguage(safeLang);
        } catch (error) {
          console.error(`Failed to load shiki language "${safeLang}":`, error);
          failedLanguages.add(safeLang);
          return;
        }
      }
      loadedLanguages.add(safeLang);
      for (const lang of highlighter.getLoadedLanguages()) {
        loadedLanguages.add(lang);
      }
    })
    .finally(() => {
      languageLoadPromises.delete(safeLang);
    });

  languageLoadPromises.set(safeLang, loadPromise);
  return loadPromise;
};

// Create raw tokens for immediate display while highlighting loads
const createRawTokens = (code: string): TokenizedCode => ({
  bg: "transparent",
  fg: "inherit",
  tokens: code.split("\n").map((line) =>
    line === ""
      ? []
      : [
          {
            color: "inherit",
            content: line,
          } as ThemedToken,
        ]
  ),
});

const tokenizeWithHighlighterSync = (
  code: string,
  safeLang: BundledLanguage
): TokenizedCode | null => {
  const tokensCacheKey = getTokensCacheKey(code, safeLang);
  const cached = getCachedTokens(code, tokensCacheKey);
  if (cached) {
    return cached;
  }

  if ((safeLang as string) === "text" || failedLanguages.has(safeLang)) {
    const raw = createRawTokens(code);
    setCachedTokens(code, tokensCacheKey, raw);
    return raw;
  }

  if (!sharedHighlighter || !isLanguageReadySync(safeLang)) {
    return null;
  }

  const availableLangs = sharedHighlighter.getLoadedLanguages();
  const langToUse = availableLangs.includes(safeLang) ? safeLang : "text";
  const result = sharedHighlighter.codeToTokens(code, {
    lang: langToUse,
    themes: {
      dark: "github-dark",
      light: "github-light",
    },
  });

  const tokenized: TokenizedCode = {
    bg: result.bg ?? "transparent",
    fg: result.fg ?? "inherit",
    tokens: result.tokens,
  };
  setCachedTokens(code, tokensCacheKey, tokenized);
  return tokenized;
};

// Synchronous highlight with callback for async results
export const highlightCode = (
  code: string,
  language: BundledLanguage,
  // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-callbacks)
  callback?: (result: TokenizedCode) => void
): TokenizedCode | null => {
  const safeLang = normalizeLanguage(language);

  // Return cached / synchronously highlighted result if language is ready
  const syncResult = tokenizeWithHighlighterSync(code, safeLang);
  if (syncResult) {
    return syncResult;
  }

  const tokensCacheKey = getTokensCacheKey(code, safeLang);

  // Subscribe callback if provided
  if (callback) {
    if (!subscribers.has(tokensCacheKey)) {
      subscribers.set(tokensCacheKey, new Set());
    }
    subscribers.get(tokensCacheKey)?.add(callback);
  }

  // Load language grammar into the shared highlighter once, then notify subscribers
  void ensureLanguageLoaded(safeLang)
    // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then)
    .then(() => {
      const tokenized =
        tokenizeWithHighlighterSync(code, safeLang) ?? createRawTokens(code);

      const subs = subscribers.get(tokensCacheKey);
      if (subs) {
        subscribers.delete(tokensCacheKey);
        for (const sub of subs) {
          sub(tokenized);
        }
      }
    })
    // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then), eslint-plugin-promise(prefer-await-to-callbacks)
    .catch((error) => {
      console.error("Failed to highlight code:", error);
      subscribers.delete(tokensCacheKey);
    });

  return null;
};

const CodeBlockBody = memo(
  ({
    tokenized,
    showLineNumbers,
    className,
  }: {
    tokenized: TokenizedCode;
    showLineNumbers: boolean;
    className?: string;
  }) => {
    const keyedLines = useMemo(
      () => addKeysToTokens(tokenized.tokens),
      [tokenized.tokens]
    );

    return (
      <pre
        className={cn(
          "m-0 overflow-x-auto p-4 font-mono text-[13px] leading-relaxed bg-transparent text-zinc-800 dark:text-zinc-200",
          className
        )}
      >
        <code
          className={cn(
            "font-mono text-[13px]",
            showLineNumbers && "[counter-increment:line_0] [counter-reset:line]"
          )}
        >
          {keyedLines.map((keyedLine) => (
            <LineSpan
              key={keyedLine.key}
              keyedLine={keyedLine}
              showLineNumbers={showLineNumbers}
            />
          ))}
        </code>
      </pre>
    );
  },
  (prevProps, nextProps) =>
    prevProps.tokenized === nextProps.tokenized &&
    prevProps.showLineNumbers === nextProps.showLineNumbers &&
    prevProps.className === nextProps.className
);

CodeBlockBody.displayName = "CodeBlockBody";

export const CodeBlockContainer = ({
  className,
  language,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { language: string }) => (
  <div
    className={cn(
      "group relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-xs dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 transition-colors",
      className
    )}
    data-language={language}
    style={{
      containIntrinsicSize: "auto 200px",
      contentVisibility: "auto",
      ...style,
    }}
    {...props}
  />
);

export const CodeBlockHeader = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-between border-b border-zinc-200/80 bg-zinc-100/70 px-3.5 py-1.5 text-zinc-600 dark:border-zinc-800/80 dark:bg-zinc-900/90 dark:text-zinc-400 text-xs select-none",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const CodeBlockTitle = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center gap-2", className)} {...props}>
    {children}
  </div>
);

export const CodeBlockFilename = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("font-mono", className)} {...props}>
    {children}
  </span>
);

export const CodeBlockActions = ({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("-my-1 -mr-1 flex items-center gap-2", className)}
    {...props}
  >
    {children}
  </div>
);

export const CodeBlockContent = ({
  code,
  language,
  showLineNumbers = false,
}: {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
}) => {
  const safeLang = useMemo(() => normalizeLanguage(language), [language]);

  // Pure synchronous highlighting whenever cache hits or shared Shiki grammar is loaded
  const syncTokens = useMemo(
    () => tokenizeWithHighlighterSync(code, safeLang),
    [code, safeLang]
  );

  // Async highlighting result keyed to (code, safeLang) so stale results never apply
  const [asyncResult, setAsyncResult] = useState<{
    code: string;
    safeLang: BundledLanguage;
    tokenized: TokenizedCode;
  } | null>(null);

  useEffect(() => {
    if (syncTokens) {
      return;
    }

    let cancelled = false;

    void ensureLanguageLoaded(safeLang)
      // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then)
      .then(() => {
        if (cancelled) {
          return;
        }
        const tokenized =
          tokenizeWithHighlighterSync(code, safeLang) ?? createRawTokens(code);
        setAsyncResult({ code, safeLang, tokenized });
      })
      // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then)
      .catch((error) => {
        console.error("Failed to highlight code:", error);
        if (!cancelled) {
          setAsyncResult({ code, safeLang, tokenized: createRawTokens(code) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, safeLang, syncTokens]);

  const matchedAsyncTokens =
    asyncResult &&
    asyncResult.code === code &&
    asyncResult.safeLang === safeLang
      ? asyncResult.tokenized
      : null;

  const tokenized = useMemo(
    () => syncTokens ?? matchedAsyncTokens ?? createRawTokens(code),
    [code, syncTokens, matchedAsyncTokens]
  );

  return (
    <div className="relative overflow-auto">
      <CodeBlockBody showLineNumbers={showLineNumbers} tokenized={tokenized} />
    </div>
  );
};

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const contextValue = useMemo(() => ({ code }), [code]);

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <CodeBlockContainer className={className} language={language} {...props}>
        {children}
        <CodeBlockContent
          code={code}
          language={language}
          showLineNumbers={showLineNumbers}
        />
      </CodeBlockContainer>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      if (!isCopied) {
        await navigator.clipboard.writeText(code);
        setIsCopied(true);
        onCopy?.();
        timeoutRef.current = window.setTimeout(
          () => setIsCopied(false),
          timeout
        );
      }
    } catch (error) {
      onError?.(error as Error);
    }
  }, [code, onCopy, onError, timeout, isCopied]);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    []
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn(
        "size-7 shrink-0 rounded-md text-zinc-500 hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white transition-colors cursor-pointer",
        className
      )}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? (
        <Icon
          size={14}
          className={isCopied ? "text-emerald-600 dark:text-emerald-400" : ""}
        />
      )}
    </Button>
  );
};

export type CodeBlockLanguageSelectorProps = ComponentProps<typeof Select>;

export const CodeBlockLanguageSelector = (
  props: CodeBlockLanguageSelectorProps
) => <Select {...props} />;

export type CodeBlockLanguageSelectorTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

export const CodeBlockLanguageSelectorTrigger = ({
  className,
  ...props
}: CodeBlockLanguageSelectorTriggerProps) => (
  <SelectTrigger
    className={cn(
      "h-7 border-none bg-transparent px-2 text-xs shadow-none",
      className
    )}
    size="sm"
    {...props}
  />
);

export type CodeBlockLanguageSelectorValueProps = ComponentProps<
  typeof SelectValue
>;

export const CodeBlockLanguageSelectorValue = (
  props: CodeBlockLanguageSelectorValueProps
) => <SelectValue {...props} />;

export type CodeBlockLanguageSelectorContentProps = ComponentProps<
  typeof SelectContent
>;

export const CodeBlockLanguageSelectorContent = ({
  align = "end",
  ...props
}: CodeBlockLanguageSelectorContentProps) => (
  <SelectContent align={align} {...props} />
);

export type CodeBlockLanguageSelectorItemProps = ComponentProps<
  typeof SelectItem
>;

export const CodeBlockLanguageSelectorItem = (
  props: CodeBlockLanguageSelectorItemProps
) => <SelectItem {...props} />;
