const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (serviceAccountPath) {
    try {
        const resolvedPath = path.isAbsolute(serviceAccountPath)
            ? serviceAccountPath
            : path.resolve(__dirname, '..', serviceAccountPath);

        if (fs.existsSync(resolvedPath)) {
            const serviceAccount = require(resolvedPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('✅ Firebase Admin SDK initialized');
        } else {
            console.warn(`⚠️ Firebase Service Account file not found at: ${resolvedPath}`);
            console.warn('⚠️ Authentication verification will fail.');
        }
    } catch (error) {
        console.error('❌ Error initializing Firebase Admin SDK:', error.message);
        console.warn('⚠️ Running without Firebase Admin. Verification features may fail.');
    }
} else {
    console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_PATH not found in .env');
    console.warn('⚠️ Authentication verification will fail.');
}

module.exports = admin;
