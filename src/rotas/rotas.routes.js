const { Router } = require('express');
const { calcularRota, listarLocais, calcularMaisProximo } = require('./rotas.controller');

const router = Router();

/**
 * Rotas do módulo Rotas
 * Base: /api/rotas
 */

// GET /api/rotas/locais — Retorna todos os locais disponíveis com coordenadas
router.get('/locais', listarLocais);

// GET /api/rotas?origem=X&destino=Y — Calcula a melhor rota entre dois locais
router.get('/', calcularRota);

// POST /api/rotas/mais-proximo — Calcula a agência mais próxima de um CEP/Coordenada
router.post('/mais-proximo', calcularMaisProximo);

module.exports = router;
