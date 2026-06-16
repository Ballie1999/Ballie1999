'use strict';

require('dotenv').config();

const express      = require('express');
const session      = require('express-session');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

// Initialise database (creates tables + migrates schema on first run)
require('./database');

const authRoutes     = require('./routes/auth');
const accountRoutes  = require('./routes/accounts');
const botRoutes      = require('./routes/bots');
const settingsRoutes = require('./routes/settings');

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
const SESSION_SECRET = process.env.SESSION_SECRET || 'mc-panel-secret-change-me';
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Rate limiting — login endpoint only
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again later.',
});
app.use('/login', loginLimiter);
app.use('/forgot-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));

// Routes
app.use('/', authRoutes);
app.use('/', accountRoutes);
app.use('/', botRoutes);
app.use('/', settingsRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).send('<h2>404 — Page not found</h2><a href="/">Go home</a>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`gkku panel running at http://localhost:${PORT}`);
});
