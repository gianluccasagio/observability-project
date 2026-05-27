#!/bin/bash

echo "=== CENÁRIO 1 — Alta taxa de erros ==="
for i in $(seq 1 100); do
  curl -s -X POST http://localhost:8080/login \
    -H "Content-Type: application/json" \
    -d '{"username":"hacker","password":"wrong"}' > /dev/null
  sleep 0.1
done
echo "Feito!"

echo "=== CENÁRIO 2 — Sobrecarga ==="
for i in $(seq 1 200); do
  curl -s -X POST http://localhost:8080/items \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"item$i\",\"description\":\"carga $i\"}" > /dev/null
  sleep 0.05
done
echo "Feito!"

echo "=== CENÁRIO 3 — Falhas intermitentes ==="
for i in $(seq 1 50); do
  if [ $((i % 3)) -eq 0 ]; then
    curl -s -X POST http://localhost:8080/login \
      -H "Content-Type: application/json" \
      -d '{"username":"admin","password":"errada"}' > /dev/null
  else
    curl -s -X POST http://localhost:8080/login \
      -H "Content-Type: application/json" \
      -d '{"username":"admin","password":"password123"}' > /dev/null
  fi
  sleep 0.3
done
echo "Feito!"