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
  {
    id: '2',
    nome: 'Ana Souza',
    usuario: 'ana',
    senha: 'ana123',
    perfil: 'USUARIO',
    criadoEm: '2026-01-15T10:00:00Z',
  },
  {
    id: '3',
    nome: 'Carlos Mendes',
    usuario: 'carlos',
    senha: 'carlos123',
    perfil: 'USUARIO',
    criadoEm: '2026-02-01T09:00:00Z',
  },
  {
    id: '4',
    nome: 'João Silva',
    usuario: 'joao',
    senha: 'joao123',
    perfil: 'MOTORISTA',
    criadoEm: '2026-01-05T10:00:00Z',
  },
  {
    id: '5',
    nome: 'Maria Ferreira',
    usuario: 'maria',
    senha: 'maria123',
    perfil: 'MOTORISTA',
    criadoEm: '2026-01-10T09:00:00Z',
  },
  {
    id: '6',
    nome: 'Pedro Costa',
    usuario: 'pedro',
    senha: 'pedro123',
    perfil: 'MOTORISTA',
    criadoEm: '2026-09-20T14:00:00Z',
  },
  {
    id: '7',
    nome: 'Lucia Alves',
    usuario: 'lucia',
    senha: 'lucia123',
    perfil: 'MOTORISTA',
    criadoEm: '2026-08-15T11:00:00Z',
  },
];

module.exports = usuarios;
