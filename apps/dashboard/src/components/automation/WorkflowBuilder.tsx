"use client";

import { useState, useCallback, useRef } from "react";

export type NodeType = "trigger" | "condition" | "action" | "delay";

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  trigger: { type: string; conditions?: Record<string, unknown> };
}

const NODE_PALETTE: { type: NodeType; label: string; bg: string; border: string; text: string; icon: string }[] = [
  { type: "trigger",   label: "Trigger",   bg: "bg-purple-500/20", border: "border-purple-500/40", text: "text-purple-300", icon: "⚡" },
  { type: "condition", label: "Condition", bg: "bg-amber-500/20",  border: "border-amber-500/40",  text: "text-amber-300",  icon: "◇" },
  { type: "action",    label: "Action",    bg: "bg-blue-500/20",   border: "border-blue-500/40",   text: "text-blue-300",   icon: "▶" },
  { type: "delay",     label: "Delay",     bg: "bg-slate-500/20",  border: "border-slate-500/40",  text: "text-slate-300",  icon: "⏱" },
];

const NODE_COLORS: Record<NodeType, { bg: string; border: string; text: string }> = {
  trigger:   { bg: "bg-purple-500/20", border: "border-purple-500/40", text: "text-purple-300" },
  condition: { bg: "bg-amber-500/20",  border: "border-amber-500/40",  text: "text-amber-300" },
  action:    { bg: "bg-blue-500/20",   border: "border-blue-500/40",   text: "text-blue-300" },
  delay:     { bg: "bg-slate-500/20",  border: "border-slate-500/40",  text: "text-slate-300" },
};

let nodeCounter = 0;
function newNodeId() { return `node-${++nodeCounter}-${Date.now()}`; }

interface WorkflowBuilderProps {
  initialDefinition?: WorkflowDefinition;
  onChange?: (definition: WorkflowDefinition) => void;
}

export function WorkflowBuilder({ initialDefinition, onChange }: WorkflowBuilderProps) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialDefinition?.nodes ?? []);
  const [edges, setEdges] = useState<WorkflowEdge[]>(initialDefinition?.edges ?? []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const notify = useCallback((ns: WorkflowNode[], es: WorkflowEdge[]) => {
    const triggerNode = ns.find(n => n.type === "trigger");
    const triggerConditions = triggerNode?.config["conditions"] as Record<string, unknown> | undefined;
    onChange?.({
      nodes: ns, edges: es,
      trigger: {
        type: (triggerNode?.config["event_type"] as string) ?? "",
        ...(triggerConditions !== undefined ? { conditions: triggerConditions } : {}),
      },
    });
  }, [onChange]);

  const addNode = useCallback((type: NodeType, x: number, y: number) => {
    const palette = NODE_PALETTE.find(p => p.type === type)!;
    const node: WorkflowNode = { id: newNodeId(), type, label: palette.label, config: {}, position: { x, y } };
    const next = [...nodes, node];
    setNodes(next);
    notify(next, edges);
  }, [nodes, edges, notify]);

  const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("nodeType") as NodeType;
    if (!type) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    addNode(type, e.clientX - rect.left - 60, e.clientY - rect.top - 20);
  }, [addNode]);

  const removeNode = useCallback((nodeId: string) => {
    const nextNodes = nodes.filter(n => n.id !== nodeId);
    const nextEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    setNodes(nextNodes); setEdges(nextEdges);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    notify(nextNodes, nextEdges);
  }, [nodes, edges, selectedNodeId, notify]);

  const connectNodes = useCallback((targetId: string) => {
    if (!connectingFrom || connectingFrom === targetId) { setConnectingFrom(null); return; }
    if (edges.some(e => e.source === connectingFrom && e.target === targetId)) { setConnectingFrom(null); return; }
    const edge: WorkflowEdge = { id: `edge-${connectingFrom}-${targetId}`, source: connectingFrom, target: targetId };
    const nextEdges = [...edges, edge];
    setEdges(nextEdges); setConnectingFrom(null);
    notify(nodes, nextEdges);
  }, [connectingFrom, edges, nodes, notify]);

  const updateNodeConfig = useCallback((nodeId: string, key: string, value: unknown) => {
    const nextNodes = nodes.map(n => n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n);
    setNodes(nextNodes); notify(nextNodes, edges);
  }, [nodes, edges, notify]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-full gap-3 min-h-[400px]">
      {/* Palette */}
      <div className="w-32 flex-shrink-0 space-y-2">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Nodes</p>
        {NODE_PALETTE.map(p => (
          <div key={p.type} draggable onDragStart={e => e.dataTransfer.setData("nodeType", p.type)}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border cursor-grab text-xs font-medium select-none transition-all hover:scale-[1.02] ${p.bg} ${p.border} ${p.text}`}>
            <span>{p.icon}</span>{p.label}
          </div>
        ))}
        {connectingFrom && (
          <div className="mt-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2 text-[10px] text-indigo-300">
            Click a node to connect
            <button className="block mt-1 text-red-400 underline" onClick={() => setConnectingFrom(null)}>Cancel</button>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col gap-2">
        <div ref={canvasRef}
          className="relative flex-1 rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] overflow-hidden"
          onDrop={handleCanvasDrop} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
          onClick={() => setSelectedNodeId(null)}>
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm pointer-events-none">
              Drag nodes here to build your workflow
            </div>
          )}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker id="arrow-dark" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
              </marker>
            </defs>
            {edges.map(edge => {
              const src = nodes.find(n => n.id === edge.source);
              const tgt = nodes.find(n => n.id === edge.target);
              if (!src || !tgt) return null;
              const x1 = src.position.x + 60, y1 = src.position.y + 20;
              const x2 = tgt.position.x + 60, y2 = tgt.position.y + 20;
              return (
                <g key={edge.id}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6366f1" strokeWidth={2} markerEnd="url(#arrow-dark)" />
                </g>
              );
            })}
          </svg>
          {nodes.map(node => {
            const c = NODE_COLORS[node.type];
            return (
              <div key={node.id}
                className={`absolute flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-medium cursor-pointer select-none transition-all ${c.bg} ${c.border} ${c.text} ${selectedNodeId === node.id ? "ring-2 ring-indigo-500" : ""} ${connectingFrom && connectingFrom !== node.id ? "ring-2 ring-emerald-400" : ""}`}
                style={{ left: node.position.x, top: node.position.y, minWidth: 120 }}
                onClick={e => { e.stopPropagation(); connectingFrom ? connectNodes(node.id) : setSelectedNodeId(node.id); }}>
                <span>{NODE_PALETTE.find(p => p.type === node.type)?.icon}</span>
                <span className="truncate max-w-[80px]">{node.label}</span>
                <button className="ml-auto text-slate-500 hover:text-red-400 text-xs transition-colors"
                  onClick={e => { e.stopPropagation(); removeNode(node.id); }}>✕</button>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-600">{nodes.length} node{nodes.length !== 1 ? "s" : ""} · {edges.length} connection{edges.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Inspector */}
      <div className="w-52 flex-shrink-0">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">Inspector</p>
        {selectedNode ? (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Label</label>
              <input className="input-field text-xs py-1.5" value={selectedNode.label}
                onChange={e => { const next = nodes.map(n => n.id === selectedNode.id ? { ...n, label: e.target.value } : n); setNodes(next); notify(next, edges); }} />
            </div>
            {selectedNode.type === "trigger" && (
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Event</label>
                <select className="select-field text-xs py-1.5" value={(selectedNode.config["event_type"] as string) ?? ""}
                  onChange={e => updateNodeConfig(selectedNode.id, "event_type", e.target.value)}>
                  <option value="">— select —</option>
                  <option value="contact.created">Contact created</option>
                  <option value="contact.updated">Contact updated</option>
                  <option value="lead_score_threshold">Lead score threshold</option>
                  <option value="survey.low_score">Survey low score</option>
                  <option value="campaign.opened">Campaign opened</option>
                  <option value="call.completed">Call completed</option>
                </select>
              </div>
            )}
            {selectedNode.type === "action" && (
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Action</label>
                <select className="select-field text-xs py-1.5" value={(selectedNode.config["action_type"] as string) ?? ""}
                  onChange={e => updateNodeConfig(selectedNode.id, "action_type", e.target.value)}>
                  <option value="">— select —</option>
                  <option value="send_email">Send email</option>
                  <option value="send_sms">Send SMS</option>
                  <option value="update_contact_field">Update contact</option>
                  <option value="create_task">Create task</option>
                  <option value="call_webhook">Call webhook</option>
                  <option value="generate_content">Generate AI content</option>
                </select>
              </div>
            )}
            {selectedNode.type === "delay" && (
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Delay (ms)</label>
                <input type="number" min={0} className="input-field text-xs py-1.5"
                  value={(selectedNode.config["delay_ms"] as number) ?? 0}
                  onChange={e => updateNodeConfig(selectedNode.id, "delay_ms", Number(e.target.value))} />
              </div>
            )}
            <button className="btn-secondary w-full text-xs py-1.5"
              onClick={e => { e.stopPropagation(); setConnectingFrom(selectedNode.id); }}>
              Connect to…
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-600">Select a node to configure it</p>
        )}
      </div>
    </div>
  );
}
