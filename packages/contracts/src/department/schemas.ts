import { z } from 'zod';

export const departmentInputSchema = z.object({
  name: z.string().trim().min(1, 'A department name is required').max(100),
});

export type DepartmentInput = z.infer<typeof departmentInputSchema>;

export interface DepartmentView {
  id: string;
  name: string;
  employeeCount: number;
}
