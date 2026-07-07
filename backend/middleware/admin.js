// middleware/admin.js — Admin authorization middleware
const { getCollection } = require('../config/db');

// Bootstrap admin list from env (comma-separated emails)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'ramaiah5496@gmail.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Middleware that checks if the authenticated user is an admin.
 * Must be used AFTER authMiddleware.
 *
 * Checks in order:
 * 1. `isAdmin` field on user document in DB
 * 2. Email match against ADMIN_EMAILS env var (bootstrap fallback)
 */
const requireAdmin = async (req, res, next) => {
    try {
        const usersCollection = getCollection('users');
        const email = (req.user.email || '').toLowerCase();

        // Check DB first
        if (usersCollection) {
            const user = await usersCollection.findOne({ uid: req.user.uid });
            if (user && user.isAdmin) return next();
        }

        // Fallback to env-based admin list
        if (ADMIN_EMAILS.includes(email)) {
            // Auto-promote in DB for future checks
            if (usersCollection) {
                await usersCollection.updateOne(
                    { uid: req.user.uid },
                    { $set: { isAdmin: true } }
                );
            }
            return next();
        }

        return res.status(403).json({ error: 'Admin access required' });
    } catch (err) {
        console.error('Admin check error:', err.message);
        return res.status(500).json({ error: 'Authorization check failed' });
    }
};

module.exports = requireAdmin;
