import { ExpensePage } from '@/modules/expense/components/expense-page';
import { RequirePermission } from '@/modules/settings/components/require-permission';

export default function Page() {
  return (
    <RequirePermission permission={['expense.read', 'expense.approve']}>
      <ExpensePage view="company" />
    </RequirePermission>
  );
}
