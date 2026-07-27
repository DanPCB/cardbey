import { describe, expect, it } from 'vitest';
import { extractFreshaSlugFromHtml } from '../freshaVenueDiscovery.js';

const FRESHA_NEXT_DATA = `
<script id="__NEXT_DATA__" type="application/json">{
  "props": {
    "pageProps": {
      "data": {
        "location": {
          "slug": "demo-salon-melbourne-123-smith-street-abc123",
          "isBookable": true,
          "serviceCount": 2
        }
      }
    }
  }
}</script>
`;

describe('freshaVenueDiscovery', () => {
  it('extracts Fresha slug from venue page HTML', () => {
    expect(extractFreshaSlugFromHtml(FRESHA_NEXT_DATA)).toBe(
      'demo-salon-melbourne-123-smith-street-abc123',
    );
  });
});
