# ⛏ Minecraft Account Management Panel

A lightweight, dark-themed web panel for managing Minecraft proxy accounts — built with Node.js, Express, SQLite, and EJS.

---

## Quick Start (Windows)

### 1. Install Node.js
Download and install the **LTS** version from https://nodejs.org

### 2. Install dependencies
Open a Command Prompt / PowerShell inside this folder and run:
```
npm install
```

### 3. Start the server
```
npm start
```

### 4. Open the panel
Go to http://localhost:3000 in your browser.

---

## Default Login

| Username | Password  |
|----------|-----------|
| `admin`  | `admin123` |

> ⚠️ **Change this password immediately** after your first login (edit `database.js` and delete `accounts.db` to re-seed with a new password, or add a change-password feature).

---

## Features

- ✅ Session-based login (bcrypt hashed passwords)
- ✅ Add / Edit / Delete Minecraft accounts
- ✅ Store proxy host, port, username & password per account
- ✅ Account status tags: Active / Inactive / Banned / Unknown
- ✅ Notes field for each account
- ✅ Fully dark-themed responsive UI
- ✅ Local SQLite database — no internet required

---

## Project Structure

```
minecraft-panel/
├── server.js          ← Express app entry point
├── database.js        ← SQLite setup + default admin seed
├── routes/
│   ├── auth.js        ← Login / logout
│   └── accounts.js    ← Account CRUD + auth guard
├── views/
│   ├── login.ejs      ← Login page
│   ├── dashboard.ejs  ← Main account list
│   ├── add-account.ejs
│   ├── edit-account.ejs
│   └── layout.ejs     ← Shared nav (reference only)
├── public/
│   └── style.css      ← Dark theme styles
└── package.json
```

---

## Data Storage

All data is saved in `accounts.db` (created automatically on first run) in the same folder. Back up this file to keep your account data.

---

## Future Enhancements

- Export accounts to CSV
- Mojang API account checker
- Proxy connectivity tester
- Multiple panel users with roles
- HTTPS support
