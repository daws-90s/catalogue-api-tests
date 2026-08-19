// Black-box tests for the catalogue service's own API surface.
// Runs against a real deployment (e.g. roboshop-dev) with a real MongoDB behind it — nothing is mocked.
// Only catalogue's endpoints are exercised here; other components (cart, user, etc.) are out of scope.

const BASE_URL = process.env.CATALOGUE_URL || 'http://catalogue.roboshop-dev.svc.cluster.local:8080';

async function getJSON(path) {
    const res = await fetch(`${BASE_URL}${path}`);
    const body = await res.json().catch(() => undefined);
    return { status: res.status, body };
}

let products = [];
let categories = [];

// The catalogue pod retries its Mongo connection on a loop, so right after a fresh
// deploy /health can briefly report mongo:false. Poll until it's up (or time out with
// a clear message) instead of letting every test fail on an unrelated race condition.
async function waitForMongoConnected(timeoutMs = 30000, intervalMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
        last = await getJSON('/health');
        if (last.status === 200 && last.body && last.body.mongo === true) {
            return last;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(
        `catalogue at ${BASE_URL} never reported mongo:true within ${timeoutMs}ms. ` +
        `Last /health response: ${JSON.stringify(last)}`
    );
}

beforeAll(async () => {
    await waitForMongoConnected();

    const productsRes = await getJSON('/products');
    products = Array.isArray(productsRes.body) ? productsRes.body : [];

    const categoriesRes = await getJSON('/categories');
    categories = Array.isArray(categoriesRes.body) ? categoriesRes.body : [];
});

describe('Health & MongoDB connectivity', () => {
    test('GET /health reports app OK and mongo connected', async () => {
        const { status, body } = await getJSON('/health');
        expect(status).toBe(200);
        expect(body.app).toBe('OK');
        expect(body.mongo).toBe(true);
    });
});

describe('GET /products', () => {
    test('returns 200 with an array', async () => {
        const { status, body } = await getJSON('/products');
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
    });

    test('each product has a sku', async () => {
        if (products.length === 0) {
            console.warn('No products in catalogue — skipping field check');
            return;
        }
        for (const product of products) {
            expect(product).toHaveProperty('sku');
        }
    });
});

describe('GET /product/:sku', () => {
    test('returns the matching product for a known sku', async () => {
        if (products.length === 0) {
            console.warn('No products in catalogue — skipping known-sku check');
            return;
        }
        const known = products[0];
        const { status, body } = await getJSON(`/product/${encodeURIComponent(known.sku)}`);
        expect(status).toBe(200);
        expect(body.sku).toBe(known.sku);
    });

    test('returns 404 for a sku that does not exist', async () => {
        const { status } = await getJSON(`/product/NON-EXISTENT-SKU-${Date.now()}`);
        expect(status).toBe(404);
    });
});

describe('GET /categories', () => {
    test('returns 200 with an array of category names', async () => {
        const { status, body } = await getJSON('/categories');
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        for (const category of body) {
            expect(typeof category).toBe('string');
        }
    });
});

describe('GET /products/:cat', () => {
    test('returns only products belonging to that category', async () => {
        if (categories.length === 0) {
            console.warn('No categories in catalogue — skipping category filter check');
            return;
        }
        const known = categories[0];
        const { status, body } = await getJSON(`/products/${encodeURIComponent(known)}`);
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        for (const product of body) {
            if ('categories' in product) {
                expect(product.categories).toContain(known);
            }
        }
    });
});

describe('GET /search/:text', () => {
    test('returns 200 with an array for a term found in an existing product', async () => {
        if (products.length === 0 || !products[0].name) {
            console.warn('No product names in catalogue — skipping search check');
            return;
        }
        const term = products[0].name.split(' ')[0];
        const { status, body } = await getJSON(`/search/${encodeURIComponent(term)}`);
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
    });

    test('returns 200 with an array for a term with no matches', async () => {
        const { status, body } = await getJSON(`/search/nonexistent-term-${Date.now()}`);
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
    });
});
