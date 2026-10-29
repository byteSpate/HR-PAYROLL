import { useQuery } from '@tanstack/react-query';
import { getMe } from '@/modules/employee/api';

/** The signed-in person's employee code, or undefined for an account with no employee record. */
export function useOwnEmployeeCode(enabled: boolean): string | undefined {
  const { data } = useQuery({
    queryKey: ['employees', 'me'],
    queryFn: getMe,
    enabled,
    retry: false,
  });
  return data?.employment?.employeeCode;
}
