/**
 * External MCP client tool manifest. Maps public tool names → internal registry tool names.
 * Mostly read-only store context; includes `create_calendar_event` (Google Calendar write) when the user has a Google OAuthConnection.
 */

export const MCP_SERVER_INFO = {
  name: 'cardbey',
  version: '1.0.0',
  description: 'Cardbey — read-only store context (Mission Execution / dispatchTool)',
};

export const MCP_TOOL_MANIFEST = [
  {
    name: 'get_store_products',
    description: 'Published products for the connected store (names, descriptions, prices, categories).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max products (default 20)', default: 20 },
        offset: { type: 'number', description: 'Pagination offset', default: 0 },
      },
    },
    _internalTool: 'mcp_context_products',
  },
  {
    name: 'get_store_profile',
    description: 'Business profile summary for the connected store.',
    inputSchema: { type: 'object', properties: {} },
    _internalTool: 'mcp_context_business',
  },
  {
    name: 'get_store_assets',
    description: 'Branding assets: hero, avatar, colors, tagline.',
    inputSchema: { type: 'object', properties: {} },
    _internalTool: 'mcp_context_store_assets',
  },
  {
    name: 'get_store_promotions',
    description: 'Active/planned promotions for the store.',
    inputSchema: { type: 'object', properties: {} },
    _internalTool: 'mcp_context_promotions',
  },
  {
    name: 'get_mission_history',
    description: 'Recent MissionPipeline runs for your account (scoped to this store when connected).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max missions (default 10)', default: 10 },
      },
    },
    _internalTool: 'mcp_context_missions',
  },
  {
    name: 'get_store_analytics',
    description: 'Counts: products, promotions, missions for this store.',
    inputSchema: { type: 'object', properties: {} },
    _internalTool: 'mcp_context_analytics',
  },
  {
    name: 'create_calendar_event',
    description:
      "Create an event on the user's Google Calendar (requires linked Google account with Calendar scope). Does not email guests unless sendUpdates is set.",
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title' },
        startDateTime: { type: 'string', description: 'Start time (ISO 8601)' },
        endDateTime: { type: 'string', description: 'End time (ISO 8601)' },
        timeZone: { type: 'string', description: 'IANA timezone if dateTime values are wall-local' },
        description: { type: 'string' },
        location: { type: 'string' },
        calendarId: { type: 'string', description: 'Calendar id (default: primary or OAuthConnection.pageId)' },
        sendUpdates: {
          type: 'string',
          enum: ['none', 'all', 'externalOnly'],
          description: 'Whether to send attendee updates (default none)',
        },
      },
      required: ['summary', 'startDateTime', 'endDateTime'],
    },
    _internalTool: 'mcp_google_calendar_create_event',
  },
];

/** @type {Record<string, string>} */
export const EXTERNAL_TO_INTERNAL_TOOL = Object.fromEntries(
  MCP_TOOL_MANIFEST.map((t) => [t.name, t._internalTool]),
);
