'use client';

import { RiDownload2Line } from '@remixicon/react';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

export function ExportMenu({ onExport, disabled }: { onExport: (format: 'xlsx' | 'csv') => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" disabled={disabled} />}>
        <RiDownload2Line />
        <span>Export</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport('xlsx')}>Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('csv')}>CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
