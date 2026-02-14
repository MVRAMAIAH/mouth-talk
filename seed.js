// seed.js
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'mouthtalk';
const COLLECTION = process.env.COLLECTION || 'movies';

if(!MONGODB_URI){
  console.error('Please set MONGODB_URI in .env to run the seed script');
  process.exit(1);
}

async function run(){
  const client = new MongoClient(MONGODB_URI);
  try{
    await client.connect();
    const db = client.db(DB_NAME);
    const coll = db.collection(COLLECTION);

    const jsonPath = path.join(__dirname, 'assets', 'data', 'movies.json');
    if(!fs.existsSync(jsonPath)) throw new Error('movies.json not found');
    const data = JSON.parse(fs.readFileSync(jsonPath,'utf8'));
    if(!Array.isArray(data)) throw new Error('movies.json must be an array');

    const idsInJSON = data.map(m => m.id);

    // Upsert all movies from JSON
    for(const item of data){
      await coll.updateOne({ id: item.id }, { $set: item }, { upsert: true });
      console.log('Upserted:', item.id);
    }

    // Delete movies not in JSON
    const deleteResult = await coll.deleteMany({ id: { $nin: idsInJSON } });
    if(deleteResult.deletedCount > 0)
      console.log(`Deleted ${deleteResult.deletedCount} movies not in JSON`);

    console.log('Database fully synced with JSON!');
  }catch(err){
    console.error(err);
  }finally{
    await client.close();
  }
}

run();
