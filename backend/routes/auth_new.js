const express = require('express');
const router = express.Router();
const admin = require('../config/firebase-admin');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
function loadUsersJSON() {
    const jsonPath = path.join(DATA_DIR, 'users.json');
    if (fs.existsSync(jsonPath)) return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return [];
}
function writeUsersJSON(data) {
    const jsonPath = path.join(DATA_DIR, 'users.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
}

const generateToken = (user) => {
    return jwt.sign(
        { uid: user.uid, email: user.email, phone: user.phone, name: user.fullName },
        process.env.JWT_SECRET || 'fallback-secret-for-dev-only',
        { expiresIn: '7d' }
    );
};

router.post('/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ error: 'ID Token required' });
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email, name, picture } = decodedToken;
        const db = req.app.get('db');
        const userData = {
            uid, fullName: name || 'Google User', email, phone: null, picture, provider: 'google', updatedAt: new Date()
        };
        let user;
        if (db) {
            const usersCollection = db.collection('users');
            await usersCollection.updateOne({ uid }, { $set: userData, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
            user = await usersCollection.findOne({ uid });
        } else {
            const users = loadUsersJSON();
            const existingIndex = users.findIndex(u => u.uid === uid);
            if (existingIndex > -1) { users[existingIndex] = { ...users[existingIndex], ...userData }; user = users[existingIndex]; }
            else { userData.createdAt = new Date(); users.push(userData); user = userData; }
            writeUsersJSON(users);
        }
        const token = generateToken(user);
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
        res.json({ success: true, user, isNewUser: !user.onboardingComplete });
    } catch (e) { console.error('Google Auth Error:', e); res.status(401).json({ error: 'Invalid Google token' }); }
});

router.post('/phone', async (req, res) => {
    try {
        const { idToken, fullName } = req.body;
        if (!idToken) return res.status(400).json({ error: 'ID Token required' });
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, phone_number } = decodedToken;
        const db = req.app.get('db');
        const userData = {
            uid, fullName: fullName || 'Phone User', email: null, phone: phone_number, provider: 'phone', updatedAt: new Date()
        };
        let user;
        if (db) {
            const usersCollection = db.collection('users');
            await usersCollection.updateOne({ uid }, { $set: userData, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
            user = await usersCollection.findOne({ uid });
        } else {
            const users = loadUsersJSON();
            const existingIndex = users.findIndex(u => u.uid === uid);
            if (existingIndex > -1) { users[existingIndex] = { ...users[existingIndex], ...userData }; user = users[existingIndex]; }
            else { userData.createdAt = new Date(); users.push(userData); user = userData; }
            writeUsersJSON(users);
        }
        const token = generateToken(user);
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
        res.json({ success: true, user, isNewUser: !user.onboardingComplete });
    } catch (e) { console.error('Phone Auth Error:', e); res.status(401).json({ error: 'Invalid Phone token' }); }
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const db = req.app.get('db');
        let user;
        if (db) user = await db.collection('users').findOne({ uid: req.user.uid });
        else user = loadUsersJSON().find(u => u.uid === req.user.uid);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ ...user, isAdmin: user.email === 'ramaiah5496@gmail.com' });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token', { path: '/', secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
    res.json({ success: true, message: 'Logged out successfully' });
});

router.patch('/profile', authMiddleware, async (req, res) => {
    try {
        const { fullName, actor, cinephileLevel, motherTongue, favouriteActress, favouriteDirector, favouriteComposer } = req.body;
        const db = req.app.get('db');
        const updateData = { updatedAt: new Date() };
        if (fullName) updateData.fullName = fullName;
        if (actor) updateData.actor = actor;
        if (cinephileLevel) updateData.cinephileLevel = cinephileLevel;
        if (motherTongue) updateData.motherTongue = motherTongue;
        if (favouriteActress) updateData.favouriteActress = favouriteActress;
        if (favouriteDirector) updateData.favouriteDirector = favouriteDirector;
        if (favouriteComposer) updateData.favouriteComposer = favouriteComposer;
        let user;
        if (db) {
            const result = await db.collection('users').findOneAndUpdate({ uid: req.user.uid }, { $set: updateData }, { returnDocument: 'after' });
            user = result;
        } else {
            const users = loadUsersJSON();
            const idx = users.findIndex(u => u.uid === req.user.uid);
            if (idx > -1) { users[idx] = { ...users[idx], ...updateData }; user = users[idx]; writeUsersJSON(users); }
        }
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/onboarding', authMiddleware, async (req, res) => {
    try {
        const { fullName, motherTongue, favouriteActor, favouriteActress, favouriteDirector, favouriteComposer, profilePicture, badge, quizAnswers } = req.body;
        const db = req.app.get('db');
        const updateData = { onboardingComplete: true, badge: badge || 'rocky', quizAnswers: quizAnswers || [], updatedAt: new Date() };
        if (fullName) updateData.fullName = fullName;
        if (motherTongue) updateData.motherTongue = motherTongue;
        if (favouriteActor) updateData.actor = favouriteActor;
        if (favouriteActress) updateData.favouriteActress = favouriteActress;
        if (favouriteDirector) updateData.favouriteDirector = favouriteDirector;
        if (favouriteComposer) updateData.favouriteComposer = favouriteComposer;
        if (profilePicture) updateData.picture = profilePicture;
        let user;
        if (db) {
            const result = await db.collection('users').findOneAndUpdate({ uid: req.user.uid }, { $set: updateData }, { returnDocument: 'after' });
            user = result;
        } else {
            const users = loadUsersJSON();
            const idx = users.findIndex(u => u.uid === req.user.uid);
            if (idx > -1) { users[idx] = { ...users[idx], ...updateData }; user = users[idx]; writeUsersJSON(users); }
        }
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/user/:uid', async (req, res) => {
    try {
        const db = req.app.get('db');
        let user;
        if (db) user = await db.collection('users').findOne({ uid: req.params.uid });
        else user = loadUsersJSON().find(u => u.uid === req.params.uid);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ fullName: user.fullName, badge: user.badge || null, picture: user.picture || null });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;

