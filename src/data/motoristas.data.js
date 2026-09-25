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
const motoristas = [
  {
    id: 'm1',
    usuarioId: '4',  // João Silva — MOTORISTA, APROVADO, tem veículo (carro id '1')
    cnh: '12345678901',
    statusCadastro: 'APROVADO',
    statusPresenca: 'ONLINE',
    criadoEm: '2026-01-05T10:00:00Z',
  },
  {
    id: 'm2',
    usuarioId: '5',  // Maria Ferreira — MOTORISTA, APROVADO, tem veículo (carro id '2')
    cnh: '98765432100',
    statusCadastro: 'APROVADO',
    statusPresenca: 'OFFLINE',
    criadoEm: '2026-01-10T09:00:00Z',
  },
  {
    id: 'm3',
    usuarioId: '6',  // Pedro Costa — MOTORISTA, PENDENTE (aguarda análise)
    cnh: '11122233344',
    statusCadastro: 'PENDENTE',
    statusPresenca: 'OFFLINE',
    criadoEm: '2026-09-20T14:00:00Z',
  },
  {
    id: 'm4',
    usuarioId: '7',  // Lucia Alves — MOTORISTA, REJEITADO
    cnh: '55566677788',
    statusCadastro: 'REJEITADO',
    statusPresenca: 'OFFLINE',
    criadoEm: '2026-08-15T11:00:00Z',
  },
];

module.exports = motoristas;
