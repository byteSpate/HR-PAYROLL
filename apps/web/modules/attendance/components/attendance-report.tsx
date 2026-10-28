'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@erp/ui/page';
import { ExportMenu } from '@erp/ui/components/export-menu';
import { toast } from 'sonner';
import { saveDownload } from '../../../lib/save-download';
import * as api from '../api';
export function AttendanceReport() {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit' }).format(new Date()));
  const query = useQuery({ queryKey: ['attendance-report', month], queryFn: () => api.report(month) });
  return <><PageHeader kicker="Attendance" title="Reports" aside={<input aria-label="Month" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded border p-2" />} /><div className="mb-4"><ExportMenu onExport={format => api.exportReport(month, format).then(saveDownload, (e: Error) => toast.error(e.message))} /></div>{query.error ? <p role="alert">{query.error.message}</p> : <div className="overflow-auto rounded border border-line bg-white"><table className="text-sm"><thead><tr><th className="p-3">Employee</th>{query.data?.[0]?.days.map(day => <th key={day.date} className="p-2">{day.date.slice(8)}</th>)}</tr></thead><tbody>{query.data?.map(row => <tr key={row.employeeId} className="border-t"><th className="p-3">{row.fullName}</th>{row.days.map(day => <td key={day.date} className="p-2">{day.status}</td>)}</tr>)}</tbody></table></div>}</>;
}
