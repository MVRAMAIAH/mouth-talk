/**
 * Migration Script v2: Backfill existing comments with correct user data
 * 
 * Since old comments have no userId, this script tries to match
 * by userName falling back to checking all available fields.
 * It also dumps comment data so we can inspect what's there.
 * 
 * Usage: node backend/backfill_comments.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'mouthtalk';

async function backfill() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI not set in .env');
        process.exit(1);
    }

    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db(DB_NAME);
        const commentsCollection = db.collection('comments');
        const usersCollection = db.collection('users');

        // Get all comments
        const comments = await commentsCollection.find({}).toArray();
        console.log(`📋 Found ${comments.length} comments to process\n`);

        // Dump all comments so we can see what data exists
        comments.forEach((c, i) => {
            console.log(`--- Comment ${i + 1} (${c._id}) ---`);
            console.log(`  userId:    ${c.userId || '(none)'}`);
            console.log(`  userName:  ${c.userName || '(none)'}`);
            console.log(`  userBadge: ${c.userBadge || '(none)'}`);
            console.log(`  userAvatar: ${c.userAvatar || '(none)'}`);
            console.log(`  text:      ${(c.text || '').substring(0, 50)}`);
            console.log(`  reviewId:  ${c.reviewId}`);
            console.log(`  parentId:  ${c.parentId || '(none)'}`);
            console.log('');
        });

        // Build a user cache by fullName (since userId is missing)
        const users = await usersCollection.find({}).toArray();
        const userByName = {};
        const userByUid = {};
        users.forEach(u => {
            if (u.fullName) userByName[u.fullName.toLowerCase()] = u;
            if (u.uid) userByUid[u.uid] = u;
        });
        console.log(`\n👤 Loaded ${users.length} users`);

        let updated = 0;
        let skipped = 0;

        for (const comment of comments) {
            // Try to find user by userId first, then by userName
            let user = null;
            if (comment.userId) {
                user = userByUid[comment.userId];
            }
            if (!user && comment.userName) {
                user = userByName[comment.userName.toLowerCase()];
            }

            if (!user) {
                console.log(`  ⚠️  Could not match comment ${comment._id} to any user — skipping`);
                skipped++;
                continue;
            }

            const updateFields = {};
            // Set userId if missing
            if (!comment.userId && user.uid) {
                updateFields.userId = user.uid;
            }
            // Update name if missing or generic
            if (!comment.userName || comment.userName === 'Anonymous') {
                updateFields.userName = user.fullName || 'Anonymous';
            }
            // Update badge if missing
            if (!comment.userBadge && user.badge) {
                updateFields.userBadge = user.badge;
            }
            // Update avatar if missing
            if (!comment.userAvatar && user.picture) {
                updateFields.userAvatar = user.picture;
            }

            if (Object.keys(updateFields).length > 0) {
                await commentsCollection.updateOne(
                    { _id: comment._id },
                    { $set: updateFields }
                );
                console.log(`  ✅ Updated comment ${comment._id}: ${JSON.stringify(updateFields)}`);
                updated++;
            } else {
                console.log(`  ⏭️  Comment ${comment._id} already has all fields — skipped`);
                skipped++;
            }
        }

        console.log(`\n🎉 Done! Updated: ${updated}, Skipped: ${skipped}, Total: ${comments.length}`);
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await client.close();
        console.log('🔌 Disconnected from MongoDB');
    }
}

backfill();
