const request = require('supertest');
const app = require('../src/index');

describe('Testes das Rotas MVP (E-commerce)', () => {
  it('GET /api/checkout deve retornar 200 e simulacao de compra', async () => {
    const res = await request(app).get('/api/checkout');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('orderId');
    expect(res.body).toHaveProperty('total');
    expect(res.body.message).toContain('Compra finalizada');
  });

  it('GET /api/payment-error deve retornar 500 e erro de pagamento', async () => {
    const res = await request(app).get('/api/payment-error');
    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('reason');
    expect(res.body.error).toContain('Falha no processamento');
  });

  it('GET /api/products deve retornar catalogo', async () => {
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('price');
  });

  it('GET /api/products/:id deve retornar produto', async () => {
    const catalog = await request(app).get('/api/products');
    const productId = catalog.body[0].id;
    const res = await request(app).get(`/api/products/${productId}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toBe(productId);
  });

  it('POST /api/cart/add deve adicionar item ao carrinho', async () => {
    const catalog = await request(app).get('/api/products');
    const productId = catalog.body[0].id;
    const sessionId = 'test-session';

    const res = await request(app)
      .post('/api/cart/add')
      .send({ productId, quantity: 1, sessionId });

    expect(res.statusCode).toEqual(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('POST /api/checkout deve finalizar compra com carrinho', async () => {
    const catalog = await request(app).get('/api/products');
    const productId = catalog.body[0].id;
    const sessionId = 'checkout-session';

    await request(app)
      .post('/api/cart/add')
      .send({ productId, quantity: 2, sessionId });

    const res = await request(app)
      .post('/api/checkout')
      .send({ sessionId, paymentMethod: 'pix' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body.paymentMethod).toBe('pix');
    expect(res.body.total).toBeGreaterThan(0);
  });
});
