"use client";

import { InspectionWorkspace } from "@/components/InspectionWorkspace";
import { normalDefectGroups } from "@/lib/types";

export default function FieldInspectPage({ params }: { params: { id: string } }) {
  return (
    <InspectionWorkspace
      orderId={params.id}
      stage="field"
      title="出差检品"
      subtitle="出差检品使用普通检品项目，不包含检针 / X光项目。"
      groups={normalDefectGroups}
    />
  );
}
