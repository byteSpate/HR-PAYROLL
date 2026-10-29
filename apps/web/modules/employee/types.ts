import type { AccountView } from '@erp/contracts/core';
import type { EmployeeView } from '@erp/contracts/employee';

// The wire types live once, in @erp/contracts, and the API reads the same definitions.
export * from '@erp/contracts/employee';
export type { SessionView } from '@erp/contracts/core';

/** HR's `GET /employees/me` answered with both halves; ERP has them on `/auth/account` and `/employees/me`. */
export interface MyProfileResponse {
  account: AccountView;
  /** Null for an account with no employee record, such as an administrator's. */
  employee: EmployeeView | null;
}
