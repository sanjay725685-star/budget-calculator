/**
 * ============================================================
 * PERSONAL BUDGET CALCULATOR — server.js  v2.1
 * Works both locally AND on Vercel serverless
 * ============================================================
 */

const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* ==========================================================
   DATABASE SETUP — sql.js (Pure JS SQLite)
   On Vercel: uses /tmp (writable temp folder)
   Locally:   uses ./database/budget.db (persistent)
   ========================================================== */

// Vercel ke liye /tmp use karo, locally database/ folder
const IS_VERCEL = process.env.VERCEL === '1';
const DB_DIR    = IS_VERCEL ? '/tmp' : path.join(__dirname, 'database');
const DB_FILE   = path.join(DB_DIR, 'budget.db');

if (!IS_VERCEL && !fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db;

async function initDatabase() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS budgets (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at            TEXT    DEFAULT (datetime('now','localtime')),
      entry_type            TEXT    DEFAULT 'manual',
      user_name             TEXT,
      age                   INTEGER,
      occupation            TEXT,
      family_members        INTEGER,
      earning_members       INTEGER,
      other_family_income   REAL    DEFAULT 0,
      total_income          REAL    DEFAULT 0,
      total_expenses        REAL    DEFAULT 0,
      monthly_savings       REAL    DEFAULT 0,
      savings_rate          REAL    DEFAULT 0,
      expense_ratio         REAL    DEFAULT 0,
      total_current_savings REAL    DEFAULT 0,
      assessment            TEXT,
      income_rows           TEXT,
      expense_rows          TEXT,
      savings_rows          TEXT
    )
  `);

  persistDB();
  console.log(`✅ sql.js database ready → ${DB_FILE}`);
}

function persistDB() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  } catch (e) {
    console.warn('DB persist warning:', e.message);
  }
}

function dbQuery(sql, params = []) {
  const stmt    = db.prepare(sql);
  const results = [];
  stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  persistDB();
  const row = dbQuery('SELECT last_insert_rowid() as id');
  return row[0] ? row[0].id : null;
}

/* ---------- Multer ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ['.xlsx','.xls','.csv'].includes(ext) ? cb(null, true) : cb(new Error('Only .xlsx, .xls, .csv allowed.'));
  }
});

/* ==========================================================
   API ROUTES
   ========================================================== */

app.get('/api/budgets', (req, res) => {
  try {
    const rows = dbQuery(`
      SELECT id, created_at, entry_type, user_name, age, occupation,
             family_members, earning_members, total_income, total_expenses,
             monthly_savings, savings_rate, expense_ratio, total_current_savings, assessment
      FROM budgets ORDER BY id DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/budget/:id', (req, res) => {
  try {
    const rows = dbQuery('SELECT * FROM budgets WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Record not found.' });
    const row = rows[0];
    row.income_rows  = JSON.parse(row.income_rows  || '[]');
    row.expense_rows = JSON.parse(row.expense_rows || '[]');
    row.savings_rows = JSON.parse(row.savings_rows || '[]');
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/budget', (req, res) => {
  try {
    const d = req.body;
    if (!d.user_name) return res.status(400).json({ success: false, error: 'user_name is required.' });

    const id = dbRun(`
      INSERT INTO budgets
        (entry_type, user_name, age, occupation, family_members, earning_members,
         other_family_income, total_income, total_expenses, monthly_savings,
         savings_rate, expense_ratio, total_current_savings, assessment,
         income_rows, expense_rows, savings_rows)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.entry_type || 'manual', d.user_name,
        d.age || null, d.occupation || '',
        d.family_members || null, d.earning_members || null,
        d.other_family_income || 0, d.total_income || 0,
        d.total_expenses || 0, d.monthly_savings || 0,
        d.savings_rate || 0, d.expense_ratio || 0,
        d.total_current_savings || 0, d.assessment || '',
        JSON.stringify(d.income_rows  || []),
        JSON.stringify(d.expense_rows || []),
        JSON.stringify(d.savings_rows || []),
      ]
    );
    res.json({ success: true, id, message: 'Budget record saved successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/budget/:id', (req, res) => {
  try {
    const before = dbQuery('SELECT id FROM budgets WHERE id = ?', [req.params.id]);
    if (!before.length) return res.status(404).json({ success: false, error: 'Record not found.' });
    dbRun('DELETE FROM budgets WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Record deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/import-excel', upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const incomeRows = [], expenseRows = [], savingsRows = [];

    const MONTHS          = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const incomeKeywords  = ['salary','income','wage','freelanc','allowance','dividend','rental','interest','revenue','earning'];
    const expenseKeywords = ['rent','housing','food','grocer','transport','fuel','education','electric','mobile','internet','medical','health','shop','entertain','insurance','emi','loan','expense','bill'];
    const savingsKeywords = ['saving','invest','fd','rd','ppf','mutual','fund','stock','gold','cash','deposit','sip'];

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows.length < 2) return;

      let headerRow = -1, typeCol = -1, catCol = -1;
      const monthCols = {};

      for (let ri = 0; ri < Math.min(rows.length, 10); ri++) {
        const row = rows[ri].map(c => String(c).toLowerCase().trim());
        if (MONTHS.filter(m => row.includes(m)).length >= 3) {
          headerRow = ri;
          row.forEach((cell, ci) => {
            if (MONTHS.includes(cell)) monthCols[cell] = ci;
            if (cell === 'type') typeCol = ci;
            if (['category','source','description','item'].includes(cell)) catCol = ci;
          });
          break;
        }
      }

      const startRow = headerRow >= 0 ? headerRow + 1 : 1;
      for (let ri = startRow; ri < rows.length; ri++) {
        const row = rows[ri];
        if (!row || row.every(c => c === '' || c === null)) continue;

        const cat    = catCol >= 0 ? String(row[catCol]||'').trim() : String(row[1]||row[0]||'').trim();
        if (!cat) continue;
        const catLow = cat.toLowerCase();
        if (['total','subtotal','sub-total','summary','grand total'].some(s => catLow.includes(s))) continue;

        const monthVals = Object.values(monthCols).map(ci => parseFloat(row[ci])||0).filter(v => v > 0);
        let avg = monthVals.length ? monthVals.reduce((a,b) => a+b, 0) / monthVals.length : 0;
        if (!avg) {
          for (let ci = 2; ci < row.length; ci++) {
            const v = parseFloat(row[ci]);
            if (!isNaN(v) && v > 0) { avg = v; break; }
          }
        }

        let type = typeCol >= 0 ? String(row[typeCol]||'').toLowerCase().trim() : '';
        if (!type || type === 'type') {
          if (incomeKeywords.some(k  => catLow.includes(k)))  type = 'income';
          else if (savingsKeywords.some(k => catLow.includes(k))) type = 'savings';
          else if (expenseKeywords.some(k => catLow.includes(k))) type = 'expense';
          else type = 'expense';
        }

        const entry = { source: cat, amount: Math.round(avg).toString() };
        if (type.includes('income'))                             incomeRows.push(entry);
        else if (type.includes('sav') || type.includes('inv'))  savingsRows.push(entry);
        else                                                     expenseRows.push(entry);
      }
    });

    res.json({
      success: true,
      message: `Parsed ${incomeRows.length} income, ${expenseRows.length} expense, ${savingsRows.length} savings rows.`,
      incomeRows, expenseRows, savingsRows,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to parse file: ' + err.message });
  }
});

app.get('/api/export-excel/:id', (req, res) => {
  try {
    const rows = dbQuery('SELECT * FROM budgets WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Record not found.' });
    const r = rows[0];
    const incRows = JSON.parse(r.income_rows  || '[]');
    const expRows = JSON.parse(r.expense_rows || '[]');
    const savRows = JSON.parse(r.savings_rows || '[]');

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['PERSONAL BUDGET SUMMARY'], ['Generated:', r.created_at], ['Entry Type:', r.entry_type], [''],
      ['Name:', r.user_name], ['Age:', r.age], ['Occupation:', r.occupation],
      ['Family Members:', r.family_members], ['Earning Members:', r.earning_members], [''],
      ['FINANCIAL SUMMARY'],
      ['Total Monthly Income',  `₹${r.total_income}`],
      ['Total Monthly Expenses',`₹${r.total_expenses}`],
      ['Monthly Savings',       `₹${r.monthly_savings}`],
      ['Current Savings/Investments', `₹${r.total_current_savings}`],
      ['Savings Rate',  `${Number(r.savings_rate).toFixed(1)}%`],
      ['Expense Ratio', `${Number(r.expense_ratio).toFixed(1)}%`],
      ['Assessment', r.assessment],
    ]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(
      [['Income Source','Monthly Amount (₹)'], ...incRows.map(x => [x.source, x.amount])]
    ), 'Income');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(
      [['Expense Category','Monthly Amount (₹)'], ...expRows.map(x => [x.source, x.amount])]
    ), 'Expenses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(
      [['Savings Source','Current Amount (₹)'], ...savRows.map(x => [x.source, x.amount])]
    ), 'Savings');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Disposition', `attachment; filename="Budget_${r.user_name}_${r.id}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================
   START — Works locally AND on Vercel
   ========================================================== */
initDatabase().then(() => {
  if (!IS_VERCEL) {
    // Local: start Express server normally
    app.listen(PORT, () => {
      console.log(`\n🚀 Personal Budget Calculator Server`);
      console.log(`   Open → http://localhost:${PORT}\n`);
    });
  }
}).catch(err => {
  console.error('❌ Database init failed:', err);
});

// Vercel ke liye app export karna zaroori hai
module.exports = app;
