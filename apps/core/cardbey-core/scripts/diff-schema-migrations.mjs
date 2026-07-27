#!/usr/bin/env node
/**
 * Compare prisma/postgres/schema.prisma scalar fields vs columns
 * created/altered in prisma/postgres/migrations/*.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseSchema(schemaPath) {
  const text = fs.readFileSync(schemaPath, 'utf8');
  const models = {};
  const re = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const body = m[2];
    let table = name;
    const mapM = body.match(/@@map\("([^"]+)"\)/);
    if (mapM) table = mapM[1];
    const fields = [];
    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
      const fm = /^(\w+)\s+(\w+)(\?|\[\])?/.exec(t);
      if (!fm) continue;
      const fname = fm[1];
      const ftype = fm[2];
      const optional = fm[3] === '?';
      const isList = fm[3] === '[]';
      if (isList) continue;
      if (!['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'BigInt', 'Decimal'].includes(ftype)) {
        continue;
      }
      let defaultVal = null;
      const defM = t.match(/@default\(([^)]+)\)/);
      if (defM) defaultVal = defM[1];
      fields.push({ name: fname, type: ftype, optional, defaultVal, line: t });
    }
    models[table] = { model: name, fields };
  }
  return models;
}

function parseMigrations(dir) {
  const tables = {};
  const dirs = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isDirectory()).sort();
  for (const d of dirs) {
    const sqlPath = path.join(dir, d, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const createRe = /CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"\s*\(([\s\S]*?)\);/g;
    let cm;
    while ((cm = createRe.exec(sql)) !== null) {
      const table = cm[1];
      const body = cm[2];
      if (!tables[table]) tables[table] = new Set();
      for (const line of body.split(',')) {
        const colM = /^\s*"([^"]+)"/.exec(line.trim());
        if (colM) tables[table].add(colM[1]);
      }
    }
    // Single or multi-column ADD (including continuation lines without table name)
    const addRe = /ADD COLUMN(?: IF NOT EXISTS)? "([^"]+)"/g;
    let am;
    let lastTable = null;
    const tableRe = /ALTER TABLE "([^"]+)"/g;
    const chunks = sql.split(';');
    for (const chunk of chunks) {
      const tm = tableRe.exec(chunk);
      if (tm) lastTable = tm[1];
      if (!lastTable) continue;
      addRe.lastIndex = 0;
      while ((am = addRe.exec(chunk)) !== null) {
        if (!tables[lastTable]) tables[lastTable] = new Set();
        tables[lastTable].add(am[1]);
      }
    }
  }
  return tables;
}

function prismaTypeToSql(field) {
  const { type, optional, defaultVal } = field;
  let sql = '';
  switch (type) {
    case 'String':
      sql = 'TEXT';
      break;
    case 'Int':
      sql = 'INTEGER';
      break;
    case 'Float':
      sql = 'DOUBLE PRECISION';
      break;
    case 'Boolean':
      sql = 'BOOLEAN';
      break;
    case 'DateTime':
      sql = 'TIMESTAMP(3)';
      break;
    case 'Json':
      sql = 'JSONB';
      break;
    case 'Bytes':
      sql = 'BYTEA';
      break;
    case 'BigInt':
      sql = 'BIGINT';
      break;
    case 'Decimal':
      sql = 'DECIMAL(65,30)';
      break;
    default:
      sql = 'TEXT';
  }
  if (!optional && defaultVal != null) {
    if (type === 'Boolean') sql += ` NOT NULL DEFAULT ${defaultVal}`;
    else if (type === 'Int') sql += ` NOT NULL DEFAULT ${defaultVal}`;
    else if (type === 'String' && defaultVal.startsWith('"')) sql += ` NOT NULL DEFAULT ${defaultVal}`;
    else if (defaultVal === 'now()') sql += ' NOT NULL DEFAULT CURRENT_TIMESTAMP';
    else if (defaultVal === 'false' || defaultVal === 'true') sql += ` NOT NULL DEFAULT ${defaultVal}`;
    else sql += ` NOT NULL DEFAULT ${defaultVal}`;
  } else if (!optional && type === 'Boolean') {
    sql += ' NOT NULL DEFAULT false';
  } else if (!optional && type === 'Int' && field.name.includes('Remaining')) {
    sql += ' NOT NULL DEFAULT 1';
  } else if (!optional) {
    sql += ' NOT NULL';
  }
  return sql;
}

const schema = parseSchema(path.join(root, 'prisma/postgres/schema.prisma'));
const migrated = parseMigrations(path.join(root, 'prisma/postgres/migrations'));

const missing = [];
for (const [table, { model, fields }] of Object.entries(schema)) {
  const migCols = migrated[table];
  if (!migCols) {
    missing.push({ table, model, kind: 'no_create_in_migrations' });
    continue;
  }
  for (const f of fields) {
    if (!migCols.has(f.name)) {
      missing.push({ table, model, column: f.name, field: f });
    }
  }
}

console.log('=== Missing columns (schema vs migrations SQL) ===');
for (const x of missing.filter((r) => r.column)) {
  console.log(`${x.table}.${x.column} (${x.field.type}${x.field.optional ? '?' : ''})`);
}
console.log(`\nTotal: ${missing.filter((r) => r.column).length}`);

if (process.argv.includes('--sql')) {
  console.log('\n-- Generated ALTER statements');
  for (const x of missing.filter((r) => r.column)) {
    const sqlType = prismaTypeToSql(x.field);
    console.log(
      `ALTER TABLE "${x.table}" ADD COLUMN IF NOT EXISTS "${x.column}" ${sqlType};`,
    );
  }
}

const noTable = missing.filter((r) => !r.column);
if (noTable.length) {
  console.log('\n=== Tables in schema but not parsed from migrations CREATE ===');
  for (const x of noTable) console.log(x.table, `(${x.model})`);
}
