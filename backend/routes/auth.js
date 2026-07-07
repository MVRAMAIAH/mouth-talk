// routes/auth.js — Authentication routes (Google, Phone, Profile, Onboarding)
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const admin = require('../config/firebase-admin');
const authMiddleware = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/auth');
const { profileRules, onboardingRules } = require('../middleware/validate');
const { getDb, getCollection } = require('../config/db');
const { readJSON, writeJSON } = require('../utils/json-store');

/**
 * Generate a signed JWT for a user (7-day expiry).
 */
function generateToken(user) {
    return jwt.sign(
        { uid: user.uid, email: user.email, phone: user.phone, name: user.fullName },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

/**
 * Cookie options for the JWT token.
 */
function cookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
    };
}

// POST /api/auth/google — Google Sign-In
router.post('/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ error: 'ID Token required' });

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email, name, picture } = decodedToken;

        const usersCollection = getCollection('users');
        const userData = {
            uid,
            fullName: name || 'Google User',
            email,
            phone: null,
            picture,
            provider: 'google',
            updatedAt: new Date(),
        };

        let user;
        if (usersCollection) {
            await usersCollection.updateOne(
                { uid },
                { $set: userData, $setOnInsert: { createdAt: new Date() } },
                { upsert: true }
            );
            user = await usersCollection.findOne({ uid });
        } else {
            const users = await readJSON('users.json');
            const existingIndex = users.findIndex(u => u.uid === uid);
            if (existingIndex > -1) {
                users[existingIndex] = { ...users[existingIndex], ...userData };
                user = users[existingIndex];
            } else {
                userData.createdAt = new Date();
                users.push(userData);
                user = userData;
            }
            await writeJSON('users.json', users);
        }

        const token = generateToken(user);
        res.cookie('token', token, cookieOptions());
        res.json({ success: true, user, isNewUser: !user.onboardingComplete });
    } catch (e) {
        console.error('Google Auth Error:', e.message);
        res.status(401).json({ error: 'Invalid Google token' });
    }
});

// POST /api/auth/phone — Phone Sign-In
router.post('/phone', async (req, res) => {
    try {
        const { idToken, fullName } = req.body;
        if (!idToken) return res.status(400).json({ error: 'ID Token required' });

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, phone_number } = decodedToken;

        const usersCollection = getCollection('users');
        const userData = {
            uid,
            fullName: fullName || 'Phone User',
            email: null,
            phone: phone_number,
            provider: 'phone',
            updatedAt: new Date(),
        };

        let user;
        if (usersCollection) {
            await usersCollection.updateOne(
                { uid },
                { $set: userData, $setOnInsert: { createdAt: new Date() } },
                { upsert: true }
            );
            user = await usersCollection.findOne({ uid });
        } else {
            const users = await readJSON('users.json');
            const existingIndex = users.findIndex(u => u.uid === uid);
            if (existingIndex > -1) {
                users[existingIndex] = { ...users[existingIndex], ...userData };
                user = users[existingIndex];
            } else {
                userData.createdAt = new Date();
                users.push(userData);
                user = userData;
            }
            await writeJSON('users.json', users);
        }

        const token = generateToken(user);
        res.cookie('token', token, cookieOptions());
        res.json({ success: true, user, isNewUser: !user.onboardingComplete });
    } catch (e) {
        console.error('Phone Auth Error:', e.message);
        res.status(401).json({ error: 'Invalid Phone token' });
    }
});

// GET /api/auth/me — Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const uid = req.user.uid;
        const usersCollection = getCollection('users');
        const followsCollection = getCollection('follows');

        let user;
        if (usersCollection) {
            user = await usersCollection.findOne({ uid });
        } else {
            user = (await readJSON('users.json')).find(u => u.uid === uid);
        }

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Follow stats (skip if lite=true)
        let followerCount = 0;
        let followingCount = 0;
        const isLite = req.query.lite === 'true';

        if (!isLite) {
            if (followsCollection) {
                followerCount = await followsCollection.countDocuments({ followingId: uid });
                followingCount = await followsCollection.countDocuments({ followerId: uid });
            } else {
                try {
                    const follows = await readJSON('follows.json');
                    followerCount = follows.filter(f => f.followingId === uid).length;
                    followingCount = follows.filter(f => f.followerId === uid).length;
                } catch (e) { /* no follows file yet */ }
            }
        }

        // Check admin status from DB field or env list
        const adminEmails = (process.env.ADMIN_EMAILS || 'ramaiah5496@gmail.com')
            .split(',').map(e => e.trim().toLowerCase());
        const isAdmin = user.isAdmin || adminEmails.includes((user.email || '').toLowerCase());

        res.json({
            ...user,
            isAdmin,
            followerCount,
            followingCount,
        });
    } catch (e) {
        console.error('Fetch me error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/logout — Log out
router.post('/logout', (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('token', {
        path: '/',
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
    });
    res.json({ success: true, message: 'Logged out successfully' });
});

// PATCH /api/auth/profile — Update profile fields
router.patch('/profile', authMiddleware, profileRules, async (req, res) => {
    try {
        const { fullName, actor, cinephileLevel, motherTongue, favouriteActress, favouriteDirector, favouriteComposer } = req.body;
        const usersCollection = getCollection('users');

        const updateData = { updatedAt: new Date() };
        if (fullName) updateData.fullName = fullName;
        if (actor) updateData.actor = actor;
        if (cinephileLevel) updateData.cinephileLevel = cinephileLevel;
        if (motherTongue) updateData.motherTongue = motherTongue;
        if (favouriteActress) updateData.favouriteActress = favouriteActress;
        if (favouriteDirector) updateData.favouriteDirector = favouriteDirector;
        if (favouriteComposer) updateData.favouriteComposer = favouriteComposer;

        let user;
        if (usersCollection) {
            user = await usersCollection.findOneAndUpdate(
                { uid: req.user.uid },
                { $set: updateData },
                { returnDocument: 'after' }
            );
        } else {
            const users = await readJSON('users.json');
            const idx = users.findIndex(u => u.uid === req.user.uid);
            if (idx > -1) {
                users[idx] = { ...users[idx], ...updateData };
                user = users[idx];
                await writeJSON('users.json', users);
            }
        }

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (e) {
        console.error('Profile update error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/auth/onboarding — Complete onboarding
router.post('/onboarding', authMiddleware, onboardingRules, async (req, res) => {
    try {
        const { fullName, motherTongue, favouriteActor, favouriteActress, favouriteDirector, favouriteComposer, profilePicture, badge, quizAnswers } = req.body;
        const usersCollection = getCollection('users');

        const updateData = {
            onboardingComplete: true,
            badge: badge || 'rocky',
            quizAnswers: quizAnswers || [],
            updatedAt: new Date(),
        };
        if (fullName) updateData.fullName = fullName;
        if (motherTongue) updateData.motherTongue = motherTongue;
        if (favouriteActor) updateData.actor = favouriteActor;
        if (favouriteActress) updateData.favouriteActress = favouriteActress;
        if (favouriteDirector) updateData.favouriteDirector = favouriteDirector;
        if (favouriteComposer) updateData.favouriteComposer = favouriteComposer;
        if (profilePicture) updateData.picture = profilePicture;

        let user;
        if (usersCollection) {
            user = await usersCollection.findOneAndUpdate(
                { uid: req.user.uid },
                { $set: updateData },
                { returnDocument: 'after' }
            );
        } else {
            const users = await readJSON('users.json');
            const idx = users.findIndex(u => u.uid === req.user.uid);
            if (idx > -1) {
                users[idx] = { ...users[idx], ...updateData };
                user = users[idx];
                await writeJSON('users.json', users);
            }
        }

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (e) {
        console.error('Onboarding error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/auth/user/:uid — Get basic user info (public)
router.get('/user/:uid', async (req, res) => {
    try {
        const usersCollection = getCollection('users');
        let user;
        if (usersCollection) {
            user = await usersCollection.findOne({ uid: req.params.uid });
        } else {
            user = (await readJSON('users.json')).find(u => u.uid === req.params.uid);
        }
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            fullName: user.fullName,
            badge: user.badge || null,
            picture: user.picture || null,
        });
    } catch (e) {
        console.error('Fetch user error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
