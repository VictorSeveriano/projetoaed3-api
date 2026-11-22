-- Índices compostos aditivos para listagens ordenadas e varredura de expiração (idempotentes)
CREATE INDEX IF NOT EXISTS "idx_corridas_status_data_horario"
  ON "corridas" ("status", "data_horario");

CREATE INDEX IF NOT EXISTS "idx_corridas_usuario_criada_em"
  ON "corridas" ("usuario_id", "criada_em" DESC);

CREATE INDEX IF NOT EXISTS "idx_corridas_motorista_criada_em"
  ON "corridas" ("motorista_id", "criada_em" DESC);

CREATE INDEX IF NOT EXISTS "idx_notificacoes_destinatario_criada_em"
  ON "notificacoes" ("destinatario_id", "criada_em" DESC);
