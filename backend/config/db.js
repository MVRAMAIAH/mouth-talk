// config/db.js — MongoDB connection, collection registry, and index management
const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.DB_NAME || 'mouthtalk';

const CATEGORY_NAMES = ['tollywood', 'kollywood', 'sandalwood', 'mollywood', 'bollywood', 'hollywood', 'webseries'];

let dbClient = null;
let db = null;
let categoryCollections = {};

// Named collection references
const collections = {};

/**
 * Connect to MongoDB and initialize all collection references.
 */
async function connectDb() {
    if (!MONGODB_URI) {
        console.warn('[DB] No MONGODB_URI set — running with local JSON fallback only.');
        return null;
    }

    const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
    console.log('[DB] Connecting:', maskedUri);

    try {
        dbClient = new MongoClient(MONGODB_URI);
        await dbClient.connect();
        db = dbClient.db(DB_NAME);

        // Category collections
        for (const cat of CATEGORY_NAMES) {
            categoryCollections[cat] = db.collection(cat);
        }

        // Named collections
        collections.bookings = db.collection('bookings');
        collections.reviews = db.collection('reviews');
        collections.follows = db.collection('follows');
        collections.theatres = db.collection('theatres');
        collections.users = db.collection('users');
        collections.comments = db.collection('comments');
        collections.reactions = db.collection('reactions');
        collections.commentReactions = db.collection('comment_reactions');
        collections.notifications = db.collection('notifications');
        collections.subscriptions = db.collection('push_subscriptions');

        console.log('[DB] Connected to MongoDB');
        console.log('[DB] Category collections:', CATEGORY_NAMES.join(', '));

        await createIndexes();
        return db;
    } catch (err) {
        console.error('[DB] Connection failed:', err.message);
        categoryCollections = {};
        return null;
    }
}

/**
 * Create indexes for all collections to ensure query performance.
 */
async function createIndexes() {
    if (!db) return;

    try {
        // Categories
        for (const cat of CATEGORY_NAMES) {
            await categoryCollections[cat].createIndex({ id: 1 }, { unique: true });
        }

        // Users
        await collections.users.createIndex({ uid: 1 }, { unique: true });
        await collections.users.createIndex({ fullName: 'text' });

        // Follows
        await collections.follows.createIndex({ followerId: 1, followingId: 1 }, { unique: true });
        await collections.follows.createIndex({ followingId: 1 });
        await collections.follows.createIndex({ followerId: 1 });

        // Reviews
        await collections.reviews.createIndex({ movieId: 1 });
        await collections.reviews.createIndex({ uid: 1 });
        await collections.reviews.createIndex({ likes: -1, createdAt: -1 });

        // Comments
        await collections.comments.createIndex({ reviewId: 1 });
        await collections.comments.createIndex({ parentId: 1 });

        // Reactions
        await collections.reactions.createIndex({ reviewId: 1, uid: 1 }, { unique: true });
        await collections.commentReactions.createIndex({ commentId: 1, uid: 1 }, { unique: true });

        // Notifications
        await collections.notifications.createIndex({ recipientUid: 1, createdAt: -1 });
        await collections.notifications.createIndex({ recipientUid: 1, isRead: 1 });

        // Push subscriptions
        await collections.subscriptions.createIndex({ uid: 1 });
        await collections.subscriptions.createIndex({ 'subscription.endpoint': 1 });

        // Bookings
        await collections.bookings.createIndex({ movieId: 1, bookingId: 1 }, { unique: true });

        console.log('[DB] All indexes created');
    } catch (err) {
        console.error('[DB] Index creation error:', err.message);
    }
}

/**
 * Check if MongoDB collections are available.
 */
function hasDb() {
    return Object.keys(categoryCollections).length > 0;
}

/**
 * Get the raw db instance (for routes/auth.js app.set compatibility).
 */
function getDb() {
    return db;
}

/**
 * Get a named collection (e.g., 'users', 'reviews').
 */
function getCollection(name) {
    return collections[name] || null;
}

/**
 * Get a category collection (e.g., 'tollywood', 'bollywood').
 */
function getCategoryCollection(name) {
    return categoryCollections[name] || null;
}

module.exports = {
    connectDb,
    hasDb,
    getDb,
    getCollection,
    getCategoryCollection,
    CATEGORY_NAMES,
};
