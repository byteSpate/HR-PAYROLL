// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable, type DataColumn } from './data-table';

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
}

const columns: DataColumn<Row>[] = [{ key: 'name', header: 'Name', sortValue: (r) => r.name, cell: (r) => r.name }];
const rows: Row[] = [
  { id: '1', name: 'Bilal' },
  { id: '2', name: 'Amina' },
];

const names = () =>
  within(screen.getAllByRole('rowgroup')[1]!)
    .getAllByRole('row')
    .map((r) => r.textContent);

describe('DataTable', () => {
  it('shows the empty message when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty="No employees found." />);
    expect(screen.getByText('No employees found.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the error instead of the table', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} error="Could not load" />);
    expect(screen.getByText('Could not load')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sorts ascending then descending when a sortable header is clicked', async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(names()).toEqual(['Bilal', 'Amina']);
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(names()).toEqual(['Amina', 'Bilal']);
    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(names()).toEqual(['Bilal', 'Amina']);
  });
});
