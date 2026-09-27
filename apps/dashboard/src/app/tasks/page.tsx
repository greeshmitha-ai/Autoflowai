"use client";
import { useState } from "react";

const TASKS = [
  { id: "1", title: "Follow up with Alice Johnson", due: "Today", priority: "urgent", status: "open", contact: "Alice Johnson" },
  { id: "2", title: "Send proposal to TechCo", due: "Tomorrow", priority: "high", status: "open", contact: "Bob Martinez" },
  { id: "3", title: "Schedule demo for Enterprise Ltd", due: "Apr 6", priority: "medium", status: "open", contact: "David Kim" },
  { id: "4", title: "Review Q2 campaign results", due: "Apr 7", priority: "low", status: "open", contact: null },
  { id: "5", title: "Update contact database", due: "Apr 8", priority: "low", status: "completed", contact: null },
  { id: "6", title: "Call Eva Chen re: renewal", due: "Yesterday", priority: "urgent", status: "overdue", contact: "Eva Chen" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "badge-red", high: "badge-yellow", medium: "badge-blue", low: "badge-purple",
};
const STATUS_COLORS: Record<string, string> = {
  open: "badge-blue", completed: "badge-green", overdue: "badge-red",
};

export default function TasksPage() {
  const [filter, setFilter] = useState("open");
  const [showModal, setShowModal] = useState(false);

  const filtered = TASKS.filter((t) => filter === "all" || t.status === filter);

  return (
    <div className="space-y-5 max-w-4xl mx-auto page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your personal task list</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Task</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Open", value: TASKS.filter(t => t.status === "open").length, color: "badge-blue" },
          { label: "Overdue", value: TASKS.filter(t => t.status === "overdue").length, color: "badge-red" },
          { label: "Completed", value: TASKS.filter(t => t.status === "completed").length, color: "badge-green" },
        ].map((s) => (
          <div key={s.label} className="glass-card p-4 text-center">
            <p className="stat-value text-2xl">{s.value}</p>
            <span className={`badge ${s.color} mt-2`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 glass-card p-1">
        {["all", "open", "overdue", "completed"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === f ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filtered.map((task) => (
          <div key={task.id} className="glass-card-hover p-4 flex items-center gap-4">
            <input
              type="checkbox"
              defaultChecked={task.status === "completed"}
              className="w-4 h-4 rounded border-white/20 bg-white/5 accent-indigo-500 cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-slate-500" : "text-white"}`}>
                {task.title}
              </p>
              {task.contact && <p className="text-xs text-slate-500 mt-0.5">Contact: {task.contact}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`badge ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
              <span className={`badge ${STATUS_COLORS[task.status]}`}>{task.status}</span>
              <span className="text-xs text-slate-500">{task.due}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="glass-card p-8 text-center text-slate-500">No tasks in this category</div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4 mx-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Task</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Title</label>
              <input className="input-field" placeholder="Task title" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
                <input type="date" className="input-field" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Priority</label>
                <select className="input-field">
                  <option>low</option><option>medium</option><option>high</option><option>urgent</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1">Create Task</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
