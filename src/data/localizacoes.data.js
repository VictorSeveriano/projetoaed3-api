/**
 * Dados das localizacoes cadastradas no sistema.
 * Estas localizacoes sao utilizadas como VERTICES do grafo.
 *
 * Cada localidade representa um ponto geografico onde:
 * - Carros podem estar estacionados
 * - Reservas podem ter local de retirada/devolucao
 * - O Algoritmo de Dijkstra calcula o menor caminho entre elas
 */
const localizacoes = [
  { id: '1', nome: 'Centro',       descricao: 'Regiao central da cidade' },
  { id: '2', nome: 'Shopping',     descricao: 'Shopping Center Norte' },
  { id: '3', nome: 'Aeroporto',    descricao: 'Aeroporto Internacional' },
  { id: '4', nome: 'Rodoviaria',   descricao: 'Rodoviaria Central' },
  { id: '5', nome: 'Praia',        descricao: 'Orla da Praia' },
  { id: '6', nome: 'Universidade', descricao: 'Campus Universitario' },
];

module.exports = localizacoes;
