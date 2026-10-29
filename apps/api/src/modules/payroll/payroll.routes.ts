import { Router } from 'express';
import {
  adjustmentBody,
  adjustmentQuery,
  createRunBody,
  payrollSettingsBody,
  processRunBody,
  rejectRunBody,
  salaryStructureBody,
} from '@erp/contracts/payroll';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { createAdjustment, deleteAdjustment, listAdjustments } from './payroll.adjustments.js';
import { bankFileSummary, buildBankFile } from './payroll.bankfile.js';
import { claimEmailRun, emailPayslipsForRun, getEmailStatus } from './payroll.mailer.js';
import { renderPayslipPdf } from './payroll.pdf.js';
import { getEmployeePayslips, getMyPayslips, getPayslip } from './payroll.payslips.js';
import {
  approveRun,
  createRun,
  deleteRun,
  disburseRun,
  getRun,
  getRunPreflight,
  listRuns,
  processRun,
  rejectRun,
  submitRun,
} from './payroll.runs.js';
import { exportSalaryStructuresHandler } from './payroll.structure.export.js';
import {
  createSalaryStructure,
  deleteSalaryStructure,
  listSalaryStructures,
  updateSalaryStructure,
} from './payroll.structure.js';
import { getPayrollSettings, updatePayrollSettings } from './payroll.settings.js';

export const payrollRouter = Router();

const config = requirePermission('payroll.config');
const id = (req: { params: Record<string, unknown> }) => String(req.params['id']);

payrollRouter.use(requireAuth);

payrollRouter.get(
  '/settings',
  requirePermission(['payroll.read', 'payroll.config']),
  async (_req, res) => {
    res.json(await getPayrollSettings());
  },
);
payrollRouter.patch('/settings', config, async (req, res) => {
  res.json(await updatePayrollSettings(req.user!.sub, payrollSettingsBody.parse(req.body)));
});

payrollRouter.get('/salary-structures/export', config, exportSalaryStructuresHandler);
payrollRouter.get(
  '/salary-structures',
  requirePermission(['payroll.read', 'payroll.config']),
  async (_req, res) => {
    res.json(await listSalaryStructures());
  },
);
payrollRouter.post('/salary-structures', config, async (req, res) => {
  res
    .status(201)
    .json(await createSalaryStructure(req.user!.sub, salaryStructureBody.parse(req.body)));
});
payrollRouter.patch('/salary-structures/:id', config, async (req, res) => {
  res.json(
    await updateSalaryStructure(id(req), req.user!.sub, salaryStructureBody.parse(req.body)),
  );
});
payrollRouter.delete('/salary-structures/:id', config, async (req, res) => {
  res.json(await deleteSalaryStructure(id(req), req.user!.sub));
});

// Runs are company-wide, so every run route asks for the grant at `all`.
const runsRead = requirePermission('payroll.read:all');
const runsManage = requirePermission('payroll.manage:all');
const isAdmin = (level: string | undefined) => level === 'ADMIN' || level === 'SUPER_ADMIN';

payrollRouter.get('/runs', runsRead, async (_req, res) => {
  res.json(await listRuns());
});
payrollRouter.get('/runs/:id', runsRead, async (req, res) => {
  res.json(await getRun(id(req)));
});
payrollRouter.get('/runs/:id/preflight', runsRead, async (req, res) => {
  res.json(await getRunPreflight(id(req)));
});
payrollRouter.post('/runs', runsManage, async (req, res) => {
  res.status(201).json(await createRun(req.user!.sub, createRunBody.parse(req.body)));
});
payrollRouter.post('/runs/:id/process', runsManage, async (req, res) => {
  res.json(
    await processRun(id(req), req.user!.sub, processRunBody.parse(req.body).excludedEmployeeIds),
  );
});
payrollRouter.delete('/runs/:id', runsManage, async (req, res) => {
  res.json(await deleteRun(id(req), req.user!.sub));
});
payrollRouter.post('/runs/:id/submit', runsManage, async (req, res) => {
  res.json(await submitRun(id(req), req.user!.sub));
});
payrollRouter.post(
  '/runs/:id/approve',
  requirePermission('payroll.approve:all'),
  async (req, res) => {
    res.json(
      await approveRun(id(req), { userId: req.user!.sub, isAdmin: isAdmin(req.user!.accessLevel) }),
    );
  },
);
payrollRouter.post(
  '/runs/:id/reject',
  requirePermission('payroll.approve:all'),
  async (req, res) => {
    res.json(
      await rejectRun(
        id(req),
        { userId: req.user!.sub, isAdmin: isAdmin(req.user!.accessLevel) },
        rejectRunBody.parse(req.body),
      ),
    );
  },
);
payrollRouter.post(
  '/runs/:id/disburse',
  requirePermission('payroll.disburse:all'),
  async (req, res) => {
    res.json(await disburseRun(id(req), req.user!.sub));
  },
);

// A pure read that produces a file, so GET: it can be downloaded again, and the download is audited.
const bankFileCurrency = (value: unknown) => {
  const currency = typeof value === 'string' ? value.toUpperCase() : 'BDT';
  if (currency !== 'BDT' && currency !== 'USD')
    throw new AppError(400, `Unknown currency "${currency}" - expected BDT or USD`);
  return currency;
};
payrollRouter.get(
  '/runs/:id/bank-file',
  requirePermission('payroll.disburse:all'),
  async (req, res) => {
    const currency = bankFileCurrency(req.query['currency']);
    const result = await buildBankFile(id(req), currency);
    await prisma.$transaction((tx) =>
      writeAudit(tx, {
        entity: 'PAYROLL_RUN',
        entityId: id(req),
        action: 'EXPORT',
        changedBy: req.user!.sub,
        after: { bankFile: currency, rows: result.manifest.rows },
      }),
    );
    const filename = `payroll-${result.manifest.year}-${String(result.manifest.month).padStart(2, '0')}-${currency}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'X-Bankfile-Manifest, Content-Disposition');
    res.setHeader('X-Bankfile-Manifest', JSON.stringify(result.manifest));
    res.status(200).send(result.csv);
  },
);
payrollRouter.get(
  '/runs/:id/bank-file/summary',
  requirePermission('payroll.disburse:all'),
  async (req, res) => {
    res.json(await bankFileSummary(id(req)));
  },
);

// '/payslips/me' before '/payslips/:id', or Express would read "me" as an id.
payrollRouter.get('/payslips/me', async (req, res) => {
  res.json(await getMyPayslips(req.user!));
});
payrollRouter.get('/payslips/employee/:employeeId', async (req, res) => {
  res.json(await getEmployeePayslips(req.user!, String(req.params['employeeId'])));
});
payrollRouter.get('/payslips/:id', async (req, res) => {
  res.json(await getPayslip(req.user!, id(req)));
});

payrollRouter.get('/payslips/:id/pdf', async (req, res) => {
  // The same reach as the JSON read, so a PDF cannot leak a payslip the caller may not see.
  const payslip = await getPayslip(req.user!, id(req));
  const pdf = await renderPayslipPdf(payslip.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${payslip.payslipNo}.pdf"`);
  res.send(pdf);
});

payrollRouter.post('/runs/:id/email', runsManage, async (req, res) => {
  await claimEmailRun(id(req));
  // Queued, not awaited: rendering hundreds of PDFs is not a request. Progress is polled from /email-status.
  void emailPayslipsForRun(id(req)).catch((err) =>
    console.error('[payslip email] run failed', id(req), err),
  );
  res.status(202).json(await getEmailStatus(id(req)));
});
payrollRouter.get('/runs/:id/email-status', runsRead, async (req, res) => {
  res.json(await getEmailStatus(id(req)));
});

payrollRouter.get('/adjustments', requirePermission('payroll.read'), async (req, res) => {
  res.json(await listAdjustments(req.user!, adjustmentQuery.parse(req.query)));
});
payrollRouter.post('/adjustments', requirePermission('payroll.manage'), async (req, res) => {
  res.status(201).json(await createAdjustment(req.user!, adjustmentBody.parse(req.body)));
});
payrollRouter.delete('/adjustments/:id', requirePermission('payroll.manage'), async (req, res) => {
  res.json(await deleteAdjustment(req.user!, id(req)));
});
