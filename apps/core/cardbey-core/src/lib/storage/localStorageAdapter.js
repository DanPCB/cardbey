import fs from 'fs';
import path from 'path';
import { makeObjectKey } from './makeObjectKey.js';

const DEFAULT_UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

/**
 * @param {string} [uploadsRoot]
 */
export function createLocalStorageAdapter(uploadsRoot = DEFAULT_UPLOADS_ROOT) {
  return {
    driver: 'local',

    /**
     * @param {import('./mediaCategories.js').MediaCategory} category
     * @param {Buffer} buffer
     * @param {string} originalName
     * @param {string} mimeType
     * @returns {Promise<{ key: string, url: string }>}
     */
    async uploadBuffer(category, buffer, originalName, mimeType) {
      if (!fs.existsSync(uploadsRoot)) {
        fs.mkdirSync(uploadsRoot, { recursive: true });
      }

      const key = makeObjectKey(category, originalName, mimeType);
      const filePath = path.join(uploadsRoot, key);
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      fs.writeFileSync(filePath, buffer);
      const url = `/uploads/${key}`;
      return { key, url };
    },

    /**
     * @param {string} key
     * @param {Buffer} buffer
     * @param {string} mimeType
     * @returns {Promise<{ key: string, url: string }>}
     */
    async uploadWithKey(key, buffer, mimeType) {
      void mimeType;
      if (!fs.existsSync(uploadsRoot)) {
        fs.mkdirSync(uploadsRoot, { recursive: true });
      }
      const filePath = path.join(uploadsRoot, key);
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      fs.writeFileSync(filePath, buffer);
      return { key, url: `/uploads/${key}` };
    },
  };
}
