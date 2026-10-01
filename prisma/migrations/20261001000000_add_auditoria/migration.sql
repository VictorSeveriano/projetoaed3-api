-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID,
    "perfil" VARCHAR(20),
    "acao" VARCHAR(50) NOT NULL,
    "modulo" VARCHAR(50) NOT NULL,
    "entidade" VARCHAR(50),
    "entidade_id" UUID,
    "descricao" TEXT,
    "dados_anteriores" JSONB,
    "dados_novos" JSONB,
    "resultado" VARCHAR(20) NOT NULL,
    "status_http" INTEGER,
    "rota" VARCHAR(255),
    "metodo_http" VARCHAR(10),
    "ip" VARCHAR(45),
    "user_agent" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_auditoria_criado_em" ON "auditoria"("criado_em" DESC);

-- CreateIndex
CREATE INDEX "idx_auditoria_usuario_id" ON "auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "idx_auditoria_perfil" ON "auditoria"("perfil");

-- CreateIndex
CREATE INDEX "idx_auditoria_acao" ON "auditoria"("acao");

-- CreateIndex
CREATE INDEX "idx_auditoria_modulo" ON "auditoria"("modulo");

-- CreateIndex
CREATE INDEX "idx_auditoria_resultado" ON "auditoria"("resultado");

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "fk_auditoria_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
