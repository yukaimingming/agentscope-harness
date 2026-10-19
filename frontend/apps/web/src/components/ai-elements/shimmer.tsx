"use client";

/**
 * 官方 shadcn/ui 与 AI SDK Elements Shimmer 文字特效实现。
 * 参考：https://ui.shadcn.com/docs/utils/shimmer
 *
 * 核心特性：
 * 1. 采用 shadcn 官方提供的 CSS shimmer 规范与 @keyframes tw-shimmer；
 * 2. 默认采用 blue-500/60 高光色（可按需通过 className 覆盖）；
 * 3. 彻底消除复杂 runtime 开销与嵌套 hydration/DOM 警告。
 */

import { cn } from "@/lib/utils";
import type { ComponentProps, ElementType } from "react";

export type ShimmerProps<T extends ElementType = "span"> = {
  as?: T;
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
} & Omit<ComponentProps<T>, "as" | "children">;

export const Shimmer = <T extends ElementType = "span">({
  as,
  children,
  className,
  duration,
  spread,
  ...props
}: ShimmerProps<T>) => {
  const Component = as || "span";

  return (
    <Component
      className={cn("shimmer shimmer-color-blue-500/60 inline-block", className)}
      {...(props as any)}
    >
      {children}
    </Component>
  );
};
