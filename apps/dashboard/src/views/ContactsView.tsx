"use client";

import { SubsystemPage } from "@/components/SubsystemPage";

export function ContactsView() {
  return (
    <SubsystemPage title="Contacts" serviceKey="contacts">
      <div className="rounded-lg bg-white border border-gray-200 p-6 text-sm text-gray-500">
        Contact list, search, and import will render here.
      </div>
    </SubsystemPage>
  );
}
