// services/notification.js — Notification creation + Web Push delivery
const webpush = require('web-push');
const { getCollection, hasDb } = require('../config/db');
const { readJSON, writeJSON } = require('../utils/json-store');
const { generateId } = require('../utils/helpers');

// Configure VAPID on module load
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:ramaiah5496@gmail.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('[Push] VAPID keys not set. Push notifications disabled.');
}

/**
 * Create an in-app notification and send a web push to the recipient.
 * Skips if sender === recipient.
 */
async function createNotification(recipientUid, senderUid, type, referenceId, text) {
    try {
        if (recipientUid === senderUid) return; // Don't notify yourself

        const usersCollection = getCollection('users');
        const notificationsCollection = getCollection('notifications');
        const subscriptionsCollection = getCollection('subscriptions');

        // Get sender details
        let sender;
        if (usersCollection) {
            sender = await usersCollection.findOne({ uid: senderUid });
        } else {
            const users = await readJSON('users.json');
            sender = users.find(u => u.uid === senderUid);
        }

        const notification = {
            _id: generateId(),
            recipientUid,
            senderUid,
            senderName: sender ? sender.fullName : 'Someone',
            senderAvatar: sender ? sender.picture : null,
            type, // 'follow', 'review_like', 'comment_like', 'comment_reply', 'comment_new'
            referenceId,
            text,
            isRead: false,
            createdAt: new Date(),
        };

        if (notificationsCollection) {
            await notificationsCollection.insertOne(notification);
        } else {
            const notifications = await readJSON('notifications.json');
            notifications.unshift(notification);
            await writeJSON('notifications.json', notifications.slice(0, 100));
        }

        // Send web push in the background (fire-and-forget)
        sendPushNotification(recipientUid, notification, text, type, referenceId, subscriptionsCollection);
    } catch (err) {
        console.error('[Notification] Creation failed:', err.message);
    }
}

/**
 * Send web push to all of the recipient's subscriptions.
 */
async function sendPushNotification(recipientUid, notification, text, type, referenceId, subscriptionsCollection) {
    try {
        let subs = [];
        if (subscriptionsCollection) {
            subs = await subscriptionsCollection.find({ uid: recipientUid }).toArray();
        } else {
            const allSubs = await readJSON('subscriptions.json');
            subs = allSubs.filter(s => s.uid === recipientUid);
        }

        if (subs.length === 0) return;

        const payload = JSON.stringify({
            title: 'Mouth-Talk Alert',
            body: `${notification.senderName} ${text}`,
            icon: 'https://t3.ftcdn.net/jpg/06/76/63/78/360_F_676637882_ywOxjtsIXUK79F6lKVtXAwYiI9zZ2h3H.jpg',
            data: { type, referenceId, url: `/pages/user-details.html?id=${referenceId}` },
        });

        for (const sub of subs) {
            try {
                await webpush.sendNotification(sub.subscription, payload);
            } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    // Subscription expired — clean up
                    if (subscriptionsCollection) {
                        await subscriptionsCollection.deleteOne({ _id: sub._id });
                    }
                    // For JSON fallback, expired subs are cleaned lazily
                }
            }
        }
    } catch (err) {
        console.error('[Push] Delivery error:', err.message);
    }
}

module.exports = { createNotification };
