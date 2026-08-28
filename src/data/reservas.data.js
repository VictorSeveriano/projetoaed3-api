/**
 * Dados iniciais de reservas do sistema.
 * Status possíveis: ATIVA | CANCELADA | FINALIZADA
 */
const reservas = [
  {
    id: 'r1', usuarioId: '1', carroId: '1', // Corolla
    dataInicio: '2026-01-10', dataFim: '2026-01-15',
    localRetirada: 'Estação Pedro Nolasco', localDevolucao: 'Shopping Montserrat',
    status: 'FINALIZADA', criadaEm: '2026-01-05T10:00:00Z',
  },
  {
    id: 'r2', usuarioId: '2', carroId: '2', // Civic
    dataInicio: '2026-02-05', dataFim: '2026-02-08',
    localRetirada: 'Aeroporto de Vitória', localDevolucao: 'Estação Pedro Nolasco',
    status: 'FINALIZADA', criadaEm: '2026-02-01T12:00:00Z',
  },
  {
    id: 'r3', usuarioId: '3', carroId: '4', // T-Cross
    dataInicio: '2026-03-12', dataFim: '2026-03-15',
    localRetirada: 'Rodoviária de Vitória', localDevolucao: 'Convento da Penha',
    status: 'FINALIZADA', criadaEm: '2026-03-10T09:00:00Z',
  },
  {
    id: 'r4', usuarioId: '1', carroId: '1',
    dataInicio: '2026-03-20', dataFim: '2026-03-25',
    localRetirada: 'Shopping Montserrat', localDevolucao: 'Estação Pedro Nolasco',
    status: 'FINALIZADA', criadaEm: '2026-03-15T14:00:00Z',
  },
  {
    id: 'r5', usuarioId: '4', carroId: '5', // Pulse
    dataInicio: '2026-04-01', dataFim: '2026-04-10',
    localRetirada: 'Convento da Penha', localDevolucao: 'Aeroporto de Vitória',
    status: 'FINALIZADA', criadaEm: '2026-03-28T08:00:00Z',
  },
  {
    id: 'r6', usuarioId: '2', carroId: '8', // Renegade
    dataInicio: '2026-04-15', dataFim: '2026-04-20',
    localRetirada: 'Aeroporto de Vitória', localDevolucao: 'Rodoviária de Vitória',
    status: 'CANCELADA', criadaEm: '2026-04-10T16:00:00Z',
  },
  {
    id: 'r7', usuarioId: '5', carroId: '1',
    dataInicio: '2026-05-10', dataFim: '2026-05-12',
    localRetirada: 'Estação Pedro Nolasco', localDevolucao: 'Terminal de Carapina',
    status: 'FINALIZADA', criadaEm: '2026-05-01T11:00:00Z',
  },
  {
    id: 'r8', usuarioId: '6', carroId: '3', // Onix
    dataInicio: '2026-05-20', dataFim: '2026-05-25',
    localRetirada: 'Shopping Montserrat', localDevolucao: 'Convento da Penha',
    status: 'FINALIZADA', criadaEm: '2026-05-15T15:00:00Z',
  },
  {
    id: 'r9', usuarioId: '3', carroId: '6', // HB20
    dataInicio: '2026-06-05', dataFim: '2026-06-15',
    localRetirada: 'Terminal de Carapina', localDevolucao: 'Estação Pedro Nolasco',
    status: 'FINALIZADA', criadaEm: '2026-06-01T10:30:00Z',
  },
  {
    id: 'r10', usuarioId: '1', carroId: '2',
    dataInicio: '2026-07-10', dataFim: '2026-07-20',
    localRetirada: 'Aeroporto de Vitória', localDevolucao: 'Aeroporto de Vitória',
    status: 'ATIVA', criadaEm: '2026-07-05T09:00:00Z',
  },
  {
    id: 'r11', usuarioId: '4', carroId: '4',
    dataInicio: '2026-07-15', dataFim: '2026-07-18',
    localRetirada: 'Rodoviária de Vitória', localDevolucao: 'Estação Pedro Nolasco',
    status: 'ATIVA', criadaEm: '2026-07-10T14:45:00Z',
  },
  {
    id: 'r12', usuarioId: '2', carroId: '1',
    dataInicio: '2026-08-01', dataFim: '2026-08-10',
    localRetirada: 'Estação Pedro Nolasco', localDevolucao: 'Shopping Montserrat',
    status: 'ATIVA', criadaEm: '2026-07-25T11:15:00Z',
  },
  {
    id: 'r13', usuarioId: '5', carroId: '9', // Territory
    dataInicio: '2026-08-10', dataFim: '2026-08-15',
    localRetirada: 'Shopping Montserrat', localDevolucao: 'Terminal de Carapina',
    status: 'ATIVA', criadaEm: '2026-08-01T08:20:00Z',
  },
  {
    id: 'r14', usuarioId: '6', carroId: '5',
    dataInicio: '2026-08-20', dataFim: '2026-08-25',
    localRetirada: 'Convento da Penha', localDevolucao: 'Estação Pedro Nolasco',
    status: 'ATIVA', criadaEm: '2026-08-15T16:30:00Z',
  }
];

module.exports = reservas;
