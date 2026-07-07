// routes/comments.js — Comment CRUD + reactions
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const authMiddleware = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const { commentRules, reactionRules } = require('../middleware/validate');
const { getCollection } = require('../config/db');
const { readJSON, writeJSON } = require('../utils/json-store');
const { generateId, toId } = require('../utils/helpers');
const { createNotification } = require('../services/notification');

function getViewerUid(req) {
    if (!req.cookies.token) return null;
    try { return jwt.verify(req.cookies.token, JWT_SECRET).uid; }
    catch (e) { return null; }
}

// GET /api/reviews/:reviewId/comments — Get comments for a review
router.get('/review/:reviewId', async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const uid = getViewerUid(req);

        const commentsCollection = getCollection('comments');
        const commentReactionsCollection = getCollection('commentReactions');

        let comments = [];
        if (commentsCollection) {
            comments = await commentsCollection.find({ reviewId }).sort({ createdAt: 1 }).toArray();
        } else {
            comments = (await readJSON('comments.json'))
                .filter(c => c.reviewId === reviewId)
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        // Attach user reaction
        if (uid) {
            let reactions;
            if (commentReactionsCollection) {
                reactions = await commentReactionsCollection.find({
                    uid,
                    commentId: { $in: comments.map(c => c._id.toString()) },
                }).toArray();
            } else {
                const allReactions = await readJSON('comment_reactions.json');
                reactions = allReactions.filter(r => r.uid === uid);
            }

            const reactMap = {};
            reactions.forEach(r => reactMap[r.commentId] = r.type);
            comments = comments.map(c => ({ ...c, userReaction: reactMap[c._id.toString()] || null }));
        }

        res.json(comments);
    } catch (err) {
        console.error('Fetch comments error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/reviews/:reviewId/comments — Post a comment
router.post('/review/:reviewId', authMiddleware, commentRules, async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const { text, parentId } = req.body;

        const usersCollection = getCollection('users');
        const commentsCollection = getCollection('comments');
        const reviewsCollection = getCollection('reviews');

        // Fetch full user record
        let fullUser = null;
        if (usersCollection) {
            fullUser = await usersCollection.findOne({ uid: req.user.uid });
        } else {
            fullUser = (await readJSON('users.json')).find(u => u.uid === req.user.uid);
        }

        const comment = {
            _id: generateId(),
            reviewId,
            parentId: parentId || null,
            userId: req.user.uid,
            userName: (fullUser && fullUser.fullName) || req.user.name || 'Anonymous',
            userAvatar: (fullUser && fullUser.picture) || null,
            userBadge: (fullUser && fullUser.badge) || null,
            text: text.trim(),
            likes: 0,
            dislikes: 0,
            createdAt: new Date(),
        };

        if (commentsCollection) {
            const result = await commentsCollection.insertOne(comment);
            comment._id = result.insertedId;
        } else {
            const comments = await readJSON('comments.json');
            comments.push(comment);
            await writeJSON('comments.json', comments);
        }

        // Notifications
        if (parentId) {
            let parentComment;
            if (commentsCollection) {
                parentComment = await commentsCollection.findOne({ _id: toId(parentId) });
            } else {
                parentComment = (await readJSON('comments.json')).find(c => c._id === parentId);
            }
            if (parentComment && parentComment.userId !== req.user.uid) {
                await createNotification(parentComment.userId, req.user.uid, 'comment_reply', reviewId, 'replied to your comment');
            }
        } else {
            let review;
            if (reviewsCollection) {
                review = await reviewsCollection.findOne({ _id: toId(reviewId) });
            } else {
                review = (await readJSON('reviews.json')).find(r => r._id === reviewId);
            }
            if (review && review.uid !== req.user.uid) {
                await createNotification(review.uid, req.user.uid, 'comment_new', reviewId, `commented on your review of ${review.movieTitle}`);
            }
        }

        res.status(201).json(comment);
    } catch (err) {
        console.error('Comment error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/comments/:id — Admin delete comment + child replies
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const commentId = req.params.id;

        const commentsCollection = getCollection('comments');
        const commentReactionsCollection = getCollection('commentReactions');

        if (commentsCollection) {
            await commentsCollection.deleteMany({ parentId: commentId });
            await commentsCollection.deleteOne({ _id: toId(commentId) });
            await commentsCollection.deleteOne({ _id: commentId }); // string-based fallback
            if (commentReactionsCollection) {
                await commentReactionsCollection.deleteMany({ commentId });
            }
        } else {
            let comments = await readJSON('comments.json');
            comments = comments.filter(c => c._id !== commentId && c.parentId !== commentId);
            await writeJSON('comments.json', comments);
            let reactions = await readJSON('comment_reactions.json');
            reactions = reactions.filter(r => r.commentId !== commentId);
            await writeJSON('comment_reactions.json', reactions);
        }

        console.log(`🗑️ Admin deleted comment: ${commentId}`);
        res.json({ success: true, message: 'Comment deleted' });
    } catch (err) {
        console.error('Delete comment error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/comments/:id/react — Like/dislike a comment
router.post('/:id/react', authMiddleware, reactionRules, async (req, res) => {
    try {
        const commentId = req.params.id;
        const { type } = req.body;
        const uid = req.user.uid;

        const isLike = type === 'like';
        const field = isLike ? 'likes' : 'dislikes';
        const otherField = isLike ? 'dislikes' : 'likes';

        const commentsCollection = getCollection('comments');
        const commentReactionsCollection = getCollection('commentReactions');

        if (commentsCollection && commentReactionsCollection) {
            const existing = await commentReactionsCollection.findOne({ commentId, uid });

            if (!existing) {
                await commentReactionsCollection.insertOne({ commentId, uid, type, createdAt: new Date() });
                await commentsCollection.updateOne({ _id: toId(commentId) }, { $inc: { [field]: 1 } });
            } else if (existing.type === type) {
                await commentReactionsCollection.deleteOne({ _id: existing._id });
                await commentsCollection.updateOne({ _id: toId(commentId) }, { $inc: { [field]: -1 } });
            } else {
                await commentReactionsCollection.updateOne({ _id: existing._id }, { $set: { type, updatedAt: new Date() } });
                await commentsCollection.updateOne({ _id: toId(commentId) }, { $inc: { [field]: 1, [otherField]: -1 } });
            }

            const updated = await commentsCollection.findOne({ _id: toId(commentId) });

            if (isLike && (!existing || existing.type !== 'like')) {
                await createNotification(updated.userId, uid, 'comment_like', updated.reviewId, 'liked your comment');
            }

            return res.json({
                likes: updated.likes || 0,
                dislikes: updated.dislikes || 0,
                userReaction: existing && existing.type === type ? null : type,
            });
        }

        // Local JSON fallback
        const comments = await readJSON('comments.json');
        const reactions = await readJSON('comment_reactions.json');
        const comment = comments.find(c => c._id === commentId);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });

        const reactIdx = reactions.findIndex(r => r.commentId === commentId && r.uid === uid);
        let userReaction = type;
        let shouldNotifyLike = false;

        if (reactIdx === -1) {
            reactions.push({ commentId, uid, type, createdAt: new Date() });
            comment[field] = (comment[field] || 0) + 1;
            if (isLike) shouldNotifyLike = true;
        } else if (reactions[reactIdx].type === type) {
            reactions.splice(reactIdx, 1);
            comment[field] = Math.max(0, (comment[field] || 0) - 1);
            userReaction = null;
        } else {
            const oldField = reactions[reactIdx].type === 'like' ? 'likes' : 'dislikes';
            reactions[reactIdx].type = type;
            comment[field] = (comment[field] || 0) + 1;
            comment[oldField] = Math.max(0, (comment[oldField] || 0) - 1);
            if (isLike) shouldNotifyLike = true;
        }

        if (shouldNotifyLike) {
            await createNotification(comment.userId, uid, 'comment_like', comment.reviewId, 'liked your comment');
        }

        await writeJSON('comments.json', comments);
        await writeJSON('comment_reactions.json', reactions);
        res.json({ likes: comment.likes || 0, dislikes: comment.dislikes || 0, userReaction });
    } catch (err) {
        console.error('Comment react error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
