import { useCallback, useEffect, useState } from "react";

/**
 * Computer Use（电脑桌面自动化）启用开关 Hook。
 *
 * - 默认关闭：后端查询失败或接口不可用时降级保持关闭，绝不默认放开桌面操作；
 * - 打开设置面板时向后端 /api/settings/computer-use 同步真实状态（后端持久化于 .data/settings.json）；
 * - 切换采用乐观更新，PUT 失败时回滚并返回 false 供调用方提示。
 */
export function useComputerUseSettings() {
  const [computerUseEnabled, setComputerUseEnabled] = useState<boolean>(false);

  // 挂载时向后端同步真实开关状态；失败则保持默认关闭（降级行为）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/settings/computer-use");
        if (!response.ok) return;
        const payload = (await response.json()) as { enabled?: boolean };
        if (!cancelled && typeof payload.enabled === "boolean") {
          setComputerUseEnabled(payload.enabled);
        }
      } catch {
        // 后端不可用：保持默认关闭
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleComputerUseEnabledChange = useCallback(async (enabled: boolean) => {
    const previous = computerUseEnabled;
    setComputerUseEnabled(enabled);
    try {
      const response = await fetch("/api/settings/computer-use", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        setComputerUseEnabled(previous);
        return false;
      }
      return true;
    } catch {
      setComputerUseEnabled(previous);
      return false;
    }
  }, [computerUseEnabled]);

  return { computerUseEnabled, onComputerUseEnabledChange: handleComputerUseEnabledChange };
}
