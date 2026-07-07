// utils/helpers.js — Shared utility functions
const { ObjectId } = require('mongodb');

/**
 * Generate a compact unique ID (for JSON-stored documents).
 * Format: base36 timestamp + 7 random chars
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Safely convert a string to MongoDB ObjectId if it looks like one,
 * otherwise return the original value.
 */
function toId(id) {
    if (!id) return id;
    if (typeof id !== 'string') return id;
    if (id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
        try { return new ObjectId(id); } catch (e) { return id; }
    }
    return id;
}

module.exports = { generateId, toId };
