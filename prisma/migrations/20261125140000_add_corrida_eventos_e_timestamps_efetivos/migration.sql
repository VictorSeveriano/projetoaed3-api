-- Etapa 4: Timestamps efetivos (aceite e finalização) e tabela centralizada de eventos da linha do tempo (idempotente)
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "aceita_em" TIMESTAMPTZ(6);
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "finalizada_em" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "corrida_eventos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corrida_id" UUID NOT NULL,
  "tipo" VARCHAR(50) NOT NULL,
  "titulo" VARCHAR(160) NOT NULL,
  "descricao" TEXT NOT NULL,
  "autor_id" UUID,
  "autor_perfil" VARCHAR(20),
  "autor_nome" VARCHAR(150),
  "metadados" JSONB,
  "chave_idempotencia" VARCHAR(140),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corrida_eventos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_corrida_eventos_corrida" FOREIGN KEY ("corrida_id") REFERENCES "corridas"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_corrida_eventos_chave_idempotencia"
  ON "corrida_eventos" ("chave_idempotencia");

CREATE INDEX IF NOT EXISTS "idx_corrida_eventos_corrida_criado"
  ON "corrida_eventos" ("corrida_id", "criado_em" ASC);

CREATE INDEX IF NOT EXISTS "idx_corridas_cancelado_por"
  ON "corridas" ("cancelado_por");
