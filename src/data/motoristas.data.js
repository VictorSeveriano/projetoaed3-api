/**
 * Dados dos motoristas cadastrados no sistema.
 *
 * statusCadastro: PENDENTE | APROVADO | REJEITADO
 *   — controla se o motorista está apto a operar (nunca confundir com statusPresenca)
 * statusPresenca: ONLINE | OFFLINE
 *   — indica disponibilidade operacional (só relevante se statusCadastro === APROVADO)
 *
 * Relação: Motorista.usuarioId → Usuario.id (nunca duplicar dados do usuário aqui)
 * Relação: Veiculo.motoristaId → Motorista.usuarioId (o veículo referencia o usuarioId)
 *
 * Mock cobre todos os statusCadastro para testes das telas admin.
 */
const motoristas = [];

module.exports = motoristas;
