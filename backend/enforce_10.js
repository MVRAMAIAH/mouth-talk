const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;

async function enforce10() {
    const moviesPath = path.join(DATA_DIR, 'movies.json');
    const bookingsPath = path.join(DATA_DIR, 'bookings.json');

    const movies = JSON.parse(fs.readFileSync(moviesPath, 'utf8'));
    const bookings = JSON.parse(fs.readFileSync(bookingsPath, 'utf8'));
    
    let changed = false;

    // Validate and Enforce exactly 10
    for (const m of movies) {
        let bList = bookings[m.id] || [];
        if (bList.length > 10) {
            bookings[m.id] = bList.slice(0, 10);
            changed = true;
        } else if (bList.length < 10) {
            const need = 10 - bList.length;
            const extras = Array.from({ length: need }, () => 
                (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2))
                .toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(10, 'X').substring(0, 10)
            );
            bookings[m.id] = [...bList, ...extras];
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(bookingsPath, JSON.stringify(bookings, null, 4));
        console.log('Bookings updated to have exactly 10 IDs each locally.');
    }

    if (URI && DB_NAME) {
        console.log("Syncing enforcement to MongoDB Atlas...");
        const client = new MongoClient(URI);
        try {
            await client.connect();
            const db = client.db(DB_NAME);
            const coll = db.collection('bookings');
            
            // Delete ALL current documents in Atlas bookings
            await coll.deleteMany({});
            
            // Rewrite them completely fresh
            const now = new Date();
            let allRecs = [];
            for (const [movieId, bIds] of Object.entries(bookings)) {
                for (const bId of bIds) {
                    allRecs.push({
                        movieId,
                        bookingId: bId,
                        used: false,
                        createdAt: now,
                        updatedAt: now
                    });
                }
            }
            if (allRecs.length > 0) {
                await coll.insertMany(allRecs);
            }
            console.log(`Pushed exactly ${allRecs.length} total booking IDs to Atlas.`);
        } catch (e) {
            console.error("Atlas Error:", e.message);
        } finally {
            await client.close();
        }
    }
}
enforce10();
