/**
 * Dados dos veiculos disponíveis no sistema ReservaCar.
 *
 * CONCEITO ATUALIZADO:
 * O veiculo e um RECURSO do sistema, nao o elemento principal.
 * Ele nao pertence a uma localidade fixa — e alocado dinamicamente para corridas.
 *
 * Status possiveis: DISPONIVEL | EM_CORRIDA
 * tarifaBase: tarifa em R$/km usada para calcular o valor da corrida
 */
const carros = [
  { id: '1',  modelo: 'Corolla',   marca: 'Toyota',     ano: 2024, placa: 'ABC-1A23', categoria: 'Sedan', status: 'DISPONIVEL', tarifaBase: 4.00 },
  { id: '2',  modelo: 'Civic',     marca: 'Honda',      ano: 2023, placa: 'DEF-2B34', categoria: 'Sedan', status: 'DISPONIVEL', tarifaBase: 4.50 },
  { id: '3',  modelo: 'Onix',      marca: 'Chevrolet',  ano: 2024, placa: 'GHI-3C45', categoria: 'Hatch', status: 'DISPONIVEL', tarifaBase: 3.00 },
  { id: '4',  modelo: 'T-Cross',   marca: 'Volkswagen', ano: 2023, placa: 'JKL-4D56', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 5.00 },
  { id: '5',  modelo: 'Pulse',     marca: 'Fiat',       ano: 2024, placa: 'MNO-5E67', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 4.50 },
  { id: '6',  modelo: 'HB20',      marca: 'Hyundai',    ano: 2023, placa: 'PQR-6F78', categoria: 'Hatch', status: 'DISPONIVEL', tarifaBase: 2.80 },
  { id: '7',  modelo: 'Kwid',      marca: 'Renault',    ano: 2024, placa: 'STU-7G89', categoria: 'Hatch', status: 'DISPONIVEL', tarifaBase: 2.50 },
  { id: '8',  modelo: 'Renegade',  marca: 'Jeep',       ano: 2023, placa: 'VWX-8H90', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 6.00 },
  { id: '9',  modelo: 'Territory', marca: 'Ford',       ano: 2024, placa: 'YZA-9I01', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 5.50 },
  { id: '10', modelo: 'Kicks',     marca: 'Nissan',     ano: 2023, placa: 'BCD-0J12', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 5.00 },
];

module.exports = carros;
