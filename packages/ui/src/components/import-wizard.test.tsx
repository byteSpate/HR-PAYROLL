import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImportPreviewView, canCommit } from './import-wizard';

const clean = { rows: [{ name: 'Sales' }], issues: [], summary: { departments: 1 } };
const broken = { rows: [], issues: [{ rowNumber: 3, column: 'name', message: 'Duplicate name' }], summary: { departments: 0 } };

describe('canCommit', () => {
  it('allows a clean preview with rows and refuses one with issues or no rows', () => {
    expect(canCommit(clean)).toBe(true);
    expect(canCommit(broken)).toBe(false);
    expect(canCommit({ rows: [], issues: [], summary: {} })).toBe(false);
  });
});

describe('ImportPreviewView', () => {
  const render = (preview: typeof clean | typeof broken) =>
    renderToStaticMarkup(<ImportPreviewView preview={preview} committing={false} onCommit={() => undefined} onReset={() => undefined} />);

  it('lists every issue by row and disables Import', () => {
    const html = render(broken);
    expect(html).toContain('Row 3');
    expect(html).toContain('Duplicate name');
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Import<\/button>/);
  });

  it('enables Import for a clean preview and shows the summary', () => {
    const html = render(clean);
    expect(html).not.toMatch(/<button[^>]* disabled=""[^>]*>Import<\/button>/);
    expect(html).toContain('departments');
  });
});
