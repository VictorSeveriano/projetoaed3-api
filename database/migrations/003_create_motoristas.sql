-- ============================================================
-- 003_create_motoristas.sql
-- Motorista é uma extensão do usuário.
-- Não duplica nome, cpf, email, endereço — tudo fica em usuarios.
-- ============================================================

CREATE TABLE IF NOT EXISTS motoristas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       UUID NOT NULL,
  cnh              VARCHAR(20) NOT NULL,
  status_cadastro  VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  status_presenca  VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Um usuário só pode ter um registro de motorista
  CONSTRAINT uq_motoristas_usuario_id UNIQUE (usuario_id),
  -- CNH única no sistema
  CONSTRAINT uq_motoristas_cnh UNIQUE (cnh),

  -- Relação com usuários (RESTRICT: não apagar usuário com motorista)
  CONSTRAINT fk_motoristas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE RESTRICT,

  -- Status válidos
  CONSTRAINT ck_motoristas_status_cadastro CHECK (
    status_cadastro IN ('PENDENTE', 'APROVADO', 'REJEITADO')
  ),
  CONSTRAINT ck_motoristas_status_presenca CHECK (
    status_presenca IN ('ONLINE', 'OFFLINE')
  )
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_motoristas_usuario_id      ON motoristas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_motoristas_status_cadastro ON motoristas(status_cadastro);
CREATE INDEX IF NOT EXISTS idx_motoristas_status_presenca ON motoristas(status_presenca);
