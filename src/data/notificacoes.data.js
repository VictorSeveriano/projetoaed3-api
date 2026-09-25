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
const notificacoes = [];

module.exports = notificacoes;
