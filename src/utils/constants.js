'use strict';

/**
 * constants.js — Constantes globais da aplicação.
 *
 * Centraliza valores fixos compartilhados entre módulos para evitar
 * duplicação e facilitar manutenção.
 */

/**
 * UUID fixo do administrador principal do sistema.
 * Definido pela migration inicial e pelo seed.
 * Utilizado para envio de notificações administrativas.
 */
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

module.exports = { ADMIN_ID };
