-- Confirmação de embarque, acompanhamento do motorista e metadados de cancelamento.
-- Idempotente e aditiva: não altera dados nem constraints existentes.
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "embarque_motorista_confirmado" BOOLEAN;
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "embarque_motorista_em" TIMESTAMPTZ(6);
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "embarque_passageiro_confirmado" BOOLEAN;
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "embarque_passageiro_em" TIMESTAMPTZ(6);
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "situacao_motorista" VARCHAR(30);
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "motorista_a_caminho_em" TIMESTAMPTZ(6);
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "prazo_confirmacao_em" TIMESTAMPTZ(6);
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "motivo_cancelamento" VARCHAR(500);
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "cancelado_por" VARCHAR(20);
ALTER TABLE "corridas" ADD COLUMN IF NOT EXISTS "cancelada_em" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "idx_corridas_status_prazo_confirmacao"
  ON "corridas"("status", "prazo_confirmacao_em");

