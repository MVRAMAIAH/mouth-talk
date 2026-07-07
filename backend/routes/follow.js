// routes/follow.js — Follow/Unfollow + follower/following lists
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const authMiddleware = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/auth');
const { getCollection } = require('../config/db');
const { readJSON, writeJSON } = require('../utils/json-store');
const { createNotification } = require('../services/notification');

function getViewerUid(req) {
    if (!req.cookies.token) return null;
    try { return jwt.verify(req.cookies.token, JWT_SECRET).uid; }
    catch (e) { return null; }
}

// POST /api/follow/:id — Follow a user
router.post('/:id', authMiddleware, async (req, res) => {
    try {
        const followerId = req.user.uid;
        const followingId = req.params.id;

        if (followerId === followingId) {
            return res.status(400).json({ error: 'You cannot follow yourself' });
        }

        const followsCollection = getCollection('follows');

        if (followsCollection) {
            await followsCollection.updateOne(
                { followerId, followingId },
                { $set: { followerId, followingId, createdAt: new Date() } },
                { upsert: true }
            );
        } else {
            const follows = await readJSON('follows.json');
            const exists = follows.find(f => f.followerId === followerId && f.followingId === followingId);
            if (!exists) {
                follows.push({ followerId, followingId, createdAt: new Date() });
                await writeJSON('follows.json', follows);
            }
        }

        await createNotification(followingId, followerId, 'follow', followerId, 'started following you');
        res.json({ success: true, message: 'Followed successfully' });
    } catch (err) {
        console.error('Follow error:', err);
        res.status(500).json({ error: 'Follow error' });
    }
});

// DELETE /api/unfollow/:id — Unfollow a user
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const followerId = req.user.uid;
        const followingId = req.params.id;

        const followsCollection = getCollection('follows');

        if (followsCollection) {
            await followsCollection.deleteOne({ followerId, followingId });
        } else {
            const follows = await readJSON('follows.json');
            const updated = follows.filter(f => !(f.followerId === followerId && f.followingId === followingId));
            await writeJSON('follows.json', updated);
        }

        res.json({ success: true, message: 'Unfollowed successfully' });
    } catch (err) {
        console.error('Unfollow error:', err);
        res.status(500).json({ error: 'Unfollow error' });
    }
});

// GET /api/users/:id/followers — Get followers list
router.get('/:id/followers', async (req, res) => {
    try {
        const targetUid = req.params.id;
        const viewerUid = getViewerUid(req);
        const followsCollection = getCollection('follows');
        const usersCollection = getCollection('users');

        let followers = [];
        if (followsCollection) {
            followers = await followsCollection.find({ followingId: targetUid }).toArray();
        } else {
            followers = (await readJSON('follows.json')).filter(f => f.followingId === targetUid);
        }

        const followerUids = followers.map(f => f.followerId);
        let followerProfiles = [];

        if (usersCollection) {
            followerProfiles = await usersCollection.find({ uid: { $in: followerUids } }).toArray();
        } else {
            followerProfiles = (await readJSON('users.json')).filter(u => followerUids.includes(u.uid));
        }

        // Check if viewer follows back
        let followedByViewer = [];
        if (viewerUid) {
            if (followsCollection) {
                const docs = await followsCollection.find({ followerId: viewerUid, followingId: { $in: followerUids } }).toArray();
                followedByViewer = docs.map(d => d.followingId);
            } else {
                followedByViewer = (await readJSON('follows.json'))
                    .filter(f => f.followerId === viewerUid && followerUids.includes(f.followingId))
                    .map(f => f.followingId);
            }
        }

        const safeProfiles = followerProfiles.map(u => ({
            uid: u.uid,
            fullName: u.fullName,
            picture: u.picture || null,
            badge: u.badge || null,
            isFollowing: followedByViewer.includes(u.uid),
        }));

        res.json(safeProfiles);
    } catch (err) {
        console.error('Fetch followers error:', err);
        res.status(500).json({ error: 'Fetch followers error' });
    }
});

// GET /api/users/:id/following — Get following list
router.get('/:id/following', async (req, res) => {
    try {
        const targetUid = req.params.id;
        const followsCollection = getCollection('follows');
        const usersCollection = getCollection('users');

        let following = [];
        if (followsCollection) {
            following = await followsCollection.find({ followerId: targetUid }).toArray();
        } else {
            following = (await readJSON('follows.json')).filter(f => f.followerId === targetUid);
        }

        const followingUids = following.map(f => f.followingId);
        let followingProfiles = [];

        if (usersCollection) {
            followingProfiles = await usersCollection.find({ uid: { $in: followingUids } }).toArray();
        } else {
            followingProfiles = (await readJSON('users.json')).filter(u => followingUids.includes(u.uid));
        }

        const safeProfiles = followingProfiles.map(u => ({
            uid: u.uid,
            fullName: u.fullName,
            picture: u.picture || null,
            badge: u.badge || null,
            isFollowing: true,
        }));

        res.json(safeProfiles);
    } catch (err) {
        console.error('Fetch following error:', err);
        res.status(500).json({ error: 'Fetch following error' });
    }
});

module.exports = router;
