-- ============================================================
-- 002_create_usuarios.sql
-- Tabela de usuários — todos os perfis: ADMINISTRADOR, USUARIO, MOTORISTA.
-- Login é gerado automaticamente pelo backend (_gerarLogin).
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(150) NOT NULL,
  cpf             VARCHAR(11)  NOT NULL,
  celular         VARCHAR(11)  NOT NULL,
  email           VARCHAR(255) NOT NULL,
  usuario         VARCHAR(100) NOT NULL,
  senha           TEXT         NOT NULL,
  perfil          VARCHAR(20)  NOT NULL,
  endereco_id     UUID         REFERENCES enderecos(id) ON DELETE RESTRICT,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Unicidade — regras de negócio garantidas no banco
  CONSTRAINT uq_usuarios_cpf     UNIQUE (cpf),
  CONSTRAINT uq_usuarios_email   UNIQUE (email),
  CONSTRAINT uq_usuarios_usuario UNIQUE (usuario),

  -- Apenas perfis válidos
  CONSTRAINT ck_usuarios_perfil CHECK (perfil IN ('ADMINISTRADOR', 'USUARIO', 'MOTORISTA'))
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil  ON usuarios(perfil);
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);
CREATE INDEX IF NOT EXISTS idx_usuarios_cpf     ON usuarios(cpf);
CREATE INDEX IF NOT EXISTS idx_usuarios_email   ON usuarios(email);

-- ============================================================
-- Usuário administrador inicial.
-- Necessário para o funcionamento do sistema (recebe notificações,
-- aprova motoristas e veículos).
-- ATENÇÃO: altere a senha em ambiente de produção real.
-- O id fixo '00000000-0000-0000-0000-000000000001' permite que o
-- ADMIN_ID seja previsível sem depender de sequência automática.
-- ============================================================
INSERT INTO usuarios (id, nome, cpf, celular, email, usuario, senha, perfil)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Administrador',
  '00000000000',
  '00000000000',
  'admin@reservacar.local',
  'admin',
  'admin123',
  'ADMINISTRADOR'
)
ON CONFLICT (usuario) DO NOTHING;
