const express = require('express');
const client = require('prom-client');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, './../public')));

const PORT = process.env.PORT || 8080;

// ─────────────────────────────────────────
// CATÁLOGO E-COMMERCE
// ─────────────────────────────────────────
const CATALOG = [
  { id: 'prod-001', name: 'Fone Bluetooth Pro', price: 299.9, category: 'eletronicos', stock: 42 },
  { id: 'prod-002', name: 'Teclado Mecânico RGB', price: 459.0, category: 'eletronicos', stock: 18 },
  { id: 'prod-003', name: 'Camiseta DevOps', price: 89.9, category: 'vestuario', stock: 120 },
  { id: 'prod-004', name: 'Monitor 27" 4K', price: 1899.0, category: 'eletronicos', stock: 7 },
  { id: 'prod-005', name: 'Caneca Observability', price: 49.9, category: 'acessorios', stock: 200 },
  { id: 'prod-006', name: 'Mochila Notebook', price: 219.0, category: 'acessorios', stock: 35 },
];

const PAYMENT_METHODS = ['credit_card', 'pix', 'boleto'];
const PAYMENT_FAILURE_REASONS = [
  'insufficient_funds',
  'card_declined',
  'gateway_timeout',
  'fraud_detected',
];

// ─────────────────────────────────────────
// MÉTRICAS DO PROMETHEUS
// ─────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'nodejs_' });

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
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

const loginAttemptsTotal = new client.Counter({
  name: 'login_attempts_total',
  help: 'Total de tentativas de login',
  labelNames: ['status'],
  registers: [register],
});

const productViewsTotal = new client.Counter({
  name: 'ecommerce_product_views_total',
  help: 'Visualizacoes de pagina de produto',
  labelNames: ['category', 'product_id'],
  registers: [register],
});

const cartOperationsTotal = new client.Counter({
  name: 'ecommerce_cart_operations_total',
  help: 'Operacoes no carrinho de compras',
  labelNames: ['operation'],
  registers: [register],
});

const checkoutTotal = new client.Counter({
  name: 'ecommerce_checkout_total',
  help: 'Total de tentativas de checkout',
  labelNames: ['status', 'payment_method'],
  registers: [register],
});

const paymentErrorsTotal = new client.Counter({
  name: 'ecommerce_payment_errors_total',
  help: 'Total de falhas no pagamento',
  labelNames: ['reason'],
  registers: [register],
});

const orderValueBrl = new client.Histogram({
  name: 'ecommerce_order_value_brl',
  help: 'Valor dos pedidos em reais (BRL)',
  labelNames: ['payment_method'],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000],
  registers: [register],
});

const checkoutDuration = new client.Histogram({
  name: 'ecommerce_checkout_duration_seconds',
  help: 'Tempo de processamento do checkout',
  labelNames: ['status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

const activeCarts = new client.Gauge({
  name: 'ecommerce_active_carts',
  help: 'Carrinhos ativos com itens',
  registers: [register],
});

const revenueTotal = new client.Counter({
  name: 'ecommerce_revenue_brl_total',
  help: 'Receita acumulada em reais (BRL)',
  labelNames: ['payment_method'],
  registers: [register],
});

// ─────────────────────────────────────────
// ESTADO EM MEMÓRIA
// ─────────────────────────────────────────
const users = { admin: 'password123' };
const items = {};
const carts = {};

function simulateLatency(minMs = 50, maxMs = 400) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getOrCreateCart(sessionId) {
  if (!carts[sessionId]) {
    carts[sessionId] = { items: [], updatedAt: Date.now() };
  }
  return carts[sessionId];
}

function cartTotal(cart) {
  return cart.items.reduce((sum, item) => {
    const product = CATALOG.find((p) => p.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
}

function updateActiveCartsGauge() {
  const count = Object.values(carts).filter((c) => c.items.length > 0).length;
  activeCarts.set(count);
}

function findProduct(id) {
  return CATALOG.find((p) => p.id === id);
}

// ─────────────────────────────────────────
// LOGS ESTRUTURADOS
// ─────────────────────────────────────────
function log(level, message, extra = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'devstore',
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
// MIDDLEWARE
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
// ROTAS BASE
// ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: '2.0.0' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    loginAttemptsTotal.inc({ status: 'bad_request' });
    log('error', 'Login falhou: campos ausentes', { username });
    return res.status(400).json({ error: 'Username e password sao obrigatorios' });
  }

  if (users[username] && users[username] === password) {
    loginAttemptsTotal.inc({ status: 'success' });
    log('info', 'Login bem sucedido', { username, event: 'auth_success' });
    return res.json({ message: 'Login realizado com sucesso', token: uuidv4() });
  }

  loginAttemptsTotal.inc({ status: 'failure' });
  log('error', 'Login falhou: credenciais invalidas', { username, event: 'auth_failure' });
  return res.status(401).json({ error: 'Credenciais invalidas' });
});

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

app.get('/items', (req, res) => {
  log('info', 'Itens listados', { count: Object.keys(items).length });
  res.json(Object.values(items));
});

app.get('/items/:id', (req, res) => {
  const item = items[req.params.id];
  if (!item) {
    log('error', 'Item nao encontrado', { id: req.params.id });
    return res.status(404).json({ error: 'Item nao encontrado' });
  }
  res.json(item);
});

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

app.delete('/items/:id', (req, res) => {
  if (!items[req.params.id]) {
    log('error', 'Delete falhou: item nao encontrado', { id: req.params.id });
    return res.status(404).json({ error: 'Item nao encontrado' });
  }
  delete items[req.params.id];
  log('info', 'Item deletado', { id: req.params.id });
  res.json({ message: 'Item deletado com sucesso' });
});

// ─────────────────────────────────────────
// ROTAS E-COMMERCE
// ─────────────────────────────────────────
app.get('/api/products', (req, res) => {
  const { category } = req.query;
  const products = category
    ? CATALOG.filter((p) => p.category === category)
    : CATALOG;
  log('info', 'Catalogo listado', { count: products.length, category: category || 'all' });
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) {
    log('error', 'Produto nao encontrado', { product_id: req.params.id });
    return res.status(404).json({ error: 'Produto nao encontrado' });
  }

  productViewsTotal.inc({ category: product.category, product_id: product.id });
  log('info', 'Produto visualizado', {
    event: 'product_view',
    product_id: product.id,
    product_name: product.name,
    category: product.category,
  });
  res.json(product);
});

app.post('/api/cart/add', (req, res) => {
  const { productId, quantity = 1, sessionId } = req.body;

  if (!productId || !sessionId) {
    return res.status(400).json({ error: 'productId e sessionId sao obrigatorios' });
  }

  const product = findProduct(productId);
  if (!product) {
    return res.status(404).json({ error: 'Produto nao encontrado' });
  }

  const cart = getOrCreateCart(sessionId);
  const existing = cart.items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({ productId, quantity });
  }
  cart.updatedAt = Date.now();
  cartOperationsTotal.inc({ operation: 'add' });
  updateActiveCartsGauge();

  log('info', 'Item adicionado ao carrinho', {
    event: 'cart_add',
    session_id: sessionId,
    product_id: productId,
    quantity,
    cart_total_brl: cartTotal(cart),
  });

  res.json({
    sessionId,
    items: cart.items,
    total: cartTotal(cart),
  });
});

app.get('/api/cart/:sessionId', (req, res) => {
  const cart = carts[req.params.sessionId] || { items: [] };
  res.json({ sessionId: req.params.sessionId, items: cart.items, total: cartTotal(cart) });
});

async function processCheckout(sessionId, paymentMethod) {
  const start = Date.now();
  await simulateLatency(100, 800);

  const cart = carts[sessionId];
  const method = paymentMethod || pickRandom(PAYMENT_METHODS);

  if (!cart || cart.items.length === 0) {
    const total = 99.9 + Math.random() * 400;
    checkoutTotal.inc({ status: 'success', payment_method: method });
    orderValueBrl.observe({ payment_method: method }, total);
    revenueTotal.inc({ payment_method: method }, total);
    checkoutDuration.observe({ status: 'success' }, (Date.now() - start) / 1000);
    return { orderId: uuidv4(), total, paymentMethod: method, items: 1 };
  }

  const total = cartTotal(cart);
  const itemCount = cart.items.length;
  checkoutTotal.inc({ status: 'success', payment_method: method });
  orderValueBrl.observe({ payment_method: method }, total);
  revenueTotal.inc({ payment_method: method }, total);
  checkoutDuration.observe({ status: 'success' }, (Date.now() - start) / 1000);

  cart.items = [];
  updateActiveCartsGauge();

  return { orderId: uuidv4(), total, paymentMethod: method, items: itemCount };
}

app.post('/api/checkout', async (req, res) => {
  const { sessionId = uuidv4(), paymentMethod } = req.body;

  try {
    const result = await processCheckout(sessionId, paymentMethod);
    log('info', 'Pedido finalizado com sucesso', {
      event: 'order_placed',
      order_id: result.orderId,
      total_brl: result.total,
      payment_method: result.paymentMethod,
      session_id: sessionId,
    });
    res.status(200).json({
      message: 'Compra finalizada com sucesso',
      orderId: result.orderId,
      total: result.total,
      paymentMethod: result.paymentMethod,
    });
  } catch (err) {
    checkoutTotal.inc({ status: 'failed', payment_method: paymentMethod || 'unknown' });
    checkoutDuration.observe({ status: 'failed' }, 0);
    log('error', 'Checkout falhou', { event: 'checkout_error', error: err.message });
    res.status(500).json({ error: 'Falha no checkout' });
  }
});

app.get('/api/checkout', async (req, res) => {
  const result = await processCheckout(uuidv4());
  log('info', 'Pedido finalizado com sucesso', {
    event: 'order_placed',
    order_id: result.orderId,
    total_brl: result.total,
    payment_method: result.paymentMethod,
  });
  res.status(200).json({
    message: 'Compra finalizada com sucesso (200)',
    orderId: result.orderId,
    total: result.total,
  });
});

app.get('/api/payment-error', async (req, res) => {
  await simulateLatency(200, 1200);
  const reason = pickRandom(PAYMENT_FAILURE_REASONS);
  const method = pickRandom(PAYMENT_METHODS);

  paymentErrorsTotal.inc({ reason });
  checkoutTotal.inc({ status: 'failed', payment_method: method });
  checkoutDuration.observe({ status: 'failed' }, 0);

  log('error', 'Falha no gateway de pagamento', {
    event: 'payment_error',
    reason,
    payment_method: method,
  });

  res.status(500).json({
    error: 'Falha no processamento do pagamento (500)',
    reason,
    paymentMethod: method,
  });
});

app.use((req, res) => {
  log('error', 'Rota nao encontrada', { path: req.path });
  res.status(404).json({ error: 'Rota nao encontrada' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    log('info', 'Servidor iniciado', { port: PORT, env: process.env.NODE_ENV, version: '2.0.0' });
  });
}

module.exports = app;
