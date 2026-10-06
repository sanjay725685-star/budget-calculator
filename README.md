# Personal Budget Calculator

A full-stack Personal Budget Calculator web app built with HTML, CSS, JavaScript, and Node.js + Express backend with SQLite database.

## Features

- 5-step form: Demographics → Income → Expenses → Savings → Summary
- Budget Assessment (Excellent / Good / Needs Improvement / Critical)
- Excel/CSV file upload to auto-fill budget data
- Save, view, export, and delete budget records
- Records history with full detail view
- Export records as `.xlsx`
- Responsive design — mobile, tablet, desktop
- localStorage draft cache

## Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js + Express
- **Database**: SQLite (via sql.js — pure JavaScript, no native build tools needed)
- **Excel Parsing**: SheetJS (xlsx)
- **File Upload**: Multer

## Getting Started (Local)

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
node server.js
```

### 3. Open in browser
```
http://localhost:3000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/budgets | Get all saved records |
| GET | /api/budget/:id | Get full detail of one record |
| POST | /api/budget | Save a new budget record |
| DELETE | /api/budget/:id | Delete a record |
| POST | /api/import-excel | Upload and parse Excel/CSV file |
| GET | /api/export-excel/:id | Download a record as .xlsx |

## Project Structure

```
budget-calculator/
├── index.html          # Frontend
├── style.css           # Styles
├── script.js           # Frontend logic + API calls
├── server.js           # Node.js + Express backend
├── package.json        # Dependencies
├── start-server.bat    # One-click Windows launcher
└── database/
    └── budget.db       # SQLite database (auto-created)
```

## Deployment

This app is deployed on **Railway** — full backend with persistent SQLite storage.

## License

MIT
