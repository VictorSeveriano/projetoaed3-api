/**
 * Dados dos usuários do sistema.
 *
 * Campo perfil: ADMINISTRADOR | USUARIO | MOTORISTA
 * Toda checagem de perfil usa usuario.perfil — nunca nome, id ou outro campo incidental.
 *
 * NOTA: Senhas em texto plano apenas para demonstração acadêmica.
 * Em produção, utilizar bcrypt para hash de senhas.
 *
 * Usuários com perfil MOTORISTA têm um registro correspondente em motoristas.data.js
 * referenciado por usuarioId. Não duplicar dados de motorista aqui.
 */
const usuarios = [
  {
    id: '1',
    nome: 'Administrador',
    usuario: 'admin',
    senha: 'admin123',
    perfil: 'ADMINISTRADOR',
    criadoEm: '2025-01-01T00:00:00Z',
  },
];

module.exports = usuarios;
