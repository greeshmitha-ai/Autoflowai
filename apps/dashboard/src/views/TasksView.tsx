"use client";

import { useState } from "react";

type Priority = "high" | "medium" | "low";

interface Task {
  id: string;
  title: string;
  assignee: string;
  due: string;
  priority: Priority;
  column: "todo" | "in-progress" | "done";
}

const INITIAL: Task[] = [
  { id: "1", title: "Follow up with David Kim on Enterprise deal", assignee: "Nikhil", due: "Today",    priority: "high",   column: "todo" },
  { id: "2", title: "Review Q2 marketing campaign results",        assignee: "Nikhil", due: "Apr 24",   priority: "medium", column: "todo" },
  { id: "3", title: "Set up automation for lead nurture flow",     assignee: "Nikhil", due: "Apr 25",   priority: "high",   column: "in-progress" },
  { id: "4", title: "Respond to Carol White's support ticket",     assignee: "Nikhil", due: "Today",    priority: "medium", column: "in-progress" },
  { id: "5", title: "Export contacts report to CSV",               assignee: "Nikhil", due: "Apr 22",   priority: "low",    column: "done" },
  { id: "6", title: "Update chatbot fallback responses",           assignee: "Nikhil", due: "Apr 22",   priority: "medium", column: "done" },
];

const PRIORITY_BADGE: Record<Priority, string> = {
  high: "badge-red", medium: "badge-yellow", low: "badge-gray",
};

const COLUMNS = [
  { id: "todo"        as const, label: "To-Do",       color: "border-slate-500/30" },
  { id: "in-progress" as const, label: "In Progress",  color: "border-blue-500/30" },
  { id: "done"        as const, label: "Done",          color: "border-emerald-500/30" },
];

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", due: "", priority: "medium" as Priority });

  const move = (id: string, col: Task["column"]) => {
    setTasks(t => t.map(task => task.id === id ? { ...task, column: col } : task));
  };

  const addTask = () => {
    if (!form.title.trim()) return;
    setTasks(t => [...t, { id: String(Date.now()), title: form.title, assignee: "Nikhil", due: form.due || "No date", priority: form.priority, column: "todo" }]);
    setForm({ title: "", due: "", priority: "medium" });
    setShowModal(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">{tasks.filter(t => t.column !== "done").length} open tasks</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Task</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map(col => (
          <div key={col.id} className="glass-card p-4">
            <p className="stat-value text-xl">{tasks.filter(t => t.column === col.id).length}</p>
            <p className="text-xs text-slate-400 mt-1">{col.label}</p>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.column === col.id);
          return (
            <div key={col.id}>
              <div className={`rounded-xl border p-3 mb-3 ${col.color} bg-white/[0.02]`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{col.label}</p>
                  <span className="badge badge-gray">{colTasks.length}</span>
                </div>
              </div>
              <div className="space-y-2">
                {colTasks.map(task => (
                  <div key={task.id} className="glass-card-hover p-3 cursor-pointer">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm text-white leading-snug flex-1">{task.title}</p>
                      <span className={`badge ${PRIORITY_BADGE[task.priority]} flex-shrink-0`}>{task.priority}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-slate-500">📅 {task.due}</span>
                      <div className="flex gap-1">
                        {COLUMNS.filter(c => c.id !== col.id).map(c => (
                          <button key={c.id} onClick={() => move(task.id, c.id)}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded px-1.5 py-0.5 transition-colors">
                            → {c.label.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="border-2 border-dashed border-white/[0.06] rounded-xl p-6 text-center text-xs text-slate-600">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Task</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Task Title</label>
              <input className="input-field" placeholder="e.g. Follow up with prospect" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
              <input className="input-field" type="date" value={form.due}
                onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Priority</label>
              <select className="select-field" value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={addTask}>Create Task</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
