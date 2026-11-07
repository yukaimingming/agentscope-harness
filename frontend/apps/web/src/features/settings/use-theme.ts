import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
export type ThemeMode = "system" | "dark" | "light";

const THEME_STORAGE_KEY = "deepagent_theme_mode";

function getSystemTheme(): Theme {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

/**
 * 外观主题 Hook：支持「系统默认 / 浅色 / 深色」三模式（对齐 Maf 参考实现）。
 *
 * - themeMode：用户选择的模式，持久化到 localStorage；
 * - theme：当前实际生效主题，mode 为 system 时跟随操作系统 prefers-color-scheme 实时变化。
 */
export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") {
        return saved;
      }
    } catch {
      // 忽略
    }
    return "dark";
  });

  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);

  // 监听操作系统主题变化，system 模式下实时跟随
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "light" : "dark");
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const theme: Theme = themeMode === "system" ? systemTheme : themeMode;

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // 忽略
    }
  }, [themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "dark");
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeModeState(next);
  }, []);

  const setThemeMode = useCallback((next: ThemeMode) => {
    setThemeModeState(next);
  }, []);

  return { theme, setTheme, themeMode, setThemeMode };
}
