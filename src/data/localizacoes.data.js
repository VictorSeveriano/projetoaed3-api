/**
 * Dados dos locais do Esírito Santo — vértices do grafo acadêmico.
 *
 * Estes locais são utilizados exclusivamente como VÉRTICES do grafo
 * (para demonstração acadêmica via /api/grafo). Não são mais
 * restrição de origem/destino das corridas — o usuário pode informar
 * qualquer endereço, CEP ou coordenada GPS.
 *
 * Estrutura preparada para futura migração ao banco de dados:
 *   - id         : identificador único
 *   - nome       : nome de exibição ao usuário
 *   - cidade     : cidade onde o local está situado
 *   - estado     : UF
 *   - categoria  : tipo de local (terminal, aeroporto, estádio, etc.)
 *   - latitude   : coordenada geográfica real (Google Maps)
 *   - longitude  : coordenada geográfica real (Google Maps)
 *
 * IMPORTANTE: As coordenadas abaixo são REAIS, verificadas via Google Maps.
 */
const localizacoes = [
  {
    id: '1',
    nome: 'Rodoviária de Vitória',
    cidade: 'Vitória',
    estado: 'ES',
    categoria: 'Terminal Rodoviário',
    latitude: -20.3197,
    longitude: -40.3376,
  },
  {
    id: '2',
    nome: 'Aeroporto de Vitória',
    cidade: 'Vitória',
    estado: 'ES',
    categoria: 'Aeroporto',
    latitude: -20.2582,
    longitude: -40.2864,
  },
  {
    id: '3',
    nome: 'Estádio Kleber Andrade',
    cidade: 'Cariacica',
    estado: 'ES',
    categoria: 'Estádio',
    latitude: -20.2688,
    longitude: -40.4192,
  },
  {
    id: '4',
    nome: 'Estação Pedro Nolasco',
    cidade: 'Cariacica',
    estado: 'ES',
    categoria: 'Estação Ferroviária',
    latitude: -20.2756,
    longitude: -40.4469,
  },
  {
    id: '5',
    nome: 'Convento da Penha',
    cidade: 'Vila Velha',
    estado: 'ES',
    categoria: 'Ponto Turístico',
    latitude: -20.3284,
    longitude: -40.3003,
  },
  {
    id: '6',
    nome: 'Terminal de Carapina',
    cidade: 'Serra',
    estado: 'ES',
    categoria: 'Terminal Rodoviário',
    latitude: -20.1837,
    longitude: -40.2551,
  },
  {
    id: '7',
    nome: 'Shopping Montserrat',
    cidade: 'Serra',
    estado: 'ES',
    categoria: 'Shopping',
    latitude: -20.1697,
    longitude: -40.2559,
  },
];

module.exports = localizacoes;
