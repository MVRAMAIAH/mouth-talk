// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyACURDS3NO0tj_Q9D7zPz3F1W2FFRGwa04",
    authDomain: "mouth-talk.firebaseapp.com",
    projectId: "mouth-talk",
    storageBucket: "mouth-talk.firebasestorage.app",
    messagingSenderId: "85743096745",
    appId: "1:85743096745:web:0756be0de224a3ee7deab8",
    measurementId: "G-W84G3B216W"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Global instances
const auth = firebase.auth();
const analytics = firebase.analytics();

console.log("✅ Firebase initialized with Analytics");
