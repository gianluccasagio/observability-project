const request = require('supertest');
const app = require('../src/index');

describe('Testes das Rotas MVP', () => {
  it('GET /api/info deve retornar 200 e mensagem de log', async () => {
    const res = await request(app).get('/api/info');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toContain('Log normal gerado (200)');
  });

  it('GET /api/erro deve retornar 500 e mensagem de falha', async () => {
    const res = await request(app).get('/api/erro');
    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('Falha simulada (500)');
  });
});
