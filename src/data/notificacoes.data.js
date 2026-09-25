/**
 * Dados de notificações do sistema.
 *
 * Notificações são criadas pelo backend quando eventos relevantes ocorrem
 * (ex.: nova solicitação de motorista) e entregues ao destinatário na
 * próxima consulta — sem WebSocket nesta etapa.
 *
 * tipo: SOLICITACAO_MOTORISTA | SOLICITACAO_VEICULO
 * destinatarioId: sempre o id do usuário administrador nesta etapa
 *
 * Estrutura preparada para banco: todos os campos são escalares/primitivos,
 * sem objetos aninhados.
 */
const notificacoes = [
  {
    id: 'n1',
    destinatarioId: '1',       // Administrador
    tipo: 'SOLICITACAO_MOTORISTA',
    titulo: 'Nova solicitação de motorista',
    mensagem: 'Pedro Costa solicitou cadastro como motorista. CNH: 11122233344.',
    lida: false,
    criadaEm: '2026-09-20T14:01:00Z',
    referenciaId: 'm3',        // id do motorista na tabela motoristas
  },
  {
    id: 'n2',
    destinatarioId: '1',
    tipo: 'SOLICITACAO_VEICULO',
    titulo: 'Veículo pendente de aprovação',
    mensagem: 'João Silva cadastrou um veículo que aguarda aprovação.',
    lida: true,
    criadaEm: '2026-01-06T08:00:00Z',
    referenciaId: '1',         // id do veículo (carro)
  },
];

module.exports = notificacoes;
