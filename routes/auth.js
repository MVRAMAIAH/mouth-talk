const express = require('express');
const router = express.Router();
const admin = require('../config/firebase-admin');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

// Helper to generate JWT
const generateToken = (user) => {
    return jwt.sign(
        {
            uid: user.uid,
            email: user.email,
            phone: user.phone,
            name: user.fullName
        },
        process.env.JWT_SECRET || 'fallback-secret-for-dev-only',
        { expiresIn: '7d' }
    );
};

// POST /api/auth/google - Verify Firebase ID Token and sign in
router.post('/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ error: 'ID Token required' });

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email, name, picture } = decodedToken;

        const db = req.app.get('db');
        const usersCollection = db.collection('users');

        const userData = {
            uid,
            fullName: name || 'Google User',
            email: email,
            phone: null,
            picture: picture,
            provider: 'google',
            updatedAt: new Date()
        };

        await usersCollection.updateOne(
            { uid },
            { $set: userData, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );

        const user = await usersCollection.findOne({ uid });
        const token = generateToken(user);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/'
        });

        res.json({ success: true, user });
    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(401).json({ error: 'Invalid Google token' });
    }
});

// POST /api/auth/phone - Verify Firebase Phone ID Token and sign in
router.post('/phone', async (req, res) => {
    try {
        const { idToken, fullName } = req.body;
        if (!idToken) return res.status(400).json({ error: 'ID Token required' });

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, phone_number } = decodedToken;

        const db = req.app.get('db');
        const usersCollection = db.collection('users');

        const userData = {
            uid,
            fullName: fullName || 'Phone User',
            email: null,
            phone: phone_number,
            provider: 'phone',
            updatedAt: new Date()
        };

        await usersCollection.updateOne(
            { uid },
            { $set: userData, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );

        const user = await usersCollection.findOne({ uid });
        const token = generateToken(user);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/'
        });

        res.json({ success: true, user });
    } catch (error) {
        console.error('Phone Auth Error:', error);
        res.status(401).json({ error: 'Invalid Phone token' });
    }
});

// GET /api/auth/me - Get current user (auto-login check)
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const db = req.app.get('db');
        const user = await db.collection('users').findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Add admin flag
        const userWithAdmin = {
            ...user,
            isAdmin: user.email === 'ramaiah5496@gmail.com'
        };
        res.json(userWithAdmin);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/logout - Clear session
router.post('/logout', (req, res) => {
    res.clearCookie('token', { path: '/' });
    res.json({ success: true, message: 'Logged out successfully' });
});

// PATCH /api/auth/profile - Update user profile
router.patch('/profile', authMiddleware, async (req, res) => {
    try {
        const { fullName, actor, cinephileLevel } = req.body;
        const db = req.app.get('db');
        const usersCollection = db.collection('users');

        const updateData = {
            updatedAt: new Date()
        };

        if (fullName) updateData.fullName = fullName;
        if (actor) updateData.actor = actor;
        if (cinephileLevel) updateData.cinephileLevel = cinephileLevel;

        const result = await usersCollection.findOneAndUpdate(
            { uid: req.user.uid },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!result) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: result });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
