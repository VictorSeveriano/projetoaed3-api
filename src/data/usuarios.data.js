/**
 * Dados dos usuarios do sistema.
 * NOTA: Senhas em texto plano apenas para demonstracao academica.
 * Em producao, utilizar bcrypt para hash de senhas.
 */
const usuarios = [
  {
    id: '1',
    nome: 'Administrador',
    usuario: 'admin',
    senha: 'admin123',
  },
];

module.exports = usuarios;
