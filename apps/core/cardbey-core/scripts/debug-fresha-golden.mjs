const GQL = 'https://www.fresha.com/graphql';
const headers = {
  'Content-Type': 'application/json',
  Origin: 'https://www.fresha.com',
  Referer: 'https://www.fresha.com/',
  'User-Agent': 'Mozilla/5.0',
};

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const queries = [
  `query { locations(slugs: ["golden-nails-care-melbourne-189-clarendon-street-qpy9go5m"]) { slug name isBookable serviceCount serviceCatalog(context: BOOKING_FLOW) { ... on LocationServiceCatalogCategory { items { name retailPrice { formatted } } } } } }`,
  `query { search(query: "Golden Nails Care") { locations { slug name isBookable serviceCount } } }`,
  `query { marketplaceSearch(query: "Golden Nails Care Heidelberg") { edges { node { ... on Location { slug name isBookable serviceCount } } } } }`,
];

for (const query of queries) {
  const data = await gql(query);
  console.log('\n---', query.slice(0, 70));
  if (data.errors) console.log('errors', data.errors.map((e) => e.message).slice(0, 3));
  else console.log(JSON.stringify(data.data, null, 2)?.slice(0, 800));
}
