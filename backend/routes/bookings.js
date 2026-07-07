// routes/bookings.js — Booking verification route
const express = require('express');
const router = express.Router();

const { bookingVerifyRules } = require('../middleware/validate');
const { getCollection } = require('../config/db');
const { readJSON } = require('../utils/json-store');

// POST /api/verify-booking — Verify a booking ID before review submission
router.post('/', bookingVerifyRules, async (req, res) => {
    try {
        const { bookingId, movieId } = req.body;
        const upperBookingId = bookingId.toUpperCase();

        const bookingsCollection = getCollection('bookings');

        if (bookingsCollection) {
            const doc = await bookingsCollection.findOne({ movieId, bookingId: upperBookingId });
            if (!doc) return res.status(404).json({ error: 'Invalid booking ID' });
            if (doc.used) return res.status(400).json({ error: 'This booking ID has already been used for a review' });
        } else {
            const bookings = await readJSON('bookings.json');
            const movieBookings = bookings[movieId];
            if (!movieBookings || !movieBookings.includes(upperBookingId)) {
                return res.status(404).json({ error: 'Invalid booking ID' });
            }
            const reviews = await readJSON('reviews.json');
            if (reviews.some(r => r.bookingId === upperBookingId)) {
                return res.status(400).json({ error: 'This booking ID has already been used for a review' });
            }
        }

        const allMovies = await readJSON('movies.json');
        const movie = allMovies.find(m => m.id === movieId);
        res.json({ valid: true, bookingId: upperBookingId, movieId, movieTitle: movie ? movie.title : movieId });
    } catch (err) {
        console.error('Verify booking error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
