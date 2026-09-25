'use strict';
/**
 * corridas.service.js — Regras de negócios de corridas.
 *
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 * Preserva toda a lógica de negócio original.
 */

const corridasRepository = require('./corridas.repository');
const veiculosRepository = require('../veiculos/veiculos.repository');
const AppError           = require('../utils/AppError');

class CorridasService {
  /**
   * Tarifa base por km por classe de veículo (R$/km).
   * Valores zerados nesta etapa (tarifação futura).
   */
  static get TARIFAS_KM() {
    return {
      BASICO:  0.00,
      NORMAL:  0.00,
      PREMIUM: 0.00,
      default: 0.00,
    };
  }

  async listarTodas() {
    return corridasRepository.findAll();
  }

  async listarPorPerfil(usuarioId, perfil, status) {
    if (perfil === 'ADMINISTRADOR') {
      const todas = await corridasRepository.findAll();
      return status ? todas.filter((c) => c.status === status) : todas;
    }
    if (perfil === 'MOTORISTA') {
      return status
        ? corridasRepository.findByMotoristaIdAndStatus(usuarioId, status)
        : corridasRepository.findByMotoristaId(usuarioId);
    }
    // USUARIO (padrão)
    return status
      ? corridasRepository.findByUsuarioIdAndStatus(usuarioId, status)
      : corridasRepository.findByUsuarioId(usuarioId);
  }

  async buscarPorId(id) {
    const corrida = await corridasRepository.findById(id);
    if (!corrida) throw new AppError('Corrida ' + id + ' nao encontrada.', 404);
    return corrida;
  }

  /**
   * Calcula o valor estimado da corrida.
   */
  calcularValor({ distanciaKm, classe }) {
    const tarifa = CorridasService.TARIFAS_KM[classe] || CorridasService.TARIFAS_KM.default;
    return parseFloat((distanciaKm * tarifa).toFixed(2));
  }

  async criar(dados) {
    const {
      usuarioId, veiculoId,
      origemNome, destinoNome,
      origemLat, origemLng, destinoLat, destinoLng,
      origemEndereco, destinoEndereco,
      rotaCaminho, rotasAlternativas,
      polyline, distanciaKm, duracaoMin, dataHorario,
    } = dados;

    if (!usuarioId || !origemNome || !destinoNome) {
      throw new AppError('usuarioId, origemNome e destinoNome sao obrigatorios.', 400);
    }
    if (!distanciaKm || distanciaKm <= 0) {
      throw new AppError('Distancia invalida para a corrida.', 400);
    }
    if (duracaoMin != null && duracaoMin <= 0) {
      throw new AppError('Duracao invalida para a corrida.', 400);
    }

    let veiculo = null;
    if (veiculoId) {
      veiculo = await veiculosRepository.findById(veiculoId);
      if (!veiculo) throw new AppError('Veiculo ' + veiculoId + ' nao encontrado.', 404);
      if (veiculo.status !== 'DISPONIVEL') {
        throw new AppError('O veiculo nao esta disponivel para corridas.', 409);
      }
    } else {
      const todos = await veiculosRepository.findAll();
      const disponiveis = todos
        .filter((c) => c.status === 'DISPONIVEL')
        .sort((a, b) => (a.tarifaBase || 0) - (b.tarifaBase || 0));
      veiculo = disponiveis[0] || null;
    }

    const classeVeiculo = veiculo ? veiculo.classe : 'default';
    const valor = this.calcularValor({ distanciaKm, classe: classeVeiculo });

    const novaCorrida = await corridasRepository.create({
      usuarioId,
      veiculoId:          veiculo ? veiculo.id : null,
      origemNome,
      destinoNome,
      origemLat:          origemLat     || null,
      origemLng:          origemLng     || null,
      destinoLat:         destinoLat    || null,
      destinoLng:         destinoLng    || null,
      origemEndereco:     origemEndereco  || null,
      destinoEndereco:    destinoEndereco || null,
      rotaCaminho:        rotaCaminho   || [origemNome, destinoNome],
      rotasAlternativas:  rotasAlternativas || [],
      polyline:           polyline      || null,
      distanciaKm,
      duracaoMin:         duracaoMin    || null,
      valor,
      dataHorario:        dataHorario   || new Date().toISOString(),
      status:             'SOLICITADA',
    });

    if (veiculo) {
      await veiculosRepository.updateStatus(veiculo.id, 'EM_CORRIDA');
    }

    return novaCorrida;
  }

  async cancelar(id) {
    const corrida = await this.buscarPorId(id);

    if (corrida.status === 'CANCELADA') {
      throw new AppError('Esta corrida ja esta cancelada.', 409);
    }
    if (corrida.status === 'FINALIZADA') {
      throw new AppError('Nao e possivel cancelar uma corrida finalizada.', 409);
    }

    const corridaAtualizada = await corridasRepository.updateStatus(id, 'CANCELADA');

    if (corrida.veiculoId) {
      try {
        await veiculosRepository.updateStatus(corrida.veiculoId, 'DISPONIVEL');
      } catch (e) { /* veículo pode não existir — ok */ }
    }

    return corridaAtualizada;
  }

  async finalizar(id) {
    const corrida = await this.buscarPorId(id);

    if (corrida.status === 'FINALIZADA') {
      throw new AppError('Esta corrida ja esta finalizada.', 409);
    }
    if (corrida.status === 'CANCELADA') {
      throw new AppError('Nao e possivel finalizar uma corrida cancelada.', 409);
    }

    const corridaAtualizada = await corridasRepository.updateStatus(id, 'FINALIZADA');

    if (corrida.veiculoId) {
      try {
        await veiculosRepository.updateStatus(corrida.veiculoId, 'DISPONIVEL');
      } catch (e) { /* ok */ }
    }

    return corridaAtualizada;
  }
}

module.exports = new CorridasService();
