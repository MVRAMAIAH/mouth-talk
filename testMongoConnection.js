const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ramaiah5496:FORGOTPASSWORD@mouthtalk.86nmkqs.mongodb.net/mouthtalk';

async function testConnection() {
    const client = new MongoClient(MONGODB_URI);
    try {
        console.log('Attempting to connect to MongoDB...');
        await client.connect();
        console.log('Connected successfully to MongoDB!');
        await client.db().admin().ping();
        console.log('Ping successful! MongoDB is reachable.');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
    } finally {
        await client.close();
    }
}

testConnection();