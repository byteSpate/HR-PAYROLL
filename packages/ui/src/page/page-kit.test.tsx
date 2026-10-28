// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UserAvatar } from './user-avatar';

afterEach(cleanup);

describe('UserAvatar', () => {
  it('falls back to first and last initials when there is no photo', () => {
    render(<UserAvatar name="Amina Rahman" />);
    expect(screen.getByText('AR')).toBeTruthy();
  });

  it('uses the first two letters of a single name', () => {
    render(<UserAvatar name="Bilal" />);
    expect(screen.getByText('BI')).toBeTruthy();
  });

  it('shows a question mark for a blank name', () => {
    render(<UserAvatar name="   " />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('renders the photo when a url is given', () => {
    const { container } = render(<UserAvatar name="Amina Rahman" avatarUrl="/a.png" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/a.png');
  });
});
