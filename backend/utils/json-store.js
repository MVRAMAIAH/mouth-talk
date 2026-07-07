// utils/json-store.js — Async JSON file storage with simple locking
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Simple in-memory lock to prevent concurrent read-modify-write races
const locks = new Map();

async function acquireLock(filename) {
    while (locks.get(filename)) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    locks.set(filename, true);
}

function releaseLock(filename) {
    locks.delete(filename);
}

/**
 * Read and parse a JSON file from the data directory.
 * Returns the parsed data or an empty array/object fallback.
 */
async function readJSON(filename) {
    const jsonPath = path.join(DATA_DIR, filename);
    try {
        const raw = await fsp.readFile(jsonPath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        console.error(`JSON read error (${filename}):`, e.message);
        return [];
    }
}

/**
 * Write data to a JSON file in the data directory.
 * Uses a simple lock to prevent concurrent write corruption.
 */
async function writeJSON(filename, data) {
    const jsonPath = path.join(DATA_DIR, filename);
    await acquireLock(filename);
    try {
        await fsp.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`JSON write error (${filename}):`, e.message);
    } finally {
        releaseLock(filename);
    }
}

/**
 * Atomic read-modify-write: reads, applies a mutator function, writes back.
 * Prevents race conditions on concurrent requests.
 */
async function updateJSON(filename, mutatorFn) {
    await acquireLock(filename);
    try {
        const jsonPath = path.join(DATA_DIR, filename);
        let data;
        try {
            const raw = await fsp.readFile(jsonPath, 'utf8');
            data = JSON.parse(raw);
        } catch (e) {
            data = [];
        }
        const result = await mutatorFn(data);
        await fsp.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf8');
        return result;
    } catch (e) {
        console.error(`JSON update error (${filename}):`, e.message);
        throw e;
    } finally {
        releaseLock(filename);
    }
}

module.exports = { readJSON, writeJSON, updateJSON, DATA_DIR };
