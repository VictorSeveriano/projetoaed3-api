/**
 * Dados dos veículos disponíveis no sistema ReservaCar.
 *
 * MODELAGEM ATUALIZADA (seção 7 dos requisitos):
 * status de aprovação do veículo (pelo admin):
 *   PENDENTE  — cadastrado pelo motorista, aguarda análise do administrador
 *   APROVADO  — aprovado pelo admin; veículo apto para corridas
 *   REJEITADO — rejeitado pelo admin; não pode ser usado em corridas
 *
 * statusOperacional (estado em tempo real durante corridas):
 *   DISPONIVEL — aprovado e livre
 *   EM_CORRIDA — aprovado e atualmente em uso
 *
 * DECISÃO DE DESIGN: usamos um campo único `status` que abrange ambos os
 * estados administrativos (PENDENTE, APROVADO, REJEITADO) e operacionais
 * (DISPONIVEL, EM_CORRIDA). Status DISPONIVEL implica APROVADO.
 * Regra: veículo só pode ser usado em corrida se status === 'DISPONIVEL'.
 *
 * motoristaId: referência ao usuarioId do motorista APROVADO dono do veículo.
 *   null = veículo sem motorista (legado admin antes do novo fluxo).
 *
 * tarifaBase: tarifa R$/km usada no cálculo de valor da corrida.
 * criadoEm: data de cadastro do veículo (para exibição na tela admin).
 */
const carros = [
  // Veículos de João Silva (usuarioId '4') — APROVADO
  { id: '1',  modelo: 'Corolla',   marca: 'Toyota',     ano: 2024, placa: 'ABC-1A23', categoria: 'Sedan', status: 'DISPONIVEL', tarifaBase: 4.00, motoristaId: '4', criadoEm: '2026-01-06T08:00:00Z' },
  // Veículos de Maria Ferreira (usuarioId '5') — APROVADO
  { id: '2',  modelo: 'Civic',     marca: 'Honda',      ano: 2023, placa: 'DEF-2B34', categoria: 'Sedan', status: 'DISPONIVEL', tarifaBase: 4.50, motoristaId: '5', criadoEm: '2026-01-11T10:00:00Z' },
  // Veículos sem motorista (legado / cadastro admin)
  { id: '3',  modelo: 'Onix',      marca: 'Chevrolet',  ano: 2024, placa: 'GHI-3C45', categoria: 'Hatch', status: 'DISPONIVEL', tarifaBase: 3.00, motoristaId: null, criadoEm: '2025-06-01T00:00:00Z' },
  { id: '4',  modelo: 'T-Cross',   marca: 'Volkswagen', ano: 2023, placa: 'JKL-4D56', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 5.00, motoristaId: null, criadoEm: '2025-06-01T00:00:00Z' },
  { id: '5',  modelo: 'Pulse',     marca: 'Fiat',       ano: 2024, placa: 'MNO-5E67', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 4.50, motoristaId: null, criadoEm: '2025-06-01T00:00:00Z' },
  { id: '6',  modelo: 'HB20',      marca: 'Hyundai',    ano: 2023, placa: 'PQR-6F78', categoria: 'Hatch', status: 'DISPONIVEL', tarifaBase: 2.80, motoristaId: null, criadoEm: '2025-06-01T00:00:00Z' },
  { id: '7',  modelo: 'Kwid',      marca: 'Renault',    ano: 2024, placa: 'STU-7G89', categoria: 'Hatch', status: 'DISPONIVEL', tarifaBase: 2.50, motoristaId: null, criadoEm: '2025-06-01T00:00:00Z' },
  { id: '8',  modelo: 'Renegade',  marca: 'Jeep',       ano: 2023, placa: 'VWX-8H90', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 6.00, motoristaId: null, criadoEm: '2025-06-01T00:00:00Z' },
  { id: '9',  modelo: 'Territory', marca: 'Ford',       ano: 2024, placa: 'YZA-9I01', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 5.50, motoristaId: null, criadoEm: '2025-06-01T00:00:00Z' },
  { id: '10', modelo: 'Kicks',     marca: 'Nissan',     ano: 2023, placa: 'BCD-0J12', categoria: 'SUV',   status: 'DISPONIVEL', tarifaBase: 5.00, motoristaId: null, criadoEm: '2025-06-01T00:00:00Z' },
  // Veículo PENDENTE de aprovação (para testar tela de análise de veículos)
  { id: '11', modelo: 'Sandero',   marca: 'Renault',    ano: 2022, placa: 'EFG-1B23', categoria: 'Hatch', status: 'PENDENTE',   tarifaBase: 2.80, motoristaId: '4', criadoEm: '2026-09-24T15:00:00Z' },
];

module.exports = carros;
