"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Asn1Tree } from "@/components/x509/asn1-tree";
import { DerHexViewer } from "@/components/x509/der-hex-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { buildAsn1Tree, pemToDerBytes } from "@/lib/x509/asn1-tree";
import type { Asn1Node } from "@/lib/x509/asn1-tree";
import { SAMPLES } from "./samples";

// ── Hash compression helpers ────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function compressBytes(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return data;
  try {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(new Uint8Array(data) as unknown as BufferSource);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new Uint8Array(value));
    }
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  } catch {
    return data;
  }
}

async function decompressBytes(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") return data;
  try {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(data) as unknown as BufferSource);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new Uint8Array(value));
    }
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  } catch {
    return data;
  }
}

// ── Hash state management ───────────────────────────────────────────

interface HashState {
  data: string | null;
  node: string | null;
}

function parseHash(): HashState {
  if (typeof window === "undefined") return { data: null, node: null };
  const hash = window.location.hash.slice(1);
  if (!hash) return { data: null, node: null };
  const params = new URLSearchParams(hash);
  return {
    data: params.get("data"),
    node: params.get("node"),
  };
}

function buildHash(data: string | null, node: string | null): string {
  const params = new URLSearchParams();
  if (data) params.set("data", data);
  if (node) params.set("node", node);
  const str = params.toString();
  return str ? `#${str}` : "";
}

// ── Node path utilities ─────────────────────────────────────────────

/**
 * Find a node by its path string (e.g. "0/0/2") and return it.
 */
function findNodeByPath(root: Asn1Node, path: string): Asn1Node | null {
  const parts = path.split("/").map(Number);
  if (parts.length === 0 || parts[0] !== 0) return null;
  let current = root;
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i];
    if (idx < 0 || idx >= current.children.length) return null;
    current = current.children[idx];
  }
  return current;
}

/**
 * Build a path string for a node by searching the tree.
 */
function findPathForNode(root: Asn1Node, target: Asn1Node): string | null {
  function walk(node: Asn1Node, path: string): string | null {
    if (node === target) return path;
    for (let i = 0; i < node.children.length; i++) {
      const result = walk(node.children[i], `${path}/${i}`);
      if (result) return result;
    }
    return null;
  }
  return walk(root, "0");
}

// ── Main component ──────────────────────────────────────────────────

export function Asn1Playground() {
  const [input, setInput] = useState("");
  const [selectedNode, setSelectedNode] = useState<Asn1Node | null>(null);
  const initializedFromHash = useRef(false);

  // Derive tree + DER bytes + error from input (no side effects in memo)
  const { tree, derBytes, error } = useMemo(() => {
    if (!input.trim()) return { tree: null, derBytes: null, error: null };
    try {
      const der = pemToDerBytes(input.trim());
      const root = buildAsn1Tree(der);
      return { tree: root, derBytes: der, error: null };
    } catch (e) {
      return {
        tree: null,
        derBytes: null,
        error: e instanceof Error ? e.message : "Parse error",
      };
    }
  }, [input]);

  // Load from URL hash on mount
  useEffect(() => {
    if (initializedFromHash.current) return;
    initializedFromHash.current = true;

    const { data, node } = parseHash();
    if (!data) return;

    (async () => {
      try {
        const raw = base64ToBytes(data);
        // Try decompression first; if it fails or produces invalid DER, use raw
        const decompressed = await decompressBytes(raw);
        let derToUse: Uint8Array;
        try {
          buildAsn1Tree(decompressed);
          derToUse = decompressed;
        } catch {
          // Decompression may have produced garbage; try raw bytes as DER
          buildAsn1Tree(raw);
          derToUse = raw;
        }

        // Convert DER to hex for the textarea (shows the raw data clearly)
        const hexParts: string[] = [];
        for (let i = 0; i < derToUse.length; i++) {
          hexParts.push(derToUse[i].toString(16).padStart(2, "0"));
        }
        setInput(hexParts.join(" "));

        // Restore selected node from hash
        if (node) {
          // We need to wait for the tree to be built from the new input,
          // so schedule this after state settles. The tree from useMemo
          // won't be available until next render.
          requestAnimationFrame(() => {
            // Parse again to get the tree for node selection
            try {
              const parsedTree = buildAsn1Tree(derToUse);
              const found = findNodeByPath(parsedTree, node);
              if (found) setSelectedNode(found);
            } catch {
              // Ignore — tree will render without selection
            }
          });
        }
      } catch {
        // Invalid hash data — ignore silently
      }
    })();
  }, []);

  // Update URL hash when input or selected node changes (after initial load)
  const updateHash = useCallback(async (der: Uint8Array | null, node: Asn1Node | null, root: Asn1Node | null) => {
    if (!der) {
      if (window.location.hash) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      return;
    }
    const compressed = await compressBytes(der);
    // Use whichever is smaller: compressed or raw
    const toEncode = compressed.length < der.length ? compressed : der;
    const b64 = bytesToBase64(toEncode);
    const nodePath = node && root ? findPathForNode(root, node) : null;
    const hash = buildHash(b64, nodePath);
    history.replaceState(null, "", window.location.pathname + window.location.search + hash);
  }, []);

  // Sync hash whenever tree or selection changes
  useEffect(() => {
    if (!initializedFromHash.current) return;
    updateHash(derBytes, selectedNode, tree);
  }, [derBytes, selectedNode, tree, updateHash]);

  const handleCopyPermalink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Permalink copied");
  }, []);

  const handleLoadSample = useCallback((data: string) => {
    setInput(data);
    setSelectedNode(null);
  }, []);

  const handleByteClick = useCallback(
    (offset: number) => {
      if (!tree) return;
      // Find the deepest node containing this offset
      function findDeepest(node: Asn1Node): Asn1Node | null {
        if (offset < node.headerOffset || offset >= node.headerOffset + node.totalLength) {
          return null;
        }
        for (const child of node.children) {
          const found = findDeepest(child);
          if (found) return found;
        }
        return node;
      }
      const found = findDeepest(tree);
      if (found) setSelectedNode(found);
    },
    [tree],
  );

  const highlightRange = selectedNode
    ? {
        start: selectedNode.headerOffset,
        end: selectedNode.headerOffset + selectedNode.totalLength,
        headerEnd: selectedNode.valueOffset,
      }
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ASN.1 Explorer</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Paste a PEM certificate, Base64, or hex-encoded DER to inspect its ASN.1 structure.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Input</CardTitle>
          <CardDescription>Auto-detects PEM, Base64, and hex formats</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="font-mono text-xs min-h-[12rem]"
            rows={10}
            placeholder="Paste PEM, Base64, or hex-encoded DER..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSelectedNode(null);
            }}
            spellCheck={false}
            autoComplete="off"
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Samples:</span>
            {SAMPLES.map((sample) => (
              <Button key={sample.label} variant="outline" size="sm" onClick={() => handleLoadSample(sample.data)}>
                {sample.label}
              </Button>
            ))}

            {derBytes && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={handleCopyPermalink}>
                Copy permalink
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <p className="font-medium">Parse error</p>
              <p className="mt-1 font-mono text-xs">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {tree && derBytes && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">ASN.1 Tree</CardTitle>
            </CardHeader>
            <CardContent>
              <Asn1Tree
                root={tree}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
                defaultExpandDepth={3}
                className="max-h-[600px]"
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">DER Hex Dump</CardTitle>
            </CardHeader>
            <CardContent>
              <DerHexViewer
                bytes={derBytes}
                highlightRange={highlightRange}
                onByteClick={handleByteClick}
                className="max-h-[600px]"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
