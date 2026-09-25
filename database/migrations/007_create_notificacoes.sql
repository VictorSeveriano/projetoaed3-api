-- ============================================================
-- 007_create_notificacoes.sql
-- Notificações para usuários do sistema.
-- referencia_id é polimórfico (aponta para motoristas ou veículos
-- conforme o tipo) — integridade gerenciada pelo Service.
-- ============================================================

CREATE TABLE IF NOT EXISTS notificacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id  UUID NOT NULL,
  tipo             VARCHAR(40)  NOT NULL,
  titulo           VARCHAR(150) NOT NULL,
  mensagem         TEXT         NOT NULL,
  referencia_id    UUID,         -- polimórfico: motoristaId ou veiculoId conforme tipo
  lida             BOOLEAN      NOT NULL DEFAULT FALSE,
  criada_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- FK destinatário
  CONSTRAINT fk_notificacoes_destinatario FOREIGN KEY (destinatario_id)
    REFERENCES usuarios(id) ON DELETE RESTRICT,

  -- Tipos válidos
  CONSTRAINT ck_notificacoes_tipo CHECK (
    tipo IN ('SOLICITACAO_MOTORISTA', 'SOLICITACAO_VEICULO')
  )
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_notificacoes_destinatario ON notificacoes(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida         ON notificacoes(destinatario_id, lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_criada_em    ON notificacoes(criada_em DESC);
