import { DataManagerRecordWorkspace } from "@/components/historical-nominations/data-manager-record-workspace";

export default async function DataManagerRecordPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  return <DataManagerRecordWorkspace recordId={recordId} />;
}
