import { RunDetailPage } from '@/modules/asset/components/run-detail-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequirePermission permission="asset.capitalise">
      <RunDetailPage id={id} />
    </RequirePermission>
  );
}
