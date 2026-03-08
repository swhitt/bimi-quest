"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Asn1Node } from "@/lib/x509/asn1-tree";
import { cn } from "@/lib/utils";

interface Asn1TreeProps {
  root: Asn1Node;
  onSelectNode?: (node: Asn1Node) => void;
  selectedNode?: Asn1Node | null;
  defaultExpandDepth?: number;
  className?: string;
}

/** A flattened visible node with its path and depth for rendering. */
interface FlatNode {
  node: Asn1Node;
  path: string;
  depth: number;
  hasChildren: boolean;
}

const TAG_CLASS_COLORS: Record<Asn1Node["tagClass"], string> = {
  universal: "text-blue-600 dark:text-blue-400",
  context: "text-amber-600 dark:text-amber-400",
  application: "text-emerald-600 dark:text-emerald-400",
  private: "text-rose-600 dark:text-rose-400",
};

/**
 * Collect all node paths that should be expanded by default up to a given depth.
 */
function buildDefaultExpanded(root: Asn1Node, maxDepth: number): Set<string> {
  const expanded = new Set<string>();
  function walk(node: Asn1Node, path: string, depth: number) {
    if (depth < maxDepth && node.children.length > 0) {
      expanded.add(path);
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i], `${path}/${i}`, depth + 1);
      }
    }
  }
  walk(root, "0", 0);
  return expanded;
}

/**
 * Flatten the visible tree into an array based on which nodes are expanded.
 */
function flattenTree(root: Asn1Node, collapsed: Set<string>): FlatNode[] {
  const result: FlatNode[] = [];
  function walk(node: Asn1Node, path: string, depth: number) {
    const hasChildren = node.children.length > 0;
    result.push({ node, path, depth, hasChildren });
    if (hasChildren && !collapsed.has(path)) {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i], `${path}/${i}`, depth + 1);
      }
    }
  }
  walk(root, "0", 0);
  return result;
}

/**
 * Get the parent path from a node path. Returns null for the root.
 */
function parentPath(path: string): string | null {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.slice(0, lastSlash) : null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

export function Asn1Tree({ root, onSelectNode, selectedNode, defaultExpandDepth = 2, className }: Asn1TreeProps) {
  // Tracks which constructed-node paths are currently expanded.
  // Initialized from defaultExpandDepth; toggled by user interaction.
  const [expanded, setExpanded] = useState<Set<string>>(() => buildDefaultExpanded(root, defaultExpandDepth));

  // Rebuild default expansion when root or defaultExpandDepth changes
  useEffect(() => {
    setExpanded(buildDefaultExpanded(root, defaultExpandDepth));
  }, [root, defaultExpandDepth]);

  // The effective collapsed set is: all constructed paths NOT in expanded
  // But for flattenTree, we need the set of paths that ARE collapsed.
  // A path is collapsed if it has children and is NOT in the expanded set.
  const effectiveCollapsed = useMemo(() => {
    const result = new Set<string>();
    // Walk the whole tree to find all constructed paths not in expanded
    function walk(node: Asn1Node, path: string) {
      if (node.children.length > 0 && !expanded.has(path)) {
        result.add(path);
      }
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i], `${path}/${i}`);
      }
    }
    walk(root, "0");
    return result;
  }, [root, expanded]);

  const flatNodes = useMemo(() => flattenTree(root, effectiveCollapsed), [root, effectiveCollapsed]);

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      const el = rowRefs.current.get(focusedIndex);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (node: Asn1Node, index: number) => {
      setFocusedIndex(index);
      onSelectNode?.(node);
    },
    [onSelectNode],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (flatNodes.length === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, flatNodes.length - 1));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < flatNodes.length) {
            const { path, hasChildren } = flatNodes[focusedIndex];
            if (hasChildren && effectiveCollapsed.has(path)) {
              toggleExpand(path);
            }
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < flatNodes.length) {
            const { path, hasChildren } = flatNodes[focusedIndex];
            if (hasChildren && !effectiveCollapsed.has(path)) {
              // Collapse this node
              toggleExpand(path);
            } else {
              // Move to parent
              const parent = parentPath(path);
              if (parent !== null) {
                const parentIndex = flatNodes.findIndex((n) => n.path === parent);
                if (parentIndex >= 0) {
                  setFocusedIndex(parentIndex);
                }
              }
            }
          }
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < flatNodes.length) {
            onSelectNode?.(flatNodes[focusedIndex].node);
          }
          break;
        }
      }
    },
    [flatNodes, focusedIndex, effectiveCollapsed, toggleExpand, onSelectNode],
  );

  return (
    <div
      ref={containerRef}
      className={cn("font-mono text-sm overflow-auto outline-none", className)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="tree"
      aria-label="ASN.1 structure"
    >
      {flatNodes.map((flat, index) => {
        const { node, path, depth, hasChildren } = flat;
        const isExpanded = hasChildren && !effectiveCollapsed.has(path);
        const isSelected = selectedNode === node;
        const isFocused = focusedIndex === index;

        return (
          <div
            key={path}
            ref={(el) => {
              if (el) rowRefs.current.set(index, el);
              else rowRefs.current.delete(index);
            }}
            className={cn(
              "flex items-baseline gap-1 px-1 py-px cursor-pointer select-none",
              "hover:bg-muted/50",
              isSelected && "bg-accent",
              isFocused && "ring-1 ring-ring ring-inset",
            )}
            style={{ paddingLeft: depth * 20 + 4 }}
            onClick={() => handleRowClick(node, index)}
            role="treeitem"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-level={depth + 1}
            aria-selected={isSelected}
          >
            {/* Collapse toggle */}
            <span
              className="w-4 shrink-0 text-center text-muted-foreground"
              onClick={(e) => {
                if (hasChildren) {
                  e.stopPropagation();
                  toggleExpand(path);
                }
              }}
            >
              {hasChildren ? (isExpanded ? "\u25BC" : "\u25B6") : " "}
            </span>

            {/* Tag name */}
            <span className={cn("shrink-0", TAG_CLASS_COLORS[node.tagClass])}>{node.tagName}</span>

            {/* Byte length */}
            <span className="text-muted-foreground shrink-0">({node.valueLength} bytes)</span>

            {/* Decoded value */}
            {node.decoded && <span className="text-foreground truncate">{truncate(node.decoded, 80)}</span>}

            {/* OID name */}
            {node.oidName && <span className="text-muted-foreground italic shrink-0">({node.oidName})</span>}
          </div>
        );
      })}
    </div>
  );
}
