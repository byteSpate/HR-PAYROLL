import { describe, expect, it } from 'vitest';
import { computeBlockers } from './employee.blockers.js';

const empty = { bankAccountNumber: null, bankRoutingNumber: null, nationalId: null, emergencyContact: null };
const complete = { bankAccountNumber: '1', bankRoutingNumber: '2', nationalId: '3', emergencyContact: '4' };

describe('computeBlockers', () => {
  it('names each missing item by the operation it stops', () => {
    expect(computeBlockers(empty, [])).toEqual([
      { field: 'bankAccountNumber', blocks: 'The BEFTN bank file will skip this employee' },
      { field: 'bankRoutingNumber', blocks: 'The BEFTN bank file will skip this employee' },
      { field: 'CONTRACT', blocks: 'No signed contract is on file' },
      { field: 'nationalId', blocks: 'No national ID on record' },
      { field: 'emergencyContact', blocks: 'No emergency contact on record' },
    ]);
  });

  it('accepts a scanned ID in place of the typed number, and a contract on file', () => {
    expect(computeBlockers({ ...empty, bankAccountNumber: '1', bankRoutingNumber: '2', emergencyContact: '4' }, ['NID', 'CONTRACT'])).toEqual([]);
  });

  it('reports nothing for a complete record', () => {
    expect(computeBlockers(complete, ['CONTRACT'])).toEqual([]);
  });
});
