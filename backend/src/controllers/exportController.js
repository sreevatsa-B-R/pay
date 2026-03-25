const ExcelJS = require('exceljs');
const { parse } = require('fast-csv');
const { Readable } = require('stream');
const { query, pool } = require('../config/db');

// ─── HELPERS ────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function styleHeader(ws, row, cols) {
  const headerRow = ws.getRow(row);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F0E0C' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFC9A84C' } },
      bottom: { style: 'thin', color: { argb: 'FFC9A84C' } },
      left: { style: 'thin' }, right: { style: 'thin' }
    };
  });
  headerRow.height = 22;
}

function currencyFmt(ws, col, startRow, endRow) {
  for (let r = startRow; r <= endRow; r++) {
    const cell = ws.getCell(r, col);
    cell.numFmt = '₹#,##0.00';
  }
}

// ─── EXPORT EMPLOYEES XLSX ──────────────────────────────────────────────────
const exportEmployeesXLSX = async (req, res) => {
  try {
    const result = await query('SELECT * FROM employees ORDER BY emp_id');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Payroll System'; wb.created = new Date();
    const ws = wb.addWorksheet('Employees', { views: [{ state: 'frozen', ySplit: 1 }] });

    ws.columns = [
      { header: 'Emp ID', key: 'emp_id', width: 12 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'CLIENT-LOB', key: 'client_lob', width: 18 },
      { header: 'Location', key: 'location', width: 16 },
      { header: 'State', key: 'state', width: 18 },
      { header: 'Date of Birth', key: 'date_of_birth', width: 14 },
      { header: 'Sex', key: 'sex', width: 8 },
      { header: 'Date of Joining', key: 'date_of_joining', width: 15 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'PAN/Aadhaar', key: 'pan_aadhaar', width: 16 },
      { header: 'Salary Mode', key: 'salary_mode', width: 14 },
      { header: 'Contact', key: 'contact', width: 14 },
      { header: 'Bank Name', key: 'bank_name', width: 18 },
      { header: 'Account No', key: 'account_no', width: 18 },
      { header: 'Active', key: 'is_active', width: 8 },
    ];

    styleHeader(ws, 1);
    result.rows.forEach(e => {
      ws.addRow({
        ...e,
        date_of_birth: e.date_of_birth ? new Date(e.date_of_birth).toISOString().slice(0,10) : '',
        date_of_joining: e.date_of_joining ? new Date(e.date_of_joining).toISOString().slice(0,10) : '',
        is_active: e.is_active ? 'Yes' : 'No'
      });
    });

    ws.autoFilter = { from: 'A1', to: 'P1' };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=employees_export.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
};

// ─── EXPORT EMPLOYEES CSV ───────────────────────────────────────────────────
const exportEmployeesCSV = async (req, res) => {
  try {
    const result = await query('SELECT * FROM employees ORDER BY emp_id');
    const headers = ['EmpID','Name','Designation','ClientLOB','Location','State','DOB','Sex','DOJ','Email','PAN','SalaryMode','Contact','Bank','AccountNo','Active'];
    const rows = result.rows.map(e => [
      e.emp_id, e.name, e.designation, e.client_lob, e.location, e.state,
      e.date_of_birth ? new Date(e.date_of_birth).toISOString().slice(0,10) : '',
      e.sex, e.date_of_joining ? new Date(e.date_of_joining).toISOString().slice(0,10) : '',
      e.email, e.pan_aadhaar, e.salary_mode, e.contact, e.bank_name, e.account_no,
      e.is_active ? 'Yes' : 'No'
    ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=employees_export.csv');
    res.send([headers.join(','), ...rows].join('\n'));
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
};

// ─── EXPORT SALARY XLSX ─────────────────────────────────────────────────────
const exportSalaryXLSX = async (req, res) => {
  try {
    const { month, year } = req.query;
    let sql = `SELECT sr.*, e.name, e.designation, e.location
               FROM salary_records sr JOIN employees e ON sr.emp_id=e.emp_id WHERE 1=1`;
    const params = [];
    if (month) { params.push(month); sql += ` AND sr.month=$${params.length}`; }
    if (year)  { params.push(year);  sql += ` AND sr.year=$${params.length}`; }
    sql += ' ORDER BY sr.year DESC, sr.month, e.name';

    const result = await query(sql, params);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Payroll System'; wb.created = new Date();
    const ws = wb.addWorksheet('Salary Records', { views: [{ state: 'frozen', ySplit: 1 }] });

    ws.columns = [
      { header: 'Emp ID', key: 'emp_id', width: 12 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Basic', key: 'basic', width: 12 },
      { header: 'HRA', key: 'hra', width: 12 },
      { header: 'Conv Allowance', key: 'conv_allowance', width: 15 },
      { header: 'Medical Allw', key: 'medical_allowance', width: 14 },
      { header: 'Special Allw', key: 'special_allowance', width: 14 },
      { header: 'Stat. Bonus', key: 'statutory_bonus', width: 13 },
      { header: 'Consultant Fee', key: 'consultant_fee', width: 15 },
      { header: 'Other Allw', key: 'other_allowances', width: 12 },
      { header: 'Leave Enc.', key: 'leave_encashment', width: 12 },
      { header: 'Gross Earnings', key: 'gross_earnings', width: 15 },
      { header: 'PF', key: 'pf', width: 10 },
      { header: 'PT', key: 'pt', width: 10 },
      { header: 'ESI', key: 'esi', width: 10 },
      { header: 'TDS', key: 'tds', width: 10 },
      { header: 'TDS LWF', key: 'tds_lwf', width: 10 },
      { header: 'GMI', key: 'gmi', width: 10 },
      { header: 'Other Ded.', key: 'other_deductions', width: 12 },
      { header: 'Total Deductions', key: 'total_deductions', width: 16 },
      { header: 'Net Pay', key: 'net_pay', width: 14 },
    ];

    styleHeader(ws, 1);
    const dataStart = 2;
    result.rows.forEach(r => {
      const row = ws.addRow(r);
      // Color Net Pay column green
      row.getCell('net_pay').font = { bold: true, color: { argb: 'FF3A6B35' } };
    });

    // Currency format for numeric cols
    const numCols = [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
    numCols.forEach(col => currencyFmt(ws, col, dataStart, dataStart + result.rows.length));

    ws.autoFilter = { from: 'A1', to: 'W1' };

    // Totals row
    if (result.rows.length) {
      const totalsRow = ws.addRow({
        emp_id: 'TOTAL', name: '', month: '', year: '',
        basic: { formula: `SUM(E${dataStart}:E${dataStart+result.rows.length-1})` },
        hra: { formula: `SUM(F${dataStart}:F${dataStart+result.rows.length-1})` },
        gross_earnings: { formula: `SUM(N${dataStart}:N${dataStart+result.rows.length-1})` },
        total_deductions: { formula: `SUM(V${dataStart}:V${dataStart+result.rows.length-1})` },
        net_pay: { formula: `SUM(W${dataStart}:W${dataStart+result.rows.length-1})` },
      });
      totalsRow.font = { bold: true };
      totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E7' } };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=salary_${month||'all'}_${year||'all'}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
};

// ─── EXPORT SALARY CSV ──────────────────────────────────────────────────────
const exportSalaryCSV = async (req, res) => {
  try {
    const { month, year } = req.query;
    let sql = `SELECT sr.*, e.name FROM salary_records sr JOIN employees e ON sr.emp_id=e.emp_id WHERE 1=1`;
    const params = [];
    if (month) { params.push(month); sql += ` AND sr.month=$${params.length}`; }
    if (year)  { params.push(year);  sql += ` AND sr.year=$${params.length}`; }
    sql += ' ORDER BY sr.year DESC, sr.month, e.name';

    const result = await query(sql, params);
    const headers = ['EmpID','Name','Month','Year','Basic','HRA','Conv','Med','Spl','Stat','Consult','Allw','Leave','Gross','PF','PT','ESI','TDS','LWF','GMI','OtherDed','TotalDed','NetPay'];
    const rows = result.rows.map(r => [
      r.emp_id, r.name, r.month, r.year,
      r.basic, r.hra, r.conv_allowance, r.medical_allowance, r.special_allowance,
      r.statutory_bonus, r.consultant_fee, r.other_allowances, r.leave_encashment,
      r.gross_earnings, r.pf, r.pt, r.esi, r.tds, r.tds_lwf, r.gmi, r.other_deductions,
      r.total_deductions, r.net_pay
    ].join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=salary_export.csv');
    res.send([headers.join(','), ...rows].join('\n'));
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
};

// ─── IMPORT EMPLOYEES (XLSX or CSV) ─────────────────────────────────────────
const importEmployees = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = req.file.originalname.split('.').pop().toLowerCase();

    let rows = [];

    if (ext === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      const headers = [];
      ws.getRow(1).eachCell(c => headers.push(String(c.value||'').trim()));
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const obj = {};
        row.eachCell((cell, colNum) => {
          obj[headers[colNum-1]] = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
        });
        if (obj['EmpID'] || obj['Emp ID']) rows.push(obj);
      });
    } else {
      // CSV
      await new Promise((resolve, reject) => {
        const stream = Readable.from(req.file.buffer.toString());
        stream.pipe(parse({ headers: true, trim: true }))
          .on('data', row => rows.push(row))
          .on('end', resolve)
          .on('error', reject);
      });
    }

    let added = 0, updated = 0, errors = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const empId = row['EmpID'] || row['Emp ID'] || row['emp_id'];
        const name  = row['Name'] || row['name'];
        if (!empId || !name) continue;
        // Sanitize and parse date fields to valid format
        const parseDate = (val) => {
          if (!val) return null;
          const str = String(val).trim();
          // If already YYYY-MM-DD, return as is
          if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
          // Try to parse JS date string like 'Tue May 15 1990 05:30:00 (India Standard Time)'
          const d = new Date(str);
          if (!isNaN(d.getTime())) {
            // Format to YYYY-MM-DD
            return d.toISOString().slice(0,10);
          }
          // Remove known problematic substrings and try again
          const cleaned = str.replace(/\(.*\)/, '').replace(/gmt\+0530/gi, '').trim();
          const d2 = new Date(cleaned);
          if (!isNaN(d2.getTime())) return d2.toISOString().slice(0,10);
          return null;
        };
        const dob = parseDate(row['DOB']||row['date_of_birth']||null);
        const doj = parseDate(row['DOJ']||row['date_of_joining']||null);
        try {
          const r = await client.query(`
            INSERT INTO employees (emp_id, name, designation, client_lob, location, state,
              date_of_birth, sex, date_of_joining, email, pan_aadhaar, salary_mode, contact,
              bank_name, account_no, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            ON CONFLICT (emp_id) DO UPDATE SET
              name=$2, designation=$3, client_lob=$4, location=$5, state=$6,
              date_of_birth=$7, sex=$8, date_of_joining=$9, email=$10, pan_aadhaar=$11,
              salary_mode=$12, contact=$13, bank_name=$14, account_no=$15, updated_at=NOW()`,
            [empId, name,
             row['Designation']||row['designation']||null,
             row['ClientLOB']||row['CLIENT-LOB']||row['client_lob']||null,
             row['Location']||row['location']||null,
             row['State']||row['state']||null,
             dob,
             row['Sex']||row['sex']||null,
             doj,
             row['Email']||row['email']||null,
             row['PAN']||row['pan_aadhaar']||null,
             row['SalaryMode']||row['salary_mode']||null,
             row['Contact']||row['contact']||null,
             row['Bank']||row['bank_name']||null,
             row['AccountNo']||row['account_no']||null,
             req.user.id]
          );
          r.rowCount > 0 ? added++ : updated++;
        } catch (rowErr) {
          errors.push({ empId, error: rowErr.message });
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }

    res.json({ message: 'Import complete', added, updated, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
};

// ─── IMPORT SALARY (XLSX or CSV) ─────────────────────────────────────────────
const importSalary = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let rows = [];

    if (ext === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      const headers = [];
      ws.getRow(1).eachCell(c => headers.push(String(c.value||'').trim()));
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const obj = {};
        row.eachCell((cell, colNum) => {
          obj[headers[colNum-1]] = cell.value !== null ? String(cell.value).trim() : '';
        });
        if (obj['EmpID'] || obj['emp_id']) rows.push(obj);
      });
    } else {
      await new Promise((resolve, reject) => {
        const stream = Readable.from(req.file.buffer.toString());
        stream.pipe(parse({ headers: true, trim: true }))
          .on('data', row => rows.push(row))
          .on('end', resolve).on('error', reject);
      });
    }

    const n = v => parseFloat(v) || 0;
    let added = 0, updated = 0, errors = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const empId = row['EmpID']||row['emp_id'];
        const month = row['Month']||row['month'];
        const year  = row['Year']||row['year'];
        if (!empId || !month || !year) continue;
        try {
          await client.query(`
            INSERT INTO salary_records
              (emp_id, month, year, basic, hra, conv_allowance, medical_allowance,
               special_allowance, statutory_bonus, consultant_fee, other_allowances,
               leave_encashment, pf, pt, esi, tds, tds_lwf, gmi, other_deductions, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            ON CONFLICT (emp_id, month, year) DO UPDATE SET
              basic=$4, hra=$5, conv_allowance=$6, medical_allowance=$7, special_allowance=$8,
              statutory_bonus=$9, consultant_fee=$10, other_allowances=$11, leave_encashment=$12,
              pf=$13, pt=$14, esi=$15, tds=$16, tds_lwf=$17, gmi=$18, other_deductions=$19,
              updated_at=NOW()`,
            [empId, month, parseInt(year),
             n(row['Basic']||row['basic']), n(row['HRA']||row['hra']),
             n(row['Conv']||row['conv_allowance']), n(row['Med']||row['medical_allowance']),
             n(row['Spl']||row['special_allowance']), n(row['Stat']||row['statutory_bonus']),
             n(row['Consult']||row['consultant_fee']), n(row['Allw']||row['other_allowances']),
             n(row['Leave']||row['leave_encashment']),
             n(row['PF']||row['pf']), n(row['PT']||row['pt']),
             n(row['ESI']||row['esi']), n(row['TDS']||row['tds']),
             n(row['LWF']||row['tds_lwf']), n(row['GMI']||row['gmi']),
             n(row['OtherDed']||row['other_deductions']),
             req.user.id]
          );
          added++;
        } catch (rowErr) {
          errors.push({ empId, month, year, error: rowErr.message });
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }

    res.json({ message: 'Import complete', added, updated, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
};

// ─── DOWNLOAD TEMPLATES ─────────────────────────────────────────────────────
const downloadEmpTemplate = async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees Template');
  ws.columns = [
    { header: 'EmpID', key: 'EmpID', width: 12 },
    { header: 'Name', key: 'Name', width: 22 },
    { header: 'Designation', key: 'Designation', width: 20 },
    { header: 'ClientLOB', key: 'ClientLOB', width: 18 },
    { header: 'Location', key: 'Location', width: 16 },
    { header: 'State', key: 'State', width: 18 },
    { header: 'DOB', key: 'DOB', width: 14 },
    { header: 'Sex', key: 'Sex', width: 8 },
    { header: 'DOJ', key: 'DOJ', width: 14 },
    { header: 'Email', key: 'Email', width: 26 },
    { header: 'PAN', key: 'PAN', width: 16 },
    { header: 'SalaryMode', key: 'SalaryMode', width: 15 },
    { header: 'Contact', key: 'Contact', width: 14 },
    { header: 'Bank', key: 'Bank', width: 18 },
    { header: 'AccountNo', key: 'AccountNo', width: 18 },
  ];
  styleHeader(ws, 1);
  ws.addRow(['EMP001','John Doe','Manager','ACME-Retail','Mumbai','Maharashtra','1990-05-15','Male','2022-01-10','john@example.com','ABCDE1234F','Bank Transfer','9876543210','HDFC Bank','12345678901']);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=employees_template.xlsx');
  await wb.xlsx.write(res); res.end();
};

const downloadSalaryTemplate = async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Salary Template');
  ws.columns = [
    { header: 'EmpID', key: 'EmpID', width: 12 },
    { header: 'Month', key: 'Month', width: 12 },
    { header: 'Year', key: 'Year', width: 8 },
    { header: 'Basic', key: 'Basic', width: 12 },
    { header: 'HRA', key: 'HRA', width: 12 },
    { header: 'Conv', key: 'Conv', width: 12 },
    { header: 'Med', key: 'Med', width: 12 },
    { header: 'Spl', key: 'Spl', width: 12 },
    { header: 'Stat', key: 'Stat', width: 12 },
    { header: 'Consult', key: 'Consult', width: 12 },
    { header: 'Allw', key: 'Allw', width: 12 },
    { header: 'Leave', key: 'Leave', width: 12 },
    { header: 'PF', key: 'PF', width: 10 },
    { header: 'PT', key: 'PT', width: 10 },
    { header: 'ESI', key: 'ESI', width: 10 },
    { header: 'TDS', key: 'TDS', width: 10 },
    { header: 'LWF', key: 'LWF', width: 10 },
    { header: 'GMI', key: 'GMI', width: 10 },
    { header: 'OtherDed', key: 'OtherDed', width: 12 },
  ];
  styleHeader(ws, 1);
  ws.addRow(['EMP001','March',2025,25000,10000,1600,1250,5000,1750,0,0,0,1800,200,0,0,0,0,0]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=salary_template.xlsx');
  await wb.xlsx.write(res); res.end();
};

module.exports = {
  exportEmployeesXLSX, exportEmployeesCSV,
  exportSalaryXLSX, exportSalaryCSV,
  importEmployees, importSalary,
  downloadEmpTemplate, downloadSalaryTemplate
};
