const express = require('express');
const client = require('prom-client');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ─────────────────────────────────────────
// MÉTRICAS DO PROMETHEUS
// ─────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requisicoes HTTP',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duracao das requisicoes HTTP em segundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const loginAttemptsTotal = new client.Counter({
  name: 'login_attempts_total',
  help: 'Total de tentativas de login',
  labelNames: ['status'],
  registers: [register],
});

// ─────────────────────────────────────────
// LOGS ESTRUTURADOS
// ─────────────────────────────────────────
function log(level, message, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...extra,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ─────────────────────────────────────────
// MIDDLEWARE — roda em toda requisição
// ─────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.path || 'unknown';

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: res.statusCode,
    });

    httpRequestDuration.observe(
      { method: req.method, route, status: res.statusCode },
      duration
    );

    log(res.statusCode >= 400 ? 'error' : 'info', 'HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Math.round(duration * 1000),
    });
  });

  next();
});

// ─────────────────────────────────────────
// BANCO DE DADOS EM MEMÓRIA
// ─────────────────────────────────────────
const users = { admin: 'password123' };
const items = {};

// ─────────────────────────────────────────
// ROTAS
// ─────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Métricas para o Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// LOGIN
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    loginAttemptsTotal.inc({ status: 'bad_request' });
    log('error', 'Login falhou: campos ausentes', { username });
    return res.status(400).json({ error: 'Username e password sao obrigatorios' });
  }

  if (users[username] && users[username] === password) {
    loginAttemptsTotal.inc({ status: 'success' });
    log('info', 'Login bem sucedido', { username });
    return res.json({ message: 'Login realizado com sucesso', token: uuidv4() });
  }

  loginAttemptsTotal.inc({ status: 'failure' });
  log('error', 'Login falhou: credenciais invalidas', { username });
  return res.status(401).json({ error: 'Credenciais invalidas' });
});

// CRIAR item
app.post('/items', (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name e obrigatorio' });
  }
  const id = uuidv4();
  items[id] = { id, name, description, createdAt: new Date().toISOString() };
  log('info', 'Item criado', { id, name });
  res.status(201).json(items[id]);
});

// LER todos os itens
app.get('/items', (req, res) => {
  log('info', 'Itens listados', { count: Object.keys(items).length });
  res.json(Object.values(items));
});

// LER um item
app.get('/items/:id', (req, res) => {
  const item = items[req.params.id];
  if (!item) {
    log('error', 'Item nao encontrado', { id: req.params.id });
    return res.status(404).json({ error: 'Item nao encontrado' });
  }
  res.json(item);
});

// ATUALIZAR item
app.put('/items/:id', (req, res) => {
  const item = items[req.params.id];
  if (!item) {
    log('error', 'Update falhou: item nao encontrado', { id: req.params.id });
    return res.status(404).json({ error: 'Item nao encontrado' });
  }
  const { name, description } = req.body;
  items[req.params.id] = {
    ...item,
    name: name || item.name,
    description: description || item.description,
  };
  log('info', 'Item atualizado', { id: req.params.id });
  res.json(items[req.params.id]);
});

// DELETAR item
app.delete('/items/:id', (req, res) => {
  if (!items[req.params.id]) {
    log('error', 'Delete falhou: item nao encontrado', { id: req.params.id });
    return res.status(404).json({ error: 'Item nao encontrado' });
  }
  delete items[req.params.id];
  log('info', 'Item deletado', { id: req.params.id });
  res.json({ message: 'Item deletado com sucesso' });
});

// Rota não encontrada
app.use((req, res) => {
  log('error', 'Rota nao encontrada', { path: req.path });
  res.status(404).json({ error: 'Rota nao encontrada' });
});

// ─────────────────────────────────────────
// INICIAR SERVIDOR
// ─────────────────────────────────────────
app.listen(PORT, () => {
  log('info', 'Servidor iniciado', { port: PORT, env: process.env.NODE_ENV });
});