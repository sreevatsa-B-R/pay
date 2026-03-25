const express = require('express');
const multer  = require('multer');
const { authenticate, requireAdmin, auditLog } = require('../middleware/auth');
const authCtrl      = require('../controllers/authController');
const empCtrl       = require('../controllers/employeeController');
const salaryCtrl    = require('../controllers/salaryController');
const exportCtrl    = require('../controllers/exportController');
const allowanceCtrl = require('../controllers/allowanceController');
const payoutCtrl    = require('../controllers/payoutController');
const fnfCtrl       = require('../controllers/fnfController');

const analyticsCtrl = require('../controllers/analyticsController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── AUTH ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.login);
router.get ('/auth/me',    authenticate, authCtrl.getMe);
router.put ('/auth/password', authenticate, authCtrl.changePassword);

// Admin user management
router.get ('/users',       authenticate, requireAdmin, authCtrl.getUsers);
router.post('/users',       authenticate, requireAdmin, authCtrl.createUser);
router.put ('/users/:id/toggle', authenticate, requireAdmin, authCtrl.toggleUser);

// ── EMPLOYEES ────────────────────────────────────────────────────────────────
router.get ('/employees',          authenticate, empCtrl.getAll);
router.get ('/employees/:empId',   authenticate, empCtrl.getOne);
router.post('/employees',          authenticate, requireAdmin, auditLog('CREATE','employees'), empCtrl.create);
router.put ('/employees/:empId',   authenticate, requireAdmin, auditLog('UPDATE','employees'), empCtrl.update);
router.delete('/employees/:empId', authenticate, requireAdmin, auditLog('DELETE','employees'), empCtrl.remove);

// ── SALARY ───────────────────────────────────────────────────────────────────
router.get ('/salary',        authenticate, salaryCtrl.getAll);
router.get ('/salary/summary', authenticate, salaryCtrl.getSummary);
router.post('/salary',        authenticate, requireAdmin, auditLog('UPSERT','salary_records'), salaryCtrl.upsert);
router.delete('/salary/:id',  authenticate, requireAdmin, auditLog('DELETE','salary_records'), salaryCtrl.remove);

// ── EXPORT (all roles) ───────────────────────────────────────────────────────
router.get('/export/employees/xlsx', authenticate, exportCtrl.exportEmployeesXLSX);
router.get('/export/employees/csv',  authenticate, exportCtrl.exportEmployeesCSV);
router.get('/export/salary/xlsx',    authenticate, exportCtrl.exportSalaryXLSX);
router.get('/export/salary/csv',     authenticate, exportCtrl.exportSalaryCSV);

// ── IMPORT (admin only) ──────────────────────────────────────────────────────
router.post('/import/employees', authenticate, requireAdmin, upload.single('file'), auditLog('IMPORT','employees'), exportCtrl.importEmployees);
router.post('/import/salary',    authenticate, requireAdmin, upload.single('file'), auditLog('IMPORT','salary_records'), exportCtrl.importSalary);

// ── TEMPLATES (admin only) ───────────────────────────────────────────────────
router.get('/templates/employees', authenticate, requireAdmin, exportCtrl.downloadEmpTemplate);
router.get('/templates/salary',    authenticate, requireAdmin, exportCtrl.downloadSalaryTemplate);

// ── ALLOWANCE TYPES ──────────────────────────────────────────────────────────
router.get   ('/allowance-types',        authenticate, allowanceCtrl.getAllTypes);
router.post  ('/allowance-types',        authenticate, requireAdmin, allowanceCtrl.createType);
router.put   ('/allowance-types/:id',    authenticate, requireAdmin, allowanceCtrl.updateType);
router.delete('/allowance-types/:id',    authenticate, requireAdmin, allowanceCtrl.deleteType);

// ── EMPLOYEE ALLOWANCES ───────────────────────────────────────────────────────
router.get   ('/allowances',                  authenticate, allowanceCtrl.getAllAllowances);
router.get   ('/allowances/summary',          authenticate, allowanceCtrl.getAllowanceSummary);
router.get   ('/allowances/employee/:emp_id', authenticate, allowanceCtrl.getEmpAllowances);
router.post  ('/allowances',                  authenticate, requireAdmin, allowanceCtrl.assignAllowance);
router.put   ('/allowances/:id',              authenticate, requireAdmin, allowanceCtrl.updateAllowance);
router.delete('/allowances/:id',              authenticate, requireAdmin, allowanceCtrl.deleteAllowance);

// ── PAYOUT ───────────────────────────────────────────────────────────────────
router.get   ('/payouts',              authenticate, payoutCtrl.getAll);
router.get   ('/payouts/summary',      authenticate, payoutCtrl.getPayoutSummary);
router.post  ('/payouts',              authenticate, requireAdmin, payoutCtrl.createPayout);
router.post  ('/payouts/generate',     authenticate, requireAdmin, payoutCtrl.generatePayouts);
router.put   ('/payouts/:id/status',   authenticate, requireAdmin, payoutCtrl.updateStatus);
router.put   ('/payouts/bulk-status',  authenticate, requireAdmin, payoutCtrl.bulkUpdateStatus);
router.delete('/payouts/:id',          authenticate, requireAdmin, payoutCtrl.deletePayout);

// ── F&F SETTLEMENT ────────────────────────────────────────────────────────────
router.get   ('/fnf',              authenticate, fnfCtrl.getAll);
router.get   ('/fnf/calculate',    authenticate, fnfCtrl.calculate);
router.get   ('/fnf/:id',          authenticate, fnfCtrl.getOne);
router.post  ('/fnf',              authenticate, requireAdmin, fnfCtrl.create);
router.put   ('/fnf/:id',          authenticate, requireAdmin, fnfCtrl.update);
router.put   ('/fnf/:id/status',   authenticate, requireAdmin, fnfCtrl.updateStatus);
router.delete('/fnf/:id',          authenticate, requireAdmin, fnfCtrl.remove);

// ── ANALYTICS & REPORTS ──────────────────────────────────────────────────────
router.get('/analytics/dashboard', authenticate, analyticsCtrl.getDashboardAnalytics);
router.get('/analytics/locations', authenticate, analyticsCtrl.getLocations);
router.get('/reports/payroll',     authenticate, analyticsCtrl.getPayrollReport);
router.get('/reports/payout',      authenticate, analyticsCtrl.getPayoutReport);
router.get('/reports/fnf',         authenticate, analyticsCtrl.getFnfReport);
router.get('/reports/allowances',  authenticate, analyticsCtrl.getAllowanceReport);

module.exports = router;
