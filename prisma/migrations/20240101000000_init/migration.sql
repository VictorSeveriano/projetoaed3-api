-- CreateTable
CREATE TABLE "enderecos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "logradouro" VARCHAR(200),
    "numero" VARCHAR(20),
    "complemento" VARCHAR(150),
    "bairro" VARCHAR(120),
    "cidade" VARCHAR(120),
    "estado" VARCHAR(120),
    "uf" CHAR(2),
    "cep" VARCHAR(8),
    "pais" VARCHAR(80) DEFAULT 'Brasil',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enderecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(150) NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "celular" VARCHAR(11) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "usuario" VARCHAR(100) NOT NULL,
    "senha" TEXT NOT NULL,
    "perfil" VARCHAR(20) NOT NULL,
    "endereco_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motoristas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "cnh" VARCHAR(20) NOT NULL,
    "status_cadastro" VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    "status_presenca" VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motoristas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veiculos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "marca" VARCHAR(80) NOT NULL,
    "modelo" VARCHAR(100) NOT NULL,
    "ano" INTEGER NOT NULL,
    "placa" VARCHAR(10) NOT NULL,
    "cor" VARCHAR(50),
    "porte" VARCHAR(50) NOT NULL,
    "classe" VARCHAR(20) NOT NULL,
    "quilometragem" DECIMAL NOT NULL DEFAULT 0,
    "quantidade_passageiros" INTEGER NOT NULL DEFAULT 4,
    "possui_ar_condicionado" BOOLEAN NOT NULL DEFAULT false,
    "possui_extintor" BOOLEAN NOT NULL DEFAULT false,
    "possui_cinto_seguranca" BOOLEAN NOT NULL DEFAULT false,
    "documentacao_regularizada" BOOLEAN NOT NULL DEFAULT false,
    "status_aprovacao" VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    "status" VARCHAR(20) NOT NULL DEFAULT 'INDISPONIVEL',
    "tarifa_base" DECIMAL,
    "motorista_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "veiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corridas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "motorista_id" UUID,
    "veiculo_id" UUID,
    "origem_endereco_id" UUID NOT NULL,
    "destino_endereco_id" UUID NOT NULL,
    "origem_nome" VARCHAR(255) NOT NULL,
    "destino_nome" VARCHAR(255) NOT NULL,
    "origem_lat" DECIMAL,
    "origem_lng" DECIMAL,
    "destino_lat" DECIMAL,
    "destino_lng" DECIMAL,
    "rota_caminho" JSONB,
    "polyline" TEXT,
    "distancia_km" DECIMAL NOT NULL,
    "duracao_min" INTEGER,
    "valor" DECIMAL NOT NULL DEFAULT 0,
    "data_horario" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SOLICITADA',
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classe" VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
    "forma_pagamento" VARCHAR(50) NOT NULL DEFAULT 'DINHEIRO',

    CONSTRAINT "corridas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrida_rotas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "corrida_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "distancia_km" DECIMAL NOT NULL,
    "distancia_metros" INTEGER NOT NULL,
    "duracao_min" INTEGER,
    "duracao_segundos" INTEGER,
    "polyline" TEXT NOT NULL,
    "selecionada" BOOLEAN NOT NULL DEFAULT false,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corrida_rotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "destinatario_id" UUID NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "mensagem" TEXT NOT NULL,
    "referencia_id" UUID,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acao_motorista" VARCHAR(50),

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "version" VARCHAR(255) NOT NULL,
    "aplicada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateIndex
CREATE INDEX "idx_enderecos_cidade" ON "enderecos"("cidade");

-- CreateIndex
CREATE INDEX "idx_enderecos_cep" ON "enderecos"("cep");

-- CreateIndex
CREATE UNIQUE INDEX "uq_usuarios_cpf" ON "usuarios"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "uq_usuarios_email" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_usuarios_usuario" ON "usuarios"("usuario");

-- CreateIndex
CREATE INDEX "idx_usuarios_cpf" ON "usuarios"("cpf");

-- CreateIndex
CREATE INDEX "idx_usuarios_email" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "idx_usuarios_perfil" ON "usuarios"("perfil");

-- CreateIndex
CREATE INDEX "idx_usuarios_usuario" ON "usuarios"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "uq_motoristas_usuario_id" ON "motoristas"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_motoristas_cnh" ON "motoristas"("cnh");

-- CreateIndex
CREATE INDEX "idx_motoristas_status_cadastro" ON "motoristas"("status_cadastro");

-- CreateIndex
CREATE INDEX "idx_motoristas_status_presenca" ON "motoristas"("status_presenca");

-- CreateIndex
CREATE INDEX "idx_motoristas_usuario_id" ON "motoristas"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_veiculos_placa" ON "veiculos"("placa");

-- CreateIndex
CREATE INDEX "idx_veiculos_classe" ON "veiculos"("classe");

-- CreateIndex
CREATE INDEX "idx_veiculos_motorista_id" ON "veiculos"("motorista_id");

-- CreateIndex
CREATE INDEX "idx_veiculos_status" ON "veiculos"("status");

-- CreateIndex
CREATE INDEX "idx_veiculos_status_aprovacao" ON "veiculos"("status_aprovacao");

-- CreateIndex
CREATE INDEX "idx_corridas_data_horario" ON "corridas"("data_horario");

-- CreateIndex
CREATE INDEX "idx_corridas_motorista_id" ON "corridas"("motorista_id");

-- CreateIndex
CREATE INDEX "idx_corridas_status" ON "corridas"("status");

-- CreateIndex
CREATE INDEX "idx_corridas_usuario_id" ON "corridas"("usuario_id");

-- CreateIndex
CREATE INDEX "idx_corridas_veiculo_id" ON "corridas"("veiculo_id");

-- CreateIndex
CREATE INDEX "idx_corrida_rotas_corrida_id" ON "corrida_rotas"("corrida_id");

-- CreateIndex
CREATE INDEX "idx_corrida_rotas_selecionada" ON "corrida_rotas"("corrida_id", "selecionada");

-- CreateIndex
CREATE INDEX "idx_notificacoes_criada_em" ON "notificacoes"("criada_em" DESC);

-- CreateIndex
CREATE INDEX "idx_notificacoes_destinatario" ON "notificacoes"("destinatario_id");

-- CreateIndex
CREATE INDEX "idx_notificacoes_lida" ON "notificacoes"("destinatario_id", "lida");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_endereco_id_fkey" FOREIGN KEY ("endereco_id") REFERENCES "enderecos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motoristas" ADD CONSTRAINT "fk_motoristas_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veiculos" ADD CONSTRAINT "fk_veiculos_motorista" FOREIGN KEY ("motorista_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corridas" ADD CONSTRAINT "fk_corridas_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corridas" ADD CONSTRAINT "fk_corridas_motorista" FOREIGN KEY ("motorista_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corridas" ADD CONSTRAINT "fk_corridas_veiculo" FOREIGN KEY ("veiculo_id") REFERENCES "veiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corridas" ADD CONSTRAINT "fk_corridas_origem" FOREIGN KEY ("origem_endereco_id") REFERENCES "enderecos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corridas" ADD CONSTRAINT "fk_corridas_destino" FOREIGN KEY ("destino_endereco_id") REFERENCES "enderecos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrida_rotas" ADD CONSTRAINT "fk_corrida_rotas_corrida" FOREIGN KEY ("corrida_id") REFERENCES "corridas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "fk_notificacoes_destinatario" FOREIGN KEY ("destinatario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

