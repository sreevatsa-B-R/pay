# Payroll Management System
**React + Node.js + PostgreSQL | JWT Auth | Role-Based Access | XLSX & CSV Import/Export**

---

## Tech Stack
| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Frontend   | React 18, React Router v6, TanStack Query, Axios   |
| Backend    | Node.js, Express.js                                 |
| Database   | PostgreSQL                                          |
| Auth       | JWT (jsonwebtoken) + bcryptjs                       |
| Excel      | ExcelJS (XLSX read/write)                           |
| CSV        | fast-csv                                            |
| Security   | Helmet, CORS, express-rate-limit                    |

---

## Project Structure
```
payroll-app/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js           # PostgreSQL pool
│   │   │   ├── migrate.js      # DB migration (run once)
│   │   │   └── seed.js         # Default admin/user accounts
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── employeeController.js
│   │   │   ├── salaryController.js
│   │   │   └── exportController.js  # Import/Export XLSX & CSV
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT + role middleware
│   │   ├── routes/
│   │   │   └── index.js
│   │   └── index.js            # Express entry point
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── public/index.html
    ├── src/
    │   ├── context/AuthContext.jsx
    │   ├── services/api.js     # All API calls
    │   ├── components/Layout.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Dashboard.jsx   # Summary & stats
    │   │   ├── Employees.jsx   # CRUD (admin) / View (user)
    │   │   ├── Salary.jsx      # CRUD (admin) / View (user)
    │   │   ├── Export.jsx      # XLSX + CSV export (all roles)
    │   │   ├── Import.jsx      # XLSX + CSV import (admin only)
    │   │   └── Users.jsx       # User management (admin only)
    │   ├── App.jsx
    │   └── index.js
    └── package.json
```

---

## Setup Instructions

### 1. PostgreSQL
```bash
createdb payroll_db
```

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your DB credentials and JWT secret

npm run db:migrate    # Creates all tables
npm run db:seed       # Creates default admin + viewer accounts
npm run dev           # Starts on http://localhost:5000
```

### 3. Frontend
```bash
cd frontend
npm install
npm start             # Starts on http://localhost:3000
```

---

## Default Login Credentials
| Role  | Username | Password   |
|-------|----------|------------|
| Admin | admin    | Admin@123  |
| User  | viewer   | User@123   |

> Change these after first login via the Users page.

---

## Role Permissions

| Feature              | Admin | User (Viewer) |
|----------------------|:-----:|:-------------:|
| View Employees       | ✅    | ✅            |
| Add/Edit/Delete Emp  | ✅    | ❌            |
| View Salary Records  | ✅    | ✅            |
| Add/Delete Salary    | ✅    | ❌            |
| View Dashboard       | ✅    | ✅            |
| Export XLSX          | ✅    | ✅            |
| Export CSV           | ✅    | ✅            |
| Import XLSX/CSV      | ✅    | ❌            |
| Manage Users         | ✅    | ❌            |

---

## API Endpoints

### Auth
```
POST   /api/auth/login
GET    /api/auth/me
PUT    /api/auth/password
```

### Employees
```
GET    /api/employees
GET    /api/employees/:empId
POST   /api/employees          [Admin]
PUT    /api/employees/:empId   [Admin]
DELETE /api/employees/:empId   [Admin]
```

### Salary
```
GET    /api/salary
GET    /api/salary/summary
POST   /api/salary             [Admin]
DELETE /api/salary/:id         [Admin]
```

### Export (all roles)
```
GET    /api/export/employees/xlsx
GET    /api/export/employees/csv
GET    /api/export/salary/xlsx?month=March&year=2025
GET    /api/export/salary/csv?month=March&year=2025
```

### Import (admin only)
```
POST   /api/import/employees   multipart/form-data file=<file>
POST   /api/import/salary      multipart/form-data file=<file>
GET    /api/templates/employees
GET    /api/templates/salary
```

### Users (admin only)
```
GET    /api/users
POST   /api/users
PUT    /api/users/:id/toggle
```

---

## Import File Format

Download templates from the Import page. Key column headers:

**Employees:** `EmpID, Name, Designation, ClientLOB, Location, State, DOB, Sex, DOJ, Email, PAN, SalaryMode, Contact, Bank, AccountNo`

**Salary:** `EmpID, Month, Year, Basic, HRA, Conv, Med, Spl, Stat, Consult, Allw, Leave, PF, PT, ESI, TDS, LWF, GMI, OtherDed`

---

## Security Features
- JWT tokens (8h expiry)
- bcrypt password hashing (12 rounds)
- Rate limiting (10 login attempts / 15min)
- Helmet security headers
- CORS whitelisting
- Full audit log table
- Role-based route protection (frontend + backend)
