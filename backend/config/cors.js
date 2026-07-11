// config/cors.js — CORS configuration
const cors = require('cors');

/**
 * Build CORS middleware from environment configuration.
 * Reads ALLOWED_ORIGINS as a comma-separated list of domains.
 * Actually rejects unauthorized origins instead of logging and allowing.
 */
function buildCors() {
    const envOrigins = process.env.ALLOWED_ORIGINS || '';
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://mouth-talk.onrender.com',
        'https://mtalk-mouth-talk.onrender.com', // Keep old one just in case
        ...envOrigins.split(',').map(s => s.trim()).filter(Boolean)
    ];

    return cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, curl, server-to-server)
            if (!origin) return callback(null, true);

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.warn(`[CORS] Blocked request from origin: ${origin}`);
            return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
        },
        credentials: true,
    });
}

module.exports = { buildCors };
