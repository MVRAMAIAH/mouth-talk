const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (serviceAccountJSON) {
    // For deployed environments (Render, etc.) — JSON pasted as env var
    try {
        const serviceAccount = JSON.parse(serviceAccountJSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin SDK initialized (from env JSON)');
    } catch (error) {
        console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
    }
} else if (serviceAccountPath) {
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
    console.warn('⚠️ No Firebase service account configured.');
    console.warn('⚠️ Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH');
}

module.exports = admin;
