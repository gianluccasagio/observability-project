const request = require('supertest');
const app = require('../src/index');

describe('Testes das Rotas MVP (E-commerce)', () => {
  it('GET /api/checkout deve retornar 200 e simulacao de compra', async () => {
    const res = await request(app).get('/api/checkout');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('orderId');
    expect(res.body.message).toContain('Compra finalizada');
  });

  it('GET /api/payment-error deve retornar 500 e erro de pagamento', async () => {
    const res = await request(app).get('/api/payment-error');
    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('Falha no processamento');
  });
});
