"use client";

import { useState } from "react";
import {
  allPostures,
  sirenResponses,
  protectedSpaceDecision,
  type ReadinessPosture,
  type SirenResponse,
} from "@/lib/sops";

type Tab = "siren" | "postures" | "protected-space";

/* ── Siren Response Card ── */
function SirenResponseCard({ sop }: { sop: SirenResponse }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-red-600 font-mono text-xs font-bold">
            {sop.id}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">{sop.title}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{sop.scenario}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sop.time_critical && (
            <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded uppercase">
              Time Critical
            </span>
          )}
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-zinc-100">
          <ol className="mt-4 space-y-3">
            {sop.steps.map((s) => (
              <li key={s.step} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
                  {s.step}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {s.action}
                  </p>
                  {s.detail && (
                    <p className="text-xs text-zinc-500 mt-0.5">{s.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {sop.notes.length > 0 && (
            <div className="mt-4 rounded bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">
                Notes
              </p>
              <ul className="space-y-1">
                {sop.notes.map((note, i) => (
                  <li key={i} className="text-xs text-amber-800 flex gap-1.5">
                    <span className="shrink-0">-</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Posture Checklist Card ── */
function PostureCard({ posture }: { posture: ReadinessPosture }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-50 transition-colors"
      >
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">
            {posture.title}
          </h3>
          {posture.subtitle && (
            <p className="text-xs text-zinc-500 mt-0.5">{posture.subtitle}</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-zinc-100">
          <p className="text-xs text-zinc-600 mt-3 mb-4">{posture.description}</p>
          {posture.sections.map((section) => (
            <div key={section.name} className="mb-4 last:mb-0">
              <h4 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-2">
                {section.icon && <span className="mr-1">{section.icon}</span>}
                {section.name}
              </h4>
              <ul className="space-y-1.5">
                {section.items.map((item) => (
                  <li key={item.id} className="flex gap-2">
                    <span className="text-[10px] font-mono text-zinc-400 shrink-0 w-6 mt-0.5">
                      {item.id}
                    </span>
                    <div>
                      <p className="text-xs text-zinc-800">{item.item}</p>
                      {item.detail && (
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {item.detail}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Protected Space Decision ── */
function ProtectedSpacePanel() {
  const d = protectedSpaceDecision;
  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-600">{d.description}</p>

      {/* Priority order */}
      <div className="space-y-3">
        {d.priority_order.map((p) => (
          <div
            key={p.priority}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  p.priority === 1
                    ? "bg-green-600"
                    : p.priority === 2
                    ? "bg-blue-600"
                    : p.priority === 3
                    ? "bg-yellow-600"
                    : p.priority === 4
                    ? "bg-orange-600"
                    : "bg-red-600"
                }`}
              >
                {p.priority}
              </span>
              <div>
                <h4 className="text-sm font-semibold text-zinc-900">
                  {p.name}
                </h4>
                <p className="text-xs text-zinc-500">{p.description}</p>
              </div>
            </div>
            <ul className="ml-10 space-y-1">
              {p.instructions.map((inst, i) => (
                <li key={i} className="text-xs text-zinc-700 flex gap-1.5">
                  <span className="text-zinc-400 shrink-0">-</span>
                  {inst}
                </li>
              ))}
            </ul>
            {p.note && (
              <p className="ml-10 mt-2 text-[11px] text-zinc-500 italic">
                {p.note}
              </p>
            )}
            {p.why_it_works && (
              <p className="ml-10 mt-2 text-[11px] text-zinc-500 italic">
                {p.why_it_works}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Not valid */}
      <div className="rounded bg-red-50 border border-red-200 p-4">
        <h4 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">
          NOT valid protected spaces
        </h4>
        <ul className="space-y-1">
          {d.not_valid_spaces.map((s, i) => (
            <li key={i} className="text-xs text-red-700 flex gap-1.5">
              <span className="shrink-0">x</span>
              {s}
            </li>
          ))}
        </ul>
      </div>

      {/* Important notes */}
      <div className="rounded bg-amber-50 border border-amber-200 p-4">
        <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
          Important Notes
        </h4>
        <ul className="space-y-1">
          {d.important_notes.map((n, i) => (
            <li key={i} className="text-xs text-amber-800 flex gap-1.5">
              <span className="shrink-0">-</span>
              {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function SopsPage() {
  const [tab, setTab] = useState<Tab>("siren");

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "siren", label: "Siren Response", count: sirenResponses.length },
    { id: "postures", label: "Readiness Postures", count: allPostures.length },
    { id: "protected-space", label: "Choosing a Protected Space" },
  ];

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">SOPs</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Standard Operating Procedures — Home Front Command guidelines
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-red-600 text-red-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "siren" && (
        <div className="space-y-3">
          {sirenResponses.map((sop) => (
            <SirenResponseCard key={sop.id} sop={sop} />
          ))}
        </div>
      )}

      {tab === "postures" && (
        <div className="space-y-3">
          {allPostures.map((posture) => (
            <PostureCard key={posture.title} posture={posture} />
          ))}
        </div>
      )}

      {tab === "protected-space" && <ProtectedSpacePanel />}
    </div>
  );
}
