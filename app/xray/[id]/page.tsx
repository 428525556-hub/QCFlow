import { InspectionWorkspace } from "@/components/InspectionWorkspace";
import { xrayDefectGroups } from "@/lib/types";

export default function XrayInspectPage({ params }: { params: { id: string } }) {
  return (
    <InspectionWorkspace
      orderId={params.id}
      stage="xray"
      title="X线检品"
      subtitle="包含检针 / X光项目，也可记录普通检品同类问题。"
      groups={xrayDefectGroups}
    />
  );
}
