import { describe, expect, it } from 'vitest';
import { AppError } from '@erp/utils';
import { assertMayDecide, assertPending, decisionStamp } from './decide.js';

const base = { actorEmployeeId: 'e1', subjectEmployeeId: 'e2', actorIsAdmin: false, reaches: () => true };

const status = (fn: () => void) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return (err as AppError).status;
  }
  return null;
};

describe('assertMayDecide', () => {
  it('refuses a non-admin deciding their own record, even when they reach it', () => {
    expect(status(() => assertMayDecide({ ...base, subjectEmployeeId: 'e1' }))).toBe(403);
  });

  it('lets an admin decide their own record', () => {
    expect(status(() => assertMayDecide({ ...base, subjectEmployeeId: 'e1', actorIsAdmin: true }))).toBeNull();
  });

  it('refuses a subject out of reach for a non-admin', () => {
    expect(status(() => assertMayDecide({ ...base, reaches: () => false }))).toBe(403);
  });

  it('allows an in-reach other person', () => {
    expect(status(() => assertMayDecide(base))).toBeNull();
  });

  it('treats an actor with no employee record as someone else', () => {
    expect(status(() => assertMayDecide({ ...base, actorEmployeeId: null }))).toBeNull();
  });

  it('asks reaches about the subject', () => {
    const seen: string[] = [];
    assertMayDecide({ ...base, reaches: (id) => (seen.push(id), true) });
    expect(seen).toEqual(['e2']);
  });
});

describe('assertPending', () => {
  it('passes PENDING', () => {
    expect(status(() => assertPending('PENDING'))).toBeNull();
  });

  it.each(['APPROVED', 'REJECTED', 'CANCELLED'])('refuses %s with 409', (s) => {
    expect(status(() => assertPending(s))).toBe(409);
  });
});

describe('decisionStamp', () => {
  const now = new Date('2026-03-01T10:00:00Z');

  it('records who and when', () => {
    expect(decisionStamp('u1', 'ok', now)).toEqual({ decidedBy: 'u1', decidedAt: now, decisionNote: 'ok' });
  });

  it('trims the note and maps blank or missing to null', () => {
    expect(decisionStamp('u1', '  fine  ', now).decisionNote).toBe('fine');
    expect(decisionStamp('u1', '   ', now).decisionNote).toBeNull();
    expect(decisionStamp('u1', undefined, now).decisionNote).toBeNull();
    expect(decisionStamp('u1', null, now).decisionNote).toBeNull();
  });
});
