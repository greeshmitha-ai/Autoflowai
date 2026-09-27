"use client";

import { useState, useCallback } from "react";

// ─── Block types ──────────────────────────────────────────────────────────────

export type BlockType = "text" | "image" | "button" | "merge_field";

export interface TextBlock {
  id: string;
  type: "text";
  content: string;
}

export interface ImageBlock {
  id: string;
  type: "image";
  src: string;
  alt: string;
}

export interface ButtonBlock {
  id: string;
  type: "button";
  label: string;
  url: string;
  color: string;
}

export interface MergeFieldBlock {
  id: string;
  type: "merge_field";
  field: string; // e.g. "first_name", "company_name"
}

export type Block = TextBlock | ImageBlock | ButtonBlock | MergeFieldBlock;

const MERGE_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "company_name",
  "phone",
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Block renderers ──────────────────────────────────────────────────────────

function TextBlockEditor({
  block,
  onChange,
}: {
  block: TextBlock;
  onChange: (b: TextBlock) => void;
}) {
  return (
    <textarea
      className="w-full min-h-[80px] border border-gray-300 rounded p-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
      value={block.content}
      onChange={(e) => onChange({ ...block, content: e.target.value })}
      placeholder="Enter text content…"
    />
  );
}

function ImageBlockEditor({
  block,
  onChange,
}: {
  block: ImageBlock;
  onChange: (b: ImageBlock) => void;
}) {
  return (
    <div className="space-y-2">
      <input
        className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={block.src}
        onChange={(e) => onChange({ ...block, src: e.target.value })}
        placeholder="Image URL"
      />
      <input
        className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={block.alt}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
        placeholder="Alt text"
      />
      {block.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.src} alt={block.alt} className="max-h-40 rounded border" />
      )}
    </div>
  );
}

function ButtonBlockEditor({
  block,
  onChange,
}: {
  block: ButtonBlock;
  onChange: (b: ButtonBlock) => void;
}) {
  return (
    <div className="space-y-2">
      <input
        className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={block.label}
        onChange={(e) => onChange({ ...block, label: e.target.value })}
        placeholder="Button label"
      />
      <input
        className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={block.url}
        onChange={(e) => onChange({ ...block, url: e.target.value })}
        placeholder="Button URL"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Color:</label>
        <input
          type="color"
          value={block.color}
          onChange={(e) => onChange({ ...block, color: e.target.value })}
          className="h-8 w-12 rounded border cursor-pointer"
        />
        <span
          className="px-4 py-1 rounded text-white text-sm font-medium"
          style={{ backgroundColor: block.color }}
        >
          {block.label || "Button"}
        </span>
      </div>
    </div>
  );
}

function MergeFieldBlockEditor({
  block,
  onChange,
}: {
  block: MergeFieldBlock;
  onChange: (b: MergeFieldBlock) => void;
}) {
  return (
    <div className="space-y-2">
      <select
        className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        value={block.field}
        onChange={(e) => onChange({ ...block, field: e.target.value })}
      >
        <option value="">Select merge field…</option>
        {MERGE_FIELDS.map((f) => (
          <option key={f} value={f}>
            {`{{${f}}}`}
          </option>
        ))}
      </select>
      {block.field && (
        <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-1 text-sm text-yellow-800 font-mono">
          {`{{${block.field}}}`}
        </div>
      )}
    </div>
  );
}

// ─── Block wrapper ────────────────────────────────────────────────────────────

function BlockCard({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: Block;
  index: number;
  total: number;
  onChange: (b: Block) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const typeLabel: Record<BlockType, string> = {
    text: "Text",
    image: "Image",
    button: "Button",
    merge_field: "Merge Field",
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-t-lg border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {typeLabel[block.type]}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-500"
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-500"
            title="Move down"
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-red-100 text-red-500"
            title="Remove block"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="p-3">
        {block.type === "text" && (
          <TextBlockEditor block={block} onChange={onChange as (b: TextBlock) => void} />
        )}
        {block.type === "image" && (
          <ImageBlockEditor block={block} onChange={onChange as (b: ImageBlock) => void} />
        )}
        {block.type === "button" && (
          <ButtonBlockEditor block={block} onChange={onChange as (b: ButtonBlock) => void} />
        )}
        {block.type === "merge_field" && (
          <MergeFieldBlockEditor
            block={block}
            onChange={onChange as (b: MergeFieldBlock) => void}
          />
        )}
      </div>
    </div>
  );
}

// ─── HTML export ──────────────────────────────────────────────────────────────

function blocksToHtml(blocks: Block[]): string {
  const parts = blocks.map((block) => {
    switch (block.type) {
      case "text":
        return `<p style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333;">${block.content.replace(/\n/g, "<br/>")}</p>`;
      case "image":
        return `<img src="${block.src}" alt="${block.alt}" style="max-width:100%;display:block;margin:0 auto;" />`;
      case "button":
        return `<div style="text-align:center;margin:16px 0;"><a href="${block.url}" style="background-color:${block.color};color:#fff;padding:10px 24px;border-radius:4px;text-decoration:none;font-family:sans-serif;font-size:14px;font-weight:600;">${block.label}</a></div>`;
      case "merge_field":
        return `<span style="color:#6366f1;font-family:monospace;">{{${block.field}}}</span>`;
      default:
        return "";
    }
  });

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="max-width:600px;margin:0 auto;padding:24px;">
${parts.join("\n")}
</body>
</html>`;
}

function blocksToText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "text":
          return block.content;
        case "image":
          return `[Image: ${block.alt || block.src}]`;
        case "button":
          return `${block.label}: ${block.url}`;
        case "merge_field":
          return `{{${block.field}}}`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

// ─── Main editor component ────────────────────────────────────────────────────

export function EmailTemplateEditor({
  initialBlocks = [],
  templateName = "",
  onSave,
}: {
  initialBlocks?: Block[];
  templateName?: string;
  onSave?: (data: { name: string; html_content: string; text_content: string; blocks: Block[] }) => void;
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [name, setName] = useState(templateName);
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(false);

  const addBlock = useCallback((type: BlockType) => {
    const base = { id: generateId() };
    let block: Block;
    switch (type) {
      case "text":
        block = { ...base, type: "text", content: "" };
        break;
      case "image":
        block = { ...base, type: "image", src: "", alt: "" };
        break;
      case "button":
        block = { ...base, type: "button", label: "Click here", url: "https://", color: "#6366f1" };
        break;
      case "merge_field":
        block = { ...base, type: "merge_field", field: "" };
        break;
    }
    setBlocks((prev) => [...prev, block]);
  }, []);

  const updateBlock = useCallback((id: string, updated: Block) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const moveBlock = useCallback((index: number, direction: "up" | "down") => {
    setBlocks((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }, []);

  const handleSave = () => {
    const html = blocksToHtml(blocks);
    const text = blocksToText(blocks);
    onSave?.({ name, html_content: html, text_content: text, blocks });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-900">Email Template Editor</h1>
          <input
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name…"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview((p) => !p)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            {preview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
          >
            {saved ? "Saved ✓" : "Save Template"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — block palette */}
        {!preview && (
          <div className="w-48 bg-white border-r border-gray-200 p-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Add Block
            </p>
            {(["text", "image", "button", "merge_field"] as BlockType[]).map((type) => (
              <button
                key={type}
                onClick={() => addBlock(type)}
                className="w-full text-left px-3 py-2 text-sm rounded border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
              >
                {type === "text" && "📝 Text"}
                {type === "image" && "🖼 Image"}
                {type === "button" && "🔘 Button"}
                {type === "merge_field" && "🔀 Merge Field"}
              </button>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto p-6">
          {preview ? (
            <div className="max-w-2xl mx-auto bg-white rounded-lg shadow border border-gray-200 p-6">
              <div
                dangerouslySetInnerHTML={{ __html: blocksToHtml(blocks) }}
                className="prose max-w-none"
              />
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
              {blocks.length === 0 && (
                <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                  <p className="text-sm">Add blocks from the sidebar to build your email template.</p>
                </div>
              )}
              {blocks.map((block, index) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={index}
                  total={blocks.length}
                  onChange={(updated) => updateBlock(block.id, updated)}
                  onRemove={() => removeBlock(block.id)}
                  onMoveUp={() => moveBlock(index, "up")}
                  onMoveDown={() => moveBlock(index, "down")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
