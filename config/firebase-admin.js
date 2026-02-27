const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (serviceAccountJSON) {
    // Method 1: Full JSON pasted as env var
    try {
        const serviceAccount = JSON.parse(serviceAccountJSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin SDK initialized (from env JSON)');
    } catch (error) {
        console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
    }
} else if (firebasePrivateKey && firebaseProjectId && firebaseClientEmail) {
    // Method 2: Individual env vars (common on Render)
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: firebaseProjectId,
                clientEmail: firebaseClientEmail,
                privateKey: firebasePrivateKey.replace(/\\n/g, '\n')
            })
        });
        console.log('✅ Firebase Admin SDK initialized (from individual env vars)');
    } catch (error) {
        console.error('❌ Error initializing with env vars:', error.message);
    }
} else if (serviceAccountPath) {
    // Method 3: File path (local dev)
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
    console.warn('⚠️ Or set FIREBASE_PRIVATE_KEY + FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL');
}

module.exports = admin;
