/**
 * Dados dos veículos disponíveis no sistema ReservaCar.
 *
 * MODELAGEM ATUALIZADA (seção 7 dos requisitos):
 * status de aprovação do veículo (pelo admin):
 *   PENDENTE  — cadastrado pelo motorista, aguarda análise do administrador
 *   APROVADO  — aprovado pelo admin; veículo apto para corridas
 *   REJEITADO — rejeitado pelo admin; não pode ser usado em corridas
 *
 * statusOperacional (estado em tempo real durante corridas):
 *   DISPONIVEL — aprovado e livre
 *   EM_CORRIDA — aprovado e atualmente em uso
 *
 * DECISÃO DE DESIGN: usamos um campo único `status` que abrange ambos os
 * estados administrativos (PENDENTE, APROVADO, REJEITADO) e operacionais
 * (DISPONIVEL, EM_CORRIDA). Status DISPONIVEL implica APROVADO.
 * Regra: veículo só pode ser usado em corrida se status === 'DISPONIVEL'.
 *
 * motoristaId: referência ao usuarioId do motorista APROVADO dono do veículo.
 *   null = veículo sem motorista (legado admin antes do novo fluxo).
 *
 * tarifaBase: tarifa R$/km usada no cálculo de valor da corrida.
 * criadoEm: data de cadastro do veículo (para exibição na tela admin).
 */
const carros = [];

module.exports = carros;
