import { useEffect, useRef, useState } from "react";

/**
 * Defers rendering of expensive content until the element scrolls into (or near)
 * the viewport. Returns a ref to attach to the placeholder wrapper and a boolean
 * indicating whether the real content should be rendered.
 *
 * Once triggered, the element stays rendered (no "unloading" on scroll-away)
 * so that already-painted SVGs aren't torn down and re-created.
 *
 * @param rootMargin  How far outside the viewport to start rendering.
 *                    Defaults to "200px" so content loads just before it's visible.
 */
export function useLazyRender<T extends HTMLElement = HTMLDivElement>(
  rootMargin = "200px",
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, visible]);

  return [ref, visible];
}
