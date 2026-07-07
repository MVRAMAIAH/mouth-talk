// middleware/validate.js — Input validation schemas using express-validator
const { body, query, param, validationResult } = require('express-validator');

/**
 * Middleware that checks validation results and returns 400 on failure.
 */
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
    }
    next();
};

// ─── Validation Rule Sets ─────────────────────────────

const reviewRules = [
    body('bookingId').trim().notEmpty().withMessage('Booking ID is required')
        .isAlphanumeric().withMessage('Booking ID must be alphanumeric')
        .isLength({ min: 1, max: 20 }).withMessage('Booking ID too long'),
    body('movieId').trim().notEmpty().withMessage('Movie ID is required'),
    body('userName').trim().notEmpty().withMessage('Username is required')
        .isLength({ max: 100 }).withMessage('Username too long')
        .escape(),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('text').trim().notEmpty().withMessage('Review text is required')
        .isLength({ max: 5000 }).withMessage('Review text must be under 5000 characters'),
    body('movieTitle').optional().trim().isLength({ max: 200 }).escape(),
    body('userBadge').optional().trim().isLength({ max: 50 }),
    handleValidation,
];

const commentRules = [
    body('text').trim().notEmpty().withMessage('Comment text is required')
        .isLength({ max: 2000 }).withMessage('Comment must be under 2000 characters'),
    body('parentId').optional({ values: 'null' }).trim(),
    handleValidation,
];

const reactionRules = [
    body('type').isIn(['like', 'dislike']).withMessage('Type must be "like" or "dislike"'),
    handleValidation,
];

const movieRules = [
    body('id').trim().notEmpty().withMessage('Movie ID is required'),
    body('title').trim().notEmpty().withMessage('Title is required')
        .isLength({ max: 300 }).withMessage('Title too long'),
    body('category').trim().notEmpty().withMessage('Category is required')
        .isIn(['tollywood', 'kollywood', 'sandalwood', 'mollywood', 'bollywood', 'hollywood', 'webseries'])
        .withMessage('Invalid category'),
    body('poster').trim().notEmpty().withMessage('Poster URL is required'),
    handleValidation,
];

const searchRules = [
    query('query').trim()
        .isLength({ min: 2 }).withMessage('Search query must be at least 2 characters')
        .isLength({ max: 100 }).withMessage('Search query too long'),
    handleValidation,
];

const bookingVerifyRules = [
    body('bookingId').trim().notEmpty().withMessage('Booking ID is required'),
    body('movieId').trim().notEmpty().withMessage('Movie ID is required'),
    handleValidation,
];

const profileRules = [
    body('fullName').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('actor').optional().trim().isLength({ max: 100 }),
    body('cinephileLevel').optional().trim().isLength({ max: 50 }),
    body('motherTongue').optional().trim().isLength({ max: 50 }),
    body('favouriteActress').optional().trim().isLength({ max: 100 }),
    body('favouriteDirector').optional().trim().isLength({ max: 100 }),
    body('favouriteComposer').optional().trim().isLength({ max: 100 }),
    handleValidation,
];

const onboardingRules = [
    body('fullName').optional().trim().isLength({ min: 1, max: 100 }),
    body('motherTongue').optional().trim().isLength({ max: 50 }),
    body('favouriteActor').optional().trim().isLength({ max: 100 }),
    body('favouriteActress').optional().trim().isLength({ max: 100 }),
    body('favouriteDirector').optional().trim().isLength({ max: 100 }),
    body('favouriteComposer').optional().trim().isLength({ max: 100 }),
    body('badge').optional().trim().isLength({ max: 50 }),
    handleValidation,
];

const imageUploadRules = [
    body('filename').trim().notEmpty().withMessage('Filename is required')
        .isLength({ max: 200 }).withMessage('Filename too long'),
    body('base64').trim().notEmpty().withMessage('Image data is required'),
    handleValidation,
];

module.exports = {
    reviewRules,
    commentRules,
    reactionRules,
    movieRules,
    searchRules,
    bookingVerifyRules,
    profileRules,
    onboardingRules,
    imageUploadRules,
    handleValidation,
};
