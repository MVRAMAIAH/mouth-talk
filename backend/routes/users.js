// routes/users.js — User search + profile details
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const { JWT_SECRET } = require('../middleware/auth');
const { searchRules } = require('../middleware/validate');
const { hasDb, getCollection } = require('../config/db');
const { readJSON } = require('../utils/json-store');

// Rate limiter for search (100 requests per 15 minutes per IP)
const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many search requests, please try again later.' },
});

/**
 * Extract viewer UID from cookie token (non-blocking).
 */
function getViewerUid(req) {
    if (!req.cookies.token) return null;
    try {
        return jwt.verify(req.cookies.token, JWT_SECRET).uid;
    } catch (e) { return null; }
}

// GET /api/users/search — Search users by name
router.get('/search', searchLimiter, searchRules, async (req, res) => {
    try {
        const { query } = req.query;
        const usersCollection = getCollection('users');

        let users = [];
        if (usersCollection) {
            users = await usersCollection.find({
                fullName: { $regex: query, $options: 'i' },
            }).limit(10).toArray();
        } else {
            const allUsers = await readJSON('users.json');
            users = allUsers.filter(u =>
                (u.fullName || '').toLowerCase().includes(query.toLowerCase())
            ).slice(0, 10);
        }

        const safeUsers = users.map(u => ({
            uid: u.uid,
            username: u.fullName,
            picture: u.picture || null,
            badge: u.badge || null,
            onboardingComplete: u.onboardingComplete || false,
            motherTongue: u.motherTongue || '',
            actor: u.actor || '',
        }));

        res.json(safeUsers);
    } catch (err) {
        console.error('User search error:', err);
        res.status(500).json({ error: 'Server error during search' });
    }
});

// GET /api/users/:uid — Get user profile
router.get('/:uid', async (req, res) => {
    try {
        const uid = req.params.uid;
        const usersCollection = getCollection('users');
        const followsCollection = getCollection('follows');

        let user;
        if (usersCollection) {
            user = await usersCollection.findOne({ uid });
        } else {
            user = (await readJSON('users.json')).find(u => u.uid === uid);
        }

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Follow stats
        let followerCount = 0;
        let followingCount = 0;
        let isFollowing = false;
        let followsMe = false;
        const viewerUid = getViewerUid(req);

        if (followsCollection) {
            followerCount = await followsCollection.countDocuments({ followingId: uid });
            followingCount = await followsCollection.countDocuments({ followerId: uid });
            if (viewerUid) {
                isFollowing = !!(await followsCollection.findOne({ followerId: viewerUid, followingId: uid }));
                followsMe = !!(await followsCollection.findOne({ followerId: uid, followingId: viewerUid }));
            }
        } else {
            const follows = await readJSON('follows.json');
            followerCount = follows.filter(f => f.followingId === uid).length;
            followingCount = follows.filter(f => f.followerId === uid).length;
            if (viewerUid) {
                isFollowing = follows.some(f => f.followerId === viewerUid && f.followingId === uid);
                followsMe = follows.some(f => f.followerId === uid && f.followingId === viewerUid);
            }
        }

        res.json({
            fullName: user.fullName,
            picture: user.picture || null,
            badge: user.badge || null,
            motherTongue: user.motherTongue || '',
            actor: user.actor || '',
            favouriteActress: user.favouriteActress || '',
            favouriteDirector: user.favouriteDirector || '',
            favouriteComposer: user.favouriteComposer || '',
            onboardingComplete: user.onboardingComplete || false,
            followerCount,
            followingCount,
            isFollowing,
            isMe: viewerUid === uid,
        });
    } catch (err) {
        console.error('Fetch user details error:', err);
        res.status(500).json({ error: 'Server error fetching user details' });
    }
});

// GET /api/users/:uid/reviews — User review history
router.get('/:uid/reviews', async (req, res) => {
    try {
        const uid = req.params.uid;
        const usersCollection = getCollection('users');
        const reviewsCollection = getCollection('reviews');

        let user;
        if (usersCollection) {
            user = await usersCollection.findOne({ uid });
        } else {
            user = (await readJSON('users.json')).find(u => u.uid === uid);
        }

        if (!user) return res.status(404).json({ error: 'User not found' });

        let reviews = [];
        if (reviewsCollection) {
            reviews = await reviewsCollection.find({
                $or: [{ uid }, { userName: user.fullName }],
            }).sort({ createdAt: -1 }).toArray();
        } else {
            const allReviews = await readJSON('reviews.json');
            reviews = allReviews
                .filter(r => r.uid === uid || r.userName === user.fullName)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        res.json(reviews);
    } catch (err) {
        console.error('Fetch user reviews error:', err);
        res.status(500).json({ error: 'Server error fetching user reviews' });
    }
});

module.exports = router;
