// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const chokidar = require('chokidar');
const { MongoClient, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Import Auth Routes
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');

const PROJECT_ROOT = __dirname;
const STATIC_ROOT = PROJECT_ROOT;
const DATA_DIR = path.join(PROJECT_ROOT, 'assets', 'data');

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.DB_NAME || 'mouthtalk';

let dbClient = null;
let db = null;
let bookingsCollection = null;
let reviewsCollection = null;
let theatresCollection = null;
let usersCollection = null;

// Per-category movie collections
const CATEGORY_NAMES = ['tollywood', 'kollywood', 'sandalwood', 'mollywood', 'bollywood', 'hollywood', 'webseries'];
let categoryCollections = {};

// Load local JSON as fallback
function loadLocalJSON(filename) {
  const jsonPath = path.join(PROJECT_ROOT, 'assets', 'data', filename);
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      console.error(`Local JSON parse error (${filename}):`, e);
    }
  }
  return [];
}

// Write JSON to local file
function writeLocalJSON(filename, data) {
  const jsonPath = path.join(PROJECT_ROOT, 'assets', 'data', filename);
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Local JSON write error (${filename}):`, e);
  }
}

// Generate a simple unique ID for JSON-stored reviews
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// Initialize MongoDB
async function initDb() {
  if (!MONGODB_URI) return;
  try {
    dbClient = new MongoClient(MONGODB_URI);
    await dbClient.connect();
    db = dbClient.db(DB_NAME);

    // Create per-category movie collections
    for (const cat of CATEGORY_NAMES) {
      categoryCollections[cat] = db.collection(cat);
    }

    bookingsCollection = db.collection('bookings');
    reviewsCollection = db.collection('reviews');
    theatresCollection = db.collection('theatres');
    usersCollection = db.collection('users');

    // Set db on app for routes to access
    app.set('db', db);

    console.log('Connected to MongoDB');
    console.log('Category collections:', CATEGORY_NAMES.join(', '));
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    categoryCollections = {};
  }
}

// Helper: check if MongoDB category collections are available
function hasDbCollections() {
  return Object.keys(categoryCollections).length > 0;
}

// Sync theatres.json → MongoDB theatres collection
async function syncTheatres() {
  if (!theatresCollection) return;
  try {
    const jsonPath = path.join(DATA_DIR, 'theatres.json');
    if (!fs.existsSync(jsonPath)) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(data)) return;

    const now = new Date();
    const ids = data.map(item => item.id);

    for (const item of data) {
      await theatresCollection.updateOne(
        { id: item.id },
        { $set: { ...item, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
    }
    await theatresCollection.deleteMany({ id: { $nin: ids } });
    console.log(`✅ Synced theatres.json → theatres (${data.length} docs)`);
  } catch (err) {
    console.error('❌ Error syncing theatres:', err);
  }
}

// Sync bookings.json → MongoDB bookings collection (movie-keyed structure)
async function syncBookings() {
  if (!bookingsCollection) return;
  try {
    const jsonPath = path.join(DATA_DIR, 'bookings.json');
    if (!fs.existsSync(jsonPath)) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (typeof data !== 'object' || Array.isArray(data)) return;

    const now = new Date();
    const allKeys = [];

    for (const [movieId, ids] of Object.entries(data)) {
      for (const bookingId of ids) {
        const key = `${movieId}:${bookingId}`;
        allKeys.push(key);
        await bookingsCollection.updateOne(
          { movieId, bookingId },
          { $set: { movieId, bookingId, updatedAt: now }, $setOnInsert: { createdAt: now, used: false } },
          { upsert: true }
        );
      }
    }
    // Remove bookings no longer in JSON
    const allBookingIds = Object.values(data).flat();
    await bookingsCollection.deleteMany({ bookingId: { $nin: allBookingIds } });
    const totalCount = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`✅ Synced bookings.json → bookings (${totalCount} docs across ${Object.keys(data).length} movies)`);
  } catch (err) {
    console.error('❌ Error syncing bookings:', err);
  }
}

// Sync movies.json → per-category MongoDB collections
async function syncCategoryCollections() {
  if (!hasDbCollections()) return;
  try {
    const jsonPath = path.join(DATA_DIR, 'movies.json');
    if (!fs.existsSync(jsonPath)) return;

    const allMovies = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(allMovies)) return;

    // Group movies by category
    const grouped = {};
    for (const cat of CATEGORY_NAMES) grouped[cat] = [];
    for (const movie of allMovies) {
      const cat = (movie.category || '').toLowerCase();
      if (grouped[cat]) grouped[cat].push(movie);
    }

    const now = new Date();

    // Sync each category
    for (const cat of CATEGORY_NAMES) {
      const coll = categoryCollections[cat];
      const movies = grouped[cat];
      const ids = movies.map(m => m.id);

      for (const movie of movies) {
        await coll.updateOne(
          { id: movie.id },
          { $set: { ...movie, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true }
        );
      }
      await coll.deleteMany({ id: { $nin: ids } });
    }
    console.log(`✅ Synced movies.json → ${CATEGORY_NAMES.join(', ')} (${allMovies.length} total movies)`);
  } catch (err) {
    console.error('❌ Error syncing category collections:', err);
  }
}

// ─── API ROUTES (MOUNT BEFORE STATIC) ───────────────────
app.use('/api/auth', authRoutes);

app.get('/api/movies', async (req, res) => {
  try {
    if (hasDbCollections()) {
      // Query all category collections and merge
      const results = [];
      for (const cat of CATEGORY_NAMES) {
        const docs = await categoryCollections[cat].find({}).toArray();
        results.push(...docs);
      }
      return res.json(results);
    }
    res.json(loadLocalJSON('movies.json'));
  } catch (err) {
    console.error('Error fetching movies:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/movies/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (hasDbCollections()) {
      // Search across all category collections
      for (const cat of CATEGORY_NAMES) {
        const doc = await categoryCollections[cat].findOne({ id });
        if (doc) return res.json(doc);
      }
      return res.status(404).json({ error: 'Movie not found' });
    }
    const movie = loadLocalJSON('movies.json').find(m => m.id === id);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    res.json(movie);
  } catch (err) {
    console.error('Error fetching movie:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Add Movie Route
app.post('/api/movies', authMiddleware, async (req, res) => {
  try {
    // Admin check
    if (req.user.email !== 'ramaiah5496@gmail.com') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const movieData = req.body;
    const { id, title, category, poster } = movieData;

    if (!id || !title || !category || !poster) {
      return res.status(400).json({ error: 'Missing required fields (id, title, category, poster)' });
    }

    if (!CATEGORY_NAMES.includes(category.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // 1. Update MongoDB
    if (hasDbCollections()) {
      const coll = categoryCollections[category.toLowerCase()];
      await coll.updateOne(
        { id },
        { $set: { ...movieData, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    }

    // 2. Update local movies.json
    const movies = loadLocalJSON('movies.json');
    const existingIndex = movies.findIndex(m => m.id === id);
    if (existingIndex > -1) {
      movies[existingIndex] = { ...movies[existingIndex], ...movieData };
    } else {
      movies.push(movieData);
    }
    writeLocalJSON('movies.json', movies);

    console.log(`🎬 Movie added/updated: ${title} (${category}) by admin`);
    res.status(201).json({ success: true, movie: movieData });
  } catch (err) {
    console.error('Error adding movie:', err);
    res.status(500).json({ error: 'Server error adding movie' });
  }
});

app.post('/api/verify-booking', async (req, res) => {
  try {
    const { bookingId, movieId } = req.body;
    if (!bookingId || !movieId) {
      return res.status(400).json({ error: 'Booking ID and Movie are required' });
    }
    const upperBookingId = bookingId.toUpperCase();

    // Check in MongoDB first, fallback to local JSON
    if (bookingsCollection) {
      const doc = await bookingsCollection.findOne({ movieId, bookingId: upperBookingId });
      if (!doc) return res.status(404).json({ error: 'Invalid booking ID' });
      if (doc.used) return res.status(400).json({ error: 'This booking ID has already been used for a review' });
    } else {
      const bookings = loadLocalJSON('bookings.json');
      const movieBookings = bookings[movieId];
      if (!movieBookings || !movieBookings.includes(upperBookingId)) {
        return res.status(404).json({ error: 'Invalid booking ID' });
      }
      const reviews = loadLocalJSON('reviews.json');
      if (reviews.some(r => r.bookingId === upperBookingId)) {
        return res.status(400).json({ error: 'This booking ID has already been used for a review' });
      }
    }

    // Find movie title
    const allMovies = loadLocalJSON('movies.json');
    const movie = allMovies.find(m => m.id === movieId);
    res.json({ valid: true, bookingId: upperBookingId, movieId, movieTitle: movie ? movie.title : movieId });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const { movieId } = req.query;
    const filter = movieId ? { movieId } : {};
    if (reviewsCollection) {
      return res.json(await reviewsCollection.find(filter).sort({ createdAt: -1 }).toArray());
    }
    let reviews = loadLocalJSON('reviews.json');
    if (movieId) reviews = reviews.filter(r => r.movieId === movieId);
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { bookingId, movieId, movieTitle, userName, rating, text, userBadge } = req.body;
    if (!bookingId || !movieId || !userName || !rating || !text) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const upperBookingId = bookingId.toUpperCase();

    // Validate booking ID belongs to this movie and not used
    if (bookingsCollection) {
      const doc = await bookingsCollection.findOne({ movieId, bookingId: upperBookingId });
      if (!doc) return res.status(404).json({ error: 'Invalid booking ID' });
      if (doc.used) return res.status(400).json({ error: 'This booking ID has already been used for a review' });
    } else {
      const bookings = loadLocalJSON('bookings.json');
      const movieBookings = bookings[movieId];
      if (!movieBookings || !movieBookings.includes(upperBookingId)) {
        return res.status(404).json({ error: 'Invalid booking ID' });
      }
      const existingReviews = loadLocalJSON('reviews.json');
      if (existingReviews.some(r => r.bookingId === upperBookingId)) {
        return res.status(400).json({ error: 'This booking ID has already been used for a review' });
      }
    }

    const review = {
      _id: generateId(),
      bookingId: upperBookingId,
      movieId,
      movieTitle: movieTitle || movieId,
      userName: userName.trim(),
      userBadge: userBadge || null,
      rating: parseInt(rating),
      text: text.trim(),
      likes: 0,
      dislikes: 0,
      createdAt: new Date()
    };

    if (reviewsCollection) {
      const result = await reviewsCollection.insertOne(review);
      review._id = result.insertedId;
      // Mark booking as used in MongoDB
      await bookingsCollection.updateOne(
        { movieId, bookingId: upperBookingId },
        { $set: { used: true, usedAt: new Date() } }
      );
    } else {
      const reviews = loadLocalJSON('reviews.json');
      reviews.push(review);
      writeLocalJSON('reviews.json', reviews);
    }
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/theatres', async (req, res) => {
  try {
    const theatres = theatresCollection ? await theatresCollection.find({}).toArray() : loadLocalJSON('theatres.json');
    res.json(theatres);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── STATIC FILES ──────────────────────────────────────
app.use(express.static(STATIC_ROOT));
app.use('/assets', express.static(path.join(STATIC_ROOT, 'assets')));

// SPA Fallback - Secure from API collisions
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const indexPath = path.join(STATIC_ROOT, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3000;

// Start server
initDb().then(async () => {
  if (hasDbCollections()) {
    await syncCategoryCollections();
    await syncTheatres();
    await syncBookings();
  }
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  });
});
