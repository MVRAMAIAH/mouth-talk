// routes/notifications.js — Notification + Push subscription routes
const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const { getCollection } = require('../config/db');
const { readJSON, writeJSON } = require('../utils/json-store');
const { generateId, toId } = require('../utils/helpers');

// GET /api/notifications — Get user's notifications
router.get('/', authMiddleware, async (req, res) => {
    try {
        const uid = req.user.uid;
        const notificationsCollection = getCollection('notifications');

        let notifications = [];
        if (notificationsCollection) {
            notifications = await notificationsCollection
                .find({ recipientUid: uid })
                .sort({ createdAt: -1 })
                .limit(50)
                .toArray();
        } else {
            notifications = (await readJSON('notifications.json'))
                .filter(n => n.recipientUid === uid)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        res.json(notifications);
    } catch (err) {
        console.error('Fetch notifications error:', err);
        res.status(500).json({ error: 'Fetch notifications failed' });
    }
});

// GET /api/notifications/unread-count — Get unread count
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const uid = req.user.uid;
        const notificationsCollection = getCollection('notifications');

        let count = 0;
        if (notificationsCollection) {
            count = await notificationsCollection.countDocuments({ recipientUid: uid, isRead: false });
        } else {
            count = (await readJSON('notifications.json'))
                .filter(n => n.recipientUid === uid && !n.isRead).length;
        }

        res.json({ count });
    } catch (err) {
        console.error('Fetch unread count error:', err);
        res.status(500).json({ error: 'Fetch unread count failed' });
    }
});

// POST /api/notifications/mark-read — Mark notifications as read
router.post('/mark-read', authMiddleware, async (req, res) => {
    try {
        const uid = req.user.uid;
        const { id } = req.body;
        const notificationsCollection = getCollection('notifications');

        if (notificationsCollection) {
            const filter = { recipientUid: uid };
            if (id) filter._id = toId(id);
            await notificationsCollection.updateMany(filter, { $set: { isRead: true } });
        } else {
            const notifications = await readJSON('notifications.json');
            notifications.forEach(n => {
                if (n.recipientUid === uid && (!id || n._id === id)) {
                    n.isRead = true;
                }
            });
            await writeJSON('notifications.json', notifications);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Mark read failed' });
    }
});

// POST /api/notifications/subscribe — Register push subscription
router.post('/subscribe', authMiddleware, async (req, res) => {
    try {
        const uid = req.user.uid;
        const { subscription } = req.body;
        if (!subscription) return res.status(400).json({ error: 'Subscription is required' });

        const subscriptionsCollection = getCollection('subscriptions');

        const subDoc = {
            _id: generateId(),
            uid,
            subscription,
            createdAt: new Date(),
        };

        if (subscriptionsCollection) {
            await subscriptionsCollection.updateOne(
                { uid, 'subscription.endpoint': subscription.endpoint },
                { $set: subDoc },
                { upsert: true }
            );
        } else {
            const subs = await readJSON('subscriptions.json');
            const exists = subs.findIndex(s => s.uid === uid && s.subscription.endpoint === subscription.endpoint);
            if (exists > -1) subs[exists] = subDoc;
            else subs.push(subDoc);
            await writeJSON('subscriptions.json', subs);
        }

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Subscribe error:', err);
        res.status(500).json({ error: 'Subscription failed' });
    }
});

// POST /api/notifications/unsubscribe — Remove push subscription
router.post('/unsubscribe', authMiddleware, async (req, res) => {
    try {
        const uid = req.user.uid;
        const { endpoint } = req.body;
        const subscriptionsCollection = getCollection('subscriptions');

        if (subscriptionsCollection) {
            await subscriptionsCollection.deleteOne({ uid, 'subscription.endpoint': endpoint });
        } else {
            const subs = await readJSON('subscriptions.json');
            const filtered = subs.filter(s => !(s.uid === uid && s.subscription.endpoint === endpoint));
            await writeJSON('subscriptions.json', filtered);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Unsubscribe error:', err);
        res.status(500).json({ error: 'Unsubscribe failed' });
    }
});

module.exports = router;
