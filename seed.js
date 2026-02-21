// seed.js - Clean seed: drops & re-creates all MongoDB collections from JSON files
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'mouthtalk';
const CATEGORY_NAMES = ['tollywood', 'kollywood', 'sandalwood', 'mollywood', 'bollywood'];
const DATA_DIR = path.join(__dirname, 'assets', 'data');

if (!MONGODB_URI) {
  console.error('❌ Please set MONGODB_URI in .env to run the seed script');
  process.exit(1);
}

// Read & parse a JSON file from assets/data
function readJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠ ${filename} not found, skipping`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function seedMovies(db) {
  const allMovies = readJSON('movies.json');
  if (!Array.isArray(allMovies)) return;

  // Group movies by category
  const grouped = {};
  for (const cat of CATEGORY_NAMES) grouped[cat] = [];
  for (const movie of allMovies) {
    const cat = (movie.category || '').toLowerCase();
    if (grouped[cat]) grouped[cat].push(movie);
    else console.warn(`⚠ Unknown category "${movie.category}" for movie "${movie.id}"`);
  }

  // For each category: drop, re-insert cleanly, create index
  for (const cat of CATEGORY_NAMES) {
    const coll = db.collection(cat);
    await coll.drop().catch(() => { }); // ignore if doesn't exist

    const movies = grouped[cat];
    if (movies.length === 0) {
      console.log(`  📭 ${cat}: 0 movies (collection created empty)`);
      continue;
    }

    // Add timestamps to each document
    const now = new Date();
    const docs = movies.map(m => ({
      id: m.id,
      title: m.title,
      poster: m.poster,
      category: m.category,
      synopsis: m.synopsis,
      actor: m.actor,
      actress: m.actress,
      director: m.director,
      producer: m.producer,
      music: m.music,
      trailer: m.trailer,
      createdAt: now,
      updatedAt: now
    }));

    await coll.insertMany(docs);
    await coll.createIndex({ id: 1 }, { unique: true });
    console.log(`  ✅ ${cat}: ${docs.length} movies seeded`);
  }
}

async function seedTheatres(db) {
  const theatres = readJSON('theatres.json');
  if (!Array.isArray(theatres)) return;

  const coll = db.collection('theatres');
  await coll.drop().catch(() => { });

  const now = new Date();
  const docs = theatres.map(t => ({
    ...t,
    createdAt: now,
    updatedAt: now
  }));

  await coll.insertMany(docs);
  await coll.createIndex({ id: 1 }, { unique: true });
  await coll.createIndex({ city: 1 });
  console.log(`  ✅ theatres: ${docs.length} theatres seeded`);
}

async function seedBookings(db) {
  const bookings = readJSON('bookings.json');
  if (!Array.isArray(bookings)) return;

  const coll = db.collection('bookings');
  await coll.drop().catch(() => { });

  const now = new Date();
  const docs = bookings.map(bookingId => ({
    bookingId,
    createdAt: now
  }));

  await coll.insertMany(docs);
  await coll.createIndex({ bookingId: 1 }, { unique: true });
  console.log(`  ✅ bookings: ${docs.length} booking IDs seeded`);
}

async function run() {
  console.log('\n🔄 MouthTalk Database Seed');
  console.log('─'.repeat(40));
  console.log(`📡 Connecting to: ${MONGODB_URI}`);
  console.log(`📦 Database: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log('🎬 Seeding movies (per-category collections)...');
    await seedMovies(db);

    console.log('\n🏢 Seeding theatres...');
    await seedTheatres(db);

    console.log('\n🎫 Seeding bookings...');
    await seedBookings(db);

    // Ensure reviews collection exists with index
    const reviewsColl = db.collection('reviews');
    await reviewsColl.createIndex({ movieId: 1 });
    await reviewsColl.createIndex({ createdAt: -1 });
    console.log('\n📝 Reviews collection: indexes ensured');

    console.log('\n' + '─'.repeat(40));
    console.log('✅ Database seed complete!\n');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
