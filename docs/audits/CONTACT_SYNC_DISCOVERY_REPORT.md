# Discovery Report: "Sync Contacts" in Old Cardbey Project

**Scope:** `C:\Users\desig\Desktop\New folder (2)\2025 BACKUP\Cardbey current live\caterwin_cardbey_web` (and sibling `cardbey-rn`)

**Conclusion:** No "sync contacts" implementation was found. The old project has contacts-related features that are **not** a store-owner CRM sync.

---

## A) Discovery Summary

### Search keywords used

- `sync contact`, `syncContact`, `contacts`, `crm`, `lead`, `customer`, `phonebook`, `import contacts`
- `google people`, `google contacts`, `outlook`, `microsoft graph`, `hubspot`, `zapier`

### Findings

| Finding | Location | What it is |
|--------|----------|------------|
| **Terms/legal mention** | `src/lang/en.js` line 730 | "We have the right to sync the contact on your phone with your profile on App." — legal permission only, no implementation |
| **userContacts** | `src/actions/userContact.js`, `src/services/userContacts/*`, `src/reducers/userContacts.js` | User "wallet" — saved stores and menus, not CRM contacts |
| **UserContacts page** | `src/components/scenes/user/contacts/UserContacts.jsx` | Wallet UI: "My Contacts" (saved stores) + "My Menus" (saved menus) |
| **GuestUserContact** | `src/shared/components/GuestUserContact.jsx` | Guest display of localStorage `userContacts` (saved items) |
| **QRCode** | `src/shared/components/QRCode.jsx` | Add/remove store or menu from wallet via `addMyContacts` / `deleteMyContacts` |
| **contact.send** | `src/services/contact/contact.send.v1.action.js` | POST `/contacts` — contact form / messaging |
| **customer** | `src/services/customer/*` | POST `/customer` — add buyer at checkout; not bulk import |
| **API paths** | `src/shared/api/index.js` | `request-contacts`, `my-contacts` in `withoutSerialize` |
| **No vendor integrations** | — | No Google People, Outlook, HubSpot, Zapier, etc. |
| **No CSV/import** | — | No CSV, vCard, or other import flows |
| **React Native app** | `cardbey-rn` | No contact sync; only "Contact" menu label and phone display |

---

## What the old "contacts" code actually does

1. **User wallet (contacts + menus)**  
   - `userContacts` = items the user has saved (stores or menus).  
   - Types: `CONTACT` (store) or `MENU`.  
   - Backend: GET/POST/DELETE `/contacts` (JSON:API).  
   - Guests: stored in localStorage and later synced to backend on login.

2. **Customer at checkout**  
   - `addCustomer` / POST `/customer` used when a buyer checks out.  
   - Single customer per checkout, not bulk sync.

3. **Contact form**  
   - `contact.send` sends a message via POST `/contacts`.

---

## Old Feature Contract (what does NOT exist)

| Aspect | Status |
|--------|--------|
| **Inputs** | No userId/storeId/tokens/file for contact sync |
| **Outputs** | No bulk contact storage per store |
| **Trigger** | No post-publish or post-onboarding trigger |
| **Data sources** | No device contacts, Google, Outlook, CSV |
| **Side effects** | No dedupe, tagging, segmentation for contacts |
| **Error handling** | N/A — no sync flow |
| **Rate limits** | N/A |

---

## Recommendation

The requested "sync contacts" function does not exist in the old codebase. The only related mentions are:

- Legal text granting permission to sync phone contacts (unimplemented).
- User wallet (saved stores/menus), which is unrelated to CRM contact sync.

**Options:**

1. **Greenfield**  
   - Treat this as a new feature: store owner imports contacts (CSV/JSON) after publish.  
   - Design and implement from scratch, following your Phase 1 migration rules.

2. **Confirm with stakeholders**  
   - Check if sync exists in another repo (backend API, mobile app, legacy service) or in a different Cardbey product line.

3. **Defer**  
   - If no other implementation is found, skip migration and implement as a new Phase 2 feature.

---

## Files examined (relevant paths)

| Path | Purpose |
|------|---------|
| `src/actions/userContact.js` | Wallet add/delete/get actions |
| `src/reducers/userContacts.js` | Wallet Redux state |
| `src/services/userContacts/*.js` | API calls for `/contacts` |
| `src/services/contact/contact.send.v1.action.js` | Contact form |
| `src/services/customer/*.js` | Single customer at checkout |
| `src/components/scenes/user/contacts/UserContacts.jsx` | Wallet page |
| `src/shared/components/GuestUserContact.jsx` | Guest wallet dropdown |
| `src/shared/components/QRCode.jsx` | Add store/menu to wallet |
| `src/shared/components/ClaimContactModal.jsx` | "Claim your business" form (no contact sync) |
| `src/api/index.js` | API adapters |
| `src/lang/en.js` | Legal copy re: sync phone contacts |
| `cardbey-rn/*` | React Native app — no sync implementation |
