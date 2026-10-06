/* ============================================================
   PERSONAL BUDGET CALCULATOR — script.js  v2.0
   Backend-connected version
   - All calculations + validation (same as before)
   - API calls to Node.js backend (save / load / delete records)
   - Excel upload via backend API (SheetJS parsed server-side)
   - localStorage as draft cache
   ============================================================ */

'use strict';

/* ==========================================================
   CONFIG
   ========================================================== */

// Backend API base URL — same origin (served by server.js)
const API_BASE = window.location.origin + '/api';

const INCOME_SOURCES = [
  'Salary','Business','Freelancing','Allowance',
  'Investment/Interest','Rental Income','Other Income'
];
const EXPENSE_CATEGORIES = [
  'Rent/Housing','Food/Groceries','Transportation','Education',
  'Electricity','Mobile/Internet','Medical','Shopping',
  'Entertainment','Insurance','EMI/Loans','Other Expenses'
];
const SAVINGS_SOURCES = [
  'Bank Savings Account','Fixed Deposit','Recurring Deposit',
  'Mutual Funds','Stocks','PPF','Gold','Cash','Other Savings'
];

/* ==========================================================
   STATE
   ========================================================== */
let currentSection   = 1;
const TOTAL_SECTIONS = 5;

// Stores the last calculated results (needed for saving to DB)
let lastResults = {};

// Track what type of entry this is ('manual' or 'excel')
let entryType = 'manual';

/* ==========================================================
   INIT
   ========================================================== */
document.addEventListener('DOMContentLoaded', () => {
  restoreFromStorage();
  initDefaultRows();
  updateProgress();

  document.getElementById('btnReset').addEventListener('click', () => {
    document.getElementById('resetModal').classList.add('open');
  });

  document.getElementById('otherFamilyIncome').addEventListener('input', () => {
    recalculateIncomeTotals();
    saveToStorage();
  });

  ['userName','userAge','occupation','familyMembers','earningMembers','otherFamilyIncome']
    .forEach(id => document.getElementById(id).addEventListener('input', saveToStorage));
});

/* ==========================================================
   DEFAULT ROWS
   ========================================================== */
function initDefaultRows() {
  const saved = localStorage.getItem('budgetCalcData');
  if (saved) return;

  addIncomeRow('Salary', 0);
  addIncomeRow('Investment/Interest', 0);
  addIncomeRow('Other Income', 0);

  addExpenseRow('Rent/Housing', 0);
  addExpenseRow('Food/Groceries', 0);
  addExpenseRow('Transportation', 0);
  addExpenseRow('Electricity', 0);
  addExpenseRow('Mobile/Internet', 0);
  addExpenseRow('Medical', 0);
  addExpenseRow('Other Expenses', 0);

  addSavingsRow('Bank Savings Account', 0);
  addSavingsRow('Fixed Deposit', 0);
  addSavingsRow('Mutual Funds', 0);
}

/* ==========================================================
   NAVIGATION
   ========================================================== */
function nextSection(from) {
  if (!validateSection(from)) return;
  saveToStorage();
  currentSection = from + 1;
  showSection(currentSection);
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Show Excel import banner on section 2
  document.getElementById('excelBanner').style.display = currentSection === 2 ? 'block' : 'none';
}

function prevSection(from) {
  saveToStorage();
  currentSection = from - 1;
  showSection(currentSection);
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('excelBanner').style.display = currentSection === 2 ? 'block' : 'none';
}

function showSection(num) {
  for (let i = 1; i <= TOTAL_SECTIONS; i++) {
    const el = document.getElementById('section' + i);
    if (el) el.classList.toggle('active', i === num);
  }
}

function updateProgress() {
  const pct = (currentSection / TOTAL_SECTIONS) * 100;
  document.getElementById('progressBar').style.width = pct + '%';
  document.querySelectorAll('.step').forEach(step => {
    const n = parseInt(step.dataset.step);
    step.classList.remove('active', 'done');
    if (n === currentSection)     step.classList.add('active');
    else if (n < currentSection)  step.classList.add('done');
  });
}

/* ==========================================================
   VALIDATION
   ========================================================== */
function validateSection(num) {
  clearErrors();
  let valid = true;

  if (num === 1) {
    const name = document.getElementById('userName').value.trim();
    if (!name) { showError('userName','Please enter your name.'); valid = false; }

    const age = parseFloat(document.getElementById('userAge').value);
    if (!age || age < 1 || age > 120 || !Number.isInteger(age)) {
      showError('userAge','Enter a valid age between 1 and 120.'); valid = false;
    }

    if (!document.getElementById('occupation').value) {
      showError('occupation','Please select your occupation.'); valid = false;
    }

    const family  = parseInt(document.getElementById('familyMembers').value);
    const earning = parseInt(document.getElementById('earningMembers').value);

    if (!family || family < 1 || !Number.isInteger(family)) {
      showError('familyMembers','Enter a valid number of family members (minimum 1).'); valid = false;
    }
    if (!earning || earning < 1 || !Number.isInteger(earning)) {
      showError('earningMembers','Enter a valid number of earning members (minimum 1).'); valid = false;
    } else if (family && earning > family) {
      showError('earningMembers','Earning members cannot exceed total family members.'); valid = false;
    }

    const otherInc = parseFloat(document.getElementById('otherFamilyIncome').value);
    if (isNaN(otherInc) || otherInc < 0) {
      showError('otherFamilyIncome','Enter 0 or a positive amount.'); valid = false;
    }
  }

  if (num === 2) {
    const amounts = document.querySelectorAll('#incomeRowsContainer .row-amount-input');
    let hasPositive = false;
    amounts.forEach(inp => {
      const v = parseFloat(inp.value);
      if (!isNaN(v) && v > 0) hasPositive = true;
      if (!isNaN(v) && v < 0) { inp.classList.add('error-field'); valid = false; }
    });
    if (!hasPositive) {
      alert('Please enter at least one income source with an amount greater than 0.');
      valid = false;
    }
  }

  if (num === 3) {
    const amounts = document.querySelectorAll('#expenseRowsContainer .row-amount-input');
    amounts.forEach(inp => {
      if (!isNaN(parseFloat(inp.value)) && parseFloat(inp.value) < 0) {
        inp.classList.add('error-field'); valid = false;
      }
    });
    if (!valid) alert('Expense amounts cannot be negative.');
  }

  if (num === 4) {
    const amounts = document.querySelectorAll('#savingsRowsContainer .row-amount-input');
    amounts.forEach(inp => {
      if (!isNaN(parseFloat(inp.value)) && parseFloat(inp.value) < 0) {
        inp.classList.add('error-field'); valid = false;
      }
    });
    if (!valid) alert('Savings amounts cannot be negative.');
  }

  return valid;
}

function showError(fieldId, msg) {
  const field = document.getElementById(fieldId);
  const span  = document.getElementById('err-' + fieldId);
  if (field) field.classList.add('error-field');
  if (span)  span.textContent = msg;
}

function clearErrors() {
  document.querySelectorAll('.error-field').forEach(el => el.classList.remove('error-field'));
  document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
}

/* ==========================================================
   DYNAMIC ROWS
   ========================================================== */
function buildSelect(options, selected) {
  return options.map(o =>
    `<option value="${o}" ${o === selected ? 'selected' : ''}>${o}</option>`
  ).join('');
}

function addIncomeRow(source = '', amount = '') {
  const container = document.getElementById('incomeRowsContainer');
  const row = document.createElement('div');
  row.className = 'dynamic-row';
  row.innerHTML = `
    <select onchange="recalculateIncomeTotals(); saveToStorage()">
      ${buildSelect(INCOME_SOURCES, source)}
    </select>
    <div class="row-amount-wrap">
      <span class="row-currency-sign">₹</span>
      <input type="number" class="row-amount-input" min="0" placeholder="0" value="${amount}"
             oninput="recalculateIncomeTotals(); saveToStorage()" />
    </div>
    <button class="btn-delete-row" onclick="deleteRow(this,'income')">✕</button>`;
  container.appendChild(row);
  recalculateIncomeTotals();
}

function addExpenseRow(category = '', amount = '') {
  const container = document.getElementById('expenseRowsContainer');
  const row = document.createElement('div');
  row.className = 'dynamic-row';
  row.innerHTML = `
    <select onchange="saveToStorage()">
      ${buildSelect(EXPENSE_CATEGORIES, category)}
    </select>
    <div class="row-amount-wrap">
      <span class="row-currency-sign">₹</span>
      <input type="number" class="row-amount-input" min="0" placeholder="0" value="${amount}"
             oninput="recalculateExpenseTotals(); saveToStorage()" />
    </div>
    <button class="btn-delete-row" onclick="deleteRow(this,'expense')">✕</button>`;
  container.appendChild(row);
  recalculateExpenseTotals();
}

function addSavingsRow(src = '', amount = '') {
  const container = document.getElementById('savingsRowsContainer');
  const row = document.createElement('div');
  row.className = 'dynamic-row';
  row.innerHTML = `
    <select onchange="saveToStorage()">
      ${buildSelect(SAVINGS_SOURCES, src)}
    </select>
    <div class="row-amount-wrap">
      <span class="row-currency-sign">₹</span>
      <input type="number" class="row-amount-input" min="0" placeholder="0" value="${amount}"
             oninput="recalculateSavingsTotals(); saveToStorage()" />
    </div>
    <button class="btn-delete-row" onclick="deleteRow(this,'savings')">✕</button>`;
  container.appendChild(row);
  recalculateSavingsTotals();
}

function deleteRow(btn, type) {
  btn.closest('.dynamic-row').remove();
  if (type === 'income')  recalculateIncomeTotals();
  if (type === 'expense') recalculateExpenseTotals();
  if (type === 'savings') recalculateSavingsTotals();
  saveToStorage();
}

/* ==========================================================
   CALCULATIONS
   ========================================================== */
function sumAmounts(containerId) {
  let total = 0;
  document.querySelectorAll(`#${containerId} .row-amount-input`).forEach(inp => {
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v >= 0) total += v;
  });
  return total;
}

function recalculateIncomeTotals() {
  const primary = sumAmounts('incomeRowsContainer');
  const other   = parseFloat(document.getElementById('otherFamilyIncome').value) || 0;
  document.getElementById('primaryIncomeDisplay').textContent    = formatCurrency(primary);
  document.getElementById('otherFamilyIncomeDisplay').textContent = formatCurrency(other);
  document.getElementById('totalIncomeDisplay').textContent      = formatCurrency(primary + other);
}

function recalculateExpenseTotals() {
  document.getElementById('totalExpenseDisplay').textContent = formatCurrency(sumAmounts('expenseRowsContainer'));
}

function recalculateSavingsTotals() {
  document.getElementById('totalSavingsDisplay').textContent = formatCurrency(sumAmounts('savingsRowsContainer'));
}

/* ==========================================================
   CALCULATE BUDGET + SHOW SUMMARY
   ========================================================== */
function calculateBudget() {
  if (!validateSection(4)) return;
  saveToStorage();

  const primaryIncome = sumAmounts('incomeRowsContainer');
  const otherFamily   = parseFloat(document.getElementById('otherFamilyIncome').value) || 0;
  const totalIncome   = primaryIncome + otherFamily;
  const totalExpenses = sumAmounts('expenseRowsContainer');
  const totalSavings  = sumAmounts('savingsRowsContainer');
  const monthly       = totalIncome - totalExpenses;
  const savingsRate   = totalIncome > 0 ? (monthly / totalIncome) * 100 : 0;
  const expenseRatio  = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  // Store results for DB save
  lastResults = {
    totalIncome, totalExpenses, totalSavings,
    monthlySavings: monthly, savingsRate, expenseRatio
  };

  const name = document.getElementById('userName').value.trim() || 'User';
  document.getElementById('summarySubtitle').textContent = `Hi ${name}! Here's a snapshot of your monthly finances.`;

  document.getElementById('kpi-income').textContent      = formatCurrency(totalIncome);
  document.getElementById('kpi-expense').textContent     = formatCurrency(totalExpenses);
  document.getElementById('kpi-savings').textContent     = formatCurrency(monthly);
  document.getElementById('kpi-investments').textContent = formatCurrency(totalSavings);
  document.getElementById('kpi-savingsRate').textContent = formatPct(savingsRate);
  document.getElementById('kpi-expenseRatio').textContent = formatPct(expenseRatio);

  const expPct = Math.min(expenseRatio, 100);
  const savPct = Math.max(0, Math.min(savingsRate, 100));
  document.getElementById('barExpense').style.width  = expPct + '%';
  document.getElementById('barSavings').style.width  = savPct + '%';
  document.getElementById('barExpensePct').textContent = formatPct(expenseRatio);
  document.getElementById('barSavingsPct').textContent = formatPct(savingsRate);

  renderAssessment(savingsRate, monthly, totalIncome, expenseRatio);

  // Reset save button
  const btn = document.getElementById('btnSaveRecord');
  btn.textContent = '💾 Save Record';
  btn.disabled = false;

  currentSection = 5;
  showSection(5);
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==========================================================
   ASSESSMENT
   ========================================================== */
function getAssessmentRating(savingsRate) {
  if (savingsRate >= 30)  return 'Excellent';
  if (savingsRate >= 20)  return 'Good';
  if (savingsRate >= 10)  return 'Needs Improvement';
  return 'Critical';
}

function renderAssessment(savingsRate, monthlySavings, totalIncome, expenseRatio) {
  const badge   = document.getElementById('assessmentBadge');
  const explain = document.getElementById('assessmentExplanation');
  const tips    = document.getElementById('assessmentTips');
  const icon    = document.getElementById('assessmentIcon');
  badge.className = 'assessment-badge';

  let rating, badgeClass, explanation, tipsList, iconText;

  if (totalIncome === 0) {
    rating = 'No Income Data'; badgeClass = 'badge-critical'; iconText = '⚠️';
    explanation = 'No income was entered. Please go back and add at least one income source.';
    tipsList = [];
  } else if (savingsRate >= 30) {
    rating = '🌟 Excellent'; badgeClass = 'badge-excellent'; iconText = '🌟';
    explanation = `Your savings rate of ${formatPct(savingsRate)} is outstanding! You are saving more than 30% of your income — a very strong financial habit.`;
    tipsList = [
      { icon:'📈', text:'Invest in diversified instruments like mutual funds, PPF, and index funds.' },
      { icon:'🎯', text:'Set specific financial goals — retirement, home, or education fund.' },
      { icon:'🛡️', text:'Ensure you have an emergency fund covering 6 months of expenses.' },
    ];
  } else if (savingsRate >= 20) {
    rating = '👍 Good'; badgeClass = 'badge-good'; iconText = '👍';
    explanation = `Your savings rate of ${formatPct(savingsRate)} is good (20–29%). With a few small adjustments, you can reach an excellent financial position.`;
    tipsList = [
      { icon:'💡', text:'Try to increase savings by 2–5% every year as income grows.' },
      { icon:'🔄', text:'Automate savings via SIPs or recurring deposits to build discipline.' },
      { icon:'🏦', text:'Review investment options to make your savings work harder.' },
    ];
  } else if (savingsRate >= 10) {
    rating = '⚠️ Needs Improvement'; badgeClass = 'badge-improve'; iconText = '⚠️';
    explanation = `Your savings rate of ${formatPct(savingsRate)} is below the recommended level. Aim for at least 20%. Your expense ratio is ${formatPct(expenseRatio)}.`;
    tipsList = [
      { icon:'✂️', text:'Identify one or two non-essential expense categories and reduce by 10–20%.' },
      { icon:'📋', text:'Track daily spending using a notebook or budget app for 30 days.' },
      { icon:'📦', text:'Start a small recurring deposit — even ₹500/month builds confidence.' },
      { icon:'🎯', text:'Set a monthly savings target and treat it like a fixed expense.' },
    ];
  } else {
    rating = '🚨 Critical'; badgeClass = 'badge-critical'; iconText = '🚨';
    explanation = `Your savings rate of ${formatPct(savingsRate)} is critically low (below 10%). Expenses are consuming most of your income. Immediate review recommended.`;
    tipsList = [
      { icon:'📊', text:'Review every expense category and identify the largest spending areas.' },
      { icon:'❌', text:'Temporarily pause all non-essential spending.' },
      { icon:'💬', text:'Consider speaking with a financial advisor about restructuring expenses.' },
      { icon:'📈', text:'Explore ways to increase income — freelancing, part-time work, or skill development.' },
    ];
  }

  badge.textContent = rating;
  badge.classList.add(badgeClass);
  icon.textContent = iconText;
  explain.textContent = explanation;
  tips.innerHTML = tipsList.map(t =>
    `<div class="tip-item"><span class="tip-icon">${t.icon}</span><span>${t.text}</span></div>`
  ).join('');

  // Store assessment rating text for DB save
  lastResults.assessment = rating.replace(/[🌟👍⚠️🚨]/g,'').trim();
}

/* ==========================================================
   FORMATTING
   ========================================================== */
function formatCurrency(v) {
  if (isNaN(v)) return '₹0';
  return '₹' + Math.round(v).toLocaleString('en-IN');
}
function formatPct(v) {
  if (isNaN(v) || !isFinite(v)) return '0.0%';
  return v.toFixed(1) + '%';
}

/* ==========================================================
   EXCEL UPLOAD → BACKEND API
   ========================================================== */

/**
 * Called when user selects an Excel file.
 * Sends it to the backend API which parses it with SheetJS.
 * On success, fills all income/expense/savings rows automatically.
 */
async function handleExcelUpload(input) {
  const file = input.files[0];
  if (!file) return;

  showLoading('Parsing Excel file...');

  const formData = new FormData();
  formData.append('excelFile', file);

  try {
    const res  = await fetch(`${API_BASE}/import-excel`, { method: 'POST', body: formData });
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    // Clear all existing rows
    document.getElementById('incomeRowsContainer').innerHTML  = '';
    document.getElementById('expenseRowsContainer').innerHTML = '';
    document.getElementById('savingsRowsContainer').innerHTML = '';

    // Fill rows from parsed data
    if (data.incomeRows.length)  data.incomeRows.forEach(r  => addIncomeRow(r.source,  r.amount));
    else addIncomeRow();

    if (data.expenseRows.length) data.expenseRows.forEach(r => addExpenseRow(r.source, r.amount));
    else addExpenseRow();

    if (data.savingsRows.length) data.savingsRows.forEach(r => addSavingsRow(r.source, r.amount));
    else addSavingsRow();

    entryType = 'excel'; // Mark this record as Excel-imported
    saveToStorage();

    hideLoading();
    showToast(`✅ ${data.message}`, 'success');

    // Jump to income section to review
    currentSection = 2;
    showSection(2);
    updateProgress();
    document.getElementById('excelBanner').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    hideLoading();
    showToast('❌ ' + err.message, 'error');
  }

  // Reset the file input so user can upload same file again
  input.value = '';
}

/* ==========================================================
   SAVE RECORD TO DATABASE
   ========================================================== */

/**
 * Collects all form data + calculated results and sends
 * a POST request to the backend API to save it in SQLite.
 */
async function saveRecordToDB() {
  const btn = document.getElementById('btnSaveRecord');
  btn.disabled = true;
  btn.textContent = '⏳ Saving...';

  const payload = {
    entry_type:           entryType,
    user_name:            document.getElementById('userName').value.trim(),
    age:                  parseInt(document.getElementById('userAge').value)        || null,
    occupation:           document.getElementById('occupation').value,
    family_members:       parseInt(document.getElementById('familyMembers').value)  || null,
    earning_members:      parseInt(document.getElementById('earningMembers').value) || null,
    other_family_income:  parseFloat(document.getElementById('otherFamilyIncome').value) || 0,
    total_income:         lastResults.totalIncome         || 0,
    total_expenses:       lastResults.totalExpenses       || 0,
    monthly_savings:      lastResults.monthlySavings      || 0,
    savings_rate:         lastResults.savingsRate         || 0,
    expense_ratio:        lastResults.expenseRatio        || 0,
    total_current_savings: lastResults.totalSavings       || 0,
    assessment:           lastResults.assessment          || '',
    income_rows:          collectRows('incomeRowsContainer'),
    expense_rows:         collectRows('expenseRowsContainer'),
    savings_rows:         collectRows('savingsRowsContainer'),
  };

  try {
    const res  = await fetch(`${API_BASE}/budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    btn.textContent = '✅ Saved!';
    showToast('Budget record saved successfully!', 'success');

    // Reset entry type back to manual for next entry
    entryType = 'manual';

  } catch (err) {
    btn.disabled = false;
    btn.textContent = '💾 Save Record';
    showToast('❌ Could not save: ' + err.message, 'error');
  }
}

/* ==========================================================
   VIEW ALL RECORDS MODAL
   ========================================================== */

async function openRecordsModal() {
  document.getElementById('recordsModal').classList.add('open');
  document.getElementById('recordsContent').innerHTML =
    '<p style="text-align:center;padding:2rem;color:#9ca3af;">Loading records...</p>';

  try {
    const res  = await fetch(`${API_BASE}/budgets`);
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    if (data.data.length === 0) {
      document.getElementById('recordsContent').innerHTML = `
        <div class="empty-records">
          <div class="empty-icon">📋</div>
          <p>No records saved yet.</p>
          <p style="font-size:0.8rem;margin-top:0.5rem;">Fill in the form and click "💾 Save Record" to save your first budget.</p>
        </div>`;
      return;
    }

    // Build records table
    let html = `
      <div style="overflow-x:auto;">
      <table class="records-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Type</th>
            <th>Date</th>
            <th>Income</th>
            <th>Expenses</th>
            <th>Savings Rate</th>
            <th>Assessment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>`;

    data.data.forEach(r => {
      const date = new Date(r.created_at).toLocaleDateString('en-IN', {
        day:'2-digit', month:'short', year:'numeric'
      });
      const typeBadge = r.entry_type === 'excel'
        ? '<span class="badge-entry badge-excel">📊 Excel</span>'
        : '<span class="badge-entry badge-manual">✏️ Manual</span>';
      html += `
        <tr>
          <td>${r.id}</td>
          <td><strong>${r.user_name || '—'}</strong><br><small style="color:#6b7280">${r.occupation || ''}</small></td>
          <td>${typeBadge}</td>
          <td>${date}</td>
          <td>₹${Number(r.total_income).toLocaleString('en-IN')}</td>
          <td>₹${Number(r.total_expenses).toLocaleString('en-IN')}</td>
          <td>${Number(r.savings_rate).toFixed(1)}%</td>
          <td>${r.assessment || '—'}</td>
          <td>
            <div class="record-actions">
              <button class="btn btn-outline btn-sm" onclick="viewRecord(${r.id})">👁 View</button>
              <a href="${API_BASE}/export-excel/${r.id}" class="btn btn-success btn-sm">⬇ XLS</a>
              <button class="btn btn-danger btn-sm" onclick="deleteRecord(${r.id})">🗑</button>
            </div>
          </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    document.getElementById('recordsContent').innerHTML = html;

  } catch (err) {
    document.getElementById('recordsContent').innerHTML =
      `<p style="color:#dc2626;padding:1rem;">Error loading records: ${err.message}<br>Make sure the server is running.</p>`;
  }
}

function closeRecordsModal() {
  document.getElementById('recordsModal').classList.remove('open');
}

/* ---- View Single Record ---- */
async function viewRecord(id) {
  try {
    const res  = await fetch(`${API_BASE}/budget/${id}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const r = data.data;

    document.getElementById('recordDetailTitle').textContent = `Record #${r.id} — ${r.user_name}`;

    const date = new Date(r.created_at).toLocaleString('en-IN');

    let html = `
      <div class="detail-grid">
        <div class="detail-item"><label>Entry Type</label><span>${r.entry_type === 'excel' ? '📊 Excel Import' : '✏️ Manual'}</span></div>
        <div class="detail-item"><label>Saved On</label><span>${date}</span></div>
        <div class="detail-item"><label>Name</label><span>${r.user_name}</span></div>
        <div class="detail-item"><label>Age</label><span>${r.age || '—'}</span></div>
        <div class="detail-item"><label>Occupation</label><span>${r.occupation || '—'}</span></div>
        <div class="detail-item"><label>Family Members</label><span>${r.family_members || '—'}</span></div>
        <div class="detail-item"><label>Total Income</label><span>₹${Number(r.total_income).toLocaleString('en-IN')}</span></div>
        <div class="detail-item"><label>Total Expenses</label><span>₹${Number(r.total_expenses).toLocaleString('en-IN')}</span></div>
        <div class="detail-item"><label>Monthly Savings</label><span>₹${Number(r.monthly_savings).toLocaleString('en-IN')}</span></div>
        <div class="detail-item"><label>Savings Rate</label><span>${Number(r.savings_rate).toFixed(1)}%</span></div>
        <div class="detail-item"><label>Expense Ratio</label><span>${Number(r.expense_ratio).toFixed(1)}%</span></div>
        <div class="detail-item"><label>Current Savings</label><span>₹${Number(r.total_current_savings).toLocaleString('en-IN')}</span></div>
        <div class="detail-item"><label>Assessment</label><span>${r.assessment || '—'}</span></div>
      </div>`;

    // Income rows
    if (r.income_rows.length) {
      html += `<p class="detail-rows-title">💰 Income Sources</p><div class="detail-rows-list">`;
      r.income_rows.forEach(row => {
        html += `<div class="detail-row-item"><span>${row.source}</span><span>₹${Number(row.amount).toLocaleString('en-IN')}</span></div>`;
      });
      html += `</div>`;
    }

    // Expense rows
    if (r.expense_rows.length) {
      html += `<p class="detail-rows-title">🧾 Expenses</p><div class="detail-rows-list">`;
      r.expense_rows.forEach(row => {
        html += `<div class="detail-row-item"><span>${row.source}</span><span>₹${Number(row.amount).toLocaleString('en-IN')}</span></div>`;
      });
      html += `</div>`;
    }

    // Savings rows
    if (r.savings_rows.length) {
      html += `<p class="detail-rows-title">🏦 Savings & Investments</p><div class="detail-rows-list">`;
      r.savings_rows.forEach(row => {
        html += `<div class="detail-row-item"><span>${row.source}</span><span>₹${Number(row.amount).toLocaleString('en-IN')}</span></div>`;
      });
      html += `</div>`;
    }

    html += `<div style="margin-top:1.25rem; display:flex; gap:0.75rem;">
      <a href="${API_BASE}/export-excel/${r.id}" class="btn btn-success btn-sm">⬇ Download as Excel</a>
    </div>`;

    document.getElementById('recordDetailContent').innerHTML = html;
    document.getElementById('recordDetailModal').classList.add('open');

  } catch (err) {
    showToast('❌ Could not load record: ' + err.message, 'error');
  }
}

/* ---- Delete Record ---- */
async function deleteRecord(id) {
  if (!confirm(`Delete record #${id}? This cannot be undone.`)) return;

  try {
    const res  = await fetch(`${API_BASE}/budget/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    showToast('Record deleted.', 'success');
    openRecordsModal(); // Refresh list
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

/* ==========================================================
   LOCAL STORAGE (draft cache)
   ========================================================== */
const STORAGE_KEY = 'budgetCalcData';

function saveToStorage() {
  const data = {
    userName:          document.getElementById('userName').value,
    userAge:           document.getElementById('userAge').value,
    occupation:        document.getElementById('occupation').value,
    familyMembers:     document.getElementById('familyMembers').value,
    earningMembers:    document.getElementById('earningMembers').value,
    otherFamilyIncome: document.getElementById('otherFamilyIncome').value,
    incomeRows:        collectRows('incomeRowsContainer'),
    expenseRows:       collectRows('expenseRowsContainer'),
    savingsRows:       collectRows('savingsRowsContainer'),
    entryType:         entryType,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function collectRows(containerId) {
  const rows = [];
  document.querySelectorAll(`#${containerId} .dynamic-row`).forEach(row => {
    const sel    = row.querySelector('select');
    const amount = row.querySelector('.row-amount-input');
    rows.push({ source: sel ? sel.value : '', amount: amount ? amount.value : '0' });
  });
  return rows;
}

function restoreFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };

  setVal('userName',          data.userName);
  setVal('userAge',           data.userAge);
  setVal('occupation',        data.occupation);
  setVal('familyMembers',     data.familyMembers);
  setVal('earningMembers',    data.earningMembers);
  setVal('otherFamilyIncome', data.otherFamilyIncome || '0');

  if (data.entryType) entryType = data.entryType;

  if (data.incomeRows?.length)  data.incomeRows.forEach(r  => addIncomeRow(r.source,  r.amount));
  if (data.expenseRows?.length) data.expenseRows.forEach(r => addExpenseRow(r.source, r.amount));
  if (data.savingsRows?.length) data.savingsRows.forEach(r => addSavingsRow(r.source, r.amount));
}

/* ==========================================================
   RESET
   ========================================================== */
function closeResetModal() {
  document.getElementById('resetModal').classList.remove('open');
}
function confirmReset() {
  localStorage.removeItem(STORAGE_KEY);
  entryType = 'manual';
  location.reload();
}

/* ==========================================================
   TOAST + LOADING HELPERS
   ========================================================== */
let toastTimer;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = 'toast' + (type ? ' ' + type : '');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function showLoading(text = 'Please wait...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}
