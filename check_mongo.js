const { MongoClient } = require('mongodb');
const fs = require('fs');

async function check() {
    let client;
    try {
        client = await MongoClient.connect('mongodb://127.0.0.1:27017/', { serverSelectionTimeoutMS: 2000 });
        const db = client.db('mouthtalk');
        const collections = ['tollywood', 'kollywood', 'sandalwood', 'mollywood', 'bollywood', 'hollywood', 'webseries'];
        
        console.log('--- MONGODB MOVIES ---');
        for (const cat of collections) {
            const docs = await db.collection(cat).find({}).toArray();
            for (const doc of docs) {
                console.log(`[${cat}] ID: ${doc.id} | Title: ${doc.title} | Poster: ${doc.poster}`);
            }
        }
        
        console.log('\n--- LOCAL JSON MOVIES ---');
        const dataPath = 'c:\\Users\\venket ramaiah\\Desktop\\mouth-talk\\backend\\data\\movies.json';
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath));
            for (const doc of data) {
                console.log(`JSON ID: ${doc.id} | Title: ${doc.title} | Poster: ${doc.poster}`);
            }
        }
    } catch(err) {
        console.error('Error:', err.message);
    } finally {
        if (client) await client.close();
        process.exit(0);
    }
}
check();
