import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EmployeeView } from '@erp/contracts/employee';
import { EmployeeProfileView } from './employee-profile';

const work: EmployeeView['work'] = {
  fullName: 'Rahim Uddin',
  designation: 'Engineer',
  department: { id: 'd', name: 'Engineering' },
  reportingManager: null,
  email: 'rahim@example.com',
  phone: '017',
  avatarUrl: null,
};

const full: EmployeeView = {
  id: 'e',
  employeeCode: 'EMP-0001',
  work,
  employment: { employmentType: 'FULL_TIME', employmentStatus: 'ACTIVE', joiningDate: '2026-01-05', officeLocation: null, shiftId: null, lastWorkingDay: null, exitReason: null },
  personal: { dateOfBirth: null, gender: null, nationalId: '123', bloodGroup: null, maritalStatus: null, presentAddress: null, permanentAddress: null, emergencyContact: null },
  money: { bankAccountNumber: '999', bankName: 'City', bankRoutingNumber: null },
  editableFields: ['phone'],
};

const render = (employee: EmployeeView) =>
  renderToStaticMarkup(<EmployeeProfileView employee={employee} saving={false} error={null} onSave={() => undefined} />);

describe('EmployeeProfileView', () => {
  it('renders no personal, employment or bank sections for a colleague view', () => {
    const html = render({ id: 'e', employeeCode: 'EMP-0001', work, editableFields: [] });
    expect(html).toContain('Rahim Uddin');
    expect(html).not.toContain('Personal');
    expect(html).not.toContain('Bank');
    expect(html).not.toContain('Employment');
  });

  it('renders exactly one input for one editable field, and a save button', () => {
    const html = render(full);
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).toContain('name="phone"');
    expect(html).toContain('Save changes');
  });

  it('shows every section the view carries, read-only when nothing is editable', () => {
    const html = render({ ...full, editableFields: [] });
    expect(html).toContain('Personal');
    expect(html).toContain('Bank');
    expect(html).toContain('123');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('Save changes');
  });
});
