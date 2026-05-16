/**
 * @typedef {"image" | "video" | "html"} PlaylistItemType
 */

/**
 * @typedef {Object} PlaylistItem
 * @property {PlaylistItemType} type
 * @property {string} src
 * @property {number} durationMs
 * @property {string=} caption
 */

/**
 * @typedef {Object} PlaylistPayload
 * @property {string} playlistId
 * @property {PlaylistItem[]} items
 * @property {{start?: string, end?: string}=} schedule
 * @property {Record<string, any>=} meta
 */

export {};

