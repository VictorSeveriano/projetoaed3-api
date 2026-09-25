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
const corridas = [
  // --- Janeiro 2026 ---
  {
    id: 'c1',
    usuarioId: '2', // Ana Souza (USUARIO)
    motoristaId: '4', // João Silva (MOTORISTA, Corolla)
    veiculoId: '1', // Toyota Corolla
    origemNome: 'Estação Pedro Nolasco',
    destinoNome: 'Shopping Montserrat',
    origemLat: -20.2756,
    origemLng: -40.4469,
    destinoLat: -20.1697,
    destinoLng: -40.2559,
    rotaCaminho: ['Estação Pedro Nolasco', 'Estádio Kleber Andrade', 'Terminal de Carapina', 'Shopping Montserrat'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 28,
    duracaoMin: 45,
    valor: 112.00,
    dataHorario: '2026-01-10T10:00:00',
    status: 'FINALIZADA',
    criadaEm: '2026-01-09T08:00:00Z',
  },
  // --- Fevereiro 2026 ---
  {
    id: 'c2',
    usuarioId: '3', // Carlos Mendes (USUARIO)
    motoristaId: '5', // Maria Ferreira (MOTORISTA, Civic)
    veiculoId: '2', // Honda Civic
    origemNome: 'Aeroporto de Vitória',
    destinoNome: 'Estação Pedro Nolasco',
    origemLat: -20.2582,
    origemLng: -40.2864,
    destinoLat: -20.2756,
    destinoLng: -40.4469,
    rotaCaminho: ['Aeroporto de Vitória', 'Rodoviária de Vitória', 'Estádio Kleber Andrade', 'Estação Pedro Nolasco'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 27,
    duracaoMin: 40,
    valor: 121.50,
    dataHorario: '2026-02-05T14:00:00',
    status: 'FINALIZADA',
    criadaEm: '2026-02-04T12:00:00Z',
  },
  // --- Março 2026 ---
  {
    id: 'c3',
    usuarioId: '2', // Ana Souza
    motoristaId: null,
    veiculoId: '4', // VW T-Cross
    origemNome: 'Rodoviária de Vitória',
    destinoNome: 'Convento da Penha',
    origemLat: -20.3197,
    origemLng: -40.3376,
    destinoLat: -20.3284,
    destinoLng: -40.3003,
    rotaCaminho: ['Rodoviária de Vitória', 'Convento da Penha'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 5,
    duracaoMin: 12,
    valor: 25.00,
    dataHorario: '2026-03-12T09:00:00',
    status: 'FINALIZADA',
    criadaEm: '2026-03-11T08:00:00Z',
  },
  {
    id: 'c4',
    usuarioId: '3', // Carlos Mendes
    motoristaId: '4', // João Silva
    veiculoId: '1', // Toyota Corolla
    origemNome: 'Shopping Montserrat',
    destinoNome: 'Estação Pedro Nolasco',
    origemLat: -20.1697,
    origemLng: -40.2559,
    destinoLat: -20.2756,
    destinoLng: -40.4469,
    rotaCaminho: ['Shopping Montserrat', 'Terminal de Carapina', 'Estádio Kleber Andrade', 'Estação Pedro Nolasco'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 28,
    duracaoMin: 42,
    valor: 112.00,
    dataHorario: '2026-03-20T16:00:00',
    status: 'FINALIZADA',
    criadaEm: '2026-03-19T14:00:00Z',
  },
  // --- Abril 2026 ---
  {
    id: 'c5',
    usuarioId: '2', // Ana Souza
    motoristaId: null,
    veiculoId: '5', // Fiat Pulse
    origemNome: 'Convento da Penha',
    destinoNome: 'Aeroporto de Vitória',
    origemLat: -20.3284,
    origemLng: -40.3003,
    destinoLat: -20.2582,
    destinoLng: -40.2864,
    rotaCaminho: ['Convento da Penha', 'Aeroporto de Vitória'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 10,
    duracaoMin: 18,
    valor: 45.00,
    dataHorario: '2026-04-01T07:30:00',
    status: 'FINALIZADA',
    criadaEm: '2026-03-31T08:00:00Z',
  },
  {
    id: 'c6',
    usuarioId: '3', // Carlos Mendes
    motoristaId: '5', // Maria Ferreira
    veiculoId: '2', // Honda Civic
    origemNome: 'Aeroporto de Vitória',
    destinoNome: 'Rodoviária de Vitória',
    origemLat: -20.2582,
    origemLng: -40.2864,
    destinoLat: -20.3197,
    destinoLng: -40.3376,
    rotaCaminho: ['Aeroporto de Vitória', 'Rodoviária de Vitória'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 9,
    duracaoMin: 15,
    valor: 40.50,
    dataHorario: '2026-04-15T11:00:00',
    status: 'CANCELADA',
    criadaEm: '2026-04-14T16:00:00Z',
  },
  // --- Maio 2026 ---
  {
    id: 'c7',
    usuarioId: '2', // Ana Souza
    motoristaId: '4', // João Silva
    veiculoId: '1', // Toyota Corolla
    origemNome: 'Estação Pedro Nolasco',
    destinoNome: 'Terminal de Carapina',
    origemLat: -20.2756,
    origemLng: -40.4469,
    destinoLat: -20.1837,
    destinoLng: -40.2551,
    rotaCaminho: ['Estação Pedro Nolasco', 'Estádio Kleber Andrade', 'Terminal de Carapina'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 26,
    duracaoMin: 38,
    valor: 104.00,
    dataHorario: '2026-05-10T09:00:00',
    status: 'FINALIZADA',
    criadaEm: '2026-05-09T11:00:00Z',
  },
  {
    id: 'c8',
    usuarioId: '3', // Carlos Mendes
    motoristaId: null,
    veiculoId: '3', // Chevrolet Onix
    origemNome: 'Shopping Montserrat',
    destinoNome: 'Convento da Penha',
    origemLat: -20.1697,
    origemLng: -40.2559,
    destinoLat: -20.3284,
    destinoLng: -40.3003,
    rotaCaminho: ['Shopping Montserrat', 'Terminal de Carapina', 'Aeroporto de Vitória', 'Convento da Penha'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 25,
    duracaoMin: 35,
    valor: 75.00,
    dataHorario: '2026-05-20T13:00:00',
    status: 'FINALIZADA',
    criadaEm: '2026-05-19T15:00:00Z',
  },
  // --- Junho 2026 ---
  {
    id: 'c9',
    usuarioId: '2', // Ana Souza
    motoristaId: '5', // Maria Ferreira
    veiculoId: '2', // Honda Civic
    origemNome: 'Terminal de Carapina',
    destinoNome: 'Estação Pedro Nolasco',
    origemLat: -20.1837,
    origemLng: -40.2551,
    destinoLat: -20.2756,
    destinoLng: -40.4469,
    rotaCaminho: ['Terminal de Carapina', 'Estádio Kleber Andrade', 'Estação Pedro Nolasco'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 26,
    duracaoMin: 40,
    valor: 117.00,
    dataHorario: '2026-06-05T08:00:00',
    status: 'FINALIZADA',
    criadaEm: '2026-06-04T10:30:00Z',
  },
  // --- Julho 2026 ---
  {
    id: 'c10',
    usuarioId: '3', // Carlos Mendes
    motoristaId: '4', // João Silva
    veiculoId: '1', // Toyota Corolla
    origemNome: 'Aeroporto de Vitória',
    destinoNome: 'Rodoviária de Vitória',
    origemLat: -20.2582,
    origemLng: -40.2864,
    destinoLat: -20.3197,
    destinoLng: -40.3376,
    rotaCaminho: ['Aeroporto de Vitória', 'Rodoviária de Vitória'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 9,
    duracaoMin: 15,
    valor: 36.00,
    dataHorario: '2026-07-10T10:00:00',
    status: 'CONFIRMADA',
    criadaEm: '2026-07-08T09:00:00Z',
  },
  {
    id: 'c11',
    usuarioId: '2', // Ana Souza
    motoristaId: '5', // Maria Ferreira
    veiculoId: '2', // Honda Civic
    origemNome: 'Rodoviária de Vitória',
    destinoNome: 'Estação Pedro Nolasco',
    origemLat: -20.3197,
    origemLng: -40.3376,
    destinoLat: -20.2756,
    destinoLng: -40.4469,
    rotaCaminho: ['Rodoviária de Vitória', 'Estádio Kleber Andrade', 'Estação Pedro Nolasco'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 18,
    duracaoMin: 28,
    valor: 81.00,
    dataHorario: '2026-07-15T14:00:00',
    status: 'CONFIRMADA',
    criadaEm: '2026-07-14T14:45:00Z',
  },
  {
    id: 'c12',
    usuarioId: '3', // Carlos Mendes
    motoristaId: '4', // João Silva
    veiculoId: '1', // Toyota Corolla
    origemNome: 'Estação Pedro Nolasco',
    destinoNome: 'Shopping Montserrat',
    origemLat: -20.2756,
    origemLng: -40.4469,
    destinoLat: -20.1697,
    destinoLng: -40.2559,
    rotaCaminho: ['Estação Pedro Nolasco', 'Estádio Kleber Andrade', 'Terminal de Carapina', 'Shopping Montserrat'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 28,
    duracaoMin: 45,
    valor: 112.00,
    dataHorario: '2026-07-25T11:00:00',
    status: 'CANCELADA',
    criadaEm: '2026-07-24T11:15:00Z',
  },
  // --- Agosto 2026 ---
  {
    id: 'c13',
    usuarioId: '2', // Ana Souza
    motoristaId: '4', // João Silva
    veiculoId: '1', // Toyota Corolla
    origemNome: 'Shopping Montserrat',
    destinoNome: 'Terminal de Carapina',
    origemLat: -20.1697,
    origemLng: -40.2559,
    destinoLat: -20.1837,
    destinoLng: -40.2551,
    rotaCaminho: ['Shopping Montserrat', 'Terminal de Carapina'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 2,
    duracaoMin: 6,
    valor: 8.00,
    dataHorario: '2026-08-10T08:00:00',
    status: 'SOLICITADA',
    criadaEm: '2026-08-09T08:20:00Z',
  },
  {
    id: 'c14',
    usuarioId: '3', // Carlos Mendes
    motoristaId: '5', // Maria Ferreira
    veiculoId: '2', // Honda Civic
    origemNome: 'Convento da Penha',
    destinoNome: 'Estação Pedro Nolasco',
    origemLat: -20.3284,
    origemLng: -40.3003,
    destinoLat: -20.2756,
    destinoLng: -40.4469,
    rotaCaminho: ['Convento da Penha', 'Estádio Kleber Andrade', 'Estação Pedro Nolasco'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 21,
    duracaoMin: 32,
    valor: 94.50,
    dataHorario: '2026-08-20T16:00:00',
    status: 'SOLICITADA',
    criadaEm: '2026-08-19T16:30:00Z',
  },
  // --- Setembro 2026 (mês atual — para relatório) ---
  {
    id: 'c15',
    usuarioId: '2', // Ana Souza
    motoristaId: '4', // João Silva
    veiculoId: '1', // Toyota Corolla
    origemNome: 'Aeroporto de Vitória',
    destinoNome: 'Shopping Montserrat',
    origemLat: -20.2582,
    origemLng: -40.2864,
    destinoLat: -20.1697,
    destinoLng: -40.2559,
    rotaCaminho: ['Aeroporto de Vitória', 'Terminal de Carapina', 'Shopping Montserrat'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 15,
    duracaoMin: 25,
    valor: 60.00,
    dataHorario: '2026-09-05T10:00:00',
    status: 'FINALIZADA',
    criadaEm: '2026-09-04T09:00:00Z',
  },
  {
    id: 'c16',
    usuarioId: '3', // Carlos Mendes
    motoristaId: '5', // Maria Ferreira
    veiculoId: '2', // Honda Civic
    origemNome: 'Rodoviária de Vitória',
    destinoNome: 'Aeroporto de Vitória',
    origemLat: -20.3197,
    origemLng: -40.3376,
    destinoLat: -20.2582,
    destinoLng: -40.2864,
    rotaCaminho: ['Rodoviária de Vitória', 'Aeroporto de Vitória'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 8,
    duracaoMin: 14,
    valor: 36.00,
    dataHorario: '2026-09-15T08:30:00',
    status: 'FINALIZADA',
    criadaEm: '2026-09-14T07:00:00Z',
  },
  {
    id: 'c17',
    usuarioId: '2', // Ana Souza
    motoristaId: '5', // Maria Ferreira
    veiculoId: '2', // Honda Civic
    origemNome: 'Convento da Penha',
    destinoNome: 'Rodoviária de Vitória',
    origemLat: -20.3284,
    origemLng: -40.3003,
    destinoLat: -20.3197,
    destinoLng: -40.3376,
    rotaCaminho: ['Convento da Penha', 'Rodoviária de Vitória'],
    polyline: null,
    rotasAlternativas: [],
    distanciaKm: 3,
    duracaoMin: 8,
    valor: 13.50,
    dataHorario: '2026-09-20T14:00:00',
    status: 'EM_ANDAMENTO',
    criadaEm: '2026-09-20T13:45:00Z',
  },
];

module.exports = corridas;
