/**
 * Menu layout — categorized items with prices and descriptions.
 */

const MENU_SECTION_RE =
  /^(APPETIZERS|STARTERS|MAINS|ENTREES|DESSERTS|DRINKS|BEVERAGES|BREAKFAST|LUNCH|DINNER|WINE|BEER|COFFEE|TEA|SALADS|SIDES|SPECIALS)$/i;
const PRICE_RE = /\$?\s*(\d+(?:\.\d{1,2})?)\s*$/;

export class MenuLayout {
  async process(content, options = {}) {
    const lines = content.split('\n').filter((l) => l.trim());
    const menu = this._parseMenu(lines);
    const formatted = this._formatMenu(menu, options);

    return {
      processed: formatted,
      stats: {
        sections: menu.sections.length,
        items: menu.items.length,
        categories: Object.keys(menu.categories).length,
      },
      suggestedActions: [
        { id: 'add_item', label: 'Add menu item' },
        { id: 'edit_prices', label: 'Edit prices' },
        { id: 'publish_menu', label: 'Publish menu' },
      ],
    };
  }

  _parseMenu(lines) {
    const menu = {
      sections: [],
      items: [],
      categories: {},
    };

    let currentSection = 'General';
    if (!menu.categories[currentSection]) {
      menu.categories[currentSection] = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const nextLine = lines[i + 1]?.trim() || '';

      if (this._isSectionHeader(trimmed)) {
        currentSection = trimmed.replace(/\s+/g, ' ');
        if (!menu.sections.includes(currentSection)) {
          menu.sections.push(currentSection);
        }
        if (!menu.categories[currentSection]) {
          menu.categories[currentSection] = [];
        }
        continue;
      }

      const priceMatch = trimmed.match(PRICE_RE);
      const inlinePrice = trimmed.match(/(.+?)\s+\$?(\d+(?:\.\d{1,2})?)\s*$/);

      if (priceMatch || inlinePrice) {
        const price = priceMatch?.[1] || inlinePrice?.[2];
        let name = trimmed.replace(PRICE_RE, '').trim();
        let description = '';

        if (inlinePrice && !priceMatch) {
          name = inlinePrice[1].trim();
        }

        if (nextLine && !PRICE_RE.test(nextLine) && !this._isSectionHeader(nextLine)) {
          description = nextLine;
          i++;
        } else {
          const dashSplit = name.split(/\s[-–—]\s/);
          if (dashSplit.length > 1) {
            name = dashSplit[0].trim();
            description = dashSplit.slice(1).join(' - ').trim();
          }
        }

        const item = {
          name,
          price,
          section: currentSection,
          description,
        };
        menu.items.push(item);
        menu.categories[currentSection].push(item);
      }
    }

    if (menu.sections.length === 0 && menu.items.length > 0) {
      menu.sections.push('General');
    }

    return menu;
  }

  _isSectionHeader(line) {
    if (PRICE_RE.test(line)) return false;
    if (MENU_SECTION_RE.test(line)) return true;
    return line === line.toUpperCase() && line.length > 3 && line.split(/\s+/).length <= 4;
  }

  _formatMenu(menu, options) {
    const format = options.format || 'markdown';
    if (format === 'json') {
      return JSON.stringify(menu, null, 2);
    }

    let result = '# MENU\n\n';
    const sections = menu.sections.length ? menu.sections : ['General'];

    for (const section of sections) {
      result += `## ${section}\n\n`;
      const items = menu.categories[section] || [];
      for (const item of items) {
        result += `### ${item.name}\n`;
        if (item.description) {
          result += `${item.description}\n`;
        }
        result += `**$${item.price}**\n\n`;
      }
    }

    return result.trim();
  }
}

export default MenuLayout;
