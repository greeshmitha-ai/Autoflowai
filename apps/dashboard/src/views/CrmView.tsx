"use client";

import { SubsystemPage } from "@/components/SubsystemPage";

export function CrmView() {
  return (
    <SubsystemPage title="CRM" serviceKey="crm">
      <div className="rounded-lg bg-white border border-gray-200 p-6 text-sm text-gray-500">
        Pipeline Kanban board, deals, and revenue forecast will render here.
      </div>
    </SubsystemPage>
  );
}
