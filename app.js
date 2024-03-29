const express = require('express');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const mongoSanitize = require('express-mongo-sanitize');
const MongoDBStore = require('connect-mongodb-session')(session);
const flash = require('connect-flash');
const csrf = require('csurf');
const helmet = require('helmet');
require('dotenv').config({ path: './.env.local' });

const ejsMate = require('ejs-mate');
const multer = require('multer');
const compression = require('compression');
const bodyParser = require('body-parser');

const adminRoutes = require('./routes/admin');
const shopRoutes = require('./routes/shop');
const authRoutes = require('./routes/auth');
const aboutRoutes = require('./routes/about');

const User = require('./models/user');
const ExpressError = require('./utils/ExpressError');

const dbUrl = process.env.MONGO_URI;
const secret = process.env.SESSION_SECRET || 'thisshouldbeasecret';

const app = express();

// File Storing
const fileFilter = (req, file, cb) => {
  cb(null, file.mimetype === 'image/jpg');
};

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'images');
  },
  filename: (req, file, cb) => {
    cb(null, new Date().toISOString() + '-' + file.originalname);
  }
});

app.use(
  multer({ storage: fileStorage, fileFilter: fileFilter }).single('image')
);

// EJS Views
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', 'views');

// Initial Config
const store = new MongoDBStore({
  uri: dbUrl,
  collection: 'sessions'
});

app.use(compression());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(mongoSanitize());

// Session
const sessionConfig = {
  secret: secret,
  resave: false,
  saveUninitialized: true,
  store: store
};
app.use(session(sessionConfig));

const csrfProtection = csrf();
app.use(csrfProtection);
app.use(flash());

app.use((req, res, next) => {
  res.locals.isAuthenticated = req.session.isLoggedIn;
  res.locals.csrfToken = req.csrfToken();
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// Stripe
app.use((req, res, next) => {
  req.stripePk = process.env.STRIPEPK;
  req.stripeSk = process.env.STRIPESK;
  next();
});

// Assign user to req.user & Guest User temporaryCart
app.use(async (req, res, next) => {
  try {
    if (req.session.isLoggedIn) {
      const user = await User.findById(req.session.user._id);
      req.user = user || new User();
    } else {
      if (!req.session.temporaryCart) {
        req.session.temporaryCart = { items: [] };
      }
      req.user = req.session.temporaryCart;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Routes
app.use('/admin', adminRoutes);
app.use(shopRoutes);
app.use(authRoutes);
app.use(aboutRoutes);

app.use(helmet());

app.all('*', (req, res, next) => {
  next(new ExpressError('Page Not Found', 404));
});

app.use((err, req, res, next) => {
  const { statusCode = 500 } = err;
  if (!err.message) err.message = 'Oh No, Something Went Wrong';
  res.status(statusCode).render('error', {
    err,
    pageTitle: 'Error',
    isAuthenticated: req.session.isLoggedIn,
    isAdmin: req.session.isAdmin,
    user: req.user
  });
});

mongoose.set('strictQuery', false);

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose
  .connect(dbUrl)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(process.env.PORT || 3000);
  })
  .catch((e) => {
    console.log('Error connecting to MongoDB:', e);
  });
