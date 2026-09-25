/**
 * Dados iniciais de corridas — usados como mock até implementação de banco.
 *
 * STATUS possíveis: SOLICITADA | CONFIRMADA | EM_ANDAMENTO | FINALIZADA | CANCELADA
 *
 * Estrutura baseada na entidade Corrida, preparada para migração ao banco.
 *
 * motoristaId: ID do usuário com perfil MOTORISTA que executou/executa a corrida.
 * - c1, c4, c7, c10, c12: João (id '4', veículo Corolla id '1')
 * - c2, c6, c11: Maria (id '5', veículo Civic id '2')
 * - demais: sem motorista (histórico de outros veículos sem motorista atribuído)
 *
 * origemNome/destinoNome representam endereços livres. Os valores abaixo são
 * strings históricas usadas nos mocks iniciais do sistema.
 *
 * Filtros por período usam dataHorario (data da corrida), não criadaEm.
 * Mock cobre janeiro a agosto/2026 para testar relatório mensal com dois meses distintos.
 *
 * usuarioId mapeado para usuários com perfil USUARIO:
 *   id '2' → Ana Souza, id '3' → Carlos Mendes
 * (ids '4','5','6' existiam no mock antigo antes de haver perfis — realinhados abaixo)
 */
const corridas = [];

module.exports = corridas;
