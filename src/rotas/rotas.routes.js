const { Router } = require('express');
const { calcularRota, listarLocais } = require('./rotas.controller');

const router = Router();

/**
 * Rotas do módulo Rotas
 * Base: /api/rotas
 */

// GET /api/rotas/locais — Retorna todos os locais disponíveis com coordenadas
router.get('/locais', listarLocais);

// GET /api/rotas?origem=X&destino=Y — Calcula a melhor rota entre dois locais
router.get('/', calcularRota);

module.exports = router;
