const express = require('express');
const session = require('express-session');
const path = require('path');

// Initialise database (runs table creation + seed on first run)
require('./database');

const authRoutes     = require('./routes/auth');
const accountRoutes  = require('./routes/accounts');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Session
app.use(session({
  secret: 'mc-panel-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// Routes
app.use('/', authRoutes);
app.use('/', accountRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).send('<h2>404 — Page not found</h2><a href="/">Go home</a>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Minecraft panel running at http://localhost:${PORT}`);
});
