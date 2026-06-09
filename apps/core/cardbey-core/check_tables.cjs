const Database = require('better-sqlite3');
const db = new Database('./prisma/prod.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(tables.map(t => t.name).join('\n'));
db.close();
