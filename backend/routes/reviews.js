// routes/reviews.js — Review CRUD + reactions
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const authMiddleware = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/auth');
const { reviewRules, reactionRules } = require('../middleware/validate');
const { hasDb, getCollection } = require('../config/db');
const { readJSON, writeJSON } = require('../utils/json-store');
const { generateId, toId } = require('../utils/helpers');
const { createNotification } = require('../services/notification');

/**
 * Extract viewer UID from cookie token (non-blocking, for state sync).
 */
function getViewerUid(req) {
    if (!req.cookies.token) return null;
    try {
        return jwt.verify(req.cookies.token, JWT_SECRET).uid;
    } catch (e) { return null; }
}

// GET /api/reviews — List reviews (with pagination + filters)
router.get('/', async (req, res) => {
    try {
        const { movieId, badge } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const uid = getViewerUid(req);
        const filter = {};
        if (movieId) filter.movieId = movieId;
        if (badge) filter.userBadge = badge;

        let reviews = [];
        const reviewsCollection = getCollection('reviews');
        const reactionsCollection = getCollection('reactions');

        if (reviewsCollection) {
            reviews = await reviewsCollection.find(filter)
                .sort({ likes: -1, createdAt: -1 })
                .skip(skip).limit(limit)
                .toArray();
        } else {
            reviews = await readJSON('reviews.json');
            if (movieId) reviews = reviews.filter(r => r.movieId === movieId);
            if (badge) reviews = reviews.filter(r => r.userBadge === badge);
            reviews.sort((a, b) => (b.likes || 0) - (a.likes || 0) || new Date(b.createdAt) - new Date(a.createdAt));
            reviews = reviews.slice(skip, skip + limit);
        }

        // Attach user reaction if logged in
        if (uid) {
            let reactions;
            if (reactionsCollection) {
                reactions = await reactionsCollection.find({
                    uid,
                    reviewId: { $in: reviews.map(r => r._id.toString()) }
                }).toArray();
            } else {
                const allReactions = await readJSON('reactions.json');
                reactions = allReactions.filter(r => r.uid === uid);
            }

            const reactMap = {};
            reactions.forEach(r => reactMap[r.reviewId] = r.type);
            reviews = reviews.map(r => ({ ...r, userReaction: reactMap[r._id.toString()] || null }));
        }

        res.json(reviews);
    } catch (err) {
        console.error('Fetch reviews error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/reviews — Submit a new review
router.post('/', authMiddleware, reviewRules, async (req, res) => {
    try {
        const { bookingId, movieId, movieTitle, userName, rating, text, userBadge } = req.body;
        const uid = req.user.uid;
        const upperBookingId = bookingId.toUpperCase();

        const bookingsCollection = getCollection('bookings');
        const reviewsCollection = getCollection('reviews');

        // Verify booking ID
        if (bookingsCollection) {
            const doc = await bookingsCollection.findOne({ movieId, bookingId: upperBookingId });
            if (!doc) return res.status(404).json({ error: 'Invalid booking ID' });
            if (doc.used) return res.status(400).json({ error: 'This booking ID has already been used for a review' });
        } else {
            const bookings = await readJSON('bookings.json');
            const movieBookings = bookings[movieId];
            if (!movieBookings || !movieBookings.includes(upperBookingId)) {
                return res.status(404).json({ error: 'Invalid booking ID' });
            }
            const existingReviews = await readJSON('reviews.json');
            if (existingReviews.some(r => r.bookingId === upperBookingId)) {
                return res.status(400).json({ error: 'This booking ID has already been used for a review' });
            }
        }

        const review = {
            _id: generateId(),
            uid,
            bookingId: upperBookingId,
            movieId,
            movieTitle: movieTitle || movieId,
            userName: userName.trim(),
            userBadge: userBadge || null,
            rating: parseInt(rating),
            text: text.trim(),
            likes: 0,
            dislikes: 0,
            createdAt: new Date(),
        };

        if (reviewsCollection) {
            const result = await reviewsCollection.insertOne(review);
            review._id = result.insertedId;
            await bookingsCollection.updateOne(
                { movieId, bookingId: upperBookingId },
                { $set: { used: true, usedAt: new Date() } }
            );
        } else {
            const reviews = await readJSON('reviews.json');
            reviews.push(review);
            await writeJSON('reviews.json', reviews);
        }

        res.status(201).json(review);
    } catch (err) {
        console.error('Review submit error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/reviews/:id/react — Like/dislike a review
router.post('/:id/react', authMiddleware, reactionRules, async (req, res) => {
    try {
        const reviewId = req.params.id;
        const { type } = req.body;
        const uid = req.user.uid;

        const isLike = type === 'like';
        const field = isLike ? 'likes' : 'dislikes';
        const otherField = isLike ? 'dislikes' : 'likes';

        const reviewsCollection = getCollection('reviews');
        const reactionsCollection = getCollection('reactions');

        if (reviewsCollection && reactionsCollection) {
            const existing = await reactionsCollection.findOne({ reviewId, uid });

            if (!existing) {
                await reactionsCollection.insertOne({ reviewId, uid, type, createdAt: new Date() });
                await reviewsCollection.updateOne({ _id: toId(reviewId) }, { $inc: { [field]: 1 } });
            } else if (existing.type === type) {
                await reactionsCollection.deleteOne({ _id: existing._id });
                await reviewsCollection.updateOne({ _id: toId(reviewId) }, { $inc: { [field]: -1 } });
            } else {
                await reactionsCollection.updateOne({ _id: existing._id }, { $set: { type, updatedAt: new Date() } });
                await reviewsCollection.updateOne({ _id: toId(reviewId) }, { $inc: { [field]: 1, [otherField]: -1 } });
            }

            const updated = await reviewsCollection.findOne({ _id: toId(reviewId) });

            if (isLike && (!existing || existing.type !== 'like')) {
                await createNotification(updated.uid, uid, 'review_like', reviewId, `liked your review of ${updated.movieTitle}`);
            }

            return res.json({
                likes: updated.likes || 0,
                dislikes: updated.dislikes || 0,
                userReaction: existing && existing.type === type ? null : type,
            });
        }

        // Local JSON fallback
        const reviews = await readJSON('reviews.json');
        const reactions = await readJSON('reactions.json');
        const review = reviews.find(r => r._id === reviewId);
        if (!review) return res.status(404).json({ error: 'Review not found' });

        const reactIdx = reactions.findIndex(r => r.reviewId === reviewId && r.uid === uid);
        let userReaction = type;
        let shouldNotifyLike = false;

        if (reactIdx === -1) {
            reactions.push({ reviewId, uid, type, createdAt: new Date() });
            review[field] = (review[field] || 0) + 1;
            if (isLike) shouldNotifyLike = true;
        } else if (reactions[reactIdx].type === type) {
            reactions.splice(reactIdx, 1);
            review[field] = Math.max(0, (review[field] || 0) - 1);
            userReaction = null;
        } else {
            const oldField = reactions[reactIdx].type === 'like' ? 'likes' : 'dislikes';
            reactions[reactIdx].type = type;
            review[field] = (review[field] || 0) + 1;
            review[oldField] = Math.max(0, (review[oldField] || 0) - 1);
            if (isLike) shouldNotifyLike = true;
        }

        if (shouldNotifyLike) {
            await createNotification(review.uid, uid, 'review_like', reviewId, `liked your review of ${review.movieTitle}`);
        }

        await writeJSON('reviews.json', reviews);
        await writeJSON('reactions.json', reactions);
        res.json({ likes: review.likes || 0, dislikes: review.dislikes || 0, userReaction });
    } catch (err) {
        console.error('React error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
