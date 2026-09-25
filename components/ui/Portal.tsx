"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 把子节点渲染到 document.body。
 *
 * 用途：<main> 上有 page-enter 动画（transform），会让它成为 position:fixed 后代的
 * 包含块、并形成自己的层叠上下文。浮层若留在 <main> 里，就会相对 main 定位（不居中、
 * 随页面滚动）并被左侧导航遮挡。渲染到 body 可彻底避开这两个问题。
 */
export function Portal({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.body);
  }, []);

  if (!container) return null;
  return createPortal(children, container);
}
