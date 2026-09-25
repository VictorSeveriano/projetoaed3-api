/**
 * Dados dos usuários do sistema.
 *
 * Campo perfil: ADMINISTRADOR | USUARIO | MOTORISTA
 * Toda checagem de perfil usa usuario.perfil — nunca nome, id ou outro campo incidental.
 *
 * NOTA: Senhas em texto plano apenas para demonstração acadêmica.
 * Em produção, utilizar bcrypt para hash de senhas.
 */
const usuarios = [
  {
    id: '1',
    nome: 'Administrador',
    usuario: 'admin',
    senha: 'admin123',
    perfil: 'ADMINISTRADOR',
  },
  {
    id: '2',
    nome: 'Ana Souza',
    usuario: 'ana',
    senha: 'ana123',
    perfil: 'USUARIO',
  },
  {
    id: '3',
    nome: 'Carlos Mendes',
    usuario: 'carlos',
    senha: 'carlos123',
    perfil: 'USUARIO',
  },
  {
    id: '4',
    nome: 'João Silva',
    usuario: 'joao',
    senha: 'joao123',
    perfil: 'MOTORISTA',
  },
  {
    id: '5',
    nome: 'Maria Ferreira',
    usuario: 'maria',
    senha: 'maria123',
    perfil: 'MOTORISTA',
  },
];

module.exports = usuarios;
