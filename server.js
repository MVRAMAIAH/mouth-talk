// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PROJECT_ROOT = __dirname;
const STATIC_ROOT = PROJECT_ROOT;

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.DB_NAME || 'mouthtalk';
const COLLECTION = process.env.COLLECTION || 'movies';

let dbClient = null;
let moviesCollection = null;

// Load local JSON as fallback
function loadLocalData() {
  const jsonPath = path.join(PROJECT_ROOT, 'assets', 'data', 'movies.json');
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      console.error('Local JSON parse error:', e);
    }
  }
  return [];
}

// Initialize MongoDB
async function initDb() {
  if (!MONGODB_URI) return;
  try {
    dbClient = new MongoClient(MONGODB_URI);
    await dbClient.connect();
    const db = dbClient.db(DB_NAME);
    moviesCollection = db.collection(COLLECTION);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    moviesCollection = null;
  }
}

// Sync movies.json → MongoDB
async function syncJSONtoDB() {
  if (!moviesCollection) return;
  try {
    const jsonPath = path.join(PROJECT_ROOT, 'assets', 'data', 'movies.json');
    if (!fs.existsSync(jsonPath)) return;

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(data)) return;

    const idsInJSON = data.map(m => m.id);

    // Upsert all movies
    for (const item of data) {
      await moviesCollection.updateOne({ id: item.id }, { $set: item }, { upsert: true });
    }

    // Delete movies not in JSON
    await moviesCollection.deleteMany({ id: { $nin: idsInJSON } });

    console.log('Server: Database synced with movies.json');
  } catch (err) {
    console.error('Error syncing JSON to DB:', err);
  }
}

// API: Get all movies
app.get('/api/movies', async (req, res) => {
  try {
    if (moviesCollection) {
      const docs = await moviesCollection.find({}).toArray();
      return res.json(docs);
    }
    res.json(loadLocalData());
  } catch (err) {
    console.error('Error fetching movies:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Get movie by ID
app.get('/api/movies/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (moviesCollection) {
      const doc = await moviesCollection.findOne({ id });
      if (!doc) return res.status(404).json({ error: 'Movie not found' });
      return res.json(doc);
    }
    const movie = loadLocalData().find(m => m.id === id);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    res.json(movie);
  } catch (err) {
    console.error('Error fetching movie:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve static files
app.use(express.static(STATIC_ROOT));
app.use('/assets', express.static(path.join(STATIC_ROOT, 'assets'))); // images & JSON

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(STATIC_ROOT, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3000;

// Start server
initDb().then(async () => {
  await syncJSONtoDB(); // sync on server start
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
