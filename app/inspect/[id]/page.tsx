import { InspectionWorkspace } from "@/components/InspectionWorkspace";
import { normalDefectGroups } from "@/lib/types";

export default function InspectPage({ params }: { params: { id: string } }) {
  return (
    <InspectionWorkspace
      orderId={params.id}
      stage="normal"
      title="普通检品"
      subtitle="普通检品不包含检针 / X光项目。"
      groups={normalDefectGroups}
    />
  );
}
