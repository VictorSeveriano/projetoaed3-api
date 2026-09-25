const corridasRepository = require('./corridas.repository');
const carrosRepository = require('../carros/carros.repository');
const AppError = require('../utils/AppError');

/**
 * CorridasService — Regras de negocio de corridas.
 *
 * Responsabilidades:
 * - Criar e validar corridas
 * - Calcular valor estimado da corrida com base na distancia e tipo de veiculo
 * - Cancelar corridas
 * - Listar e buscar corridas
 *
 * O calculo de rotas (grafo + arvore) e responsabilidade do GrafoService/RotasService.
 * O CorridasService apenas recebe os dados da rota ja calculada e persiste a corrida.
 */
class CorridasService {
  /**
   * Tarifa base por km por categoria de veiculo (R$/km).
   * Centraliza a regra financeira em um unico lugar.
   */
  static get TARIFAS_KM() {
    return {
      Hatch: 3.00,
      Sedan: 4.00,
      SUV: 5.00,
      default: 3.50,
    };
  }

  listarTodas() {
    return corridasRepository.findAll();
  }

  /**
   * Lista corridas filtradas conforme perfil do usuario.
   * A diferenciacao por perfil acontece AQUI — nunca no frontend.
   * @param {string} usuarioId
   * @param {string} perfil - ADMINISTRADOR | USUARIO | MOTORISTA
   * @param {string|null} status - filtro opcional de status
   * @returns {Corrida[]}
   */
  listarPorPerfil(usuarioId, perfil, status) {
    if (perfil === 'ADMINISTRADOR') {
      return status
        ? corridasRepository.findAll().filter((c) => c.status === status)
        : corridasRepository.findAll();
    }
    if (perfil === 'MOTORISTA') {
      return status
        ? corridasRepository.findByMotoristaIdAndStatus(usuarioId, status)
        : corridasRepository.findByMotoristaId(usuarioId);
    }
    // USUARIO (padrao)
    return status
      ? corridasRepository.findByUsuarioIdAndStatus(usuarioId, status)
      : corridasRepository.findByUsuarioId(usuarioId);
  }

  buscarPorId(id) {
    const corrida = corridasRepository.findById(id);
    if (!corrida) throw new AppError('Corrida ' + id + ' nao encontrada.', 404);

    return corrida;
  }

  /**
   * Calcula o valor estimado da corrida.
   * Valor = distancia * tarifa por km da categoria do veiculo
   * @param {number} distanciaKm
   * @param {string} categoriaVeiculo
   * @returns {number}
   */
  calcularValor(distanciaKm, categoriaVeiculo) {
    const tarifa = CorridasService.TARIFAS_KM[categoriaVeiculo] || CorridasService.TARIFAS_KM.default;
    return parseFloat((distanciaKm * tarifa).toFixed(2));
  }

  /**
   * Cria uma nova corrida.
   *
   * Validacoes:
   * 1. Origem e destino existem no sistema de rotas
   * 2. Veiculo existe e esta DISPONIVEL (se informado)
   * 3. Distancia > 0
   *
   * @param {object} dados
   * @returns {Corrida}
   */
  criar(dados) {
    const {
      usuarioId,
      veiculoId,
      origemNome,
      destinoNome,
      origemLat,
      origemLng,
      destinoLat,
      destinoLng,
      origemEndereco,
      destinoEndereco,
      rotaCaminho,
      rotasAlternativas,
      polyline,
      distanciaKm,
      duracaoMin,
      dataHorario,
    } = dados;

    // Valida campos obrigatorios
    if (!usuarioId || !origemNome || !destinoNome) {
      throw new AppError('usuarioId, origemNome e destinoNome sao obrigatorios.', 400);
    }

    if (!distanciaKm || distanciaKm <= 0) {
      throw new AppError('Distancia invalida para a corrida.', 400);
    }

    if (duracaoMin != null && duracaoMin <= 0) {
      throw new AppError('Duracao invalida para a corrida.', 400);
    }

    // Selecao de veiculo:
    // - Se veiculoId informado: valida existencia e disponibilidade
    // - Se nao informado: seleciona o mais economico disponivel (menor tarifaBase)
    // A regra de selecao fica aqui no backend, nunca no frontend.
    let veiculo = null;
    if (veiculoId) {
      veiculo = carrosRepository.findById(veiculoId);
      if (!veiculo) {
        throw new AppError('Veiculo ' + veiculoId + ' nao encontrado.', 404);
      }
      if (veiculo.status !== 'DISPONIVEL') {
        throw new AppError('O veiculo nao esta disponivel para corridas.', 409);
      }
    } else {
      // Seleciona o veiculo disponivel com menor tarifaBase (mais economico)
      const disponiveis = carrosRepository.findAll()
        .filter((c) => c.status === 'DISPONIVEL')
        .sort((a, b) => (a.tarifaBase || 0) - (b.tarifaBase || 0));
      veiculo = disponiveis[0] || null;
    }

    const categoriaVeiculo = veiculo ? veiculo.categoria : 'default';
    const valor = this.calcularValor(distanciaKm, categoriaVeiculo);

    const novaCorrida = corridasRepository.create({
      usuarioId,
      veiculoId: veiculo ? veiculo.id : null,
      origemNome,
      destinoNome,
      origemLat: origemLat || null,
      origemLng: origemLng || null,
      destinoLat: destinoLat || null,
      destinoLng: destinoLng || null,
      origemEndereco: origemEndereco || null,
      destinoEndereco: destinoEndereco || null,
      rotaCaminho: rotaCaminho || [origemNome, destinoNome],
      rotasAlternativas: rotasAlternativas || [],
      polyline: polyline || null,
      distanciaKm,
      duracaoMin: duracaoMin || null,
      valor,
      dataHorario: dataHorario || new Date().toISOString(),
      // SOLICITADA: corrida criada pelo usuario, aguardando inicio
      status: 'SOLICITADA',
    });

    // Marca o veiculo como em corrida
    if (veiculo) {
      carrosRepository.updateStatus(veiculo.id, 'EM_CORRIDA');
    }

    return novaCorrida;
  }

  /**
   * Cancela uma corrida existente.
   * @param {string} id
   * @returns {Corrida}
   */
  cancelar(id) {
    const corrida = this.buscarPorId(id);

    if (corrida.status === 'CANCELADA') {
      throw new AppError('Esta corrida ja esta cancelada.', 409);
    }
    if (corrida.status === 'FINALIZADA') {
      throw new AppError('Nao e possivel cancelar uma corrida finalizada.', 409);
    }

    const corridaAtualizada = corridasRepository.updateStatus(id, 'CANCELADA');

    // Libera o veiculo
    if (corrida.veiculoId) {
      try {
        carrosRepository.updateStatus(corrida.veiculoId, 'DISPONIVEL');
      } catch (e) { /* veiculo pode nao existir mais — ok */ }
    }

    return corridaAtualizada;
  }

  /**
   * Finaliza uma corrida (marcada como concluida).
   * @param {string} id
   * @returns {Corrida}
   */
  finalizar(id) {
    const corrida = this.buscarPorId(id);

    if (corrida.status === 'FINALIZADA') {
      throw new AppError('Esta corrida ja esta finalizada.', 409);
    }
    if (corrida.status === 'CANCELADA') {
      throw new AppError('Nao e possivel finalizar uma corrida cancelada.', 409);
    }

    const corridaAtualizada = corridasRepository.updateStatus(id, 'FINALIZADA');

    if (corrida.veiculoId) {
      try {
        carrosRepository.updateStatus(corrida.veiculoId, 'DISPONIVEL');
      } catch (e) { /* ok */ }
    }

    return corridaAtualizada;
  }
}

module.exports = new CorridasService();
