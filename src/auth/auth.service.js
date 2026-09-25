const authRepository = require('./auth.repository');
const motoristasService = require('../motoristas/motoristas.service');
const AppError = require('../utils/AppError');
const { validarCPF, validarEmail, validarCelular, validarCEP, normalizarCPF, normalizarEmail, normalizarCelular } = require('../utils/validators');

/**
 * AuthService — Regras de negócio relacionadas à autenticação.
 *
 * NOTA: Login simulado sem JWT por enquanto.
 * Estrutura preparada para adicionar JWT e bcrypt futuramente.
 */
class AuthService {
  login(usuario, senha) {
    if (!usuario || !senha) {
      throw new AppError('Usuario e senha sao obrigatorios.', 400);
    }
    const user = authRepository.encontrarPorUsuario(usuario);
    if (!user || user.senha !== senha) {
      throw new AppError('Credenciais invalidas.', 401);
    }
    const token = `session-token-${user.id}`;
    return {
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        usuario: user.usuario,
        perfil: user.perfil,
      },
    };
  }

  /**
   * Gera um login determinístico único baseado no nome.
   * @param {string} nome
   * @returns {string}
   */
  _gerarLogin(nome) {
    if (!nome) return '';
    const partes = nome
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '') // Mantém apenas letras, números e espaços
      .trim()
      .split(' ')
      .filter((p) => p.length > 0);

    if (partes.length === 0) return 'usuario';

    const pNome = partes[0];
    const uNome = partes.length > 1 ? partes[partes.length - 1] : '';
    
    // Tentativas de combinação
    const tentativas = [
      () => pNome + uNome, // pNome + uNome
      () => pNome + (partes.length > 2 ? partes[1] : '') + uNome, // pNome + segundoNome + uNome
      () => pNome + partes.slice(1).join(''), // pNome + todos os outros nomes
      () => pNome + (uNome ? uNome[0] : ''), // pNome + inicial do ultimo nome
      () => pNome + (partes.length > 2 ? partes[1][0] : '') + (uNome ? uNome[0] : ''),
    ];

    let baseLogin = pNome;
    for (let t of tentativas) {
      const tentativaLogin = t();
      if (!authRepository.encontrarPorUsuario(tentativaLogin)) {
        return tentativaLogin;
      }
    }

    // Se todas as combinações falharem, adiciona índice sequencial para garantir unicidade (fallback determinístico sem random)
    let idx = 1;
    while (true) {
      const tentativa = baseLogin + uNome + idx;
      if (!authRepository.encontrarPorUsuario(tentativa)) {
        return tentativa;
      }
      idx++;
    }
  }

  /**
   * Cria nova conta pública (USUARIO ou MOTORISTA).
   * Nunca cria ADMINISTRADOR pelo fluxo público.
   * @param {object} dados - { nome, cpf, celular, email, senha, perfil, endereco, cnh }
   * @returns {{ token, usuario }}
   */
  cadastrar(dados) {
    const { nome, cpf, celular, email, senha, perfil, endereco, cnh } = dados;

    const perfilValidos = ['USUARIO', 'MOTORISTA'];
    if (!perfilValidos.includes(perfil)) {
      throw new AppError('perfil deve ser USUARIO ou MOTORISTA.', 400);
    }

    if (!nome || !cpf || !celular || !email || !senha) {
      throw new AppError('Nome, CPF, celular, e-mail e senha são obrigatórios.', 400);
    }
    if (!endereco || !endereco.rua || !endereco.bairro || !endereco.cidade || !endereco.estado || !endereco.numero || !endereco.cep) {
      throw new AppError('Endereço completo é obrigatório (rua, bairro, cidade, estado, número, cep).', 400);
    }
    if (perfil === 'MOTORISTA' && !cnh) {
      throw new AppError('CNH é obrigatória para motoristas.', 400);
    }

    // Normalizações
    const cpfNorm = normalizarCPF(cpf);
    const celularNorm = normalizarCelular(celular);
    const emailNorm = normalizarEmail(email);

    // Validações
    if (!validarCPF(cpfNorm)) throw new AppError('CPF inválido.', 400);
    if (!validarCelular(celularNorm)) throw new AppError('Celular inválido.', 400);
    if (!validarEmail(emailNorm)) throw new AppError('E-mail inválido.', 400);
    if (!validarCEP(endereco.cep)) throw new AppError('CEP inválido.', 400);

    // Unicidade
    if (authRepository.existsByCpf(cpfNorm)) throw new AppError('CPF já cadastrado no sistema.', 409);
    if (authRepository.existsByEmail(emailNorm)) throw new AppError('E-mail já cadastrado no sistema.', 409);

    // Gerar Login automático
    const usuario = this._gerarLogin(nome);

    const novoUsuario = authRepository.create({ 
      nome, 
      cpf: cpfNorm, 
      celular: celularNorm, 
      email: emailNorm, 
      usuario, 
      senha, 
      perfil, 
      endereco
    });
    
    // Se for motorista, cria a solicitação pendente no domínio correto (Motoristas)
    if (perfil === 'MOTORISTA') {
      motoristasService.solicitar(novoUsuario.id, cnh);
    }
    
    const token = `session-token-${novoUsuario.id}`;
    return {
      token,
      usuario: {
        id: novoUsuario.id,
        nome: novoUsuario.nome,
        usuario: novoUsuario.usuario,
        perfil: novoUsuario.perfil,
        email: novoUsuario.email,
        celular: novoUsuario.celular,
      },
    };
  }
}

module.exports = new AuthService();
